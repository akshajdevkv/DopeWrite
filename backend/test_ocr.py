import io
import subprocess
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter

from backend.main import app
from backend.pdf_text import extract_pdf, ocr_page, render_page, tesseract_command
from backend.test_api import pdf_bytes


def scanned_pdf():
    image = Image.new('RGB', (1400, 700), 'white')
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=40)
    draw.text((80, 80), 'MEMORY AND LEARNING', fill='black', font=font)
    draw.text((80, 180), 'Active recall strengthens memory.', fill='black', font=font)
    draw.text((80, 260), 'Practice helps us remember exact phrases.', fill='black', font=font)
    output = io.BytesIO()
    image.save(output, format='PDF', resolution=150)
    image.close()
    return output.getvalue()


class OCRTests(unittest.TestCase):
    def test_selectable_text_never_calls_ocr(self):
        with patch('backend.pdf_text.ocr_page') as ocr:
            self.assertEqual(extract_pdf(pdf_bytes('Keep EXACT words!'), 45000), 'Keep EXACT words!')
        ocr.assert_not_called()

    def test_mixed_document_preserves_order_and_skips_blank_pages(self):
        writer = PdfWriter()
        writer.add_page(PdfReader(io.BytesIO(pdf_bytes('Native first.'))).pages[0])
        writer.add_blank_page(width=400, height=400)
        writer.add_page(PdfReader(io.BytesIO(scanned_pdf())).pages[0])
        output = io.BytesIO(); writer.write(output)
        with patch('backend.pdf_text.ocr_page', side_effect=['', 'Scanned final.']) as ocr:
            self.assertEqual(extract_pdf(output.getvalue(), 45000), 'Native first.\n\nScanned final.')
        self.assertEqual([call.args[1] for call in ocr.call_args_list], [2, 3])

    def test_ocr_text_obeys_existing_character_cap(self):
        with patch('backend.pdf_text.ocr_page', return_value='x' * 101):
            with self.assertRaises(HTTPException) as error:
                extract_pdf(pdf_bytes(''), 100)
        self.assertEqual(error.exception.status_code, 413)

    def test_missing_engine_has_actionable_error(self):
        with patch('backend.pdf_text.tesseract_command', return_value=None):
            response = TestClient(app).post('/api/prepare', files={'file': ('scan.pdf', scanned_pdf())})
        self.assertEqual(response.status_code, 503)
        self.assertIn('Tesseract', response.json()['detail'])

    def test_ocr_timeout_is_not_reported_as_corrupt_pdf(self):
        with patch('backend.pdf_text.tesseract_command', return_value='tesseract'), patch('backend.pdf_text.render_page', return_value=b'image'), patch('backend.pdf_text.clean_scan', return_value=b'image'), patch('backend.pdf_text.subprocess.run', side_effect=subprocess.TimeoutExpired('tesseract', 30)):
            response = TestClient(app).post('/api/prepare', files={'file': ('scan.pdf', scanned_pdf())})
        self.assertEqual(response.status_code, 504)
        self.assertIn('Split', response.json()['detail'])

    def test_engine_failure_does_not_silently_drop_a_scan(self):
        with patch('backend.pdf_text.tesseract_command', return_value='tesseract'), patch('backend.pdf_text.render_page', return_value=b'image'), patch('backend.pdf_text.clean_scan', return_value=b'image'), patch('backend.pdf_text.subprocess.run', return_value=subprocess.CompletedProcess([], 1, b'', b'language missing')):
            with self.assertRaises(HTTPException) as error:
                ocr_page(None, 4, time.monotonic() + 30)
        self.assertIn('page 4', error.exception.detail)
        self.assertIn('OCR_LANGUAGES', error.exception.detail)

    def test_all_blank_pages_have_clear_error(self):
        with patch('backend.pdf_text.ocr_page', return_value=''):
            with self.assertRaises(HTTPException) as error:
                extract_pdf(pdf_bytes(''), 45000)
        self.assertEqual(error.exception.status_code, 422)
        self.assertIn('after OCR', error.exception.detail)

    def test_password_protection_still_rejected(self):
        writer = PdfWriter(); writer.add_blank_page(width=400, height=400); writer.encrypt('secret')
        output = io.BytesIO(); writer.write(output)
        with self.assertRaises(HTTPException) as error:
            extract_pdf(output.getvalue(), 45000)
        self.assertIn('password-protected', error.exception.detail)

    @unittest.skipUnless(tesseract_command(), 'Tesseract is not installed')
    def test_real_scan_upload_opens_editable_blocks_without_ai(self):
        with patch('httpx.AsyncClient.post') as ai:
            response = TestClient(app).post('/api/prepare', files={'file': ('scanned-notes.pdf', scanned_pdf())})
        self.assertEqual(response.status_code, 200, response.text)
        text = '\n'.join(block['text'] for block in response.json()['blocks'])
        self.assertIn('Active recall strengthens memory.', text)
        self.assertIn('Practice helps us remember exact phrases.', text)
        self.assertNotIn('[Diagram/image', text)
        ai.assert_not_called()


if __name__ == '__main__':
    unittest.main()
