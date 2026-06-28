# Documentation Map

> **Document type:** Governance — Index
> **Purpose:** the single index of the TrainChat Engineering Knowledge Base — what documents
> exist, what they cover, their status and maturity, and which code they are generated from.
> This map is the entry point; read it before writing or trusting any document.

## 1. How the Knowledge Base is structured

```
CLAUDE.md                         ← Architecture Specification (intent). Tier: Architecture.
docs/
├── _template.md                  ← Frontmatter + section template for implementation docs.
├── documentation-map.md          ← THIS FILE. The index.
├── documentation-governance.md   ← Rules: tiers, source-of-truth, discrepancy register, roles.
├── documentation-generation-workflow.md  ← How impl docs are generated from code & verified.
├── documentation-maturity-model.md       ← L0–L5 quality ladder.
├── documentation-status-legend.md        ← 🟢🟡🟠🔴⚪⚫ status vocabulary.
├── version-2-roadmap.md          ← Order in which implementation docs get written.
└── implementation/               ← (Version 2) generated, code-derived subsystem docs.
```

Legend used below: see `docs/documentation-status-legend.md` (status) and
`docs/documentation-maturity-model.md` (maturity L0–L5).

## 2. Governance documents (this framework)

| Document | Purpose | Status |
|---|---|---|
| `CLAUDE.md` | Architecture Specification (v1.0) | 🟢 VERIFIED |
| `docs/_template.md` | Implementation-doc template + verification frontmatter | 🟢 VERIFIED |
| `docs/documentation-map.md` | This index | 🟢 VERIFIED |
| `docs/documentation-governance.md` | Governance constitution + Discrepancy Register | 🟢 VERIFIED |
| `docs/documentation-generation-workflow.md` | Code→doc generation & reconciliation process | 🟢 VERIFIED |
| `docs/documentation-maturity-model.md` | Maturity ladder L0–L5 | 🟢 VERIFIED |
| `docs/documentation-status-legend.md` | Status badge vocabulary | 🟢 VERIFIED |
| `docs/version-2-roadmap.md` | Implementation document order | 🟢 VERIFIED |

## 3. Implementation subsystems (the coverage matrix)

These are the planned implementation documents. Every one maps to a subsystem of the live
codebase and to a `CLAUDE.md` section. All are ⚪ **PLANNED / L0–L1** until Version 2 begins —
**no implementation documentation has been generated yet.**

| # | Subsystem key | Document (planned path) | Source of truth (primary) | Architecture anchor | Status | Maturity |
|---|---|---|---|---|---|---|
| 1 | `db-schema` | `docs/db-schema.md` ✅ | `lib/db/src/schema/*`, `lib/db/src/index.ts`, `lib/db/drizzle.config.ts` | CLAUDE.md §3 | 🟢 VERIFIED | L3 |
| 2 | `contract-spine` | `docs/contract-spine.md` ✅ | `lib/api-spec/openapi.yaml`, `lib/api-spec/orval.config.ts`, `lib/api-zod/`, `lib/api-client-react/`, `api-server/src/routes/index.ts` | CLAUDE.md §2 (contract spine) | 🟢 VERIFIED | L3 |
| 3 | `ai-agents` | `docs/implementation/ai-agents.md` | `artifacts/api-server/src/agents/*`, `lib/ai.ts`, `lib/openai-models.ts` | CLAUDE.md §4 | ⚪ PLANNED | L1 |
| 4 | `mutation-pipeline` | `docs/implementation/mutation-pipeline.md` | `lib/mutation-ontology.ts`, `services/mutation-execution-service.ts`, `lib/mutation-verifier.ts`, `lib/post-mutation-validator.ts`, schema `mutation-audit-receipts.ts` | CLAUDE.md §4 | ⚪ PLANNED | L1 |
| 5 | `context-pipeline` | `docs/implementation/context-pipeline.md` | `lib/conversation-context-resolver.ts`, `lib/ai.ts` (`buildSystemPrompt`) | CLAUDE.md §4 | ⚪ PLANNED | L1 |
| 6 | `memory` | `docs/implementation/memory.md` | `lib/memory-dominance.ts`, `lib/atlas-memory-*`, schema `memory.ts`/`atlas-memories.ts`/`neural-profile.ts`/`performance-profiles.ts` | CLAUDE.md §5 | ⚪ PLANNED | L1 |
| 7 | `research` | `docs/implementation/research.md` | `artifacts/api-server/src/research/*`, schema `research.ts`/`knowledge.ts`/`global-learning.ts` | CLAUDE.md §6 | ⚪ PLANNED | L1 |
| 8 | `exercise-programming` | `docs/implementation/exercise-programming.md` | `lib/program-architecture-engine.ts`, `lib/periodization-engine.ts`, `lib/prescription-schema.ts`, `lib/programs/*` | CLAUDE.md §7 | ⚪ PLANNED | L1 |
| 9 | `adaptation-loop` | `docs/implementation/adaptation-loop.md` | `lib/check-in-adaptation.ts`, `lib/performance-adaptation-service.ts`, `lib/session-log-adaptation-analyzer.ts`, schema `readiness.ts`/`session-logs.ts`/`system-adjustment-events.ts` | CLAUDE.md §7 | ⚪ PLANNED | L1 |
| 10 | `external-api` | `docs/implementation/external-api.md` | `routes/external/*`, `middlewares/external-api-auth.ts`, `lib/external-api-rate-limiter.ts`, schema `external-api.ts` | CLAUDE.md §2/§3 | ⚪ PLANNED | L1 |
| 11 | `identity-billing` | `docs/implementation/identity-billing.md` | `routes/auth.ts`, `routes/guest.ts`, `routes/billing.ts`, `routes/stripe.ts`, schema `users.ts`/`guest-sessions.ts`/`billing.ts` | CLAUDE.md §2/§3 | ⚪ PLANNED | L1 |
| 12 | `frontend` | `docs/implementation/frontend.md` | `artifacts/trainchat/src/*` | CLAUDE.md §2 | ⚪ PLANNED | L1 |

> Ordering and rationale for which of these get written first is in
> `docs/version-2-roadmap.md`. The 12 keys above are the canonical subsystem vocabulary —
> use these exact keys in `subsystem:` frontmatter.

## 4. Roll-up (current state)

- **Governance framework:** complete (8/8 documents present and verified).
- **Implementation coverage:** 2 / 12 subsystems documented (`db-schema`, `contract-spine` —
  both 🟢 VERIFIED / L3). Remaining 10: ⚪ PLANNED / L1.
- **Discrepancy Register:** 10 open (`DR-0001` low; `DR-0002`–`DR-0006` from `db-schema`;
  `DR-0007`–`DR-0010` from `contract-spine`) — see `docs/documentation-governance.md §5`.
  **1 `high`-severity:** `DR-0007` (contract covers ~9 of 40 routers).

## 5. Maintenance

This map is updated at the close of every reconciliation cycle (workflow Phase 4 / governance §6):
refresh each subsystem's status + maturity, update the roll-up, and reflect Discrepancy Register
counts. The map never contains subsystem content — only pointers and state.
