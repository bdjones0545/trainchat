# Phase 2 — External API Surgical Edit Architecture

> **Document type:** Engineering Design Specification (audit → architecture)
> **Status:** Approved for design. **No code, schema, or behavior changes are described as done** — this
> is the plan of record for Phase 2. Implementation begins only at PR 2.1.
> **Scope:** Make `POST /api/external/program/edit` use the same deterministic surgical edit pipeline
> that powers first-party TrainChat, instead of regenerating the whole program with the LLM.
> **Related docs:** [`docs/external-api.md`](./external-api.md) (external surface, ownership, versioning),
> [`docs/mutation-pipeline.md`](./mutation-pipeline.md) (internal edit engine), [`docs/db-schema.md`](./db-schema.md)
> (tables), [`CLAUDE.md`](../CLAUDE.md) §7/§11 (architecture + Discrepancy Register).

---

## 1. Executive Summary

External program edits currently **regenerate the entire program** via `generateAIResponse` and
overwrite a jsonb blob (`external_programs.programData`). First-party chat edits instead run a
**deterministic surgical pipeline** — `interpretEditRequest → applyEditPlan → verification →
system_change_log → propagation` — that mutates only the targeted rows of a normalized
`training_systems` hierarchy and produces a real, replayable audit trail.

The two paths differ because of **representation**: external programs are a single denormalized jsonb
document, while the surgical engine operates on relational rows addressed by integer id. Closing the
gap therefore requires **materializing** an external program into a `training_systems` hierarchy so the
existing engine can act on it.

**Key finding: ~80% of the required machinery already exists.** Both round-trip adapters are present —
`createTrainingSystemFromProgram` / `upsertTrainingSystemFromProgram` (ProgramStructure → system) and
`getFullTrainingSystem` + `dbSystemToProgramStructure` (system → ProgramStructure) — as are
`interpretEditRequest`, `applyEditPlan`, verification, propagation, and `createChangeLogEntry`. The
genuinely new work is: a **service-owner user**, a **`external_programs.trainingSystemId` link column**,
a thin **orchestration/adapter layer**, and **transaction/concurrency hardening** (the engine currently
uses **no DB transaction** — see §9).

**Recommended architecture:** **persistent, lazily-materialized training systems** (Option B), with
`system_change_log` canonical for materialized programs, everything **feature-flagged with a blob-path
fallback** so existing external clients are never at risk.

---

## 2. Current External Edit Flow

Source: [`routes/external/programs.ts`](../artifacts/api-server/src/routes/external/programs.ts).

Execution order for `POST /api/external/program/edit`:

```
HTTP POST /api/external/program/edit
  │
  1. validateExternalApiKey(["edit_program"])
  │     Bearer tc_ → SHA-256 lookup → active/expiry/permission → rate limit
  │     → sets req.apiKey, req.apiKeyId
  │
  2. EditProgramBodySchema.safeParse(req.body)         → { programId, instruction, scope? }
  │     invalid → 400 VALIDATION_ERROR
  │
  3. findOwnedProgram(programId, req.apiKey)            ownership gate
  │     SELECT external_programs ⟕ external_api_keys by id
  │     allow iff owning key == caller key  OR  shared non-null orgId
  │     not owned/unknown → 404 NOT_FOUND (byte-identical, no existence leak)
  │
  4. buildSystemUserId(req.apiKey)                      → createdBy ?? EXTERNAL_API_SERVICE_USER_ID(-1)
  5. buildEditMessage({programId,instruction,scope}, currentProgram)   → synthetic NL string
  │
  6. generateAIResponse(editMessage, [], userId, {
  │       currentProgram, intentResult:{type:"EDIT_PROGRAM"}, hasActiveProgram:true })
  │     ⟹ LLM REGENERATES THE ENTIRE ProgramStructure
  │
  7. if (!aiResponse.structuredData) → 422 EDIT_FAILED   (program left unchanged; Phase 1D)
  8. stripInternalFields(structuredData)                → updatedProgram
  9. db.insert(external_program_versions)               snapshot-before-edit (type:"edit") → version
 10. db.update(external_programs).set({ programData })  WHOLE-BLOB OVERWRITE
 11. buildStandardResponse({ programId, updatedProgram, changes, coachSummary, version, changeReceipt })
```

