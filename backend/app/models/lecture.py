import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String, Text

from app.core.db import Base


class LectureStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING_STT = "RUNNING_STT"
    RUNNING_LLM = "RUNNING_LLM"  # legacy alias for Anki generation
    RUNNING_ANKI = "RUNNING_ANKI"
    GENERATING_CSV = "GENERATING_CSV"
    RUNNING_NOTES = "RUNNING_NOTES"
    DONE = "DONE"
    FAILED = "FAILED"


class Lecture(Base):
    __tablename__ = "lectures"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    professor = Column(String, nullable=True)
    slides_url = Column(String, nullable=False)
    audio_url = Column(String, nullable=True)
    generate_cards = Column(Boolean, default=True, nullable=False)
    generate_notes = Column(Boolean, default=False, nullable=False)
    status = Column(Enum(LectureStatus), default=LectureStatus.PENDING, nullable=False)
    card_count = Column(Integer, nullable=True)
    csv_url = Column(String, nullable=True)
    note_pdf_url = Column(String, nullable=True)
    note_page_count = Column(Integer, nullable=True)
    current_step = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
