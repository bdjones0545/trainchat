# TrainChat — Deployment Guide

> **Audience:** engineers and AI coding agents deploying, verifying, or debugging TrainChat.
> Ground truth for any conflict: `.replit`, `artifacts/api-server/src/index.ts`, and source code.
> This document describes behavior observed from source; it is not aspirational.

---

## Table of Contents

1. [Deployment Overview](#1-deployment-overview)
2. [Hosting Environment](#2-hosting-environment)
3. [GitHub → Replit Sync Flow](#3-github--replit-sync-flow)
4. [Environment Variables](#4-environment-variables)
5. [Database](#5-database)
6. [Stripe Setup](#6-stripe-setup)
7. [SendGrid / Email Setup](#7-sendgrid--email-setup)
8. [OpenAI Setup](#8-openai-setup)
9. [Optional Integrations](#9-optional-integrations)
10. [Post-Merge Script](#10-post-merge-script)
11. [Server Startup Sequence](#11-server-startup-sequence)
12. [Autoscale Behavior](#12-autoscale-behavior)
13. [Pre-Deployment Checklist](#13-pre-deployment-checklist)
14. [Deployment Steps](#14-deployment-steps)
15. [Post-Deployment Verification](#15-post-deployment-verification)
16. [Rollback Procedure](#16-rollback-procedure)
17. [Common Failure Modes](#17-common-failure-modes)
18. [Debugging Commands](#18-debugging-commands)
19. [Incident Response Notes](#19-incident-response-notes)
20. [AI Agent Safety Rules](#20-ai-agent-safety-rules)

---

## 1. Deployment Overview

TrainChat is a Node.js/Express API server bundled with esbuild and hosted on Replit Autoscale. The frontend is served separately (see `artifacts/trainchat/`). The API server is the critical path — it handles auth, AI program generation, billing, and all data persistence.

**Build pipeline:**
```
TypeScript source (src/)
  → esbuild (build.mjs) → dist/index.mjs
    → node --enable-source-maps dist/index.mjs
```

**No migration runner.** Schema changes are applied via `drizzle-kit push` (see §5). There are no numbered migration files — the schema is always pushed as the authoritative definition.

---

## 2. Hosting Environment

| Property | Value |
|---|---|
| Platform | Replit Autoscale |
| Runtime | Node.js 24 |
| Database | PostgreSQL 16 (Replit-managed) |
| Package manager | pnpm (workspace) |
| Nix channel | `stable-25_05` |
| Modules | `nodejs-24`, `python-3.11`, `postgresql-16` |
| Deployment target | `autoscale` (configured in `.replit`) |
| Post-build step | `pnpm store prune` (runs with `CI=true`) |

**Replit injects automatically:**
- `DATABASE_URL` — PostgreSQL connection string
- `PORT` — port the server must bind to
- `REPLIT_DOMAINS` — comma-separated list of deployment domains
- `REPLIT_DEV_DOMAIN` — dev-environment domain

The server requires `PORT` at startup and will throw if it is absent. `DATABASE_URL` is required by `lib/db/src/index.ts` and throws at import time if missing.

---

## 3. GitHub → Replit Sync Flow

Replit is connected to the GitHub repo via the `github:1.0.0` integration (`.replit`).

**Normal flow:**
1. Code changes are pushed to `main` on GitHub
2. Replit detects the push (via GitHub integration) and pulls the changes
3. The `[postMerge]` hook in `.replit` runs `scripts/post-merge.sh`
4. The post-merge script installs dependencies and pushes the DB schema
5. Replit rebuilds and restarts the server

**Manual pull (if auto-sync didn't trigger):**
```bash
# In Replit shell
git pull
pnpm install --frozen-lockfile
pnpm --filter db push
```

**The post-merge script** (`scripts/post-merge.sh`):
```bash
#!/bin/bash
set -e
pnpm install --frozen-lockfile   # install/update dependencies
pnpm --filter db push            # push schema changes to the live database
```
- Runs with a 20-second timeout (`timeoutMs = 20000`)
- `set -e` means any failure aborts the script
- If `drizzle-kit push` conflicts (destructive change), it will hang waiting for confirmation — see §17

---

## 4. Environment Variables

Set all secrets in the **Replit Secrets panel** (`Tools → Secrets`). Values in `.replit [userenv.shared]` are non-secret shared env vars; do not put secrets there.

### 4a. Required — Server will not start without these

| Variable | Description |
|---|---|
| `PORT` | Injected by Replit. Server throws if absent. |
| `DATABASE_URL` | Injected by Replit. DB module throws if absent. |
| `SESSION_SECRET` | Express session signing key. Must be a long, random string. Server throws if absent. |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`). `validateBillingConfig()` throws on startup if missing. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`). Required by `validateBillingConfig()`. |

### 4b. Required for core functionality — server starts but features break without these

| Variable | Description | Fallback behavior |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key for all AI generation. | AI calls fail; chat returns errors. |
| `SENDGRID_API_KEY` | SendGrid key for transactional email. | Email silently skipped; DB records still saved. |

### 4c. Optional — set for enhanced behavior

| Variable | Default / Fallback | Description |
|---|---|---|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Falls back to `OPENAI_API_KEY` | Replit AI integration key (Replit injects this if the OpenAI integration is wired). If `OPENAI_API_KEY` is set, it takes precedence. |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | `https://api.openai.com/v1` | Custom base URL for OpenAI-compatible endpoints. Only used if `OPENAI_API_KEY` is not set. |
| `STRIPE_PUBLISHABLE_KEY` | None | Sent to the frontend for Stripe Elements. Optional at server level. |
| `STRIPE_PRICE_TRAINCHAT_MONTHLY` | None (uses Stripe lookup keys) | Price ID fallback for webhook detection. See §6. |
| `STRIPE_PRICE_STARTER_MONTHLY` | None | Legacy plan price ID fallback. |
| `STRIPE_PRICE_STARTER_YEARLY` | None | Legacy plan price ID fallback. |
| `STRIPE_PRICE_PRO_MONTHLY` | None | Legacy plan price ID fallback. |
| `STRIPE_PRICE_PRO_YEARLY` | None | Legacy plan price ID fallback. |
| `STRIPE_PRICE_ELITE_MONTHLY` | None | Legacy plan price ID fallback. |
| `STRIPE_PRICE_ELITE_YEARLY` | None | Legacy plan price ID fallback. |
| `EMAIL_FROM` | `Bryan.jones@efficiencystrengthtraining.com` (in `.replit`) | Sender address for transactional email. |
| `EMAIL_SUPPORT_TO` | `Bryan.jones@trainchat.ai` (in `.replit`) | Internal address for support/bug/feature request emails. |
| `CLIENT_URL` | `https://trainchat.ai` | Used in retention email CTAs. |
| `APP_URL` | None | Used for link generation in some routes. |
| `ADMIN_SECRET` | Set in `.replit [userenv.production]` | Bearer token for `/api/admin/*` routes. |
| `ADMIN_EMAILS` | None | Comma-separated list of admin email addresses. |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`). |
| `NODE_ENV` | `development` | Set to `production` in production. Affects cookie security and debug route availability. |
| `DEBUG_RESET_ENABLED` | `false` | Set to `true` only in non-production to enable `/api/debug/*` routes. Never set in production. |
| `BILLING_RECONCILIATION_INTERVAL_MS` | `86400000` (24h) | How often the billing reconciliation cron runs. |
| `BILLING_RECONCILIATION_THRESHOLD_DAYS` | `3` | How many days past_due before reconciliation triggers. |
| `META_CAPI_TOKEN` | None | Meta Conversions API token. If absent, CAPI events are skipped. |
| `PUBMED_EMAIL` | `research@trainchat.app` | Email for PubMed API politeness header. |
| `PUBMED_API_KEY` | None | PubMed API key (higher rate limits). Without it, the unauthenticated rate limit applies. |
| `SEMANTIC_SCHOLAR_API_KEY` | None | Semantic Scholar API key. Without it, anonymous rate limits apply. |
| `RESEARCH_DISCOVERY_ENABLED` | `false` | Set to `true` to enable automated research discovery on startup. |
| `LOG_LANGUAGE_AUDIT` | `false` | Enable verbose language-layer audit logging. |
| `LOG_RESPONSE_POLICY_AUDIT` | `false` | Enable verbose response policy audit logging. |

### 4d. Shared env vars already in `.replit [userenv.shared]`

These are committed to the repo in `.replit` and are not secrets:

```
STRIPE_PRICE_STARTER_MONTHLY   = price_1TU6FyGOcsf8J09lot01Ih0x
STRIPE_PRICE_STARTER_YEARLY    = price_1TU6FzGOcsf8J09ljmm1v6VT
STRIPE_PRICE_PRO_MONTHLY       = price_1TU6G0GOcsf8J09lZDwHKJw7
STRIPE_PRICE_PRO_YEARLY        = price_1TU6G0GOcsf8J09lSi6pmaMK
STRIPE_PRICE_ELITE_MONTHLY     = price_1TU6G1GOcsf8J09lww9pih1g
STRIPE_PRICE_ELITE_YEARLY      = price_1TU6G2GOcsf8J09l1QtpEvW2
EMAIL_FROM                     = Bryan.jones@efficiencystrengthtraining.com
EMAIL_SUPPORT_TO               = Bryan.jones@trainchat.ai
STRIPE_PRICE_TRAINCHAT_MONTHLY = price_1Tn35DGOcsf8J09luBjtpksA
```

Production-only (also in `.replit`):
```
ADMIN_SECRET = eeb65552cd109f4d4c0e2115728b58620a66c018f8a8751adb359e2585dab641
```

---

## 5. Database

- **Engine:** PostgreSQL 16, managed by Replit
- **ORM:** Drizzle ORM 0.45.x
- **Schema location:** `lib/db/src/schema/`
- **Connection:** `@workspace/db` package exports `pool` and `db`; reads `DATABASE_URL` at import time and throws if missing

### Applying schema changes

```bash
# Push schema to the live database (Replit shell)
pnpm --filter db push
```

This is `drizzle-kit push` — it introspects the live DB and applies the diff. There are no numbered migration files. This runs automatically on every merge via `scripts/post-merge.sh`.

**Warning:** `drizzle-kit push` will prompt for confirmation on destructive changes (column drops, table drops). The post-merge script's 20-second timeout will cause it to fail if it hangs waiting for input. If you need to apply a destructive schema change:
```bash
# Force-push without confirmation prompt (use with extreme care)
pnpm --filter db push-force
```
Only use `push-force` when you have confirmed the change is safe and tested it against a dev snapshot first.

### Session table

Sessions are stored in a `user_sessions` table via `connect-pg-simple`. The table is created automatically (`createTableIfMissing: true`) on first startup — no manual migration needed.

### Checking DB connectivity

```bash
# In Replit shell
node -e "import('@workspace/db').then(m => m.pool.query('SELECT 1').then(() => console.log('DB OK')).catch(e => console.error('DB FAIL', e)))"
```

---

## 6. Stripe Setup

Stripe is initialized in `artifacts/api-server/src/index.ts` via `stripe-replit-sync`. The server validates Stripe config before binding to the port.

### Required secrets

| Secret | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Auto-configured by `stripe-replit-sync` (see below) |

### Webhook auto-configuration

On startup, the server calls `stripeSync.findOrCreateManagedWebhook()` with the URL:
```
https://<first-domain-in-REPLIT_DOMAINS>/api/stripe/webhook
```

This means the webhook endpoint is **self-registered** using the Replit deployment domain. No manual Stripe Dashboard webhook setup is needed unless `REPLIT_DOMAINS` is wrong or the webhook needs to target a custom domain.

### Product and price setup

If prices don't yet exist in Stripe, or you need to initialize a new environment:
```bash
pnpm --filter @workspace/scripts run stripe:setup-products
```
This script is idempotent — safe to re-run. It prints `STRIPE_PRICE_*` values at the end; copy them to Replit Secrets (they are already set in `.replit [userenv.shared]` for the primary environment).

### Price lookup keys

The primary price detection mechanism uses Stripe `lookup_key` values (e.g. `trainchat_pro_monthly`). The `STRIPE_PRICE_*` env vars are a fallback for webhook plan detection on existing subscribers. The server warns in logs if they are missing but does not fail.

### Billing reconciliation

A cron job runs daily (configurable via `BILLING_RECONCILIATION_INTERVAL_MS`) to sync `past_due` users whose webhook events may have been missed. This starts automatically on server startup.

---

## 7. SendGrid / Email Setup

Email is non-fatal — if `SENDGRID_API_KEY` is missing, email is skipped and a warning is logged. DB records (support submissions, bug reports) are always saved regardless.

### Setup

1. Create a SendGrid API key with `Mail Send` permissions
2. Add to Replit Secrets: `SENDGRID_API_KEY=SG.xxxxxxxx`
3. Verify `EMAIL_FROM` is a SendGrid-verified sender address (currently set in `.replit`)

### Email types sent

| Trigger | Recipient | Template |
|---|---|---|
| New registration | User | Welcome email |
| First program built | User | "Your training system is live" |
| Week transition | User | "Week N is ready" |
| 48h inactivity | User | "Your next session is waiting" |
| Support submission | Admin + User | Support confirmation pair |
| Bug report | Admin + User | Bug confirmation pair |
| Feature request | Admin + User | Feature request confirmation pair |
| Password reset | User | Password reset link |

### Verifying email works

```bash
# From Replit shell — triggers a test support email
curl -X POST https://<your-domain>/api/support \
  -H "Content-Type: application/json" \
  -d '{"type":"contact","name":"Test","email":"test@example.com","message":"deployment verification"}'
```

Check `EMAIL_SUPPORT_TO` inbox and the server logs for `[Email] support-admin delivered`.

---

## 8. OpenAI Setup

All AI generation (program creation, editing, routing, memory extraction, intent interpretation) uses OpenAI.

### Models in use

| Role | Model |
|---|---|
| Core generation (chat, programs, edits) | `gpt-4.1` |
| Routing, intent interpretation | `gpt-4.1-mini` |
| Memory extraction | `gpt-4.1-mini` |

Source: `artifacts/api-server/src/lib/openai-models.ts`

### Key resolution order

```
OPENAI_API_KEY (direct)
  → falls through to AI_INTEGRATIONS_OPENAI_API_KEY (Replit integration)
  → base URL: OPENAI_API_KEY present → api.openai.com/v1
             OPENAI_API_KEY absent  → AI_INTEGRATIONS_OPENAI_BASE_URL ?? api.openai.com/v1
```

If neither key is set, all AI calls will fail with 401. The server will start but chat will return errors.

### Verifying AI works

After deployment, open a conversation and type: `Build me a 3-day strength program.`

A successful response streams back a structured program. Failure modes: 401 (key missing/wrong), 429 (rate limit), timeout.

---

## 9. Optional Integrations

### Meta Conversions API (CAPI)

Set `META_CAPI_TOKEN` to send conversion events to Meta. If absent, CAPI routes return early and log a warning. Not required for core functionality.

### Research Discovery

Set `RESEARCH_DISCOVERY_ENABLED=true` to enable automated PubMed/Semantic Scholar research ingestion on startup. Requires the coaching knowledge and whitepaper seeders to have run first. Default is `false` — leave off unless actively maintaining the research corpus.

Optional: `PUBMED_API_KEY` and `SEMANTIC_SCHOLAR_API_KEY` for higher rate limits.

---

## 10. Post-Merge Script

**File:** `scripts/post-merge.sh`  
**Triggered by:** `.replit [postMerge]` on every GitHub → Replit merge  
**Timeout:** 20 seconds

```bash
#!/bin/bash
set -e
pnpm install --frozen-lockfile   # install/update all workspace dependencies
pnpm --filter db push            # push Drizzle schema to the live database
```

**What can go wrong:**

| Problem | Symptom | Fix |
|---|---|---|
| `pnpm install` fails | Lockfile mismatch | Run `pnpm install` locally, commit the updated `pnpm-lock.yaml` |
| `drizzle-kit push` prompts for destructive confirmation | Script hangs, times out after 20s | Run `pnpm --filter db push-force` manually in Replit shell, or use `pnpm --filter db push-force` in the script for that change (then revert) |
| Script exits 1 on non-zero | Any step fails | Check Replit shell for error output |

---

## 11. Server Startup Sequence

`artifacts/api-server/src/index.ts` runs these steps in order at startup:

1. **Read `PORT`** — throws immediately if missing
2. **`validateBillingConfig()`** — throws (exits process) if `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` are missing
3. **`initStripe()`** — runs Stripe schema migrations, registers webhook, starts sync backfill, starts billing reconciliation cron. Failures here log a warning but do NOT crash the server.
4. **`seedExerciseLibraryIfEmpty()`** — seeds exercise library if no exercises exist yet
5. **`seedCoachingKnowledgeIfEmpty()`** — seeds coaching knowledge base if empty
6. **`seedWhitepaperPublicationsIfMissing()`** — seeds whitepaper publication metadata if empty
7. **`app.listen(port)`** — binds to port; logs `Server listening` on success

**Critical failures (server exits):**
- `PORT` missing
- `DATABASE_URL` missing (thrown at import time by `@workspace/db`)
- `SESSION_SECRET` missing (thrown at import time by `session.ts`)
- `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` missing

**Non-fatal failures (server continues, features degrade):**
- Stripe initialization error (payments unavailable, logged as warn)
- Seed failures (data may be incomplete, logged as error)

**Health check endpoint:** `GET /healthz` → `{ "status": "ok" }` (no auth required)

---

## 12. Autoscale Behavior

TrainChat runs on Replit Autoscale (`deploymentTarget = "autoscale"`). Important implications:

- **Instances scale to zero** when there is no traffic. Cold start latency on first request after idle: ~2–5 seconds.
- **In-memory state is NOT shared across instances.** The conversation context resolver (tracks exercise/session references across turns) and the external API rate limiter are both in-memory. Under autoscale with multiple active instances, these may produce inconsistent behavior. This is tracked as `DR-0020` / `DR-0038`.
- **Sessions ARE durable.** Sessions are stored in the `user_sessions` PostgreSQL table, so users are not logged out when instances restart.
- **Stripe sync backfill and billing reconciliation run per-instance.** Under autoscale, multiple instances could run these concurrently. This is generally safe (idempotent Stripe reads) but may produce duplicate log entries.
- **Do not rely on local filesystem for state.** Any file written to the container filesystem is lost on instance restart.

---

## 13. Pre-Deployment Checklist

Run through this before every production deployment. Check off each item — do not deploy if any item is unchecked.

### Code Quality
- [ ] Unit tests pass: `pnpm --filter @workspace/api-server test`
- [ ] TypeScript compiles without new errors: `pnpm typecheck` (pre-existing TS6305 errors from unbuilt lib/db are expected — treat any NEW errors as blockers)
- [ ] No `console.log` calls added to production paths (use `logger.info/warn/error`)

### Integration Verification
- [ ] Integration tests pass against the Replit database: `pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts`
- [ ] Any new database operations verified against the live DB before marking a fix resolved (do not mark discrepancies resolved based on unit tests alone)

### Database
- [ ] Schema changes reviewed — confirm no destructive changes (column drops, table drops) without a backup plan
- [ ] If destructive changes: confirmed behavior tested against a dev data snapshot
- [ ] `pnpm --filter db push` runs cleanly without prompts (or documented reason it requires `push-force`)

### Environment Variables
- [ ] All required secrets are set in Replit Secrets: `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`
- [ ] `SENDGRID_API_KEY` set (or explicitly accepted that email will be disabled)
- [ ] `NODE_ENV=production` set for the production environment
- [ ] `DEBUG_RESET_ENABLED` is NOT set to `true` in production

### Stripe
- [ ] `STRIPE_SECRET_KEY` is the LIVE key (not `sk_test_`) in production
- [ ] Stripe webhook will be auto-configured to the correct `REPLIT_DOMAINS` value
- [ ] Stripe price IDs in `.replit [userenv.shared]` match the live Stripe dashboard

### Email
- [ ] `SENDGRID_API_KEY` is valid and has `Mail Send` permissions
- [ ] `EMAIL_FROM` is a verified sender in SendGrid

### Core User Flows (manual smoke test)
- [ ] Anonymous user flow: visit app → conversation starts → program generation works
- [ ] Registration: anonymous → register → data preserved (DR-0025 fixed, verify with new accounts)
- [ ] Login: existing user → login → program visible
- [ ] Program generation: "Build me a 3-day strength program" → structured program appears
- [ ] Payment/subscription flow: upgrade button → Stripe checkout → subscription active

---

## 14. Deployment Steps

### Normal deployment (code-only changes, no schema changes)

```bash
# 1. On your local machine
git add <files>
git commit -m "your message"
git push origin main

# 2. Replit picks up the push automatically
# post-merge.sh runs: pnpm install --frozen-lockfile && pnpm --filter db push
# Replit rebuilds and restarts the server

# 3. Verify in Replit logs
# Look for: "Server listening" and no startup errors
```

### Deployment with schema changes

```bash
# 1. Push code to main (same as above)
# 2. If drizzle-kit push prompts for destructive confirmation, it will time out
# 3. Run manually in Replit shell if needed:
pnpm --filter db push
# or for destructive changes:
pnpm --filter db push-force

# 4. Restart the server in Replit if it didn't auto-restart
```

### First-time environment setup (new Replit environment)

```bash
# 1. Clone the repo in Replit (or connect via GitHub integration)
# 2. Set all required secrets in Replit Secrets panel:
#    PORT (injected), DATABASE_URL (injected), SESSION_SECRET, STRIPE_SECRET_KEY,
#    STRIPE_WEBHOOK_SECRET, OPENAI_API_KEY, SENDGRID_API_KEY
# 3. Install dependencies:
pnpm install
# 4. Push schema to the new DB:
pnpm --filter db push
# 5. Set up Stripe products and prices (first time only):
pnpm --filter @workspace/scripts run stripe:setup-products
# 6. Start the server:
pnpm dev
```

---

## 15. Post-Deployment Verification

Run these checks after every deployment before considering it complete.

### Automated

```bash
# Health check (no auth required)
curl https://<your-domain>/healthz
# Expected: {"status":"ok"}

# DR-0025 integration test (run in Replit shell)
pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts
# Expected: 61 passed, 0 failed
```

### Manual smoke tests

| Test | How | Expected |
|---|---|---|
| Server is up | `GET /healthz` | `{"status":"ok"}` |
| Anonymous bootstrap | `POST /auth/bootstrap` | Returns `userId`, `isAnonymous: true` |
| Program generation | Open app, type "Build me a 3-day strength program" | Structured program appears in chat + right panel |
| Registration | Register a new account from anonymous | No data loss, user is logged in |
| Login | Log in with existing account on new session | Previous programs visible |
| Stripe billing portal | Click upgrade in app | Stripe checkout loads |
| Email | Submit a support form | Check `EMAIL_SUPPORT_TO` inbox |

### Log verification

In Replit shell logs, after startup you should see:
```
Server listening {"port": <PORT>}
Initializing Stripe schema...
Stripe schema ready
Stripe webhook configured
Stripe data synced
[BillingConfig] All Stripe environment variables are present
```

No `ERROR` lines during startup is the goal. `WARN` lines about optional features (SENDGRID, price IDs) are acceptable.

---

## 16. Rollback Procedure

Replit Autoscale does not support instant traffic shifting. The rollback path is a git revert.

### Step 1: Identify the last good commit
```bash
git log --oneline -10
```

### Step 2: Revert the bad commit(s)
```bash
# Revert a single commit (creates a new commit, safe for shared history)
git revert <bad-commit-sha>
git push origin main

# Revert a range of commits
git revert <oldest-bad-sha>..<newest-bad-sha>
git push origin main
```

Pushing to main triggers the post-merge hook, which will reinstall and restart.

### Step 3: If schema was changed
If a schema change (via `drizzle-kit push`) caused the issue, you cannot auto-rollback the database via git revert alone. You must:
1. Identify the schema change that was applied
2. Apply the inverse change manually (add back dropped column, etc.)
3. Run `pnpm --filter db push` manually

**There is no automated schema rollback.** This is a known gap in the current deployment setup. For destructive schema changes, take a DB snapshot before applying.

### Step 4: Verify rollback
- Check `GET /healthz` returns `{"status":"ok"}`
- Verify the broken behavior is gone
- Confirm sessions and user data are intact

---

## 17. Common Failure Modes

### Server exits immediately on startup

| Error message | Cause | Fix |
|---|---|---|
| `PORT environment variable is required` | `PORT` not set | Replit should inject this automatically; check if running outside Replit |
| `DATABASE_URL must be set` | DB not provisioned or secret missing | Check Replit Secrets / DB provisioning |
| `SESSION_SECRET environment variable is required` | Secret not set | Add `SESSION_SECRET` to Replit Secrets |
| `FATAL: Missing required Stripe environment variables` | `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` missing | Add to Replit Secrets |

### Server starts but AI doesn't work

- `401 Unauthorized` from OpenAI → `OPENAI_API_KEY` missing, wrong, or expired
- `429 Too Many Requests` → rate limit hit; check usage on OpenAI dashboard
- Check server logs for `openai` error entries

### Email not sending

- Check logs for `[Email] SendGrid not configured — ... skipped. Set SENDGRID_API_KEY to enable.`
- If key is set but email fails: check SendGrid dashboard for delivery errors; verify sender is verified

### Stripe webhook not receiving events

- Webhook URL is auto-registered from `REPLIT_DOMAINS`; if the domain changed, restart the server to re-register
- Check Stripe Dashboard → Webhooks for delivery failures
- Verify `STRIPE_WEBHOOK_SECRET` matches the registered webhook's signing secret

### `drizzle-kit push` hangs during post-merge

- Cause: destructive schema change requires confirmation
- Timeout after 20 seconds; post-merge script exits 1
- Fix: run `pnpm --filter db push-force` manually in Replit shell

### `pnpm install --frozen-lockfile` fails

- Cause: `pnpm-lock.yaml` is out of sync with `package.json`
- Fix: run `pnpm install` locally, commit the updated lockfile

### Session store errors in logs

- `connect-pg-simple` writes sessions to `user_sessions` table
- If the table doesn't exist: should create itself on first use (`createTableIfMissing: true`)
- If errors persist: check DB connectivity and permissions

### Anonymous user merge fails

- Fixed as of 2026-06-30 (DR-0025). If merge failures reappear, check `anonymousMerge.ts` and run `scripts/integration-test-dr0025.ts`

---

## 18. Debugging Commands

All commands run in the Replit shell unless noted.

```bash
# Health check
curl https://<your-domain>/healthz

# Check DB connectivity
node -e "import('@workspace/db').then(m => m.pool.query('SELECT 1').then(() => console.log('DB OK')).catch(e => console.error('DB FAIL', e)))"

# Run unit tests
pnpm --filter @workspace/api-server test

# Run DR-0025 integration test
pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts

# Push DB schema manually
pnpm --filter db push

# Force-push DB schema (destructive — use with care)
pnpm --filter db push-force

# Build api-server manually
pnpm --filter @workspace/api-server run build

# Start server in dev mode (with build step)
pnpm --filter @workspace/api-server run dev

# Seed exercise library (idempotent)
pnpm --filter @workspace/api-server run seed:products

# Reset dev programs (dev only — do not run in production)
pnpm --filter @workspace/api-server run reset:dev-programs

# Run a one-off script with tsx
pnpm --filter @workspace/api-server exec tsx scripts/<script-name>.ts

# Check TypeScript errors
pnpm typecheck

# View installed package versions
pnpm list --filter @workspace/api-server
```

### Useful log patterns to grep for

```bash
# In Replit logs panel, filter for:
"Server listening"          # startup success
"Billing configuration"     # Stripe config status
"Stripe webhook configured" # webhook registered
"anonymousMerge: complete"  # successful merges
"[Email]"                   # email delivery status
"ERROR"                     # any error
```

---

## 19. Incident Response Notes

### If users report being logged out

Sessions are stored in PostgreSQL (`user_sessions` table). If users are being logged out:
1. Check DB connectivity — if the DB is unreachable, sessions can't be read
2. Check `SESSION_SECRET` hasn't changed — changing it invalidates all existing sessions
3. Check `user_sessions` table exists and has rows
4. Cookie settings: `secure: true` and `sameSite: "none"` in production (required for HTTPS); if cookies are being rejected, check `NODE_ENV` and `REPLIT_DOMAINS`

### If users report losing their training data after login

This was the DR-0025 bug (anonymous→registered merge data loss). It was fixed 2026-06-30. If it reappears:
1. Run `scripts/integration-test-dr0025.ts` to verify the fix is still in place
2. Check `artifacts/api-server/src/lib/anonymousMerge.ts` hasn't been reverted
3. Look for merge errors in logs: `anonymousMerge: skipping` or transaction failures

### If billing is broken (subscriptions not activating)

1. Check Stripe webhook delivery in Stripe Dashboard
2. Look for `webhookHandlers` errors in server logs
3. Verify `STRIPE_WEBHOOK_SECRET` matches the webhook signing secret in Stripe Dashboard
4. Run billing reconciliation manually if needed (it runs automatically daily)
5. Check `STRIPE_PRICE_*` env vars match the active Stripe prices

### If AI generation is failing for all users

1. Check `OPENAI_API_KEY` is set and valid
2. Check OpenAI status page and your account's usage limits
3. Look for OpenAI 401/429 errors in server logs
4. `gpt-4.1` is the primary model — check if OpenAI has changed model availability

---

## 20. AI Agent Safety Rules

**Read this section before making any changes to the TrainChat codebase.**

These rules exist because TrainChat has a live user database, real Stripe billing, and a production AI generation pipeline. Mistakes here have real consequences (data loss, billing errors, broken programs).

### Never do this

- **Do not mark a bug as resolved based on unit tests alone.** Unit tests mock the database. Runtime behavior is what matters. Every fix to a data path (merge, migration, mutation) requires verification against the live Replit database before the discrepancy can be marked resolved. See DR-0025 as the standard: code fix + unit tests + integration test all three are required.

- **Do not deploy after only static analysis.** TypeScript compiling does not mean the server starts. The server does not starting does not mean core flows work. Always verify the startup sequence and at least one core user flow after any non-trivial change.

- **Do not edit `dist/` files directly.** `dist/` is generated by esbuild from `src/`. Changes to `dist/` are overwritten on the next build. Edit `src/` only.

- **Do not change `scripts/post-merge.sh` without understanding the timeout.** The post-merge script has a 20-second timeout. Commands that prompt for input (like `drizzle-kit push` on destructive changes) will hang and fail. Document any changes to this script in this file.

- **Do not add `DEBUG_RESET_ENABLED=true` to production secrets.** This enables routes that can reset anonymous user state. It is only safe in non-production environments.

- **Do not change `SESSION_SECRET` in production.** Changing it immediately invalidates all existing user sessions, logging out every user.

- **Do not change `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` without a coordinated cutover.** Changing the webhook secret invalidates in-flight webhook deliveries from Stripe.

### Always do this

- **Confirm environment variables before debugging code.** Most production failures are missing or wrong env vars, not code bugs. Check secrets first.

- **Run the integration test after any change to database-touching code.** `pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts` verifies the anonymous merge path. Add new integration tests for new critical paths.

- **Check the Discrepancy Register (`docs/documentation-governance.md §5`) before implementing a fix.** If the behavior you're fixing is a known divergence, the register has context on why it exists and what the intended fix is.

- **Update CLAUDE.md and this file when deployment behavior changes.** The post-merge script, env var requirements, and startup sequence are documented here because they have caused production incidents. Keep them accurate.

- **After any schema change, verify the post-merge script completes without timing out** in Replit before considering the deployment done.

- **Verify runtime behavior in the Replit environment.** Your local machine does not have the same `DATABASE_URL`, `REPLIT_DOMAINS`, or Stripe webhook configuration as production. Behavior that works locally may fail in the deployed environment for reasons that are invisible to local testing.
