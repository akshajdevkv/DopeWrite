import {Webhook} from 'standardwebhooks';

export type DodoEnvironment='test_mode'|'live_mode';
export type BillingEvent={
 environment:DodoEnvironment;webhook_id:string;business_id:string;event_type:'payment.succeeded'|'subscription.active';event_at:string;
 customer_id:string;owner_id:string|null;payment_id:string|null;subscription_id:string|null;product_ids:string[];
 total_amount:number|null;currency:string|null;next_billing_date:string|null;previous_billing_date:string|null;
};
type Options={webhookKey:string;environment:DodoEnvironment;businessId?:string;persist:(event:BillingEvent)=>Promise<boolean>};
const maxBody=1024*1024;
class InvalidPayload extends Error{}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new InvalidPayload();return value as Record<string,unknown>};
function id(value:unknown){if(typeof value!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(value))throw new InvalidPayload();return value}
function date(value:unknown){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))throw new InvalidPayload();return new Date(value).toISOString()}
function optionalDate(value:unknown){return value==null?null:date(value)}
export function billingEvent(value:unknown,webhookId:string,environment:DodoEnvironment):BillingEvent|null{
 const event=object(value);
 if(typeof event.type!=='string')throw new InvalidPayload();
 if(event.type!=='payment.succeeded'&&event.type!=='subscription.active')return null;
 const data=object(event.data),customer=object(data.customer),businessId=id(event.business_id);
 if(data.business_id!=null&&data.business_id!==businessId)throw new InvalidPayload();
 const metadata=data.metadata==null?{}:object(data.metadata);
 const owner=metadata.supabase_user_id;
 if(owner!=null&&(typeof owner!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)))throw new InvalidPayload();
 const result:BillingEvent={environment,webhook_id:id(webhookId),business_id:businessId,event_type:event.type,event_at:date(event.timestamp),customer_id:id(customer.customer_id),owner_id:typeof owner==='string'?owner:null,payment_id:null,subscription_id:null,product_ids:[],total_amount:null,currency:null,next_billing_date:null,previous_billing_date:null};
 if(event.type==='payment.succeeded'){
  if(data.status!=='succeeded'||data.payload_type!=='Payment'||!Number.isSafeInteger(data.total_amount)||(data.total_amount as number)<0||typeof data.currency!=='string'||!/^[A-Z]{3}$/.test(data.currency))throw new InvalidPayload();
  result.payment_id=id(data.payment_id);result.total_amount=data.total_amount as number;result.currency=data.currency;
  result.subscription_id=data.subscription_id==null?null:id(data.subscription_id);
  if(data.product_cart!=null){if(!Array.isArray(data.product_cart)||data.product_cart.length>100)throw new InvalidPayload();result.product_ids=[...new Set(data.product_cart.map(item=>id(object(item).product_id)))];}
 }else{
  if(data.status!=='active'||data.payload_type!=='Subscription')throw new InvalidPayload();
  result.subscription_id=id(data.subscription_id);result.product_ids=[id(data.product_id)];
  result.next_billing_date=optionalDate(data.next_billing_date);result.previous_billing_date=optionalDate(data.previous_billing_date);
 }
 return result;
}
const reply=(body:Record<string,unknown>,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function createDodoWebhookHandler(options:Options){
 return async function handle(request:Request):Promise<Response>{
  if(!options.webhookKey)return reply({error:'Webhook signing secret is not configured.'},503);
  const headers={'webhook-id':request.headers.get('webhook-id')||'','webhook-timestamp':request.headers.get('webhook-timestamp')||'','webhook-signature':request.headers.get('webhook-signature')||''};
  if(Object.values(headers).some(value=>!value)||Object.values(headers).some(value=>value.length>4096))return reply({error:'Invalid webhook signature.'},401);
  if(Number(request.headers.get('content-length'))>maxBody)return reply({error:'Webhook body is too large.'},413);
  // Read bounded raw bytes. Never re-serialize JSON before verifying the signature.
  let raw:Buffer;
  try{
   const reader=request.body?.getReader();if(!reader)return reply({error:'Webhook body is required.'},400);
   const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxBody){await reader.cancel();return reply({error:'Webhook body is too large.'},413)}chunks.push(part.value)}}finally{reader.releaseLock()}
   raw=Buffer.concat(chunks);
  }catch{return reply({error:'Cannot read webhook body.'},400)}
  let verified:unknown;
  try{verified=new Webhook(options.webhookKey).verify(raw,headers)}catch{return reply({error:'Invalid webhook signature.'},401)}
  let event:BillingEvent|null;
  try{event=billingEvent(verified,headers['webhook-id'],options.environment)}catch{return reply({error:'Invalid webhook payload.'},422)}
  if(!event)return reply({received:true,ignored:true});
  if(options.businessId&&event.business_id!==options.businessId)return reply({error:'Unexpected webhook business.'},403);
  try{
   const inserted=await options.persist(event);
   return reply({received:true,duplicate:!inserted});
  }catch{
   // No customer data, signing keys or raw payloads in logs or responses.
   console.error('Dodo webhook database transaction failed. Delivery should be retried.');
   return reply({error:'Webhook persistence unavailable. Please retry.'},503);
  }
 };
}