**Characteristics:** coarse-grained, LLM-authored whole-document replacement. No exercise/session
targeting, no post-mutation verification, no propagation to future weeks, no relational change log. The
snapshot-before-edit + `external_program_versions` audit (Phase 1C) is the only history.

---

## 3. Target Surgical Edit Flow

Reference implementation: [`routes/training-system-edit.ts`](../artifacts/api-server/src/routes/training-system-edit.ts)
(`POST /training-system/edit`) — the closest first-party HTTP analog.

```
authenticated userId + active training system
  │
  1. getActiveTrainingSystem(userId, focusMode) / getFullTrainingSystem(systemId)
  │     → fullSystem  (training_systems → phases → weeks → sessions → session_exercises)
  │
  2. resolveTargetFromRequest(...)                     → targetContext {type,id,label}
  3. buildAdaptationContext(userId) + buildDecisionMemory(...) + listMemories(userId)
  │     → adaptationCtx, decisionMemoryContext
  │
  4. interpretEditRequest(effectiveMessage, fullSystem, targetContext,
  │                        adaptationCtx, decisionMemoryContext, …)
  │     ⟹ 1 OpenAI call → typed EditPlan { intent, scope, changes: EditChange[] }
  │        (each change targets a DB row by id)   [handleStructuredIntent may bypass the LLM]
  │
  5. validateStructuralChanges(...)                    architecture validation gate
  │     (runs BETWEEN interpret and apply — the documented seam)
  │
  6. applyEditPlan(editPlan, intentFamily, systemId)   DETERMINISTIC, no LLM
  │     captureBeforeSnapshot
  │     → mutate session_exercises / sessions / weeks / phases BY ID
  │     → mutation-verifier / post-mutation-validator
  │     → propagation to future weeks
  │     → EditResult { appliedCount, before/after snapshots, changeTargets,
  │                    verification, propagationSummary }
  │
  7. createChangeLogEntry({ userId, trainingSystemId, source, intent, scope,
  │                         beforeSnapshot, afterSnapshot, … })  → system_change_log
  8. recordMutationAuditReceipt(...) ; global-learning signal ; syncMemoriesFromData (fire-and-forget)
  9. Response built from EditResult (+ system re-read)
```

**Characteristics:** surgical (only targeted rows change), verified, propagated, and audited as a
replayable relational change log with entity-scoped restore.

---

## 4. Dependency Map

What the target flow needs, and where it lives today.

| Category | Items |
|---|---|
| **DB tables** | `training_systems`, `training_phases`, `training_weeks`, `training_sessions`, `session_exercises`, `system_change_log`, `propagation_events`; secondary: `mutation_audit_receipts`, `global_learning_events`/`learning_candidates`, `user_memories`, `users`, `conversations` (optional FK) |
| **Services / libs** | `edit-intent-service` (`interpretEditRequest`, `resolveTargetFromRequest`, `serializeSystemForPrompt`, `handleStructuredIntent`); `edit-engine` (`applyEditPlan`, propagation); `change-log-service` (`createChangeLogEntry`, `classifyEdit`); `training-system-service` (`getFullTrainingSystem`, `dbSystemToProgramStructure`, `createTrainingSystemFromProgram`, `upsertTrainingSystemFromProgram`); `adaptation` (`buildAdaptationContext`); `decision-memory-service`; `memory` (`listMemories`); `mutation-verifier` / `post-mutation-validator`; `architect-patch-generator` (receipts); `mutation-audit-receipt-service`; `globalLearningService` |
| **Adapters** | ProgramStructure → system (`createTrainingSystemFromProgram`; input is the `.days` shape == external `programData`); system → ProgramStructure (`dbSystemToProgramStructure`). **Both already exist.** |
| **Context** | `fullSystem` (loaded hierarchy), `targetContext`, `adaptationCtx`, `decisionMemoryContext` |
| **Memory** | `user_memories` + adaptation, keyed by `userId`. **Empty for a service user — which is the correct isolation for B2B.** |
| **AI calls** | `interpretEditRequest` = **1** OpenAI call; `applyEditPlan` = **0** (deterministic; `swap-backstop` may add one for open-ended swaps) |

