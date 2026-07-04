---
title: External API — Key Auth, Rate Limiting, Isolated Namespace & Engine Reuse
doc_type: implementation
subsystem: external-api
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/api-server/src/routes/external/index.ts
  - artifacts/api-server/src/routes/external/api-keys.ts
  - artifacts/api-server/src/routes/external/programs.ts
  - artifacts/api-server/src/routes/external/exercises.ts
  - artifacts/api-server/src/middlewares/external-api-auth.ts
  - artifacts/api-server/src/lib/external-api-rate-limiter.ts
  - artifacts/api-server/src/routes/index.ts
related_architecture:
  - "CLAUDE.md §2/§3 (External API: isolated namespace, API-key auth, rate limiter, decoupled storage)"
related_implementation:
  - "docs/contract-spine.md (external API is uncontracted-by-OpenAPI; its own envelope, DR-0007/0008)"
  - "docs/ai-agents.md (external API reuses generateAIResponse — the Coach engine)"
  - "docs/mutation-pipeline.md (external edits regenerate via the Coach, not the structured edit pipeline)"
  - "docs/db-schema.md (external_api_keys/logs/programs; external_programs decoupled from training_systems)"
  - "docs/context-pipeline.md (in-memory rate limiter shares the autoscale-fragility pattern, DR-0020)"

last_generated: 2026-06-29
last_verified: 2026-06-29
verified_by: claude (Version 2, Wave 4 doc #11)
verified_commit: 78ee536
verification_method: >
  Read external-api-auth.ts (validation/permission/rate-limit/logging flow) and external-api-rate-limiter.ts
  in full; read api-keys.ts key-generation flow + the external/index.ts docs/envelope; grep-read
  programs.ts (engine reuse + storage). Verified wiring: external router mounted at /api/external
  (routes/index.ts); external_api_logs write site (auth middleware); generateAIResponse + externalProgramsTable
  usage in programs.ts. NOT done: full read of the 801-line programs route handlers; no runtime / no live
  external call. Such claims are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0038, summary: "External API rate limiter is an in-memory per-instance sliding window (60/60s); under the autoscale deployment the effective global limit is multiplied by instance count and windows are not shared", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0039, summary: "External API uses its own {success,data,meta,error} envelope and is documented via a hand-written /external/docs — it is not part of the spec-first OpenAPI contract, so the generated client/zod do not cover it (cross-ref DR-0007/DR-0008)", kind: doc-vs-code, severity: low, status: open }
---

# External API — Key Auth, Rate Limiting, Isolated Namespace & Engine Reuse

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Reconciled against the external namespace + its auth/rate-limit middleware. **Code wins** on
> disagreement. The 801-line programs route was grep-read (not full); no runtime. Runtime claims are
> **(UNVERIFIED)**. This is a **clean, well-isolated** subsystem — faithful to CLAUDE.md §2/§3.

## 1. Purpose & scope

How external systems (e.g. TrainEfficiency) call TrainChat's programming intelligence over a secure
REST API, isolated from the first-party session-based API. Covers the API-key auth model, per-key
permissions, rate limiting, request logging, the response envelope, and how the external routes
**reuse the internal Coach engine** with **decoupled** storage. Implements `CLAUDE.md §2/§3`.

## 2. Source map

| File | Responsibility |
|---|---|
| `routes/external/index.ts` (253) | Mounts the sub-routers; public `GET /api/external/docs` (human-readable reference); declares the `{success,data,meta,error}` envelope + rate-limit headers. |
| `middlewares/external-api-auth.ts` (183) | `validateExternalApiKey(perms)` — Bearer `tc_` → SHA-256 hash lookup → active/expiry/permission/rate-limit checks → request logging. `hashApiKey`. |
| `lib/external-api-rate-limiter.ts` (79) | `checkRateLimit` — **in-memory** sliding window (60 req / 60 s per key), self-pruning. |
| `routes/external/api-keys.ts` (269) | Key lifecycle: create (requireAuth), list, revoke; per-key usage from `external_api_logs`. |
| `routes/external/programs.ts` | `generate_program` / `edit_program` / `generate_session` / `exercise_swap` / `explain` / retrieve / **history** / **revert** — reuses `generateAIResponse`; stores to `external_programs`; version history in `external_program_versions`. |
| `routes/external/exercises.ts` (146) | `list_exercises` — exercise library browse. |

