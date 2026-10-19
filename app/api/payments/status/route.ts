import {serverSupabase} from '../../../lib/supabase/server';
import {supabaseConfigured} from '../../../lib/supabase/config';
import {checkoutConfigurationIssue,paymentEnvironment} from '../../../lib/payments/checkout';
import {purchaseStatus} from '../../../lib/payments/purchaseStatus';
import {reconcilePayment} from '../../../lib/payments/reconcile';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(body:Record<string,unknown>,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 if(!supabaseConfigured)return reply({error:'Sign-in is not configured.'},503);
 try{
  const client=await serverSupabase();const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return reply({error:'Sign in to check your purchase.'},401);
  const setupIssue=checkoutConfigurationIssue();
  if(setupIssue)return reply({error:setupIssue,code:'CHECKOUT_CONFIGURATION_ERROR'},503);
  const environment=paymentEnvironment(process.env.DODO_PAYMENTS_ENVIRONMENT);
  let status=await purchaseStatus(client,user.id,environment,process.env.DODO_PAYMENTS_PRODUCT_ID!);
  const paymentId=new URL(request.url).searchParams.get('payment_id');
  if(!status.purchased&&paymentId){
   await reconcilePayment(paymentId,user.id,environment,process.env.DODO_PAYMENTS_PRODUCT_ID!);
   status=await purchaseStatus(client,user.id,environment,process.env.DODO_PAYMENTS_PRODUCT_ID!);
  }
  return reply({...status,configured:true,environment});
 }catch{return reply({error:'Purchase status could not be checked. Please retry.'},503)}
}
