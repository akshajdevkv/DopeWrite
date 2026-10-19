"""Reconstruct OCR paragraphs from geometry without rewriting recognized words."""
import csv
import io
from collections import OrderedDict
from statistics import median

from PIL import Image, ImageFilter, ImageOps


def clean_scan(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as original:
        image = ImageOps.autocontrast(original.convert('L'), cutoff=0.5)
    # Suppress isolated specks; leave binarization to Tesseract's adaptive method.
    image = image.filter(ImageFilter.MedianFilter(3))
    # Estimate small skew from horizontal ink projections on a cheap thumbnail.
    sample = image.copy()
    sample.thumbnail((700, 700))
    binary = sample.point(lambda value: 0 if value < 170 else 255)

    def score(angle):
        rotated = binary.rotate(angle, expand=False, fillcolor=255)
        counts = [rotated.crop((0, y, rotated.width, y + 1)).histogram()[0] for y in range(rotated.height)]
        rotated.close()
        return sum(count * count for count in counts)

    baseline = score(0)
    angle, best = max(((angle, score(angle)) for angle in (-3, -2.5, -2, -1.5, -1, -.5, 0, .5, 1, 1.5, 2, 2.5, 3)), key=lambda item: item[1])
    if angle and best > baseline * 1.15:
        image = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=255)
    output = io.BytesIO()
    image.save(output, format='PNG')
    image.close(); sample.close(); binary.close()
    return output.getvalue()


def paragraphs_from_tsv(data: str) -> str:
    """Keep engine reading order; join wrapped lines only inside a paragraph.

    Block and paragraph IDs prevent interleaving columns. Geometry prevents a
    large title or a list item sharing a paragraph ID from joining body prose.
    No spelling correction, guessed punctuation, or AI paraphrasing is applied.
    """
    lines = OrderedDict()
    for row in csv.DictReader(io.StringIO(data), delimiter='\t', quoting=csv.QUOTE_NONE):
        if row.get('level') != '5' or not row.get('text', '').strip():
            continue
        try:
            key = tuple(int(row[name]) for name in ('page_num', 'block_num', 'par_num', 'line_num'))
            word = {'text': row['text'].strip(), 'left': int(row['left']), 'top': int(row['top']), 'height': int(row['height'])}
        except (KeyError, TypeError, ValueError):
            continue
        lines.setdefault(key, []).append(word)
    paragraphs = []
    current = []
    previous = None
    for key, words in lines.items():
        text = ' '.join(word['text'] for word in words)
        height = median(word['height'] for word in words)
        top = min(word['top'] for word in words)
        bottom = max(word['top'] + word['height'] for word in words)
        # Lists and standalone math remain separate editable/reference blocks.
        list_item = text.startswith(('• ', '● ', '▪ ', '- ', '* '))
        equation = any(symbol in text for symbol in ('=', '∑', '∫', '√', '≈', '≠', '≤', '≥'))
        separate = previous is not None and (
            key[:3] != previous['key'][:3]
            or max(height, previous['height']) > 1.35 * max(1, min(height, previous['height']))
            or top - previous['bottom'] > 1.2 * max(height, previous['height'])
            or list_item or equation or previous['equation']
        )
        if separate and current:
            paragraphs.append(' '.join(current)); current = []
        current.append(text)
        previous = {'key': key, 'height': height, 'bottom': bottom, 'equation': equation}
    if current:
        paragraphs.append(' '.join(current))
    return '\n\n'.join(paragraphs)
