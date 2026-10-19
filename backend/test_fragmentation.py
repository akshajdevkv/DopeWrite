import subprocess
import io
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pypdf._page import PageObject
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, DecodedStreamObject

from backend.main import app
from backend.pdf_text import ocr_page, tesseract_command
from backend.test_api import pdf_bytes
from backend.test_ocr import scanned_pdf
from backend.text_layout import is_fragmented, layout_paragraphs

PHRASE = ('Analysis of medical data, identifying complex patterns, and automating repetitive processes, '
          'these technologies can support healthcare professionals and improve patient care.')
SCATTERED = '\n\n'.join(PHRASE.split())


def bad_layer_pdf():
    """Real scanned PDF with an invisible, word-per-line OCR text layer."""
    writer = PdfWriter()
    writer.add_page(PdfReader(io.BytesIO(scanned_pdf())).pages[0])
    page = writer.pages[0]
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page['/Resources'][NameObject('/Font')] = DictionaryObject({NameObject('/F1'): writer._add_object(font)})
    stream = DecodedStreamObject()
    stream.set_data(('q BT /F1 12 Tf 3 Tr 30 300 Td (' + SCATTERED + ') Tj ET Q').encode())
    page[NameObject('/Contents')] = ArrayObject([page.raw_get('/Contents'), writer._add_object(stream)])
    output = io.BytesIO(); writer.write(output)
    return output.getvalue()


class FragmentationTests(unittest.TestCase):
    def test_screenshot_pattern_is_detected(self):
        self.assertTrue(is_fragmented(SCATTERED))
        self.assertFalse(is_fragmented(PHRASE))
        self.assertFalse(is_fragmented('Overview\nMethods\nResults'))

    def test_native_word_per_line_layer_is_recovered_before_editor(self):
        layout = ('MEDICAL APPLICATIONS\n\nAnalysis of medical data, identifying complex patterns, and\n'
                  'automating repetitive processes, these technologies can support\n'
                  'healthcare professionals and improve patient care.')
        def extraction(page, *args, **kwargs):
            return layout if kwargs.get('extraction_mode') == 'layout' else 'MEDICAL APPLICATIONS\n\n' + SCATTERED
        with patch.object(PageObject, 'extract_text', extraction), patch('backend.pdf_text.ocr_page') as ocr:
            response = TestClient(app).post('/api/prepare', files={'file': ('fragmented.pdf', pdf_bytes())})
        self.assertEqual(response.status_code, 200, response.text)
        blocks = response.json()['blocks']
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0]['kind'], 'heading')
        self.assertEqual(blocks[1]['text'], PHRASE)
        ocr.assert_not_called()

    @unittest.skipUnless(tesseract_command(), 'Tesseract is not installed')
    def test_bad_existing_ocr_layer_retries_from_visible_page(self):
        data = bad_layer_pdf()
        self.assertTrue(is_fragmented(PdfReader(io.BytesIO(data)).pages[0].extract_text()))
        response = TestClient(app).post('/api/prepare', files={'file': ('bad-layer.pdf', data)})
        self.assertEqual(response.status_code, 200, response.text)
        words = ' '.join(block['text'] for block in response.json()['blocks'])
        self.assertIn('Active recall strengthens memory.', words)
        self.assertNotIn('patient care', words)

    def test_still_fragmented_ocr_is_rejected_instead_of_displayed(self):
        with patch('backend.pdf_text.tesseract_command', return_value='tesseract'), patch('backend.pdf_text.render_page', return_value=b'image'), patch('backend.pdf_text.clean_scan', return_value=b'image'), patch('backend.pdf_text.subprocess.run', return_value=subprocess.CompletedProcess([], 0, b'tsv', b'')), patch('backend.pdf_text.paragraphs_from_tsv', return_value=SCATTERED):
            response = TestClient(app).post('/api/prepare', files={'file': ('scan.pdf', scanned_pdf())})
        self.assertEqual(response.status_code, 422)
        self.assertIn('isolated words', response.json()['detail'])
        self.assertNotIn('blocks', response.json())

    def test_reflow_does_not_rewrite_words(self):
        text='A MEDICAL TOPIC\n\nKeep these EXACT\nwords, punctuation, and 42%.\n\nE = mc2'
        self.assertEqual(layout_paragraphs(text), 'A MEDICAL TOPIC\n\nKeep these EXACT words, punctuation, and 42%.\n\nE = mc2')

if __name__ == '__main__':
    unittest.main()
