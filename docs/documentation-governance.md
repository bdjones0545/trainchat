# Documentation Governance

> **Document type:** Governance — Constitution for the Knowledge Base
> **Purpose:** the rules that keep TrainChat's documentation honest: separation of architecture
> from implementation, code as source of truth, discrepancy tracking, and continuous
> reconciliation between `CLAUDE.md` and the implementation documents.

## 1. The document hierarchy

TrainChat documentation has three tiers with **strict, non-overlapping authority**:

| Tier | Document(s) | Authority | Changes when… |
|---|---|---|---|
| **Architecture** | `CLAUDE.md` | Defines *intended* structure, boundaries, and philosophy. | An architectural boundary moves — deliberately. |
| **Implementation** | `docs/implementation/*.md` | Describes *as-built* behavior, generated from code. | The code it documents changes. |
| **Governance** | `docs/*.md` (this set) | Defines the *process* by which the other two stay true. | The process itself is revised. |

**Ground-truth ordering (memorize this):**

```
CODE  ▶  IMPLEMENTATION DOCS  ▶  CLAUDE.md (architecture)  ▶  *_QA.md / *_AUDIT.md (design intent)
 (truth)   (derived from code)    (intended design)          (historical/aspirational)
```

When two tiers disagree, the **higher-truth source wins**, and the disagreement is logged as a
discrepancy. Documentation never overrides code; architecture never silently follows code.

## 2. Separation of Architecture and Implementation (the prime rule)

- `CLAUDE.md` says **what the system is meant to be**. It is authored by intent and changed
  deliberately. It contains **no generated, file-level implementation detail**.
- `docs/implementation/*.md` say **what the code actually does**. They are **generated from code**
  per `documentation-generation-workflow.md` and carry verification metadata.
- Neither may absorb the other's job. An implementation doc that starts redefining architecture,
  or an architecture doc that starts enumerating function-by-function behavior, is out of bounds.

## 3. Code is the source of truth

Every implementation document declares a `source_of_truth` (the files it is derived from). A claim
in a doc that the source files do not support is a **defect in the document**, not in the code —
regardless of how reasonable the claim sounds. Verification (workflow Phase 2) exists to catch
exactly this.

## 4. Implementation documents must be generated from code

No implementation document may be authored from `replit.md`, from a `*_QA.md` design record, or
from memory. The generation workflow requires reading the cited source. Design records inform
*questions to ask the code*; they are never themselves the source.

## 5. Discrepancy Register

The single ledger of every known gap between code, implementation docs, and architecture.

**Each entry:**

| Field | Meaning |
|---|---|
| `id` | `DR-####`, monotonic. |
| `subsystem` | Subsystem key. |
| `summary` | One line: what disagrees with what. |
| `kind` | `doc-vs-code` · `code-vs-architecture` · `architecture-vs-architecture`. |
| `severity` | `low` · `medium` · `high` (high = safety, data, or contract correctness). |
| `status` | `open` · `reconciling` · `resolved` · `wontfix`. |
| `resolution_path` | Which tier changes, and the linked action (issue / CLAUDE.md edit / doc fix). |
| `opened` / `closed` | Dates + author. |

**Register table** (seed — populated during Version 2 reconciliation):

