---
title: Identity & Billing — Sessions, Anonymous-First Auth, Guest Flows & Stripe
doc_type: implementation
subsystem: identity-billing
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/api-server/src/lib/session.ts
  - artifacts/api-server/src/routes/auth.ts
  - artifacts/api-server/src/routes/guest.ts
  - artifacts/api-server/src/lib/guestService.ts
  - artifacts/api-server/src/lib/anonymousMerge.ts
  - artifacts/api-server/src/routes/billing.ts
  - artifacts/api-server/src/routes/stripe.ts
  - artifacts/api-server/src/lib/webhookHandlers.ts
  - artifacts/api-server/src/lib/stripeStorage.ts
  - artifacts/api-server/src/lib/stripeClient.ts
  - artifacts/api-server/src/app.ts
  - artifacts/trainchat/src (guest/auth endpoint usage)
related_architecture:
  - "CLAUDE.md §2 (Anonymous-User First) and §3 (billing source of truth = webhook)"
related_implementation:
  - "docs/db-schema.md (users, guest_sessions, billing/stripe_processed_events; non-Drizzle tables)"
  - "docs/memory.md (login triggers mergeAnonymousToRegistered → data loss, DR-0025)"
  - "docs/context-pipeline.md (contrast: sessions are DB-backed/durable vs in-memory resolver, DR-0020)"
  - "docs/contract-spine.md (auth/billing/stripe/guest are largely uncontracted, DR-0007)"

