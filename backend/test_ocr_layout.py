import io
import unittest

from PIL import Image
from backend.ocr_layout import clean_scan, paragraphs_from_tsv

HEADER = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'


def line(text, block, paragraph, number, top, height=20, left=30):
    return ''.join(f'5\t1\t{block}\t{paragraph}\t{number}\t{i}\t{left+i*50}\t{top}\t45\t{height}\t95\t{word}\n' for i, word in enumerate(text.split(), 1))


class LayoutTests(unittest.TestCase):
    def test_wrapped_prose_is_one_paragraph_without_rewriting(self):
        data = HEADER + line('Keep these EXACT', 1, 1, 1, 20) + line('words, and punctuation!', 1, 1, 2, 48)
        self.assertEqual(paragraphs_from_tsv(data), 'Keep these EXACT words, and punctuation!')

    def test_columns_and_paragraphs_are_not_interleaved(self):
        data = HEADER + line('Left column starts', 1, 1, 1, 20) + line('and finishes.', 1, 1, 2, 48)
        data += line('Next paragraph.', 1, 2, 1, 90) + line('Right column starts', 2, 1, 1, 20, left=500) + line('and finishes.', 2, 1, 2, 48, left=500)
        self.assertEqual(paragraphs_from_tsv(data), 'Left column starts and finishes.\n\nNext paragraph.\n\nRight column starts and finishes.')

    def test_large_heading_and_equations_stay_separate(self):
        data = HEADER + line('HEADING', 1, 1, 1, 10, height=40) + line('Ordinary prose here.', 1, 1, 2, 60)
        data += line('E = mc2', 1, 1, 3, 90) + line('Following prose.', 1, 1, 4, 120)
        self.assertEqual(paragraphs_from_tsv(data), 'HEADING\n\nOrdinary prose here.\n\nE = mc2\n\nFollowing prose.')

    def test_list_items_keep_boundaries(self):
        data = HEADER + line('Introductory text.', 1, 1, 1, 10) + line('• First item', 1, 1, 2, 40) + line('• Second item', 1, 1, 3, 70)
        self.assertEqual(paragraphs_from_tsv(data), 'Introductory text.\n\n• First item\n\n• Second item')

    def test_blank_scan_is_still_blank_after_cleanup(self):
        image = Image.new('RGB', (400, 500), 'white'); data = io.BytesIO(); image.save(data, format='PNG')
        with Image.open(io.BytesIO(clean_scan(data.getvalue()))) as result:
            self.assertEqual(result.getextrema(), (255, 255))

if __name__ == '__main__':
    unittest.main()
