import json
import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from backend.main import app

SOURCE = 'Water freezes at zero degrees Celsius. Ice is less dense than liquid water.'


def provider_response(status=200, **changes):
    assessment = {'accuracy':100,'coverage':100,'summary':'Both key facts are correct.',
        'strengths':['Correct freezing point and density.'],'missing':[],'incorrect':[]}
    assessment.update(changes)
    return httpx.Response(status, request=httpx.Request('POST','https://api.groq.com/openai/v1/chat/completions'), json={
        'choices':[{'finish_reason':'stop','message':{'content':json.dumps(assessment)}}]})


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def submit(self, response, source=SOURCE):
        return self.client.post('/api/evaluate', json={'source':source,'response':response})

    def test_complete_match_uses_whole_text_without_api(self):
        with patch.dict(os.environ, {}, clear=True), patch('backend.evaluation.httpx.AsyncClient.post', new_callable=AsyncMock) as post:
            result = self.submit(SOURCE.replace('. ', '.\n\n'))
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['score'],100)
        self.assertEqual(result.json()['method'],'exact')
        post.assert_not_called()

    def test_paraphrase_is_submitted_for_meaning_assessment(self):
        paraphrase = 'At 0 Celsius, water turns solid; liquid water is denser than ice.'
        with patch.dict(os.environ, {'GROQ_API_KEY':'test'}), patch('backend.evaluation.httpx.AsyncClient.post', new_callable=AsyncMock, return_value=provider_response()) as post:
            result = self.submit(paraphrase)
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['score'],100)
        payload = post.call_args.kwargs['json']
        self.assertEqual(json.loads(payload['messages'][1]['content']), {'source':SOURCE,'response':paraphrase})
        self.assertIn('correct paraphrases',payload['messages'][0]['content'])

    def test_score_combines_facts_and_coverage_and_returns_corrections(self):
        with patch.dict(os.environ, {'GROQ_API_KEY':'test'}), patch('backend.evaluation.httpx.AsyncClient.post', new_callable=AsyncMock, return_value=provider_response(accuracy=20,coverage=50,incorrect=['Water freezes at 0 C, not 50 C.'],missing=['Ice has lower density.'])):
            result = self.submit('Water freezes at 50 degrees Celsius.')
        self.assertEqual(result.json()['score'],32)
        self.assertEqual(len(result.json()['incorrect']),1)
        self.assertEqual(len(result.json()['missing']),1)

    def test_blank_or_oversized_submission_is_rejected(self):
        for response in ['', '   ', 'a'*30001]:
            self.assertEqual(self.submit(response).status_code,422)

    def test_provider_failure_never_fabricates_score(self):
        with patch.dict(os.environ, {'GROQ_API_KEY':'test'}), patch('backend.evaluation.httpx.AsyncClient.post', new_callable=AsyncMock, return_value=provider_response(429)):
            result = self.submit('A different response.')
        self.assertEqual(result.status_code,429)
        self.assertNotIn('score',result.json())
        self.assertIn('kept',result.json()['detail'])

    def test_out_of_range_model_score_is_rejected(self):
        with patch.dict(os.environ, {'GROQ_API_KEY':'test'}), patch('backend.evaluation.httpx.AsyncClient.post', new_callable=AsyncMock, return_value=provider_response(accuracy=200)):
            result = self.submit('Different text.')
        self.assertEqual(result.status_code,502)
        self.assertNotIn('score',result.json())

    def test_nonidentical_text_needs_key(self):
        with patch.dict(os.environ, {}, clear=True):
            result = self.submit('A paraphrase.')
        self.assertEqual(result.status_code,503)
        self.assertIn('GROQ_API_KEY', result.json()['detail'])
