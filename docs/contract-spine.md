---
title: Contract Spine — OpenAPI, Orval Codegen, Zod & React Query Client
doc_type: implementation
subsystem: contract-spine
status: VERIFIED
maturity: L3

source_of_truth:
  - lib/api-spec/openapi.yaml
  - lib/api-spec/orval.config.ts
  - lib/api-spec/package.json
  - lib/api-zod/src/index.ts
  - lib/api-zod/src/generated/api.ts
  - lib/api-zod/src/generated/types/*
  - lib/api-zod/package.json
  - lib/api-client-react/src/index.ts
  - lib/api-client-react/src/custom-fetch.ts
  - lib/api-client-react/src/generated/api.ts
  - lib/api-client-react/src/generated/api.schemas.ts
  - lib/api-client-react/package.json
  - artifacts/api-server/src/routes/index.ts
related_architecture:
  - "CLAUDE.md §2 Repository Organization (the contract spine / spec-first)"
  - "CLAUDE.md §7 (principle: spec-first contracts)"
related_implementation:
  - "docs/db-schema.md (program data model; legacy vs canonical hierarchies)"

last_generated: 2026-06-28
last_verified: 2026-06-28
verified_by: claude (Version 2, Wave 1 doc #2)
verified_commit: 78ee536
verification_method: >
  Read the OpenAPI spec, Orval config, both generated packages (index + generated dirs +
  package.json), and the hand-written custom-fetch mutator in full. Independently cross-checked:
  counted spec paths (16), operations (24), tags (10), component schemas (28); counted
  api-zod generated validators (49 consts) and confirmed every name api-server imports exists;
  counted api-client-react react-query hooks (12 mutation hooks); enumerated the 40 feature
  routers mounted in routes/index.ts and mapped them against spec tags to quantify coverage;
  grepped api-zod consumption (5 route files) and api-client-react consumption (36 frontend files).
  NOT performed: running `pnpm codegen` to confirm the committed generated output is byte-identical
  to a fresh run; tracing every route's validation. Claims about regeneration parity and full
  per-route validation are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0007, summary: "OpenAPI spec covers ~9 of 40 mounted routers (24 operations); most of the HTTP surface is uncontracted", kind: doc-vs-code, severity: high, status: open }
  - { id: DR-0008, summary: "Within covered routes, validation/error envelopes are only partially enforced by generated schemas; inline zod + ad-hoc error shapes are used", kind: doc-vs-code, severity: medium, status: open }
  - { id: DR-0009, summary: "Contracted Program schema models the LEGACY saved_programs hierarchy; the canonical training_systems model is entirely uncontracted", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0010, summary: "No CI/parity guard that committed generated output matches the spec, or that the spec matches the routes; drift is unguarded", kind: code-vs-architecture, severity: medium, status: open }
---

# Contract Spine — OpenAPI, Orval Codegen, Zod & React Query Client

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Implementation document, generated from and reconciled against `lib/api-spec/`, `lib/api-zod/`,
> `lib/api-client-react/`, and the server's route mounting. **Code wins** on disagreement.
> Claims about *regeneration parity* and *full per-route validation* are marked **(UNVERIFIED)**:
> `pnpm codegen` was not run and not every route was read.

## 1. Purpose & scope

The "contract spine" is TrainChat's **spec-first HTTP contract** (`CLAUDE.md §2`): one OpenAPI
document is the declared source of the API, and Orval generates from it both a runtime **Zod
validator** package (`@workspace/api-zod`, used by the backend) and a typed **React Query client**
package (`@workspace/api-client-react`, used by the frontend). This document describes the
generator, the generated artifacts, the hand-written fetch mutator, how each end consumes them, and
— critically — **how much of the real HTTP surface the contract actually covers** (less than you'd
expect from `CLAUDE.md`). It implements `CLAUDE.md §2` and the principle in `§7`.

## 2. Source map

| File | Responsibility |
|---|---|
| `lib/api-spec/openapi.yaml` | The OpenAPI **3.1.0** spec. 16 paths, 24 operations, 28 component schemas, 10 tags. `info.title` is fixed to `Api` (see §3). |
| `lib/api-spec/orval.config.ts` | Orval config defining **two** outputs (`api-client-react`, `zod`) from the one spec. |
| `lib/api-spec/package.json` | `@workspace/api-spec`; devDep `orval ^8.5.2`; script `codegen`. The generator package — not consumed at runtime. |
| `lib/api-zod/src/index.ts` | `export * from "./generated/api"` — re-exports the generated Zod validators only. |
| `lib/api-zod/src/generated/api.ts` | 49 generated Zod consts (request/param/response validators). |
| `lib/api-zod/src/generated/types/*` | 30 generated TypeScript type files (one per schema/params). Not re-exported by the package root. |
| `lib/api-client-react/src/index.ts` | Re-exports generated `api` + `api.schemas` + the `custom-fetch` helpers. |
| `lib/api-client-react/src/generated/api.ts` | React Query hooks + fetchers (12 mutation hooks + query hooks). |
| `lib/api-client-react/src/generated/api.schemas.ts` | Generated TS types for the client surface. |
| `lib/api-client-react/src/custom-fetch.ts` | **Hand-written** mutator: the runtime fetch backbone (auth, base URL, error classes). The only non-generated runtime file in the spine. |
| `artifacts/api-server/src/routes/index.ts` | Mounts **40** feature routers — the actual HTTP surface, most of which the spec does not describe. |

## 3. The OpenAPI spec (the declared contract)

- **Version:** OpenAPI `3.1.0`, `info.version: 0.1.0`, server base `/api`.
- **`info.title` is forced to `Api`.** A header comment ("Do not change the title…") and the
  Orval `titleTransformer` (which sets `config.info.title = "Api"` for both outputs) enforce this,
  because output import paths assume the generated file is `api.ts`. Changing the title breaks
  imports.
- **Declared surface (24 operations across 10 tags):**

| Tag | Operations (operationId) |
|---|---|
| health | `healthCheck` |
| auth | `register`, `login`, `logout`, `getMe` |
| profile | `getProfile`, `createProfile` |
| conversations | `listConversations`, `createConversation`, `getConversation`, `deleteConversation` |
| messages | `listMessages`, `sendMessage` |
| programs | `listPrograms`, `createProgram`, `getProgram`, `deleteProgram` |
| readiness | `createReadinessEntry`, `listReadiness` |
| sessionFeedback | `createSessionFeedback`, `listSessionFeedback` |
| memory | `listMemories`, `syncMemories` |
| insights | `listInsights` |

- **28 component schemas**, including a generic envelope pair (`SuccessResponse`, `ErrorResponse`)
  and domain DTOs (`User`, `UserProfile`, `Conversation`, `Message`, `MessagePair`, `Program`,
  `ProgramDay`, `Exercise`, `ProgramDetail`, `ReadinessEntry`, `SessionFeedback`, `UserMemory`,
  `TrainingInsight`, plus `*Body` request shapes).
- ⚠️ **The `Program`/`ProgramDay`/`Exercise` DTOs model the LEGACY program hierarchy** (the
  `saved_programs → program_days → exercises` tables — see `docs/db-schema.md §4.2/§10`), **not** the
  canonical `training_systems` hierarchy. The canonical model has no schema here (DR-0009).

## 4. The codegen pipeline (Orval)

One command, `pnpm --filter @workspace/api-spec codegen` (`orval --config ./orval.config.ts`),
produces two outputs from `openapi.yaml`:

**Output A — `api-client-react`** (frontend):
- `client: "react-query"`, `mode: "split"`, `baseUrl: "/api"`, `clean: true`, `prettier: true`.
- `output.workspace` → `lib/api-client-react/src`, `target: "generated"`.
- `mutator` → `custom-fetch.ts#customFetch` (every generated fetcher calls the hand-written mutator).
- `fetch.includeHttpResponseReturnType: false` (hooks return the parsed body, not the Response).

**Output B — `zod`** (backend):
- `client: "zod"`, `mode: "split"`, `schemas` emitted as **TypeScript** types under
  `generated/types`, `clean: true`, `prettier: true`.
- `output.workspace` → `lib/api-zod/src`, `target: "generated"`.
- **Coercion config:** query & param values coerced to `boolean|number|string`; body & response
  coerced for `bigint|date`. `useDates: true`, `useBigInt: true`.

`clean: true` means each run wipes and regenerates the `generated/` dirs — consistent with
`CLAUDE.md`'s "never hand-edit generated directories" (this guidance is **confirmed correct**).
The generated dirs are committed to git (they are tracked; only `CLAUDE.md`/`docs/` were untracked
at `verified_commit`).

## 5. The generated packages

### 5.1 `@workspace/api-zod` (runtime validators — backend)
- ESM; `exports` `"."` → `src/index.ts`; dep `zod` (catalog). `src/index.ts` re-exports **only**
  `generated/api` (the **49** Zod consts), e.g. `RegisterBody`, `LoginBody`, `CreateProgramBody`,
  `GetProgramParams`, `HealthCheckResponse`, `ListReadinessQueryParams`, plus generated bound
  constants like `createReadinessEntryBodySleepScoreMax`.
- The `generated/types/*` TS types exist but are **not** re-exported by the package root, so backend
  consumers get **runtime validators**, not types, from this package.

### 5.2 `@workspace/api-client-react` (typed client — frontend)
- ESM; `exports` `"."` → `src/index.ts`; dep `@tanstack/react-query` (catalog); peer `react >=18`.
- `src/index.ts` re-exports `generated/api` (hooks + fetchers), `generated/api.schemas` (TS types),
  and the `custom-fetch` helpers (`setBaseUrl`, `setAuthTokenGetter`, `setDefaultHeaders`,
  `getDefaultHeaders`, `customFetch`, `AuthTokenGetter`).
- Generated hooks include **12 mutation hooks** (`useRegister`, `useLogin`, `useLogout`,
  `useCreateProfile`, `useCreateConversation`, `useSendMessage`, `useCreateProgram`,
  `useDeleteProgram`, `useCreateReadinessEntry`, `useCreateSessionFeedback`, `useSyncMemories`,
  `useDeleteConversation`) plus query hooks for the GET operations (`useGetMe`, `useGetProfile`,
  `useListConversations`, `useListMessages`, `useListMemories`, `useListInsights`, …).

### 5.3 Module resolution (no build step for libs)
All three packages' `exports` maps point **directly at `.ts` source** (e.g. `"./src/index.ts"`),
so consumers compile against TypeScript source via `tsc` project references — there is no
intermediate build artifact for the libs. `tsconfig.base.json` sets `customConditions: ["workspace"]`,
but the lib `exports` maps are unconditional strings, so that condition is not exercised by these
packages. **(The intended role of `customConditions` was not traced — low confidence; flagged, not
asserted.)**

## 6. The custom-fetch mutator (the runtime backbone)

`custom-fetch.ts` (~430 lines, hand-written) is what every generated client fetcher runs through.
Key implemented behavior:
- **Module-level config:** `setBaseUrl` (prepends to relative paths; for Expo/remote bundles),
  `setAuthTokenGetter` (attaches `Authorization: Bearer <token>` when set — documented as for
  native/Expo, **not** web), `setDefaultHeaders`/`getDefaultHeaders` (ambient headers, e.g.
  `X-Device-Id`).
- **Web auth model:** `fetch(..., { credentials: "include" })` — the web app relies on
  **session cookies**, not bearer tokens (the bearer path is the native fallback). This corroborates
  the anonymous/session model in `docs/db-schema.md` (`users.device_id`, cookie sessions).
- **Robust body handling:** content-type sniffing, JSON/text/blob parsing, BOM stripping, and
  explicit React Native compatibility (e.g. `response.body` is `undefined` in RN, so emptiness is
  detected via status/content-length, not `== null`).
- **Typed errors:** `ApiError` (status, statusText, data, headers, method, url; message built from
  `title`/`detail`/`message`/`error` fields, supporting RFC-7807 `application/problem+json`) and
  `ResponseParseError` (raw body + cause for unparseable JSON).

This file is the spine's most consequential hand-written code; it is **not** regenerated and must be
maintained directly.

## 7. How the contract is consumed

### 7.1 Backend (api-zod)
- Imported by **5 route files**: `health.ts`, `auth.ts`, `programs.ts`, `profile.ts`,
  `conversations.ts` — using `<Schema>.safeParse(req.body|params)` for the **contracted subset**.
- ⚠️ Validation across the server is **mixed**: even within these files, some bodies are validated
  by **locally-defined inline zod** that is *not* part of the contract (e.g. in `auth.ts`:
  `BootstrapBody`, `ResetPasswordBody`, and an inline `z.object({ email: z.string().email() })`).
  Error responses are frequently ad-hoc (`res.status(400).json({ error: parsed.error.message })`)
  rather than the spec's `ErrorResponse` envelope (DR-0008). **(Full per-route audit UNVERIFIED.)**

### 7.2 Frontend (api-client-react)
- Imported by **36 files**. Pages use the generated React Query hooks (e.g. `chat.tsx`:
  `useGetMe`, `useGetProfile`, `useListConversations`, `useCreateConversation`, `useListMessages`,
  `useListMemories`, `useListInsights`, `useLogout`).
- The same files **also import `customFetch` directly** (e.g. `chat.tsx`) to reach endpoints with
  **no generated hook** — i.e. the large uncontracted surface (streaming chat/SSE, training-system,
  etc.). So the client package is used in two modes: typed hooks for contracted endpoints, raw
  `customFetch` for everything else. **(The exact set of direct-`customFetch` call sites and their
  reasons were not exhaustively enumerated — medium confidence on "SSE/uncontracted" attribution.)**

## 8. Coverage: contract vs. reality (headline finding)

`routes/index.ts` mounts **40 feature routers** (plus nested `external` sub-routers). The OpenAPI
spec describes operations for only **~9** of them:

| Contracted (in spec) | Uncontracted (mounted, no spec) — examples |
|---|---|
| health, auth, profile, conversations(+messages), programs, readiness, session-feedback, memories, insights | stripe, session-logs, streak, admin, guest, **training-system**, training-system-edit, training-system-directions, training-system-history, training-system-mutate, exercises, calibrate, exercise-logs, **neural-profile**, predictions, block-intelligence, debug, support, active-session, share-moments, system-adjustments, clear-memory, **mutation-audit-receipts**, **billing**, intelligence-status, **atlas-memories**, **external**, whitepapers-admin, whitepapers-public, meta-capi, performance-profile |

So the spec covers **24 operations against ~9 of 40 routers (≈22%)**. The contract spine is real and
correctly wired, but it governs a **core subset only**; the majority of TrainChat's HTTP surface —
including the canonical `training_systems` programming model, the mutation pipeline, billing,
memory, and the entire external API — is **hand-written and uncontracted** (DR-0007). This directly
qualifies `CLAUDE.md §2`'s "single source of truth for the HTTP surface."

## 9. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0007 | OpenAPI spec covers ~9 of 40 mounted routers (24 operations); most of the HTTP surface is uncontracted. `CLAUDE.md §2` reads as if the spec is the whole surface. | doc-vs-code | **high** |
| DR-0008 | Within covered routes, request validation/error envelopes are only partially enforced by generated schemas; inline zod + ad-hoc `{ error }` responses are common. | doc-vs-code | medium |
| DR-0009 | Contracted `Program`/`ProgramDay`/`Exercise` DTOs model the **legacy** `saved_programs` hierarchy; the canonical `training_systems` model is entirely uncontracted. Cross-ref `docs/db-schema.md §10`. | code-vs-architecture | medium |
| DR-0010 | No CI/parity guard that committed generated output matches the spec, or that the spec matches the mounted routes. Drift between spec, generated code, and routes is unguarded. | code-vs-architecture | medium |

DR-0007's `high` severity reflects that an engineer trusting `CLAUDE.md` could assume the API is
fully spec-described and typed, when ~78% of routers are not.

## 10. Cross-references to prior implementation docs

- **`docs/db-schema.md §10` (dual program model):** confirmed from the contract side — the OpenAPI
  `Program` DTOs map to the **legacy** `saved_programs/program_days/exercises` tables, while the
  canonical `training_systems` hierarchy (db-schema's "current canonical") is uncontracted. The two
  docs corroborate the same architectural split from opposite ends (DR-0009 ↔ db-schema's program-model
  observation).
- **`docs/db-schema.md §6` (session-cookie / anonymous-first):** corroborated by `custom-fetch.ts`
  using `credentials: "include"` and reserving bearer tokens for native — the web contract is
  cookie-session based, matching `users.device_id`/session storage.

## 11. Recommended CLAUDE.md updates

Proposals only (governance §2/§7 — architecture edits are deliberate and owner-driven), each
directly supported by the implementation read here:

1. **§2 / §7** — Replace "single source of truth for the HTTP surface" with a qualified statement:
   the OpenAPI spec is the source of truth for a **contracted core subset** (~9 tag areas, 24
   operations); the majority of mounted routers (40 total) are hand-written and uncontracted.
   (Supports DR-0007.)
2. **§2** — Note that the contracted program schema reflects the **legacy** `saved_programs` model;
   the canonical `training_systems` model is not in the contract. (Supports DR-0009; cross-ref
   db-schema.)
3. **§2** — Note that generated-schema validation is **partial**: some covered routes use inline
   zod and ad-hoc error shapes rather than the `ErrorResponse`/`SuccessResponse` envelopes.
   (Supports DR-0008.)
4. **§2** — Affirm + sharpen the existing "never hand-edit generated dirs" rule with the fact that
   `clean: true` wipes them on regen, and add that **no parity check currently guards drift** among
   spec ↔ generated ↔ routes. (Supports DR-0010.)

No change is recommended to the spec-first *principle* itself — it is correctly implemented for the
endpoints it covers; the gap is **coverage and enforcement**, not design.

## 12. Files reviewed

`lib/api-spec/{openapi.yaml, orval.config.ts, package.json}`;
`lib/api-zod/{package.json, src/index.ts, src/generated/api.ts, src/generated/types/* (listing)}`;
`lib/api-client-react/{package.json, src/index.ts, src/custom-fetch.ts, src/generated/api.ts,
src/generated/api.schemas.ts (listing)}`; `artifacts/api-server/src/routes/index.ts`; sampled
consumers `artifacts/api-server/src/routes/auth.ts` (validation pattern) and
`artifacts/trainchat/src/pages/chat.tsx` (client usage). Cross-check greps for `@workspace/api-zod`
(5 backend files) and `@workspace/api-client-react` (36 frontend files), plus export/hook/validator
counts.

## 13. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Spec contents (paths/ops/tags/schemas) | **High** | Read + counted directly. |
| Orval config & two-output pipeline | **High** | Read full config. |
| Generated package wiring & exports | **High** | Read index + package.json + counted generated consts/hooks. |
| custom-fetch behavior | **High** | Read in full. |
| Coverage gap (≈9/40 routers) | **High** | Enumerated mounted routers and mapped to spec tags. |
| Backend validation nuance (inline zod, error shapes) | **Medium-High** | Confirmed in `auth.ts`; not every route read. |
| Frontend direct-`customFetch` reasons (SSE/uncontracted) | **Medium** | Confirmed the import; exact call sites/purposes not exhaustively traced. |
| `customConditions: ["workspace"]` purpose | **Low** | Set in tsconfig but not exercised by lib exports; role not traced. |
| **Regeneration parity** (committed output == fresh `pnpm codegen`) | **UNVERIFIED** | Codegen not run in this doc-only task. |

Overall: **high confidence in the contract-spine structure and the coverage finding**; open gaps
are regeneration parity and an exhaustive per-route validation census — both cap promotion beyond L3
until a future cycle runs `pnpm codegen` and audits the covered routes.

## 14. Verification record

- Generated and verified at commit `78ee536`.
- Independent re-derivation: spec paths=16, operations=24, tags=10, schemas=28; api-zod
  validators=49 (all backend-imported names confirmed present); client mutation hooks=12; mounted
  feature routers=40 → coverage ≈9/40.
- Negative/observational checks: generated dirs are committed; no parity/CI guard located; backend
  inline-zod confirmed in `auth.ts`.
- Not run (documented gaps): `pnpm codegen` parity check; exhaustive per-route validation and
  direct-`customFetch` census.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
