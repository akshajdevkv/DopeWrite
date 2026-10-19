import json
import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from backend.main import app

SOURCE='Active recall strengthens memory. Spaced practice helps retain ideas over time.'
QUESTIONS=[{'question':'What does active recall strengthen?','source_excerpt':'Active recall strengthens memory.'},
 {'question':'How does spaced practice help learning?','source_excerpt':'Spaced practice helps retain ideas over time.'}]


def provider_response(questions=QUESTIONS,status=200):
    return httpx.Response(status,request=httpx.Request('POST','https://api.groq.com/openai/v1/chat/completions'),json={
        'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'questions':questions})}}]})


class RecallTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)

    def generate(self,questions=QUESTIONS,status=200):
        with patch.dict(os.environ,{'GROQ_API_KEY':'test'}),patch('backend.recall.httpx.AsyncClient.post',new_callable=AsyncMock,return_value=provider_response(questions,status)):
            return self.client.post('/api/recall-questions',json={'title':'Memory','source':SOURCE})

    def test_questions_are_grounded_in_only_selected_section(self):
        with patch.dict(os.environ,{'GROQ_API_KEY':'test'}),patch('backend.recall.httpx.AsyncClient.post',new_callable=AsyncMock,return_value=provider_response()) as post:
            result=self.client.post('/api/recall-questions',json={'title':'Memory','source':SOURCE})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['questions'],QUESTIONS)
        sent=post.call_args.kwargs['json']['messages']
        self.assertEqual(json.loads(sent[1]['content']),{'title':'Memory','source':SOURCE})
        self.assertIn('ONLY this section',sent[0]['content'])

    def test_invented_answer_evidence_is_rejected(self):
        result=self.generate([{'question':'What is a neuron?','source_excerpt':'Neurons are cells in the brain.'}])
        self.assertEqual(result.status_code,502)
        self.assertNotIn('questions',result.json())

    def test_duplicate_questions_are_rejected(self):
        self.assertEqual(self.generate([QUESTIONS[0],QUESTIONS[0]]).status_code,502)

    def test_whitespace_only_evidence_is_rejected(self):
        result=self.generate([{'question':'What is recalled?','source_excerpt':'     '}])
        self.assertEqual(result.status_code,502)

    def test_quota_failure_is_actionable(self):
        result=self.generate(status=429)
        self.assertEqual(result.status_code,429)
        self.assertIn('rate limit',result.json()['detail'])

    def test_blank_or_missing_section_is_rejected(self):
        for source in ['', '   ']:
            result=self.client.post('/api/recall-questions',json={'title':'Memory','source':source})
            self.assertEqual(result.status_code,422)

    def test_missing_key_is_actionable(self):
        with patch.dict(os.environ,{},clear=True):
            result=self.client.post('/api/recall-questions',json={'title':'Memory','source':SOURCE})
        self.assertEqual(result.status_code,503)
        self.assertIn('GROQ_API_KEY on the FastAPI backend',result.json()['detail'])

    def test_answer_assessment_is_question_specific(self):
        response=httpx.Response(200,request=httpx.Request('POST','https://example.com'),json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'accuracy':100,'coverage':100,'summary':'Correct.','strengths':['Memory identified.'],'missing':[],'incorrect':[]})}}]})
        with patch.dict(os.environ,{'GROQ_API_KEY':'test'}),patch('backend.evaluation.httpx.AsyncClient.post',new_callable=AsyncMock,return_value=response) as post:
            result=self.client.post('/api/evaluate',json={'question':QUESTIONS[0]['question'],'source':QUESTIONS[0]['source_excerpt'],'response':'It strengthens your memory.'})
        self.assertEqual(result.status_code,200)
        sent=post.call_args.kwargs['json']['messages']
        self.assertEqual(json.loads(sent[1]['content'])['question'],QUESTIONS[0]['question'])
        self.assertIn('do not penalize omission',sent[0]['content'])
