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
| `routes/external/programs.ts` (801) | `generate_program` / `edit_program` / `generate_session` / `exercise_swap` / `explain` / retrieve — reuses `generateAIResponse`; stores to `external_programs`. |
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

No `high`-severity items.

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
