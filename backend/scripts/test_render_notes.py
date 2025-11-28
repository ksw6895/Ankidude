"""
Quick local test for PdfNoteService rendering.

Usage:
  python backend/scripts/test_render_notes.py --pdf path/to/slides.pdf --out notes-out.pdf
"""

import argparse
import sys
from pathlib import Path

import fitz

# Ensure backend package is importable
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "backend") not in sys.path:
    sys.path.append(str(ROOT / "backend"))

from app.schemas.gemini_cards import PageNote
from app.services.pdf_note_service import PdfNoteService


class DummyStorage:
    """Minimal storage that just writes bytes to a local file."""

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def save_bytes(self, data: bytes, filename: str, prefix: str = "exports", **_: object) -> str:
        path = self.output_dir / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render notes onto a PDF for local debugging.")
    parser.add_argument("--pdf", required=True, help="Path to source slides PDF")
    parser.add_argument("--out", default="notes-test.pdf", help="Output PDF filename")
    parser.add_argument("--outdir", default="tmp_notes", help="Directory to write output")
    args = parser.parse_args()

    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path)

    # Minimal sample notes; adjust page_number to match your PDF.
    sample_notes = [
        PageNote(page_number=1, content="- [EXAM] 모야모야병 정의와 병태생리 요약\n- 핵심 포인트만 시험 대비용으로 정리"),
        PageNote(page_number=2, content="- [HIGHLIGHT] 수술 적응증과 주요 혈관 해부 요약\n- 합병증 및 주의사항 체크리스트"),
        PageNote(page_number=3, content="- [ASIDE] 교수님 강조 사항 두 줄 정리\n- 궁금한 점: 영상 판독 기준 정리"),
    ]

    storage = DummyStorage(Path(args.outdir))
    service = PdfNoteService(storage)

    # Render notes
    url, rendered = service.render_notes_pdf(
        slides_url=str(pdf_path),
        notes=sample_notes,
        filename=args.out,
    )

    print(f"Rendered pages with notes: {rendered}")
    print(f"Output written to: {url}")

    # Optional: show note area visibility by extracting text locations
    doc = fitz.open(url)
    for i, page in enumerate(doc, 1):
        txt = page.get_text().strip()
        if txt:
            print(f"Page {i}: text length={len(txt)} preview='{txt[:120].replace(chr(10),' ')}'")
    doc.close()


if __name__ == "__main__":
    main()
