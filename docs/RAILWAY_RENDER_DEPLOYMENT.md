# Deploy DopeWrite on Railway or Render

Use two Docker web services from this repository: the Next.js application and the FastAPI/OCR API. Supabase remains the database, authentication provider, and private file store.

This guide prepares deployment in **Dodo test mode**. Production workspace access deliberately requires live payments. You can verify sign-in, checkout, webhook persistence, and purchase confirmation before switching live; a test purchase will not unlock production `/app`. Follow [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) before accepting real customers.

## Files included

| File | Purpose |
| --- | --- |
| [Dockerfile.frontend](../Dockerfile.frontend) | Node 22, production build, and minimal Next.js standalone server |
| [Dockerfile.backend](../Dockerfile.backend) | Python 3.12, PDF libraries, Tesseract English/orientation data, and Uvicorn |
| [.dockerignore](../.dockerignore) | Excludes secrets, local dependencies, Git data, caches, and the separate preview site from both build contexts |
| [frontend.env.example](../deploy/frontend.env.example) | Frontend dashboard variable template |
| [backend.env.example](../deploy/backend.env.example) | Backend dashboard variable template |

Both images run as non-root users, bind to `0.0.0.0`, and honor the hosting platform's `PORT`. The backend exits before listening if required Supabase or payment configuration is missing, preventing accidental unauthenticated local mode on a public host. Do not override the images' start commands.

Next.js now uses `output: 'standalone'`. Its proxy buffer is configured to 20 MB so it can forward multipart uploads within the existing 15 MiB file limit. The buffer setting is experimental; retest it when upgrading Next.js. The application still limits OCR processing to its own time budgets.

## Before deploying

