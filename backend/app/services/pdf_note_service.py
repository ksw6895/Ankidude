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
    """Render lecture notes into the bottom margin of a PDF."""

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
        new_height = original_rect.height * 1.2  # 20% extra room at bottom
        new_rect = fitz.Rect(original_rect.x0, original_rect.y0, original_rect.x1, original_rect.y0 + new_height)
        page.set_mediabox(new_rect)

        padding = 16
        note_rect = fitz.Rect(
            original_rect.x0 + padding,
            original_rect.y1 + padding / 2,
            original_rect.x1 - padding,
            new_rect.y1 - padding,
        )

        lines = self._prepare_colored_lines(markdown_text)
        if not lines:
            return

        min_font, max_font = 8, 11
        drawn = False
        for size in range(max_font, min_font - 1, -1):
            if self._render_lines(page, note_rect, lines, size):
                drawn = True
                break

        if not drawn:
            # 마지막 수단: 잘라서라도 넣는다.
            max_lines = int(note_rect.height // (min_font * 1.25))
            if max_lines <= 0:
                logger.debug("Not enough space for notes on page %s", page.number + 1)
                return
            truncated = lines[:max_lines]
            if len(lines) > max_lines and truncated:
                last_text, last_color = truncated[-1]
                truncated[-1] = (last_text[: max(0, len(last_text) - 3)] + "...", last_color)
            self._render_lines(page, note_rect, truncated, min_font)
            logger.debug("Truncated note content to fit page %s", page.number + 1)

    def _markdown_to_text(self, text: str) -> str:
        cleaned = text.replace("\r\n", "\n").strip()
        cleaned = re.sub(r"^#{1,6}\s*", "", cleaned, flags=re.MULTILINE)  # remove heading markers
        cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned)  # bold
        cleaned = re.sub(r"__(.*?)__", r"\1", cleaned)  # underline/bold alt
        cleaned = re.sub(r"`([^`]*)`", r"\1", cleaned)  # inline code
        cleaned = re.sub(r"^\s*[-*]\s+", "- ", cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()

    def _prepare_colored_lines(self, markdown_text: str) -> list[tuple[str, tuple[float, float, float]]]:
        text = self._markdown_to_text(markdown_text)
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        colored: list[tuple[str, tuple[float, float, float]]] = []
        for line in lines:
            color = (0, 0, 0)  # default black
            if "[EXAM]" in line:
                color = (1, 0, 0)  # red
                line = line.replace("[EXAM]", "").strip()
            elif "[HIGHLIGHT]" in line:
                color = (0, 0.2, 0.8)  # blue-ish
                line = line.replace("[HIGHLIGHT]", "").strip()
            elif "[ASIDE]" in line:
                line = line.replace("[ASIDE]", "").strip()
            if line:
                colored.append((line, color))
        return colored

    def _render_lines(
        self,
        page: fitz.Page,
        note_rect: fitz.Rect,
        lines: list[tuple[str, tuple[float, float, float]]],
        font_size: int,
    ) -> bool:
        line_height = font_size * 1.25
        y = note_rect.y0
        for text, color in lines:
            if y + line_height > note_rect.y1:
                return False
            rect = fitz.Rect(note_rect.x0, y, note_rect.x1, y + line_height)
            page.insert_textbox(rect, text, fontsize=font_size, color=color, align=0)
            y += line_height
        return True
