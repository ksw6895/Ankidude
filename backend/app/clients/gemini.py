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
  - 만약 한 문장이 정의·기전·이유·결과·경고·예시·감별·치료 포인트 등 **어떤 의미라도** 가진다면, 가능하면 노트에 포함한다.
  - 교수가 어떤 주제에 대해 의미 있는 문장을 10개 정도 말하면, 그 슬라이드 노트에도 보통 그 중 **대부분이 반영되도록** 쓴다.
  - 아주 적은 수의 불릿으로 강하게 압축하기보다는, **여러 개의 짧고 명료한 불릿**으로 나누어 설명하는 쪽을 선호한다.

- **What to remove**
  - 다음과 같은 부분만 과감하게 제거하거나 짧게 압축한다:
    - 순수한 말버릇·추임새 (`어…`, `그러니까…`, `어쨌든` 등),
    - 그대로 반복된 문장,
    - 곧바로 더 명확하게 다시 설명해 주는, 미완성 문장.
  - 작은 디테일이라도 **의미 있는 임상 정보**라면, 가급적 남겨 둔다.

- **Rewriting policy**
  - 한국어 문장을 자연스럽게 만들기 위해 **완곡한 재서술**은 허용한다.
  - 다만, 원래 설명의 **논리 구조**(예: 원인 → 기전 → 결과, 기준 → 예외, 원칙 → 예시 등)는 최대한 유지한다.
  - 한 문장으로 말한 설명이 너무 길면, 노트에서는 2~3문장으로 나누어 적되, **정보량은 거의 그대로 보존**한다.

- **Reordering**
  - 가능하면 강의에서 말한 순서를 그대로 따라간다.
  - 다음의 경우에만 최소한으로 재배치한다:
    - 서로 밀접하게 연결된 내용들을 한 불릿 아래 묶을 때,
    - 명백히 다른 슬라이드 주제에 속하는 내용을 그 슬라이드로 옮길 때.

---

## Format & Style Rules (for the written notes)

- **Language/Tone (문장 형태와 말투)**  
  - 한국어 중심으로 작성하고, 존댓말은 사용하지 않는다.  
  - **모든 문장은 동사/형용사/이다 체로 끝나야 한다.**  
    - 예: `~이 중요하다`, `~로 정의한다`, `~인 경우가 많다`, `~이라고 부른다`, `~로 생각할 수 있다`.  
  - `~함`, `~필요`, `~증가`, `~감소`, `~의심` 같은 **체언 종결형·명사형 어미로 문장을 끝내지 않는다.**  
    - 잘못된 예: `가스 교환 장애 증가`, `기도 과민성 증가`, `진단 필요`.  
    - 올바른 예: `가스 교환 장애가 증가한다`, `기도 과민성이 증가한다`, `이 경우에는 추가적인 진단이 필요하다`.  
  - 말투는 지나치게 명령조·전투조가 되지 않도록 하고,  
    - **친구에게 개념을 설명해 주듯이** 부드럽지만 단정적인 어조로 적는다.

- **Bullets:**
  - 각 불릿은 **1~2개의 완전한 문장**으로 작성한다 (키워드 나열 금지).
  - 불릿 안의 문장은 서로 자연스럽게 이어지도록 연결해서 적는다.
  - 한 슬라이드에서 다루는 내용이 많으면, 불릿 수를 늘려서라도 웬만한 설명을 거의 다 담는다.
- **Formula/Notation:**
  - LaTeX/수식 마크업(`$`, `\(`, `\)`)은 사용하지 않는다. `>=`, `<=`, `->`, `^2`, `/` 같은 **일반 기호**와 평문으로 표기한다.

- **Depth & Coverage:**
  - 교수의 설명(기전·이유·결과·예외·임상 팁)을 최대한 그대로 살리되,
    - 말투와 어순만 정리해서 **읽기 편한 설명문**으로 바꾼다.
  - 이 작업의 목표는  
    - “핵심만 남기고 나머지를 걷어내는 요약”이 아니라,  
    - “강의실에서 들은 내용을 **거의 다 받아 적으면서도** 읽기 좋게 정리하는 것”이다.  
  - 따라서 한 토픽에 대해 3~4문장으로 설명했다면,  
    - 노트에서도 보통 2~3문장 이상으로 풀어서 적는 것을 기본으로 한다.

- **Meta remarks:**  
  - 시험·퀴즈·출제 언급은 별도 불릿으로 포함하고 `[EXAM]` 접두사를 붙인다.  
    - 예: `[EXAM] 이 기준은 국시에서도 자주 묻는 포인트라고 강조한다.`  
  - 교수의 강조·경고는 별도 불릿으로 포함하고 `[HIGHLIGHT]` 접두사를 붙인다.  
    - 예: `[HIGHLIGHT] 이 부분에서 환자가 자주 악화되므로 실제 임상에서 특히 조심해야 한다고 설명한다.`  
  - 가벼운 농담·메타 코멘트가 개념 이해에 도움이 되면 `[ASIDE]`로 짧게 남긴다.  
    - 예: `[ASIDE] 교수는 이 병을 '게으른 폐'라고 비유하면서 환자 교육할 때 이렇게 설명하면 이해가 잘 된다고 말한다.`

- **Length:**  
  - 페이지당 900자를 권장 기준으로 삼는다.  
  - 그러나 **중요한 내용은 글자 수 때문에 억지로 줄이지 않는다.**  
  - 분량이 너무 길어지면,  
    - 덜 중요한 주변부 설명만 약간 줄이고,  
    - 정의·기전·진단·치료·예외·시험 포인트 같은 핵심은 그대로 남겨 둔다.

- **No Hallucination:**  
  - [TRANSCRIPT_RAW]에 아무 말도 없는 슬라이드는,  
    - 노트를 비워 두거나,  
    - 필요할 경우 슬라이드에 이미 적힌 핵심만 한 줄 정도로 정리한다.  
  - 새로운 의학 정보, 가상의 예시, 추가적인 가이드라인을 **직접 만들어 내지 않는다.**  
  - 애매한 경우에는 항상 “교수가 실제로 말한 내용”만 사용해서 문장을 만든다.

---

## Response schema (JSON)

```json
{{
  "notes": [
    {{
      "page_number": 1,
      "content": "- 첫 페이지에서 교수는 오늘 강의의 전체 주제를 간단하게 소개한다.\n- 이 강의에서 어떤 질환을 중심으로 볼 것인지, 그리고 왜 이 질환이 임상에서 중요한지 설명한다."
    }},
    {{
      "page_number": 2,
      "content": "- 이 슬라이드에서는 병태생리 기전을 큰 흐름부터 차근차근 설명한다.\n- 먼저 어떤 자극이 생기면 세포 수준에서 어떤 변화가 일어나는지, 그 결과로 임상 증상이 어떻게 나타나는지 순서대로 연결해서 이야기한다."
    }}
    // ...
  ]
}}
```

---

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
