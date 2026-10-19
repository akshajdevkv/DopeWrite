import {createDodoWebhookHandler} from '../../../lib/payments/dodoWebhook';
import {persistBillingEvent} from '../../../lib/payments/webhookStore';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const environment=process.env.DODO_PAYMENTS_ENVIRONMENT||'test_mode';
 if(environment!=='test_mode'&&environment!=='live_mode')return Response.json({error:'Invalid webhook environment configuration.'},{status:503,headers:{'Cache-Control':'no-store'}});
 return createDodoWebhookHandler({webhookKey:process.env.DODO_PAYMENTS_WEBHOOK_KEY||'',environment,businessId:process.env.DODO_PAYMENTS_BUSINESS_ID,persist:persistBillingEvent})(request);
}
