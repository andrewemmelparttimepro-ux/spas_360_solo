#!/usr/bin/env python3
"""Extract page-addressable service knowledge from a PDF.

The output intentionally contains text and provenance, not page images. Ari can
answer facts with page citations without becoming a document-reproduction tool.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError as exc:
    raise SystemExit("pypdf is required: python3 -m pip install pypdf") from exc


PART_PATTERNS = (
    re.compile(r"(?<![A-Z0-9])\d{2,5}-\d{3,5}(?![A-Z0-9])", re.I),
    re.compile(r"\b[A-Z]{1,5}-?\d{3,7}\b", re.I),
    re.compile(r"(?<!\d)\d{6}(?!\d)"),
)


def normalize_text(value: str) -> str:
    value = value.replace("\x00", " ").replace("\u00ad", "")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def part_numbers(text: str) -> list[str]:
    found: set[str] = set()
    for pattern in PART_PATTERNS:
        for match in pattern.findall(text.upper()):
            value = re.sub(r"\s+", "", match).strip(".,;:()[]")
            if value.isdigit() and 1900 <= int(value) <= 2100:
                continue
            pieces = value.split("-")
            if len(pieces) == 2 and all(piece.isdigit() and len(piece) == 4 for piece in pieces):
                if all(1900 <= int(piece) <= 2100 for piece in pieces):
                    continue
            found.add(value)
    return sorted(found)


def heading_for(text: str, fallback: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    useful = [line for line in lines[:12] if not re.fullmatch(r"(?:page[- ]?)?\d+", line, re.I)]
    return (useful[0][:180] if useful else fallback)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--title", required=True)
    parser.add_argument("--models-json", default="[]")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    models = json.loads(args.models_json)
    reader = PdfReader(str(args.pdf))
    if reader.is_encrypted:
        reader.decrypt("")

    chunks: list[dict[str, object]] = []
    for page_number, page in enumerate(reader.pages, start=1):
        text = normalize_text(page.extract_text() or "")
        if not text:
            continue
        heading = heading_for(text, f"Page {page_number}")
        chunks.append(
            {
                "chunk_index": len(chunks),
                "heading": heading,
                "content": text,
                "page_start": page_number,
                "page_end": page_number,
                "section_path": [args.title, heading],
                "part_numbers": part_numbers(text),
                "models": models,
                "content_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            }
        )

    if not chunks:
        raise SystemExit("no extractable text found")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"pages": len(reader.pages), "chunks": len(chunks)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
