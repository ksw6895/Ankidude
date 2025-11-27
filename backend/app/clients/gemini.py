import logging
import os
from typing import Dict, List, Optional

from google import genai
from pydantic import ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.schemas.card import Card as CardSchema
from app.schemas.card import LLMResult
from app.schemas.gemini_cards import LectureCardsOutput

logger = logging.getLogger(__name__)


def _serialize_slides(slides: List[Dict]) -> str:
    blocks = ["[SLIDES]"]
    for slide in slides:
        blocks.append(f"--- SLIDE {slide.get('index', '')} ---")
        blocks.append(f"Title: {slide.get('title', '')}")
        blocks.append("Body:")
        blocks.append(slide.get("body", ""))
        blocks.append("")
    return "\n".join(blocks)


def _build_prompt(slides: List[Dict], transcript_text: str, meta: Dict) -> str:
    meta_block = "\n".join(
        [
            f"Course: {meta.get('subject') or ''}",
            f"Lecture Title: {meta.get('title') or ''}",
            f"Professor: {meta.get('professor') or ''}",
        ]
    )
    tag_hint = meta.get("subject") or meta.get("title") or ""

    return f"""
You are generating Korean/English medical study flashcards for Anki Basic (Front/Back).

Follow these rules:
- Use slides as the source of truth; use the transcript only to clarify emphasis and fix STT errors.
- Normalize medical terminology using spellings from slides.
- Do not hallucinate content that is not supported by slides or transcript.
- Prefer concise, exam-ready answers with one concept per card.
- Tags should derive from metadata when possible (e.g., "{tag_hint}").

The API will enforce a response schema with:
- cleaned_transcript: normalized transcript string
- cards: array of objects with front, back, and optional tag
Fill every required field in that schema.

Here is metadata:
{meta_block}

{_serialize_slides(slides)}

[TRANSCRIPT_RAW]
{transcript_text}
"""


class GeminiStructuredOutputError(RuntimeError):
    """Raised when structured output from Gemini cannot be validated."""


class GeminiClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model_id: Optional[str] = None,
        *,
        max_output_tokens: int = 16000,
        request_timeout: int = 600,
        client: Optional[genai.Client] = None,
    ):
        settings = get_settings()
        env_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.api_key = api_key or settings.gemini_api_key or env_api_key
        self.model_id = model_id or settings.gemini_model_id
        self.max_output_tokens = max_output_tokens
        self.request_timeout = request_timeout
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required")

        self.client = client or genai.Client(api_key=self.api_key)

    @retry(
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(2),
        reraise=True,
    )
    def generate_cards(
        self,
        slides: List[Dict],
        transcript_text: str,
        meta: Optional[Dict] = None,
    ) -> LLMResult:
        meta = meta or {}
        prompt = _build_prompt(slides, transcript_text, meta)
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": LectureCardsOutput.model_json_schema(),
            "max_output_tokens": self.max_output_tokens,
        }

        response = self.client.models.generate_content(
            model=self.model_id,
            contents=prompt,
            config=config,
            request_options={"timeout": self.request_timeout},
        )

        if not response or not response.text:
            logger.error(
                "Empty structured response from Gemini",
                extra={"prompt": prompt, "config": config, "raw_response": repr(response)},
            )
            raise GeminiStructuredOutputError("Gemini response text is empty")

        try:
            parsed = LectureCardsOutput.model_validate_json(response.text)
        except ValidationError as exc:
            logger.error(
                "Failed to validate structured Gemini response",
                extra={
                    "prompt": prompt,
                    "config": config,
                    "raw_response": response.text,
                },
            )
            raise GeminiStructuredOutputError("Gemini structured output validation failed") from exc

        cards = [
            CardSchema(front=card.front, back=card.back, tag=card.tag or "")
            for card in parsed.cards
        ]
        return LLMResult(cleaned_transcript=parsed.cleaned_transcript, cards=cards)
