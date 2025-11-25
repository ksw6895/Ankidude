from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_settings_dep, get_storage_dep
from app.core.config import Settings
from app.models import Lecture, LectureStatus
from app.schemas.lecture import LectureStatusResponse
from app.storage.manager import StorageManager
from app.worker.tasks import process_lecture_task

router = APIRouter()


@router.post("/lectures", response_model=LectureStatusResponse)
async def create_lecture(
    slides_pdf: UploadFile = File(...),
    audio_file: UploadFile = File(...),
    title: str | None = Form(None),
    subject: str | None = Form(None),
    professor: str | None = Form(None),
    db: Session = Depends(get_db),
    storage: StorageManager = Depends(get_storage_dep),
    settings: Settings = Depends(get_settings_dep),
):
    if not slides_pdf.filename or not audio_file.filename:
        raise HTTPException(status_code=400, detail="slides_pdf and audio_file are required")

    slides_url = storage.save_fileobj(slides_pdf.file, slides_pdf.filename, prefix="slides")
    audio_url = storage.save_fileobj(audio_file.file, audio_file.filename, prefix="audio")

    lecture = Lecture(
        title=title,
        subject=subject,
        professor=professor,
        slides_url=slides_url,
        audio_url=audio_url,
        status=LectureStatus.PENDING,
    )
    db.add(lecture)
    db.commit()
    db.refresh(lecture)

    process_lecture_task.delay(lecture.id, language_code="ko")

    download_url = None
    if lecture.status == LectureStatus.DONE:
        if lecture.csv_url and lecture.csv_url.startswith("http"):
            download_url = lecture.csv_url
        else:
            download_url = f"{settings.api_prefix}/lectures/{lecture.id}/csv"

    return LectureStatusResponse(
        job_id=lecture.id,
        status=lecture.status,
        created_at=lecture.created_at,
        updated_at=lecture.updated_at,
        card_count=lecture.card_count,
        download_url=download_url,
        error_message=lecture.error_message,
    )


@router.get("/lectures/{job_id}", response_model=LectureStatusResponse)
async def get_lecture(
    job_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    lecture = db.get(Lecture, job_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Job not found")

    download_url = None
    if lecture.status == LectureStatus.DONE:
        if lecture.csv_url and lecture.csv_url.startswith("http"):
            download_url = lecture.csv_url
        else:
            download_url = f"{settings.api_prefix}/lectures/{lecture.id}/csv"

    return LectureStatusResponse(
        job_id=lecture.id,
        status=lecture.status,
        created_at=lecture.created_at,
        updated_at=lecture.updated_at,
        card_count=lecture.card_count,
        download_url=download_url,
        error_message=lecture.error_message,
    )


@router.get("/lectures/{job_id}/csv")
async def download_csv(
    job_id: str,
    db: Session = Depends(get_db),
    storage: StorageManager = Depends(get_storage_dep),
):
    lecture = db.get(Lecture, job_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Job not found")
    if lecture.status != LectureStatus.DONE or not lecture.csv_url:
        raise HTTPException(status_code=400, detail="CSV not ready")

    local_path = storage.resolve_local_path(lecture.csv_url)
    filename = f"lecture-{job_id}.csv"
    if local_path and local_path.exists():
        return FileResponse(
            str(local_path),
            media_type="text/csv; charset=utf-8",
            filename=filename,
        )

    if lecture.csv_url.startswith("http"):
        return RedirectResponse(url=lecture.csv_url, status_code=302)

    raise HTTPException(status_code=404, detail="CSV file not found")
