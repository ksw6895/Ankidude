from typing import List

from pydantic import BaseModel, Field


class Card(BaseModel):
    front: str = Field(..., description="Front side text")
    back: str = Field(..., description="Back side text")
    tag: str = Field(default="", description="Optional tag")


class LLMResult(BaseModel):
    cleaned_transcript: str
    cards: List[Card]
