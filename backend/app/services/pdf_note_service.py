from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Iterable, List, Tuple

import fitz

from app.schemas.gemini_cards import PageNote
from app.storage.manager import StorageManager
from app.utils.file_utils import ensure_local_file

logger = logging.getLogger(__name__)


class PdfNoteService:
    """Render lecture notes into the right-side margin of a PDF."""

    def __init__(self, storage: StorageManager):
        self.storage = storage

    def render_notes_pdf(
        self,
        slides_url: str,
        notes: Iterable[PageNote],
        *,
        filename: str | None = None,
        prefix: str = "exports",
    ) -> Tuple[str, int]:
        pdf_path = ensure_local_file(slides_url)
        doc = fitz.open(pdf_path)

        note_map = {note.page_number: note.content for note in notes}
        rendered = 0
        for page_index, page in enumerate(doc, start=1):
            if page_index not in note_map:
                continue
            self._extend_page_with_note(page, note_map[page_index])
            rendered += 1

        pdf_bytes = doc.tobytes(deflate=True)
        doc.close()
        output_name = filename or f"{Path(pdf_path).stem}-notes.pdf"
        output_url = self.storage.save_bytes(
            pdf_bytes,
            filename=output_name,
            prefix=prefix,
            content_type="application/pdf",
            content_disposition=f'attachment; filename="{output_name}"',
        )
        return output_url, rendered

    def _extend_page_with_note(self, page: fitz.Page, markdown_text: str) -> None:
        original_rect = page.rect
        new_width = original_rect.width * 1.3  # 30% extra room on the right
        new_rect = fitz.Rect(original_rect.x0, original_rect.y0, new_width, original_rect.y1)
        page.set_mediabox(new_rect)

        padding = 16
        note_rect = fitz.Rect(
            original_rect.width + padding / 2,
            original_rect.y0 + padding,
            new_width - padding,
            original_rect.y1 - padding,
        )

        text = self._markdown_to_text(markdown_text)
        # 안전장치: 지나치게 긴 텍스트는 먼저 자른다.
        if len(text) > 1200:
            text = text[:1200]

        font_size = 11
        min_font = 8
        leftover: str | None = None

        def try_fill(size: int, content: str) -> tuple[str | None, fitz.TextWriter]:
            writer = fitz.TextWriter(page.rect)
            remaining = writer.fill_textbox(
                note_rect,
                content,
                fontsize=size,
                fontname="helv",
                align=0,
            )
            return remaining, writer

        writer_to_apply: fitz.TextWriter | None = None
        while font_size >= min_font:
            leftover, writer_to_apply = try_fill(font_size, text)
            if not leftover:
                break
            font_size -= 1

        if leftover and writer_to_apply:
            # 최소 폰트에서도 남을 경우, 잘라내고 한번만 쓴다.
            keep_len = max(0, len(text) - len(leftover))
            truncated = text[:keep_len or max(0, int(len(text) * 0.9))].rstrip()
            if truncated and truncated[-1] not in {".", "!", "?"}:
                truncated = truncated.rstrip("-*")
            truncated = truncated[: max(0, len(truncated) - 3)] + "..."
            _, writer_to_apply = try_fill(min_font, truncated)
            writer_to_apply.write_text(page)
            logger.debug("Truncated note content to fit page %s", page.number + 1)
        elif writer_to_apply:
            writer_to_apply.write_text(page)

    def _markdown_to_text(self, text: str) -> str:
        cleaned = text.replace("\r\n", "\n").strip()
        cleaned = re.sub(r"^#{1,6}\s*", "", cleaned, flags=re.MULTILINE)  # remove heading markers
        cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned)  # bold
        cleaned = re.sub(r"__(.*?)__", r"\1", cleaned)  # underline/bold alt
        cleaned = re.sub(r"`([^`]*)`", r"\1", cleaned)  # inline code
        cleaned = re.sub(r"^\s*[-*]\s+", "- ", cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()