**Schema reality that drives the design** (from [`db-schema.md`](./db-schema.md)):

- `training_systems.userId` is **NOT NULL FK → users** (cascade). A materialized system must be owned
  by a **real users row** — the `EXTERNAL_API_SERVICE_USER_ID = -1` sentinel cannot satisfy this FK.
- `training_systems.conversationId` is nullable — no conversation is required.
- `system_change_log` has **NOT NULL `userId` + `trainingSystemId`**, binding audit to a real user +
  system.
- The full hierarchy uses NOT-NULL parent FKs with cascade delete.

---

## 5. Gap Analysis

Each difference between the current external API and the internal engine, classified.

| Capability | Classification | Note |
|---|---|---|
| `interpretEditRequest`, `applyEditPlan`, verification, propagation | **Already available** | Pure libs, no user coupling |
| ProgramStructure ↔ training_system adapters | **Already available** | `createTrainingSystemFromProgram` + `dbSystemToProgramStructure` + `getFullTrainingSystem` |
| `adaptationCtx` / memory for external | **Already available** | Empty for the service user (desired isolation) |
| `targetContext` for an external edit | **Adapter required** | External API has only `instruction`+`scope`; wire `resolveTargetFromRequest`, or pass `null` (system-scope) and let the model localize |
| Map `EditResult` → external `{success,data,meta,error}` envelope | **Adapter required** | New response-mapping helper |
| Re-sync mutated system → `external_programs.programData` | **Adapter required** | `dbSystemToProgramStructure` + `db.update` |
| `external_programs.trainingSystemId` link | **Schema required** | Nullable FK (additive) |
| Real owning user for materialized systems (`training_systems.userId` NOT NULL) | **Schema + infrastructure required** | Sentinel `-1` cannot satisfy the FK — need a real service/org user row |
| Atomicity across materialize + edit + re-sync | **Infrastructure required** | `applyEditPlan` has **no `db.transaction`** (DR-0006) — needs a transaction wrapper + concurrency control |
| Pure in-memory / no-DB surgical edit | **Impossible (as-is)** | `applyEditPlan` mutates rows by DB id — cannot act on a jsonb blob without rewriting the engine |

**Verdict:** the net-new work is a **service user + link column**, a thin **orchestration/adapter layer**,
and **transaction/concurrency hardening**. No engine rewrite.

---

## 6. Materialization Architecture

### Options considered

```
A) Temporary training_system     create rows per edit, delete after
B) Persistent training_system    materialize once (lazy on first edit), reuse, keep programData projection
C) Ephemeral in-memory session   edit a blob in memory, no DB rows
```

- **A — Temporary.** Every edit pays create + teardown. `system_change_log`/history die with the temp
  system, so audit and rollback are lost. Large orphan / cleanup / race surface. ❌
- **C — Ephemeral in-memory.** **Impossible without rewriting `applyEditPlan`**, which is fundamentally
  DB-id-bound. Would duplicate the engine — exactly what Phase 2 exists to avoid. ❌
- **B — Persistent, lazy.** Materialize once on first edit; reuse thereafter. ✅ **Selected.**

### Why persistent lazy materialization (B) was selected

1. **The engine requires durable relational rows.** `applyEditPlan` reads and writes
   `session_exercises`/`sessions`/`weeks`/`phases` by id. Only a persisted hierarchy satisfies this;
   in-memory (C) cannot without an engine rewrite.
2. **Audit & rollback survive.** A persistent system gives a real `system_change_log` with
   entity-scoped `restoreFromChange`. A temporary system (A) throws that history away on teardown.
3. **Fewer failure modes.** A avoids no cleanup: it multiplies orphan/race/cleanup risk on *every*
   edit. B creates rows once and reuses them, shrinking the write surface to a single materialization.
4. **Lazy keeps it cheap.** Programs that are generated but never edited are **never materialized** — no
   wasted rows for read-only or one-shot API consumers.
5. **Read contract preserved.** After materialization, `training_systems` is the source of truth and
   `programData` becomes a **derived projection** (`dbSystemToProgramStructure`) refreshed after each
   mutation, so `GET /program/:id` stays byte-compatible and fast.

### Chosen design

