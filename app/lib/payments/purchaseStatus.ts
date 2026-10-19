import type {SupabaseClient} from '@supabase/supabase-js';
import {product} from '../../product';
import type {DodoEnvironment} from './dodoWebhook';
export async function purchaseStatus(client:SupabaseClient,userId:string,environment:DodoEnvironment,productId:string){
 // Only signed, persisted one-time payment records for this exact product qualify.
 // The paid total may exceed the base price because Dodo adds applicable tax.
 const {data,error}=await client.from('dodo_payments').select('payment_id,succeeded_at')
  .eq('owner_id',userId).eq('environment',environment).eq('currency',product.currency)
  .gte('total_amount',product.price*100).is('subscription_id',null).contains('product_ids',[productId])
  .order('succeeded_at',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new Error('Purchase confirmation is unavailable.');
 return {purchased:!!data,confirmedAt:data?.succeeded_at??null};
}
