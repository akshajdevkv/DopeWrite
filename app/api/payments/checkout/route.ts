import {serverSupabase} from '../../../lib/supabase/server';
import {supabaseConfigured} from '../../../lib/supabase/config';
import {applicationOrigin,checkoutConfigurationIssue,CheckoutConfigurationError,createHostedCheckout,paymentEnvironment} from '../../../lib/payments/checkout';
import {purchaseStatus} from '../../../lib/payments/purchaseStatus';
export const runtime='nodejs';
const reply=(body:Record<string,unknown>,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request){
 if(!supabaseConfigured)return reply({error:'Sign-in is not configured.'},503);
 const setupIssue=checkoutConfigurationIssue();
 if(setupIssue)return reply({error:setupIssue,code:'CHECKOUT_CONFIGURATION_ERROR'},503);
 const environment=paymentEnvironment(process.env.DODO_PAYMENTS_ENVIRONMENT);
 const origin=applicationOrigin(process.env.APP_URL,environment);
 // Cookie-authenticated checkout must come from our configured application origin.
 if(request.headers.get('origin')!==origin)return reply({error:'Unexpected checkout origin.'},403);
 try{
  const client=await serverSupabase();const {data:{user},error}=await client.auth.getUser();
  if(error||!user||!user.email)return reply({error:'Sign in before starting checkout.'},401);
  const status=await purchaseStatus(client,user.id,environment,process.env.DODO_PAYMENTS_PRODUCT_ID!);
  if(status.purchased)return reply({already_purchased:true});
  // Client-supplied prices, product IDs, owners and return URLs are never read.
  return reply(await createHostedCheckout({id:user.id,email:user.email}));
 }catch(error){
  if(error instanceof CheckoutConfigurationError)return reply({error:error.message},503);
  return reply({error:'Checkout could not be prepared. Check your payment status before trying again, or contact support if this continues.'},503);
 }
}
