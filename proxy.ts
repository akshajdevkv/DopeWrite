import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {supabaseConfigured,supabaseUrl,supabaseKey} from './app/lib/supabase/config';
export async function proxy(request:NextRequest){
 // Provider webhooks authenticate their raw payload, not a browser session.
 if(request.nextUrl.pathname==='/api/webhooks/dodo')return NextResponse.next();
 if(!supabaseConfigured)return NextResponse.next();
 let response=NextResponse.next({request});
 const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{
  for(const {name,value} of values)request.cookies.set(name,value);
  response=NextResponse.next({request});
  for(const {name,value,options} of values)response.cookies.set(name,value,options);
 }}});
 try{await client.auth.getUser()}catch{/* Protected APIs verify independently. */}
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
