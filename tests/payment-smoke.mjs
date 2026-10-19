// Local HTTP checks only. No account creation, Dodo requests, or database writes.
import assert from 'node:assert/strict';
const base=new URL(process.env.TEST_BASE_URL||'http://127.0.0.1:3000');
const page=await fetch(new URL('/checkout',base));assert.equal(page.status,200);assert((await page.text()).includes('₹99'));
const status=await fetch(new URL('/api/payments/status?status=succeeded&payment_id=spoofed',base));assert.equal(status.status,401);assert(status.headers.get('cache-control').includes('no-store'));
const checkout=await fetch(new URL('/api/payments/checkout',base),{method:'POST',headers:{Origin:base.origin,'Content-Type':'application/json'},body:JSON.stringify({product_id:'untrusted',price:1,user_id:'untrusted',return_url:'https://example.com'})});assert([401,503].includes(checkout.status));assert(!('checkout_url' in await checkout.json()));
const webhook=await fetch(new URL('/api/webhooks/dodo',base),{method:'POST',body:'{"type":"payment.succeeded"}'});assert([401,503].includes(webhook.status));
for(const next of ['/checkout','https://example.com','//example.com']){
 const url=new URL('/auth/callback',base);url.searchParams.set('next',next);
 const response=await fetch(url,{redirect:'manual'});assert.equal(response.status,303);
 const location=new URL(response.headers.get('location'),base);assert.equal(location.origin,base.origin);assert.equal(location.pathname,next==='/checkout'?'/checkout':'/app');assert(response.headers.get('cache-control').includes('no-store'));
}
console.log('Passed live checkout page, unauthenticated purchase/status protection, unsigned webhook rejection, no redirect-based purchase confirmation, and safe auth return paths.');
