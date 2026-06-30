# TrainChat — Onboarding Guide

> **Who this is for:** new engineers and AI coding agents starting work on TrainChat for the
> first time. Everything here describes the codebase as it currently exists — not aspirationally.
>
> **AI agent?** Jump to [§13 — AI Agent Safety](#13-ai-agent-safety) before anything else.

---

## Table of Contents

1. [What TrainChat Is](#1-what-trainchat-is)
2. [Reading Order](#2-reading-order)
3. [Repo Structure](#3-repo-structure)
4. [Running in Replit](#4-running-in-replit)
5. [Running Locally](#5-running-locally)
6. [Environment Variables](#6-environment-variables)
7. [Running Tests](#7-running-tests)
8. [Verifying Core Flows](#8-verifying-core-flows)
9. [Understanding the AI and Programming System](#9-understanding-the-ai-and-programming-system)
10. [High-Risk Areas](#10-high-risk-areas)
11. [Architectural Traps](#11-architectural-traps)
12. [Generated Files — Never Edit Directly](#12-generated-files--never-edit-directly)
13. [AI Agent Safety](#13-ai-agent-safety)
14. [Safest First Tasks](#14-safest-first-tasks)
15. [Pre-Change Checklist](#15-pre-change-checklist)
16. [Pre-Deploy Checklist](#16-pre-deploy-checklist)

---

## 1. What TrainChat Is

TrainChat is an **AI-powered strength and speed training program engine**. It is not a chatbot
that gives fitness advice. It generates, edits, audits, and adapts structured training programs
through a chat interface.

**Core product loop:**
1. User describes their training goals, constraints, and equipment
2. AI generates a structured, periodized program (stored in `training_systems` table)
3. User gives feedback; AI edits specific sessions, exercises, or blocks
4. System adapts based on readiness check-ins, session logs, and performance signals
5. Memory persists constraints, preferences, and training history across sessions

**The AI is a programming engine, not a general assistant.** Generated output is a typed,
schema-validated program artifact — not natural language advice. Every mutation returns a
typed receipt. Every AI call is constrained by exercise science rules, user constraints, and
accumulated memory.

**What makes this hard:**
- Correctness has two dimensions: code correctness AND training science validity
- A schema-valid program can still be bad programming
- The AI pipeline has ~10+ conditional context blocks injected per request
- Many features have dual coexisting implementations (legacy + new) — see §11

---

## 2. Reading Order

Read these in order before touching any code. Each one builds on the last.

| # | Document | Purpose | Time |
|---|---|---|---|
| 1 | **This file** | Start here | 15 min |
| 2 | [`CLAUDE.md`](CLAUDE.md) | Architecture specification — the authoritative intent doc | 45 min |
| 3 | [`DEPLOYMENT.md`](DEPLOYMENT.md) | How the app is built, deployed, and operated | 20 min |
| 4 | [`.env.example`](.env.example) | Every environment variable, what it does, where it's used | 10 min |
| 5 | [`docs/documentation-map.md`](docs/documentation-map.md) | Index of all subsystem docs and their verification status | 10 min |
| 6 | [`docs/documentation-governance.md`](docs/documentation-governance.md) | Discrepancy Register — known gaps between docs and code | 20 min |
| 7 | Subsystem doc for the area you're working in | Deep detail on one subsystem | 15 min |

**For any specific subsystem:** find its doc in `docs/` (e.g. `docs/memory.md`,
`docs/identity-billing.md`). Check the frontmatter `status:` field — `VERIFIED` means it was
reconciled against the source code. `DISCREPANCY` means known gaps exist; see the Discrepancy
Register entries listed in the frontmatter.

**CLAUDE.md is the architecture spec, not the ground truth for current behavior.**
The codebase is the ground truth. When they conflict, trust the code and check the Discrepancy
Register before assuming either is wrong.

---

## 3. Repo Structure

```
trainchat/                        ← repo root
├── CLAUDE.md                     ← Architecture Specification (read this first after ONBOARDING.md)
├── ONBOARDING.md                 ← This file
├── DEPLOYMENT.md                 ← Deployment and operations guide
├── .env.example                  ← All env vars documented with status and source
├── replit.md                     ← Quick-ref card (commands, stack, gotchas)
├── .replit                       ← Replit configuration (modules, deployment, post-merge hook)
├── pnpm-workspace.yaml           ← Workspace dependency catalog
├── package.json                  ← Root workspace scripts (build, typecheck)
│
├── scripts/                      ← One-time setup and utility scripts
│   ├── post-merge.sh             ← Runs automatically after every GitHub → Replit merge
│   └── src/                      ← TypeScript setup scripts (Stripe product setup, seeders)
│
├── lib/                          ← Shared library packages (consumed by artifacts)
│   ├── db/                       ← @workspace/db — Drizzle ORM, schema, pool
│   │   └── src/schema/           ← All table definitions (source of truth for DB shape)
│   ├── api-spec/                 ← OpenAPI spec (openapi.yaml) + Orval codegen config
│   ├── api-client-react/         ← ⚠️ GENERATED — React Query hooks from OpenAPI spec
│   │   └── src/generated/        ← api.ts, api.schemas.ts — never edit directly
│   └── api-zod/                  ← ⚠️ GENERATED — Zod schemas from OpenAPI spec
│       └── src/generated/        ← never edit directly
│
├── artifacts/                    ← Deployable applications
│   ├── api-server/               ← Node.js/Express API server (the primary backend)
│   │   ├── src/
│   │   │   ├── index.ts          ← Server entry point (startup sequence)
│   │   │   ├── app.ts            ← Express app setup, middleware, route mounting
│   │   │   ├── routes/           ← All HTTP route handlers
│   │   │   ├── lib/              ← Business logic (ai.ts, memory.ts, billing*, session.ts, …)
│   │   │   ├── agents/           ← AI agent definitions (orchestrator, specialists)
│   │   │   ├── services/         ← Service layer (program build, edit engine, …)
│   │   │   ├── middlewares/      ← Auth, external API auth, rate limiting
│   │   │   ├── research/         ← Research discovery service (PubMed, Semantic Scholar)
│   │   │   └── __tests__/        ← Vitest unit tests
│   │   ├── scripts/              ← Dev/test scripts (seeders, integration tests)
│   │   │   └── integration-test-dr0025.ts  ← Anonymous merge integration test
│   │   ├── build.mjs             ← esbuild config (bundles src/ → dist/)
│   │   └── dist/                 ← ⚠️ GENERATED — build output, never edit
│   │
│   ├── trainchat/                ← React frontend (the main client app)
│   │   └── src/
│   │       ├── components/       ← UI components
│   │       ├── pages/            ← Page components (including aeo/* marketing pages)
│   │       ├── hooks/            ← Custom React hooks
│   │       ├── contexts/         ← React context providers
│   │       └── lib/              ← Frontend utilities
│   │
│   └── mockup-sandbox/           ← Isolated UI prototype environment
│
└── docs/                         ← Engineering knowledge base
    ├── documentation-map.md      ← Index of all docs and their status
    ├── documentation-governance.md ← Rules + Discrepancy Register (DR-0001 to DR-0041)
    └── *.md                      ← 12 subsystem implementation docs
```

### Key source files to know

| File | What it does |
|---|---|
| `artifacts/api-server/src/lib/ai.ts` | The core AI call layer — builds system prompts, injects context, calls OpenAI, handles streaming. The largest and most complex file in the repo. |
| `artifacts/api-server/src/routes/conversations.ts` | Main chat SSE handler. Ties together context pipeline, AI, mutation engine, memory extraction, and logging. |
| `artifacts/api-server/src/lib/anonymousMerge.ts` | Merges anonymous → registered user data. Fixed DR-0025. |
| `artifacts/api-server/src/lib/session.ts` | Express session setup (cookie config, PG session store). |
| `lib/db/src/schema/` | All database tables. The `onDelete: "cascade"` settings here are particularly important. |
| `lib/api-spec/openapi.yaml` | OpenAPI spec (covers ~9 of 40 routes — partial). |

---

## 4. Running in Replit

Replit is the primary environment. The Replit Run button starts the project.

### Prerequisites

The following are provisioned automatically by Replit:
- PostgreSQL 16 database (`DATABASE_URL` injected)
- Node.js 24 (`PORT` injected)
- Deployment domains (`REPLIT_DOMAINS` injected)

### Start the server

```bash
# In the Replit shell — starts api-server in development mode (build + run)
pnpm --filter @workspace/api-server run dev

# Or use the Replit Run button (configured in .replit as runButton = "Project")
```

### Set up secrets (first time)

Go to **Tools → Secrets** in Replit and add:

```
SESSION_SECRET       = <random 64-char hex string>
STRIPE_SECRET_KEY    = sk_test_...
STRIPE_WEBHOOK_SECRET = whsec_...
OPENAI_API_KEY       = sk-...
SENDGRID_API_KEY     = SG...       (optional — email works without it)
```

See [`.env.example`](.env.example) for the full list.

### Initialize a fresh database

```bash
# Push the Drizzle schema to the database (creates all tables)
pnpm --filter db push

# Seed Stripe products and prices (first time or new environment only)
pnpm --filter @workspace/scripts run stripe:setup-products
```

### Verify the server is up

```bash
curl https://<your-replit-domain>/healthz
# Expected: {"status":"ok"}
```

---

## 5. Running Locally

Local development is **partially supported** but has limitations:

- `DATABASE_URL` must be set manually (no Replit-managed DB locally)
- Stripe webhook auto-registration (`REPLIT_DOMAINS`-based) will not work
- Cookie `SameSite`/`Secure` settings are adjusted automatically based on `NODE_ENV` and `REPLIT_DOMAINS`
- `PORT` must be set manually

### Local setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy the env example and fill in local values
cp .env.example .env
# Edit .env: set DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY, STRIPE_*, PORT=3000

# 3. Push schema to your local database
pnpm --filter db push

# 4. Build and start the API server
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start

# 5. Start the frontend (separate terminal)
pnpm --filter @workspace/trainchat run dev
```

**Local limitations you will hit:**
- Stripe webhooks require a tunnel (e.g. `stripe listen --forward-to localhost:3000/api/stripe/webhook`)
- Password reset emails use `APP_URL` or `REPLIT_DEV_DOMAIN` for the link — set `APP_URL=http://localhost:3000` locally
- The external API rate limiter is in-memory, so it resets on every restart

---

## 6. Environment Variables

The complete reference is [`.env.example`](.env.example). Here is the short version:

### Required to start the server

| Variable | How to set |
|---|---|
| `PORT` | Injected by Replit. Set to `3000` locally. |
| `DATABASE_URL` | Injected by Replit. Set manually locally. |
| `SESSION_SECRET` | Replit Secrets. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | Replit Secrets. Get from Stripe Dashboard. |
| `STRIPE_WEBHOOK_SECRET` | Replit Secrets. Auto-populated by `stripe-replit-sync` on first start. |

### Required for AI to work

| Variable | How to set |
|---|---|
| `OPENAI_API_KEY` | Replit Secrets. Get from platform.openai.com. |

### Shared values already in `.replit`

`STRIPE_PRICE_*`, `EMAIL_FROM`, and `EMAIL_SUPPORT_TO` are already committed in `.replit
[userenv.shared]`. Do not add them to Replit Secrets.

---

## 7. Running Tests

### CI (GitHub Actions) — runs automatically

GitHub Actions validates every pull request and every push to `main`. You do not need to
trigger it manually. Check the **Actions** tab on GitHub or the status badge on the PR.

**CI validates:** lockfile integrity · typecheck (all packages) · unit tests (both suites) · build verification.

**CI does not validate:** live DB operations, OpenAI/Stripe/SendGrid calls, Replit-specific
session/cookie behavior, or autoscale behavior. Those require Replit (see §8).

See `TESTING.md §3 — CI` for the complete CI vs. Replit split.

### Unit tests

```bash
# Run all unit tests (Vitest)
pnpm --filter @workspace/api-server test

# Run a specific test file
pnpm --filter @workspace/api-server exec vitest run src/__tests__/anonymousMerge.test.ts
```

Current test files in `artifacts/api-server/src/__tests__/`:
- `anonymousMerge.test.ts` — 18 tests for the anonymous→registered merge (DR-0025 fix)
- `prescription-remap.test.ts` — prescription schema remapping logic
- `detect-sport-identities.test.ts` — sport detection
- `session-stimulus-redistribution.test.ts` — session load redistribution
- `sport-fit.test.ts` — sport fitness scoring
- `sport-language-normalizer.test.ts` — sport name normalization

### Integration tests

```bash
# DR-0025 runtime integration test (requires Replit database)
# Run this in the Replit shell — not locally unless DATABASE_URL points to a real DB
pnpm --filter @workspace/api-server exec tsx scripts/integration-test-dr0025.ts
# Expected: 61 passed, 0 failed
```

### TypeScript typecheck

```bash
# Typecheck everything (libs first, then artifacts)
pnpm typecheck

# Known pre-existing issue: TS6305 errors from unbuilt lib/db type declarations
# affect the whole codebase. These are not new. Treat any NEW errors as blockers.
```

---

## 8. Verifying Core Flows

After any non-trivial change, manually verify these flows in the Replit environment.

### Flow 1 — Anonymous user → first program

1. Open the app in a fresh incognito window
2. The app calls `POST /auth/bootstrap` automatically (creates anonymous user)
3. Type: `Build me a 3-day strength program focused on squats and deadlifts`
4. Verify a structured program appears in the chat AND in the right panel (Live Program tab)
5. Verify the program has named sessions, exercises with sets/reps, and a coherent structure

### Flow 2 — Registration (anonymous → registered)

1. After generating a program as anonymous, click Register
2. Register with a new email
3. Verify the program is still visible after registration (anonymous merge worked)
4. Check server logs for: `anonymousMerge: complete` (not `skipping`)

### Flow 3 — Login on a second device

1. Log in to an existing account in a separate incognito window
2. Verify the user's existing programs are visible
3. If you had an anonymous session in that window first, verify the merge happened

### Flow 4 — Program edit

1. With an active program, type: `Change Day 2 to focus on upper body push`
2. Verify the edit applies to Day 2 specifically without regenerating the whole program
3. Verify the Changes tab in the right panel shows what changed

### Flow 5 — Health check

```bash
curl https://<your-domain>/healthz
# Expected: {"status":"ok"}
```

---

## 9. Understanding the AI and Programming System

This section is essential before touching `ai.ts`, `routes/conversations.ts`, or any
programming/mutation logic.

### The two data models

TrainChat has two coexisting program storage models (see `DR-0018`):

| Model | Table | Used by |
|---|---|---|
| **Primary (DB-backed)** | `training_systems` + JSONB `programData` | Main chat pipeline, `/api/training-system/*` |
| **Legacy** | `saved_programs` → `program_days` → `exercises` (relational) | `/api/programs/*`, external API, OpenAPI spec |

**The OpenAPI spec and generated client cover the legacy model, not the primary one.**
Most new feature work touches `training_systems`. The external API uses `external_programs`.

### The AI call path (simplified)

```
User message
  → conversation-context-resolver (deictic reference resolution)
  → conversations.ts SSE handler
  → buildSystemPrompt() in ai.ts
      → memory injection (user_memories, constraints, adaptation signals)
      → research injection (approved whitepaper content, if plan-gated)
      → neural profile injection
      → program context injection
      → UIContext (12+ conditional blocks)
  → OpenAI gpt-4.1 (streaming)
  → response parsing + schema validation
  → mutation pipeline (if edit intent detected)
  → memory extraction (background)
  → session + exercise logging (if session-related)
  → SSE events to client
```

### Models in use

All models are defined in `src/lib/openai-models.ts`:
- `gpt-4.1` — program generation, core chat, edits, directions
- `gpt-4.1-mini` — routing, intent interpretation, memory extraction

### The mutation pipeline

Program edits go through an intent classification → edit engine → validator chain:
1. `edit-intent-service.ts` — classifies the edit (SWAP_EXERCISE, ADJUST_LOAD, ADD_SESSION, etc.)
2. `edit-engine.ts` — executes the structured edit
3. `mutation-verifier.ts` + `post-mutation-validator.ts` — validates the result
4. `mutation-audit-receipt-service.ts` — writes an audit trail
5. `mutation-outcome-finalizer.ts` — persists and returns the receipt

A parallel legacy path (`mutation-engine.ts` → `applyMutation`) still exists for some routes.
See `DR-0018`.

### Memory dominance

Memory is governing, not passive. The priority hierarchy (from `memory-dominance.ts`):
1. Hard constraints (high-confidence injuries, equipment limits)
2. Active signals (recent pain, fatigue, readiness)
3. Block structure (periodization phase)
4. Original intent

High-confidence constraints override scheduled prescriptions. Understand this before editing
anything that touches the system prompt or memory injection.

---

## 10. High-Risk Areas

These areas have the highest consequence for mistakes. Extra care required.

### 🔴 Anonymous user merge (`src/lib/anonymousMerge.ts`)

Data loss bug (DR-0025) was fixed here on 2026-06-30. The fix is verified with 61 integration
assertions. Before touching this file: re-run the integration test and understand the cascade
delete behavior that caused the original bug (`lib/db/src/schema/` — every child table has
`onDelete: "cascade"`).

### 🔴 Session cookies and auth (`src/lib/session.ts`, `src/routes/auth.ts`)

`SESSION_SECRET` changes log out all users. Cookie `secure`/`sameSite` settings are environment-
sensitive — they use `REPLIT_DOMAINS` to detect HTTPS context. Changing these without
understanding the Replit reverse proxy behavior will silently break login on Safari/iOS.

### 🔴 Stripe billing (`src/routes/billing.ts`, `src/routes/stripe.ts`, `src/lib/webhookHandlers.ts`)

Stripe webhook secret changes can miss in-flight events. The webhook URL is auto-constructed from
`REPLIT_DOMAINS` at startup — if the domain changes, the webhook must be re-registered.
Billing plan detection relies on Stripe price `lookup_key` values and on `STRIPE_PRICE_*` env var
fallbacks. Getting this wrong silently puts users on the wrong plan.

### 🟠 Database schema changes (`lib/db/src/schema/`)

`drizzle-kit push` is not reversible without manual SQL. The post-merge script runs it
automatically with a 20-second timeout. Destructive changes (column drops, table drops) will hang
the script waiting for confirmation. Test schema changes against a dev snapshot before merging.

### 🟠 AI system prompt (`src/lib/ai.ts`)

`ai.ts` is ~5,500 lines and builds the entire system prompt for every request. Changing a context
block, adding a condition, or reordering injections can silently change program generation
behavior for all users. Unit tests do not catch this — only live generation does. Any change here
requires a post-deploy program generation smoke test.

### 🟠 Cascade deletes in the DB schema

Every child table (`user_memories`, `conversations`, `training_systems`, `readiness_entries`, etc.)
has `onDelete: "cascade"` on its `userId` FK. Deleting a `users` row wipes everything downstream.
This is intentional for account deletion — but it means any code path that deletes a user row
must first ensure child data is migrated or intentionally discarded. The anonymous merge fix
(DR-0025) exists precisely because the old code deleted the user row too early.

### 🟠 In-memory state under autoscale (`src/lib/conversation-context-resolver.ts`, `src/lib/external-api-rate-limiter.ts`)

Both the conversation context resolver and the external API rate limiter use module-level
in-memory Maps. Under Replit Autoscale with multiple instances, state is not shared. A reference
made in one instance may not be visible in the next request if it lands on a different instance.
See `DR-0020`, `DR-0038`.

---

## 11. Architectural Traps

These are the non-obvious patterns that regularly confuse new contributors.

### Trap 1 — Dual program data models

`training_systems` (primary, JSONB, used by chat) and `saved_programs` (legacy relational, used
by external API and the OpenAPI spec) coexist. Code that reads one will not read the other.
The OpenAPI spec and generated client (`lib/api-client-react/`) cover only the legacy model.
Most new work should target `training_systems`.

### Trap 2 — Dual mutation engines

`mutation-engine.ts` (legacy in-memory `applyMutation`) and the DB-backed edit-engine pipeline
both handle program mutations. Some routes use one, some use the other, some use neither
(they call AI directly). Touching mutation behavior requires understanding which engine a
specific route uses.

### Trap 3 — Unwired scaffolding (`DR-0011`, `DR-0012`)

`agent-personas.ts` exports a persona registry that has zero runtime consumers — the Coach
identity is hardcoded in `ai.ts`. `behavioral-intelligence.ts` and `progression-intelligence.ts`
export functions that are also unwired (0 call sites). These exist as intended architecture that
was never wired up. Do not wire them without understanding the full intent in `CLAUDE.md §4`.

### Trap 4 — Plan-gated memory injection (`DR-0026`)

Memory and adaptation context are only injected into AI calls when the `memoryContext` and
`adaptationContext` feature flags are enabled. This is not documented in `CLAUDE.md §5`.
A user on a plan without these features gets a program generated with no memory context.
Don't assume memory is always injected.

### Trap 5 — Two sender-address env vars

`EMAIL_FROM` (used in `src/lib/email.ts`) and `SENDGRID_FROM_EMAIL` (used in
`src/lib/webhookHandlers.ts`) are separate variables serving the same concept in different
modules. They have different defaults. If you see the wrong sender address on a specific email
type, check which module sends it before changing `EMAIL_FROM`.

### Trap 6 — OpenAPI spec is partial (`DR-0007`)

`lib/api-spec/openapi.yaml` covers ~9 of ~40 mounted routers. The generated client
(`lib/api-client-react/`) and Zod schemas (`lib/api-zod/`) are generated from this partial spec.
Most of the core product surface (chat, mutations, memory, billing, training systems) is
hand-typed and not in the spec. Do not assume a route has a generated client — check whether
it's in the spec first.

### Trap 7 — The post-merge hook is a 20-second gate

`scripts/post-merge.sh` runs automatically on every GitHub→Replit merge. It runs
`pnpm install --frozen-lockfile` and `drizzle-kit push`. If your merge adds a new package
without updating `pnpm-lock.yaml`, the frozen install will fail. If your schema change is
destructive, the push will hang and time out. Both cause the deployment to fail silently from
the git perspective.

---

## 12. Generated Files — Never Edit Directly

The following files are generated by automated tools. Changes will be overwritten.

| File / Path | Generated by | Regenerate with |
|---|---|---|
| `lib/api-client-react/src/generated/api.ts` | Orval (from `openapi.yaml`) | `pnpm run gen:api-client` |
| `lib/api-client-react/src/generated/api.schemas.ts` | Orval (from `openapi.yaml`) | `pnpm run gen:api-client` |
| `lib/api-zod/src/generated/` | Orval (from `openapi.yaml`) | `pnpm run gen:api-client` |
| `artifacts/api-server/dist/` | esbuild (from `src/`) | `pnpm --filter @workspace/api-server run build` |

**Rule:** if you need to change behavior in a generated file, find the source and change that.
- To change API types: edit `lib/api-spec/openapi.yaml`, then regenerate
- To change bundled server behavior: edit `artifacts/api-server/src/`, then rebuild

---

## 13. AI Agent Safety

**Read this before making any code change.**

These rules exist because a mistake in TrainChat's production environment affects real users,
real payments, and real training data. Static analysis and unit tests are not sufficient to verify
correctness here.

### Rules

**1. Read `CLAUDE.md` before touching any subsystem.**
It is the authoritative intent document. If what you see in the code doesn't match `CLAUDE.md`,
that is a known or unknown discrepancy — not a bug you should silently fix. Silently reconciling
docs and code without recording the discrepancy removes information that other engineers need.

**2. Check the Discrepancy Register before implementing a fix.**
Open `docs/documentation-governance.md §5`. Search for the subsystem you're in. If the behavior
you're fixing is already registered, read the DR entry — it has context on why the divergence
exists and whether fixing it requires an architecture decision.

**3. Never mark a discrepancy resolved without runtime verification.**
Unit tests mock the database and the AI. A DR that involves a database operation (merge, cascade,
transaction) or an external service (Stripe, OpenAI, SendGrid) can only be verified by running
against the live Replit environment. The DR-0025 fix required:
- Code change in `anonymousMerge.ts`
- 18 unit tests (Vitest, mocked DB)
- 61 integration assertions against the live Replit database
All three were required before marking it resolved.

**4. Do not edit generated files directly.**
Files in `lib/api-client-react/src/generated/`, `lib/api-zod/src/generated/`, and
`artifacts/api-server/dist/` are overwritten on the next build or codegen run.
Change the source, not the output.

**5. Do not assume documentation is current unless it says so.**
Every implementation doc in `docs/` has a `status:` frontmatter field. Only `VERIFIED` docs
have been reconciled against the source code. `DRAFT` or `DISCREPANCY` status means the doc
may not reflect actual behavior. When in doubt, read the code.

**6. Confirm environment variables before debugging code.**
The most common production failures are missing or wrong env vars — not code bugs. Before
concluding a feature is broken, verify the relevant secrets are set in Replit Secrets.
See [`.env.example`](.env.example) for the full list with required/optional status.

**7. Request runtime verification when touching these areas:**
- **Auth / session** — cookie behavior differs between environments; test in Replit
- **Billing / Stripe** — webhook delivery and plan detection require a live Stripe environment
- **Memory merge** — cascade behavior only visible against a real PostgreSQL database
- **Mutations** — the edit pipeline has validation gates that only trigger with real program data
- **Deployment scripts** — `post-merge.sh` behavior requires a real merge to test

**8. Do not deploy after only static analysis.**
TypeScript compiling does not mean the server starts. The server starting does not mean core
flows work. After any non-trivial change, verify at minimum:
- `GET /healthz` returns `{"status":"ok"}`
- A program generation request succeeds end-to-end
- No new `ERROR` lines appear in server logs at startup

**9. Do not change deployment scripts without documenting the behavior.**
`scripts/post-merge.sh` has a 20-second timeout and runs automatically on every merge.
Adding a long-running command to it will cause deployments to fail silently.
Any change to this script must be documented in `DEPLOYMENT.md`.

**10. The Discrepancy Register is not a TODO list.**
Class-A DRs are already resolved (drift corrected in the docs). Class-B DRs require engineering
decisions — they are documented intentionally, not accidentally. Do not "fix" a Class-B DR by
deleting the old code without understanding whether the decision has been made. Ask first.

---

## 14. Safest First Tasks

These are good entry points that build understanding without risk of breaking production.

| Task | Why it's safe | What you'll learn |
|---|---|---|
| Add a unit test for an existing function | Tests are isolated; no production impact | How a specific piece of logic works |
| Read a subsystem doc alongside its source file | No code changes | How docs and code relate; how to spot discrepancies |
| Add a field to `.env.example` | Documentation-only | Env var system, how vars flow from Replit Secrets to code |
| Add a new `GET` read-only API route | No mutations, no side effects | Route structure, auth middleware, Zod validation pattern |
| Improve a `logger.info` message | No behavior change | Where logging is done and what context is captured |
| Add a test case to `anonymousMerge.test.ts` | Fully mocked; no DB | Mock architecture, the merge flow, how Vitest is structured |
| Read and annotate `docs/documentation-governance.md` | No code changes | How the discrepancy tracking system works |

### Tasks to avoid until you know the system

- Changing `src/lib/ai.ts` system prompt construction
- Adding or removing fields from the `training_systems` JSONB schema
- Changing session cookie configuration
- Modifying Stripe webhook handling
- Editing `scripts/post-merge.sh`
- Changing any `onDelete` behavior in `lib/db/src/schema/`
- Modifying the mutation pipeline validators

---

## 15. Pre-Change Checklist

Before writing code, confirm:

- [ ] You've read `CLAUDE.md` §1–2 and the section for the subsystem you're in
- [ ] You've checked `docs/documentation-governance.md §5` for existing DRs in your area
- [ ] You understand which program data model your change touches (`training_systems` vs `saved_programs`)
- [ ] You know which mutation engine your route uses (if applicable)
- [ ] You've confirmed environment variables are present before assuming a feature is broken
- [ ] If the change touches the DB: you understand the cascade delete behavior for any table you're modifying
- [ ] If the change touches AI: you understand which context blocks are injected and which plan gates apply
- [ ] If the change touches auth: you've confirmed the cookie behavior in the target environment

---

## 16. Pre-Deploy Checklist

Before pushing to `main` (which triggers Replit auto-deploy):

- [ ] Unit tests pass: `pnpm --filter @workspace/api-server test`
- [ ] No new TypeScript errors (new errors only — pre-existing TS6305 from unbuilt lib/db are expected)
- [ ] `pnpm-lock.yaml` is committed if new packages were added (frozen install will fail otherwise)
- [ ] Schema changes tested: `pnpm --filter db push` runs without destructive-change prompts
- [ ] Required secrets confirmed in Replit Secrets: `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`
- [ ] If DB schema changed: tested against a dev data snapshot, not just empty tables
- [ ] If auth changed: tested in Replit (not locally) — cookie behavior differs
- [ ] If memory/merge changed: `scripts/integration-test-dr0025.ts` passes in Replit
- [ ] If billing changed: Stripe webhook delivery verified in Stripe Dashboard
- [ ] If AI prompt changed: program generation smoke test passed in Replit
- [ ] Post-deploy: `GET /healthz` returns `{"status":"ok"}`
- [ ] Post-deploy: no `ERROR` lines in Replit startup logs

---

## Doc Inconsistencies Found During This Audit

The following were noticed while writing this document and are recorded for transparency:

1. **`docs/documentation-map.md` still references DR-0025 as a high-severity open item** in its
   roll-up count and summary text (`DR-0025` listed among 3 `high`-severity items). DR-0025 was
   resolved 2026-06-30. The map's roll-up section should be updated to reflect 2 high-severity
   items remaining (`DR-0007`, `DR-0011`) and the resolved status of `DR-0025`.

2. **`replit.md` lists AI Core as `OpenAI GPT-4o`** but the codebase uses `gpt-4.1` across all
   roles (as of the `openai-models.ts` migration). This is `DR-0014` (low-severity, already in
   the register). Not a new finding, but worth knowing.

3. **`replit.md` says "DB Push: `pnpm drizzle-kit push:pg`"** but the actual command is
   `pnpm --filter db push`. The old syntax `push:pg` is the Drizzle 0.x syntax; the current
   Drizzle 0.45.x uses `push`. This could cause confusion for a new engineer following `replit.md`.
