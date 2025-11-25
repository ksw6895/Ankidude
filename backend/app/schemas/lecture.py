from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.lecture import LectureStatus


class LectureCreate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    professor: Optional[str] = None


class LectureStatusResponse(BaseModel):
    job_id: str
    status: LectureStatus
    created_at: datetime
    updated_at: datetime
    card_count: Optional[int] = None
    download_url: Optional[str] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True
