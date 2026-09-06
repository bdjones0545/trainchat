# BOOSTY store — Stripe integration

BOOSTY is a browser arcade game that sells cosmetics. Its payments run through
**this** repo's existing Stripe setup rather than a second integration: same
account, same webhook endpoint, same signature verification, same idempotency.

## Why it needed its own webhook branch

`handleCheckoutSessionCompleted` requires a `subscriptionId` and returns early
without one. BOOSTY sells **one-time payments**, so every purchase would have
been dropped as "missing customer or subscription" — money taken, nothing
granted, no error. `handleBoostyCheckoutCompleted` runs first, claims events
tagged `metadata.product === "boosty"`, and returns `false` for everything else
so TrainChat billing is untouched.

## Identity: why purchases are not bound to a TrainChat user

BOOSTY has no accounts. A player is a random id (`plr_` + 16 hex) surfaced to
them as a recovery code, `BOOSTY-XXXX-XXXX-XXXX-XXXX`. Purchases bind to that
id, which is what lets the game keep its no-signup flow and still survive a
cleared cache or a change of device.

The id is a **bearer token**: whoever holds it can claim those cosmetics. It has
64 bits of entropy so it cannot be guessed, and everything it unlocks is
cosmetic and grants no gameplay advantage — that is what makes the trade
acceptable. It is not a login and must never be treated as one.

## Tables

| Table | Purpose |
|---|---|
| `boosty_entitlements` | Derived state: owned SKUs, bundle flag, cumulative `sparks_purchased`. |
| `boosty_purchases` | Immutable ledger. `stripe_session_id` is **UNIQUE** — that constraint, not application logic, is what makes a redelivered webhook harmless. |

Migration: `lib/db/drizzle/0003_whole_wolfsbane.sql`. Apply with
`pnpm --filter @workspace/db migrate`.

## Endpoints

All unauthenticated (there is no session to authenticate), all IP rate-limited.

| Route | Notes |
|---|---|
| `GET /api/boosty/catalog` | What is on sale. A SKU with no configured price reports `available:false` rather than appearing free. |
| `GET /api/boosty/entitlements?player=<id>` | Server-verified ownership. 60/min. |
| `POST /api/boosty/checkout` | `{ playerId, sku, returnUrl }` → hosted Stripe Checkout URL. 12/min. |

**The client never sends a price.** It names a SKU; the server resolves the
Stripe price id from `boostyCatalog.ts` + env, and the webhook records the
amount Stripe actually charged. A client that can name its own price can buy
the whole locker for a cent.

`returnUrl` is only honoured when it starts with `BOOSTY_PUBLIC_URL` — an open
redirect on a payment flow is a phishing primitive.

## Setup

1. Preview what will be created — contacts Stripe not at all:

   ```bash
   pnpm --filter @workspace/api-server run seed:boosty -- --dry-run
   ```

2. Create products and one-time prices. **Safely re-runnable**: products use a
   deterministic id (`boosty_<sku>`) looked up with `products.retrieve`, which
   is strongly consistent. `products.search` would not be — its index lags
   creation by up to a minute, so a run that died halfway and was retried
   inside that window would create duplicate products. A failed SKU is
   reported and the rest still complete, so re-running recovers.
   **Run against test keys first** — this creates real products in whichever
   account `STRIPE_SECRET_KEY` points at:

   ```bash
   pnpm --filter @workspace/api-server run seed:boosty
   ```

3. Set the printed `BOOSTY_PRICE_*` vars in Replit Secrets, plus:

   ```
   BOOSTY_PUBLIC_URL=https://<where the game is served>
   ```

4. Verify the configuration against the live account. This is read-only and
   catches what does not announce itself — a price id from the wrong Stripe
   mode, an archived price, a **recurring** price where a one-time one is
   required, or an amount that disagrees with what the shop displays:

   ```bash
   pnpm --filter @workspace/api-server run boosty:check
   ```

   The same offline checks run at server startup and log a line either way, so
   a half-configured store cannot sit quiet in production.

5. `checkout.session.completed` is already subscribed on the Stripe webhook
   endpoint (TrainChat uses it for subscriptions) — nothing to add.

6. Turn the game on. In `boosty/src/payments.js`:

   ```js
   CONFIG.mode = MODES.API;
   CONFIG.apiBase = 'https://<api-server origin>';
   ```

Until step 4 the game stays in DEMO mode: clearly labelled, charges nothing.

## Failure modes that are handled, and one that is not

Handled: redelivered webhooks (event dedupe **and** a unique index), unpaid
sessions, metadata/price disagreement (the charge wins), missing or malformed
player id (refuses to grant, logs loudly), unconfigured price (503, not a free
unlock), server unreachable from the game (local ownership is never wiped).

**Not handled — needs a human:** if the ledger insert succeeds but the
entitlement write fails, the log line is
`PAID BUT NOT GRANTED — entitlement write failed after ledger insert`. That is
money taken without goods delivered. `boostyStorage.rebuildFromLedger(playerId)`
repairs it from the ledger. Alert on that string.

## Still outstanding

* Refund policy + EU/UK 14-day withdrawal waiver at checkout.
* Privacy policy covering leaderboard names.
* COPPA decision — the art style will attract under-13s, which constrains ads.
* Sales tax / VAT. A Merchant of Record (Paddle, Lemon Squeezy) removes this;
  raw Stripe leaves the filing obligations with you.
