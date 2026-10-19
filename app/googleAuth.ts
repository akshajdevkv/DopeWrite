export function googleSignInOptions(origin:string,destination?:'/checkout'){
 const url=new URL(origin);
 if(url.protocol!=='https:'&&url.protocol!=='http:')throw new Error('Invalid sign-in origin.');
 const callback=new URL('/auth/callback',url.origin);if(destination)callback.searchParams.set('next',destination);
 return {provider:'google' as const,options:{redirectTo:callback.toString(),scopes:'openid email profile',queryParams:{prompt:'select_account'},skipBrowserRedirect:true}};
}
export function authCallbackMessage(code:string|null){
 if(!code)return '';
 if(code==='cancelled')return 'Google sign-in was cancelled. You can try again or sign in with email.';
 if(code==='configuration')return 'Authentication is not configured. Please check the Supabase project settings.';
 return 'Sign-in could not be completed. The link may have expired or the browser session changed. Please try signing in again.';
}

export function authDestination(value:string|null){return value==='/checkout'?'/checkout':'/app'}
