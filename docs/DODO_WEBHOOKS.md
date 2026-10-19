# Dodo Payments webhooks

The Next.js endpoint is **POST `/api/webhooks/dodo`**. It uses Standard Webhooks verification on the exact raw bytes, including the signature timestamp tolerance. It does not require a browser session or a Dodo API key, and it never accepts unsigned CLI mocks.

## Configure

1. Run [the billing migration](../supabase/migrations/202610170002_dodo_webhooks.sql) in Supabase SQL Editor **after the workspaces migration**.
2. Set these in the project-root `.env` (or your deployment's server environment):

   ```dotenv
   DODO_PAYMENTS_ENVIRONMENT=test_mode
   DODO_PAYMENTS_WEBHOOK_KEY=your_endpoint_signing_secret
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   # Optional: reject valid events from a different business.
   DODO_PAYMENTS_BUSINESS_ID=your_business_id
   ```

   `NEXT_PUBLIC_SUPABASE_URL` must already point at the same Supabase project. Never expose either secret with a `NEXT_PUBLIC_` prefix. Default mode is `test_mode`; misspelled modes fail closed. Use separate deployment settings and signing keys for test and live endpoints. The environment label comes from endpoint configuration; a webhook payload itself does not prove test/live mode.

3. Restart Next.js. In Dodo **Developer → Webhooks**, register `https://YOUR_DOMAIN/api/webhooks/dodo` and select **payment.succeeded** and **subscription.active**. Use that endpoint's signing secret above. For local development, Dodo needs a publicly reachable HTTPS tunnel forwarding to port 3000; localhost itself is unreachable from Dodo. Creating a real dashboard endpoint is a separate setup step; this repository change does not register one.
4. Send signed test deliveries from the dashboard. A successful first delivery returns `{"received":true,"duplicate":false}`. Re-delivery of the same `webhook-id` returns `duplicate:true`.

## What the handlers do

- `payment.succeeded`: validates the Payment payload and stores `payment_id`, customer, product IDs, amount in minor currency units, currency, and event time in `dodo_payments`. It records the actual verified amount; it does not assume every payment is ₹99 or includes no tax.
- `subscription.active`: validates the Subscription payload and records its activation, product, customer, and billing dates in `dodo_subscription_activations`. DopeWrite remains a **₹99 one-time purchase**; this handler does not create subscriptions or change the plan.
- Both events atomically claim `(environment, business_id, webhook-id)` and write their resource through `record_dodo_webhook`. A failed write rolls back the claim, so delivery can retry. Resource IDs prevent duplicate resource rows even when Dodo sends a new delivery ID. Older events cannot overwrite newer resource details.
- Other **verified** event types return `received:true, ignored:true`. Bad/missing signatures return 401, invalid supported payloads 422, oversized bodies 413, business mismatches 403, and configuration/database failures 503. Only durable success receives 200. No customer emails, raw bodies, or secrets are logged or stored.
- Browser users can only read their own linked records under RLS. They cannot create/update payment records, claim events, or execute the webhook database function. The service-role key stays in the Next.js route's server dependency graph.

## Link a purchase to an account

When implementing **server-authenticated** checkout, set `metadata.supabase_user_id` from the verified Supabase session, not a client-supplied field:

```ts
metadata: { supabase_user_id: user.id }
```

Both event payloads use this metadata key. A valid but absent/deleted account is recorded with `owner_id = null` for later reconciliation; customer emails are never used to guess account ownership. A malformed UUID is rejected. Attempts to reassign an already linked resource to a different account fail and roll back. Without checkout metadata, records remain unlinked and are only visible to the service role.

These two handlers **record billing facts; they do not unlock or revoke workspace access**. The [one-time checkout](DODO_CHECKOUT.md) now supplies authenticated account metadata and validates the product. Before enforcing a paywall, add refund/dispute handling for one-time payments, plus cancellation, expiry, renewal and hold events for subscriptions. Activation alone is not a permanent entitlement or proof that a subscription remains active. A checkout return URL is not proof of payment.

## Verification

- `npm run test:payments`: signed request tests for both events, forged/tampered/stale signatures, payload validation, duplicate delivery, retry after persistence failure, size limits, merchant checks and ignored events. Tests run locally without Dodo credentials or network calls.
- `tests/dodo-webhooks.sql`: database transaction/RLS checks against an **isolated disposable local PostgreSQL instance** after the billing migration. It includes a mock `auth` schema; never run the fixture setup against a real Supabase project.
- `npm run build`: validates the Node.js route and application types.

References: [Dodo webhooks](https://docs.dodopayments.com/developer-resources/webhooks), [event catalog](https://docs.dodopayments.com/developer-resources/webhooks/intents/webhook-events-guide).
