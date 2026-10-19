import {apiAuth} from '../../lib/supabase/apiAuth';
export const runtime='nodejs';
export async function POST(request:Request){
 const auth=await apiAuth();if(auth.response)return auth.response;

 try{
  const raw=await request.text();
  if(raw.length>150000)return Response.json({detail:'Section too large for questions.'},{status:413});
  let data;
  try{data=JSON.parse(raw)}catch{return Response.json({detail:'Invalid section data.'},{status:400})}
  const response=await fetch(`${process.env.BACKEND_URL||'http://127.0.0.1:8000'}/api/recall-questions`,{method:'POST',headers:{'Content-Type':'application/json',...(auth.token?{Authorization:`Bearer ${auth.token}`}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(55000)});
  return Response.json(await response.json(),{status:response.status});
 }catch{return Response.json({detail:'Cannot reach the recall question API. Please try again.'},{status:502})}
}
