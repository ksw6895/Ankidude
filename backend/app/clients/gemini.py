import json
import re
from typing import Dict, List, Optional

import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.schemas.card import LLMResult


def _serialize_slides(slides: List[Dict]) -> str:
    blocks = ["[SLIDES]"]
    for slide in slides:
        blocks.append(f"--- SLIDE {slide.get('index', '')} ---")
        blocks.append(f"Title: {slide.get('title', '')}")
        blocks.append("Body:")
        blocks.append(slide.get("body", ""))
        blocks.append("")
    return "\n".join(blocks)


def _extract_json_block(text: str) -> Dict:
    json_pattern = re.compile(r"\{.*\}", re.DOTALL)
    match = json_pattern.search(text)
    if not match:
        raise ValueError("Gemini response does not contain JSON")
    block = match.group()
    return json.loads(block)


class GeminiClient:
    def __init__(self, api_key: Optional[str] = None, model_id: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.gemini_api_key
        self.model_id = model_id or settings.gemini_model_id
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_id)

    @retry(wait=wait_exponential(multiplier=1, min=1, max=10), stop=stop_after_attempt(2))
    def generate_cards(
        self,
        slides: List[Dict],
        transcript_text: str,
        meta: Optional[Dict] = None,
    ) -> LLMResult:
        meta = meta or {}
        meta_block = "\n".join(
            [
                f"Course: {meta.get('subject') or ''}",
                f"Lecture Title: {meta.get('title') or ''}",
                f"Professor: {meta.get('professor') or ''}",
            ]
        )

        prompt = f"""
You are an Anki Basic flashcard generator for Korean medical lectures. 
Use the slides as the source of truth, and use the transcript only to clarify emphasis. 
Tasks:
1) Fix the transcript medical terms based on slides (use English spellings as in slides).
2) Create high-yield flashcards (Anki Basic Front/Back) with one concept per card.
Rules:
- Do not invent facts not present in slides or transcript.
- Prefer content that appears in both slides and transcript; include instructor emphasis if present in transcript.
- Target around 25 cards for a one-hour lecture; fewer is acceptable if high quality.
- Keep answers concise (exam-ready), avoid long stories.
- Use Korean prompts with English terms as needed.
- Tag format: subject_topic or empty string.
- Output must be pure JSON only, no markdown, no explanation.

Here is metadata:
{meta_block}

{_serialize_slides(slides)}

[TRANSCRIPT_RAW]
{transcript_text}

Return JSON with keys cleaned_transcript and cards (array of front/back/tag).
"""

        response = self.model.generate_content(prompt)
        data = _extract_json_block(response.text or "")
        return LLMResult.model_validate(data)
