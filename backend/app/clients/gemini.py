import json
import logging
import os
from typing import Dict, List, Optional

from google import genai
from pydantic import ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.schemas.card import Card as CardSchema
from app.schemas.card import LLMResult
from app.schemas.gemini_cards import (
    CleanTranscriptOutput,
    LectureCardsOutput,
    LectureNotesOutput,
    PageNote,
)

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


def _build_note_prompt(slides: List[Dict], transcript_text: str, meta: Dict) -> str:
    meta_block = "\n".join(
        [
            f"Course: {meta.get('subject') or ''}",
            f"Lecture Title: {meta.get('title') or ''}",
            f"Professor: {meta.get('professor') or ''}",
        ]
    )

    return f"""
You are an elite medical student taking perfectly organized notes during a lecture.
Your goal is to **transcribe and organize the professor's spoken words (transcript)** onto the corresponding slide pages.

**CRITICAL INSTRUCTION:**
- Do NOT just summarize the text written on the slide. The user already has the slide.
- **Your main source is the [TRANSCRIPT_RAW].** You must extract explanations, clinical tips, and emphasized details from the speech and place them on the page where that topic is discussed.
- Use the slide text only as a "context anchor" to decide *which page* the professor is currently talking about.

**Format & Style Rules:**
- **Language/Tone:** Korean 중심, 존댓말 금지. 문장은 동사/형용사 평서형으로 끝내기(`~다`, `~한다`, `~해야 한다`). 체언 종결형·명사형 어미(`~함`, `~필요`) 금지.
- **Bullets:** 각 불릿은 1~2개의 완전한 문장으로 작성(문장 파편/키워드 나열 금지).
- **Depth:** 교수의 설명(기전/이유/결과)과 예시를 넣어 핵심을 풀어 쓰되, 과도하게 요약하지 말 것.
- **Meta remarks:** 시험·퀴즈·출제 언급은 별도 불릿으로 포함하고 `[EXAM]` 접두사를 붙인다. 교수의 강조/경고는 `[HIGHLIGHT]` 접두사로 표시한다. 가벼운 농담·메타 코멘트가 학습에 도움이 되면 `[ASIDE]`로 짧게 남긴다.
- **Length:** 페이지당 900자 이하를 목표로 하되 중요한 내용은 억지로 줄이지 말 것. 너무 길면 덜 중요한 부분만 축약한다.
- **No Hallucination:** 대본이 침묵하는 슬라이드는 노트를 비워두거나, 필요하면 슬라이드에 이미 적힌 핵심만 한 줄로 적는다(새 정보 창작 금지).

Response schema (JSON):
{{
  "notes": [
    {{ "page_number": 1, "content": "- Professor's opening remarks...\\n- Key concept explained: ..." }},
    ...
  ]
}}

**Metadata:**
{meta_block}

**Slides (Context Anchors):**
{_serialize_slides(slides)}

**[TRANSCRIPT_RAW] (Source of Content):**
{transcript_text}
"""


def _build_clean_prompt(slides: List[Dict], transcript_text: str, meta: Dict) -> str:
    meta_block = "\n".join(
        [
            f"Course: {meta.get('subject') or ''}",
            f"Lecture Title: {meta.get('title') or ''}",
            f"Professor: {meta.get('professor') or ''}",
        ]
    )
    return f"""
You are cleaning a noisy lecture transcript.

Goals:
- Output a fully cleaned transcript in Korean when possible; retain original English terms, especially medical terms. If Korean term exists, append English in parentheses where relevant. Keep original ordering and speaker context minimal (no hallucinated speakers).
- Fix STT typos, spacing, and punctuation.
- Do not summarize, shorten, or reorder. Do not add headers or bullets. Output plain text only.

Metadata (for terminology hints):
{meta_block}

Slides (for terminology anchoring):
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
        client: Optional[genai.Client] = None,
    ):
        settings = get_settings()
        env_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.api_key = api_key or settings.gemini_api_key or env_api_key
        self.model_id = model_id or settings.gemini_model_id
        self.max_output_tokens = max_output_tokens
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

    @retry(
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(2),
        reraise=True,
    )
    def generate_lecture_notes(
        self,
        slides: List[Dict],
        transcript_text: str,
        meta: Optional[Dict] = None,
    ) -> List[PageNote]:
        meta = meta or {}
        prompt = _build_note_prompt(slides, transcript_text, meta)
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": LectureNotesOutput.model_json_schema(),
            "max_output_tokens": self.max_output_tokens,
        }

        response = self.client.models.generate_content(
            model=self.model_id,
            contents=prompt,
            config=config,
        )

        if not response or not response.text:
            logger.error(
                "Empty structured response from Gemini (notes)",
                extra={"prompt": prompt, "config": config, "raw_response": repr(response)},
            )
            raise GeminiStructuredOutputError("Gemini response text is empty")

        def _salvage_json(text: str) -> LectureNotesOutput:
            try:
                return LectureNotesOutput.model_validate_json(text)
            except ValidationError:
                # best-effort salvage: trim to first/last brace
                first = text.find("{")
                last = text.rfind("}")
                if first != -1 and last != -1 and last > first:
                    trimmed = text[first : last + 1]
                    try:
                        obj = json.loads(trimmed)
                        return LectureNotesOutput.model_validate(obj)
                    except Exception:
                        pass
                raise

        try:
            parsed = _salvage_json(response.text)
        except ValidationError as exc:
            logger.error(
                "Failed to validate structured Gemini notes response",
                extra={
                    "prompt": prompt,
                    "config": config,
                    "raw_response": response.text,
                },
            )
            raise GeminiStructuredOutputError("Gemini structured output validation failed") from exc

        return parsed.notes

    @retry(
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(2),
        reraise=True,
    )
    def clean_transcript(
        self,
        slides: List[Dict],
        transcript_text: str,
        meta: Optional[Dict] = None,
    ) -> str:
        meta = meta or {}
        prompt = _build_clean_prompt(slides, transcript_text, meta)
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": CleanTranscriptOutput.model_json_schema(),
            "max_output_tokens": self.max_output_tokens,
        }

        response = self.client.models.generate_content(
            model=self.model_id,
            contents=prompt,
            config=config,
        )

        if not response or not response.text:
            logger.error(
                "Empty structured response from Gemini (clean transcript)",
                extra={"prompt": prompt, "config": config, "raw_response": repr(response)},
            )
            raise GeminiStructuredOutputError("Gemini response text is empty")

        try:
            parsed = CleanTranscriptOutput.model_validate_json(response.text)
        except ValidationError as exc:
            logger.error(
                "Failed to validate structured Gemini clean transcript response",
                extra={
                    "prompt": prompt,
                    "config": config,
                    "raw_response": response.text,
                },
            )
            raise GeminiStructuredOutputError("Gemini structured output validation failed") from exc

        return parsed.cleaned_transcript
