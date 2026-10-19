"""Verify Supabase sessions when cloud authentication is configured."""
import os
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse


async def verify_request(request: Request, call_next):
    url = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
    key = os.getenv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.getenv('SUPABASE_PUBLISHABLE_KEY')
    if not url or not key or not request.url.path.startswith('/api/') or request.method == 'OPTIONS':
        return await call_next(request)
    authorization = request.headers.get('authorization', '')
    if not authorization.startswith('Bearer ') or len(authorization) < 12:
        return JSONResponse({'detail': 'Sign in to your workspace to continue.'}, status_code=401)
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(url.rstrip('/') + '/auth/v1/user', headers={'apikey': key, 'Authorization': authorization})
        if response.status_code in (401, 403):
            return JSONResponse({'detail': 'Your session expired. Sign in again.'}, status_code=401)
        if response.status_code != 200 or not response.json().get('id'):
            return JSONResponse({'detail': 'Authentication is temporarily unavailable. Please retry.'}, status_code=503)
        request.state.user_id = response.json()['id']
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
        if purchase.status_code != 200 or not isinstance(purchase.json(), list):
            return JSONResponse({'detail': 'Payment verification is temporarily unavailable.'}, status_code=503)
        if not purchase.json():
            return JSONResponse({'detail': 'A confirmed DopeWrite purchase is required.'}, status_code=402)
    except (httpx.HTTPError, ValueError, TypeError):
        return JSONResponse({'detail': 'Authentication is temporarily unavailable. Please retry.'}, status_code=503)
    return await call_next(request)
