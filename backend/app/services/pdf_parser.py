from __future__ import annotations

from pathlib import Path
from typing import List, TypedDict

import pdfplumber


class SlideDict(TypedDict):
    index: int
    title: str
    body: str


def parse_pdf_to_slides(pdf_path: str | Path) -> List[SlideDict]:
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    slides: List[SlideDict] = []
    with pdfplumber.open(path) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            raw_text = page.extract_text() or ""
            lines = [line.strip() for line in raw_text.split("\n") if line.strip()]
            if not lines:
                slides.append({"index": idx, "title": f"Slide {idx}", "body": ""})
                continue

            title = lines[0]
            body = "\n".join(lines[1:]) if len(lines) > 1 else ""
            slides.append({"index": idx, "title": title, "body": body})
    return slides
