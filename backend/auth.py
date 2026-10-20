"""Verify Supabase sessions when cloud authentication is configured."""
import os
import logging
import base64
import json
from urllib.parse import urlsplit
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def project_host():
    """Public project hostname only; never expose keys or URL credentials."""
    try:
        return urlsplit(os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL') or '').hostname
    except ValueError:
        return None


def rejected_identity(response, authorization, host):
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    payload = payload if isinstance(payload, dict) else {}
    message = str(payload.get('message') or payload.get('msg') or '').lower()
    if 'invalid api key' in message or 'no api key found' in message:
        return unavailable('backend_configuration', 'BACKEND_SUPABASE_KEY_INVALID', 'Backend Supabase API key was rejected. Set SUPABASE_PUBLISHABLE_KEY to the publishable key from the same project as the frontend, then redeploy the backend.', response.status_code)
    # Unverified claims are used only to explain an already rejected request.
    # They never establish identity or grant access. Restrict this diagnostic to
    # standard Supabase domains so custom auth domains are not misclassified.
    try:
        token = authorization[7:]
        if len(token) <= 16000:
            part = token.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))
            issuer = urlsplit(claims.get('iss', '')).hostname
            if host and issuer and host.endswith('.supabase.co') and issuer.endswith('.supabase.co') and host != issuer:
                return unavailable('backend_configuration', 'BACKEND_SUPABASE_PROJECT_MISMATCH', 'Frontend and backend use different Supabase projects. Set backend SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the same project used by the frontend, then redeploy.', response.status_code)
    except (ValueError, TypeError, IndexError, AttributeError):
        pass
    expired = payload.get('code') == 'jwt_expired' or 'expired' in message
    return JSONResponse({
        'detail': 'Your session expired. Sign in again.' if expired else 'Backend could not verify your session. If signing in again does not help, check that both services use the same Supabase project and matching publishable key.',
        'code': 'SESSION_EXPIRED' if expired else 'BACKEND_SESSION_REJECTED',
        'stage': 'backend_identity',
    }, status_code=401)


def unavailable(stage, code, detail, provider_status=None):
    # Do not log tokens, keys, provider payloads, request URLs, or account IDs.
    logger.warning('Study authorization failed: stage=%s code=%s provider_status=%s', stage, code, provider_status)
    return JSONResponse({'detail': detail, 'code': code, 'stage': stage}, status_code=503)


async def verify_request(request: Request, call_next):
    url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    key = os.getenv('SUPABASE_PUBLISHABLE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    if not url or not key or not request.url.path.startswith('/api/') or request.method == 'OPTIONS':
        return await call_next(request)
    authorization = request.headers.get('authorization', '')
    if not authorization.startswith('Bearer ') or len(authorization) < 12:
        return JSONResponse({'detail': 'Sign in to your workspace to continue.'}, status_code=401)
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.path not in ('', '/') or parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise ValueError('Invalid project origin')
    except ValueError:
        return unavailable('backend_configuration', 'BACKEND_SUPABASE_URL_INVALID', 'Backend SUPABASE_URL is invalid. Use the Supabase project origin only, without a dashboard path or quotes.')
    stage = 'backend_identity'
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(url.rstrip('/') + '/auth/v1/user', headers={'apikey': key, 'Authorization': authorization})
        if response.status_code in (401, 403):
            return rejected_identity(response, authorization, parsed.hostname)
        if response.status_code != 200:
            return unavailable(stage, 'BACKEND_AUTH_PROVIDER_ERROR', f'Backend Supabase authentication returned HTTP {response.status_code}. Check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on the backend service.', response.status_code)
        identity = response.json()
        if not isinstance(identity, dict) or not isinstance(identity.get('id'), str) or not identity['id']:
            return unavailable(stage, 'BACKEND_AUTH_INVALID_RESPONSE', 'Backend received an invalid Supabase authentication response. Check its Supabase project URL.')
        request.state.user_id = identity['id']
        stage = 'backend_purchase'
        environment = os.getenv('DODO_PAYMENTS_ENVIRONMENT', 'test_mode')
        product_id = os.getenv('DODO_PAYMENTS_PRODUCT_ID')
        if environment not in ('test_mode', 'live_mode') or not product_id:
            return JSONResponse({'detail': 'Payment access is not configured.'}, status_code=503)
        if os.getenv('NODE_ENV') == 'production' and environment != 'live_mode':
            return unavailable('backend_configuration', 'BACKEND_PAYMENT_ENVIRONMENT_MISMATCH', 'Backend payment verification is configured for test mode in production. Set DODO_PAYMENTS_ENVIRONMENT=live_mode and DODO_PAYMENTS_PRODUCT_ID to the same live product ID as the frontend, then redeploy the backend.')
        async with httpx.AsyncClient(timeout=12) as client:
            purchase = await client.get(url.rstrip('/') + '/rest/v1/dodo_payments',
                headers={'apikey': key, 'Authorization': authorization},
                params={'select': 'payment_id', 'owner_id': 'eq.' + request.state.user_id,
                        'environment': 'eq.' + environment, 'currency': 'eq.INR',
                        'total_amount': 'gte.9900', 'subscription_id': 'is.null',
                        'product_ids': 'cs.{' + product_id + '}', 'limit': '1'})
        if purchase.status_code != 200:
            return unavailable(stage, 'BACKEND_PURCHASE_PROVIDER_ERROR', f'Backend payment verification returned HTTP {purchase.status_code}. Check backend Supabase settings and billing policies.', purchase.status_code)
        if not isinstance(purchase.json(), list):
            return unavailable(stage, 'BACKEND_PURCHASE_INVALID_RESPONSE', 'Backend received an invalid payment verification response. Check its Supabase project URL.')
        if not purchase.json():
            return JSONResponse({'detail': 'A confirmed DopeWrite purchase is required.'}, status_code=402)
    except httpx.HTTPError:
        return unavailable(stage, 'BACKEND_SUPABASE_UNREACHABLE', 'Backend cannot reach Supabase to verify your session or purchase. Check SUPABASE_URL and backend connectivity, then retry.')
    except (ValueError, TypeError):
        return unavailable(stage, 'BACKEND_SUPABASE_INVALID_RESPONSE', 'Backend received an unreadable Supabase response. Check its Supabase project URL and configuration.')
    return await call_next(request)
