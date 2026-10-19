"""Verify Supabase sessions when cloud authentication is configured."""
import os
import logging
from urllib.parse import urlsplit
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


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
            return JSONResponse({'detail': 'Your session expired. Sign in again.'}, status_code=401)
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
            return JSONResponse({'detail': 'A confirmed live purchase is required.'}, status_code=402)
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
