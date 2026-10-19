import os
import unittest
from unittest.mock import AsyncMock,patch
import httpx
from fastapi.testclient import TestClient
from backend.main import app


class SupabaseAuthTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)
        self.env=patch.dict(os.environ,{'SUPABASE_URL':'','SUPABASE_PUBLISHABLE_KEY':'','NEXT_PUBLIC_SUPABASE_URL':'https://project.supabase.co','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY':'public-test-key','DODO_PAYMENTS_ENVIRONMENT':'test_mode','DODO_PAYMENTS_PRODUCT_ID':'pdt_test','NODE_ENV':'development'})
        self.env.start();self.addCleanup(self.env.stop)

    def test_api_rejects_missing_token(self):
        response=self.client.post('/api/review',json={})
        self.assertEqual(response.status_code,401)

    def test_api_rejects_invalid_token(self):
        result=httpx.Response(401,request=httpx.Request('GET','https://project.supabase.co/auth/v1/user'))
        with patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,return_value=result):
            response=self.client.post('/api/review',headers={'Authorization':'Bearer invalid-token'},json={})
        self.assertEqual(response.status_code,401)

    def test_validated_user_can_process_document(self):
        result=httpx.Response(200,json={'id':'user-one'},request=httpx.Request('GET','https://project.supabase.co/auth/v1/user'))
        paid=httpx.Response(200,json=[{'payment_id':'pay_test'}])
        with patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,side_effect=[result,paid]) as provider:
            response=self.client.post('/api/review',headers={'Authorization':'Bearer valid-token'},json={'title':'Private notes','blocks':[{'kind':'body','text':'Active recall strengthens memory.'}]})
        self.assertEqual(response.status_code,200)
        self.assertEqual(provider.call_args.kwargs['headers']['Authorization'],'Bearer valid-token')
        self.assertEqual(provider.call_args.kwargs['headers']['apikey'],'public-test-key')
        self.assertEqual(provider.call_args.kwargs['params']['owner_id'],'eq.user-one')

    def test_signed_in_unpaid_account_cannot_process(self):
        user=httpx.Response(200,json={'id':'user-one'})
        with patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,side_effect=[user,httpx.Response(200,json=[])]):
            response=self.client.post('/api/review',headers={'Authorization':'Bearer valid-token'},json={})
        self.assertEqual(response.status_code,402)

    def test_billing_failure_is_closed(self):
        user=httpx.Response(200,json={'id':'user-one'})
        with patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,side_effect=[user,httpx.Response(500,json={})]):
            response=self.client.post('/api/review',headers={'Authorization':'Bearer valid-token'},json={})
        self.assertEqual(response.status_code,503)

    def test_test_purchase_cannot_unlock_production(self):
        with patch.dict(os.environ,{'NODE_ENV':'production'}),patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,return_value=httpx.Response(200,json={'id':'user-one'})) as provider:
            response=self.client.post('/api/review',headers={'Authorization':'Bearer valid-token'},json={})
        self.assertEqual(response.status_code,402)
        self.assertEqual(provider.call_count,1)

    def test_auth_service_failure_does_not_allow_processing(self):
        with patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,side_effect=httpx.ConnectError('offline')):
            response=self.client.post('/api/review',headers={'Authorization':'Bearer any-token'},json={})
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json()['code'],'BACKEND_SUPABASE_UNREACHABLE')
        self.assertEqual(response.json()['stage'],'backend_identity')

    def test_wrong_project_url_is_actionable(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://project.supabase.co/dashboard/project/private'}),patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock) as provider:
            response=self.client.post('/api/recall-questions',headers={'Authorization':'Bearer valid-token'},json={})
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json()['code'],'BACKEND_SUPABASE_URL_INVALID')
        self.assertNotIn('private',response.text)
        provider.assert_not_called()

    def test_auth_provider_error_does_not_expose_payload(self):
        result=httpx.Response(404,json={'secret':'never-display-provider-payload'})
        with patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,return_value=result):
            response=self.client.post('/api/recall-questions',headers={'Authorization':'Bearer valid-token'},json={})
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json()['code'],'BACKEND_AUTH_PROVIDER_ERROR')
        self.assertIn('HTTP 404',response.json()['detail'])
        self.assertNotIn('never-display',response.text)

    def test_non_json_auth_response_is_actionable(self):
        with patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,return_value=httpx.Response(200,text='<html>not Supabase</html>')):
            response=self.client.post('/api/recall-questions',headers={'Authorization':'Bearer valid-token'},json={})
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json()['code'],'BACKEND_SUPABASE_INVALID_RESPONSE')

    def test_backend_specific_variables_take_precedence(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://backend-project.supabase.co','SUPABASE_PUBLISHABLE_KEY':'backend-public-key'}),patch('backend.auth.httpx.AsyncClient.get',new_callable=AsyncMock,return_value=httpx.Response(401)) as provider:
            response=self.client.post('/api/recall-questions',headers={'Authorization':'Bearer valid-token'},json={})
        self.assertEqual(response.status_code,401)
        self.assertEqual(provider.call_args.args[0],'https://backend-project.supabase.co/auth/v1/user')
        self.assertEqual(provider.call_args.kwargs['headers']['apikey'],'backend-public-key')

    def test_health_remains_public(self):
        self.assertEqual(self.client.get('/health').status_code,200)

if __name__=='__main__':unittest.main()
