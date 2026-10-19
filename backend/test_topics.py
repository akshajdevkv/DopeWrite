import json
import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from backend.topics import organize, build_lesson, source_blocks, local_plan, validate_plan

SOURCE = '''Active Recall
Active recall strengthens memory. Keep these EXACT words!
E = mc²
Figure 1: Memory pathways
Spaced Practice
Return to this material tomorrow. Do not change the wording.'''


class TopicTests(unittest.TestCase):
    def test_topics_and_reference_material_are_separate(self):
        blocks = source_blocks(SOURCE)
        lesson = build_lesson(blocks, local_plan(blocks), 'Notes')
        self.assertEqual([s.title for s in lesson.sections], ['Active Recall', 'Spaced Practice'])
        self.assertEqual(lesson.sections[0].text, blocks[1])
        self.assertEqual(lesson.sections[1].text, blocks[5])
        self.assertEqual([r.kind for r in lesson.sections[0].references], ['heading', 'equation', 'diagram'])
        self.assertNotIn('E = mc²', lesson.sections[0].text)
        self.assertEqual(lesson.sections[0].references[1].text, 'E = mc²')

    def test_no_missing_or_duplicate_source_ids_accepted(self):
        blocks = source_blocks(SOURCE)
        plan = local_plan(blocks)
        for invalid in [plan[:-1], plan[::-1], ['invalid']*len(blocks), [plan[0]]*len(blocks)]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_plan(invalid, blocks)

    def test_long_topic_stays_grouped_without_losing_words(self):
        source = 'Topic Heading\n' + ' '.join(f'word-{i},' for i in range(260))
        blocks = source_blocks(source)
        lesson = build_lesson(blocks, local_plan(blocks), 'Notes')
        self.assertEqual(len(lesson.sections), 3)
        self.assertEqual({s.topic_id for s in lesson.sections}, {0})
        self.assertEqual(' '.join(s.text for s in lesson.sections), blocks[1])


class GroqTopicTests(unittest.IsolatedAsyncioTestCase):
    async def test_groq_only_classifies_ids_and_cannot_rewrite(self):
        blocks = source_blocks(SOURCE)
        plan = local_plan(blocks)
        # A model's extra rewritten text is never used to build practice content.
        for item in plan:
            item['text'] = 'This is a rewritten summary.'
        response = httpx.Response(200, request=httpx.Request('POST', 'https://example.com'), json={
            'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({'blocks': plan})}}]})
        with patch.dict(os.environ, {'GROQ_API_KEY':'test'}), patch('backend.topics.httpx.AsyncClient.post', new_callable=AsyncMock, return_value=response):
            result = await organize(SOURCE)
        self.assertEqual(result[2], 'groq')
        lesson = build_lesson(result[0], result[1], 'Notes')
        self.assertEqual(lesson.sections[0].text, blocks[1])
        self.assertNotIn('rewritten summary', lesson.model_dump_json())

    async def test_provider_failure_falls_back_without_blocking_upload(self):
        response = httpx.Response(429, request=httpx.Request('POST', 'https://example.com'))
        with patch.dict(os.environ, {'GROQ_API_KEY':'test'}), patch('backend.topics.httpx.AsyncClient.post', new_callable=AsyncMock, return_value=response):
            blocks, plan, provider, notice = await organize(SOURCE)
        self.assertEqual(provider, 'local')
        self.assertIn('unavailable', notice)
        self.assertEqual(build_lesson(blocks, plan, 'Notes').sections[0].text, blocks[1])
