import {serverSupabase} from './server';
import {supabaseConfigured} from './config';
import {hasPaidAccess} from '../payments/access';
export async function apiAuth():Promise<{response?:Response;token?:string}>{
 if(!supabaseConfigured)return {response:Response.json({detail:'Sign-in is not configured.'},{status:503})};
 let stage:'frontend_identity'|'frontend_purchase'|'frontend_session'='frontend_identity';
 try{
  const client=await serverSupabase();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return {response:Response.json({detail:'Sign in to your workspace to continue.'},{status:401,headers:{'Cache-Control':'private, no-store'}})};
  stage='frontend_purchase';
  if(!await hasPaidAccess(client,user.id))return {response:Response.json({detail:'A confirmed DopeWrite purchase is required. Complete checkout to continue.',checkout_url:'/checkout'},{status:402,headers:{'Cache-Control':'private, no-store'}})};
  stage='frontend_session';
  const {data:{session}}=await client.auth.getSession();
  if(!session)return {response:Response.json({detail:'Your session has expired. Please sign in again.'},{status:401})};
  return {token:session.access_token};
 }catch{
  console.error('Study authorization failed.',{stage});
  const detail=stage==='frontend_purchase'?'Purchase verification is temporarily unavailable. Check the frontend payment configuration and Supabase billing policies.':'Your session could not be verified by the frontend. Please sign in again; if this continues, check the frontend Supabase configuration.';
  return {response:Response.json({detail,code:'FRONTEND_AUTHORIZATION_UNAVAILABLE',stage},{status:503,headers:{'Cache-Control':'private, no-store'}})};
 }
}
