"""Local PDF extraction, with bounded OCR for pages without selectable text."""
import io
import math
import os
import shutil
import subprocess
import threading
import time
from collections import Counter

import pypdfium2 as pdfium
from fastapi import HTTPException
from pypdf import PdfReader, PdfWriter
from backend.ocr_layout import clean_scan, paragraphs_from_tsv
from backend.text_layout import is_fragmented, layout_paragraphs

# PDFium is not thread safe, including across separate documents.
_render_lock = threading.Lock()
OCR_DOCUMENT_SECONDS = 110
OCR_PAGE_SECONDS = 30
MAX_RENDER_PIXELS = 12_000_000


def tesseract_command():
    return shutil.which(os.getenv('TESSERACT_CMD', 'tesseract'))


def render_page(page) -> bytes:
    """Render only this page, in memory, with bounded raster dimensions."""
    writer = PdfWriter()
    writer.add_page(page)
    data = io.BytesIO()
    writer.write(data)
    with _render_lock:
        with pdfium.PdfDocument(data.getvalue()) as document:
            rendered_page = document[0]
            try:
                width, height = rendered_page.get_size()
                if not math.isfinite(width * height) or min(width, height) <= 0:
                    raise ValueError('Invalid PDF page dimensions')
                scale = min(300 / 72, math.sqrt(MAX_RENDER_PIXELS / (width * height)), 6000 / max(width, height))
                bitmap = rendered_page.render(scale=scale)
                try:
                    image = bitmap.to_pil()
                    try:
                        output = io.BytesIO()
                        image.save(output, format='PNG')
                        return output.getvalue()
                    finally:
                        image.close()
                finally:
                    bitmap.close()
            finally:
                rendered_page.close()


def ocr_page(page, number: int, deadline: float) -> str:
    command = tesseract_command()
    if not command:
        raise HTTPException(503, 'Scanned PDF pages need Tesseract OCR on the backend. Install tesseract and restart the backend, or set TESSERACT_CMD to its executable.')
    try:
        image = clean_scan(render_page(page))
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired(command, OCR_DOCUMENT_SECONDS)
        result = subprocess.run(
            [command, 'stdin', 'stdout', '-l', os.getenv('OCR_LANGUAGES', 'eng'),
             '--psm', '1', '-c', 'thresholding_method=2', 'tsv'],
            input=image, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=min(OCR_PAGE_SECONDS, remaining), check=False,
            env={**os.environ, 'OMP_THREAD_LIMIT': '1'},
        )
        if result.returncode:
            raise HTTPException(422, f'OCR could not read PDF page {number}. Check that OCR_LANGUAGES matches installed Tesseract language data, or try a clearer scan.')
        text = paragraphs_from_tsv(result.stdout.decode('utf-8', errors='replace'))
        if is_fragmented(text):
            raise HTTPException(422, f'PDF page {number} could not be reconstructed into readable paragraphs. OCR produced isolated words, so this upload was stopped. Use a text-based PDF or paste corrected text in the editor.')
        return text
    except subprocess.TimeoutExpired:
        raise HTTPException(504, f'OCR timed out on PDF page {number}. Split the PDF into smaller files and try again.')
    except HTTPException:
        raise
    except OSError:
        raise HTTPException(503, 'The OCR engine could not start. Check TESSERACT_CMD and restart the backend.')


def has_image(page) -> bool:
    resources = page.get('/Resources', {})
    if hasattr(resources, 'get_object'):
        resources = resources.get_object()
    objects = resources.get('/XObject', {})
    if hasattr(objects, 'get_object'):
        objects = objects.get_object()
    return any(obj.get_object().get('/Subtype') == '/Image' for obj in objects.values())


def extract_pdf(data: bytes, max_text: int) -> str:
    if not data.startswith(b'%PDF-'):
        raise HTTPException(422, 'This file is not a valid PDF.')
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(''):
            raise HTTPException(422, 'This PDF is password-protected. Upload an unlocked copy.')
        parts = []
        size = 0
        readable = False
        deadline = time.monotonic() + OCR_DOCUMENT_SECONDS
        for number, page in enumerate(reader.pages, 1):
            try:
                text = (page.extract_text() or '').strip()
            except Exception:
                text = ''  # Unusable text layers can still be read visually.
            if is_fragmented(text):
                # Existing OCR layers often have one word per text operation.
                # Recover visual rows before accepting that layer as readable.
                try:
                    layout = page.extract_text(extraction_mode='layout') or ''
                    if layout.strip() and not is_fragmented(layout) and Counter(layout.split()) == Counter(text.split()):
                        text = layout_paragraphs(layout)
                except Exception:
                    pass
            used_ocr = not text or is_fragmented(text) or text.count('\ufffd') > len(text) / 5
            if used_ocr:
                text = ocr_page(page, number, deadline)
            if is_fragmented(text):
                raise HTTPException(422, f'PDF page {number} contains isolated words instead of readable paragraphs. This extraction was discarded. Upload a clearer or text-based PDF.')
            if text:
                readable = True
                additions = [text]
            else:
                additions = []  # Blank pages no longer reject the document.
            # A scan is itself an image; do not mistake it for a separate diagram.
            if not used_ocr and has_image(page):
                additions.append(f'[Diagram/image on PDF page {number}; view the original document]')
            for part in additions:
                size += len(part) + (2 if parts else 0)
                if size > max_text:
                    raise HTTPException(413, 'This document has too much text for one session. Split it into smaller files.')
                parts.append(part)
        if not readable:
            raise HTTPException(422, 'No readable text was found, including after OCR. Try a clearer scan or a PDF containing printed text.')
        return '\n\n'.join(parts)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, 'Could not read this PDF. Upload a valid, unlocked PDF with selectable text or clear scanned pages.')
