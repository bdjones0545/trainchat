# TrainChat

**An AI Performance Architect — a conversational coaching system that designs, edits, and adapts real strength-and-conditioning programs through dialogue.**

TrainChat is not a chatbot bolted onto a workout app. It is an agent-first training platform where the program *is* the conversation: users describe what they want to train, and a coordinated system of AI agents builds, mutates, and adapts a live training program in real time — with every change returned as a typed, auditable receipt.

---

## Overview

Most training apps make you fill out forms; most fitness chatbots give you generic text you then have to translate into a plan yourself. TrainChat closes that gap. It pairs a deterministic programming engine (which owns program *structure* — periodization, prescription fields, routing) with generative LLM coaching (which owns *language* and nuance), so users get personalized, evidence-informed programs that stay coherent as they evolve.

The experience is designed to feel like "vibe coding your training": a live training workspace with a three-panel layout — conversations on the left, chat in the center, and a **Live Program Panel** on the right (Program, Adapted, Changes, History, and Forecast tabs) that updates as the coach makes changes.

**Who it's for:** athletes, lifters, and general-fitness users who want an adaptive program that responds to conversation — and, via a first-class external API, developers who want to embed program generation and editing into their own products.

Key product behaviors:
- **Anonymous-user-first** — every visitor is a real account from the first byte; data merges into a registered account on signup.
- **Guided first run** — new users are prompted to "Build your training system" with category chips (Strength, Speed, Mobility, General).
- **Freemium** — users get a set number of free chat messages before a signup/paywall prompt; billing is handled through Stripe (Starter / Pro / Elite tiers).
- **External API** — a namespaced, API-key-authenticated surface (`/api/external/*`) for program generation, editing, and retrieval, including SSE streaming.

---

## Features

- **Conversational program design & editing** — generate a full training system, then edit it in natural language ("swap that exercise", "do the same for Day 2", "make Wednesday easier").
- **Deictic follow-up resolution** — an in-memory Conversation Context Resolver rewrites vague follow-ups ("change that", "undo that") into fully-specified instructions before execution, tracking exercise/session/mutation references across turns.
- **Receipt-first mutations** — every change to a program returns a typed `MutationSuccessReceipt` or `MutationFailureReceipt`; the UI reacts to receipts, never to inferred state. No silent changes.
- **Safety & quality gates** — generated output passes deterministic validation gates, a shared "constitution" of hard laws (safety/pain overrides, equipment respected, no medical claims), and CEO Heartbeat coaching-quality checks before a user sees it.
- **Research-informed programming** — pre-screened research is injected into the coach's prompt as structured programming constraints (optional research-discovery pipeline with PubMed / Semantic Scholar).
- **Adaptive Live Program Panel** — Program, Adapted, Changes, History, and Forecast views that reflect the program's evolution.
- **Streaming chat** — Server-Sent Events (SSE) for both the in-app chat and the external streaming generation endpoint.
- **Full billing lifecycle** — Stripe checkout, billing portal, webhooks, and reconciliation, with lookup-key-based pricing.

---

## Architecture — the agent system

TrainChat's intelligence lives in a server-side **three-agent** orchestration layer with strict, typed boundaries. Users only ever talk to "one unified TrainChat coach" — the internal agents are never exposed.

| Agent (internal persona) | Nature | Responsibility | User-facing? |
|---|---|---|---|
| **Coach** (Coach Atlas) | LLM (OpenAI) | All user-facing responses and programs | Yes |
| **Performance Architect** (Architect Vale) | Deterministic (no LLM) | Produces the architecture brief injected into the Coach's prompt | No |
| **Research Librarian** (Dr. Sable) | LLM (admin-only) | Evaluates evidence, writes to the research DB | No |

Supporting layers:
- **Constitution** (`agents/trainchat-constitution.ts`) — a shared identity/law layer with 7 hard laws and an authority hierarchy (SAFETY → USER_CONSTRAINTS → COACH_JUDGMENT → ARCHITECT_STRUCTURE → RESEARCH_GUIDANCE → STYLE_PERSONA), prepended to the Coach's system prompt.
- **Orchestrator** (`agents/agent-orchestrator.ts`) — a pure decision function that routes turns, resolves conflicts, defines typed handoff contracts, and runs the architecture gate.
- **CEO Heartbeat** (`agents/ceo-heartbeat.ts`) — coaching-quality checks merged into the architecture gate.
- **Unified Context Pipeline (`UIContext`)** — assembles a consistent context block for every AI call to prevent context drift across services.

