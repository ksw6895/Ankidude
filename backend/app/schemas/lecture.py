from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.lecture import LectureStatus


class LectureCreate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    professor: Optional[str] = None
    generate_cards: bool = True
    generate_notes: bool = False


class LectureStatusResponse(BaseModel):
    job_id: str
    status: LectureStatus
    created_at: datetime
    updated_at: datetime
    card_count: Optional[int] = None
    download_url: Optional[str] = None
    csv_download_url: Optional[str] = None
    note_pdf_url: Optional[str] = None
    note_page_count: Optional[int] = None
    current_step: Optional[str] = None
    title: Optional[str] = None
    subject: Optional[str] = None
    professor: Optional[str] = None
    generate_cards: bool = True
    generate_notes: bool = False
    has_audio: bool = False
    error_message: Optional[str] = None

    class Config:
        from_attributes = True
