import {supabaseConfigured,supabaseUrl,supabaseKey} from '../../../lib/supabase/config';
export const runtime='nodejs';
export async function GET(){
 const headers={'Cache-Control':'private, no-store'};
 if(!supabaseConfigured)return Response.json({detail:'Connect your Supabase project before signing in with Google.'},{status:503,headers});
 try{
  const response=await fetch(`${supabaseUrl.replace(/\/$/,'')}/auth/v1/settings`,{headers:{apikey:supabaseKey},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)return Response.json({detail:'Could not load sign-in providers. Check your Supabase configuration and try again.'},{status:503,headers});
  const settings=await response.json();
  return Response.json({google:settings.external?.google===true,supabase_project_host:new URL(supabaseUrl).hostname},{headers});
 }catch{return Response.json({detail:'Could not check Google sign-in availability. Please try again.'},{status:503,headers})}
}
