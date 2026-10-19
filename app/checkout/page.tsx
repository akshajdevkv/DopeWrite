import './checkout.css';
import CheckoutFlow from './CheckoutFlow';
import {checkoutConfigured,paymentEnvironment} from '../lib/payments/checkout';
export const dynamic='force-dynamic';
export const metadata={title:'Get DopeWrite — ₹99, one time',description:'A single payment of ₹99 plus applicable taxes for DopeWrite. No recurring subscription.'};
export default function CheckoutPage(){
 let environment:'test_mode'|'live_mode'='test_mode';let configured=false;
 try{environment=paymentEnvironment(process.env.DODO_PAYMENTS_ENVIRONMENT);configured=checkoutConfigured()}catch{}
 return <CheckoutFlow configured={configured} environment={environment}/>;
}