## 3. Isolation model (the namespace boundary)

Mounted at **`/api/external`** (routes/index.ts). Everything under it requires an API key — fully
separate from the first-party session/cookie auth (`identity-billing.md`). It has its **own** of
everything: auth, permission set, rate limiter, response envelope, audit log, program storage, and a
**hand-written docs endpoint** (`/api/external/docs`) in lieu of OpenAPI (DR-0039). This is the
cleanest isolation in the codebase.

## 4. API-key authentication

`validateExternalApiKey(requiredPermissions)`:
1. Require `Authorization: Bearer tc_…` (≥10 chars, `tc_` prefix) → else `401 MISSING_API_KEY` /
   `INVALID_API_KEY_FORMAT`.
2. `hashApiKey` (SHA-256) → look up `external_api_keys.keyHash`. **Raw keys are never stored**; only
   the hash + an 8-char display `prefix`.
3. Reject inactive (`KEY_REVOKED`), expired (`KEY_EXPIRED`), missing (`INVALID_API_KEY`).
4. **Permission check:** the key's `permissions[]` must include all `requiredPermissions` else
   `403 INSUFFICIENT_PERMISSIONS`. The 8 permissions: `generate_program`, `edit_program`,
   `generate_session`, `exercise_swap`, `explain_program`, `retrieve_program`, `list_exercises`,
   `manage_keys`.
5. **Rate limit** (§5), then attach `req.apiKey` and proceed; **log** the request to
   `external_api_logs` (endpoint/method/status/latency) — non-blocking, in the middleware.

**Key creation** (`POST /external/keys`, `requireAuth` — a logged-in TrainChat user, *not* an API
key): generates `tc_ + randomBytes(32).hex`, stores SHA-256 hash + prefix, and returns the raw key
**once** (never retrievable again). Matches the schema's security note (`db-schema.md`).

## 5. Rate limiting (in-memory — autoscale caveat)

`checkRateLimit(keyId)` is an **in-memory** sliding window: a module-level `Map<keyId, timestamps[]>`,
**60 requests / 60 s** per key, pruned every 30 s via `setInterval`. Sets `X-RateLimit-Limit/Remaining/Reset`.

⚠️ Because the store is **process-local**, under the `autoscale` deployment (`identity-billing.md`,
`.replit`) the effective global limit becomes **N × 60** across N instances and windows are not
shared — weakening abuse protection. Same pattern as the in-memory context resolver
(`context-pipeline.md` DR-0020). (DR-0038.) Sessions, by contrast, are DB-backed and durable.

## 6. Engine reuse & decoupled storage

The external programs route is a **thin wrapper over the internal Coach engine**, not a separate
engine: `generate_program`/`generate_session`/`edit_program` build **synthetic contexts** from the
API request and call the same **`generateAIResponse`** (`ai-agents.md`), then persist the result to
**`external_programs`** (a jsonb blob, decoupled from the `training_systems` hierarchy —
`db-schema.md`). `exercise_swap` uses `getSwapCandidates`/`resolveSafeSwapBackstop`.

Notable: external **edits regenerate** via `generateAIResponse` (storing a new blob), rather than
running the structured `interpretEditRequest`/`applyEditPlan` pipeline used by first-party chat
(`mutation-pipeline.md`). So external programs are coarse-grained jsonb documents, edited by
regeneration — consistent with `external_programs` being a blob store, but a different mutation model
than the internal canonical hierarchy.

**Edits fail loudly (no false-positive edits).** When `generateAIResponse` returns no
`structuredData`, `/program/edit` returns **`422 EDIT_FAILED`** and leaves `programData` **unchanged**.
It does *not* fall back to persisting the original program and reporting success (which previously
made a failed edit look applied). The success path is unchanged: a valid `structuredData` persists the
updated blob and returns `{ programId, updatedProgram, changes, coachSummary }`.

