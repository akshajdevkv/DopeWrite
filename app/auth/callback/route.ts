import {NextResponse} from 'next/server';
import {authDestination} from '../../googleAuth';
import {serverSupabase} from '../../lib/supabase/server';
import {supabaseConfigured} from '../../lib/supabase/config';
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get('code');
 const destination=authDestination(url.searchParams.get('next'));
 // Relative redirects preserve the browser's actual origin (localhost vs 127.0.0.1),
 // even when the Next.js server normalizes request.url to its internal hostname.
 function redirect(path:string){return new NextResponse(null,{status:303,headers:{Location:path,'Cache-Control':'private, no-store'}})}
 function failure(reason:string){return redirect(destination+'?auth_error='+encodeURIComponent(reason))}
 if(url.searchParams.has('error'))return failure(url.searchParams.get('error')==='access_denied'?'cancelled':'callback');
 if(!supabaseConfigured)return failure('configuration');
 if(!code)return failure('callback');
 try{
  const client=await serverSupabase();
  const {data,error}=await client.auth.exchangeCodeForSession(code);
  if(error||!data.session)return failure('callback');
  return redirect(destination);
 }catch{return failure('callback')}
}
