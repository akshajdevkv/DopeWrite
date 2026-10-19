const assert=require('node:assert/strict');
const {createHmac,randomBytes}=require('node:crypto');
const {createDodoWebhookHandler}=require('../.test-build/payments/dodoWebhook.js');
const {persistBillingEvent}=require('../.test-build/payments/webhookStore.js');
const secretBytes=randomBytes(32),secret=`whsec_${secretBytes.toString('base64')}`;
const owner='00000000-0000-4000-8000-000000000001';
const payment={business_id:'bus_test',type:'payment.succeeded',timestamp:'2026-10-17T10:00:00Z',data:{payload_type:'Payment',payment_id:'pay_test',status:'succeeded',total_amount:9900,currency:'INR',customer:{customer_id:'cus_test',email:'not-stored@example.com'},product_cart:[{product_id:'pdt_test',quantity:1}],metadata:{supabase_user_id:owner}}};
const subscription={business_id:'bus_test',type:'subscription.active',timestamp:'2026-10-17T10:00:00Z',data:{payload_type:'Subscription',subscription_id:'sub_test',product_id:'pdt_recurring',status:'active',customer:{customer_id:'cus_test'},next_billing_date:'2026-11-17T10:00:00Z',previous_billing_date:'2026-10-17T10:00:00Z',metadata:{supabase_user_id:owner}}};
function signed(payload,{id='msg_test',timestamp=Math.floor(Date.now()/1000),raw=typeof payload==='string'?payload:JSON.stringify(payload,null,2),signature}={}){
 const sig=signature||`v1,${createHmac('sha256',secretBytes).update(`${id}.${timestamp}.${raw}`).digest('base64')}`;
 return new Request('http://localhost/api/webhooks/dodo',{method:'POST',headers:{'webhook-id':id,'webhook-timestamp':String(timestamp),'webhook-signature':sig},body:raw});
}
(async()=>{
 const records=[];const claimed=new Set();let fail=false;
 const handle=createDodoWebhookHandler({webhookKey:secret,environment:'test_mode',businessId:'bus_test',persist:async event=>{if(fail){fail=false;throw new Error('simulated database outage')}if(claimed.has(event.webhook_id))return false;records.push(event);claimed.add(event.webhook_id);return true}});
 let response=await handle(signed(payment));assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true,duplicate:false});
 assert.equal(records[0].total_amount,9900);assert.equal(records[0].owner_id,owner);assert.equal(records[0].environment,'test_mode');assert.ok(!JSON.stringify(records[0]).includes('not-stored@example.com'));
 response=await handle(signed(payment));assert.deepEqual(await response.json(),{received:true,duplicate:true});assert.equal(records.length,1);
 response=await handle(signed(subscription,{id:'msg_subscription'}));assert.equal(response.status,200);assert.equal(records[1].subscription_id,'sub_test');assert.deepEqual(records[1].product_ids,['pdt_recurring']);assert.equal(records[1].next_billing_date,'2026-11-17T10:00:00.000Z');
 fail=true;response=await handle(signed(payment,{id:'msg_retry'}));assert.equal(response.status,503);assert.ok(!claimed.has('msg_retry'));response=await handle(signed(payment,{id:'msg_retry'}));assert.equal(response.status,200);assert.ok(claimed.has('msg_retry'));
 const before=records.length;
 assert.equal((await handle(signed(payment,{signature:'v1,forged'}))).status,401);
 const tampered=signed(payment);assert.equal((await handle(new Request(tampered.url,{method:'POST',headers:tampered.headers,body:JSON.stringify({...payment,type:'subscription.active'})}))).status,401);
 assert.equal((await handle(signed(payment,{timestamp:Math.floor(Date.now()/1000)-600}))).status,401);
 assert.equal((await handle(signed(payment,{timestamp:Math.floor(Date.now()/1000)+600}))).status,401);
 assert.equal((await handle(new Request('http://localhost/api/webhooks/dodo',{method:'POST',body:'{}'}))).status,401);
 assert.equal((await handle(signed({...payment,business_id:'bus_other'}))).status,403);
 assert.equal((await handle(signed({...payment,data:{...payment.data,status:'failed'}}))).status,422);
 assert.equal((await handle(signed({...payment,data:{...payment.data,total_amount:-1}}))).status,422);
 assert.equal((await handle(signed({...payment,data:{...payment.data,total_amount:9.9}}))).status,422);
 assert.equal((await handle(signed({...payment,data:{...payment.data,metadata:{supabase_user_id:'not-a-uuid'}}}))).status,422);
 assert.equal((await handle(signed({...subscription,data:{...subscription.data,status:'cancelled'}}))).status,422);
 assert.equal((await handle(signed({...subscription,data:{...subscription.data,next_billing_date:'bad-date'}}))).status,422);
 assert.equal((await handle(signed({...payment,data:{...payment.data,payload_type:'Subscription'}}))).status,422);
 const ignored=await handle(signed({type:'payment.failed'}));assert.deepEqual(await ignored.json(),{received:true,ignored:true});assert.equal(records.length,before);
 const oversized=signed('x'.repeat(1024*1024+1));assert.equal((await handle(oversized)).status,413);
 assert.equal((await handle(new Request(oversized.url,{method:'POST',headers:{...Object.fromEntries(oversized.headers),'content-length':String(2*1024*1024)},body:'x'}))).status,413);
 assert.equal((await createDodoWebhookHandler({webhookKey:'',environment:'test_mode',persist:async()=>true})(signed(payment))).status,503);
 const unmapped=[];await createDodoWebhookHandler({webhookKey:secret,environment:'live_mode',persist:async e=>{unmapped.push(e);return true}})(signed({...payment,data:{...payment.data,metadata:{}}}));assert.equal(unmapped[0].owner_id,null);assert.equal(unmapped[0].environment,'live_mode');
 // Verify actual Supabase SDK RPC contract without any network calls.
 const priorFetch=global.fetch;const priorUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;const priorKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';
 try{
  global.fetch=async(input,init)=>{assert.match(String(input),/\/rest\/v1\/rpc\/record_dodo_webhook$/);assert.deepEqual(JSON.parse(init.body),{p_event:records[0]});return new Response('true',{headers:{'Content-Type':'application/json'}})};
  assert.equal(await persistBillingEvent(records[0]),true);
  global.fetch=async()=>new Response('false',{headers:{'Content-Type':'application/json'}});assert.equal(await persistBillingEvent(records[0]),false);
  global.fetch=async()=>new Response('{"message":"internal sensitive database message"}',{status:500,headers:{'Content-Type':'application/json'}});await assert.rejects(persistBillingEvent(records[0]),/Webhook database transaction failed/);
 }finally{global.fetch=priorFetch;if(priorUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=priorUrl;if(priorKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=priorKey}
 console.log('Passed signed payment/subscription handlers, tampering/replay protection, duplicate delivery, database retry, payload bounds, merchant restriction, and Supabase RPC checks.');
})().catch(error=>{console.error(error);process.exitCode=1});