### Version history & rollback (Phase 1C)

External programs now carry an **append-only audit trail** in `external_program_versions`
(`db-schema.md`), giving change-tracking + rollback without yet changing the edit mechanism.

- **Baseline snapshot at creation.** `/program/generate` (and the streaming variant) write one
  `type: "generate_snapshot"` row for the freshly-created program, so `/history` and `/revert` are
  coherent from the start ("v0 = as generated"). This write is **best-effort** — a failure is logged
  and never fails an otherwise-successful generation.
- **Snapshot-before-edit.** `/program/edit` writes one version row capturing the program state
  **before** the overwrite (after fail-loud passes — a `422` edit writes no version), attributed to
  the caller's `apiKeyId`, with `type: "edit"`, the `instruction`/`scope`, and the `changeSummary`.
- **Additive response fields.** The edit success response gains **`version`** (the new version id)
  and **`changeReceipt`** (`{ versionId, type, instruction, scope, changes, snapshotAt }`) alongside
  the unchanged `updatedProgram` / `changes` / `coachSummary`. No existing field was renamed or
  removed.
- **`GET /program/:id/history`** (`retrieve_program`) — returns version metadata newest-first for an
  **owned** program; full snapshots are omitted from the list. Ownership-scoped via
  `findOwnedProgram`; unknown/cross-tenant → `404 NOT_FOUND` (versions never queried, no leak).
- **`POST /program/:id/revert`** (`edit_program`, body `{ versionId }`) — restores `programData` to
  the selected snapshot. The target version must belong to **this** owned program (a version id from
  another program → `404`, no write). A new `type: "revert"` version row is written **before** the
  restore, so a rollback is itself reversible. Returns `updatedProgram`, `revertedFromVersionId`,
  and the additive `version` / `changeReceipt`.

**Rollback limitations.** Versions are **whole-program jsonb snapshots**, not per-field diffs — a
revert replaces the entire program blob (coarse-grained), consistent with the blob store. There is
**no cross-instance transaction** wrapping the snapshot-write + overwrite (DR-0006 pattern); the
append-only snapshot is the integrity mechanism. **External edits remain non-surgical** (LLM
regeneration, not `interpretEditRequest`/`applyEditPlan`) until Phase 2 materialization.

**Ownership scoping (object-level auth).** Every read/edit/explain lookup of `external_programs`
goes through `findOwnedProgram(programId, req.apiKey)`, which resolves the row **and** its owning
key's `orgId` in one join. Access is granted only when the program's owning key is the caller's key,
or when both share a non-null `orgId`. On non-ownership the helper returns `undefined`, and the route
emits the standard `404 NOT_FOUND` — identical to a genuinely-missing program, so cross-tenant
existence never leaks. (Was DR-0042; resolved 2026-07-03.)

**Creation & attribution (Phase 1B/1E).** Every created program stores the caller's `apiKeyId`
(guaranteed by the auth middleware, which sets `req.apiKeyId` before any handler runs). The `userId`
passed into `generateAIResponse` is the key's `createdBy` when present; when the creator was deleted
(`created_by` is `on delete set null`) it falls back to a **non-personal service user**
(`EXTERNAL_API_SERVICE_USER_ID = -1`), logged, not the previous silent `?? 1`. Because the pipeline
only *reads* user context by this id (never writes), the sentinel loads an empty profile — external
generations are driven purely by the request payload and can never be contaminated by an internal
user's stored data. (Was DR-0044; resolved 2026-07-03.)

**Surgical edit (Phase 2.4, flag-gated — NOT the default path).** When
`EXTERNAL_SURGICAL_EDIT_ENABLED=true`, `/program/edit` runs the internal deterministic edit pipeline
instead of LLM regeneration. After ownership, it forces materialization (via the 2.3 bridge); if a
`trainingSystemId` exists it runs `interpretEditRequest → applyEditPlan`, reloads the system, and
reserializes it back to the program blob via the Phase 2.2 adapter, persisting the result with the
**existing 1C audit pattern** (version snapshot → `programData` overwrite → **unchanged response
shape**). **Fallbacks are explicit:** if the flag is off, or no training system materializes, or *any*
surgical step fails, the request falls through to the current LLM regeneration path — existing clients
are never broken. Non-goals for 2.4: the regeneration path is not removed, defaults are unchanged, and
rollback/history unification (`system_change_log`) and transaction/concurrency hardening are deferred
to later PRs (design doc §10, PR 2.5/2.6). Surgical edits still record blob snapshots in
`external_program_versions`, same as regeneration.