1. Commit and push these deployment files to your GitHub repository.
2. In the target Supabase project, verify the billing migrations, account lookup permission, paid-access settings, and owner policies. See [the main deployment guide](../DEPLOYMENT.md#4-prepare-supabase).
3. Use the variable templates below in the hosting dashboard. Replace every placeholder; do not commit filled-in environment files.
4. Keep the frontend and backend on the **same Supabase project and Dodo product/environment**. The frontend needs Dodo secrets; the backend does not.

For this first deployment, choose one platform and create both services there.

## Railway

Create a Railway project with two services connected to `akshajdevkv/DopeWrite`.

For **both services**, keep the root/build context at the repository root. Do not set the backend's root to `/backend`: its Dockerfile copies paths relative to the repository root.

### Backend service

1. Add the variables from [backend.env.example](../deploy/backend.env.example), using your real project/key/product values.
2. Add `RAILWAY_DOCKERFILE_PATH=Dockerfile.backend`.
3. Set the service health-check path to `/health`.
4. Deploy and generate its HTTPS public domain. Record that full URL for the frontend's `BACKEND_URL`.
5. Open `/health`. `ocr_configured` should be true. `provider` should be `groq` if a key is configured; this reports configuration, not successful provider authentication.

The backend is publicly reachable in this setup, and its study APIs independently require a verified Supabase bearer token and purchase. `/health` remains public. A private service deployment requires adapting the listener/network configuration to the platform; do not assume a public URL or IPv4 listener works with every private-network setup.

### Frontend service

1. Add the variables from [frontend.env.example](../deploy/frontend.env.example).
2. Set `BACKEND_URL` to the backend's HTTPS public URL.
3. Add `RAILWAY_DOCKERFILE_PATH=Dockerfile.frontend`.
4. Set the service health-check path to `/`. Do not use `/app`, which redirects unpaid users to checkout.
5. Deploy and generate the frontend's HTTPS public domain.
6. Set `APP_URL` to that **exact frontend origin**, without a path, and redeploy. An initial placeholder must be replaced before testing checkout.
7. Set the backend's `FRONTEND_ORIGIN` to that same frontend origin and redeploy the backend.

Railway supplies defined variables as Docker build arguments when the Dockerfile declares matching `ARG` instructions. The frontend declares only its public Supabase URL and publishable key as build arguments; Dodo/Groq/service-role secrets are runtime settings. See [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles).

## Render alternative

Create two **Web Services**, not Static Sites, from the same GitHub repository. Select Docker for the runtime and leave the root directory at the repository root.

| Setting | Backend | Frontend |
| --- | --- | --- |
| Dockerfile path | `./Dockerfile.backend` | `./Dockerfile.frontend` |
| Docker build context | Repository root | Repository root |
| Health-check path | `/health` | `/` |
| Environment template | `deploy/backend.env.example` | `deploy/frontend.env.example` |

Deploy the backend first. Use its HTTPS URL for the frontend's `BACKEND_URL`. After Render assigns the frontend URL, set `APP_URL` and backend `FRONTEND_ORIGIN` to that origin, then redeploy the affected services.

Render makes configured variables available to matching Docker build arguments. Both images honor the platform's port, so leave their Docker commands intact. See [Render Docker deployments](https://render.com/docs/docker).

Choose service resources and availability settings appropriate for OCR and checkout webhooks. Test concurrent scanned-file uploads before increasing backend concurrency. Provider-specific resource, request-size, and timeout limits still apply.

## Configure authentication and Dodo for the deployed domain

Replace `https://YOUR_FRONTEND_DOMAIN` below with the exact canonical application origin. Avoid alternating between provider URLs and custom domains during an OAuth or payment flow.

Supabase Auth:

```text
Site URL: https://YOUR_FRONTEND_DOMAIN
Redirect URLs:
https://YOUR_FRONTEND_DOMAIN/auth/callback
https://YOUR_FRONTEND_DOMAIN/auth/callback?next=%2Fcheckout
```

Keep Google's redirect URI pointed at the Supabase project callback. See [Google OAuth setup](../supabase/GOOGLE_AUTH.md).

Dodo test-mode webhook:

```text
https://YOUR_FRONTEND_DOMAIN/api/webhooks/dodo
Events: payment.succeeded, subscription.active
```

Store that endpoint's signing secret in the frontend's `DODO_PAYMENTS_WEBHOOK_KEY`. The webhook must point to the complete API path, not `/`. Update the frontend secret and redeploy if the endpoint's secret changes.

The configured product must remain **₹99 INR before tax, one-time, tax-exclusive**, with no discounts, PPP, or variable price. A successful test checkout does not change production workspace access rules.

## Verify after deployment

From your local project directory:

```sh
TEST_BASE_URL=https://YOUR_FRONTEND_DOMAIN npm run test:auth
TEST_BASE_URL=https://YOUR_FRONTEND_DOMAIN node tests/payment-smoke.mjs
```

These HTTP checks do not charge anyone or create Dodo resources. Also verify manually:

- The restored lavender landing page loads, including product assets and CSS.
- Google sign-in returns to the deployed origin.
- Checkout displays ₹99 plus applicable tax and identifies test mode.
- A completed test purchase produces a signed webhook, a Supabase payment record, and a test purchase confirmation.
- Anonymous requests cannot access the workspace or study APIs.
- Test purchases do not unlock production `/app`; this is expected until the live cutover.
- After following the live checklist, a verified live buyer can upload, edit, practice, save, and reload; an unpaid account cannot bypass payment through APIs, database, or Storage.
- Verify a scan requiring OCR and a file above 10 MB but below 15 MiB. Proxy/container health alone does not prove extraction quality.

## Local container commands (optional)

Docker must be installed and running. Build from the repository root:

```sh
docker build -f Dockerfile.backend -t dopewrite-backend .
docker build -f Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  -t dopewrite-frontend .
```

Export the two public Supabase variables in your shell before building the frontend. Only those public values are needed at build time. Keep private credentials in runtime environment files stored outside the repository.

Run the backend on an unused host port:

```sh
docker run --rm -p 18000:8000 --env-file /absolute/path/backend.env dopewrite-backend
```

On Docker Desktop, set the frontend runtime file's `BACKEND_URL=http://host.docker.internal:18000` and `APP_URL=http://localhost:13000` for local **test-mode checkout only**. Run:

```sh
docker run --rm -p 13000:3000 --env-file /absolute/path/frontend.env dopewrite-frontend
```

These are production containers, so test purchases still cannot unlock the workspace. Linux hosts need an explicit host-gateway mapping or a Docker network for container-to-container access. Local container tests do not replace verifying deployed HTTPS callbacks and webhook delivery.

## Live cutover

Keep payment mode in `test_mode` until deployment verification is complete. Then follow [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) to update the frontend, backend, live product/key/endpoint secret, and Supabase billing-access configuration together.

When changing `NEXT_PUBLIC_SUPABASE_*`, trigger a new image build. When changing runtime-only variables, redeploy/restart the affected service. Do not use `npm run dev` in a hosted production container.
