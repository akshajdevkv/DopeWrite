# DopeWrite: ₹99 one-time purchase with Dodo Payments

Implemented flow: **landing pricing → `/checkout` → Supabase sign-in → Dodo hosted checkout → verified webhook → account purchase confirmation**. No subscription is created. No real payment has been attempted by these changes.

## 1. Create a test product

In your Dodo **test-mode** dashboard, create a product named **DopeWrite** with:

- Price type: **one-time / fixed price** (`one_time_price`).
- Currency: **INR**.
- Price: **₹99** (`9900` paise in the API).
- **Tax inclusive: disabled**. The base price is ₹99; applicable tax is added at checkout.
- Pay what you want, purchasing-power-parity pricing, and product discounts: **disabled**.
- Do not configure localized price overrides that change the ₹99 INR checkout price.

Copy the `pdt_...` ID. The server retrieves this product before each checkout and rejects a different price, recurring product, currency, tax-inclusive price, or variable-price setup. It does not create or change dashboard products automatically.

## 2. Apply the billing migrations

Run [202610170002_dodo_webhooks.sql](../supabase/migrations/202610170002_dodo_webhooks.sql) in your existing Supabase project's **SQL Editor**. It adds billing tables, owner-only read policies and the atomic event-writing function. Do not run `tests/dodo-webhooks.sql` in Supabase: that is a disposable local-database fixture, not a migration.

The new migration has been prepared but has **not** been applied to your hosted Supabase project by this integration.

If a billing transaction reports `42501: permission denied for table users`, run [202610170003_billing_account_lookup.sql](../supabase/migrations/202610170003_billing_account_lookup.sql). The security-invoker billing function needs permission for the service role to read only `auth.users.id`; this does not grant browser roles access to account data.

## 3. Add server environment variables

Add these to project-root `.env` or `.env.local`, alongside your existing public Supabase settings:

```dotenv
APP_URL=http://127.0.0.1:3000
DODO_PAYMENTS_ENVIRONMENT=test_mode
DODO_PAYMENTS_API_KEY=your_dodo_test_api_key
DODO_PAYMENTS_PRODUCT_ID=your_test_product_id
DODO_PAYMENTS_WEBHOOK_KEY=your_test_endpoint_signing_secret
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
# Optional additional merchant check:
DODO_PAYMENTS_BUSINESS_ID=your_dodo_business_id
```

Keep every secret server-side, without a `NEXT_PUBLIC_` prefix. `APP_URL` is the exact origin customers open in their browser; `localhost` and `127.0.0.1` are different origins. Production requires an HTTPS `APP_URL` and separately configured live-mode product, API key and webhook secret. The default environment is test mode; an unknown environment is rejected.

Without these settings checkout displays **Checkout is being prepared**, and takes no payment. If the migration is missing, purchase-status checks show a retryable error and checkout cannot proceed.

## 4. Allow the checkout sign-in callback

In Supabase **Authentication → URL Configuration → Redirect URLs**, retain your existing `/auth/callback` URLs and add:

```text
http://127.0.0.1:3000/auth/callback?next=%2Fcheckout
```

If you use `localhost`, add its matching callback too. For production, add the equivalent HTTPS domain. Google still returns to Supabase's provider callback; you do not change the Google Cloud OAuth callback for this feature.

Only `/checkout` and the default `/app` are allowed post-auth destinations. Arbitrary `next` URLs are rejected. Email/password login stays on the checkout page; email confirmation and Google login can return via the checkout callback.

## 5. Register the webhook

In Dodo **Developer → Webhooks**, register:

```text
https://YOUR_PUBLIC_DOMAIN/api/webhooks/dodo
```

Subscribe to `payment.succeeded` and `subscription.active`, and place this endpoint's signing secret in `DODO_PAYMENTS_WEBHOOK_KEY`. The one-time purchase uses `payment.succeeded`; `subscription.active` remains supported for future use and does not create a recurring plan.

Dodo cannot deliver to localhost. Use your deployed HTTPS domain, or a publicly reachable development tunnel forwarding to port 3000. Use that same tunnel origin in `APP_URL` and the Supabase callback allowlist if running the entire flow through it.

Restart the app after configuration:

```sh
npm run build
npm run start -- --hostname 127.0.0.1
```

## Payment confirmation and access

- Checkout requires a verified Supabase account. The server chooses the product, quantity, INR currency, return URL and `metadata.supabase_user_id`; it ignores client-supplied billing fields. The account email is supplied to Dodo to associate the checkout and receipt with the buyer.
- Browser checkout requests require `Origin` to match `APP_URL`. All billing endpoints return `Cache-Control: private, no-store`.
- The button is locked while a checkout request is running. The SDK does not automatically retry session creation after a timeout or server error. A hosted session is not a charge: the buyer still completes payment on Dodo's page. Existing verified purchases are checked before another checkout is offered.
- The return page checks the account's stored webhook payment, exact product ID, environment, INR currency and total of at least `9900` paise (₹99 base plus applicable tax). URL query parameters do not grant access. It makes at most five automatic checks with increasing delays, then offers a manual status check. A returned payment ID can trigger server-side recovery through the authenticated Dodo API: owner metadata, product, successful status, quantity, currency, and tax-exclusive base price must all match before persistence. Redirect parameters alone never confirm payment. A test purchase is labeled **test purchase confirmed**, separately from live records.
- Account purchases are read under Supabase RLS; only the webhook's server secret can create billing records. Missing checkout metadata leaves an event unlinked rather than guessing ownership by email.
- Workspace access requires a verified purchase. Apply the paid-workspace migration below for direct Supabase protection. Refund/dispute-driven revocation remains a separate lifecycle feature.

## Test

```sh
npm run test:checkout
npm run test:payments
npm run test:frontend
npm run build
```

These tests use signed local webhook fixtures and mocked provider responses; they do not create Dodo resources or charge a card. A real signed test delivery, migrated Supabase database and dashboard test checkout are still required to verify your account-specific configuration. Complete the test checkout yourself with Dodo's documented test payment methods, then verify the account confirmation screen and duplicate webhook delivery.

References: [Dodo Checkout Sessions](https://docs.dodopayments.com/developer-resources/checkout-session), [one-time products](https://docs.dodopayments.com/features/one-time-payment-products), and [webhooks](https://docs.dodopayments.com/developer-resources/webhooks).

## Paid workspace enforcement

`/app` checks the authenticated account’s purchase before rendering. Unpaid accounts go to `/checkout`; study APIs return 402 and FastAPI independently checks payment records. Database failures do not grant access. Test purchases work only in development; production Next.js requires live-mode purchases.

Apply [202610170004_paid_workspace_access.sql](../supabase/migrations/202610170004_paid_workspace_access.sql) after the previous billing migrations. It adds restrictive policies alongside the existing owner policies for folders, documents, and original files. The included settings target the current test project. Before production, update `billing_access_settings.environment` and `product_id` to the live values matching the app. Set `NODE_ENV=production` in the backend environment too. These database settings are service-only and cannot be changed by a browser user.

Account linking, payment ownership, environment, product, INR currency, and the minimum ₹99 base amount all remain required. Refund-driven access revocation is not implemented. Existing signed Storage URLs remain usable until they expire.
