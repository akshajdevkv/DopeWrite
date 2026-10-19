"""Repair extraction whitespace, never words, and reject unusable fragmentation."""
import re


def is_fragmented(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    # A page of isolated word blocks is not usable study prose. Short outlines
    # stay editable; longer reference lists may conservatively need manual input.
    return len(lines) >= 10 and sum(len(line.split()) <= 1 for line in lines) / len(lines) >= .6


def layout_paragraphs(text: str) -> str:
    """Reflow visual rows, preserving blank-line and title/list boundaries.

    This changes whitespace only. It cannot infer semantic topic boundaries.
    """
    paragraphs = []
    current = []

    def flush():
        if current:
            paragraphs.append(' '.join(current)); current.clear()

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            flush(); continue
        title = len(line.split()) <= 12 and (line.isupper() or line.istitle()) and not re.search(r'[.!?;,]$', line)
        reference = bool(re.search(r'[=∑∫√≈≠≤≥]', line))
        list_item = bool(re.match(r'^(?:[•●▪*-]|\d+[.)])\s', line))
        if title or reference or list_item:
            flush()
        current.append(' '.join(line.split()))
        if title or reference:
            flush()
    flush()
    return '\n\n'.join(paragraphs)
