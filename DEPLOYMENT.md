# Start cloudflared tunnel
cloudflared tunnel --url http://localhost:3000

# Deploying DopeWrite

This guide covers the current Next.js frontend, FastAPI extraction/OCR backend, Supabase database/Auth/Storage, Groq features, and ₹99 one-time Dodo Payments checkout. Configuration examples are templates; creating this guide does not deploy the application.

## 1. Deployment architecture

Use a persistent Linux server or equivalent managed Node/Python services:

```text
Browser → HTTPS / Nginx → Next.js :3000 → FastAPI :8000
                         │                │
                         ├─ Supabase      ├─ Groq
                         └─ Dodo          └─ local PDF/PPTX extraction + Tesseract
Dodo → HTTPS /api/webhooks/dodo → Next.js → Supabase
```

The examples below put both application services on one Ubuntu server, bind them to loopback, and expose only Nginx. Send every public path, including `/api/*`, to Next.js: its routes handle authentication, payments, and forwarding to FastAPI. Do not send all `/api/*` traffic directly to Python.

Next.js recommends a reverse proxy for self-hosted applications. DopeWrite needs a Node server; static export cannot run its API routes or auth proxy. See [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting).

### Hosting constraints

- Uploads are limited by application code to **15 MiB per file** and **45,000 extracted characters**. Supported formats are PDF and PPTX.
- OCR runs locally with a 30-second per-page and 110-second document budget. The Next.js extraction request timeout is 130 seconds. Split large scanned documents that exceed these budgets.
- Choose hosting that permits these request sizes, durations, and installation of Tesseract. Measure CPU/memory under simultaneous OCR uploads before increasing worker counts.
- Vercel Functions currently limit request/response payloads to **4.5 MB**. The current multipart upload route therefore cannot deliver the full 15 MiB experience there. Supporting larger uploads on that architecture requires a code change, such as direct authenticated Storage uploads followed by backend retrieval; increasing function duration alone will not fix it. See [Vercel limits](https://vercel.com/docs/functions/limitations).

## 2. Prepare the server

Provision a domain, HTTPS certificate, Node.js 22, npm, Python 3.12 with venv support, Nginx, and Tesseract. On Ubuntu, after installing Node separately:

```sh
sudo apt-get update
sudo apt-get install -y python3 python3-venv nginx tesseract-ocr tesseract-ocr-eng tesseract-ocr-osd
node --version
python3 --version
tesseract --list-langs
```

Confirm `eng` and `osd` are available. Install additional Tesseract language packs before setting, for example, `OCR_LANGUAGES=eng+hin`. PDF rendering uses `pypdfium2`, installed by the Python requirements.

Create a dedicated unprivileged service user named `dopewrite`. Copy the project source into `/opt/dopewrite/app`, owned by that user. Exclude developer `.env*` files, `node_modules`, `.next`, `.test-build`, `backend/.venv`, and Python cache directories; install dependencies on the server instead. Retain `package-lock.json`, migrations, application source, and public assets.

Allow public HTTPS and the access needed for server administration. Keep ports 3000 and 8000 private. Both services need outbound HTTPS to Supabase; the relevant service also needs Groq or Dodo access.

## 3. Configure production environment variables

Replace `dopewrite.example` with your real domain everywhere. The sample paths below are outside the application directory so releases do not overwrite secrets.

Create `/etc/dopewrite/frontend.env`:

```dotenv
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
BACKEND_URL=http://127.0.0.1:8000
APP_URL=https://dopewrite.example
DODO_PAYMENTS_ENVIRONMENT=test_mode
DODO_PAYMENTS_API_KEY=YOUR_TEST_API_KEY
DODO_PAYMENTS_PRODUCT_ID=YOUR_TEST_PRODUCT_ID
DODO_PAYMENTS_WEBHOOK_KEY=YOUR_TEST_WEBHOOK_SIGNING_SECRET
```

Start in Dodo test mode, verify checkout and webhooks, then follow the live-payment steps below. `DODO_PAYMENTS_BUSINESS_ID` is optional if required by your Dodo configuration.

Create `/etc/dopewrite/backend.env`:

```dotenv
NODE_ENV=production
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
DODO_PAYMENTS_ENVIRONMENT=live_mode
DODO_PAYMENTS_PRODUCT_ID=YOUR_LIVE_PRODUCT_ID
FRONTEND_ORIGIN=https://dopewrite.example
GROQ_API_KEY=YOUR_GROQ_API_KEY
GROQ_MODEL=openai/gpt-oss-20b
TESSERACT_CMD=/usr/bin/tesseract
OCR_LANGUAGES=eng
```

Use the same Supabase project for both services. The backend requires both Supabase values to enforce its `/api/*` bearer-token checks; without them it permits local unauthenticated mode. `FRONTEND_ORIGIN` configures CORS, not authentication. Normal browser requests go through Next.js.

| Variable group | Where needed | When changes take effect |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_*` | Next.js build and runtime | Rebuild frontend and restart |
| Supabase URL + publishable key aliases above | FastAPI runtime | Restart backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Next.js server only, for webhook persistence | Restart frontend |
| `APP_URL`, `BACKEND_URL`, `DODO_PAYMENTS_*` | Next.js server only | Restart frontend |
| `GROQ_*`, `OCR_*`, `TESSERACT_CMD`, `FRONTEND_ORIGIN` | FastAPI only | Restart backend |

The publishable key is intended for the browser; database and Storage ownership policies enforce access. Service-role, Dodo, and Groq keys must never use a `NEXT_PUBLIC_` prefix. Set environment-file ownership to `root:dopewrite` and permissions to `640`. Do not log their contents.

Public Next.js variables are embedded at build time, so changing only runtime settings does not update an existing browser bundle. See [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).

Selectable PDF/PPTX extraction and local OCR work without Groq. AI chat and non-identical response assessment need a valid Groq key; confirm the selected model is available to your account before launch. Gemini configuration is no longer used.

## 4. Prepare Supabase

For a fresh target project, run these files **in order** in Supabase SQL Editor:

1. [202610170001_workspaces.sql](supabase/migrations/202610170001_workspaces.sql)
2. [202610170002_dodo_webhooks.sql](supabase/migrations/202610170002_dodo_webhooks.sql)
3. [202610170003_billing_account_lookup.sql](supabase/migrations/202610170003_billing_account_lookup.sql)
4. [202610170004_paid_workspace_access.sql](supabase/migrations/202610170004_paid_workspace_access.sql)

Before production, update the service-only `billing_access_settings` row to the live environment and live product ID matching the frontend and backend. Migration 004 defaults to the current development test product.

For an existing project, first check which migrations were applied. Do not blindly rerun initial table-creation scripts. Never run files from `supabase/tests/` or `tests/dodo-webhooks.sql` against the hosted production project: they are disposable database test fixtures.

Verify the `workspaces`, `documents`, `dodo_webhook_events`, `dodo_payments`, and `dodo_subscription_activations` tables and the `record_dodo_webhook` function exist. The `documents` Storage bucket must be private, with the migration's owner policies and 15 MiB limit. Check that two different accounts cannot read or modify each other's folders or files.

In Supabase Auth URL configuration, set:

```text
Site URL: https://dopewrite.example
Allowed redirect URLs:
https://dopewrite.example/auth/callback
https://dopewrite.example/auth/callback?next=%2Fcheckout
```

For Google sign-in, configure the provider in Supabase. In Google OAuth settings use the application domain as an authorized JavaScript origin and this **Supabase** authorized redirect URI:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Google client secrets belong in the Supabase provider configuration. Configure email confirmation and production email delivery to match your intended sign-up flow. Further instructions: [Supabase setup](supabase/README.md) and [Google OAuth](supabase/GOOGLE_AUTH.md).

## 5. Configure upload buffering and build

The project uses Next.js `proxy.ts`. Next's default proxy body buffer is 10 MB, below the application's 15 MiB file limit. For deployments supporting the full upload range, create or merge this root `next.config.mjs` **before building**:

```js
const nextConfig = {
  output: 'standalone',
  experimental: {
    proxyClientMaxBodySize: '20mb',
  },
};

export default nextConfig;
```

This setting is experimental in the current Next.js version. Validate uploads above 10 MB in staging, and recheck it on framework upgrades. It increases buffering memory per request and does not raise the application's file limit. See [proxyClientMaxBodySize](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize).

As the `dopewrite` user, from `/opt/dopewrite/app`, load the trusted frontend environment and build:

```sh
set -a
. /etc/dopewrite/frontend.env
set +a
npm ci
npm run build
cp -R public .next/standalone/public
cp -R .next/static .next/standalone/.next/static
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
```

Keep the environment file compatible with both shell assignments and systemd `EnvironmentFile` syntax; quote values containing spaces or shell metacharacters. Do not source untrusted environment files.

Run the available regression checks before release:

```sh
npm run test:frontend
npm run test:cloud
npm run test:payments
npm run test:checkout
backend/.venv/bin/python -m backend.run_tests
```

## 6. Run both services with systemd

Create `/etc/systemd/system/dopewrite-backend.service`:

```ini
[Unit]
Description=DopeWrite FastAPI backend
After=network-online.target
Wants=network-online.target

[Service]
User=dopewrite
Group=dopewrite
WorkingDirectory=/opt/dopewrite/app
EnvironmentFile=/etc/dopewrite/backend.env
ExecStart=/opt/dopewrite/app/backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/dopewrite-frontend.service`:

```ini
[Unit]
Description=DopeWrite Next.js frontend
After=network-online.target dopewrite-backend.service
Wants=network-online.target dopewrite-backend.service

[Service]
User=dopewrite
Group=dopewrite
WorkingDirectory=/opt/dopewrite/app
EnvironmentFile=/etc/dopewrite/frontend.env
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Check `command -v node` and adjust the frontend `ExecStart` if necessary. Interactive shell/version-manager initialization does not automatically run under systemd. The service user must be able to write Next.js runtime caches. The standalone output needs the copied public/static assets shown above. Do not use `next dev` or Uvicorn `--reload` in production.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now dopewrite-backend dopewrite-frontend
sudo systemctl status dopewrite-backend dopewrite-frontend
curl --fail http://127.0.0.1:8000/health
curl --head http://127.0.0.1:3000/
```

## 7. Add HTTPS and Nginx

Point your domain's DNS to the server and obtain a valid TLS certificate using your certificate manager. The example below assumes certificate files already exist; replace their paths before enabling it. Configure automatic renewal with a successful Nginx reload after renewal.

Add a site configuration under `/etc/nginx/sites-available/dopewrite`, enable it through `sites-enabled`, and use:

```nginx
server {
    listen 80;
    server_name dopewrite.example;
    return 301 https://dopewrite.example$request_uri;
}

server {
    listen 443 ssl;
    server_name dopewrite.example;
    ssl_certificate /etc/letsencrypt/live/dopewrite.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dopewrite.example/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
```

```sh
sudo nginx -t
sudo systemctl reload nginx
```

The 20 MiB proxy limit leaves room for multipart overhead. Proxy timeouts do not change the application's own request budgets. Preserve webhook bodies and signature headers, and do not put `/api/webhooks/dodo` behind an interactive login challenge. Do not enable shared caching for authenticated pages, auth callbacks, or billing responses. If a CDN is added, check its upload and timeout limits too. See [Nginx proxy timeout documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout).

## 8. Configure ₹99 Dodo Payments

In the same environment as your Dodo API key, create/select a product with:

| Setting | Required value |
| --- | --- |
| Billing | One-time, not recurring |
| Currency | INR |
| Price | ₹99 (`9900` minor units) |
| Tax treatment | Tax-exclusive; applicable tax is added to ₹99 |
| Pay what you want / PPP / product discounts | Disabled |
| Localized overrides | Must not produce a different checkout price |

The checkout code validates these settings and rejects incompatible products. In particular, a ₹99 product with tax-exclusive disabled will fail validation. A product image is available at [public/branding/dopewrite-product.png](public/branding/dopewrite-product.png).

Create a webhook endpoint:

```text
URL: https://dopewrite.example/api/webhooks/dodo
Events: payment.succeeded, subscription.active
```

Set `DODO_PAYMENTS_WEBHOOK_KEY` to that endpoint's signing secret and restart Next.js. The handler verifies the raw payload and records events transactionally in Supabase with deduplication. Keep the webhook URL public while protecting it with signature verification.

Complete a test-mode purchase while signed in, verify the event is delivered successfully, and confirm `/checkout` shows a verified purchase for the same account. Redirect parameters alone do not confirm payment. Retry delivery of the same event and verify it does not duplicate the purchase.

For real payments, replace the API key, product ID, and webhook signing secret with their **live** counterparts, set `DODO_PAYMENTS_ENVIRONMENT=live_mode`, and restart Next.js. Switching the environment does not copy a test product into live mode. Keep staging on a separate test configuration.

**Paid access:** `/app` and study APIs require a verified purchase. Production rejects test-mode purchases. Apply migration 004 and configure its live product/environment to protect direct Supabase access too. Refund-based access revocation is not implemented. The `subscription.active` handler is available, but this product remains a one-time purchase.

See [checkout setup](docs/DODO_CHECKOUT.md) and [webhook setup](docs/DODO_WEBHOOKS.md) for implementation details.

## 9. Verify the deployment

Run read-only HTTP smoke checks from the deployed source directory:

```sh
TEST_BASE_URL=https://dopewrite.example npm run test:auth
TEST_BASE_URL=https://dopewrite.example node tests/payment-smoke.mjs
```

These do not create accounts, charge customers, or write database records. Then manually verify:

- Landing page, ₹99 pricing, sign-up/sign-in, Google OAuth, sign-out, and checkout return routes use the production domain.
- Create a folder, upload a PDF/PPTX, edit its content, start learning, refresh, and confirm drafts/progress persist for that account.
- Upload a selectable PDF, a scanned PDF, and a file above 10 MB but below 15 MiB. Check paragraphs, columns, and error handling.
- Check backend `/health` reports `ocr_configured: true`. This checks executable availability, not OCR quality or language data; an actual scanned-file upload is still required.
- Exercise AI chat, retention submission, flashcards, panel resizing, and full-screen typing. Backend health alone does not validate Groq credentials/model access.
- Confirm unauthenticated API requests are rejected and a second account cannot access the first account's documents or Storage objects.
- Delete a disposable document and verify both its database record and original Storage object are removed.
- Verify signed Dodo test events succeed, unsigned events are rejected, and account-linked purchase status appears only after a verified event.

## 10. Updates, logs, and recovery

Build updates in a separate release directory rather than replacing `.next` while the old Next.js process is serving requests. Keep `/opt/dopewrite/app` as a symlink to the active release if using versioned releases. Install Python dependencies in each release's venv, build with the production public variables, run checks, switch the symlink, then restart both services:

```sh
sudo systemctl restart dopewrite-backend dopewrite-frontend
sudo journalctl -u dopewrite-backend -n 100 --no-pager
sudo journalctl -u dopewrite-frontend -n 100 --no-pager
```

Retain the previous release for rollback. Switch back and restart if a release fails; assess database compatibility before rolling back code after migrations. Apply future database migrations deliberately with a backup and a rollback plan.

Back up PostgreSQL data and original Storage objects separately; a database-only backup does not preserve uploaded file bytes. Keep recoverable copies of deployment configuration and provider settings in secure storage. Exercise restoration before relying on backups. Monitor service health, OCR resource usage, Supabase failures, Groq errors/rate limits, and Dodo webhook delivery failures without logging document contents or credentials.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 413 or truncated upload | Nginx/CDN/provider limits, Next proxy buffer, multipart overhead, and the application's 15 MiB limit |
| OCR unavailable | Tesseract installation, executable path, language packs, and service PATH |
| OCR or extraction timeout | Scan size/page count and application budgets; split the document |
| AI chat or assessment fails | Backend Groq key, model availability, account limits, and backend logs |
| API returns 401 after login | Matching Supabase project/key in both services, valid session, forwarded bearer token |
| Google sign-in callback fails | Google → Supabase callback URI, Supabase → application redirect allowlist, canonical HTTPS origin |
| Checkout unavailable | All server keys, live/test consistency, exact `APP_URL`, migrations, fixed tax-exclusive ₹99 product |
| Checkout origin rejected | Browser domain matches `APP_URL`; Nginx preserves Host and HTTPS forwarding headers |
| Payment stays pending | Webhook delivery, endpoint signing secret, migration/function availability, service-role key, matching account metadata |
| Browser still uses old Supabase project | Rebuild frontend with the new `NEXT_PUBLIC_*` values and redeploy |
| Paid workspace is denied | Check the account, payment record, environment/product configuration, and billing migrations; production requires live payments |
