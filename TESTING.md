# TrainChat — Testing Guide

> **Who this is for:** engineers and AI coding agents adding features, fixing bugs, or verifying
> changes to TrainChat before deployment.
>
> **AI agent?** Read [§12 — AI Agent Testing Rules](#12-ai-agent-testing-rules) before making
> any changes.

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Test Inventory](#2-test-inventory)
3. [Running All Tests](#3-running-all-tests)
4. [Running Targeted Tests](#4-running-targeted-tests)
5. [What Each Suite Covers](#5-what-each-suite-covers)
6. [Testing AI and Program Generation](#6-testing-ai-and-program-generation)
7. [Testing Auth and Anonymous Merge](#7-testing-auth-and-anonymous-merge)
8. [Testing Stripe and Billing](#8-testing-stripe-and-billing)
9. [Testing Email (SendGrid)](#9-testing-email-sendgrid)
10. [Testing the External API](#10-testing-the-external-api)
11. [What Must Pass Before Deployment](#11-what-must-pass-before-deployment)
12. [AI Agent Testing Rules](#12-ai-agent-testing-rules)
13. [Known Coverage Gaps](#13-known-coverage-gaps)
14. [Recommended Next Tests](#14-recommended-next-tests)

---

## 1. Testing Philosophy

TrainChat has two correctness dimensions that must both be verified:

**Code correctness** — does the code do what it's supposed to do?
**Training science validity** — does the AI generate programs that are coherent and safe?

Unit tests cover code logic. The scenario replay and manual smoke tests cover training science validity. Neither alone is sufficient for a production release.

### The testing hierarchy

| Layer | What it verifies | Speed | Required for deploy? |
|---|---|---|---|
| **Unit tests** (Vitest) | Logic, parsing, intent classification, billing math, constraint handling | ~10 seconds | Yes |
| **Frontend component tests** (Vitest + jsdom) | UI rendering, SSE event handling, thinking UX | ~15 seconds | Yes |
| **Integration tests** (live DB) | Database operations, cascade behavior, transaction atomicity | ~30 seconds | Yes (for DB-touching changes) |
| **Scenario replay** (live server) | Full AI pipeline: build, edit, guidance, constraints, memory, messy input | ~5–15 minutes | Recommended before AI changes |
| **Manual smoke tests** | User-facing flows end-to-end: register, generate, edit, pay | 5–10 minutes | Always |

### Key rule: unit tests do not replace runtime verification

Unit tests mock the database, the AI, and external services. They verify that logic branches
work correctly given mocked inputs. They do NOT verify:
- Whether a database operation is safe given real PostgreSQL cascade behavior
- Whether an AI-generated program passes training science validation
- Whether a Stripe webhook is correctly signed and routed
- Whether session cookies behave correctly behind Replit's HTTPS reverse proxy

Every change to a production-risk area (auth, billing, memory, mutations, deployment) requires
runtime verification in Replit in addition to passing unit tests.

---

## 2. Test Inventory

### Unit and component tests (Vitest)

**Total: ~1,472 test cases across 36 files**

| Location | Files | Cases | What it covers |
|---|---|---|---|
| `artifacts/api-server/src/__tests__/` | 6 | ~214 | Anonymous merge, prescription remap, sport detection/fit/normalization, session stimulus redistribution |
| `artifacts/api-server/src/lib/__tests__/` | 28 | ~1,213 | Language system, intent classification, billing, constraints, mutations, memory, context, coaching quality |
| `artifacts/api-server/src/research/__tests__/` | 2 | ~25 | Research quality scoring, retriever diversity |
| `artifacts/trainchat/src/__tests__/` | 2 | ~55 | AgentThinking UI component, phase 4 UX behaviors |

### Integration tests (live database)

| Script | Location | Cases | Requires |
|---|---|---|---|
| `integration-test-dr0025.ts` | `artifacts/api-server/scripts/` | 61 assertions | Live Replit DB (`DATABASE_URL`) |

### Runtime verification scripts (live server required)

| Script | Location | Scenarios | Requires |
|---|---|---|---|
| `scenario-replay.ts` | `artifacts/api-server/` | ~35 AI scenarios | Running server at `localhost:8080` |
| `language-coverage-test.ts` | `artifacts/api-server/scripts/` | ~60 language inputs | No server (pure logic) |
| `response-policy-test.ts` | `artifacts/api-server/scripts/` | ~30 policy cases | No server (pure logic) |

### Setup and audit scripts (not tests — setup/verification tools)

| Script | Location | Purpose |
|---|---|---|
| `e2e-webhook-test.ts` | `scripts/src/` | Replays real Stripe webhook events against a running server |
| `audit-phase1.ts` | `scripts/src/` | Validates Stripe products, prices, and lookup keys against the live Stripe account |
| `seed-products.ts` | `artifacts/api-server/scripts/` | Seeds billing plans into the database (idempotent) |
| `reset-dev-programs.ts` | `artifacts/api-server/scripts/` | Clears dev programs for testing clean-slate flows |

---

## 3. Running All Tests

### CI (GitHub Actions)

GitHub Actions runs on every pull request and every push to `main`. It validates the
repository without external services. Check the `.github/workflows/ci.yml` badge or the
**Actions** tab on GitHub to see CI status.

**What CI validates automatically:**

| Check | Command |
|---|---|
| Frozen lockfile (pnpm-lock.yaml in sync) | `pnpm install --frozen-lockfile` |
| Dependency audit (high/critical advisories) | `pnpm audit --audit-level=high` |
| TypeScript — libs + all artifacts | `pnpm typecheck` |
| Unit tests — api-server (~1,472 cases) | `pnpm --filter @workspace/api-server run test` |
| Unit tests — trainchat (~55 cases) | `pnpm --filter @workspace/trainchat run test` |
| Build — api-server (esbuild) | `pnpm --filter @workspace/api-server run build` |
| Build — trainchat (Vite) | `pnpm --filter @workspace/trainchat run build` |

**What CI intentionally does NOT validate** (requires Replit or external services):

| Check | Why excluded | How to run manually |
|---|---|---|
| OpenAI scenario replay | Live API key + running server | `pnpm exec tsx scenario-replay.ts` in Replit |
| DR-0025 integration test | Live PostgreSQL | `pnpm exec tsx scripts/integration-test-dr0025.ts` in Replit |
| Stripe e2e | Live Stripe key | `pnpm exec tsx src/e2e-webhook-test.ts` |
| SendGrid delivery | Live SendGrid key | Submit support form, check inbox |
| Session / cookie behavior | Replit HTTPS proxy required | Open Replit preview, log in, refresh |
| Autoscale behavior | Replit deployment required | Deploy to Replit, test under load |

CI is deterministic. It does not call external APIs, connect to databases, or depend on
environment-specific secrets. A clean clone with no manual intervention should pass.

### Backend unit tests

```bash
# Run all backend unit tests (Vitest)
pnpm --filter @workspace/api-server test

# With verbose output
pnpm --filter @workspace/api-server exec vitest run --reporter=verbose

# Watch mode (re-runs on file change — useful during development)
pnpm --filter @workspace/api-server exec vitest
```

Expected: all ~1,472 cases pass. Runtime: ~10 seconds.

### Frontend component tests

```bash
# Run frontend component tests
pnpm --filter @workspace/trainchat test
```

Expected: 55 cases pass. Runtime: ~15 seconds.

### All tests (backend + frontend)

```bash
# Run both from the workspace root
pnpm --filter @workspace/api-server test && pnpm --filter @workspace/trainchat test
```

### Integration tests (requires Replit DB)

```bash
# In Replit shell — requires DATABASE_URL to be set
pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts
```

Expected: 61 assertions pass, exit code 0. Creates and cleans up test users automatically.

### TypeScript typecheck

```bash
# Check all TypeScript (libs first, then artifacts)
pnpm typecheck

# Expected: no new errors. Pre-existing TS6305 errors from unbuilt lib/db are known and expected.
# Any error not present before your change is a blocker.
```

---

## 4. Running Targeted Tests

### Run a single test file

```bash
pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/webhook-billing.test.ts
pnpm --filter @workspace/api-server exec vitest run src/__tests__/anonymousMerge.test.ts
```

### Run tests matching a pattern

```bash
# Run all tests with "billing" in the name
pnpm --filter @workspace/api-server exec vitest run --reporter=verbose -t "billing"

# Run all tests in a describe block
pnpm --filter @workspace/api-server exec vitest run -t "detectPlanFromLookupKey"
```

### Run a specific subsystem's tests

```bash
# Mutation pipeline tests
pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/mutation-ontology.test.ts src/lib/__tests__/mutation-audit-receipt.test.ts src/lib/__tests__/action-contract.test.ts

# Language system tests
pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/p0-intent-families.test.ts src/lib/__tests__/phase3-p1-families.test.ts src/lib/__tests__/adjustment-intent.test.ts

# Constraint and memory tests
pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/constraint-memory.test.ts src/lib/__tests__/constraint-reinforcement.test.ts src/lib/__tests__/exercise-constraint-filter.test.ts

# Billing tests
pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/webhook-billing.test.ts src/lib/__tests__/billing-access-control.test.ts
```

### Run the language coverage harness (no server needed)

```bash
# From artifacts/api-server/
pnpm exec tsx scripts/language-coverage-test.ts

# Shows: raw input → normalized concepts → structured intent → confidence
# for ~60 English coaching inputs. Good for verifying language system changes.
```

### Run the response policy harness (no server needed)

```bash
# From artifacts/api-server/
pnpm exec tsx scripts/response-policy-test.ts

# Shows: intent profile → resolved ResponsePolicy → example response draft
# for ~30 policy scenarios. Good for verifying routing changes.
```

---

## 5. What Each Suite Covers

### `anonymousMerge.test.ts` — 18 cases

The DR-0025 fix: anonymous→registered user data migration. Tests:
- Full migration of all 12 child tables (TC-01)
- `user_profiles` conflict — target profile preserved (TC-02)
- `user_profiles` no conflict — anonymous profile moved (TC-03)
- `neural_profiles` conflict — additive XP/session merge, score max, milestone union (TC-04)
- `neural_profiles` no conflict — row reassigned (TC-05)
- In-place upgrade no-op (TC-06)
- Anonymous user not found (TC-07)
- Source is not anonymous (TC-08)
- No child data (TC-09)
- Transaction wrapping + delete-after-updates ordering (TC-10)
- Transaction rollback on failure (TC-11)
- Regression tests for conversations, training_systems, saved_programs (TC-12–14)
- Neural XP math verification (TC-15)

**All mocked** — use `integration-test-dr0025.ts` for live DB verification.

### `webhook-billing.test.ts` — 57 cases

Stripe billing pipeline:
- `detectPlanFromLookupKey()` — new plan + all legacy formats + invalid inputs
- `detectIntervalFromPriceId()` — lookup_key path and env-var fallback
- `normalizePlanStatus()` — every Stripe subscription status (`active`, `past_due`, `canceled`, etc.)
- `buildSyncPayload()` — happy path, missing customer, missing price, unknown lookup_key throws
- `processWebhook()` — signature validation, unhandled event types, duplicate event idempotency, dispatch routing

**All mocked** — use `e2e-webhook-test.ts` for live Stripe verification.

### `billing-access-control.test.ts` — 25 cases

Plan-gated feature access:
- Plan tier detection from subscription status
- Feature flag resolution per plan (which features each tier unlocks)
- Access denial for free users on premium features
- Upgrade prompt triggers

### `p0-intent-families.test.ts` — 105 cases  
### `phase3-p1-families.test.ts` — 114 cases  
### `adjustment-intent.test.ts` — 65 cases

Intent classification: whether a user message routes to CREATE_PROGRAM, MODIFY_BLOCK,
SWAP_EXERCISE, REBUILD_PROGRAM, GUIDANCE, ASK_CLARIFICATION, etc. These tests cover the
language → action routing layer that determines what the AI does with each message.

### `constraint-memory.test.ts` — 31 cases  
### `constraint-reinforcement.test.ts` — 24 cases  
### `exercise-constraint-filter.test.ts` — 45 cases

Memory-driven constraint handling: that equipment limits, injury flags, and permanent
preferences are correctly stored, reinforced, and applied to exercise selection.

### `mutation-ontology.test.ts` — 34 cases  
### `mutation-audit-receipt.test.ts` — 27 cases  
### `action-contract.test.ts` — 42 cases

Mutation pipeline: that program edits are correctly classified, contracted, and audited.

### `conversation-context-resolver.test.ts` — 26 cases

Deictic reference resolution: that "change that exercise", "do the same for Day 2", and
"undo that" are correctly resolved to specific exercises, sessions, and mutations.

### `prescription-remap.test.ts` — 79 cases

Prescription schema remapping: that the AI's structured output is correctly mapped to the
stored program format, including sets/reps/rest/RPE fields.

### `research-quality.test.ts` — 20 cases  
### `research-retriever-diversity.test.ts` — 5 cases

Research pipeline: quality scoring of research documents and diversity of retrieval.

### `AgentThinking.test.tsx` — 42 cases  
### `phase4-ux.test.tsx` — 13 cases

Frontend: the thinking UX shell that shows build/edit/guidance modes, stage progress,
micro-reasons, and completion states during AI generation.

---

## 6. Testing AI and Program Generation

**Unit tests cannot verify AI output quality.** The AI is mocked in all unit tests.
AI correctness requires runtime verification against a real OpenAI API call.

### The scenario replay (live server + live AI)

The scenario replay is the primary tool for verifying AI/programming quality:

```bash
# Requires: server running at localhost:8080 with a valid OPENAI_API_KEY
# Run from artifacts/api-server/
pnpm exec tsx scenario-replay.ts
```

**What it tests (~35 scenarios across 9 categories):**

| Category | Scenarios | What's verified |
|---|---|---|
| `build` | 6 | Program creation: beginner strength, golf, home gym, hypertrophy, swimming, banned exercise |
| `pain_safety` | 3 | Knee pain, shoulder impingement, lower back — safety mode triggers |
| `edit` | 6+ | Mutations: add/swap/adjust/remove exercise, add core circuit, reduce session |
| `guidance` | 6 | Rep ranges, rest periods, progressive overload, deload — no mutation triggered |
| `constraint` | 5+ | Equipment limits, hotel gym, bodyweight, multi-constraint, enforcement of existing banned items |
| `edge` | 6+ | Greetings, vague edits, rebuild, pain adjustment to existing program |
| `advanced_edge` | 5+ | Conflicting constraints, memory persistence, contradiction handling, exercise substitution chains |
| `messy_language` | 9 | Typos, gym slang, ALL CAPS, emoji-only, contradictory day counts, rambling run-ons |
| `safety` | 4+ | Unsafe volume requests, pronoun reference resolution, verification honest reporting |

**What each scenario checks:**
- Correct action type classification (build → CREATE_PROGRAM, edit → MODIFY_BLOCK, etc.)
- Stages arrive in expected order via SSE
- Build scenarios save a program to the database (`systemSaved: true`)
- Guidance scenarios produce no database mutation
- Safety mode triggers for pain/injury scenarios
- No internal system terms leak into coach responses (hardConstraints, actionContract, etc.)
- Micro-reasons arrive, contain ≤3 items, and contain no internal terms

**Expect runtime: 5–15 minutes** (real OpenAI calls, real DB writes, 35 scenarios).

### Manual program generation smoke test

After any change to `ai.ts`, `routes/conversations.ts`, or the mutation pipeline:

1. Open the app in Replit
2. Start a fresh conversation (anonymous or logged in)
3. Type: `Build me a 3-day strength program focused on squats, deadlifts, and bench press`
4. Verify: a structured program appears in the chat with named sessions and exercises
5. Type: `Change Day 2 to upper body push only`
6. Verify: Day 2 updates without regenerating the whole program
7. Type: `I have a knee injury — remove all knee-flexion exercises`
8. Verify: safety mode triggers, knee-flexion exercises removed

---

## 7. Testing Auth and Anonymous Merge

### Unit tests (mocked)

```bash
pnpm --filter @workspace/api-server exec vitest run src/__tests__/anonymousMerge.test.ts
# Expected: 18 cases pass
```

### Integration test (live DB — run in Replit)

```bash
pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts
# Expected: 61 assertions pass, 0 failed
```

This test covers 5 scenarios against the live database:
- **Scenario A** — Fresh target: all 12 tables migrated, profile and neural profile moved
- **Scenario B** — Conflicting target: target profile preserved, XP merged additively (math verified)
- **Scenario C** — In-place upgrade: same IDs → no rows moved, user not deleted
- **Scenario D** — Empty anonymous user: no child data, user still deleted
- **Scenario E** — Atomicity: all rows committed to target after successful transaction

### Manual auth flow verification

```bash
# 1. Anonymous → register (in-place upgrade path)
# Open app incognito → generate a program → click Register → register
# Expected: program still visible, logs show "skipping" (same-user no-op)

# 2. Anonymous → login (merge path)
# Open app incognito → generate a program → click Login → log in to existing account
# Expected: program still visible, logs show "anonymousMerge: complete"
# Look for: conversationsMerged, systemsMerged > 0 in the log

# 3. Password reset flow
# Request a password reset → verify email arrives → follow link → new password works
# SENDGRID_API_KEY must be set; check EMAIL_SUPPORT_TO inbox for delivery
```

### What to verify in server logs

After a login-merge, look for this log entry:
```json
{"level":"info","anonymousUserId":123,"targetUserId":456,"conversationsMerged":1,"systemsMerged":1,"memoriesMerged":2,...,"msg":"anonymousMerge: complete"}
```

If you see `"msg":"anonymousMerge: skipping"`, the source user was not found or not anonymous.

---

## 8. Testing Stripe and Billing

### Unit tests (mocked)

```bash
pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/webhook-billing.test.ts
# Expected: 57 cases pass

pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/billing-access-control.test.ts
# Expected: 25 cases pass
```

### Stripe product/price audit (requires STRIPE_SECRET_KEY)

```bash
# Validates that all required products, prices, and lookup_keys exist in Stripe
pnpm --filter @workspace/scripts exec tsx src/audit-phase1.ts

# Expected output:
#   ✓  trainchat_pro_monthly   price_xxx   $19.99/month  product:TrainChat Pro
#   All 6 lookup keys present
#   DUPES: 0
```

### Webhook e2e test (requires running server + STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET)

```bash
# Replays real Stripe events against a running local server
# Run from the scripts/ directory
pnpm exec tsx src/e2e-webhook-test.ts

# Tests:
# - Fetches recent real events from your Stripe account
# - Re-signs them with your STRIPE_WEBHOOK_SECRET
# - POSTs to http://localhost:80/api/stripe/webhook
# - Verifies 200 response from the server for each event type:
#   customer.subscription.created, customer.subscription.updated, invoice.paid
```

### Manual Stripe flow verification

1. Click the upgrade button in the app
2. Verify Stripe Checkout loads with the correct plan and price
3. Use a Stripe test card (`4242 4242 4242 4242`, any future expiry, any CVC)
4. Complete the checkout
5. Verify the success redirect lands correctly
6. Verify the user's plan tier is updated in the app
7. Check server logs for: `[StripeRouter] Checkout session created` and the subsequent webhook delivery

**For billing portal:**
1. Open the billing portal via the app
2. Verify it loads with the user's current subscription
3. Verify the return URL takes you back to the correct page

### Webhook registration verification

After deployment, verify the webhook is registered in Stripe:
1. Open Stripe Dashboard → Developers → Webhooks
2. Confirm a webhook endpoint exists for `https://<REPLIT_DOMAINS[0]>/api/stripe/webhook`
3. Confirm it is receiving events (check the "Recent deliveries" tab)

---

## 9. Testing Email (SendGrid)

Email is non-fatal — missing `SENDGRID_API_KEY` degrades gracefully (logs a warning, skips send).

### Manual email verification

```bash
# Trigger a support email (requires SENDGRID_API_KEY set in environment)
curl -X POST https://<your-domain>/api/support \
  -H "Content-Type: application/json" \
  -d '{"type":"contact","name":"Test Engineer","email":"test@example.com","message":"Deployment verification email test","category":"General"}'

# Expected: 200 response
# Check: EMAIL_SUPPORT_TO inbox for admin notification email
# Check: test@example.com for user confirmation email
```

### Email types to verify manually (after setting up SendGrid)

| Flow | How to trigger | Check inbox |
|---|---|---|
| Welcome | Register a new account with a real email | User inbox |
| Support contact | Submit a support form | Admin + user inbox |
| Bug report | Submit a bug report form | Admin + user inbox |
| Password reset | Click "Forgot password" | User inbox |
| First build | Generate first program on a new account | User inbox |

### Checking email delivery in server logs

```
[Email] welcome delivered          → to=user@example.com
[Email] support-admin delivered    → to=bryan.jones@trainchat.ai
[Email] support-confirm delivered  → to=user@example.com
[Email] password-reset delivered   → to=user@example.com
```

If you see `SendGrid not configured — ... skipped`, `SENDGRID_API_KEY` is not set.

### Known SendGrid sender address quirk

`EMAIL_FROM` (used in `src/lib/email.ts`) and `SENDGRID_FROM_EMAIL` (used in
`src/lib/webhookHandlers.ts`) are separate env vars with different defaults. If you see the
wrong sender address on billing-related emails, check `SENDGRID_FROM_EMAIL` specifically.

---

## 10. Testing the External API

The External API lives at `/api/external/*` with Bearer token auth (`tc_<64-char-hex>`).

### Creating a test API key

```bash
# Log in to the app, then:
curl -X POST https://<your-domain>/api/external/keys \
  -H "Content-Type: application/json" \
  -b "<your-session-cookie>" \
  -d '{"name":"test-key","permissions":["generate_program","retrieve_program"]}'

# Response: { "key": "tc_<64-char-hex>", "id": 123 }
# Key is shown once only.
```

### Test program generation via external API

```bash
export TC_KEY="tc_your_key_here"
export DOMAIN="https://your-domain"

# Generate a program
curl -X POST $DOMAIN/api/external/program/generate \
  -H "Authorization: Bearer $TC_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Build me a 3-day beginner strength program","userId":"test-user-1"}'

# Expected: { "success": true, "data": { "programId": "...", "program": {...} }, "meta": {...} }
```

### Test rate limiting

```bash
# Send 61 requests quickly to verify the 60 req/min limit kicks in on the 61st
for i in {1..61}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TC_KEY" \
    $DOMAIN/api/external/program/list
done | sort | uniq -c
# Expected: 60 lines of "200", 1 line of "429"
# Check headers for X-RateLimit-Remaining and X-RateLimit-Reset
```

### External API docs endpoint

```bash
# No auth required — returns the OpenAPI spec for the external API
curl $DOMAIN/api/external/docs
```

---

## 11. What Must Pass Before Deployment

### CI gate (automated — must be green before merge to main)

The GitHub Actions CI workflow runs automatically on every PR and push to `main`. A merge
to `main` should not proceed while CI is red. CI covers:

- `pnpm install --frozen-lockfile` (lockfile discipline)
- `pnpm audit --audit-level=high` (dependency vulnerability gate — fails on un-acknowledged HIGH/critical advisories; medium/low are reported but do not block)
- `pnpm typecheck` (all libs + artifacts)
- Unit tests — api-server (~1,472 cases)
- Unit tests — trainchat (~55 cases)
- Build — api-server (esbuild)
- Build — trainchat (Vite with `PORT=3000 BASE_PATH=/`)

### Additional mandatory gates (blocking — run manually in Replit)

- [ ] `pnpm --filter @workspace/api-server test` — all ~1,472 backend unit tests pass
- [ ] `pnpm --filter @workspace/trainchat test` — all ~55 frontend tests pass
- [ ] `pnpm typecheck` — no new TypeScript errors (pre-existing TS6305 errors are expected)
- [ ] `GET /healthz` → `{"status":"ok"}` in Replit after deployment

### Required for DB-touching changes

- [ ] `pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts` — 61 assertions pass

### Required for auth changes

- [ ] Anonymous → register flow verified manually in Replit (program preserved after registration)
- [ ] Anonymous → login flow verified manually in Replit (merge log shows counts > 0)
- [ ] Session cookie behavior verified in Replit (not just locally — cookie settings differ)

### Required for billing changes

- [ ] `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/webhook-billing.test.ts` passes
- [ ] `pnpm --filter @workspace/scripts exec tsx src/audit-phase1.ts` passes (Stripe products valid)
- [ ] Stripe checkout flow verified manually with a test card
- [ ] Webhook delivery confirmed in Stripe Dashboard

### Required for AI/prompt changes

- [ ] Manual program generation smoke test in Replit (build + edit + constraint)
- [ ] No `ERROR` lines in Replit logs related to OpenAI calls
- [ ] Scenario replay passes (recommended, not gating, but expected for significant changes)

### Required for email changes

- [ ] Manual email send verified with a real SendGrid API key
- [ ] Correct sender address appears for both admin and user emails

---

## 12. AI Agent Testing Rules

**These rules apply to any AI coding agent making changes to this codebase.**

### Rule 1 — Never claim a discrepancy is resolved from static review alone

A discrepancy in `docs/documentation-governance.md` is only resolved when:
1. The code change is implemented
2. Unit tests cover the fixed behavior
3. The fix is verified at runtime against the live Replit environment
4. The register entry is explicitly updated to `resolved` with the verification date

Reading the code and confirming the logic looks correct does not constitute verification.
The DR-0025 bug (anonymous merge data loss) looked "obviously correct" in old code but
silently lost data due to PostgreSQL cascade behavior only visible against a real database.

### Rule 2 — Add tests before closing production-risk issues

Before marking any issue closed that touches these areas, tests must exist:

| Area | Required test type |
|---|---|
| Database operations (merge, cascade, transaction) | Integration test against live DB |
| Stripe billing / webhook routing | Unit test (mocked) + manual Stripe flow verification |
| Auth / session / cookies | Manual verification in Replit (not locally) |
| AI prompt construction | Manual generation test in Replit + scenario replay if significant |
| Mutation pipeline | Unit test for the specific mutation type |
| Memory / constraint application | Unit test against constraint-memory / exercise-constraint-filter |

### Rule 3 — Verify runtime behavior in Replit for these areas

Never rely solely on local testing for:

- **Auth** — cookie `SameSite`/`Secure` settings depend on `REPLIT_DOMAINS`; behavior differs locally
- **Billing** — Stripe webhook URL is constructed from `REPLIT_DOMAINS`; webhooks don't work locally without a tunnel
- **Memory merge** — cascade delete behavior only visible against a real PostgreSQL database
- **Mutations** — validation gates require real program data in `training_systems`
- **Deployment scripts** — `post-merge.sh` has a 20-second timeout that only manifests under real merge conditions

### Rule 4 — Report exactly what was tested and what was not

When reporting that a change is complete, always include:

```
Tested:
- Unit tests: [which files, how many cases, pass/fail]
- Integration tests: [which scripts, assertion count, pass/fail]
- Manual verification: [which flows, in which environment]

Not tested (and why):
- [e.g. "Stripe live payment flow — no live Stripe test card available in this session"]
- [e.g. "Scenario replay — server not running in this environment"]
```

Do not report a change as "complete and verified" if only static analysis or unit tests were
run. Be explicit about what runtime verification was skipped.

### Rule 5 — Do not assume a test file's existence means coverage is sufficient

The test files in this repo are thorough for the areas they cover, but coverage has gaps
(see §13). Before adding a feature to a covered area, verify the new code path has its own
test case — don't assume the existing tests cover new branches.

### Rule 6 — Unit test mock patterns

When writing new unit tests in this repo:

- Mock `@workspace/db` at the module level with `vi.mock()`
- Use `vi.hoisted()` for variables referenced inside `vi.mock()` factory functions
- Use `buildMockTx()` pattern for testing Drizzle transaction callbacks (see `anonymousMerge.test.ts`)
- Mock `drizzle-orm` to return `{ __eq: true }` from `eq()` (see existing tests)
- Use `vi.fn().mockImplementation()` for per-test state configuration
- Use an `opLog: string[]` array to verify operation ordering (see `anonymousMerge.test.ts` TC-10)

---

## 13. Known Coverage Gaps

These are areas where test coverage is absent or thin. They represent the highest risk for
introducing regressions.

### 🔴 No tests for the main AI chat pipeline (`routes/conversations.ts`)

The SSE chat handler — the most critical path in the product — has no unit tests.
Testing it requires a running server with a real OpenAI API key. The scenario replay
covers it at the E2E level, but there are no isolated unit tests for:
- System prompt construction in edge cases
- Memory injection with conflicting signals
- Plan-gated feature flag behavior (what changes when a user upgrades mid-session)
- Error recovery when OpenAI returns a non-streaming response

### 🔴 No unit tests for `src/routes/auth.ts`

The auth route handles anonymous bootstrap, registration, login, and password reset.
These flows are tested manually but have no automated unit tests. A regression here
could lock all users out without any failing test to catch it.

### 🟠 No integration tests for Stripe billing end-to-end

`webhook-billing.test.ts` covers the business logic of webhook routing with mocked Stripe.
`e2e-webhook-test.ts` is a manual script, not a CI-runnable test. There are no automated
tests that:
- Create a real Stripe checkout session and complete it
- Verify the user's plan is updated after a successful payment
- Verify `past_due` behavior when a payment fails

### 🟠 No tests for session cookie behavior

`src/lib/session.ts` configures cookie security based on `REPLIT_DOMAINS`. There are no
tests verifying that cookies are set with `SameSite=none; Secure` in production, or that
the session store correctly creates the `user_sessions` table.

### 🟠 No tests for the external API rate limiter

`src/lib/external-api-rate-limiter.ts` uses in-memory state. The 60 req/min limit is
verifiable manually but has no automated test. Under autoscale, the rate limiter resets
per instance, which is a known gap (`DR-0038`).

### 🟠 Scenario replay is not CI-runnable

`scenario-replay.ts` requires a running server with a real OpenAI API key and a live database.
It cannot run in CI without significant infrastructure. This means AI quality regressions
can only be caught by manual runs before deployment.

### 🟡 Frontend has only 2 test files

The React frontend has 55 component tests across 2 files (`AgentThinking`, `phase4-ux`).
None of the page-level components, API hooks, or data-fetching logic has test coverage.

### 🟡 Research pipeline has thin coverage (5 + 20 tests)

`research-quality.test.ts` and `research-retriever-diversity.test.ts` cover quality scoring
and retrieval diversity, but the full ingestion pipeline, approval flow, and prompt injection
have no automated tests.

---

## 14. Recommended Next Tests

Prioritized by production risk:

### Priority 1 — Auth route unit tests (blocking risk: all users locked out)

Add `src/__tests__/auth.test.ts` covering:
- `POST /auth/bootstrap` creates an anonymous user with a device ID
- `POST /auth/register` converts anonymous → registered (in-place upgrade)
- `POST /auth/login` triggers `mergeAnonymousToRegistered` on cross-device login
- `POST /auth/forgot-password` sends a reset email (mocked SendGrid)
- `POST /auth/reset-password` validates token expiry and updates password hash

### Priority 2 — Session configuration tests (blocking risk: login broken on iOS/Safari)

Add `src/lib/__tests__/session.test.ts` covering:
- `isHttpsContext` = true when `NODE_ENV=production`
- `isHttpsContext` = true when `REPLIT_DOMAINS` is set
- `isHttpsContext` = false when both are absent (local dev)
- Cookie `secure` and `sameSite` values match `isHttpsContext`

### Priority 3 — Integration test for Stripe subscription lifecycle (blocking risk: users stuck on wrong plan)

Extend or create `scripts/integration-test-billing.ts` covering:
- Checkout session creation returns a valid URL
- After a simulated `customer.subscription.created` webhook, user plan is updated
- After a simulated `invoice.payment_failed` + `customer.subscription.updated` (status: past_due), access is restricted
- Billing reconciliation job corrects stale `past_due` status

### Priority 4 — Conversations route smoke test (blocking risk: chat broken for all users)

Add a lightweight `src/__tests__/conversations.test.ts` that mocks the AI and verifies:
- SSE stream opens and sends expected event sequence
- `acknowledged` event arrives first
- `complete` event carries the correct structure
- A `CREATE_PROGRAM` intent causes a `training_systems` upsert (via mocked DB)

### Priority 5 — Make scenario replay CI-runnable

Create a `scripts/scenario-replay-ci.ts` variant that:
- Uses prerecorded AI response fixtures instead of live OpenAI calls
- Verifies the pipeline routing, validation, and SSE event sequence
- Runs in < 30 seconds without a real API key
- Can be added to the pre-deploy gate

### Priority 6 — External API rate limiter test

Add `src/lib/__tests__/external-api-rate-limiter.test.ts` covering:
- First 60 requests within a window return `allowed: true`
- 61st request returns `allowed: false`
- Window resets after the interval
- `X-RateLimit-*` header values are correct
