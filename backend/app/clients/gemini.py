import json
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types
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


def _build_meta_block(meta: Dict) -> str:
    return "\n".join(
        [
            f"Course: {meta.get('subject') or ''}",
            f"Lecture Title: {meta.get('title') or ''}",
            f"Professor: {meta.get('professor') or ''}",
        ]
    )


def _pdf_file_part(pdf_file: Dict[str, str]) -> Dict[str, Dict[str, str]]:
    uri = pdf_file.get("uri") or pdf_file.get("file_uri")
    mime_type = pdf_file.get("mime_type")
    if not uri or not mime_type:
        raise ValueError("pdf_file must include uri/file_uri and mime_type")
    return {"file_data": {"file_uri": uri, "mime_type": mime_type}}


def _build_cards_parts(pdf_file: Dict[str, str], transcript_text: str, meta: Dict) -> List[Dict[str, Any]]:
    meta_block = _build_meta_block(meta)
    tag_hint = meta.get("subject") or meta.get("title") or ""
    prompt = f"""
You are generating Korean/English medical study flashcards for Anki Basic (Front/Back).

Source priority:
- The attached PDF slides (file input) are the ground truth.
- [TRANSCRIPT_RAW] is only for emphasis, spoken clarifications, and fixing STT errors.

Rules:
- Normalize medical terminology using the slide PDF; do not hallucinate beyond PDF + transcript.
- Prefer concise, exam-ready answers with one concept per card.
- Tags should derive from metadata when possible (e.g., "{tag_hint}").

The API will enforce a JSON schema with:
- cleaned_transcript: normalized transcript string
- cards: array of objects with front, back, and optional tag
Fill every required field in that schema.

Metadata:
{meta_block}
""".strip()

    return [
        _pdf_file_part(pdf_file),
        {"text": prompt},
        {"text": f"[TRANSCRIPT_RAW]\n{transcript_text}"},
    ]


def _build_note_parts(pdf_file: Dict[str, str], transcript_text: str, meta: Dict) -> List[Dict[str, Any]]:
    meta_block = _build_meta_block(meta)
    prompt = f"""
You are an elite medical student taking perfectly organized notes during a lecture.
Your goal is to **transcribe and organize the professor's spoken words (transcript)** onto the correct PDF slide pages.

Compared to normal summarization, you work in **"almost verbatim, low-compression note-taking mode"**:
- You keep **most of what the professor actually says** if it has any educational or clinical value.
- You only remove obvious fillers, repeated phrases, and disorganized fragments.
- You rewrite into clear, readable bullets in Korean, but you **do NOT aggressively compress** multi-sentence explanations into one short line.

---

## CRITICAL INSTRUCTION

- Use the attached PDF as the slide source and map topics to the actual PDF page order (1-based).
- Ignore any page numbers printed on the slide graphic; return the real PDF page index in `page_number`.
- **Your main source is the [TRANSCRIPT_RAW].**  \
  - The transcript represents everything the professor said.  \
  - Treat it like you are sitting in class and taking detailed notes.  \
  - When in doubt about whether to include a sentence, **include it** and only clean up wording and structure.
- Extract explanations, clinical tips, reasoning, and emphasized details from the speech and place them on the PDF page where that topic is discussed.
- Do NOT just summarize or rewrite the text written on the slide. The user already has the slide; slide text is only a context anchor to decide the current page.

---

## Note-taking Philosophy (Low Compression, High Coverage)

When processing [TRANSCRIPT_RAW]:

- **Coverage priority**
  - If a sentence carries meaning (definition, mechanism, reasoning, warning, exam tip, example, differential, treatment nuance, etc.), try to keep it in the notes.
  - If the professor says 10 meaningful sentences about a topic, your notes for that slide should usually reflect **most of those sentences**, not just 2–3.
  - Prefer **more bullets with shorter, clean sentences** over a tiny number of heavily compressed bullets.

- **What to remove**
  - Remove or compress only:
    - Pure fillers (`어…`, `그러니까…`, 말버릇, 맥락 없는 농담 등),
    - Exact repetitions,
    - Broken or half-finished sentences that are immediately restated more clearly.
  - Do **not** remove clinically or conceptually meaningful side remarks just because they are “작은 디테일”.

- **Rewriting policy**
  - You **may paraphrase** to obey the Korean style rules and to make sentences clearer.
  - Keep the **logical order** and nuance of the original explanation (기전 → 결과, 진단 기준 → 예외, 치료 원칙 → 예시 등).
  - Long spoken explanations can be split into multiple bullets, but the **total information content** should stay close to the original.

- **Reordering**
  - Keep the natural flow of the lecture as much as possible.
  - Minimal rearrangement is allowed only to:
    - Group closely related sentences under one bullet,
    - Move a sentence to the correct slide if the topic clearly belongs there.

---

## Format & Style Rules (for the written notes)

- **Language/Tone:**  
  - Korean 중심, 존댓말 금지.  
  - 문장은 동사/형용사 평서형으로 끝내기 (`~다`, `~한다`, `~해야 한다`).  
  - 체언 종결형·명사형 어미 (`~함`, `~필요`) 금지.

- **Bullets:**  
  - 각 불릿은 **1~2개의 완전한 문장**으로 작성 (문장 파편/키워드 나열 금지).  
  - 한 슬라이드에서 다룬 내용이 많으면, 불릿 수를 늘려서라도 웬만한 설명을 모두 담는다.

- **Depth & Coverage:**  
  - 교수의 설명(기전/이유/결과)과 예시를 그대로 살리되, 구어체만 자연스럽게 정리한다.  
  - **“핵심만 남기고 나머지는 걷어내는 요약”이 아니라, “거의 다 받아 적되 읽기 좋게 재구성하는 것”이 목표**다.  
  - 교수의 설명이 3~4문장으로 이어지면, 노트에서도 보통 2~3문장 분량으로 정보 대부분을 유지한다.

- **Meta remarks:**  
  - 시험·퀴즈·출제 언급은 별도 불릿으로 포함하고 `[EXAM]` 접두사를 붙인다.  
  - 교수의 강조/경고는 별도 불릿으로 포함하고 `[HIGHLIGHT]` 접두사를 붙인다.  
  - 가벼운 농담·메타 코멘트가 학습에 도움이 되면 `[ASIDE]`로 짧게 남긴다  
    (예: 개념을 기억하기 좋은 비유, 함정 포인트, 자주 나오는 실수 등).

- **Length:**  
  - 페이지당 900자 이하를 “권장 기준”으로 삼되,  
    - 중요한 내용은 억지로 줄이지 말고,  
    - 분량이 너무 넘어갈 것 같으면 **진짜로 덜 중요한 주변부**만 약간 축약한다.  
  - 시험에 유의미한 디테일·예외·임상 팁은 길어지더라도 남긴다.

- **No Hallucination:**  
  - 대본이 침묵하는 슬라이드는 노트를 비워두거나,  
    - 필요하면 **슬라이드에 이미 적힌 핵심만 한 줄**로 적는다.  
  - 새로운 의학 정보나 예시는 **절대 창작하지 않는다.**  
  - 모호할 때는 “교수가 실제로 말한 내용”만 재배치해서 사용한다.

---

## Response schema (JSON)

```json
{{
  "notes": [
    {{
      "page_number": 1,
      "content": "- 첫 페이지에서 교수의 도입부 설명을 정리한다...\n- 강의의 전체 목표와 오늘 다룰 큰 주제를 불릿으로 정리한다..."
    }},
    {{
      "page_number": 2,
      "content": "- 병태생리 기전을 교수 설명 순서에 맞춰 거의 그대로 옮기되, 문장만 다듬는다...\n- 예시와 임상 팁, 자주 틀리는 포인트를 각각 별도 불릿으로 정리한다..."
    }}
    // ...
  ]
}}
```

Metadata:
{meta_block}
""".strip()

    return [
        _pdf_file_part(pdf_file),
        {"text": prompt},
        {"text": f"[TRANSCRIPT_RAW]\n{transcript_text}"},
    ]


