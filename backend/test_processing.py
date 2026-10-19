import json
import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from backend.main import app
from backend.topics import local_plan

BLOCKS = ['Active Recall', 'Remember these EXACT phrases. Keep the punctuation!', 'Spaced Practice', 'Return to study tomorrow.']


def response_for(proposal, status=200):
    return httpx.Response(status,request=httpx.Request('POST','https://api.groq.com/openai/v1/chat/completions'),json={
        'choices':[{'finish_reason':'stop','message':{'content':json.dumps(proposal)}}]})


class ProcessingTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)
        self.payload={'scope':'section','title':'Notes','source_blocks':BLOCKS,'processing_plan':local_plan(BLOCKS),'words_per_passage':120,
            'messages':[{'role':'user','content':'Merge topics into one and make passages 60 words.'}]}

    def submit(self, proposal, status=200):
        with patch.dict(os.environ,{'GROQ_API_KEY':'test'}),patch('backend.processing.httpx.AsyncClient.post',new_callable=AsyncMock,return_value=response_for(proposal,status)):
            return self.client.post('/api/processing-chat',json=self.payload)

    def test_merge_applies_without_rewriting_or_losing_source(self):
        plan=local_plan(BLOCKS)
        for item in plan:
            item['new_topic']=False
            item['text']='Invented AI summary must never be typed.'
        plan[0]['topic_title']='Memory skills'
        response=self.submit({'reply':'Merged the topics.','apply':True,'blocks':plan,'words_per_passage':60})
        self.assertEqual(response.status_code,200)
        result=response.json()
        self.assertTrue(result['applied'])
        lesson=result['lesson']
        self.assertEqual(len(lesson['sections']),1)
        self.assertEqual(lesson['sections'][0]['title'],'Memory skills')
        self.assertEqual(lesson['sections'][0]['text'],BLOCKS[1]+' '+BLOCKS[3])
        self.assertEqual(lesson['source_blocks'],BLOCKS)
        self.assertEqual(lesson['words_per_passage'],60)

    def test_can_include_a_heading_and_exclude_prose(self):
        plan=local_plan(BLOCKS)
        plan[0]['kind']='body';plan[1]['kind']='ignore'
        response=self.submit({'reply':'Changed inclusion.','apply':True,'blocks':plan,'words_per_passage':120})
        self.assertEqual(response.status_code,200)
        texts=' '.join(s['text'] for s in response.json()['lesson']['sections'])
        self.assertIn('Active Recall',texts)
        self.assertNotIn(BLOCKS[1],texts)
        self.assertEqual(response.json()['lesson']['source_blocks'],BLOCKS)

    def test_question_does_not_mutate_lesson(self):
        response=self.submit({'reply':'Headings are reference-only by default.','apply':False})
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.json()['applied'])
        self.assertIsNone(response.json()['lesson'])

    def test_invalid_or_incomplete_plan_cannot_apply(self):
        response=self.submit({'reply':'Done','apply':True,'blocks':local_plan(BLOCKS)[:-1]})
        self.assertEqual(response.status_code,502)
        self.assertIn('unchanged',response.json()['detail'])

    def test_quota_error_leaves_document_unchanged(self):
        response=self.submit({},429)
        self.assertEqual(response.status_code,429)
        self.assertIn('unchanged',response.json()['detail'])

    def test_compact_length_edit_preserves_existing_plan(self):
        self.payload['words_per_passage']=120
        response=self.submit({'reply':'Shorter passages.','apply':True,'operations':[],'words_per_passage':60})
        self.assertEqual(response.status_code,200)
        lesson=response.json()['lesson']
        self.assertEqual(lesson['words_per_passage'],60)
        self.assertEqual(lesson['processing_plan'],self.payload['processing_plan'])
        self.assertEqual(lesson['source_blocks'],BLOCKS)

    def test_compact_operations_apply_to_all_matching_blocks(self):
        response=self.submit({'reply':'Headings included.','apply':True,'operations':[
            {'action':'set_blocks','selector':{'kinds':['heading']},'set':{'kind':'body'}}]})
        self.assertEqual(response.status_code,200)
        prose=' '.join(s['text'] for s in response.json()['lesson']['sections'])
        self.assertIn('Active Recall',prose)
        self.assertIn('Spaced Practice',prose)

    def test_token_limit_retries_with_smaller_context(self):
        proposal={'reply':'Updated passage length.','apply':True,'operations':[],'words_per_passage':60}
        with patch.dict(os.environ,{'GROQ_API_KEY':'test'}),patch('backend.processing.httpx.AsyncClient.post',new_callable=AsyncMock,side_effect=[response_for({},413),response_for(proposal)]) as post:
            response=self.client.post('/api/processing-chat',json=self.payload)
        self.assertEqual(response.status_code,200)
        self.assertEqual(post.call_count,2)

    def test_repeated_token_limit_is_actionable(self):
        response=self.submit({},413)
        self.assertEqual(response.status_code,413)
        self.assertIn('token limit',response.json()['detail'])

    def test_unknown_ids_cannot_apply(self):
        response=self.submit({'reply':'Updated.','apply':True,'operations':[
            {'action':'set_blocks','selector':{'ids':[9999]},'set':{'kind':'ignore'}}]})
        self.assertEqual(response.status_code,502)
        self.assertIn('unchanged',response.json()['detail'])

    def test_large_document_context_is_bounded(self):
        from backend.processing import ProcessingRequest,compact_context
        blocks=['Learning Topic '+str(i) if i%5==0 else 'Original words. '*30 for i in range(100)]
        request=ProcessingRequest(scope='section',title='Large',source_blocks=blocks,processing_plan=local_plan(blocks),messages=[{'role':'user','content':'Make passages 60 words'}])
        self.assertLess(len(json.dumps(compact_context(request),ensure_ascii=False)),9500)
        self.assertEqual(request.source_blocks,blocks)

    def test_scope_is_required_to_prevent_legacy_document_requests(self):
        self.payload.pop('scope')
        with patch('backend.processing.httpx.AsyncClient.post',new_callable=AsyncMock) as post:
            response=self.client.post('/api/processing-chat',json=self.payload)
        self.assertEqual(response.status_code,422)
        post.assert_not_called()

    def test_only_selected_section_is_sent_to_groq(self):
        self.payload['title']='Selected passage'
        self.payload['source_blocks']=['Selected passage','Only this selected text is accessible.']
        self.payload['processing_plan']=local_plan(self.payload['source_blocks'])
        proposal={'reply':'Changed selected passage.','apply':True,'operations':[],'words_per_passage':60}
        with patch.dict(os.environ,{'GROQ_API_KEY':'test'}),patch('backend.processing.httpx.AsyncClient.post',new_callable=AsyncMock,return_value=response_for(proposal)) as post:
            response=self.client.post('/api/processing-chat',json=self.payload)
        self.assertEqual(response.status_code,200)
        sent=json.dumps(post.call_args.kwargs['json'])
        self.assertIn('Only this selected text is accessible.',sent)
        self.assertNotIn('Remember these EXACT phrases',sent)
        self.assertNotIn('Return to study tomorrow',sent)
        self.assertIn('currently selected section',sent)
        self.assertIn('TYPING EXERCISE',sent)
        self.assertIn('source panel are immutable',sent)
        self.assertEqual(response.json()['lesson']['source_blocks'],self.payload['source_blocks'])

    def test_missing_key_is_actionable(self):
        with patch.dict(os.environ,{},clear=True):
            response=self.client.post('/api/processing-chat',json=self.payload)
        self.assertEqual(response.status_code,503)
        self.assertIn('GROQ_API_KEY',response.json()['detail'])

    def test_invalid_request_rejected_before_provider(self):
        self.payload['words_per_passage']=0
        response=self.client.post('/api/processing-chat',json=self.payload)
        self.assertEqual(response.status_code,422)
