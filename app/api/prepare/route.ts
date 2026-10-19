import {apiAuth} from '../../lib/supabase/apiAuth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
 const auth=await apiAuth();if(auth.response)return auth.response;

  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 16 * 1024 * 1024) return Response.json({detail:'File too large.'},{status:413});
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > 15 * 1024 * 1024) return Response.json({detail:'Choose a file smaller than 15 MB.'},{status:413});
    const response = await fetch(`${process.env.BACKEND_URL || 'http://127.0.0.1:8000'}/api/prepare`, {method:'POST',headers:auth.token?{Authorization:`Bearer ${auth.token}`}:{},body:form,signal:AbortSignal.timeout(130000)});
    return Response.json(await response.json(), {status:response.status});
  } catch { return Response.json({detail:'Cannot reach the extraction API. Start the FastAPI backend and try again.'},{status:502}); }
}
