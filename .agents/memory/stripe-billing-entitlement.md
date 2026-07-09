---
name: Stripe Billing Entitlement Architecture
description: Root cause of the "paid but still free" production bug, the two-layer webhook fix, self-heal startup job, and why stripe.accounts goes missing in production.
---

## Root Cause: stripe.accounts missing in production

stripe-replit-sync migration **0046** creates `stripe.accounts` with cascading FK constraints onto every stripe.* table. In production this migration fails (or rolls back) because existing rows in those tables have `_account_id` values that violate the new FK constraints. `runMigrations` still reports "Stripe schema ready" (it swallows partial migration errors), but `stripe.accounts` does NOT exist.

`findOrCreateManagedWebhook` calls `getAccountId()` which queries `stripe.accounts`. It throws "relation stripe.accounts does not exist". The original `initStripe()` catch block logged this as `logger.warn` — silently swallowing it. No managed webhook was ever registered; Stripe events were never delivered.

**Why `stripe.accounts` exists in dev but not prod:**  
Dev DB has had the library bootstrapped fresh (with valid initial data), so all FK constraints satisfied. Prod had existing stripe.* data from an older version that predates migration 0046.

## Fix: Two-layer webhook processing

`WebhookHandlers.processWebhook` now has two layers:

**Layer 1a (blocking, primary):** Raw Stripe SDK `stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET)`. Does NOT depend on stripe.accounts, managed webhooks, or StripeSync state. Invalid sig throws → HTTP 400.

**Layer 1b (best-effort, non-blocking):** StripeSync `sync.processWebhook(payload, sig)` — syncs raw event data to stripe.* tables. Wrapped in try/catch. If it throws (e.g., stripe.accounts missing), logs `error` with FIX guidance and continues. Business logic ALWAYS runs even if Layer 1b fails.

**Why:** Premium entitlement writes must not be held hostage to StripeSync infrastructure health.

## Self-heal startup job

`runSubscriptionSelfHeal()` runs on every server boot (after `initStripe`). It:
1. Queries: `stripeCustomerId IS NOT NULL AND stripeSubscriptionId IS NULL AND isAnonymous = false AND plan = free` (limit 50)
2. For each, calls `stripe.subscriptions.list({ customer, status: 'active' })`
3. If active sub found, calls `buildSyncPayload` + `stripeStorage.syncUserSubscription`

This is what immediately fixes the "Lisa Jones scenario" on next deploy.

## Lisa Jones remediation (production)

- `id=35`, `email=lisa.jones@trainchat.ai`, `stripe_customer_id=cus_UqdJC5GQ8Nzvjh`
- `stripe_subscription_id=NULL`, `plan=free` — webhook was never processed
- Fix: next production deploy will trigger `runSubscriptionSelfHeal` which will query Stripe for `cus_UqdJC5GQ8Nzvjh`, find her active subscription, and write `plan=pro/active`

## confirm endpoint hardening

`POST /api/subscription/confirm` — `detectPlanInterval(priceId)` throws on unknown price IDs. Wrapped in try/catch with fallback to `pro/monthly` + error log. Users are never blocked from getting paid access confirmed even if env var mapping is stale.

## Test pattern: vi.clearAllMocks() wipes getUncachableStripeClient

After `vi.clearAllMocks()`, `getUncachableStripeClient` returns `undefined` (not the mock object with `.webhooks`). Must call `resetStripeClient()` in every `beforeEach` to re-establish the mock. Pattern: hoist `mockConstructEvent` with `vi.hoisted()`, import `getUncachableStripeClient` at top, call `(getUncachableStripeClient as vi.fn).mockResolvedValue({ webhooks: { constructEvent: mockConstructEvent }, ... })` in beforeEach.

## Key files

- `artifacts/api-server/src/lib/webhookHandlers.ts` — two-layer processWebhook
- `artifacts/api-server/src/lib/subscriptionSelfHeal.ts` — startup self-heal
- `artifacts/api-server/src/index.ts` — initStripe error → error log; self-heal wired
- `artifacts/api-server/src/routes/stripe.ts` — confirm endpoint detectPlanInterval hardened
- `artifacts/api-server/src/lib/__tests__/webhook-billing.test.ts` — 71 tests, 5 regression RT-01–RT-05

**Why:**  
StripeSync's managed webhook path is fragile (depends on stripe.accounts). Decoupling signature verification from StripeSync makes the billing pipeline resilient to DB schema drift. Self-heal covers the entire class of "checkout completed but webhook not delivered" failures.
