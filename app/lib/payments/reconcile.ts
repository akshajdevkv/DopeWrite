// Server-only recovery when a webhook was delayed or delivered to an old URL.
import DodoPayments from 'dodopayments';
import type {Payment} from 'dodopayments/resources/payments';
import {billingEvent,type DodoEnvironment} from './dodoWebhook';
import {persistBillingEvent} from './webhookStore';
import {product} from '../../product';

export function verifiedPaymentEvent(payment:Payment,userId:string,productId:string,environment:DodoEnvironment,businessId?:string){
 if(payment.status!=='succeeded'||payment.subscription_id||payment.is_multi_subscription||payment.refund_status)return null;
 if(payment.metadata?.supabase_user_id!==userId||payment.metadata?.app!=='dopewrite'||payment.metadata?.purchase_type!=='one_time')return null;
 if(businessId&&payment.business_id!==businessId)return null;
 if(payment.currency!==product.currency||!Number.isSafeInteger(payment.tax??0)||(payment.tax??0)<0||payment.total_amount-(payment.tax??0)!==product.price*100)return null;
 if(payment.product_cart?.length!==1||payment.product_cart[0].product_id!==productId||payment.product_cart[0].quantity!==1)return null;
 // The payload comes from Dodo's authenticated API, never from return parameters.
 return billingEvent({business_id:payment.business_id,type:'payment.succeeded',timestamp:payment.updated_at||payment.created_at,data:{...payment,payload_type:'Payment'}},`api-recovery:${payment.payment_id}`,environment);
}

export async function reconcilePayment(paymentId:string,userId:string,environment:DodoEnvironment,productId:string){
 if(!/^pay_[A-Za-z0-9]{1,180}$/.test(paymentId))return;
 const client=new DodoPayments({bearerToken:process.env.DODO_PAYMENTS_API_KEY,environment,maxRetries:0,timeout:10000});
 let payment:Payment;
 try{payment=await client.payments.retrieve(paymentId)}catch(error){if(error instanceof DodoPayments.APIError&&error.status===404)return;throw error}
 const event=verifiedPaymentEvent(payment,userId,productId,environment,process.env.DODO_PAYMENTS_BUSINESS_ID);
 if(event)await persistBillingEvent(event);
}
