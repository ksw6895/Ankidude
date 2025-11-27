from typing import List, Optional

from pydantic import BaseModel, Field


class Card(BaseModel):
    front: str = Field(description="Front side of the Anki card.")
    back: str = Field(description="Back side of the Anki card.")
    tag: Optional[str] = Field(
        default=None, description="Optional tag for the card (e.g., lecture/topic)."
    )


class LectureCardsOutput(BaseModel):
    cleaned_transcript: str = Field(
        description="Transcript cleaned and normalized for study."
    )
    cards: List[Card]


class PageNote(BaseModel):
    page_number: int = Field(ge=1, description="1-based index of the PDF page.")
    content: str = Field(
        description="Markdown note content for this page (<=500 characters)."
    )


class LectureNotesOutput(BaseModel):
    notes: List[PageNote]