```
generate (unchanged)                first surgical edit (flagged)              subsequent edits
─────────────────────               ────────────────────────────              ────────────────
external_programs                    if trainingSystemId is null:              use existing
  { programData(blob),                 createTrainingSystemFromProgram(          trainingSystemId
    trainingSystemId: null }             serviceUserId, programData, focus)     → interpret/apply
                                       set external_programs.trainingSystemId   → re-derive programData
                                       write baseline system_change_log
                                     (blob stays the projection)
```

- **Owner:** a dedicated, non-interactive **external-service user** (or per-org service user) — never a
  real customer, no login, no billing.
- **Access is always ownership-scoped** through `findOwnedProgram` (external_programs) → `trainingSystemId`.
  **Never** query `training_systems` by `userId` for external requests (see §9, ownership risk).

---

## 7. Rollback Strategy

- **Today:** `external_program_versions` (whole-blob snapshots) + `POST /program/:id/revert` (Phase 1C).
- **After materialization:** `system_change_log` + `restoreFromChange` — relational, entity-scoped, and
  itself reversible — is the richer mechanism.

### Coexistence with a canonical-per-program rule

| Program state | Canonical history | Revert mechanism |
|---|---|---|
| Materialized (`trainingSystemId` set) | **`system_change_log`** | `restoreFromChange` → re-derive `programData` |
| Non-materialized (legacy/blob) | `external_program_versions` | existing blob revert (unchanged) |

### Why `system_change_log` becomes canonical for materialized programs

- It records **entity-scoped before/after snapshots** tied to the real relational rows the surgical
  engine mutates, so a revert restores exactly the affected entities — not a coarse whole-document swap.
- It is the **same audit substrate as first-party edits**, so external and internal programs share one
  replayable, verifiable history (no second, divergent audit model to maintain).
- Blob snapshots (`external_program_versions`) cannot represent a partial/targeted revert; keeping them
  canonical for materialized programs would re-introduce whole-document rollback.

**`external_program_versions` is NOT dropped** — it backs legacy/never-materialized programs and
preserves backwards compatibility. `/history` and `/revert` **dispatch on `trainingSystemId` presence**.
As all programs materialize over time, `system_change_log` becomes de-facto canonical and the blob-version
table is frozen (read-only for old rows).

---

## 8. API Compatibility Strategy

**Goal: 100% backwards compatibility. Existing external clients must keep working unchanged.**

- **No removals or renames.** The edit success response keeps `programId`, `updatedProgram`, `changes`,
  `coachSummary`, `version`, `changeReceipt`. `updatedProgram` remains a `ProgramStructure` (produced by
  `dbSystemToProgramStructure`) — identical shape to today.
- **Additive fields only** (opt-in for consumers): `surgical: true`, `appliedCount` / `skippedCount`,
  `verification`, `propagationSummary`, `changeTargets`.
- **`GET /program/:id` unchanged** — the `programData` projection is kept in sync after every mutation.
- **Migration strategy:** a **per-key/env feature flag**, default **off**; **lazy** materialization; and a
  **blob-path fallback** — if the flag is off, or materialization/surgical edit fails for any reason, the
  route falls back to the current `generateAIResponse` behavior. A partner never sees a regression.
- Storage (`external_programs`), the `{success,data,meta,error}` envelope, and the `/history` + `/revert`
  contracts are all preserved. See [`docs/external-api.md`](./external-api.md) for the current contract.

---

## 9. Risk Assessment

