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
| `CLAUDE.md` | Architecture Specification (**v1.1 — reconciled against V2 docs**) | 🟢 VERIFIED |
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
| 3 | `ai-agents` | `docs/ai-agents.md` ✅ | `artifacts/api-server/src/agents/*`, `lib/ai.ts`, `lib/openai-models.ts`, `routes/conversations.ts` | CLAUDE.md §4 | 🟢 VERIFIED | L3 |
| 4 | `mutation-pipeline` | `docs/mutation-pipeline.md` ✅ | `lib/mutation-ontology.ts`, `lib/edit-intent-service.ts`, `lib/edit-engine.ts`, `lib/mutation-verifier.ts`, `lib/post-mutation-validator.ts`, `lib/mutation-outcome-finalizer.ts`, `lib/mutation-audit-receipt-service.ts`, `lib/change-log-service.ts`, `routes/conversations.ts` | CLAUDE.md §4 | 🟢 VERIFIED | L3 |
| 5 | `context-pipeline` | `docs/context-pipeline.md` ✅ | `lib/conversation-context-resolver.ts`, `lib/ai.ts` (`buildSystemPrompt`, `UIContextData`), `routes/conversations.ts` | CLAUDE.md §4 | 🟢 VERIFIED | L3 |
| 6 | `memory` | `docs/memory.md` ✅ | `lib/memory.ts`, `lib/memory-dominance.ts`, `lib/constraint-memory.ts`, `lib/decision-memory-service.ts`, `lib/atlas-memory-*`, `lib/adaptation.ts`, `lib/anonymousMerge.ts`, `routes/atlas-memories.ts` | CLAUDE.md §5 | 🟢 VERIFIED | L3 |
| 7 | `research` | `docs/research.md` ✅ | `artifacts/api-server/src/research/*`, `lib/globalLearningService.ts`, `lib/ai.ts`, `lib/edit-intent-service.ts` | CLAUDE.md §6 | 🟢 VERIFIED | **L4** |
| 8 | `exercise-programming` | `docs/exercise-programming.md` ✅ | `lib/program-architecture-engine.ts`, `lib/periodization-engine.ts`, `lib/prescription-schema.ts`, `lib/prescription-remap.ts`, `lib/programs/*`, `lib/focus-engines/*`, `services/program-build-service.ts` | CLAUDE.md §7 | 🟢 VERIFIED | L3 |
| 9 | `adaptation-loop` | `docs/adaptation-loop.md` ✅ | `lib/adaptation.ts`, `lib/check-in-adaptation.ts`, `lib/performance-adaptation-service.ts`, `lib/session-log-adaptation-analyzer.ts`, `lib/system-adjustment-service.ts`, `routes/{readiness,session-logs}.ts` | CLAUDE.md §7 | 🟢 VERIFIED | L3 |
| 10 | `external-api` | `docs/external-api.md` ✅ | `routes/external/*`, `middlewares/external-api-auth.ts`, `lib/external-api-rate-limiter.ts`, schema `external-api.ts` | CLAUDE.md §2/§3 | 🟢 VERIFIED | L3 |
| 11 | `identity-billing` | `docs/identity-billing.md` ✅ | `lib/session.ts`, `routes/{auth,guest,billing,stripe}.ts`, `lib/{guestService,anonymousMerge,webhookHandlers,stripeStorage,stripeClient}.ts`, `app.ts` | CLAUDE.md §2/§3 | 🟢 VERIFIED | L3 |
| 12 | `frontend` | `docs/frontend.md` ✅ | `artifacts/trainchat/src/*` (main/App/lib/hooks/pages) | CLAUDE.md §2 | 🟢 VERIFIED | L3 |

> Ordering and rationale for which of these get written first is in
> `docs/version-2-roadmap.md`. The 12 keys above are the canonical subsystem vocabulary —
> use these exact keys in `subsystem:` frontmatter.

## 4. Roll-up (current state)

- **Governance framework:** complete (8/8 documents present and verified).
- **Implementation coverage: 12 / 12 subsystems documented — Version 2 COMPLETE.** `research`
  🟢 VERIFIED / **L4**; the other 11 🟢 VERIFIED / L3. Knowledge-base implementation maturity: **L3+**
  (all subsystems verified; one reconciled to L4).
- **CLAUDE.md reconciliation:** v1.1 pass complete (2026-06-29) — see the **Reconciliation ledger**
  in `documentation-governance.md §5`. **30 entries → `resolved`** (doc-vs-code drift corrected in
  CLAUDE.md); **11 → `reconciling`** (documented in CLAUDE.md §11, awaiting code fix), incl. both
  high items `DR-0011`, `DR-0025`.
- **Discrepancy Register:** 41 entries (`DR-0001` low; `DR-0002`–`DR-0006` `db-schema`;
  `DR-0007`–`DR-0010` `contract-spine`; `DR-0011`–`DR-0015` `ai-agents`; `DR-0016`–`DR-0019`
  `mutation-pipeline`; `DR-0020`–`DR-0023` `context-pipeline`; `DR-0024`–`DR-0026` `memory`;
  `DR-0027`–`DR-0028` `research`; `DR-0029`–`DR-0031` `exercise-programming`; `DR-0032`–`DR-0034`
  `adaptation-loop`; `DR-0035`–`DR-0037` `identity-billing`; `DR-0038`–`DR-0039` `external-api`;
  `DR-0040`–`DR-0041` `frontend`) — see `docs/documentation-governance.md §5`. **3 `high`-severity:**
  `DR-0007`, `DR-0011`, `DR-0025`.

## 5. Maintenance

This map is updated at the close of every reconciliation cycle (workflow Phase 4 / governance §6):
refresh each subsystem's status + maturity, update the roll-up, and reflect Discrepancy Register
counts. The map never contains subsystem content — only pointers and state.
