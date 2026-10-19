'use client';
import {useEffect,useRef,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {ArrowLeft,ArrowUpRight,Check,CheckCircle2,CreditCard,LoaderCircle,LockKeyhole,RefreshCw} from 'lucide-react';
import AuthPanel from '../AuthPanel';
import {browserSupabase} from '../lib/supabase/browser';
import {supabaseConfigured} from '../lib/supabase/config';
import {authCallbackMessage} from '../googleAuth';
import {product} from '../product';
type Status={configured:boolean;purchased:boolean;environment:'test_mode'|'live_mode';confirmedAt?:string|null};
export default function CheckoutFlow({configured,environment}:{configured:boolean;environment:'test_mode'|'live_mode'}){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[status,setStatus]=useState<Status|null>(null),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[returned,setReturned]=useState(false);
 const submitting=useRef(false);
 const [pollingDone,setPollingDone]=useState(false);
 const statusRequest=useRef<Promise<Status>|null>(null);
 useEffect(()=>{
  setReturned(new URLSearchParams(window.location.search).has('return'));
  const authError=authCallbackMessage(new URLSearchParams(window.location.search).get('auth_error'));if(authError)setError(authError);
  if(!supabaseConfigured){setLoading(false);return}
  let alive=true;const client=browserSupabase();
  client.auth.getUser().then(({data})=>{if(alive){setUser(data.user);setLoading(false)}}).catch(()=>{if(alive){setError('Sign-in could not be checked. Please refresh.');setLoading(false)}});
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{if(alive){setUser(session?.user||null);setLoading(false)}});
  return()=>{alive=false;subscription.unsubscribe()};
 },[]);
 async function refresh(signal?:AbortSignal){
  if(statusRequest.current)return statusRequest.current;
  const query=new URLSearchParams(window.location.search),paymentId=query.get('payment_id');
  const suffix=paymentId?'?'+new URLSearchParams({payment_id:paymentId}).toString():'';
  const pending=(async()=>{
   const response=await fetch('/api/payments/status'+suffix,{cache:'no-store',signal});const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Could not check your purchase.');
   if(!signal?.aborted)setStatus(data);return data as Status;
  })();
  statusRequest.current=pending;
  try{return await pending}finally{if(statusRequest.current===pending)statusRequest.current=null}
 }
 useEffect(()=>{
  if(!user)return;
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined,attempts=0;const controller=new AbortController();
  setStatus(null);setChecking(true);setPollingDone(false);
  const poll=async()=>{try{const data=await refresh(controller.signal);if(!alive)return;setChecking(false);if(returned&&data.configured&&!data.purchased){if(++attempts<5)timer=setTimeout(poll,5000*attempts);else setPollingDone(true)}}catch(e){if(alive){setChecking(false);setError(e instanceof Error?e.message:'Could not check your purchase.')}}};
  void poll();return()=>{alive=false;controller.abort();statusRequest.current=null;if(timer)clearTimeout(timer)};
 },[user?.id,returned]);
 async function checkAgain(){setChecking(true);setError('');try{await refresh()}catch(e){setError(e instanceof Error?e.message:'Could not check your purchase.')}finally{setChecking(false)}}
 async function begin(){
  if(submitting.current)return;submitting.current=true;setBusy(true);setError('');
  try{
   const response=await fetch('/api/payments/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Checkout could not be prepared.');
   if(data.already_purchased){await refresh();return}
   if(typeof data.checkout_url!=='string')throw new Error('Checkout could not be prepared.');
   window.location.assign(data.checkout_url);
  }catch(e){setError(e instanceof Error?e.message:'Could not connect to checkout. Check your purchase status before trying again.')}finally{submitting.current=false;setBusy(false)}
 }
 const navigation=<header className="checkout-nav"><a href="/" className="checkout-brand">d<span>DopeWrite.</span></a><a href="/#pricing"><ArrowLeft size={15}/> Back to pricing</a></header>;
 if(loading)return <div className="checkout-layout">{navigation}<div className="checkout-loading" role="status"><LoaderCircle size={24}/>Opening your checkout…</div></div>;
 if(!supabaseConfigured)return <div className="checkout-layout">{navigation}<main className="checkout-screen"><div className="checkout-card"><h1>Sign-in setup is needed.</h1><p>DopeWrite links purchases to your private account. Configure Supabase before enabling checkout.</p><a className="secondary" href="/app">Go to workspace</a></div></main></div>;
 if(!user)return <div className="checkout-layout">{navigation}<div className="checkout-auth-notice">Sign in or create an account to buy DopeWrite for ₹{product.price}, one time. {error&&<span role="alert">{error}</span>}</div><AuthPanel returnTo="/checkout"/></div>;
 const ready=configured&&status?.configured;
 return <div className="checkout-layout">{navigation}<main className="checkout-screen"><div className="checkout-intro"><span className="eyebrow">A LITTLE FOCUS GOES A LONG WAY</span><h1>Your next chapter starts here.</h1><p>One payment. Your own space to learn.</p></div><div className="checkout-columns"><section className="checkout-card checkout-order"><span className="checkout-plan">DOPEWRITE · ONE-TIME PURCHASE</span><div className="checkout-price">₹{product.price}<small>INR + applicable taxes</small></div><p>No recurring charges. No automatic renewal.</p><ul>{['PDF & PowerPoint uploads','An editor for your own notes','Guided typing, one topic at a time','Active recall flashcards','Private folders and saved progress'].map(item=><li key={item}><Check size={16}/>{item}</li>)}</ul><div className="checkout-secure"><LockKeyhole size={16}/><span>Hosted checkout by Dodo Payments.<br/>Your card details stay with the payment provider.</span></div></section><section className="checkout-card checkout-confirm" aria-live="polite"><span className="checkout-account">Purchasing as <strong>{user.email}</strong></span>{environment==='test_mode'&&<span className="checkout-test-badge">TEST MODE · NO REAL PAYMENT</span>}{status?.purchased?<><CheckCircle2 className="checkout-success" size={43}/><h2>{environment==='test_mode'?'Test purchase confirmed.':'Your purchase is confirmed.'}</h2><p>Your payment was verified and saved to your account. You’re ready for your next study session.</p><a className="primary" href="/app">Open your workspace <ArrowUpRight size={17}/></a></>:checking&&!status?<><LoaderCircle className="checkout-spinner" size={28}/><h2>Checking your purchase…</h2></>:!ready?<><CreditCard size={32}/><h2>Checkout is being prepared.</h2><p>Payment setup is not complete yet. No payment has been taken. You can explore the workspace in the meantime.</p><a className="primary" href="/app">Explore the workspace <ArrowUpRight size={17}/></a></>:<><CreditCard size={32}/><h2>{returned?(pollingDone?'Confirmation is delayed.':'Waiting for payment confirmation.'):'A little more knowledge, remembered.'}</h2><p>{returned?'We verify your payment securely with Dodo. Automatic checks stop after a short wait. If confirmation is delayed, use Check purchase status; do not pay again.':'Continue to Dodo’s secure checkout to make a single payment of ₹99 plus applicable taxes. This is not a subscription.'}</p>{!returned&&<button className="primary" disabled={busy||checking} onClick={()=>void begin()}>{busy?<LoaderCircle className="checkout-spinner" size={16}/>:<LockKeyhole size={16}/>} {busy?'Preparing checkout…':'Continue · ₹99 + tax'}{!busy&&<ArrowUpRight size={16}/>}</button>}<button className="secondary" disabled={checking||busy} onClick={()=>void checkAgain()}><RefreshCw size={15}/>{checking?'Checking…':'Check purchase status'}</button>{returned&&<a className="checkout-return-link" href="/checkout">Return to checkout</a>}<small>You’ll return here after checkout. Access confirmation comes from a verified payment notification.</small></>}{error&&<div role="alert" className="checkout-error">{error}<button className="secondary" disabled={checking||busy} onClick={()=>void checkAgain()}>Retry status check</button></div>}</section></div><p className="checkout-bottom">Keep your curiosity. Make room for what stays.</p></main></div>;
}
