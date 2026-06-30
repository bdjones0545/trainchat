---
title: Frontend — React App, Generated Client, SSE Chat, UIContext & AEO Surface
doc_type: implementation
subsystem: frontend
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/trainchat/src/main.tsx
  - artifacts/trainchat/src/App.tsx
  - artifacts/trainchat/src/lib/api.ts
  - artifacts/trainchat/src/lib/uiContext.ts
  - artifacts/trainchat/src/lib/button-action-payloads.ts
  - artifacts/trainchat/src/lib/deviceId.ts
  - artifacts/trainchat/src/hooks/useStreamMessage.ts
  - artifacts/trainchat/src/lib/AtlasGlobalContextResolver.ts
  - artifacts/trainchat/src/contexts/FocusModeContext.tsx
  - artifacts/trainchat/src/pages/*
related_architecture:
  - "CLAUDE.md §2 Repository Organization (frontend = @workspace/trainchat)"
related_implementation:
  - "docs/contract-spine.md (generated hooks for contracted ops; raw customFetch/SSE for the rest)"
  - "docs/context-pipeline.md (frontend is the SOURCE of UIContext → buildUIContextSection)"
  - "docs/ai-agents.md (button-action scope = client side of action routing; AgentOutcomeType/BuildStage mirror server)"
  - "docs/mutation-pipeline.md (finalizeMutationOutcome drives the SSE mutationOutcome → UI)"
  - "docs/memory.md (AtlasGlobalContextResolver = frontend Atlas-memory consumption, DR-0024)"
  - "docs/identity-billing.md (frontend bootstraps anonymous user + calls both /auth/bootstrap and /guest/*, DR-0035)"

last_generated: 2026-06-29
last_verified: 2026-06-29
verified_by: claude (Version 2, Wave 4 doc #12 — final V2 doc)
verified_commit: 78ee536
verification_method: >
  Read main.tsx + App.tsx (routing/providers/client config/bootstrap) in full; lib/api.ts, lib/uiContext.ts,
  lib/button-action-payloads.ts, deviceId/bootstrap wiring; useStreamMessage.ts (SSE event types + fetch
  reader). Enumerated the src tree (253 files), pages, contexts, hooks, lib. Verified wiring: X-Device-Id
  header + /auth/bootstrap in App.tsx; SSE endpoint /api/conversations/:id/messages/stream;
  AgentOutcomeType/BuildStage mirroring server. NOT done: full read of chat.tsx + the 253-file tree;
  no browser runtime. Such claims are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0040, summary: "The core product flow (SSE streaming chat, mutation outcomes, build stages, action scope) relies on HAND-SYNCHRONIZED client↔server types (useStreamMessage SSE events, AgentOutcomeType, BuildStage, button-action-payloads scope, uiContext), not the generated OpenAPI contract — drift risk (cross-ref DR-0007/DR-0008)", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0041, summary: "The frontend's largest page surface is AEO/marketing content (~45 pages/aeo/* + concepts/whitepapers), a major SEO concern not reflected in CLAUDE.md §2/§10's product-UI framing", kind: doc-vs-code, severity: low, status: open }
---

# Frontend — React App, Generated Client, SSE Chat, UIContext & AEO Surface

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Reconciled against the app shell + client wiring + the chat/SSE contract. **Code wins** on
> disagreement. `chat.tsx` and the 253-file tree were enumerated/sampled, not fully read; no browser
> runtime. Runtime claims are **(UNVERIFIED)**. This is the final Version 2 implementation document.

## 1. Purpose & scope

The product UI (`@workspace/trainchat`): how it boots, routes, consumes the API contract, streams the
coaching conversation, sources UIContext, and serves its marketing/SEO surface. Implements
`CLAUDE.md §2`'s frontend description.

## 2. Stack & structure

- **React 19 + Vite + Tailwind v4** (per `db-schema.md`/CLAUDE.md catalog). **Routing:** `wouter`.
  **Server state:** TanStack React Query via the generated `@workspace/api-client-react`.
- **253 `.ts(x)` files.** `src/` = `pages/` (+ `pages/admin`, `pages/aeo`), `components/` (chat,
  conversion, gamification, training, share, ui, layout, directory, aeo, debug, laser-skill),
  `contexts/` (just `FocusModeContext`), `hooks/`, `lib/`, `data/`, `types/`, `__tests__/`.
- **Code-splitting:** core pages (login/register/chat/guest-start) are static; authenticated pages
  and all AEO pages are `lazy()`-loaded → independent Rollup chunks (App.tsx).

## 3. Bootstrap & client configuration (App.tsx / main.tsx)

`main.tsx` mounts `<App/>` with prod-safe startup diagnostics. `App.tsx`:
- Configures the generated client's mutator via `setDefaultHeaders({ "X-Device-Id":
  getOrCreateDeviceId() })` (line 168) — the ambient device ID rides every request.
- **Bootstraps the anonymous user**: `fetch("/api/auth/bootstrap", …)` (193) → establishes the
  cookie session (`identity-billing.md §4`). Confirms the anonymous-user-first model end-to-end.
- Wraps the tree in `QueryClientProvider` + `TooltipProvider` + `Toaster`; routes via `wouter`.
- `lib/api.ts` `getApiUrl` is trivial (returns the path) — the app calls **same-origin relative
  paths**; `customFetch` uses `credentials: "include"` (cookies), so `setBaseUrl`/bearer-token
  (Expo/native) paths are unused here.

## 4. Consuming the contract (generated + hand-coded)

- **Contracted operations** use the generated React Query hooks (`useGetMe`, `useListConversations`,
  `useCreateConversation`, `useSendMessage`, …) from `@workspace/api-client-react`
  (`contract-spine.md §5.2`).
- **Uncontracted operations** (the majority — `contract-spine.md` DR-0007) use raw `customFetch`
  and the SSE reader directly: training-system, billing, guest, admin, streaming chat, etc.

## 5. The SSE chat core (`useStreamMessage`) — hand-synchronized contract (headline)

The primary product surface streams from **`/api/conversations/:id/messages/stream`** using a manual
`fetch` + `ReadableStream` reader + `TextDecoder` (not `EventSource`). It defines a rich set of typed
SSE events and two enums that **mirror server-side types**:
- **`AgentOutcomeType`** = `mutation_applied | clarification_needed | conversation_only |
  true_failure` — mirrors the server's `finalizeMutationOutcome` (`mutation-pipeline.md §5`) and
  drives all UI decisions (panel open, toasts, scroll).
- **`BuildStage`** = understanding→loading→classifying→planning→applying→validating→saving→complete —
  "mirrors build-pipeline.ts on the server" (its own comment).
- SSE events include `acknowledged`, `micro_reasons` (Coach-voiced constraint reasons), the global
  `mutationOutcome`, and `systemSaved` (lets the panel update without a refetch).

Because the streaming/chat surface is **uncontracted by OpenAPI**, this entire client↔server contract
is **hand-maintained** — the same is true of `uiContext.ts`, `button-action-payloads.ts`, and the
outcome/stage enums. There is no generated type or parity check binding them to their server
counterparts, so they can silently drift. (DR-0040; the frontend-side consequence of DR-0007/DR-0008.)

## 6. UIContext source + action scope (cross-subsystem glue)

- **`lib/uiContext.ts`** defines the `UIContext` the frontend sends (page/selectedWeek/
  selectedSession/selectedExercise/panelState). The server renders it via `buildUIContextSection`
  (`context-pipeline.md §4`) — **the frontend is the source of UIContext.**
- **`lib/button-action-payloads.ts`** infers an action **scope** (`exercise`/`session`/`program`/
  `architecture`) from the prompt via regex, mapping to the mutation pipeline vs the hierarchical
  engine — the **client side of the action routing** the orchestrator consumes (`ai-agents.md §5`).
- **`AtlasGlobalContextResolver.ts` / `AtlasContextBuilder.ts`** consume `atlasMemories` for
  client-side context chips — the frontend half of the Atlas memory system (`memory.md` DR-0024).
- **`FocusModeContext`** (the single React context) + `useFocusMode` carry strength/speed/mobility
  mode; most other state is React Query + local.

## 7. The AEO / marketing surface

`pages/aeo/` holds **~45 Answer-Engine-Optimization pages** (e.g. `WhatIsAiFitnessCoaching`,
`AiStrengthCoach`, `VsChatGptWorkouts`, `VsFitbod`, `RealTimeWorkoutAdaptation`) plus `concepts/`,
`whitepapers/`, and AEO components — by file count the **largest page surface in the app**, all
lazy-loaded for SEO crawlability without bloating the product bundle. This is a major content/SEO
concern distinct from the product UI and is not reflected in CLAUDE.md §2/§10. (DR-0041.) It is
adjacent to the standalone `wp-*` whitepaper microsites (`db-schema.md`/CLAUDE.md §7).

## 8. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0040 | Core product flow (SSE chat, outcomes, build stages, action scope, uiContext) uses hand-synchronized client↔server types, not the generated contract — drift risk. | code-vs-architecture | medium |
| DR-0041 | Largest page surface is AEO/marketing content (~45 pages/aeo/* + concepts/whitepapers), not reflected in CLAUDE.md §2/§10. | doc-vs-code | low |

No new `high`-severity items. The app is otherwise a clean, conventional React+wouter+React-Query
client faithful to CLAUDE.md §2.

## 9. Cross-references to prior implementation docs

- **`contract-spine.md` (DR-0007/0008):** generated hooks for contracted ops; raw `customFetch`/SSE +
  hand-synced types for the uncontracted majority (DR-0040 is the consumer-side view).
- **`context-pipeline.md`:** `uiContext.ts` is the **source** of the UIContext the server injects.
- **`ai-agents.md`:** `button-action-payloads` scope = client side of action routing;
  `AgentOutcomeType`/`BuildStage` mirror server orchestration/outcome types.
- **`mutation-pipeline.md`:** the SSE `mutationOutcome` (from `finalizeMutationOutcome`) drives the
  UI's panel/toast decisions.
- **`memory.md` (DR-0024):** `AtlasGlobalContextResolver` is the frontend Atlas-memory consumer.
- **`identity-billing.md` (DR-0035):** App.tsx bootstraps the anonymous user and the device-ID header;
  the frontend calls **both** `/auth/bootstrap` and `/guest/*` (the dual-system evidence).

## 10. Recommended CLAUDE.md updates

Proposals only (governance §2/§7):
1. **§2** — Note that the **core product flow** (SSE streaming chat, mutation outcomes, build stages,
   action scope, UIContext) is governed by **hand-synchronized** client↔server types, not the
   generated OpenAPI contract — and that this is the highest client↔server drift risk. (DR-0040.)
2. **§2/§10** — Document the large **AEO/marketing page surface** (`pages/aeo/*`) as a first-class
   part of the frontend, distinct from the product UI and the `wp-*` microsites. (DR-0041.)

The frontend is an accurate realization of CLAUDE.md §2 (anonymous-first bootstrap, generated client
for contracted ops, wouter routing, React Query, UIContext source); the gaps are the
hand-synchronized streaming contract and the undocumented AEO surface.

## 11. Files reviewed

Full: `main.tsx`, `App.tsx`, `lib/api.ts`, `lib/uiContext.ts`, `lib/button-action-payloads.ts` (scope),
`hooks/useStreamMessage.ts` (event types + fetch reader). Enumerated: full `src` tree (253 files),
`pages/` (+ admin/aeo), `contexts/`, `hooks/`, `lib/`. Wiring greps for device-ID/bootstrap, SSE
endpoint, and outcome/stage types.

## 12. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Stack, routing, code-splitting | **High** | App.tsx/main.tsx read. |
| Client config (device-ID header, same-origin, cookies) | **High** | App.tsx + api.ts + custom-fetch (contract-spine). |
| Anonymous-first bootstrap | **High** | /auth/bootstrap call site. |
| SSE contract + hand-synced types (DR-0040) | **High** | useStreamMessage event types + server-mirror comments. |
| UIContext source + action scope | **High** | uiContext.ts + button-action-payloads read. |
| AEO surface size (DR-0041) | **High** | Directory enumeration. |
| chat.tsx + component internals | **Medium** | Sampled, not fully read. |
| **Runtime / browser behavior** | **UNVERIFIED** | No browser run. |

Overall: **high confidence in the app architecture, client wiring, and the streaming-contract +
AEO findings.** Open gaps (full chat.tsx + components; browser runtime) keep this at **L3**.

## 13. Verification record

- Verified at commit `78ee536` (current date 2026-06-29).
- Independent checks: `setDefaultHeaders({X-Device-Id})` + `/api/auth/bootstrap` in App.tsx; SSE at
  `/api/conversations/:id/messages/stream`; `AgentOutcomeType`/`BuildStage` mirror server; `uiContext.ts`
  is the UIContext source; `button-action-payloads` infers scope; ~45 `pages/aeo/*`.
- Not run (documented gaps): full chat.tsx/component read; browser runtime.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
