import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import {supabaseUrl,supabaseKey,supabaseConfigured} from './config';
let client:SupabaseClient|undefined;
export function browserSupabase(){
 if(!supabaseConfigured)throw new Error('Add your Supabase project URL and publishable key to the project .env and restart the app.');
 return client??=createBrowserClient(supabaseUrl,supabaseKey);
}