> Engineering principle: **deterministic skeleton, generative skin.** The model never invents structure the engine can own. TrainChat also intentionally runs several **dual systems** (program models, mutation engines, memory systems, anonymous/guest identity) that coexist by design — see the docs below before "cleaning up" either side.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 (project references, `tsc --build`) |
| Backend | Express 5 (`@workspace/api-server`) |
| Frontend | React 19 + Vite 7, Wouter (routing), TanStack Query, Tailwind CSS v4, Radix UI, Framer Motion |
| Database | PostgreSQL 16 via Drizzle ORM (push-based schema) |
| Validation | Zod |
| API contracts | OpenAPI + Orval codegen (React Query client + Zod schemas) — partial coverage |
| AI | OpenAI (Coach / Librarian) |
| Payments | Stripe (+ `stripe-replit-sync`) |
| Email | SendGrid |
| Monorepo | pnpm workspaces |
| Hosting | Replit (autoscale deployment) |

---

## Getting Started

### Prerequisites
- **Node.js 24**
- **pnpm** (this repo enforces pnpm; a `preinstall` hook rejects npm/yarn)
- A **PostgreSQL 16** database
- API keys for **OpenAI** and **Stripe** (and SendGrid for email)

### 1. Install

```bash
pnpm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

**Required (server will not start without these):**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (thrown at import if missing) |
| `SESSION_SECRET` | Express session signing key (long random string) |
| `PORT` | Server listen port |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |

**Required for core functionality (server starts, but AI breaks without it):**

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Powers all AI generation (chat, program design). Falls back to `AI_INTEGRATIONS_OPENAI_API_KEY` on Replit. |

**Common optional vars:** `CLIENT_URL` / `APP_URL`, `SENDGRID_API_KEY` + `EMAIL_FROM`, `STRIPE_PRICE_*` (price fallbacks), `ADMIN_EMAILS`, `SENTRY_DSN`, `RESEARCH_DISCOVERY_ENABLED` (+ `PUBMED_*` / `SEMANTIC_SCHOLAR_API_KEY`), `LOG_LEVEL`, `BASE_PATH` (required by Vite builds). See [`.env.example`](.env.example) and [DEPLOYMENT.md](DEPLOYMENT.md) §4 for the complete, annotated list.

### 3. Set up the database

```bash
pnpm --filter @workspace/db migrate       # apply ordered production migrations
```

Versioned SQL in `lib/db/drizzle/` is the production authority. Development
schema push is available only as `dev:push` for disposable local databases; see
[`lib/db/MIGRATIONS.md`](lib/db/MIGRATIONS.md).

### 4. (Optional) Provision Stripe products

```bash
pnpm --filter @workspace/scripts run stripe:setup-products   # idempotent
pnpm --filter @workspace/scripts run stripe:setup-webhook
```

### 5. Run in development

The workspace runs as separate app processes. Start the backend and frontend:

```bash
pnpm --filter @workspace/api-server dev    # build + start the Express API
pnpm --filter @workspace/trainchat dev     # Vite dev server for the React UI
```

> On Replit, the quickstart aliases in [replit.md](replit.md) wrap these (`pnpm dev`, `pnpm build`).

### Build & typecheck (root)

```bash
pnpm build          # typecheck, then recursively build all packages
pnpm typecheck      # typecheck libs + apps
pnpm typecheck:libs # tsc --build across lib project references
```

### Regenerate API client (after editing the OpenAPI spec)

```bash
pnpm --filter @workspace/api-spec codegen
```

> Generated directories (`lib/api-client-react/src/generated`, `lib/api-zod/src/generated`) are **never** hand-edited — change `lib/api-spec/openapi.yaml` and regenerate. Note the spec covers only a subset (~9 of ~40 routers); the core SSE chat + mutation flow uses hand-synchronized types.

---

## Project structure

```
trainchat/
├── lib/                          shared libraries (the contract + data core)
│   ├── db/                       @workspace/db              — Drizzle schema + client (data ground truth)
│   ├── api-spec/                 @workspace/api-spec        — openapi.yaml + Orval config
│   ├── api-zod/                  @workspace/api-zod         — generated Zod validators
│   ├── api-client-react/         @workspace/api-client-react— generated React Query client
│   └── integrations/*            reserved glob for integration libs
├── artifacts/                    independently buildable apps
│   ├── api-server/               @workspace/api-server      — Express 5 backend (agents, AI, routes, billing)
│   ├── trainchat/                @workspace/trainchat       — React 19 frontend (the product)
│   ├── mockup-sandbox/           @workspace/mockup-sandbox  — UI prototyping surface
│   └── wp-*/                      three whitepaper microsites (thought-leadership, not engines)
├── scripts/                      @workspace/scripts         — tsx operational tooling (Stripe, IndexNow, seeds)
├── docs/                         subsystem implementation docs (code-derived)
├── .env.example                  annotated environment reference
└── *.md                          architecture, onboarding, audit & QA records (see below)
```

Notable backend locations (in `artifacts/api-server/src/`):
- `agents/` — constitution, orchestrator, personas, CEO heartbeat
- `lib/ai.ts` — the Coach Agent (prompt construction + generation)
- `routes/`, `routes/external/` — HTTP surface, including the API-key-authed external namespace
- `lib/` — mutation engine, memory, conversation-context resolver, billing/Stripe utilities

---

## Documentation

This README is an entry point. The deeper docs already in the repo are the source of truth:

**Start here**
- [ONBOARDING.md](ONBOARDING.md) — repo structure, high-risk areas, architectural traps (read this first as a human engineer)
- [AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md) — required reading and warnings for AI coding agents working in this repo
- [CLAUDE.md](CLAUDE.md) — canonical architecture specification and engineering philosophy

**Operate & ship**
- [DEPLOYMENT.md](DEPLOYMENT.md) — deployment model, full environment-variable reference, DB migration steps
- [SECURITY.md](SECURITY.md) — security posture, secrets, dependency-audit policy
- [TESTING.md](TESTING.md) — what tests exist and what must pass
- [replit.md](replit.md) — operational quickstart (run/build/env)

**Subsystem deep dives** (`docs/`)
- [docs/ai-agents.md](docs/ai-agents.md) — constitution, orchestrator, Coach & gates
- [docs/context-pipeline.md](docs/context-pipeline.md) · [docs/memory.md](docs/memory.md) · [docs/mutation-pipeline.md](docs/mutation-pipeline.md)
- [docs/db-schema.md](docs/db-schema.md) · [docs/identity-billing.md](docs/identity-billing.md) · [docs/external-api.md](docs/external-api.md)
- [docs/exercise-programming.md](docs/exercise-programming.md) · [docs/adaptation-loop.md](docs/adaptation-loop.md) · [docs/research.md](docs/research.md) · [docs/frontend.md](docs/frontend.md)
- [docs/documentation-governance.md](docs/documentation-governance.md) — the **Discrepancy Register** (known gaps between docs and code)

**Design & audit records:** `*_QA.md` and `*_AUDIT.md` at the repo root (e.g. `AGENT_ORCHESTRATION_QA.md`, `AGENT_CHAIN_OF_COMMAND_AUDIT.md`, `SYSTEM_BRAIN_AUDIT.md`) capture design intent and may be partly aspirational — treat **code as ground truth** where they conflict.

---

## Deployment

TrainChat targets **Replit** (see [`.replit`](.replit) as the source of truth for what deploys):
- Modules: `nodejs-24`, `python-3.11`, `postgresql-16`
- Deployment target: `autoscale`, application router
- Registered deployable artifacts: `artifacts/api-server` and `artifacts/mockup-sandbox`; the frontend and whitepaper sites are Vite builds served alongside
- A `postMerge` hook (`scripts/post-merge.sh`) auto-applies schema changes on merge

Full deployment procedure, required secrets, and manual migration steps are in [DEPLOYMENT.md](DEPLOYMENT.md).
