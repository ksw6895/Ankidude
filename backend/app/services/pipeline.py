import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.clients.elevenlabs import ElevenLabsClient
from app.clients.gemini import GeminiClient
from app.models import Lecture, LectureStatus, Transcript
from app.services.csv_generator import render_csv
from app.services.pdf_parser import parse_pdf_to_slides
from app.storage.manager import StorageManager
from app.utils.file_utils import ensure_local_file

logger = logging.getLogger(__name__)


def process_lecture_job(
    lecture_id: str,
    db: Session,
    storage: StorageManager,
    *,
    language_code: Optional[str] = None,
) -> None:
    temp_paths: list[Path] = []
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise ValueError(f"Lecture {lecture_id} not found")

    try:
        logger.info("Job %s: 시작", lecture_id)
        lecture.status = LectureStatus.RUNNING_STT
        db.commit()
        logger.info("Job %s: STT 단계 시작 (audio=%s)", lecture_id, lecture.audio_url)

        audio_path = ensure_local_file(lecture.audio_url)
        if audio_path.parent.name.startswith("ankidude_"):
            temp_paths.append(audio_path)
        stt_client = ElevenLabsClient()
        stt_result = stt_client.transcribe_file(str(audio_path), language_code=language_code)
        transcript = Transcript(
            lecture_id=lecture.id,
            raw_text=stt_result.get("text", ""),
            words_json=json.dumps(stt_result.get("words", [])),
        )
        db.add(transcript)
        db.commit()

        lecture.status = LectureStatus.RUNNING_LLM
        db.commit()
        logger.info("Job %s: LLM 단계 시작 (slides=%s)", lecture_id, lecture.slides_url)

        slides_path = ensure_local_file(lecture.slides_url)
        if slides_path.parent.name.startswith("ankidude_"):
            temp_paths.append(slides_path)
        slides = parse_pdf_to_slides(slides_path)
        gemini_client = GeminiClient()
        llm_result = gemini_client.generate_cards(
            slides,
            transcript.raw_text or "",
            meta={
                "title": lecture.title,
                "subject": lecture.subject,
                "professor": lecture.professor,
            },
        )
        transcript.cleaned_text = llm_result.cleaned_transcript
        db.add(transcript)
        db.commit()

        lecture.status = LectureStatus.GENERATING_CSV
        db.commit()
        logger.info("Job %s: CSV 생성 단계", lecture_id)

        csv_text = render_csv(llm_result.cards)
        csv_filename = f"{lecture.id}.csv"
        csv_url = storage.save_bytes(
            csv_text.encode("utf-8"),
            filename=csv_filename,
            prefix="exports",
            content_type="text/csv; charset=utf-8",
            content_disposition=f'attachment; filename="{csv_filename}"',
        )
        lecture.csv_url = csv_url
        lecture.card_count = len(llm_result.cards)
        lecture.status = LectureStatus.DONE
        lecture.error_message = None
        db.commit()
        logger.info("Job %s: 완료 (cards=%s, csv=%s)", lecture_id, lecture.card_count, csv_url)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to process lecture %s", lecture_id)
        db.rollback()
        lecture = db.get(Lecture, lecture_id)
        if lecture:
            lecture.status = LectureStatus.FAILED
            lecture.error_message = str(exc)
            db.commit()
        raise
    finally:
        for path in temp_paths:
            try:
                path.unlink(missing_ok=True)
                if path.parent.name.startswith("ankidude_") and not any(path.parent.iterdir()):
                    path.parent.rmdir()
            except Exception:  # best-effort cleanup
                logger.debug("Failed to clean temp file %s", path, exc_info=True)
