import {apiAuth} from '../../lib/supabase/apiAuth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
 const auth=await apiAuth();if(auth.response)return auth.response;

  try {
    const raw = await request.text();
    if (raw.length > 250000) return Response.json({detail:'Response too long.'},{status:413});
    let data;
    try { data = JSON.parse(raw); } catch { return Response.json({detail:'Invalid response data.'},{status:400}); }
    const response = await fetch(`${process.env.BACKEND_URL || 'http://127.0.0.1:8000'}/api/evaluate`, {
      method:'POST', headers:{'Content-Type':'application/json',...(auth.token?{Authorization:`Bearer ${auth.token}`}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(65000)
    });
    return Response.json(await response.json(), {status:response.status});
  } catch { return Response.json({detail:'Cannot reach the assessment API. Your response is kept; please try again.'},{status:502}); }
}
