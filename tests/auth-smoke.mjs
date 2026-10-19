// Requires the running app. Does not create accounts, sign in, or change data.
import assert from 'node:assert/strict';
const base=new URL(process.env.TEST_BASE_URL||'http://127.0.0.1:3000');
const providers=await fetch(new URL('/api/auth/providers',base));
assert.equal(providers.status,200);assert.equal(typeof (await providers.json()).google,'boolean');
for(const [query,reason] of [['?error=access_denied&error_description=UNTRUSTED&next=https://example.com','cancelled'],['','callback']]){
 const response=await fetch(new URL('/auth/callback'+query,base),{redirect:'manual'});
 assert([303,307].includes(response.status));
 const location=new URL(response.headers.get('location'),base);
 assert.equal(location.origin,base.origin,'Callbacks must preserve the actual browser origin');
 assert.equal(location.pathname,'/app');assert.equal(location.searchParams.get('auth_error'),reason);
 assert(!location.href.includes('UNTRUSTED'));assert(!location.href.includes('example.com'));
 assert(response.headers.get('cache-control').includes('no-store'));
}
console.log('Passed live OAuth provider availability, same-origin callback, cancellation, missing-code, safe redirect, and no-cache checks.');
