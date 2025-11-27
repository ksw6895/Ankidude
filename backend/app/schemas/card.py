from typing import List, Optional

from pydantic import BaseModel, Field


class Card(BaseModel):
    front: str = Field(..., description="Front side text")
    back: str = Field(..., description="Back side text")
    tag: Optional[str] = Field(default="", description="Optional tag")


class LLMResult(BaseModel):
    cleaned_transcript: str
    cards: List[Card]