**History & revert unification (Phase 2.5).** `/program/:id/history` and `/program/:id/revert` now
**dispatch on `trainingSystemId`** (after the ownership check, which is unchanged):

- **Blob-backed (`trainingSystemId == null`)** — unchanged Phase 1C behavior: history reads
  `external_program_versions`; revert writes a `revert` snapshot and restores the blob.
- **Materialized (`trainingSystemId != null`)** — history reads the relational **`system_change_log`**
  (mapped into the same `versions[]` shape); revert restores through **`restoreFromChange`**, reloads
  the full system, reserializes it to the program blob, and persists the blob so future API reads stay
  compatible. Materialized revert does **not** write an `external_program_versions` row — the
  `system_change_log` restore entry is the audit.

`external_program_versions` is **not** removed, non-materialized behavior is unchanged, and the
**response shape is unchanged** (same `versions[]` / `updatedProgram`/`version`/`changeReceipt` keys).
Ownership is enforced before any dispatch. A small dispatcher
(`lib/external-materialization/history-revert.ts`, dependency-injected) decides the backing; the route
only checks ownership and calls it.

**Phase 2.6 caveat (not yet addressed):** the relational restore + reserialize + blob overwrite are
separate statements with no wrapping transaction. On a failure **after** the relational restore, the
blob is left **unchanged** (never overwritten with a partial/garbage value — no silent corruption), but
it can transiently lag the restored system until the next successful operation. Atomicity/concurrency
hardening is Phase 2.6.

**Lazy materialization (Phase 2.3, flag-gated — dormant by default).** When
`EXTERNAL_MATERIALIZATION_ENABLED=true`, `/program/edit` performs a **best-effort side effect** after
the ownership check: if the program has no `trainingSystemId` yet, it materializes the blob into a
relational `training_systems` hierarchy (owned by a dedicated per-program anonymous service user) and
links `external_programs.trainingSystemId`. This does **not** change the edit — the LLM regeneration
path still runs regardless, the response shape is unchanged, and a materialization failure is logged
and swallowed (the edit still succeeds). With the flag off (default) the edit path is byte-identical
to before. Surgical editing over the materialized system arrives in a later PR (design doc §10, PR 2.4).

## 7. Response envelope

All external responses use a consistent **`{ success, data, meta, error }`** shape (helper in
programs.ts; declared in `/external/docs`). This is a **third** response convention in the codebase —
distinct from the internal ad-hoc `{ error }` shapes and the OpenAPI `SuccessResponse`/`ErrorResponse`
(`contract-spine.md` DR-0008). It is a *strength* (consistent external contract) but means external
consumers cannot use the generated OpenAPI client — the external API's contract is the hand-written
`/external/docs` page. (DR-0039.)

## 8. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`. Both are nuances on an otherwise faithful subsystem.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0038 | In-memory per-instance rate limiter (60/60s) → effective global limit × instance count under autoscale; windows not shared. | code-vs-architecture | medium |
| DR-0039 | External API uses its own `{success,data,meta,error}` envelope + `/external/docs`; not part of the OpenAPI spec-first contract (no generated client/zod). | doc-vs-code | low |
| DR-0042 | **RESOLVED 2026-07-03.** `external_programs` reads/edits/explains were scoped by primary key only (cross-tenant IDOR). Now scoped to caller key/org via `findOwnedProgram()`; unauthorized → `404 NOT_FOUND`. Tests: `external-programs-ownership.test.ts`. | code (security) | ~~high~~ resolved |
| DR-0043 | **RESOLVED 2026-07-03.** External programs had no change tracking or rollback (the internal `system_change_log`/restore parity gap). Phase 1C adds `external_program_versions` (append-only), snapshot-before-edit, `GET /program/:id/history`, and `POST /program/:id/revert`. Edits remain non-surgical until Phase 2. Tests: `external-programs-ownership.test.ts`. | code (parity) | ~~medium~~ resolved |
| DR-0044 | **RESOLVED 2026-07-03.** `buildSystemUserId` fell back to `?? 1`, loading internal user #1's profile into external generations (mis-attribution + data-isolation leak). Now attributes to the key's `createdBy`, else a non-personal service sentinel (`-1`, logged). Phase 1B/1E. Tests: `external-programs-ownership.test.ts`. | code (isolation) | ~~medium~~ resolved |

