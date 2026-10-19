const assert=require('node:assert/strict');
const {paymentEnvironment,applicationOrigin,checkoutUrl,validateOneTimeProduct,createHostedCheckout,CheckoutConfigurationError}=require('../.test-build/checkout/lib/payments/checkout.js');
const {purchaseStatus}=require('../.test-build/checkout/lib/payments/purchaseStatus.js');
const {createClient}=require('@supabase/supabase-js');
const {hasPaidAccess}=require('../.test-build/checkout/lib/payments/access.js');
const {verifiedPaymentEvent}=require('../.test-build/checkout/lib/payments/reconcile.js');
const fixed={product_id:'pdt_dopewrite',business_id:'bus_test',is_recurring:false,price:{type:'one_time_price',currency:'INR',price:9900,tax_inclusive:false}};
(async()=>{
 assert.equal(paymentEnvironment(), 'test_mode');assert.equal(paymentEnvironment('live_mode'),'live_mode');assert.throws(()=>paymentEnvironment('production'));
 assert.equal(applicationOrigin('http://127.0.0.1:3000','test_mode'),'http://127.0.0.1:3000');
 for(const value of ['http://example.com','https://evil.example/path','https://user:pass@example.com','https://example.com?next=bad','https://example.com/#bad'])assert.throws(()=>applicationOrigin(value,'test_mode'));
 assert.throws(()=>applicationOrigin('http://localhost:3000','live_mode'));
 assert.equal(checkoutUrl('https://test.checkout.dodopayments.com/session/test','test_mode'),'https://test.checkout.dodopayments.com/session/test');
 for(const value of ['https://example.com','https://checkout.dodopayments.com/session/test','javascript:alert(1)'])assert.throws(()=>checkoutUrl(value,'test_mode'));
 validateOneTimeProduct(fixed,'pdt_dopewrite');
 const recovered={payment_id:'pay_recover',business_id:'bus_test',status:'succeeded',created_at:'2026-10-17T00:00:00Z',updated_at:'2026-10-17T00:01:00Z',customer:{customer_id:'cus_test'},metadata:{supabase_user_id:'00000000-0000-4000-8000-000000000099',app:'dopewrite',purchase_type:'one_time'},product_cart:[{product_id:'pdt_dopewrite',quantity:1}],total_amount:11682,tax:1782,currency:'INR'};
 const verify=p=>verifiedPaymentEvent(p,recovered.metadata.supabase_user_id,'pdt_dopewrite','test_mode','bus_test');
 const recoveredEvent=verify(recovered);assert.equal(recoveredEvent.total_amount,11682);assert.equal(recoveredEvent.webhook_id,'api-recovery:pay_recover');
 for(const patch of [{status:'processing'},{metadata:{...recovered.metadata,supabase_user_id:'other-user'}},{total_amount:11683},{tax:-1},{currency:'USD'},{business_id:'other'},{subscription_id:'sub_test'},{refund_status:'succeeded'},{product_cart:[{product_id:'other',quantity:1}]},{product_cart:[{product_id:'pdt_dopewrite',quantity:2}]}])assert.equal(verify({...recovered,...patch}),null);

 assert.throws(()=>validateOneTimeProduct({...fixed,price:{...fixed.price,price:10890}},fixed.product_id),error=>error instanceof CheckoutConfigurationError&&error.message.includes('exactly ₹99'));
 for(const change of [{price:9800},{currency:'USD'},{type:'recurring_price'},{pay_what_you_want:true},{tax_inclusive:true},{discount_bps:100},{purchasing_power_parity:true}])assert.throws(()=>validateOneTimeProduct({...fixed,price:{...fixed.price,...change}},fixed.product_id));
 assert.throws(()=>validateOneTimeProduct({...fixed,is_recurring:true},fixed.product_id));assert.throws(()=>validateOneTimeProduct(fixed,'pdt_other'));
 const names=['DODO_PAYMENTS_ENVIRONMENT','DODO_PAYMENTS_API_KEY','DODO_PAYMENTS_PRODUCT_ID','DODO_PAYMENTS_WEBHOOK_KEY','DODO_PAYMENTS_BUSINESS_ID','SUPABASE_SERVICE_ROLE_KEY','APP_URL','NODE_ENV'];
 const prior=Object.fromEntries(names.map(n=>[n,process.env[n]]));const priorFetch=global.fetch;
 Object.assign(process.env,{DODO_PAYMENTS_ENVIRONMENT:'test_mode',DODO_PAYMENTS_API_KEY:'test-only',DODO_PAYMENTS_PRODUCT_ID:'pdt_dopewrite',DODO_PAYMENTS_WEBHOOK_KEY:'test-only',SUPABASE_SERVICE_ROLE_KEY:'test-only',DODO_PAYMENTS_BUSINESS_ID:'bus_test',APP_URL:'http://127.0.0.1:3000',NODE_ENV:'development'});
 try{
  let calls=0;global.fetch=async(input,init)=>{
   calls++;const url=new URL(typeof input==='string'?input:input.url||String(input));assert.equal(url.origin,'https://test.dodopayments.com');
   if(url.pathname==='/products/pdt_dopewrite')return Response.json(fixed);
   assert.equal(url.pathname,'/checkouts');const body=JSON.parse(init.body);
   assert.deepEqual(body.product_cart,[{product_id:'pdt_dopewrite',quantity:1}]);assert.equal(body.billing_currency,'INR');
   assert.deepEqual(body.metadata,{supabase_user_id:'verified-user-id',app:'dopewrite',purchase_type:'one_time'});assert.deepEqual(body.customer,{email:'owner@example.com'});
   assert.equal(body.return_url,'http://127.0.0.1:3000/checkout?return=1');assert.equal(body.feature_flags.allow_discount_code,false);assert.equal(body.feature_flags.allow_currency_selection,false);
   return Response.json({session_id:'cks_test',checkout_url:'https://test.checkout.dodopayments.com/session/test'});
  };
  assert.deepEqual(await createHostedCheckout({id:'verified-user-id',email:'owner@example.com'}),{checkout_url:'https://test.checkout.dodopayments.com/session/test'});assert.equal(calls,2);
  // A wrong catalog price must stop BEFORE any checkout session is created.
  calls=0;global.fetch=async()=>{calls++;return Response.json({...fixed,price:{...fixed.price,price:200000}})};
  await assert.rejects(createHostedCheckout({id:'verified-user-id',email:'owner@example.com'}),/₹99/);assert.equal(calls,1);
  // Session-creation failures must not be automatically retried.
  let posts=0;global.fetch=async(input)=>{const url=typeof input==='string'?input:input.url||String(input);if(url.includes('/products/'))return Response.json(fixed);posts++;return Response.json({message:'private provider diagnostics'},{status:500})};
  await assert.rejects(createHostedCheckout({id:'verified-user-id',email:'owner@example.com'}));assert.equal(posts,1);
  global.fetch=async(input)=>{const url=new URL(typeof input==='string'?input:input.url||String(input));assert.equal(url.pathname,'/rest/v1/dodo_payments');assert.equal(url.searchParams.get('owner_id'),'eq.owner-id');assert.equal(url.searchParams.get('environment'),'eq.test_mode');assert.equal(url.searchParams.get('currency'),'eq.INR');assert.equal(url.searchParams.get('total_amount'),'gte.9900');assert.equal(url.searchParams.get('subscription_id'),'is.null');assert.equal(url.searchParams.get('product_ids'),'cs.{pdt_dopewrite}');return Response.json([{payment_id:'pay_test',succeeded_at:'2026-10-17T00:00:00Z'}])};
  const client=createClient('https://example.supabase.co','test-key',{auth:{persistSession:false,autoRefreshToken:false}});
  assert.deepEqual(await purchaseStatus(client,'owner-id','test_mode','pdt_dopewrite'),{purchased:true,confirmedAt:'2026-10-17T00:00:00Z'});
  assert.equal(await hasPaidAccess(client,'owner-id'),true);
  process.env.NODE_ENV='production';assert.equal(await hasPaidAccess(client,'owner-id'),false);process.env.NODE_ENV='development';
  global.fetch=async()=>Response.json([]);assert.equal(await hasPaidAccess(client,'owner-id'),false);assert.deepEqual(await purchaseStatus(client,'owner-id','test_mode','pdt_dopewrite'),{purchased:false,confirmedAt:null});
  global.fetch=async()=>Response.json({message:'private database diagnostics'},{status:500});await assert.rejects(purchaseStatus(client,'owner-id','test_mode','pdt_dopewrite'),/Purchase confirmation is unavailable/);await assert.rejects(hasPaidAccess(client,'owner-id'));
  delete process.env.DODO_PAYMENTS_PRODUCT_ID;await assert.rejects(hasPaidAccess(client,'owner-id'),/not configured/);
 }finally{global.fetch=priorFetch;for(const n of names){if(prior[n]===undefined)delete process.env[n];else process.env[n]=prior[n]}}
 console.log('Passed ₹99 fixed one-time catalog checks, trusted customer metadata, safe origins/redirects, test-mode SDK calls, no POST retries, and verified purchase-status filters.');
})().catch(error=>{console.error(error);process.exitCode=1});