last_generated: 2026-06-29
last_verified: 2026-06-29
verified_by: claude (Version 2, Wave 4 doc #10)
verified_commit: 78ee536
verification_method: >
  Read session.ts in full (store + cookie config); auth.ts endpoint list + hashing/merge call sites;
  guest.ts endpoint list + guestService header; billing.ts + stripe.ts endpoint lists; webhookHandlers.ts
  handler list + the two-layer design comment; stripeStorage.ts idempotency (stripe_processed_events
  check/insert) + the stripe.* read layer; app.ts webhook registration (express.raw). Verified wiring
  with grep: routers mounted in routes/index.ts; frontend usage of /guest/* vs /auth/bootstrap.
  NOT done: full read of auth flow bodies + every webhook handler; no runtime / no live Stripe call.
  Such claims are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0035, summary: "Two coexisting anonymous/guest systems are both live (backend mounted + frontend-invoked): the new anonymous-user-first (/auth/bootstrap, users.isAnonymous) and the legacy guest-session (/guest/*, guest_sessions table) which auth.ts claims bootstrap 'replaces'", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0036, summary: "Two billing/subscription route surfaces with overlapping checkout endpoints: billing.ts (/billing/create-checkout-session, lookup_key-based) and stripe.ts (/subscription/checkout + /subscription/*)", kind: code-vs-architecture, severity: low, status: open }
  - { id: DR-0037, summary: "Live DB contains tables outside the Drizzle schema — user_sessions (connect-pg-simple) and the stripe.* schema (stripe-replit-sync); db-schema.md's 51-table inventory is the Drizzle-managed subset (extends DR-0002)", kind: doc-vs-code, severity: low, status: open }
---

# Identity & Billing — Sessions, Anonymous-First Auth, Guest Flows & Stripe

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Reconciled against the auth/session/billing modules + routes + frontend usage. **Code wins** on
> disagreement. Route bodies + every webhook handler were read at header/wiring level; no runtime /
> live Stripe call. Runtime claims are **(UNVERIFIED)**.

## 1. Purpose & scope

Who the user is and how they pay: the **session** layer, **anonymous-first** auth + the legacy
**guest** flow, the anon→registered **merge**, and the **Stripe** billing/webhook layer. Implements
`CLAUDE.md §2` (Anonymous-User First) and `§3` (webhook-sourced subscription state).

## 2. Source map

| File | Responsibility |
|---|---|
| `lib/session.ts` | express-session + **connect-pg-simple** (Postgres `user_sessions` table); cookie config; `SessionData = { userId }`. |
| `routes/auth.ts` (727) | bootstrap/register/login/logout/me/account-delete/forgot/reset/validate-token; bcrypt; triggers the merge. |
| `routes/guest.ts` (439) + `lib/guestService.ts` | Legacy guest-session flow over `guest_sessions`. |
| `lib/anonymousMerge.ts` | `mergeAnonymousToRegistered` (see `memory.md §7` / DR-0025). |
| `routes/billing.ts` (250) | `/billing/create-checkout-session` (Stripe `lookup_keys`) + portal. |
| `routes/stripe.ts` (233) | `/subscription` (+products/plan-map/checkout/confirm/portal); reads webhook-synced `users`. |
| `lib/webhookHandlers.ts` | Business-logic webhook handlers (checkout/subscription/invoice). |
| `lib/stripeStorage.ts` | `StripeStorage`: `stripe_processed_events` idempotency + reads the `stripe.*` schema; syncs `users`. |
| `lib/stripeClient.ts` | `getUncachableStripeClient` + keys (Replit connector). |
| `app.ts` | Registers `/api/stripe/webhook` with `express.raw`. |

## 3. Sessions (Postgres-backed, durable)

`session.ts` uses **express-session** with **connect-pg-simple** over the shared `pool` (table
`user_sessions`, `createTableIfMissing: true`). Cookie: `secure`/`sameSite:"none"` under HTTPS
(`REPLIT_DOMAINS`/prod), `httpOnly`, 7-day `maxAge`, `path:"/"`. `SESSION_SECRET` is required.
`SessionData` holds only `{ userId }`.

**Key contrast:** because the session store is **DB-backed**, sessions are durable across autoscale
instances — unlike the in-memory conversation-context resolver (`context-pipeline.md` DR-0020). This
corroborates the cookie-session web auth model in `contract-spine.md §6` (`credentials: "include"`).
**Note:** `user_sessions` is created at runtime by connect-pg-simple and is **not** in the Drizzle
schema (DR-0037).

## 4. Anonymous-first auth + the legacy guest flow (dual systems — headline)

**New (anonymous-user-first):** `POST /auth/bootstrap` finds-or-creates an anonymous `users` row by
`deviceId` (`isAnonymous: true`) and sets `req.session.userId` — "every visitor gets a real user
record and a real session." `isAnonymous` drives the paywall. `register` (bcrypt cost 12), `login`
(bcrypt compare + **`mergeAnonymousToRegistered`** at 316), `logout`, `me`, `DELETE /account`,
`forgot-password`/`reset-password`/`validate-reset-token` (SHA-256 token hash, single-use).

**Legacy (guest-session):** `routes/guest.ts` exposes `/guest/{session,onboarding,generate,followup,
convert,chat,track}` over the `guest_sessions` table. auth.ts explicitly states bootstrap "replaces
the old guest-session teaser architecture."

**But both are live.** `guestRouter` is mounted (routes/index.ts) **and** the frontend still calls
`/guest/session`, `/guest/convert`, `/guest/track`, `/guest/chat` **alongside** `/auth/bootstrap`.
So the legacy guest system was **not retired** — two anonymous/guest systems coexist in production.
(DR-0035; cross-ref `db-schema.md` `guest_sessions`.) This is a third instance of the recurring
"dual coexisting systems" pattern (after dual program models and dual mutation engines).

## 5. Billing & Stripe (webhook-sourced — matches CLAUDE.md §3)

**Two checkout surfaces** (DR-0036): `billing.ts` `/billing/create-checkout-session` resolves the
Price via **`lookup_keys`** (no env price IDs needed; `STRIPE_PRICE_*` env vars are a documented
fast-fallback) and creates a Checkout Session; `stripe.ts` exposes `/subscription/*` including its own
`/subscription/checkout`, plus `/subscription` (status), `/subscription/products`, `/plan-map`,
`/confirm` (a "safety net — primary source of truth is the webhook"), `/portal`. Both mounted.

**Two-layer idempotent webhook** (faithful, well-designed):
- **Layer 1 — StripeSync** (`stripe-replit-sync`): verifies the signature with `STRIPE_WEBHOOK_SECRET`
  and stores raw events idempotently in a Postgres `stripe.*` schema. Route registered in `app.ts`
  (`/api/stripe/webhook`, `express.raw`).
- **Layer 2 — `webhookHandlers` + `StripeStorage`**: business-logic idempotency via
  `stripe_processed_events` (read at 237 / insert at 252), then `syncUserSubscription` writes plan
  state to the `users` table. Handlers: `checkout.session.completed`,
  `customer.subscription.created/updated/deleted`, `invoice.paid`/`payment_succeeded`;
  `detectPlanFromLookupKey`/`PriceId`, `normalizePlanStatus`, `buildSyncPayload`.

**Source of truth** for subscription state is the **webhook → `users` table**; `stripe.ts` read
endpoints serve from `users` (comment: "All fields are sourced from our users table (webhook-synced),
not from Stripe"). This matches CLAUDE.md §3 and the `users.ts` schema comment. `StripeStorage` also
reads a `stripe.*` schema managed by the integration — **non-Drizzle tables** (DR-0037).

## 6. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0035 | Two coexisting anonymous/guest systems both live (backend + frontend): anonymous-user-first (/auth/bootstrap) and legacy guest-session (/guest/*) that auth.ts says it "replaces." | code-vs-architecture | medium |
| DR-0036 | Two billing/subscription route surfaces with overlapping checkout (billing.ts lookup_key vs stripe.ts /subscription/checkout). | code-vs-architecture | low |
| DR-0037 | Live DB has non-Drizzle tables: `user_sessions` (connect-pg-simple) + `stripe.*` (stripe-replit-sync); db-schema's 51-table count is the Drizzle subset (extends DR-0002). | doc-vs-code | low |

No new `high`-severity items. The Stripe webhook/idempotency design is faithful to CLAUDE.md §3.

## 7. Cross-references to prior implementation docs

- **`memory.md` (DR-0025):** this doc pins the **trigger point** — `login` calls
  `mergeAnonymousToRegistered` (auth.ts:316), the path that silently cascade-deletes anon
  memory/profile/logs.
- **`db-schema.md`:** `users`/`guest_sessions`/`stripe_processed_events` shapes; DR-0037 extends
  db-schema DR-0002 (the migration/schema is the Drizzle subset of the live DB).
- **`context-pipeline.md` (DR-0020):** sessions are **DB-backed and durable** — the deliberate
  counter-example to the in-memory resolver's autoscale fragility.
- **`contract-spine.md` (DR-0007):** auth/billing/stripe/guest are part of the **uncontracted** ~31
  routers (the OpenAPI spec covers only a core subset).

## 8. Recommended CLAUDE.md updates

Proposals only (governance §2/§7):
1. **§2** — Note that the **legacy guest-session system** (`/guest/*`, `guest_sessions`) is **still
   live** alongside the anonymous-user-first model — two systems, not one. (DR-0035.)
2. **§3** — Note the **two billing surfaces** (billing.ts lookup_key + stripe.ts /subscription) and
   pick/clarify the canonical one. (DR-0036.)
3. **§3** — Document the **two-layer webhook** (StripeSync raw-event store + `stripe_processed_events`
   business idempotency) and that subscription truth is the webhook-synced `users` table.
4. **§3/§data** — Note the **non-Drizzle live tables** (`user_sessions`, `stripe.*`). (DR-0037.)

The anonymous-first model and webhook-sourced billing are accurate and well-built; the gaps are the
surviving legacy guest system and the billing-surface/table duplication.

## 9. Files reviewed

Full: `session.ts`. Endpoints/wiring: `auth.ts`, `guest.ts`, `billing.ts`, `stripe.ts`,
`webhookHandlers.ts` (handler list + design comment), `stripeStorage.ts` (idempotency + sync),
`stripeClient.ts`, `app.ts` (webhook registration). Frontend grep for `/guest/*` vs `/auth/bootstrap`.
Mount check in `routes/index.ts`.

## 10. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Session store + cookie model (DB-backed, durable) | **High** | session.ts read in full. |
| Anonymous-first bootstrap + auth endpoints + bcrypt/reset | **High** | Endpoint list + call sites. |
| Dual guest systems both live (DR-0035) | **High** | Routers mounted + frontend endpoint census. |
| Two billing surfaces (DR-0036) | **High** | Both route files' endpoint lists. |
| Two-layer idempotent webhook + users source-of-truth | **High** | Handler list + idempotency call sites + app.ts. |
| Non-Drizzle tables (DR-0037) | **High** | connect-pg-simple + stripeStorage stripe.* reads. |
| Auth-flow + webhook-handler internals | **Medium** | Headers/wiring, not full bodies. |
| **Runtime / live Stripe behavior** | **UNVERIFIED** | No execution. |

Overall: **high confidence in the identity/billing architecture and the dual-system/webhook
findings.** Open gaps (full handler bodies; runtime) keep this at **L3**.

## 11. Verification record

- Verified at commit `78ee536` (current date 2026-06-29).
- Independent checks: session store = connect-pg-simple/`user_sessions`; `/auth/bootstrap` anon
  find-or-create; login → `mergeAnonymousToRegistered`; frontend calls both `/guest/*` and
  `/auth/bootstrap`; two checkout surfaces; idempotency via `stripe_processed_events`; webhook at
  `/api/stripe/webhook` with `express.raw`.
- Not run (documented gaps): full auth/webhook body read; runtime; live Stripe.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