No open `high`-severity items.

## 9. Cross-references to prior implementation docs

- **`contract-spine.md` (DR-0007/DR-0008):** the external API is one of the uncontracted ~31 routers,
  but — unlike the internal routes — it is **self-documented** with a consistent envelope.
- **`ai-agents.md`:** external generation reuses `generateAIResponse` (the Coach), API-key-gated.
- **`mutation-pipeline.md`:** external edits **regenerate** via the Coach rather than the structured
  edit pipeline — a different mutation model.
- **`db-schema.md`:** `external_api_keys`/`external_api_logs`/`external_programs`; `external_programs`
  is a jsonb blob store decoupled from `training_systems`.
- **`context-pipeline.md` (DR-0020) / `identity-billing.md`:** in-memory rate-limit state shares the
  autoscale-fragility pattern; contrast the DB-backed session store.

## 10. Recommended CLAUDE.md updates

Proposals only (governance §2/§7):
1. **§2/§3** — Note the external rate limiter is **in-memory/per-instance** → not globally enforced
   under autoscale (consider a shared store). (DR-0038.)
2. **§2/§3** — State that the external API has its **own envelope + `/external/docs`** and is
   intentionally outside the OpenAPI contract; and that external programs are **jsonb blobs edited by
   regeneration** (not the structured edit pipeline). (DR-0039.)

The external API is otherwise an accurate, clean realization of CLAUDE.md §2/§3 (isolated namespace,
hashed keys, per-key permissions, audit logging, decoupled storage, engine reuse).

## 11. Files reviewed

Full: `external-api-auth.ts`, `external-api-rate-limiter.ts`. Flow/wiring: `api-keys.ts`
(key generation), `external/index.ts` (docs + envelope), `external/programs.ts` (engine reuse +
storage, grep-level), `external/exercises.ts`. Mount in `routes/index.ts`. Schema cross-ref to
`external-api.ts` (via db-schema.md).

## 12. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| API-key auth (hash, active/expiry/permission) | **High** | Middleware read in full. |
| Rate limiter + autoscale caveat (DR-0038) | **High** | Limiter read in full; in-memory Map confirmed. |
| Key creation (hash-only, shown once) | **High** | api-keys.ts generation flow read. |
| Engine reuse (generateAIResponse) + decoupled storage | **High** | Imports + call sites in programs.ts. |
| Response envelope (DR-0039) | **High** | Helper + docs declaration read. |
| Request logging to external_api_logs | **High** | Middleware insert site. |
| programs.ts handler internals | **Medium** | Grep-level, not full bodies. |
| **Runtime behavior** | **UNVERIFIED** | No execution. |

Overall: **high confidence; faithful, cleanly isolated subsystem.** Open gaps (full programs route;
runtime) keep this at **L3**; it is a strong L4 candidate (only one medium infra DR) after a
code-level read of the programs handlers.

## 13. Verification record

- Verified at commit `78ee536` (current date 2026-06-29).
- Independent checks: Bearer `tc_` → SHA-256 lookup; 8 permissions; in-memory 60/60s limiter;
  key = `tc_`+randomBytes(32), hash+prefix stored, shown once; programs route imports
  `generateAIResponse` + writes `externalProgramsTable`; external_api_logs insert in middleware;
  mounted at `/api/external`.
- Not run (documented gaps): full programs route read; runtime; live external call.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
