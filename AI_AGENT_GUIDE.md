# TrainChat — AI Agent Guide

> **This guide is for AI coding agents working on the TrainChat repository.**
> Human engineers should read [ONBOARDING.md](ONBOARDING.md) instead, though this guide
> applies to them too when they are acting as "the agent" for a task.
>
> **Read this file completely before making any code change.**
> The warnings here exist because mistakes in this codebase affect real users,
> real payments, and real training data. Many failure modes are silent.

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Required Reading Order](#2-required-reading-order)
3. [Files to Read Before Changing Code](#3-files-to-read-before-changing-code)
4. [Generated Files — Never Edit Directly](#4-generated-files--never-edit-directly)
5. [Canonical Files for AI Behavior](#5-canonical-files-for-ai-behavior)
6. [Documentation Status Levels](#6-documentation-status-levels)
7. [Discrepancy Lifecycle Rules](#7-discrepancy-lifecycle-rules)
8. [Architectural Warnings](#8-architectural-warnings)
9. [High-Risk Area Warnings](#9-high-risk-area-warnings)
10. [Runtime Verification Requirements](#10-runtime-verification-requirements)
11. [Testing Requirements by Change Type](#11-testing-requirements-by-change-type)
12. [Deployment Safety Rules](#12-deployment-safety-rules)
13. [How to Report Uncertainty](#13-how-to-report-uncertainty)
14. [How to Propose Changes](#14-how-to-propose-changes)
15. [Safe First Tasks](#15-safe-first-tasks)
16. [Tasks That Require Explicit Instruction](#16-tasks-that-require-explicit-instruction)

---

## 1. Purpose

This guide exists because AI coding agents operating without it have a predictable failure mode
in this codebase: they read documentation, conclude something is correct, change code to match
the documentation, and unknowingly introduce bugs — because the documentation does not always
reflect the running code, the codebase has intentional dual implementations, and several failure
modes only appear at runtime against a live database or external service.

Three principles govern safe agent operation here:

1. **Code is ground truth.** Documentation describes intent. When they conflict, trust the code
   and record the discrepancy — do not silently rewrite either to match the other.

2. **Static analysis is not verification.** Logic that looks correct in isolation may behave
   differently due to PostgreSQL cascade constraints, Stripe webhook signatures, cookie security
   policies, or Replit's HTTPS reverse proxy. Runtime verification in the Replit environment is
   required for production-risk changes.

3. **Dual systems are intentional.** TrainChat has dual program models, dual mutation engines,
   dual memory systems, and a dual anonymous-user system. These coexist by design (see §8).
   Do not "clean up" one side without an explicit engineering decision to retire it.

---

## 2. Required Reading Order

Read these documents in this order before writing a single line of code:

| # | Document | Why it matters |
|---|---|---|
| 1 | **This file** (`AI_AGENT_GUIDE.md`) | Rules and warnings specific to agents |
| 2 | [`CLAUDE.md`](CLAUDE.md) | Architecture specification — what the system is supposed to be |
| 3 | [`docs/documentation-governance.md`](docs/documentation-governance.md) | Discrepancy Register — known gaps between docs and code |
| 4 | [`ONBOARDING.md`](ONBOARDING.md) | Repo structure, high-risk areas, architectural traps |
| 5 | [`TESTING.md`](TESTING.md) | What tests exist, what they cover, what must pass |
| 6 | [`DEPLOYMENT.md`](DEPLOYMENT.md) | How the app deploys, what environment it needs |
| 7 | Subsystem doc for the area you're working in | Deep detail; find in `docs/` |

**For targeted work:** read the subsystem doc for the area you're changing. For example, if
you're changing memory behavior, read `docs/memory.md`. Check its frontmatter `status:` field
before trusting its content (see §6).

---

## 3. Files to Read Before Changing Code

### Before any change

- `CLAUDE.md` — understand the architecture of the system you're touching
- `docs/documentation-governance.md §5` — check the Discrepancy Register for your subsystem

### Before changing the AI pipeline or prompt construction

- `artifacts/api-server/src/lib/ai.ts` — read the section you're changing; it is ~5,500 lines
- `artifacts/api-server/src/lib/openai-models.ts` — which models are used for which roles
- `artifacts/api-server/src/agents/trainchat-constitution.ts` — hard laws that override prompt instructions
- `docs/ai-agents.md` — subsystem doc (status: VERIFIED)
- `docs/context-pipeline.md` — how context blocks are assembled and injected

### Before changing authentication or the anonymous merge

- `artifacts/api-server/src/lib/anonymousMerge.ts` — the merge function (DR-0025 fix)
- `artifacts/api-server/src/routes/auth.ts` — bootstrap, register, login, password reset
- `artifacts/api-server/src/lib/session.ts` — cookie config (environment-sensitive)
- `lib/db/src/schema/users.ts` + every schema file with `onDelete: "cascade"` — cascade map
- `docs/identity-billing.md` — subsystem doc (status: VERIFIED)

### Before changing billing or Stripe

- `artifacts/api-server/src/lib/billingUtils.ts` — `validateBillingConfig()`, plan detection
- `artifacts/api-server/src/lib/webhookHandlers.ts` — Stripe event routing
- `artifacts/api-server/src/routes/stripe.ts` — checkout and portal sessions
- `artifacts/api-server/src/lib/stripeClient.ts` — Stripe client initialization
- `docs/identity-billing.md` — subsystem doc (status: VERIFIED)

### Before changing memory

- `artifacts/api-server/src/lib/memory.ts` — `user_memories` extraction and injection
- `artifacts/api-server/src/lib/memory-dominance.ts` — priority hierarchy
- `artifacts/api-server/src/lib/atlas-memory-store.ts` — `atlas_memories` (separate system, NOT injected into Coach prompt)
- `artifacts/api-server/src/lib/constraint-memory.ts` — hard constraint persistence
- `docs/memory.md` — subsystem doc (status: VERIFIED)

### Before changing program mutations

- `artifacts/api-server/src/lib/edit-intent-service.ts` — primary mutation intent classifier
- `artifacts/api-server/src/lib/edit-engine.ts` — primary mutation executor
- `artifacts/api-server/src/lib/mutation-verifier.ts` — post-mutation validator
- `artifacts/api-server/src/lib/mutation-engine.ts` — **legacy** engine (see DR-0018 in §8)
- `artifacts/api-server/src/lib/program-specialist.ts` — uses legacy `applyMutation()` directly
- `docs/mutation-pipeline.md` — subsystem doc (status: VERIFIED)

### Before changing the database schema

- `lib/db/src/schema/` — every file; pay attention to `onDelete: "cascade"` on FK constraints
- `docs/db-schema.md` — subsystem doc (status: VERIFIED)
- `scripts/post-merge.sh` — schema changes are auto-applied here on every merge

---

## 4. Generated Files — Never Edit Directly

The following files are generated by automated tools. Any change you make will be overwritten
on the next build or codegen run. If you need to change behavior in a generated file, find and
edit the source, then regenerate.

| Generated file | Source | Regenerate with |
|---|---|---|
| `lib/api-client-react/src/generated/api.ts` | `lib/api-spec/openapi.yaml` | `pnpm run gen:api-client` |
| `lib/api-client-react/src/generated/api.schemas.ts` | `lib/api-spec/openapi.yaml` | `pnpm run gen:api-client` |
| `lib/api-zod/src/generated/` (all files) | `lib/api-spec/openapi.yaml` | `pnpm run gen:api-client` |
| `artifacts/api-server/dist/` (all files) | `artifacts/api-server/src/` | `pnpm --filter @workspace/api-server run build` |

**The generated client only covers ~9 of ~40 routes** (`DR-0007`). Most of the product surface
(training systems, billing, memory, mutations, SSE chat) is NOT in the OpenAPI spec and has no
generated client. If a route you're working on is not in `lib/api-spec/openapi.yaml`, the
generated files are irrelevant to it.

---

## 5. Canonical Files for AI Behavior

These are the authoritative sources for how the AI system works. Do not infer behavior from
high-level docs — read these files directly.

| What | Canonical file |
|---|---|
| AI system prompt construction | `artifacts/api-server/src/lib/ai.ts` (`buildSystemPrompt()`) |
| Which models are used for which role | `artifacts/api-server/src/lib/openai-models.ts` |
| Hard laws that cannot be overridden | `artifacts/api-server/src/agents/trainchat-constitution.ts` |
| Memory priority hierarchy | `artifacts/api-server/src/lib/memory-dominance.ts` |
| Intent → action routing | `artifacts/api-server/src/lib/language-system.ts` + `src/lib/response-policy-engine.ts` |
| Mutation intent classification | `artifacts/api-server/src/lib/edit-intent-service.ts` |
| Plan-gated feature flags | `artifacts/api-server/src/routes/conversations.ts` (lines 651–652) |
| Exercise constraint filtering | `artifacts/api-server/src/lib/exercise-constraint-filter.ts` |
| Training program schema | `lib/db/src/schema/training-system.ts` |

---

## 6. Documentation Status Levels

Every implementation doc in `docs/` has a `status:` frontmatter field. **Do not treat all docs
as equally trustworthy.** The status tells you how much to rely on the document.

| Status | Meaning | How to treat it |
|---|---|---|
| `VERIFIED` | Reconciled against source code in the v1.1 pass | Trust as current, but verify specific details against code for high-risk changes |
| `DISCREPANCY` | Has at least one open Discrepancy Register entry | Read the DR entries; that section of the doc may not reflect current behavior |
| `DRAFT` | Not yet reconciled against source | Treat as aspirational; read the code directly |
| `PLANNED` | Not yet written | No doc exists; read source only |

**Current status of all 12 subsystem docs: VERIFIED / L3** (or L4 for `research`).
All were reconciled in the v1.1 pass (2026-06-29). However, `VERIFIED` means "correct at
time of reconciliation" — code changes after that date may have introduced drift.
When in doubt, read the source.

---

## 7. Discrepancy Lifecycle Rules

The Discrepancy Register lives in `docs/documentation-governance.md §5`. It tracks gaps
between documentation and code. Rules for agents:

### Never silently reconcile a discrepancy

If you find code that does not match `CLAUDE.md` or a subsystem doc, do NOT quietly update
either to match the other. Record the discrepancy explicitly:
1. Check if it already has a DR entry (search for the subsystem key in §5)
2. If no entry exists, note it explicitly in your response before changing anything
3. If an entry exists, read it — the discrepancy may be intentional

### How to determine if a discrepancy is intentional

- **Class A** (status: `resolved`): drift was corrected in the docs during reconciliation.
  The code is correct; the old docs were wrong.
- **Class B** (status: `reconciling`): the divergence requires an engineering decision to fix.
  The code has a known issue; the docs document it honestly. These are NOT bugs to be silently
  fixed — they require an architecture decision before any change.

### Current Class B items (open, require engineering decision)

| DR | Area | What it means for agents |
|---|---|---|
| `DR-0006` | db-schema | No DB transactions around multi-table writes (except DR-0025 fix). Do not add transactions without understanding the full write scope. |
| `DR-0007` 🔴 | contract-spine | OpenAPI spec covers ~9 of 40 routes. Do not assume a route has a generated client. |
| `DR-0010` | contract-spine | No CI guard that generated output matches the spec. Generated files may drift without detection. |
| `DR-0011` 🔴 | ai-agents | `agent-personas.ts` is fully unwired — 0 runtime consumers. Do NOT wire it without explicit instruction (see §8). |
| `DR-0012` | ai-agents | `behavioral-intelligence.ts` + `progression-intelligence.ts` are unwired — 0 call sites. Same rule as DR-0011. |
| `DR-0013` | ai-agents | Two conflicting authority hierarchies: `trainchat-constitution.ts` (6-level `AUTHORITY_HIERARCHY`) and `agent-orchestrator.ts` (5-level `CONFLICT_RESOLUTION_HIERARCHY`). CLAUDE.md only documents the latter. Do not consolidate without understanding which is authoritative. |
| `DR-0018` | mutation-pipeline | Dual mutation engines coexist (see §8). Do not remove either without an explicit decision. |
| `DR-0020` | context-pipeline | Conversation context resolver is in-memory — not shared across autoscale instances. Do not add state to it expecting cross-instance consistency. |
| `DR-0026` | memory | Memory and adaptation context are plan-gated, not universal. Do not assume memory is always injected. |
| `DR-0032` | adaptation-loop | Readiness check-ins are user-confirmed; session logs auto-apply adjustments. This split is intentional. |
| `DR-0038` | external-api | External API rate limiter is in-memory — same autoscale caveat as DR-0020. |

### Resolving a discrepancy

A DR may only move from `reconciling` to `resolved` when all three of the following are true:
1. The code fix is implemented and committed
2. Unit tests cover the new behavior
3. The fix is runtime-verified in the Replit environment and the result is documented

See DR-0025 as the example: code fix + 18 unit tests + 61 integration assertions against the
live DB + explicit date in the DR entry.

---

## 8. Architectural Warnings

These are the dual-system patterns and structural decisions that most commonly cause agents
to introduce bugs. Each has caused real problems; each is documented in the DR register.

---

### ⚠️ WARNING — `agent-personas.ts` is fully unwired (DR-0011)

**File:** `artifacts/api-server/src/agents/agent-personas.ts`

This file defines three agent personas (`coach_atlas`, `architect_vale`, `dr_sable`) with
structured identity definitions, tone rules, and hard law references. It has **zero runtime
consumers** — no file outside this module imports it for execution purposes. The Coach's
identity is hardcoded inline in `src/lib/ai.ts`.

**What agents must not do:**
- Wire `agent-personas.ts` into `ai.ts` or any prompt-building path without explicit instruction
- Assume the persona definitions in this file reflect actual Coach behavior
- Delete this file as "dead code" — it represents intended architecture

**What to do instead:** note the discrepancy in your response. The engineering decision to wire
or retire this registry has not been made.

---

### ⚠️ WARNING — `behavioral-intelligence.ts` and `progression-intelligence.ts` are unwired (DR-0012)

**Files:**
- `artifacts/api-server/src/agents/behavioral-intelligence.ts`
- `artifacts/api-server/src/agents/progression-intelligence.ts`

Both export functions documented as part of the AI orchestrator's Phase-8 flow. Both have
**zero call sites** in the production codebase. They are defined scaffolding that was never
wired up.

**What agents must not do:**
- Wire these into the conversation handler or AI pipeline without explicit instruction
- Treat their absence as a bug to be fixed

---

### ⚠️ WARNING — Dual mutation engines (DR-0018)

**Files:**
- `artifacts/api-server/src/lib/edit-intent-service.ts` + `src/lib/edit-engine.ts` — primary DB-backed pipeline
- `artifacts/api-server/src/lib/mutation-engine.ts` — legacy in-memory `applyMutation()`

Both engines exist and are called by different code paths:
- The primary chat pipeline (`routes/conversations.ts`) uses the DB-backed edit engine
- `src/lib/program-specialist.ts` uses the legacy `applyMutation()` directly (line 851)

**What agents must not do:**
- Remove either engine without knowing which routes depend on it
- Assume that a change to one engine affects the behavior of the other
- Route new mutation types to the legacy engine

**Before touching either:** run `grep -rn "applyMutation\|edit-engine\|edit-intent" src/` to
map which routes use which engine.

---

### ⚠️ WARNING — Dual anonymous user systems (DR-0035)

**Systems:**
- **Primary:** `usersTable` with `isAnonymous: true` — created by `POST /auth/bootstrap`, every visitor gets a real DB row, data merges on registration via `anonymousMerge.ts`
- **Legacy:** `guest_sessions` table + `src/lib/guestService.ts` + `src/lib/guestChat.ts` — a separate session-based system with its own DB table

Both systems coexist. The primary system is the intended architecture. The legacy guest system
(`DR-0035`) still handles some requests via `routes/guest.ts`.

**What agents must not do:**
- Modify the primary system's bootstrap or merge flow without checking that the guest system's routes are unaffected
- Assume all anonymous users are in `usersTable` — some may still be handled by `guest_sessions`
- Delete or "clean up" `guestService.ts` without an explicit decision to retire the legacy system

---

### ⚠️ WARNING — Dual memory systems (DR-0024)

**Systems:**
- **`user_memories`** (`lib/db/src/schema/memory.ts`) — extracted from chat by `src/lib/memory.ts`, injected into the Coach system prompt via `memoryContext`. This is what the AI "remembers" and acts on.
- **`atlas_memories`** (`lib/db/src/schema/atlas-memories.ts`) — populated by `src/lib/atlas-memory-extractor.ts`, surfaced in the frontend via `routes/atlas-memories.ts`. **Not injected into the Coach prompt** — the AI does not read these.

**What agents must not do:**
- Assume the AI sees both memory systems — it only sees `user_memories`
- Write to `atlas_memories` expecting it to affect AI behavior
- Read from `atlas_memories` to understand what constraints the AI is applying

**Memory injection is also plan-gated (DR-0026):** even `user_memories` are only injected when
the user's plan has `features.memoryContext = true` (see `routes/conversations.ts` line 652).
Free-plan users get AI responses with no memory context.

---

### ⚠️ WARNING — Dual program data models (DR-0009 / DR-0018)

**Models:**
- **Primary:** `training_systems` table with JSONB `programData` — used by the main chat pipeline, `/api/training-system/*` routes, and all in-context mutations
- **Legacy:** `saved_programs` → `program_days` → `exercises` (relational hierarchy) — used by `/api/programs/*`, the external API, and what the OpenAPI spec describes

**What agents must not do:**
- Assume the OpenAPI spec and generated client cover the primary program model — they cover the legacy one
- Write new features that read from `saved_programs` expecting to see the user's active training system
- Modify the JSONB `programData` schema without understanding how the edit engine reads and writes it

---

### ⚠️ WARNING — Two conflicting authority hierarchies (DR-0013)

**Files:**
- `artifacts/api-server/src/agents/trainchat-constitution.ts` — 6-level `AUTHORITY_HIERARCHY` (injected into system prompts)
- `artifacts/api-server/src/agents/agent-orchestrator.ts` — 5-level `CONFLICT_RESOLUTION_HIERARCHY` (used for runtime conflict resolution)

Both claim to define the priority order for resolving conflicts between AI outputs. CLAUDE.md §4
only documents the orchestrator's hierarchy. They have different structures and different levels.

**What agents must not do:**
- Add new authority levels to one hierarchy without updating the other
- Assume either hierarchy is authoritative without reading both

---

### ⚠️ WARNING — `onDelete: "cascade"` on 26 FK constraints

Every child table with a `userId` FK has `onDelete: "cascade"`. Deleting a `users` row
silently deletes everything downstream — memories, programs, sessions, profiles, logs,
clarifications, everything.

**The DR-0025 bug** (fixed 2026-06-30) existed precisely because `anonymousMerge.ts` deleted
the anonymous user row before migrating child data. The cascade wiped 10 tables silently.

**What agents must not do:**
- Write any code that deletes a `users` row without first confirming all child data has been
  migrated or intentionally discarded
- Add a new child table with `onDelete: "cascade"` without updating `anonymousMerge.ts` to
  handle it during the merge flow

**List of tables with cascade deletes from `userId`:**
`conversations`, `messages`, `user_memories`, `atlas_memories`, `user_profiles`,
`neural_profiles`, `readiness_entries`, `session_feedback`, `session_logs`, `exercise_logs`,
`active_sessions`, `pending_clarifications`, `saved_programs`, `password_reset_tokens`,
`training_systems`, and more. Run `grep -rn "onDelete.*cascade" lib/db/src/schema/` for
the current complete list.

---

## 9. High-Risk Area Warnings

### 🔴 Auth and session (`src/lib/session.ts`, `src/routes/auth.ts`)

**Why it's dangerous:** a mistake here logs out all users or breaks login for a specific browser.

- `SESSION_SECRET` changes invalidate all existing sessions immediately — every logged-in user is
  logged out with no warning
- Cookie `secure` and `sameSite` settings are derived from `process.env.REPLIT_DOMAINS` and
  `NODE_ENV`. They are `secure: true, sameSite: "none"` in Replit (required for the HTTPS reverse
  proxy). Changing this logic without testing in Replit breaks login on Safari/iOS (WebKit ITP)
- The session store uses `connect-pg-simple` writing to `user_sessions`. If the DB is unreachable,
  all sessions fail to load — users are logged out

**Runtime verification required.** Local testing does not replicate Replit's cookie environment.

---

### 🔴 Stripe billing (`src/lib/webhookHandlers.ts`, `src/routes/stripe.ts`, `src/lib/billingUtils.ts`)

**Why it's dangerous:** billing errors give users wrong plan access or fail to charge them.

- `validateBillingConfig()` runs at startup and exits the process if `STRIPE_SECRET_KEY` or
  `STRIPE_WEBHOOK_SECRET` are missing. Adding new required Stripe env vars here breaks deployments
- The Stripe webhook URL is auto-constructed from `REPLIT_DOMAINS` on startup. If the domain
  changes and the server is not restarted, events go to the old URL and are missed
- `detectPlanFromLookupKey()` throws on unknown price IDs — adding a new price without adding its
  lookup key to the detection logic causes webhook events to crash the handler
- `STRIPE_WEBHOOK_SECRET` rotation: changing this while Stripe is delivering in-flight events
  causes signature validation failures for those events
- Two sender addresses exist for billing emails: `EMAIL_FROM` (used in `src/lib/email.ts`) and
  `SENDGRID_FROM_EMAIL` (used in `src/lib/webhookHandlers.ts`). They have different defaults.

**Runtime verification required** — webhook delivery must be confirmed in the Stripe Dashboard.

---

### 🔴 Anonymous user merge (`src/lib/anonymousMerge.ts`)

**Why it's dangerous:** incorrect behavior silently loses user data permanently.

The DR-0025 fix wraps the merge in a transaction and migrates all 12 child tables before
deleting the anonymous user. If you add a new child table with `onDelete: "cascade"` and
do not update this function, data in that table will be silently lost on every login-merge.

**The checklist:** when adding a new table that references `usersTable.id` with `onDelete: "cascade"`:
1. Add the table to the `import` block in `anonymousMerge.ts`
2. Add a `tx.update(newTable).set({ userId: targetUserId }).where(...).returning()` step
3. Add the count to `MergeResult`
4. Add a test case in `anonymousMerge.test.ts`
5. Add an assertion in `scripts/integration-test-dr0025.ts`
6. Re-run the integration test in Replit

---

### 🟠 AI system prompt construction (`src/lib/ai.ts`)

**Why it's dangerous:** changes silently affect all users' AI output quality.

`ai.ts` is ~5,500 lines. The system prompt is built by `buildSystemPrompt()` which assembles
~20+ conditional context blocks. Changing, reordering, or removing a block changes AI behavior
globally with no observable error — the AI just produces different output.

- Memory and adaptation context are plan-gated: only injected when `features.memoryContext` or
  `features.adaptationContext` is true (conversations.ts lines 651–652). Do not assume these are always present.
- The AI models used are defined in `openai-models.ts`. Comments in that file mention "remain on
  gpt-4o" but all values are `gpt-4.1`. The comments are stale (DR-0014). Trust the values, not the comments.

**Post-change verification:** run the scenario replay (`artifacts/api-server/scenario-replay.ts`)
after any prompt change. There are no unit tests for `buildSystemPrompt()`.

---

### 🟠 Replit deployment assumptions

The server makes assumptions that are only true in Replit:

- `PORT`, `DATABASE_URL`, `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN` are injected automatically
- The HTTPS reverse proxy means all traffic arrives over TLS, enabling `secure` cookies without
  the server itself having a TLS cert
- `BASE_PATH` is injected during Vite builds — frontend builds fail without it locally
- `stripe-replit-sync` uses `REPLIT_DOMAINS` to auto-register the webhook URL on startup

**Code that works locally may fail in Replit, and vice versa.** Auth, billing, and webhook
behavior must be verified in Replit, not inferred from local test results.

---

### 🟠 Autoscale and in-memory state (DR-0020, DR-0038)

Two systems use module-level in-memory state that is NOT shared across instances:

- `src/lib/conversation-context-resolver.ts` — tracks exercise and session references
  between turns. State is per-instance; a user whose requests land on two different instances
  will lose context between turns.
- `src/lib/external-api-rate-limiter.ts` — rate limiting is per-instance. Under autoscale,
  the effective rate limit is `60 * num_instances` requests per minute per key.

**What agents must not do:**
- Add new module-level state that should persist across requests or instances
- Assume that data written to an in-memory store in one request is visible in the next

---

### 🟠 SendGrid / email (`src/lib/email.ts`, `src/lib/webhookHandlers.ts`)

**Why it's a trap:** email failures are non-fatal and silently skipped, so broken config is invisible.

- If `SENDGRID_API_KEY` is missing, all email is skipped with a `warn` log. The user gets no
  welcome email, no password reset email, no support confirmation. Nothing throws.
- `EMAIL_FROM` and `SENDGRID_FROM_EMAIL` are separate env vars with different defaults:
  - `EMAIL_FROM` defaults to `Bryan.jones@efficiencystrengthtraining.com` (in `.replit`)
  - `SENDGRID_FROM_EMAIL` defaults to `noreply@trainchat.app` (hardcoded in `webhookHandlers.ts`)
  If you add a new email type, decide which variable to use and keep them consistent.
- SendGrid sender addresses must be verified in the SendGrid dashboard. Using an unverified
  address silently fails delivery.

---

### 🟡 Database schema changes (`lib/db/src/schema/`)

**Why it's risky:** `drizzle-kit push` is not reversible. The post-merge script runs it
automatically with a 20-second timeout.

- Destructive changes (dropping a column, renaming a table) cause `drizzle-kit push` to prompt
  for confirmation. The post-merge script will time out and fail. The schema change will not be
  applied automatically — you must run `pnpm --filter db push-force` manually in the Replit shell.
- There is no migration history. Rolling back a schema change requires manual SQL.
- `pnpm-lock.yaml` must be committed if `package.json` changes. The post-merge script uses
  `--frozen-lockfile` — a lockfile mismatch causes the deployment to fail.

---

## 10. Runtime Verification Requirements

These areas require verification in the live Replit environment, not just unit tests:

| Area changed | What to verify in Replit | Command or action |
|---|---|---|
| Anonymous merge / auth | Login-merge flow produces a merge log | Check logs for `anonymousMerge: complete` with counts > 0 |
| Any DB-touching code | Integration test passes against live DB | `pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts` |
| Session / cookies | Login works on a real browser (not localhost) | Open app in Replit preview, log in, refresh — session persists |
| Stripe / billing | Webhook delivery confirmed | Stripe Dashboard → Developers → Webhooks → Recent deliveries |
| AI prompt / chat | Program generation returns a valid structured program | Open chat, type "Build me a 3-day strength program", verify output |
| Email | Delivery confirmed in inbox | Submit a support form, check `EMAIL_SUPPORT_TO` inbox |
| Schema change | `pnpm --filter db push` runs without prompts | Run manually in Replit shell before merging |
| Deployment script change | Post-merge hook completes within 20 seconds | Check Replit merge logs |

**The minimum post-change check for any code change:**
```bash
curl https://<your-replit-domain>/healthz
# Expected: {"status":"ok"}
```
If the health check fails, the server did not start. Check startup logs for the specific error.

---

## 11. Testing Requirements by Change Type

| Change type | Required before claiming complete |
|---|---|
| Pure logic (parser, classifier, formatter) | Unit tests covering the new behavior |
| New DB table | Updated `anonymousMerge.ts` + new test case + integration test re-run |
| Schema change (additive) | `pnpm --filter db push` runs cleanly in Replit shell |
| Schema change (destructive) | Explicit confirmation from operator + `push-force` in Replit shell |
| Auth flow | Unit tests (if applicable) + manual verification in Replit browser |
| Billing / Stripe | Unit tests + Stripe Dashboard webhook delivery confirmation |
| AI prompt | Scenario replay or manual generation test in Replit |
| Memory / constraint | Unit tests covering the constraint path + manual verification that constraint applies in chat |
| Anonymous merge | Updated unit tests + re-run `integration-test-dr0025.ts` (all 61 assertions) |
| Deployment script | Verification that the post-merge hook completes within 20 seconds |

### How to run tests

```bash
# All backend unit tests (~1,472 cases)
pnpm --filter @workspace/api-server test

# All frontend component tests (~55 cases)
pnpm --filter @workspace/trainchat test

# Integration test (requires Replit DB)
pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts

# TypeScript typecheck (pre-existing TS6305 errors from unbuilt lib/db are expected)
pnpm typecheck
```

---

## 12. Deployment Safety Rules

These rules apply when any change is being pushed to `main`, which triggers auto-deployment.

1. **`pnpm-lock.yaml` must be committed** if `package.json` changed. The post-merge script uses
   `--frozen-lockfile`. A missing or mismatched lockfile causes deployment to fail silently.

2. **`scripts/post-merge.sh` runs automatically** after every GitHub→Replit merge. It has a
   20-second timeout. Do not add long-running commands to this script.

3. **`drizzle-kit push` is in the post-merge script.** Schema changes that require confirmation
   will hang and time out. If your change has a destructive schema operation, warn the operator
   before merging and coordinate a manual `pnpm --filter db push-force` in the Replit shell.

4. **Do not set `DEBUG_RESET_ENABLED=true` in production Replit Secrets.** This enables routes
   that reset anonymous user state.

5. **Do not change `SESSION_SECRET` without coordinating a logout.** All active sessions are
   immediately invalidated. Every logged-in user is logged out.

6. **The Stripe webhook URL is reconstructed from `REPLIT_DOMAINS` on server startup.** If the
   deployment domain changes, restart the server after the change to re-register the webhook.

7. **After any deployment, verify:**
   ```bash
   curl https://<your-domain>/healthz   # Expected: {"status":"ok"}
   ```
   Then check Replit startup logs for `ERROR` lines.

---

## 13. How to Report Uncertainty

When you are not certain whether a change is safe, say so explicitly. Use this format:

```
UNCERTAIN: [what you're not sure about]
REASON: [why you're uncertain — what you couldn't verify from static analysis alone]
NEEDED: [what runtime verification or additional context would resolve the uncertainty]
RECOMMENDATION: [what you think the safest path is]
```

Examples of things that require stating uncertainty:
- "This change affects `src/lib/ai.ts` — I cannot verify the impact on program generation
  output without running the scenario replay against a live OpenAI API."
- "This adds a new table with `onDelete: cascade`. I've updated `anonymousMerge.ts` but I
  cannot confirm the integration test passes without running it in Replit."
- "This changes session cookie configuration. I cannot verify browser behavior without testing
  in the Replit environment where the HTTPS reverse proxy is active."

**Never claim a change is "tested and verified" if:**
- You only read the code without running tests
- You ran unit tests but the change touches a DB operation, Stripe, email, or auth
- You cannot run the relevant integration test in the current environment

---

## 14. How to Propose Changes

For any non-trivial change, propose before implementing. Structure proposals as:

```
AREA: [subsystem, file(s)]
WHAT: [exactly what you intend to change]
WHY: [the problem being solved or discrepancy being fixed]
HOW: [implementation approach in 3–5 bullet points]
RISKS: [what could go wrong; which architectural warnings apply]
TESTS: [which tests you will write or update]
VERIFICATION: [what runtime verification you will perform or need performed]
DR IMPACT: [if this resolves a DR entry, state which one and what evidence closes it]
```

**Do not implement until the proposal is confirmed.** This is especially important for:
- Changes to `ai.ts` or prompt construction
- Schema changes
- Auth or session changes
- Billing or Stripe changes
- Changes to `anonymousMerge.ts`
- Changes to `scripts/post-merge.sh`

---

## 15. Safe First Tasks

These are appropriate starting points that build understanding without production risk.

| Task | Why it's safe | What you'll learn |
|---|---|---|
| Add a unit test for an existing function | No production impact; fully isolated | How the specific logic works; how the mock patterns work |
| Add an assertion to `integration-test-dr0025.ts` | Additive only; existing cleanup handles teardown | How integration tests are structured; the merge flow |
| Read a subsystem doc alongside its source code | No changes | How to compare docs to code; how to spot drift |
| Add a field to `.env.example` | Documentation only; no behavior change | The env var system and how variables flow |
| Add a new entry to the Discrepancy Register | Documentation only | How to record drift without changing code |
| Add a new read-only `GET` route | No mutations; easy to isolate | Route structure, auth middleware pattern, Zod validation |
| Improve a `logger.info()` call (add context fields) | Additive; no behavior change | What context is available at various points in the pipeline |
| Write a test for a currently untested pure function | No production impact | Test infrastructure; the function's edge cases |

---

## 16. Tasks That Require Explicit Instruction

Do not attempt these without being directly asked and without the operator confirming the scope:

| Task | Why it requires instruction |
|---|---|
| Wiring `agent-personas.ts` into the AI pipeline | DR-0011 — engineering decision not made; wrong wiring changes all users' AI behavior |
| Wiring `behavioral-intelligence.ts` or `progression-intelligence.ts` | DR-0012 — same reason |
| Retiring the legacy mutation engine (`mutation-engine.ts`) | DR-0018 — `program-specialist.ts` still depends on it |
| Retiring the guest session system (`guestService.ts`) | DR-0035 — still handles live requests via `routes/guest.ts` |
| Consolidating `user_memories` and `atlas_memories` | DR-0024 — architectural decision; wrong merge breaks the AI's constraint system |
| Consolidating the two program data models | DR-0009/DR-0018 — the external API and generated client depend on the legacy model |
| Consolidating the two authority hierarchies | DR-0013 — unclear which is authoritative without a deliberate decision |
| Adding transactions to multi-table writes | DR-0006 — systemic; scope must be defined before adding |
| Changing the OpenAPI spec | Triggers regeneration of generated files; affects the external API contract |
| Changing `SESSION_SECRET` in production | Logs out all users immediately |
| Changing `STRIPE_WEBHOOK_SECRET` in production | Invalidates in-flight Stripe events |
| Modifying `scripts/post-merge.sh` | Affects every deployment; timeout behavior is load-bearing |
| Adding a `drizzle-kit push-force` to the post-merge script | Could cause irreversible schema changes on every merge |
| Running `git push --force` to any branch | Potentially destroys commit history |
| Deleting any file not clearly identified as temporary or generated | May remove intentional scaffolding (see DR-0011, DR-0012) |
