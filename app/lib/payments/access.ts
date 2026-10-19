import type {SupabaseClient} from '@supabase/supabase-js';
import {paymentEnvironment} from './checkout';
import {purchaseStatus} from './purchaseStatus';

export async function hasPaidAccess(client:SupabaseClient,userId:string){
 const environment=paymentEnvironment(process.env.DODO_PAYMENTS_ENVIRONMENT);
 const productId=process.env.DODO_PAYMENTS_PRODUCT_ID;
 if(!productId)throw new Error('Payment access is not configured.');
 // Test purchases may exercise development, but never unlock production.
 if(process.env.NODE_ENV==='production'&&environment!=='live_mode')return false;
 return (await purchaseStatus(client,userId,environment,productId)).purchased;
}
