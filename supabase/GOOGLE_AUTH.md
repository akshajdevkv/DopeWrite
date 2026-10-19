# Enable Google sign-in

The application code already supports Google OAuth through Supabase, including the PKCE callback and cookie session. The remaining step is provider configuration.

1. In [Google Cloud Console](https://console.cloud.google.com/), select a project and open **Google Auth Platform**. Configure the app’s branding, audience and consent screen. If the app remains in Testing, add the Google accounts you want to use as test users.
2. Create an **OAuth Client ID**, choosing **Web application**. Add your app URL to **Authorized JavaScript origins** (for local development, `http://localhost:3000`; add your production origin when deploying).
3. Add this exact **Authorized redirect URI** to the Google client:

   ```text
   https://hrlyoviokuyoafzannjk.supabase.co/auth/v1/callback
   ```

   This is Supabase’s callback, not DopeWrite’s `/auth/callback` route. If you change Supabase projects, use the callback shown in the new project’s Google provider settings.
4. In your Supabase project, go to **Authentication → Sign In / Providers → Google**. Enable Google and paste the Google **Client ID** and **Client Secret**, then save. Keep the secret in Supabase; do not put it in `NEXT_PUBLIC_` variables or frontend code.
5. Under **Authentication → URL Configuration**, allow both local app callbacks if you use both origins:

   ```text
   http://localhost:3000/auth/callback
   http://127.0.0.1:3000/auth/callback
   ```

   Add your production app’s `/auth/callback` URL when deploying and set the Site URL to your preferred app origin.
6. Open DopeWrite at the same origin you configured, click **Continue with Google**, select an account, and approve Google’s sign-in prompt. Supabase establishes the user account and redirects to DopeWrite’s callback; the app then opens that user’s private workspace library at `/app`. No separate DopeWrite password or email-confirmation step is needed for Google sign-in.

The app checks provider availability before redirecting and shows a setup message when Google is disabled. That check is not cached, so enabling the provider does not require another application rebuild. Cancelling Google consent returns to sign-in with a clear message. Use only identity scopes (`openid email profile`); Drive, Gmail and Calendar access are not requested.

Existing folders belong to the Supabase user ID. Supabase controls identity linking; ensure you use the same Supabase account when returning to an existing library. This feature does not merge documents between distinct user IDs.

Official reference: https://supabase.com/docs/guides/auth/social-login/auth-google

Verification: `npm run test:frontend` covers OAuth options and error handling; `npm run test:auth` checks provider availability and same-origin error/cancellation callbacks against the running app. An actual Google account sign-in remains a manual check once provider credentials are configured.