def _build_clean_parts(pdf_file: Dict[str, str], transcript_text: str, meta: Dict) -> List[Dict[str, Any]]:
    meta_block = _build_meta_block(meta)
    prompt = f"""
You are cleaning a noisy lecture transcript.

Goals:
- Output a fully cleaned transcript in Korean when possible; retain original English terms, especially medical terms. If a Korean term exists, append English in parentheses where relevant. Keep original ordering and avoid hallucinated speakers.
- Use the attached PDF slides as a terminology anchor; prefer spellings from the PDF.
- Fix STT typos, spacing, and punctuation. Do not summarize, shorten, reorder, or add headers/bullets. Output plain text only.

Metadata (for terminology hints):
{meta_block}
""".strip()

    return [
        _pdf_file_part(pdf_file),
        {"text": prompt},
        {"text": f"[TRANSCRIPT_RAW]\n{transcript_text}"},
    ]


class GeminiStructuredOutputError(RuntimeError):
    """Raised when structured output from Gemini cannot be validated."""


class GeminiClient:
    @staticmethod
    def _safe_display_name(name: str) -> str:
        """Make display names ASCII-safe for HTTP headers."""
        safe = name.encode("ascii", "ignore").decode() or "upload.pdf"
        return safe

    @staticmethod
    def _ensure_ascii_path(path: Path, safe_name: str) -> tuple[Path, Optional[Path]]:
        """
        Return an ASCII-safe path for upload.
        If the filename has non-ASCII chars, copy to a temp dir with an ASCII name.
        """
        if path.name.isascii():
            return path, None

        tmp_dir = Path(tempfile.mkdtemp(prefix="ankidude_pdf_"))
        # Preserve extension if missing on safe_name
        ext = path.suffix or ".pdf"
        upload_name = safe_name
        if not upload_name.lower().endswith(ext.lower()):
            upload_name = f"{upload_name}{ext}"
        dest = tmp_dir / upload_name
        shutil.copyfile(path, dest)
        return dest, tmp_dir

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_id: Optional[str] = None,
        *,
        max_output_tokens: int = 16000,
        request_timeout: int = 300,
        client: Optional[genai.Client] = None,
    ):
        settings = get_settings()
        env_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.api_key = api_key or settings.gemini_api_key or env_api_key
        self.model_id = model_id or settings.gemini_model_id
        self.max_output_tokens = max_output_tokens
        # google-genai HttpOptions.timeout uses milliseconds
        self.request_timeout_ms = int(request_timeout * 1000)
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required")

        self.http_options = None
        try:
            self.http_options = types.HttpOptions(timeout=self.request_timeout_ms)
        except Exception:
            logger.warning("HttpOptions not available; using SDK defaults for timeouts.")

        client_kwargs: Dict[str, Any] = {"api_key": self.api_key}
        if self.http_options:
            client_kwargs["http_options"] = self.http_options
        self.client = client or genai.Client(**client_kwargs)

    def upload_pdf(self, pdf_path: str | Path, *, display_name: Optional[str] = None) -> Dict[str, str]:
        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        safe_name = self._safe_display_name(display_name or path.name)
        upload_path, temp_dir = self._ensure_ascii_path(path, safe_name)
        config = types.UploadFileConfig(
            display_name=safe_name,
            mime_type="application/pdf",
        )
        start = time.monotonic()
        try:
            uploaded = self.client.files.upload(
                file=str(upload_path),
                config=config,
            )
        finally:
            if temp_dir:
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception:
                    logger.debug("Failed to cleanup temp dir %s", temp_dir, exc_info=True)
        logger.info("Gemini upload completed in %.1fs", time.monotonic() - start)
        # mime_type may be inferred server-side; keep fallback to pdf for downstream parts
        return {"uri": uploaded.uri, "mime_type": uploaded.mime_type or "application/pdf"}

    @retry(
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(2),
        reraise=True,
    )
    def generate_cards(
        self,
        pdf_file: Dict[str, str],
        transcript_text: str,
        meta: Optional[Dict] = None,
    ) -> LLMResult:
        meta = meta or {}
        parts = _build_cards_parts(pdf_file, transcript_text, meta)
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": LectureCardsOutput.model_json_schema(),
            "max_output_tokens": self.max_output_tokens,
        }
        start = time.monotonic()
        response = self.client.models.generate_content(
            model=self.model_id,
            contents=[{"role": "user", "parts": parts}],
            config=config,
        )
        logger.info("Gemini cards call finished in %.1fs", time.monotonic() - start)

        if not response or not response.text:
            logger.error(
                "Empty structured response from Gemini",
                extra={"parts": parts, "config": config, "raw_response": repr(response)},
            )
            raise GeminiStructuredOutputError("Gemini response text is empty")

        try:
            parsed = LectureCardsOutput.model_validate_json(response.text)
        except ValidationError as exc:
            logger.error(
                "Failed to validate structured Gemini response",
                extra={
                    "parts": parts,
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
        pdf_file: Dict[str, str],
        transcript_text: str,
        meta: Optional[Dict] = None,
    ) -> List[PageNote]:
        meta = meta or {}
        parts = _build_note_parts(pdf_file, transcript_text, meta)
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": LectureNotesOutput.model_json_schema(),
            "max_output_tokens": self.max_output_tokens,
        }
        start = time.monotonic()
        response = self.client.models.generate_content(
            model=self.model_id,
            contents=[{"role": "user", "parts": parts}],
            config=config,
        )
        logger.info("Gemini notes call finished in %.1fs", time.monotonic() - start)

        if not response or not response.text:
            logger.error(
                "Empty structured response from Gemini (notes)",
                extra={"parts": parts, "config": config, "raw_response": repr(response)},
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
                    "parts": parts,
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
        pdf_file: Dict[str, str],
        transcript_text: str,
        meta: Optional[Dict] = None,
    ) -> str:
        meta = meta or {}
        parts = _build_clean_parts(pdf_file, transcript_text, meta)
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": CleanTranscriptOutput.model_json_schema(),
            "max_output_tokens": self.max_output_tokens,
        }
        start = time.monotonic()
        response = self.client.models.generate_content(
            model=self.model_id,
            contents=[{"role": "user", "parts": parts}],
            config=config,
        )
        logger.info("Gemini clean call finished in %.1fs", time.monotonic() - start)

        if not response or not response.text:
            logger.error(
                "Empty structured response from Gemini (clean transcript)",
                extra={"parts": parts, "config": config, "raw_response": repr(response)},
            )
            raise GeminiStructuredOutputError("Gemini response text is empty")

        try:
            parsed = CleanTranscriptOutput.model_validate_json(response.text)
        except ValidationError as exc:
            logger.error(
                "Failed to validate structured Gemini clean transcript response",
                extra={
                    "parts": parts,
                    "config": config,
                    "raw_response": response.text,
                },
            )
            raise GeminiStructuredOutputError("Gemini structured output validation failed") from exc

        return parsed.cleaned_transcript
