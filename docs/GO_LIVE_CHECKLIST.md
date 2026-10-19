# DopeWrite: deploy first, then enable live payments

This checklist covers moving DopeWrite from Dodo test mode to real payments **after deployment**. The product is a **₹99 INR one-time purchase, excluding applicable taxes**. This document does not change any settings or initiate a payment.

For hosting instructions, see [DEPLOYMENT.md](../DEPLOYMENT.md). For checkout and webhook details, see [DODO_CHECKOUT.md](DODO_CHECKOUT.md) and [DODO_WEBHOOKS.md](DODO_WEBHOOKS.md).

## 1. Understand the environment boundary

| Setting | Deployment verification | Public launch |
| --- | --- | --- |
| Dodo environment | `test_mode` | `live_mode` |
| Dodo API key | Test key | Live key |
| Dodo product ID | Test product | Live product |
| Webhook signing secret | Test endpoint secret | Live endpoint secret |
| Supabase billing access settings | Matching test product/environment in an isolated test project | Matching live product/environment |
| Payment methods | Documented test methods | Real customer payment methods |
| Next.js production workspace access | Test purchases cannot unlock it | Verified live purchases can unlock it |

**Important:** the current production access gate intentionally rejects test-mode purchases. After deployment, you can test sign-in, checkout, webhook persistence, and the purchase-confirmation screen in test mode. A blocked `/app` during that test is expected. End-to-end production workspace access requires a verified live purchase. Do not set production `NODE_ENV` to development to bypass this rule.

Use separate staging and production Supabase projects where possible. `billing_access_settings` is shared by the whole database, so changing its product/environment affects every app connected to that project. Test purchases must never be relabeled as live purchases.

## 2. Deploy and verify with test payments

