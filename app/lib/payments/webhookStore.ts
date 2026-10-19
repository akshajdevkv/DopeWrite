// Server-only: import this module from route handlers, never client components.
import {createClient} from '@supabase/supabase-js';
import type {BillingEvent} from './dodoWebhook';
export async function persistBillingEvent(event:BillingEvent):Promise<boolean>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Webhook database credentials are not configured.');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
 // The database claims webhook-id and writes the resource in ONE transaction.
 const {data,error}=await client.rpc('record_dodo_webhook',{p_event:event});
 if(error||typeof data!=='boolean'){
  // Log only the database error code, never account data or the event body.
  if(error)console.error('Billing transaction failed.',{code:error.code});
  throw new Error('Webhook database transaction failed.');
 }
 return data;
}
