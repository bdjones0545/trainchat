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
- Idempotency key format: `<eventType>:<entityId>` — prevents double-dispatch on worker retry.
- `z.record()` in Zod v4 requires two arguments: `z.record(z.string(), z.unknown())` — single-arg form is a type error.
- `KevinEventSummary` union type must be cast to `Record<string, unknown>` before passing to `sanitizePayload()`.
- `contextRequestId` is stored as `number` in DB but Kevin client expects `string` — convert with `String()` at call site.
- Kevin context blocked from cross-application use until Phase 13 identity linking is implemented.

## Files and activation
- DB tables: `kevin_app_capabilities`, `kevin_app_events`, `kevin_app_signals`, `kevin_context_requests`, `kevin_identity_links`, `kevin_memory_consents`, `kevin_training_outcomes`
- Migration: `lib/db/manual-migrations/0004_kevin_integration.sql` (idempotent, IF NOT EXISTS)
- Docs: `docs/kevin-integration.md` — includes staged activation guide, security model, prompt injection rules, rollback instructions
- Startup hooks: `seedKevinCapabilities` + `startKevinEventWorker` in `artifacts/api-server/src/index.ts`
- Session feedback integration: `routes/session-feedback.ts` calls `enqueueKevinEvent` + `recordSessionFeedbackOutcome` (both fail-open with `.catch(() => {})`)

**Why:** Kevin unavailability must never block a workout. All integration points are either fire-and-forget or wrapped in explicit fail-open error handling.
