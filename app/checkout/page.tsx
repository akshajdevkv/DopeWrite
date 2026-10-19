import './checkout.css';
import CheckoutFlow from './CheckoutFlow';
import {checkoutConfigurationIssue,paymentEnvironment} from '../lib/payments/checkout';
export const dynamic='force-dynamic';
export const metadata={title:'Get DopeWrite — ₹99, one time',description:'A single payment of ₹99 plus applicable taxes for DopeWrite. No recurring subscription.'};
export default function CheckoutPage(){
 let environment:'test_mode'|'live_mode'='test_mode';
 const setupError=checkoutConfigurationIssue();
 try{environment=paymentEnvironment(process.env.DODO_PAYMENTS_ENVIRONMENT)}catch{}
 return <CheckoutFlow configured={!setupError} environment={environment} setupError={setupError}/>;
}