| Risk | Severity | Detail | Mitigation |
|---|---|---|---|
| **Transaction risk** | **High** | `applyEditPlan` uses **no `db.transaction`** (DR-0006, verified). Materialize (many inserts) + edit (many updates) + `programData` re-sync + `external_programs` update span multiple statements; a mid-failure leaves a partial system or blob/system drift. | Wrap materialization (+ link write) in `db.transaction`; treat `training_systems` as source of truth; re-derive `programData` only after commit. |
| **Retry risk** | High | `applyEditPlan` is explicitly **non-retryable** ("writes to DB then throws"). Clients may retry `POST /edit` → double-apply. | Idempotency key per request; never auto-retry; return a clear error. |
| **Orphan systems** | Medium | Materialization commits but the link write fails → dangling system; or an external program is deleted without cascading its system. | Write the link inside the same transaction; cascade delete from `external_programs`; periodic orphan sweep. |
| **Race conditions** | Medium | Concurrent edits to the same program → interleaved `applyEditPlan` on shared rows. | Per-`trainingSystemId` advisory lock, or serialize edits per `programId`. |
| **Cleanup** | Medium | Avoided-by-design (B, not A). Deleting an external program must cascade its `training_systems` + `system_change_log`. | FK cascade; sweep job. |
| **Version drift** | Medium | `programData` projection diverges from `training_systems`. | Single post-commit re-derive; round-trip equality assertion in tests; system is canonical. |
| **Ownership risk** | High | A shared service user owns many tenants' systems → cross-tenant exposure if anything queries by `training_systems.userId`. | **Never** query `training_systems` by `userId` for external; always resolve via ownership-scoped `findOwnedProgram` → `trainingSystemId`; keep the service user non-interactive. |

---

## 10. Recommended PR Breakdown

Smallest reviewable increments. Every behavior-changing PR is **flag-gated with a blob-path fallback**.

### PR 2.1 — Schema + service user (additive, dormant)
- **Scope:** nullable `external_programs.trainingSystemId` FK (→ `training_systems`, `on delete set null`);
  provision a dedicated external-service user (idempotent seed).
- **Files:** `lib/db/src/schema/external-api.ts`; additive manual migration under `lib/db/manual-migrations/`;
  seed script in `scripts/`.
- **Tests:** migration applies additively; FK/nullable; seed idempotent.
- **Rollout risk:** very low (column unused). **Rollback:** column is inert.

### PR 2.2 — Round-trip adapter (no route wiring)
- **Scope:** thin `external-system-materializer` service wrapping `createTrainingSystemFromProgram` /
  `getFullTrainingSystem` / `dbSystemToProgramStructure` for the external `programData` shape.
- **Files:** new `lib/external-system-materializer.ts`; unit tests.
- **Tests:** `ProgramStructure → system → ProgramStructure` round-trip equality; edge shapes (empty days,
  mobility/speed focus).
- **Rollout risk:** low (pure, uncalled). **Rollback:** delete file.

### PR 2.3 — Lazy materialization behind flag (still LLM edit path)
- **Scope:** on a flagged edit with no `trainingSystemId`, materialize + set link + write a baseline
  `system_change_log`; keep the existing regenerate path for the actual edit; assert projection == blob.
- **Files:** `routes/external/programs.ts`; materializer; flag util.
- **Tests:** materializes once; link set; projection equals prior blob; flag-off == unchanged.
- **Rollout risk:** medium (new rows). **Rollback:** flag off; ignore link.

### PR 2.4 — Surgical edit path behind flag
- **Scope:** when `trainingSystemId` present && flag: `interpretEditRequest → validateStructuralChanges →
  applyEditPlan → createChangeLogEntry → dbSystemToProgramStructure → sync programData`; additive response
  fields; **fall back to blob path on any error**.
- **Files:** `routes/external/programs.ts`; response-mapping adapter.
- **Tests:** single-exercise instruction mutates only the target (snapshot diff); `system_change_log`
  written; projection synced; ownership-scoped; fallback on failure; response backwards-compat golden test.
- **Rollout risk:** medium-high. **Rollback:** flag off → blob path.

### PR 2.5 — History/revert unification
- **Scope:** `/program/:id/history` + `/revert` dispatch on `trainingSystemId`
  (→ `system_change_log` / `restoreFromChange`) else `external_program_versions`; additive only.
- **Files:** `routes/external/programs.ts`; restore-service usage.
- **Tests:** materialized revert restores via change_log; legacy revert unchanged; cross-tenant 404.
- **Rollout risk:** medium. **Rollback:** flag off.

### PR 2.6 — Transaction + concurrency + cleanup hardening
- **Scope:** wrap materialize (+link) in `db.transaction`; per-system lock/serialization; cascade delete
  external_program → system + change_log; orphan sweep.
- **Files:** materializer; edit route; cleanup script.
- **Tests:** partial-failure rollback; concurrent-edit serialization; delete cascades; orphan sweep.
- **Rollout risk:** medium. **Rollback:** revert PR (behavior still flag-gated).

