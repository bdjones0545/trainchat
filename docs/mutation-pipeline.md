---
title: Mutation Pipeline — Ontology, Edit Engine, Verification & Receipts
doc_type: implementation
subsystem: mutation-pipeline
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/api-server/src/lib/mutation-ontology.ts
  - artifacts/api-server/src/services/mutation-execution-service.ts
  - artifacts/api-server/src/lib/edit-intent-service.ts
  - artifacts/api-server/src/lib/edit-engine.ts
  - artifacts/api-server/src/lib/mutation-engine.ts
  - artifacts/api-server/src/lib/mutation-verifier.ts
  - artifacts/api-server/src/lib/post-mutation-validator.ts
  - artifacts/api-server/src/lib/mutation-outcome-finalizer.ts
  - artifacts/api-server/src/lib/mutation-audit-receipt-service.ts
  - artifacts/api-server/src/lib/change-log-service.ts
  - artifacts/api-server/src/lib/architect-patch-generator.ts
  - artifacts/api-server/src/routes/conversations.ts
  - artifacts/api-server/src/routes/training-system-edit.ts
  - artifacts/api-server/src/routes/training-system-history.ts
related_architecture:
  - "CLAUDE.md §4 AI Architecture (Mutation Ontology + receipt-first model + gates)"
  - "CLAUDE.md §1 principle #3 (receipt-first) and #6 (auditability)"
related_implementation:
  - "docs/ai-agents.md (orchestrator routing decides edit vs build; validateArchitectureGate)"
  - "docs/db-schema.md (mutation_audit_receipts, system_change_log, training_systems)"

