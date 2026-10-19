import {serverSupabase} from './server';
import {supabaseConfigured} from './config';
import {hasPaidAccess} from '../payments/access';
export async function apiAuth():Promise<{response?:Response;token?:string}>{
 if(!supabaseConfigured)return {response:Response.json({detail:'Sign-in is not configured.'},{status:503})};
 try{
  const client=await serverSupabase();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return {response:Response.json({detail:'Sign in to your workspace to continue.'},{status:401,headers:{'Cache-Control':'private, no-store'}})};
  if(!await hasPaidAccess(client,user.id))return {response:Response.json({detail:'A confirmed DopeWrite purchase is required. Complete checkout to continue.',checkout_url:'/checkout'},{status:402,headers:{'Cache-Control':'private, no-store'}})};
  const {data:{session}}=await client.auth.getSession();
  if(!session)return {response:Response.json({detail:'Your session has expired. Please sign in again.'},{status:401})};
  return {token:session.access_token};
 }catch{return {response:Response.json({detail:'Authentication is temporarily unavailable. Please retry.'},{status:503})}}
}
