import DodoPayments from 'dodopayments';
import {product} from '../../product';
import type {DodoEnvironment} from './dodoWebhook';

export class CheckoutConfigurationError extends Error {}

export function paymentEnvironment(value:string|undefined):DodoEnvironment{
 if(value&&value!=='test_mode'&&value!=='live_mode')throw new Error('Invalid Dodo environment.');
 return value==='live_mode'?'live_mode':'test_mode';
}
export function applicationOrigin(value:string|undefined,environment:DodoEnvironment){
 if(!value)throw new Error('APP_URL is required.');
 const url=new URL(value);
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(local&&environment==='test_mode'&&url.protocol==='http:')))throw new Error('Invalid APP_URL.');
 return url.origin;
}
export function checkoutConfigured(){return !!(process.env.DODO_PAYMENTS_API_KEY&&process.env.DODO_PAYMENTS_PRODUCT_ID&&process.env.DODO_PAYMENTS_WEBHOOK_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.APP_URL)}
export function checkoutUrl(value:string|null|undefined,environment:DodoEnvironment){
 if(!value)throw new Error('Missing hosted checkout URL.');
 const url=new URL(value),host=environment==='test_mode'?'test.checkout.dodopayments.com':'checkout.dodopayments.com';
 if(url.protocol!=='https:'||url.hostname!==host||url.username||url.password||url.port)throw new Error('Unexpected hosted checkout URL.');
 return url.toString();
}
export function validateOneTimeProduct(item:{product_id:string;is_recurring:boolean;price:unknown},expectedId:string){
 const price=item.price as Record<string,unknown>|null;
 if(item.product_id!==expectedId||item.is_recurring||!price||price.type!=='one_time_price'||price.currency!==product.currency||price.price!==product.price*100||price.pay_what_you_want||price.purchasing_power_parity||Number(price.discount_bps||0)!==0||Number(price.discount||0)!==0||price.tax_inclusive!==false)throw new CheckoutConfigurationError('Checkout pricing is misconfigured. The Dodo product must be exactly ₹99 INR, one-time and tax-exclusive, without discounts or PPP.');
}
export async function createHostedCheckout(user:{id:string;email:string}){
 const environment=paymentEnvironment(process.env.DODO_PAYMENTS_ENVIRONMENT);
 const origin=applicationOrigin(process.env.APP_URL,environment);
 const productId=process.env.DODO_PAYMENTS_PRODUCT_ID;
 const apiKey=process.env.DODO_PAYMENTS_API_KEY;
 if(!checkoutConfigured()||!productId||!apiKey)throw new Error('Checkout is not configured.');
 // No automatic POST retries: a timeout may already have created a session.
 const client=new DodoPayments({bearerToken:apiKey,environment,maxRetries:0,timeout:15000});
 const item=await client.products.retrieve(productId);
 validateOneTimeProduct(item,productId);
 if(process.env.DODO_PAYMENTS_BUSINESS_ID&&item.business_id!==process.env.DODO_PAYMENTS_BUSINESS_ID)throw new Error('Product business does not match the webhook business.');
 const session=await client.checkoutSessions.create({
  product_cart:[{product_id:productId,quantity:1}],
  customer:{email:user.email},billing_currency:'INR',
  metadata:{supabase_user_id:user.id,app:'dopewrite',purchase_type:'one_time'},
  return_url:`${origin}/checkout?return=1`,
  feature_flags:{allow_currency_selection:false,allow_discount_code:false,allow_customer_editing_email:false},
 });
 return {checkout_url:checkoutUrl(session.checkout_url,environment)};
}
