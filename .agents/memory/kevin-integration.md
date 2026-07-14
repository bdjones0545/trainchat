---
name: Kevin Integration Architecture
description: Durable design rules and activation notes for the TrainChat–Kevin integration (18-phase spec).
---

## Core principle
Kevin is enrichment, not control. TrainChat remains sole source of truth for program generation, exercise selection, safety, and user data. Kevin context is applied last in the prompt hierarchy and never overrides current request, constraints, or safety rules.

## Key design rules
- Master env flag `KEVIN_INTEGRATION_ENABLED` (default: false) gates all Kevin network calls. Sub-flags control individual features.
- Pseudonymous IDs use HMAC-SHA256 keyed with `KEVIN_PSEUDONYM_SALT` — raw user IDs and emails must never leave the server.
- Circuit breaker: 5 failures/60s → open 60s → half-open probe. Local validation errors (`KEVIN_DISABLED`, `KEVIN_NOT_CONFIGURED`) do NOT count as failures.
- Event worker: 15s poll, batch 10, retry schedule 30/120/480/1800/7200s, dead-letter after 5 attempts.
- Outcome worker: 30s poll, batch 10, same retry schedule, dead-letter after 5 attempts. Mirrors event worker exactly.
- Idempotency key format: `<eventType>:<entityId>` — prevents double-dispatch on worker retry.
- `z.record()` in Zod v4 requires two arguments: `z.record(z.string(), z.unknown())` — single-arg form is a type error.
- `KevinEventSummary` union type must be cast to `Record<string, unknown>` before passing to `sanitizePayload()`.
- `contextRequestId` is stored as `number` in DB but Kevin client expects `string` — convert with `String()` at call site.
- Kevin context blocked from cross-application use until Phase 13 identity linking is implemented.

## SSE injection point
`transformHint` variable in `conversations.ts`, assembled just before `generateAIResponse` is called (~line 4935 post-edit). The Kevin fragment is appended there — `REBUILD_PROGRAM` action only. `_sseKevinContext` is declared at that scope and passed to `saveOrUpdateProgram`. Kevin context only applied when `contextApplied=true` (not in `observe` mode).

## Dual consent requirement
BOTH `training_preferences` AND `program_history_summary` must be granted for program generation context. If either is missing → `consent_required`, no Kevin call. Enforced in `requestTrainChatKevinContext`.

## Capability modes
- `observe` → context retrieved, `contextApplied=false`, NOT injected into prompt (audit only)
- `draft` / `auto` / `recommend` → context retrieved AND applied
- `disabled` / `require_approval` → no context retrieved (returned early before narrowing)
TS narrows the mode after early-exit checks — comparing against already-excluded values causes TS2367.

## Outcome forward statuses
KEVIN_FORWARD_STATUSES: `pending | processing | forwarded | failed | skipped | dead_lettered` — "sent" was removed. Migration 0005 adds `next_retry_at` and `dead_lettered_at` columns + `idx_kevin_outcomes_retry` index.

## Fail-open: requestTrainChatKevinContext
`requestKevinContext` client call is inside try-catch. Any throw returns `{ available: false, status: "error" }`. Kevin failure NEVER blocks a workout. Always call via `.catch(() => undefined)` at the call site for extra defence.

## Event enqueue shape
`enqueueKevinEvent` uses `summary: KevinEventSummary` (not `payload`). `ProgramGeneratedSummary` requires `goal_category` and `generation_source` fields.

## Test file locations
- `artifacts/api-server/src/lib/__tests__/kevin-context-service.test.ts`
- `artifacts/api-server/src/lib/__tests__/kevin-outcome-worker.test.ts`
Fire-and-forget helpers (`recordProgramGenerated` etc.) cause async DB call leakage into the next test — always add `vi.clearAllMocks()` to `beforeEach` of describe blocks that follow fire-and-forget tests.

## Files and activation
- DB tables: `kevin_app_capabilities`, `kevin_app_events`, `kevin_app_signals`, `kevin_context_requests`, `kevin_identity_links`, `kevin_memory_consents`, `kevin_training_outcomes`
- Migrations: `0004_kevin_integration.sql` (schema), `0005_kevin_outcomes_worker.sql` (next_retry_at, dead_lettered_at)
- Docs: `docs/kevin-integration.md` — includes staged activation guide, security model, prompt injection rules, rollback instructions
- Startup hooks: `seedKevinCapabilities` + `startKevinEventWorker` + `startKevinOutcomeWorker` in `artifacts/api-server/src/index.ts`
- SIGTERM and SIGINT both call `stopKevinEventWorker()` + `stopKevinOutcomeWorker()`
- Session feedback integration: `routes/session-feedback.ts` calls `enqueueKevinEvent` + `recordSessionFeedbackOutcome` (both fail-open)

**Why:** Kevin unavailability must never block a workout. All integration points are either fire-and-forget or wrapped in explicit fail-open error handling.