| id | subsystem | summary | kind | severity | status |
|---|---|---|---|---|---|
| DR-0001 | ai-agents | `replit.md` cites model "GPT-4o"; live registry `lib/openai-models.ts` resolves the GPT-4.1 family. CLAUDE.md §9 already notes this. | doc-vs-code | low | open |
| DR-0002 | db-schema | `drizzle/0000` migration snapshot covers 29 of 51 tables — stale; `lib/db/src/schema/*` is authoritative (applied via `drizzle-kit push`). | doc-vs-code | medium | open |
| DR-0003 | db-schema | `performance_profiles.user_id` is `text` while `users.id` is serial int — cannot be a real FK; type-inconsistent soft reference. | code-vs-architecture | medium | open |
| DR-0004 | db-schema | `mutation_audit_receipts.conversation_id` is `text` while `conversations.id` is serial int — type-inconsistent soft reference. | code-vs-architecture | low | open |
| DR-0005 | db-schema | Many cross-entity references are soft (plain integer, no FK); CLAUDE.md §3 reads as fully relational. Referential integrity is partly application-enforced. | doc-vs-code | medium | open |
| DR-0006 | db-schema | No `db.transaction(...)` wraps multi-table writes; CLAUDE.md §4 implies snapshot/mutation integrity. Integrity rests on append-only receipts + jsonb snapshots, not DB atomicity. | code-vs-architecture | medium | open |
| DR-0007 | contract-spine | OpenAPI spec covers ~9 of 40 mounted routers (24 operations); most of the HTTP surface (training-system, billing, memory, external, etc.) is hand-written and uncontracted. CLAUDE.md §2 reads as if the spec is the whole surface. | doc-vs-code | high | open |
| DR-0008 | contract-spine | Within covered routes, request validation/error envelopes are only partially enforced by generated schemas; inline zod + ad-hoc `{ error }` responses are used. | doc-vs-code | medium | open |
| DR-0009 | contract-spine | Contracted `Program`/`ProgramDay`/`Exercise` DTOs model the **legacy** `saved_programs` hierarchy; the canonical `training_systems` model is uncontracted. Cross-ref `docs/db-schema.md §10`. | code-vs-architecture | medium | open |
| DR-0010 | contract-spine | No CI/parity guard that committed generated output matches the spec, or that the spec matches the mounted routes; spec ↔ generated ↔ routes drift is unguarded. | code-vs-architecture | medium | open |
| DR-0011 | ai-agents | `agent-personas.ts` persona registry is unwired (0 runtime consumers); the Coach's identity is hardcoded inline in `lib/ai.ts` — drift risk between the documented persona and the live prompt. | code-vs-architecture | high | open |
| DR-0012 | ai-agents | `behavioral-intelligence.ts` + `progression-intelligence.ts` are unwired (0 consumers of exported functions) despite appearing in the orchestrator's documented Phase-8 flow. | code-vs-architecture | medium | open |
| DR-0013 | ai-agents | Two conflict hierarchies both claim sole authority: constitution's 6-level `AUTHORITY_HIERARCHY` vs orchestrator's 5-level `CONFLICT_RESOLUTION_HIERARCHY` (CLAUDE.md §4 documents only the latter). | code-vs-architecture | medium | open |
| DR-0014 | ai-agents | `openai-models.ts` comments contradict their values (mention "remain on gpt-4o" while all values are gpt-4.1). Sharpens DR-0001. | doc-vs-code | low | open |
| DR-0015 | ai-agents | Coach Agent prompt embeds a MANDATORY conversion/sales-strategist identity layer not reflected in CLAUDE.md §4's coaching-only framing. | doc-vs-code | medium | open |
| DR-0016 | mutation-pipeline | Ontology rich metadata (aiDirective/antiPatterns/minimumStructuralChanges/defaultScope/aliases) is unconsumed; resolveMutationCommand/MUTATION_ONTOLOGY/getMutationFamilies have 0 live callers. Ontology is a classifier only. | code-vs-architecture | medium | open |
| DR-0017 | mutation-pipeline | `mutation_audit_receipts` is written only by edit-panel/history routes, not the chat path; chat audits via `system_change_log` + in-response receipts. db-schema §4.2 implies universal coverage. | doc-vs-code | medium | open |
| DR-0018 | mutation-pipeline | Dual mutation engines: legacy in-memory `mutation-engine.ts` (applyMutation) coexists with the DB-backed `edit-intent-service`+`edit-engine` primary chat pipeline. | code-vs-architecture | medium | open |
| DR-0019 | mutation-pipeline | Two gates (`validateStructuralChanges` edits / `validateArchitectureGate` builds); `mutation-execution-service` is a thin adapter, not the self-contained executor CLAUDE.md §4 implies. | doc-vs-code | low | open |
| DR-0020 | context-pipeline | Conversation context resolver uses a module-level in-memory Map; `deploymentTarget` is autoscale → server-side conversational context is not shared across instances. | code-vs-architecture | medium | open |
| DR-0021 | context-pipeline | `storeExerciseReference`/`storeSessionReference` are unused in production (tests only); exercise/session deictic refs are populated only via mutation inference. | code-vs-architecture | low | open |
| DR-0022 | context-pipeline | Two overlapping deixis-resolution strategies coexist: the deterministic resolver (rewrites the message) and the LLM-delegated UIContext prompt section. | doc-vs-code | low | open |
| DR-0023 | context-pipeline | CLAUDE.md §4 claims "~30 conditional context blocks"; ~10+ distinct engine blocks observed, exact count unverified. | doc-vs-code | low | open |
| DR-0024 | memory | Two parallel memory systems: `user_memories` (server-side, chat-extracted via memory.ts, injected into the Coach prompt) vs `atlas_memories` (frontend context UI via atlas-memories route + atlas-memory-extractor). Coach prompt never reads atlas. | doc-vs-code | medium | open |
| DR-0025 | memory | Anon→registered merge migrates only conversations + training_systems then deletes the anon user, cascade-deleting user_memories/atlas_memories/neural_profiles/profiles/readiness/session_logs/exercise_logs — silent data loss; contradicts CLAUDE.md §5 "memory merges on signup." | code-vs-architecture | high | open |
| DR-0026 | memory | Memory + adaptation (incl. memory dominance) injection is plan-gated (memoryContext/adaptationContext features), not universal. | doc-vs-code | medium | open |
| DR-0027 | research | Research-informed programming silently no-ops (empty guidance/context) when no approved+active documents exist; live evidence base depends on manually-run seeders/ingestion. | doc-vs-code | low | open |
| DR-0028 | research | Global-learning capture (`trackLearningEvent`) is wired on edit/feedback/history routes, not the main conversations chat handler — partial interaction coverage. | code-vs-architecture | low | open |
| DR-0029 | exercise-programming | Validator proliferation: ≥4 overlapping program/architecture validators (validateProgramArchitecture, validateProgrammingQuality, validateArchitectureGate, validatePostMutationArchitectureLight) + theme/description coherence validators, with no documented single precedence. | code-vs-architecture | low | open |
| DR-0030 | exercise-programming | `program-specialist.ts` is a separate specialist path on the legacy in-memory `applyMutation` engine; relationship to the architecture engine undocumented (ties to DR-0018). | code-vs-architecture | low | open |
| DR-0031 | exercise-programming | Build dispatches through a focus-mode engine layer (focus-engines/: strength/speed/mobility + router) not reflected in CLAUDE.md §7's Architect→Periodization→Coach description. | doc-vs-code | low | open |
| DR-0032 | adaptation-loop | Split apply model: readiness check-ins are user-confirmed (evaluate → apply-adjustment); session logging AUTO-applies next-session adjustments, block projections, and continuation-phase generation without confirmation. CLAUDE.md §7 does not distinguish. | doc-vs-code | medium | open |
| DR-0033 | adaptation-loop | Adaptation loop includes modules beyond §7's three named services: next-session-intelligence, block-projection, block-intelligence, proactive insights (source proactive_agent/auto_adjust). | doc-vs-code | low | open |
| DR-0034 | adaptation-loop | Auto-applied session-log adaptations write system_change_log but are not among createAdjustmentEvent callers — may not surface in the visible system_adjustment_events feed (fed by check-ins + edits). | code-vs-architecture | low | open |
| DR-0035 | identity-billing | Two coexisting anonymous/guest systems both live (backend mounted + frontend-invoked): anonymous-user-first (/auth/bootstrap, users.isAnonymous) and legacy guest-session (/guest/*, guest_sessions) which auth.ts claims bootstrap "replaces." | code-vs-architecture | medium | open |
| DR-0036 | identity-billing | Two billing/subscription route surfaces with overlapping checkout: billing.ts (/billing/create-checkout-session, lookup_key) and stripe.ts (/subscription/checkout + /subscription/*). | code-vs-architecture | low | open |
| DR-0037 | identity-billing | Live DB has tables outside the Drizzle schema — `user_sessions` (connect-pg-simple) + `stripe.*` (stripe-replit-sync); db-schema's 51-table count is the Drizzle subset (extends DR-0002). | doc-vs-code | low | open |
| DR-0038 | external-api | External API rate limiter is in-memory per-instance (60/60s); under autoscale the effective global limit is multiplied by instance count and windows are not shared. | code-vs-architecture | medium | open |
| DR-0039 | external-api | External API uses its own `{success,data,meta,error}` envelope + hand-written `/external/docs`; not part of the spec-first OpenAPI contract (no generated client/zod). Cross-ref DR-0007/DR-0008. | doc-vs-code | low | open |
| DR-0040 | frontend | Core product flow (SSE chat, mutation outcomes, build stages, action scope, uiContext) relies on hand-synchronized client↔server types, not the generated OpenAPI contract — drift risk. Cross-ref DR-0007/DR-0008. | code-vs-architecture | medium | open |
| DR-0041 | frontend | Largest page surface is AEO/marketing content (~45 pages/aeo/* + concepts/whitepapers), not reflected in CLAUDE.md §2/§10's product-UI framing. | doc-vs-code | low | open |

> Note: DR-0001 is pre-seeded from the architecture-discovery phase as a worked example of the
> register format. The `replit.md` correction is a governance/ops-doc fix, not a code change.
> DR-0002–DR-0006 were opened during the `db-schema` reconciliation (Version 2, Wave 1).

### Reconciliation ledger — v1.1 CLAUDE.md pass (2026-06-29)

The architecture-owner reconciliation pass updated `CLAUDE.md` to v1.1. The per-row `status` column
above reflects each entry's **pre-pass** state (`open`); the **authoritative post-pass status** is
here. (The status column is left as-authored to preserve the open-time record; this ledger governs.)

**Class A — `resolved`** (doc-vs-code drift; `CLAUDE.md` now matches the code, no code change needed):
`DR-0001, DR-0002, DR-0005, DR-0007, DR-0008, DR-0009, DR-0013, DR-0014, DR-0015, DR-0016, DR-0017,
DR-0019, DR-0021, DR-0022, DR-0023, DR-0024, DR-0026, DR-0027, DR-0028, DR-0029, DR-0030, DR-0031,
DR-0033, DR-0034, DR-0035, DR-0036, DR-0037, DR-0039, DR-0040, DR-0041` (**30**). (CLAUDE.md §2–§11
corrected; these are documented reality now.)

**Class B — `reconciling`** (documented in `CLAUDE.md §11` but **require an engineering decision/fix**;
remain effectively open until code action):
`DR-0003, DR-0004` (type-mismatched refs), `DR-0006` (no transactions), `DR-0010` (no spec↔generated↔
routes parity guard — needs CI tooling, V3), `DR-0011` 🔴 (unwired persona), `DR-0012` (unwired
intelligence), `DR-0018` (dual mutation engines / dual-systems pattern), `DR-0020`, `DR-0038`
(in-memory under autoscale), `DR-0025` 🔴 (merge data loss — probable bug), `DR-0032` (split
adaptation apply model) (**11**).

**Effect on maturity:** subsystems whose Class-B items are all ≤ medium AND whose docs are L3-verified
become L4 candidates once their docs get a code-level deep read (Version 3). `memory` and `ai-agents`
remain blocked from L4 by their open **high** Class-B items (`DR-0025`, `DR-0011`).

**Rules:**
- A document at `status: DISCREPANCY` **must** have at least one `open` register entry.
- A subsystem cannot reach maturity **L4** with an `open` `high`-severity entry.
- Resolving an entry that requires an architecture change means a deliberate edit to `CLAUDE.md`
  (with its own review), never a silent drift.

## 6. Continuous reconciliation

Reconciliation is a recurring cycle, not a one-time event:

1. **Staleness sweep** — flag docs whose `source_of_truth` advanced past `verified_commit`
   (see workflow §6). Mark them `STALE`.
2. **Re-verify** stale docs over the changed surface only.
3. **Re-reconcile** against `CLAUDE.md`; open/close register entries.
4. **Roll up** maturity and status into `documentation-map.md`.

Cadence: at minimum, once per Version milestone, and whenever a subsystem's source changes
materially. The goal is that `CLAUDE.md` and `docs/implementation/*` never silently diverge.

## 7. Roles

- **Author (generator):** produces the DRAFT from code (workflow Phase 1).
- **Verifier:** independent pass that confirms claims and records metadata (Phase 2). Must not be
  the same pass as authoring.
- **Reconciler:** compares against `CLAUDE.md`, maintains the Discrepancy Register (Phase 3).
- **Architecture owner:** the only role that edits `CLAUDE.md`; acts on `code-vs-architecture`
  discrepancies deliberately.

A single agent may play multiple roles across documents, but **not author and verify the same
document in the same pass** — independence is the point.

## 8. Hard prohibitions

- ❌ Editing application source code as part of a documentation task.
- ❌ Editing generated directories (`api-zod/generated`, `api-client-react/generated`).
- ❌ Marking a doc `VERIFIED` without `verified_commit` + `verification_method`.
- ❌ Letting an implementation doc mutate architecture, or letting architecture quietly track code.
- ❌ Closing a discrepancy without recording which tier changed and why.
