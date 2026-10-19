import WorkspaceApp from '../WorkspaceApp';
import {redirect} from 'next/navigation';
import {serverSupabase} from '../lib/supabase/server';
import {supabaseConfigured} from '../lib/supabase/config';
import {hasPaidAccess} from '../lib/payments/access';
export const dynamic='force-dynamic';
export const metadata={title:'Your workspace — DopeWrite',description:'Your private documents, edited notes, typing practice and active recall flashcards.'};
export default async function AppPage(){
 let permitted=false,paidUserId='';
 if(supabaseConfigured){
  try{
   const client=await serverSupabase();const {data:{user},error}=await client.auth.getUser();
   if(!error&&user){permitted=await hasPaidAccess(client,user.id);paidUserId=user.id}
  }catch{/* Failed verification must never render the workspace. */}
 }
 if(!permitted)redirect('/checkout');
 return <WorkspaceApp paidUserId={paidUserId}/>;
}
