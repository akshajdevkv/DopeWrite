import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {supabaseUrl,supabaseKey} from './config';
export async function serverSupabase(){
 const jar=await cookies();
 return createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{for(const {name,value,options} of values)jar.set(name,value,options)}}});
}
