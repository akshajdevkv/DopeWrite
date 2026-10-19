# Supabase setup

1. Create or choose a Supabase project. In **SQL Editor**, run the complete contents of `migrations/202610170001_workspaces.sql` once. It creates `workspaces`, `documents`, private `documents` Storage bucket, indexes, constraints, triggers and ownership policies. Do not run the test bootstrap on a hosted project.
2. In the project-root `.env` (or `.env.local`), set:
   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   BACKEND_URL=http://127.0.0.1:8000
   ```
   A legacy anon key is also accepted as `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never put a service-role/secret key in a `NEXT_PUBLIC_` variable. No elevated key is needed by the application.
3. Enable **Email** in **Authentication → Providers**. Keep confirmation email enabled if desired. In **Authentication → URL Configuration**, set the site URL to your app URL and allow its `/auth/callback` redirect. For local use, add both `http://127.0.0.1:3000/auth/callback` and `http://localhost:3000/auth/callback`. Start sign-up and open its confirmation link in the same browser/origin (the flow uses PKCE).
4. Run `npm run build` and restart **both** Next.js and FastAPI. Public Next.js variables are embedded at build time; restarting an old build alone will not pick up changed keys. FastAPI reads the project `.env.local`/`.env` as well as `backend/.env`.
5. Create an account, create a folder, then add a PDF/PPTX. Files are stored at `user-id/workspace-id/document-id/source.pdf` (or `.pptx`) in a private bucket. Text, editor formatting, topic divisions, typing drafts, results and flashcard progress are stored in the document's JSON content in PostgreSQL.

Folders are independent private workspaces, not shared team spaces. Users can create, select, rename and search their workspace contents. New uploads and sample documents are saved in the selected folder. Original bytes stay unchanged. PDF previews use authenticated downloads and temporary browser blob URLs, never public links. Returning to folders waits for outstanding saves. Autosave is debounced, shows errors and offers retry; revision checks reject conflicting writes from another tab instead of silently overwriting them. Unsaved changes trigger the browser's leave-page protection.

Next.js verifies sessions for processing API routes and forwards the access token to FastAPI, which verifies it independently with Supabase Auth. PostgreSQL and Storage enforce owner-specific row-level security. Authenticated clients never use a service role. Cloud mode is enabled only when a URL and publishable key are configured; otherwise the app shows setup instructions and offers an explicitly temporary local session.

## Verification

Run `npm run test:cloud` for mocked Supabase SDK checks covering original-file paths, exact draft persistence, rollback ordering, version conflicts, and private downloads. Run the existing frontend checks and backend unit tests as described in the root README.

The migration can be tested against an isolated local PostgreSQL instance. `tests/bootstrap.sql` supplies minimal stand-ins for Supabase-managed schemas and roles; **only use it in a throwaway database**, then run the migration and `tests/isolation.sql`. Tests cover cross-user reads, writes, uploads/deletes, owner spoofing, foreign workspace assignment and revision checks. This validates PostgreSQL policies locally; it does not replace a live signup, confirmation-email, file-upload and reload test against your Supabase project.

Existing in-memory local sessions are not migrated automatically. Upload each original file into its desired folder. Password resets, shared folders, moving/deleting folders, offline sync, and scheduled spaced repetition are not included.

## Delete documents

Each document card has a trash button. The confirmation dialog lists what will be removed; cancellation is the default focus and Escape closes it before deletion starts. Confirming removes the original file(s) from the private Storage directory, then deletes the owning PostgreSQL `documents` row, including edited content and study progress. The folder and other documents are kept. The existing ownership policies already allow this; no new migration is required.

Storage and PostgreSQL cannot be deleted in one transaction. File removal must happen first because Storage policies refer to the owning row. If Storage fails, the row is retained. If the database delete fails after file removal, an explicit error keeps the document visible and allows retry. Revision checks stop stale deletion confirmations; partial concurrent-change errors are reported rather than claiming success. A successful deletion removes the item from the folder immediately and clears its local cache.

## Google authentication

The sign-in and sign-up screens include **Continue with Google**. Follow [Google provider setup](GOOGLE_AUTH.md) to configure the Google OAuth client in Supabase. No schema migration or additional frontend credentials are required.