### PR 2.7 — Rollout
- **Scope:** enable flag for pilot key(s) → monitor drift/latency/errors → default on; retain blob
  fallback for legacy/never-materialized.
- **Tests:** pilot smoke; monitoring assertions.
- **Rollout risk:** controlled. **Rollback:** flip flag globally off.

---

## 11. Rollout Strategy

**Feature flag** (per-key and/or env, default **off**):

```
flag OFF (default)                     flag ON, not materialized            flag ON, materialized
──────────────────                     ─────────────────────────            ─────────────────────
current blob path                      lazy-materialize on first edit       surgical pipeline
(generateAIResponse                    → then blob or surgical per phase     (interpret → apply →
 → overwrite programData               (PR 2.3 vs 2.4)                        change_log → re-derive)
 → external_program_versions)
```

- **Progressive enablement:** off → pilot key(s) → monitor (drift, latency, error rate, fallback count)
  → default on. Legacy/never-materialized programs keep the blob path indefinitely.
- **Blob-path fallback is always present:** any failure in materialization or the surgical path degrades
  to today's behavior, so the flag can be enabled with low blast radius.

**Rollback (instant):** flip the flag **off** globally — every key immediately reverts to the current
blob edit behavior. Materialized rows and links are inert when the flag is off (reads still use the
`programData` projection). No data migration or code revert is needed to roll back behavior.

---

## 12. Deferred Decisions

Decisions intentionally **not** finalized in this spec; to be resolved during implementation:

1. **Service-user granularity:** one global external-service user vs. one per `orgId`. Per-org improves
   attribution and blast-radius isolation but adds provisioning; global is simpler. (Leaning per-org.)
2. **Materialization trigger:** lazy on first edit (recommended) vs. eager at generate time (writes a
   baseline `generate_snapshot`-equivalent system up front). Lazy avoids waste; eager simplifies history.
3. **Target resolution:** wire `resolveTargetFromRequest` for external edits vs. always pass
   `targetContext = null` (system-scope) and rely on the model to localize. Affects surgical precision.
4. **Concurrency primitive:** Postgres advisory lock per `trainingSystemId` vs. app-level per-program
   serialization queue.
5. **Idempotency:** whether to require an `Idempotency-Key` header for `POST /edit` (retry safety) or
   document non-retryability only.
6. **Attribution cleanup:** whether Phase 2 also removes the `buildSystemUserId(...) ?? -1` sentinel in
   favor of the real service user (ties into DR-0044).
7. **Deletion semantics:** confirm cascade path `external_programs` → `training_systems` →
   `system_change_log`, and whether deleting an external program should hard-delete or soft-retire its
   system.

---

## 13. Acceptance Criteria

Phase 2 is complete when all of the following hold:

1. A flagged `POST /api/external/program/edit` on an owned program routes through
   `interpretEditRequest → applyEditPlan → verification → system_change_log → propagation`, mutating
   **only the targeted entities** (provable via before/after snapshot diff).
2. **No regression for existing clients:** with the flag off (or on failure), behavior and response are
   byte-compatible with today; existing response fields are unchanged; only additive fields appear.
3. `external_programs.programData` remains a faithful projection of the materialized system after every
   edit (round-trip equality holds).
4. Ownership is enforced for every path via `findOwnedProgram`; cross-tenant and cross-program access
   return `404 NOT_FOUND` with no existence leak. `training_systems` is **never** queried by `userId` for
   external requests.
5. `/history` and `/revert` return correct results for both materialized (`system_change_log`) and
   legacy (`external_program_versions`) programs, dispatched by `trainingSystemId`.
6. Materialization (+ link) is atomic (`db.transaction`); partial failures leave no orphan system and no
   drift; concurrent edits to one program are serialized; a cleanup path removes orphans.
7. The feature flag toggles behavior instantly with no data migration, and rollback is a single flag flip.
8. `pnpm typecheck`, both test suites, and both builds pass in CI for every PR (2.1–2.7).

---

*End of Phase 2 design specification. Implementation begins at PR 2.1 — not before. Code is ground
truth; this document is the intended architecture and must be reconciled if the two diverge (see
[`CLAUDE.md`](../CLAUDE.md) §9 Documentation Governance).*