last_generated: 2026-06-28
last_verified: 2026-06-28
verified_by: claude (Version 2, Wave 2 doc #4)
verified_commit: 78ee536
verification_method: >
  Read in full: mutation-ontology.ts, mutation-execution-service.ts, post-mutation-validator.ts,
  mutation-outcome-finalizer.ts (head+exports), mutation-verifier.ts (head+exports),
  mutation-audit-receipt-service.ts (head+exports), change-log-service (exports). Read headers of
  edit-engine.ts, edit-intent-service.ts, mutation-engine.ts. Mapped the live chat pipeline order
  by line number in conversations.ts. Independently verified wiring with grep: consumer census of
  every ontology export (resolveMutationCommand / MUTATION_ONTOLOGY / getMutationFamilies / 
  INTENT_FAMILY_TO_CANONICAL = 0 non-test consumers); writeAuditReceipt call sites (only 2 edit
  routes, NOT conversations.ts); createChangeLogEntry consumers (broad, incl. chat); applyMutation
  (legacy) and determineMutationScope consumers. NOT done: full read of edit-intent-service.ts
  (5078 lines) and edit-engine.ts (1752 lines) — the internal mechanics of how an edit plan is
  computed and applied are only partially verified; no runtime execution. Such claims are marked
  UNVERIFIED inline.

discrepancies:
  - { id: DR-0016, summary: "Mutation ontology's rich per-command metadata (aiDirective, antiPatterns, minimumStructuralChanges, defaultScope, aliases) is defined but unconsumed; resolveMutationCommand/MUTATION_ONTOLOGY/getMutationFamilies have 0 live callers", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0017, summary: "mutation_audit_receipts DB table is written ONLY by edit-panel/history routes, NOT the chat mutation path; the chat path writes system_change_log + in-response receipts instead", kind: doc-vs-code, severity: medium, status: open }
  - { id: DR-0018, summary: "Dual mutation engines: legacy in-memory mutation-engine.ts (applyMutation) coexists with the DB-backed edit-intent-service + edit-engine pipeline (the primary chat path)", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0019, summary: "Two distinct gates (validateStructuralChanges for edits vs validateArchitectureGate for builds); mutation-execution-service is a thin adapter, not the self-contained executor CLAUDE.md §4 implies", kind: doc-vs-code, severity: low, status: open }
---

# Mutation Pipeline — Ontology, Edit Engine, Verification & Receipts

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Implementation doc, generated from and reconciled against the mutation modules + the routes that
> drive them. **Code wins** on disagreement. **Target maturity was L4**; it lands at **L3** because
> the two largest execution files (`edit-intent-service.ts`, `edit-engine.ts`; ~6.8k lines) were not
> read in full and no runtime execution was performed (see §13). Runtime claims are **(UNVERIFIED)**.

## 1. Purpose & scope

How TrainChat turns a user's edit request into a verified change to a saved program, and what
feedback/audit artifacts result. Covers: the mutation **ontology** (classification), the **live chat
edit pipeline** (interpret → gate → apply → verify → finalize), the **verification + validation +
finalizer** trio, the **receipt/audit** layers, and the **legacy** in-memory engine. Implements the
mutation parts of `CLAUDE.md §4` and principles #3 (receipt-first) and #6 (auditability).

Out of scope here: program *building* (the Architect/Coach build path — see `ai-agents.md` and the
planned `exercise-programming.md`); the deep internals of edit-plan computation (deferred — §13).

## 2. Source map

| File | Wired? | Responsibility |
|---|---|---|
| `lib/mutation-ontology.ts` | ⚠️ partial | 45 canonical commands, 11 categories, alias map. Live use is **classification only** (name/category); rich metadata unused (§4, DR-0016). |
| `services/mutation-execution-service.ts` | ✅ | Thin typed adapter over `interpretEditRequest` + `applyEditPlan`. Explicitly *not* responsible for gates/changelog/receipts (DR-0019). |
| `lib/edit-intent-service.ts` (5078) | ✅ | `interpretEditRequest` → produces an `EditPlan` from NL; `validateOperationsOntology`. Core interpreter. *(internals partially read)* |
| `lib/edit-engine.ts` (1752) | ✅ | `applyEditPlan` → writes targeted changes to the `training_systems` tables; captures before/after snapshots; calls `verifyMutation`; family-propagates exercise changes across weeks. *(internals partially read)* |
| `lib/mutation-verifier.ts` | ✅ (in edit-engine) | `verifyMutation` — compares before/after snapshots → status `verified|partial|failed|noop|unclear`. Pure/synchronous. |
| `lib/post-mutation-validator.ts` | ✅ (conversations) | `validatePostMutationArchitectureLight` — non-blocking structural regression check (empty/thin sessions, identity/rep flattening). |
| `lib/mutation-outcome-finalizer.ts` | ✅ (conversations + streaming) | `finalizeMutationOutcome` — collapses a turn to exactly `mutation_applied` or `mutation_not_applied` with audit status for the Agent Turn Report. |
| `lib/architect-patch-generator.ts` | ✅ (conversations) | `hasStructuralChanges`, `isMinorAttributeEdit`, `validateStructuralChanges` (the **edit-path gate**), and `buildMutationSuccessReceipt`/`buildMutationFailureReceipt` (the in-response receipts). |
| `lib/change-log-service.ts` | ✅ (broad) | `createChangeLogEntry` → writes `system_change_log` with before/after snapshots; `classifyEdit`; powers restore. |
| `lib/mutation-audit-receipt-service.ts` | ⚠️ edit-routes only | `writeAuditReceipt` → `mutation_audit_receipts`. Called **only** from edit-panel/history routes (§6, DR-0017). |
| `lib/mutation-engine.ts` (975) | ⚠️ legacy | "Unified mutation engine" `applyMutation`/`determineMutationScope` — **no longer primary** for chat (DR-0018). |

## 3. The mutation ontology

`MUTATION_ONTOLOGY` defines **45 `CanonicalCommandName`s** across **11 `MutationCategory`s**
(difficulty/volume/time adjustment, strength/hypertrophy/endurance/athletic specialization,
mobility_recovery, structural_modification, constraint_application, state_adaptation). Each command
declares `category`, `defaultScope`, `aliases` (IntentFamily strings), `minimumStructuralChanges`
(≥1), `antiPatterns`, and `aiDirective`. An `INTENT_FAMILY_TO_CANONICAL` map aliases families to
canonical names. Helpers: `getMutationFamilies`, `isMutationFamilyOntology`, `getCanonicalName`,
`getMutationCategory`, `resolveMutationCommand`, `validateOperationsOntology`.

**What is actually consumed (grep-verified):** `isMutationFamilyOntology`, `getCanonicalName`,
`getMutationCategory` (by `execution-planner.ts`) and `validateOperationsOntology` (by
`edit-intent-service.ts`). **What is NOT consumed (0 non-test callers):** `resolveMutationCommand`,
`MUTATION_ONTOLOGY` (direct), `getMutationFamilies`, `INTENT_FAMILY_TO_CANONICAL`. Therefore the
per-command **`aiDirective`, `antiPatterns`, `minimumStructuralChanges`, `defaultScope`, `aliases`**
fields — the ontology's documented role of "driving validation, logging, and deterministic recipe
dispatch" — are **dead metadata at runtime**. The ontology functions as a name/category
classifier only. (DR-0016. The file's own header claim that `getMutationFamilies()` backs
`isMutationFamily()` in execution-planner is also stale — execution-planner uses the three helpers
above, not `getMutationFamilies`.)

## 4. The live chat mutation pipeline (conversations.ts)

The primary mutation path for chat turns, in order (line numbers from `conversations.ts`):

1. **Route decision** — `orchestrate(...)` (see `ai-agents.md §5`) classifies the turn; mutations
   are `APPLY_MUTATION`. Context may already be deixis-resolved (see planned `context-pipeline.md`).
2. **Interpret** — `interpretMutationRequest(...)` (adapter → `interpretEditRequest`) builds an
   `EditPlan` *(STEP2, ~2136 non-SSE / ~4625 SSE)*.
3. **Edit-path gate (structural only)** — if `route === BUILD_WITH_ARCHITECT` **or**
   `hasStructuralChanges(editPlan)`, run `validateStructuralChanges(editPlan, sessionLookup)`
   *(~2194)*. This is the **edit gate** from `architect-patch-generator.ts` — distinct from the
   build gate `validateArchitectureGate` (which runs inside `ai.ts`, per `ai-agents.md §5.4`). (DR-0019)
4. **Apply** — `applyEditPlan(editPlan, intentFamily)` writes targeted changes to the
   `training_systems` tables, captures before/after snapshots, **calls `verifyMutation` internally**,
   and family-propagates exercise changes across weeks *(~2249 / ~4655)*. **Never retried** (a retry
   after a partial DB write would double-apply — explicitly documented).
5. **Verify** — `verifyMutation` (inside edit-engine) yields `verified|partial|failed|noop|unclear`;
   a failed/no-op verification drives a `finalizeMutationOutcome(... mutation_not_applied ...)`
   *(~4672/4707)*.
6. **Light post-validate** — `validatePostMutationArchitectureLight(...)` flags empty/thin sessions,
   session-identity collapse, rep flattening — **non-blocking, never throws** *(~2397 / ~4772)*.
7. **Change log** — `createChangeLogEntry(...)` persists the edit + before/after snapshots to
   `system_change_log` *(multiple sites, e.g. 1373/1714/2026)*.
8. **Finalize + receipt** — `finalizeMutationOutcome(...)` produces the typed outcome for the
   SSE/JSON response *(~4910 success)*; `buildMutationSuccessReceipt`/`buildMutationFailureReceipt`
   produce the user-facing receipt.

This realizes the documented **ATTEMPT → APPLY → VERIFY → RESPOND** standard
(`mutation-verifier.ts` header). There are two parallel implementations: **non-SSE** (JSON) and
**SSE** (streaming), each with its own finalize/verify-fail branches.

## 5. Verification, validation & finalization (the trio)

- **`verifyMutation`** (mutation-verifier) — deterministic snapshot diff over the canonical tables
  (`session_exercises` → `training_systems`); returns expected/verified/missing change lists plus a
  `userSafeSummary`. Also provides `verifyRestoration` and `verifyConstraintCompliance`.
- **`validatePostMutationArchitectureLight`** (post-mutation-validator) — a *second*, lighter check
  for regressions; severity `warning`/`info` only; logs `[ArchLightValidation]`; returns
  `{ warnings, clean }`. Never blocks.
- **`finalizeMutationOutcome`** (outcome-finalizer) — enforces a **binary contract**: a
  `shouldMutate=true` turn ends as exactly `mutation_applied` (appliedCount>0 / changeLogId /
  changeTargets) **or** `mutation_not_applied` (audit `FAIL`, `failureReason` set). "No third state."
  Maps internal no-change reasons to user-facing messages.

## 6. Receipts & audit — three layers, unevenly wired (headline finding)

There are **three distinct "receipt/audit" mechanisms**, and they do **not** all cover the chat path:

| Mechanism | Where | Chat path? | Edit-panel/history? |
|---|---|---|---|
| **In-response receipt** — `MutationSuccessReceipt`/`MutationFailureReceipt` (`architect-patch-generator`) + `mutationOutcome` (`finalizeMutationOutcome`) | response body / SSE | ✅ yes | ✅ yes |
| **`system_change_log`** — `createChangeLogEntry`, before/after snapshots, powers restore | DB table | ✅ yes (broad) | ✅ yes |
| **`mutation_audit_receipts`** — `writeAuditReceipt`, v2 verification status + full snapshots | DB table | ❌ **no** | ✅ yes (only `training-system-edit.ts`, `training-system-history.ts`) |

So `CLAUDE.md`'s "receipt-first" guarantee (principle #3) **is** satisfied on the chat path via the
in-response receipts; and an immutable audit trail with snapshots **does** exist on the chat path —
but via **`system_change_log`, not `mutation_audit_receipts`**. The dedicated `mutation_audit_receipts`
table (documented in `db-schema.md §4.2` as "immutable audit log of *every* program adjustment") is
in practice written **only for the edit-panel and history routes**, not for chat-driven mutations.
(DR-0017; cross-ref `db-schema.md` mutation-audit-receipts entry.)

## 7. Dual mutation engines

`mutation-engine.ts` ("UNIFIED MUTATION ENGINE", `applyMutation`) operates on in-memory
`ProgramStructure` objects and is **explicitly no longer the primary path** for chat turns (its own
header says so). Live consumers: `applyMutation` ← `program-specialist.ts`; `determineMutationScope`
← `agent-orchestrator.ts` (the orchestrator does use the scope decision). The **primary** chat
mutation path is the DB-backed `interpretEditRequest` + `applyEditPlan` pipeline (§4). Two mutation
systems coexist — mirroring the dual program model in `db-schema.md §10`. (DR-0018.)

## 8. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0016 | Ontology rich metadata (aiDirective/antiPatterns/minimumStructuralChanges/defaultScope/aliases) unconsumed; resolveMutationCommand/MUTATION_ONTOLOGY/getMutationFamilies have 0 live callers. Ontology is a classifier only. | code-vs-architecture | medium |
| DR-0017 | `mutation_audit_receipts` is written only by edit-panel/history routes, not chat; chat audits via `system_change_log` + in-response receipts. db-schema §4.2 implies universal coverage. | doc-vs-code | medium |
| DR-0018 | Dual mutation engines: legacy in-memory `mutation-engine.ts` vs the DB-backed `edit-intent-service`+`edit-engine` primary path. | code-vs-architecture | medium |
| DR-0019 | Two gates (`validateStructuralChanges` edits / `validateArchitectureGate` builds); `mutation-execution-service` is a thin adapter, not the self-contained executor CLAUDE.md §4 implies. | doc-vs-code | low |

No `high`-severity items opened. (The audit-table gap, DR-0017, is `medium` because a real immutable
snapshot trail still exists on the chat path via `system_change_log` — the principle holds; the named
table's coverage does not.)

## 9. Cross-references to prior implementation docs

- **`ai-agents.md §5`:** the orchestrator's `APPLY_MUTATION` + `mutationType` decision selects this
  pipeline; `structural` → architect/edit-gate, `minor` → fast DIRECT_EDIT. `determineMutationScope`
  (from the legacy engine) is the live "Intent Scaling" step the orchestrator uses — unlike the
  behavioral/progression-intelligence modules, which `ai-agents.md §7` found unwired.
- **`db-schema.md`:** writes land in the canonical `training_systems` hierarchy; `system_change_log`
  (broadly wired) and `mutation_audit_receipts` (edit-routes only) are the audit tables; this doc
  resolves the open question in db-schema about *who writes which*. The "no DB transactions"
  observation (`db-schema.md` DR-0006) is reinforced: `applyEditPlan` is **explicitly never retried**
  precisely because a mid-write failure is not transactionally rolled back.
- **`contract-spine.md` (DR-0007):** the entire mutation surface (`training-system-mutate`/`-edit`,
  and chat mutations behind `sendMessage`) is uncontracted by OpenAPI.

## 10. Recommended CLAUDE.md updates

Proposals only (governance §2/§7), each source-supported:

1. **§4** — Clarify the ontology is a **classifier** (name/category/“is-mutation”); its
   per-command directives/anti-patterns are **not currently consumed**. (DR-0016.)
2. **§4 / cross-ref §3-data** — State that chat mutations audit via **`system_change_log`**;
   `mutation_audit_receipts` is currently an **edit-panel/history** artifact, not universal.
   (DR-0017.)
3. **§4** — Note the **two mutation engines** (legacy in-memory vs DB-backed edit pipeline) and that
   the DB pipeline is primary for chat. (DR-0018.)
4. **§4** — Distinguish the **two gates** (edit-path `validateStructuralChanges` vs build-path
   `validateArchitectureGate`) and describe `mutation-execution-service` as a thin adapter. (DR-0019.)
5. **§1 principle #3/#6** — Keep the receipt-first/auditability principles (they hold), but specify
   the **three concrete mechanisms** and their coverage so the guarantee is precise.

The receipt-first and ATTEMPT→APPLY→VERIFY→RESPOND designs are **well implemented**; the gaps are
ontology wiring, audit-table coverage, and documentation precision — not the core safety model.

## 11. Files reviewed

Full: `mutation-ontology.ts`, `mutation-execution-service.ts`, `post-mutation-validator.ts`.
Head+exports: `mutation-verifier.ts`, `mutation-outcome-finalizer.ts`, `mutation-audit-receipt-service.ts`,
`change-log-service.ts`, `mutation-engine.ts`, `edit-engine.ts`, `edit-intent-service.ts`,
`architect-patch-generator.ts` (via conversations import). Pipeline order mapped in
`routes/conversations.ts`; receipt wiring confirmed in `routes/training-system-edit.ts`,
`routes/training-system-history.ts`. Consumer-census greps across all `artifacts/api-server/src`.

## 12. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Ontology structure + unconsumed metadata (DR-0016) | **High** | Read full file; 0-consumer grep. |
| Live chat pipeline order (interpret→gate→apply→verify→finalize) | **High** | Line-mapped in conversations.ts. |
| Verifier/validator/finalizer contracts | **High** | Read directly. |
| Receipt/audit three-layer wiring (DR-0017) | **High** | writeAuditReceipt vs createChangeLogEntry consumer census. |
| Dual engines (DR-0018) | **High** | Consumer census + engine headers. |
| Internal mechanics of `interpretEditRequest` / `applyEditPlan` | **Medium** | Headers + wiring read; ~6.8k lines not read in full. |
| Family-propagation + snapshot capture details | **Medium** | From edit-engine header, not line-level. |
| **Runtime behavior** (does an edit actually verify/apply as described) | **UNVERIFIED** | No execution. |

Overall: **high confidence in the pipeline shape, wiring, and the audit/ontology findings**; the
open gap is the deep internals of the two largest files plus runtime verification — which is exactly
what caps this from its **L4** target to **L3**.

## 13. Verification record

- Verified at commit `78ee536`.
- Independent re-derivation: ontology live consumers = {isMutationFamilyOntology, getCanonicalName,
  getMutationCategory, validateOperationsOntology}; unconsumed = {resolveMutationCommand,
  MUTATION_ONTOLOGY, getMutationFamilies, INTENT_FAMILY_TO_CANONICAL}. `writeAuditReceipt` call
  sites = 2 (both edit/history routes, not chat). `createChangeLogEntry` consumers include
  conversations.ts (chat path). Legacy `applyMutation` consumer = program-specialist.ts only.
- Not run (documented gaps): full read of `edit-intent-service.ts` + `edit-engine.ts`; runtime
  execution of an edit; confirmation that `verifyMutation` output is always surfaced to the receipt.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