- [ ] Deploy the Next.js frontend and FastAPI backend, including Tesseract in the backend image.
- [ ] Use a stable HTTPS application domain, such as `https://dopewrite.example`, instead of a temporary tunnel hostname.
- [ ] Set the frontend's `APP_URL` to that exact origin and `BACKEND_URL` to the deployed backend address.
- [ ] Configure the same Supabase project in both services and set `NODE_ENV=production` on both.
- [ ] Keep Dodo in `test_mode` initially. Set the matching test product ID in both services.
- [ ] Verify all four migrations in [supabase/migrations](../supabase/migrations) are applied to the target project. Do not rerun initial migrations blindly on an existing database.
- [ ] Verify the private `documents` bucket and owner/payment access policies exist.
- [ ] Configure Supabase Auth's Site URL and redirect allowlist for the deployed domain.
- [ ] Test the frontend, backend `/health`, uploads, and OCR limits using the [deployment verification steps](../DEPLOYMENT.md#9-verify-the-deployment). Paid study actions remain blocked by the production test-mode rule.

Supabase redirect URLs:

```text
https://dopewrite.example/auth/callback
https://dopewrite.example/auth/callback?next=%2Fcheckout
```

Google's authorized redirect URI remains Supabase's callback:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

In Dodo test mode, register the **complete** webhook URL, not the application's homepage:

```text
https://dopewrite.example/api/webhooks/dodo
```

- [ ] Enable `payment.succeeded` and `subscription.active` for that endpoint.
- [ ] Store its signing secret in the frontend's `DODO_PAYMENTS_WEBHOOK_KEY`.
- [ ] Complete a test checkout while signed in.
- [ ] Verify the signed webhook succeeds and an account-linked record appears in `dodo_payments` with `environment = 'test_mode'`.
- [ ] Verify the return screen confirms the test purchase. Browser return parameters alone must not confirm payment.
- [ ] Verify retries do not create duplicate payment records.

Use the [official Dodo testing instructions](https://docs.dodopayments.com/miscellaneous/testing-process) for supported test payment methods.

## 3. Prepare live Dodo resources

Do this before changing the deployed services to live mode:

- [ ] Complete any merchant activation requirements shown in your Dodo dashboard.
- [ ] Create or select the product in **live mode**. Test and live products/keys are separate; changing an environment variable does not copy a product.
- [ ] Verify the live product settings below.
- [ ] Generate the live API key and store it in the hosting provider's secret manager.
- [ ] Create the live webhook endpoint at the deployed `/api/webhooks/dodo` URL with the two events above.
- [ ] Store the live endpoint's signing secret securely. It is different from the test endpoint's secret.

| Product setting | Required value |
| --- | --- |
| Billing | One-time, not a subscription |
| Currency | INR |
| Base amount | ₹99 = `9900` paise |
| `tax_inclusive` | `false` |
| Discounts, pay-what-you-want, PPP | Disabled |
| Localized overrides | Must preserve the intended ₹99 INR base price |

The customer pays ₹99 **plus applicable tax**. Do not assume every customer's final total is the same, and do not change the base price to a tax-added amount. DopeWrite validates the catalog before creating checkout.

## 4. Switch the application and database together

Schedule a short cutover before inviting customers. Keep checkout out of public use until the deployed frontend, backend, database access settings, and webhook all match. Do not switch modes while a test checkout is still in progress on that deployment.

### Next.js frontend server settings

```dotenv
NODE_ENV=production
APP_URL=https://dopewrite.example
DODO_PAYMENTS_ENVIRONMENT=live_mode
DODO_PAYMENTS_API_KEY=YOUR_LIVE_API_KEY
DODO_PAYMENTS_PRODUCT_ID=YOUR_LIVE_PRODUCT_ID
DODO_PAYMENTS_WEBHOOK_KEY=YOUR_LIVE_WEBHOOK_SIGNING_SECRET
```

Keep the existing correct `BACKEND_URL`, Supabase URL/publishable key, and `SUPABASE_SERVICE_ROLE_KEY`. If `DODO_PAYMENTS_BUSINESS_ID` is configured, ensure it matches the live product's business. Never prefix secret keys with `NEXT_PUBLIC_`.

### FastAPI backend settings

```dotenv
NODE_ENV=production
DODO_PAYMENTS_ENVIRONMENT=live_mode
DODO_PAYMENTS_PRODUCT_ID=YOUR_LIVE_PRODUCT_ID
FRONTEND_ORIGIN=https://dopewrite.example
```

Keep its Supabase credentials, Groq settings, and OCR configuration unchanged. FastAPI checks purchase records through Supabase and does not need the Dodo API key, webhook signing secret, or Supabase service-role key.

### Supabase billing access configuration

In the **production project's SQL Editor**, replace the placeholder with the same live product ID used by both services, then run:

```sql
begin;

insert into public.billing_access_settings (singleton, environment, product_id)
values (true, 'live_mode', 'YOUR_LIVE_PRODUCT_ID')
on conflict (singleton) do update
set environment = excluded.environment,
    product_id = excluded.product_id;

commit;

select environment, product_id
from public.billing_access_settings;
```

This changes which verified purchases unlock database and Storage access. Keep the existing owner policies and paid-access policies enabled. Do not modify old test payment rows or mark unpaid accounts as paid.

- [ ] Redeploy/restart **both** application services to load the new settings.
- [ ] Check the frontend is serving the expected deployment and the backend health endpoint responds.
- [ ] Keep staging on test credentials and its separate database/configuration.

Changing only server-side Dodo variables does not require new browser Supabase values. If `NEXT_PUBLIC_SUPABASE_*` changes, rebuild the frontend as well; those values are embedded at build time.

## 5. Verify live mode before public launch

First run the read-only HTTP checks from the project directory:

```sh
TEST_BASE_URL=https://dopewrite.example npm run test:auth
TEST_BASE_URL=https://dopewrite.example node tests/payment-smoke.mjs
```

These checks do not create accounts, submit payments, or charge a card. They also do not replace a signed-in end-to-end checkout test.

- [ ] Sign in from the deployed domain using a dedicated verification account.
- [ ] Verify checkout no longer displays the test-mode badge and opens Dodo's live checkout host, `checkout.dodopayments.com`.
- [ ] Check that ₹99 is the base price and applicable tax is shown before payment.
- [ ] Have the owner complete an authorized real payment. **Live checkout charges real money.**
- [ ] Verify the live `payment.succeeded` delivery returns a successful response.
- [ ] Verify `dodo_payments` contains the correct account, live environment, product ID, currency, and paid amount.
- [ ] Confirm the return page shows purchase confirmation and the paid account can open `/app`.
- [ ] Verify upload, editing, typing practice, flashcards, saving, and refresh work for that account.
- [ ] Verify another unpaid account is redirected to checkout and its study API calls return 402.
- [ ] Verify direct Supabase requests cannot bypass payment/ownership policies or read another account's files.
- [ ] Confirm forged return parameters and unsigned webhooks cannot grant access.

Do not announce launch until these checks pass. If confirmation is delayed, check the existing payment and webhook delivery before attempting another payment.

## 6. Troubleshooting and rollback

| Symptom | Check |
| --- | --- |
| `Unexpected checkout origin` | Browser origin must match `APP_URL` exactly |
| Checkout reports pricing misconfiguration | Live product must be `9900` paise, INR, one-time, and tax-exclusive |
| Payment succeeds but confirmation waits | Correct `/api/webhooks/dodo` URL, live signing secret, delivery response, account metadata, and billing migrations |
| Billing transaction reports permission denied for users | Apply [migration 003](../supabase/migrations/202610170003_billing_account_lookup.sql) in the target project |
| Confirmed customer cannot open `/app` | Frontend, backend, saved purchase, and `billing_access_settings` must match the live product/environment |
| Test customer cannot open production `/app` | Expected: test purchases do not unlock production |

If the release fails, pause customer checkout and restore a known-good compatible release. After real customers have paid, **do not blindly switch production back to test mode**: it would reject legitimate live customers. Preserve payment records, retain valid live secrets, investigate webhook failures, and restore the live flow. Provider retries and server-verified recovery must remain idempotent.

## 7. Remaining launch work

- [ ] Implement refund/dispute-driven access revocation. The current purchase gate does not automatically revoke a previously recorded purchase after a refund or dispute.
- [ ] Publish support contact details and your privacy, terms, and refund policies.
- [ ] Monitor webhook failures, checkout errors, backend failures, and resource usage.
- [ ] Back up PostgreSQL and original Storage objects separately, and test restoration.

Official references: [Dodo checkout](https://docs.dodopayments.com/developer-resources/checkout-session), [webhooks](https://docs.dodopayments.com/developer-resources/webhooks), and [tax-inclusive versus exclusive pricing](https://docs.dodopayments.com/features/tax-inclusive-pricing).
