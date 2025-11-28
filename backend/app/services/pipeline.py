import json
import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

import fitz
from sqlalchemy.orm import Session

from app.clients.elevenlabs import ElevenLabsClient
from app.clients.gemini import GeminiClient
from app.models import Lecture, LectureStatus, Transcript
from app.services.csv_generator import render_csv
from app.services.pdf_note_service import PdfNoteService
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
        lecture.current_step = "START"
        lecture.error_message = None
        db.commit()

        gemini_client = GeminiClient()
        slides_path = ensure_local_file(lecture.slides_url)
        if slides_path.parent.name.startswith("ankidude_"):
            temp_paths.append(slides_path)
        pdf_file = gemini_client.upload_pdf(slides_path)
        try:
            with fitz.open(slides_path) as doc:
                page_count = len(doc)
        except Exception:
            page_count = None
            logger.warning("Job %s: failed to detect PDF page count", lecture_id, exc_info=True)

        transcript = db.query(Transcript).filter_by(lecture_id=lecture.id).first()
        if not transcript:
            transcript = Transcript(
                lecture_id=lecture.id,
                raw_text="",
                words_json=json.dumps([]),
            )
            db.add(transcript)
            db.commit()

        # 공통 STT 단계 (선택)
        if lecture.audio_url:
            lecture.status = LectureStatus.RUNNING_STT
            lecture.current_step = "STT"
            db.commit()
            logger.info("Job %s: STT 단계 시작 (audio=%s)", lecture_id, lecture.audio_url)

            audio_path = ensure_local_file(lecture.audio_url)
            if audio_path.parent.name.startswith("ankidude_"):
                temp_paths.append(audio_path)
            stt_client = ElevenLabsClient()
            stt_result = stt_client.transcribe_file(str(audio_path), language_code=language_code)
            transcript.raw_text = stt_result.get("text", "") or ""
            transcript.words_json = json.dumps(stt_result.get("words", []))
            db.add(transcript)
            db.commit()
        elif not transcript.raw_text:
            transcript.raw_text = ""
            transcript.words_json = json.dumps([])
            db.add(transcript)
            db.commit()

        meta = {
            "title": lecture.title,
            "subject": lecture.subject,
            "professor": lecture.professor,
        }
        if page_count:
            meta["page_count"] = page_count

        # 1) Transcript 정제
        lecture.status = (
            LectureStatus.RUNNING_ANKI
            if getattr(lecture, "generate_cards", True)
            else LectureStatus.RUNNING_NOTES
            if getattr(lecture, "generate_notes", False)
            else LectureStatus.RUNNING_LLM
        )
        lecture.current_step = "CLEAN_TRANSCRIPT"
        db.commit()
        logger.info("Job %s: Gemini 정제 단계 시작", lecture_id)

        cleaned_text = gemini_client.clean_transcript(pdf_file, transcript.raw_text or "", meta=meta)
        if cleaned_text:
            preview = cleaned_text[:500]
            suffix = "..." if len(cleaned_text) > 500 else ""
            logger.info("======== [Cleaned Transcript Preview] Job %s ========", lecture_id)
            logger.info("%s%s", preview, suffix)
            logger.info("==============================================================")
        else:
            logger.warning("Job %s: Cleaned transcript is empty.", lecture_id)
        transcript.cleaned_text = cleaned_text or transcript.raw_text or ""
        db.add(transcript)
        db.commit()

        cleaned_for_use = transcript.cleaned_text or transcript.raw_text or ""

        # 2) 카드/노트 병렬 LLM 호출
        futures = {}
        results = {}

        with ThreadPoolExecutor(max_workers=2) as executor:
            if getattr(lecture, "generate_cards", True):
                lecture.status = LectureStatus.RUNNING_ANKI
                lecture.current_step = "ANKI_GEN"
                db.commit()
                logger.info("Job %s: Anki 카드 Gemini 호출 시작", lecture_id)

                futures["cards"] = executor.submit(
                    GeminiClient().generate_cards,
                    pdf_file,
                    cleaned_for_use,
                    meta,
                )

            if getattr(lecture, "generate_notes", False):
                if not getattr(lecture, "generate_cards", True):
                    lecture.status = LectureStatus.RUNNING_NOTES
                    lecture.current_step = "NOTE_GEN"
                    db.commit()
                logger.info("Job %s: 노트 Gemini 호출 시작", lecture_id)
                futures["notes"] = executor.submit(
                    GeminiClient().generate_lecture_notes,
                    pdf_file,
                    cleaned_for_use,
                    meta,
                )

            for key, future in futures.items():
                results[key] = future.result()

        # 3) 카드 후처리
        if "cards" in results:
            cards_result = results["cards"]
            if cards_result.cleaned_transcript:
                transcript.cleaned_text = cards_result.cleaned_transcript
                db.add(transcript)
                db.commit()

            lecture.status = LectureStatus.GENERATING_CSV
            lecture.current_step = "GENERATING_CSV"
            db.commit()
            csv_text = render_csv(cards_result.cards)
            csv_filename = f"{lecture.id}.csv"
            csv_url = storage.save_bytes(
                csv_text.encode("utf-8"),
                filename=csv_filename,
                prefix="exports",
                content_type="text/csv; charset=utf-8",
                content_disposition=f'attachment; filename="{csv_filename}"',
            )
            lecture.csv_url = csv_url
            lecture.card_count = len(cards_result.cards)
            logger.info("Job %s: CSV 생성 완료 (cards=%s, csv=%s)", lecture_id, lecture.card_count, csv_url)
        else:
            lecture.card_count = 0
            lecture.csv_url = None

        # 4) 노트 후처리
        if "notes" in results:
            # 노트 생성 시작 상태 업데이트
            lecture.status = LectureStatus.RUNNING_NOTES
            lecture.current_step = "NOTE_GEN"
            db.commit()

            notes = results["notes"]
            pdf_service = PdfNoteService(storage)
            pdf_url, rendered_pages = pdf_service.render_notes_pdf(
                lecture.slides_url,
                notes,
                filename=f"{lecture.id}-notes.pdf",
            )
            lecture.note_pdf_url = pdf_url
            lecture.note_page_count = rendered_pages
            logger.info("Job %s: PDF 노트 생성 완료 (pages=%s, url=%s)", lecture_id, rendered_pages, pdf_url)
        else:
            lecture.note_pdf_url = None
            lecture.note_page_count = None

        lecture.status = LectureStatus.DONE
        lecture.current_step = "FINISHED"
        lecture.error_message = None
        db.commit()
        logger.info(
            "Job %s: 완료 (cards=%s, notes=%s)",
            lecture_id,
            lecture.card_count,
            lecture.note_pdf_url,
        )
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
