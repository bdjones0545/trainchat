# Kevin Integration — Architecture & Operations Guide

## Overview

Kevin is the persistent executive intelligence and institutional-memory runtime shared across the TrainEfficiency ecosystem. TrainChat integrates with Kevin to provide optional personalization enrichment, cross-session memory, and operational intelligence — while keeping TrainChat fully responsible for program generation, editing, validation, and safety.

**Kevin is enrichment, not control.**

---

## Strategic Relationship

```
TrainChat request
      ↓
TrainChat authenticates and validates
      ↓
TrainChat optionally requests safe context from Kevin
      ↓
Kevin returns concise memories, preferences, and patterns
      ↓
TrainChat generates or edits the program (unchanged pipeline)
      ↓
TrainChat validates and stores the result
      ↓
User provides feedback or completes the session
      ↓
TrainChat records the outcome
      ↓
A sanitized outcome event is sent asynchronously to Kevin
      ↓
Kevin learns without becoming the source of truth
```

Kevin must never:
- Replace TrainChat's generation engine
- Bypass validation, transactions, or advisory locks
- Bypass rate limiting or authentication
- Bypass canonical exercise data
- Directly modify workouts, user data, billing, or permissions
- Receive raw PII, health data, or secrets

---

## Architecture Boundaries

### What Kevin provides
- Persistent cross-session memory
- Historical context and preference synthesis
- Recurring-pattern detection
- Product and operational intelligence
- Institutional learning
- Cross-application context (requires explicit consent)
- Navigation assistance

### What Kevin does NOT provide
- Program generation (TrainChat's engine remains sole source of truth)
- Exercise selection logic
- Progression/regression rules
- Session editing logic
- Safety validation
- Training constraints
- User feedback processing

---

## Environment Variables

All Kevin features default to **disabled**. No Kevin network calls are made until explicitly enabled.

| Variable | Required | Description |
|---|---|---|
| `KEVIN_INTEGRATION_ENABLED` | No | Master flag — enables all Kevin infrastructure |
| `KEVIN_HERMES_BASE_URL` | When enabled | Base URL for the Hermes API (e.g. `https://hermes.kevin.internal`) |
| `KEVIN_HERMES_API_KEY` | When enabled | API key for Hermes authentication. **Server-only — never in client bundle** |
| `KEVIN_CONTEXT_RETRIEVAL_ENABLED` | No | Enables optional context fetch before generation |
| `KEVIN_EVENT_DISPATCH_ENABLED` | No | Enables event queue worker dispatch |
| `KEVIN_OUTCOME_FORWARDING_ENABLED` | No | Enables outcome forwarding to Kevin |
| `KEVIN_SIGNAL_INTAKE_ENABLED` | No | Enables `POST /api/internal/kevin/signals` |
| `KEVIN_INTERNAL_SERVICE_TOKEN` | When signal intake enabled | Shared secret for Kevin→TrainChat service-to-service auth. **Server-only** |
| `KEVIN_APPLICATION_ID` | No | Defaults to `trainchat` |
| `KEVIN_PSEUDONYM_SALT` | Recommended | HMAC key for pseudonymous user ID derivation. **Server-only** |
| `KEVIN_CONTEXT_TIMEOUT_MS` | No | Timeout for context requests (default: 3000ms) |
| `KEVIN_EVENT_TIMEOUT_MS` | No | Timeout for event dispatch (default: 5000ms) |
| `KEVIN_HEALTH_TIMEOUT_MS` | No | Timeout for health checks (default: 2000ms) |
| `KEVIN_MAX_CONTEXT_MEMORIES` | No | Max memories returned in context (default: 10) |

### Security requirements
- `KEVIN_HERMES_API_KEY`, `KEVIN_INTERNAL_SERVICE_TOKEN`, and `KEVIN_PSEUDONYM_SALT` must **never** appear in client bundles, logs, or error responses
- Kevin URLs and key prefixes must not be returned to end users
- The master flag (`KEVIN_INTEGRATION_ENABLED`) disables all Kevin network calls when false

---

## Staged Activation

### Stage 1 — Health only
```
KEVIN_INTEGRATION_ENABLED=true
```
Verify: health check responds, circuit breaker starts closed, admin `/admin/kevin/status` returns expected data.

### Stage 2 — Context retrieval
```
KEVIN_CONTEXT_RETRIEVAL_ENABLED=true
```
Verify: generation still succeeds when Kevin is unavailable. Check `/admin/kevin/context-requests` for audit entries.

### Stage 3 — Events
```
KEVIN_EVENT_DISPATCH_ENABLED=true
```
Verify: events move from `pending` → `sent`. Check `/admin/kevin/events` for queue stats. Confirm no duplicates.

### Stage 4 — Outcomes
```
KEVIN_OUTCOME_FORWARDING_ENABLED=true
```
Verify: feedback and completion outcomes arrive correctly at Kevin. Confirm `forward_status=sent` in DB.

### Stage 5 — Signals
```
KEVIN_INTERNAL_SERVICE_TOKEN=<strong random secret>
KEVIN_SIGNAL_INTAKE_ENABLED=true
```
Verify: signal validation, deduplication, and routing. Test 401 on bad token.

### Stage 6 — Cross-application context
**Do not enable** until identity linking (Phase 13), explicit consent, revocation, and auditing are fully implemented and verified.

---

## Feature Flags

All Kevin behavior is controlled by the environment variables above. No code-level feature flags are used. The master `KEVIN_INTEGRATION_ENABLED=false` (default) prevents all Kevin network calls regardless of sub-flags.

---

## Consent Model

Users control Kevin memory through the **Training Memory** settings page (`/settings/kevin-memory`).

### Memory types
| Type | Description |
|---|---|
| `training_preferences` | Training style, frequency, duration preferences |
| `exercise_preferences` | Liked/disliked exercise patterns |
| `equipment_preferences` | Available equipment categories |
| `schedule_preferences` | Days/times preferences |
| `communication_preferences` | Coaching tone preferences |
| `program_history_summary` | Prior program outcome summaries |
| `cross_application_context` | Blocked until Phase 13 |

### Consent statuses
- `not_requested` — default for all types
- `granted` — user has opted in
- `denied` — user has explicitly declined
- `revoked` — user previously granted but revoked

### Rules
- Cross-application context defaults to `not_requested` and may not be granted via any current endpoint
- Users may only change their own consent
- Revocation immediately stops future context retrieval
- Memory deletion from Kevin's store is not guaranteed until a deletion endpoint is verified — users are informed of this limitation

---

## Data Classifications

| Classification | Examples | Kevin access |
|---|---|---|
| Public | Goal category, training style | ✓ Summarized |
| Operational | Session duration, exercise count | ✓ Categorized |
| Personal | Name, email, phone, address | ✗ Never |
| Sensitive training data | Equipment constraints, schedule patterns | ✓ Categorical only |
| Health-related | Injury history, pain notes, medical conditions, medications, pregnancy status | ✗ Never raw — categorical constraint only if authorized |
| Credential | Passwords, API keys, tokens | ✗ Never |
| Secret | STRIPE_*, OPENAI_*, Kevin keys | ✗ Never |

**Allowed to Kevin:**
> "User has a lower-body movement restriction."

**Not allowed to Kevin:**
> "John Smith tore his right ACL on March 4 and had surgery at..."

---

## Event Schema

Events are enqueued to `kevin_app_events` and dispatched by the worker.

### Event types
- `trainchat.user.onboarded`
- `trainchat.program.generated`
- `trainchat.program.edited`
- `trainchat.session.generated`
- `trainchat.session.regenerated`
- `trainchat.exercise.substituted`
- `trainchat.feedback.submitted`
- `trainchat.session.completed`
- `trainchat.program.completed`
- `trainchat.program.abandoned`
- `trainchat.external_api.generated`
- `trainchat.external_api.edited`

### Payload example
```json
{
  "goal_category": "strength",
  "session_duration_minutes": 45,
  "exercise_count": 7,
  "movement_categories": ["squat", "push", "pull"],
  "generation_source": "authenticated_app",
  "kevin_context_used": true
}
```

### Forbidden payload fields
`email`, `name`, `phone`, `address`, `dob`, `password`, `api_key`, `token`, `secret`, `health_condition`, `injury`, `pain`, `diagnosis`, `medication`, `pregnancy`, `guardian`, `full_program`, `exercise_prescriptions`

---

## Retry Strategy

| Attempt | Delay |
|---|---|
| 1 | 30 seconds |
| 2 | 2 minutes |
| 3 | 8 minutes |
| 4 | 30 minutes |
| 5 | 2 hours → dead-letter |

Dead-lettered events are preserved and visible at `/admin/kevin/events`. They do not affect the original workout workflow.

---

## Circuit Breaker

| Parameter | Value |
|---|---|
| Failure threshold | 5 failures |
| Rolling window | 60 seconds |
| Open duration | 60 seconds |
| Half-open probe | 1 concurrent probe |

Circuit state is exposed at `/admin/kevin/status`. When open:
- Workout generation continues without Kevin context
- Editing continues
- External API requests continue
- Kevin events remain queued
- Users receive no blocking error
- An operational warning is logged

Local validation failures (`KEVIN_DISABLED`, `KEVIN_NOT_CONFIGURED`) do **not** trip the circuit breaker.

---

## Signal Intake

Kevin can push operational signals to TrainChat via:

```
POST /api/internal/kevin/signals
Authorization: Bearer <KEVIN_INTERNAL_SERVICE_TOKEN>
```

**Requires:**
- `KEVIN_INTEGRATION_ENABLED=true`
- `KEVIN_SIGNAL_INTAKE_ENABLED=true`
- Valid `KEVIN_INTERNAL_SERVICE_TOKEN` (timing-safe comparison)

**Signals are evidence, not commands.** Kevin cannot directly change workouts, billing, consents, or user data through signals.

### Signal routing
| Type | Routed to |
|---|---|
| Preference/adherence patterns | `product_intelligence` |
| Quality concerns | `internal_review_queue` |
| Generation/API failure patterns | `engineering_ops` |
| Support signals | `support_queue` |
| Environment/architecture changes | `admin_visibility` |
| Memory conflicts | `memory_review_queue` |

### Recursion prevention
- Signals with `depth > 3` are rejected with 422
- Signals with a known `external_signal_id` are deduplicated (200, not 201)

---

## Recursion Prevention

All Kevin objects carry:
- `trace_id` — propagated across context, events, outcomes, and signals
- `origin` — explicit allowlist: `trainchat_user`, `trainchat_generation`, `trainchat_edit`, `trainchat_feedback`, `trainchat_external_api`, `kevin_context`, `kevin_signal`, `human_admin`
- `depth` — incremented on each handoff; blocked at > 3
- `parent_id` — links to the originating object

---

## External API Considerations

TrainChat's External API (`/api/external/*`) does **not** inherit Kevin memory behavior.

Default external API behavior:
- Kevin context: **disabled**
- Cross-application memory: **disabled**
- Event summaries: **disabled** unless explicitly configured per partner

Partners requiring Kevin enrichment must:
1. Have an explicit application capability setting
2. Provide an approved tenant identity
3. Provide a pseudonymous end-user identifier
4. Accept data-processing terms
5. Use a scoped capability

External API response contracts are unchanged.

---

## Context Hierarchy

TrainChat applies context in this strict order (highest → lowest priority):

1. Current authenticated user request
2. Current program and session constraints
3. Current safety rules
4. Current equipment and scheduling constraints
5. Explicit user preferences stored in TrainChat
6. **Optional Kevin memories** (this integration layer)
7. General defaults

Kevin memory **never** overrides items 1–5.

---

## Prompt Injection Protection

### User content
- All existing request schemas validated
- Current length limits preserved
- Null bytes and control characters normalized
- User content delimited from system-owned instructions
- Role injection prevented

### Kevin response
- Only validated structured JSON accepted
- Unknown fields ignored
- Arbitrary tool names, routes, SQL, shell commands, executable code rejected
- Arbitrary exercise identifiers rejected (must resolve through canonical exercise data)
- Cross-org identifiers rejected
- Raw secrets rejected
- Response size capped at `KEVIN_MAX_CONTEXT_RESPONSE_BYTES` (default 16KB)

Kevin context is **data**, not system policy.

---

## Cross-Application Identity (Phase 13 — Not Yet Active)

The `kevin_identity_links` table exists but no activation endpoints are implemented. Cross-application memory requires:

1. Explicit consent (`kevin_memory_consents.cross_application_context = granted`)
2. An approved identity-link record
3. Matching ownership or organizational authority
4. Application-scoped access rules
5. Revocation support
6. Audit history

**Users must never be linked solely because their email addresses match.**

---

## Admin Diagnostics

Available to admin users at:

| Endpoint | Description |
|---|---|
| `GET /api/admin/kevin/status` | Integration health, circuit state, feature flags |
| `GET /api/admin/kevin/events` | Queue statistics, dead-lettered events |
| `GET /api/admin/kevin/signals` | Recent inbound signals |
| `GET /api/admin/kevin/capabilities` | Capability mode settings |
| `GET /api/admin/kevin/context-requests` | Recent context request audit |

No secrets are displayed in any response.

---

## Files Created

| File | Purpose |
|---|---|
| `lib/db/src/schema/kevin.ts` | All Kevin DB table definitions |
| `lib/db/manual-migrations/0004_kevin_integration.sql` | Additive migration SQL |
| `artifacts/api-server/src/lib/kevin-config.ts` | Env var validation + config singleton |
| `artifacts/api-server/src/lib/kevin-pseudonym.ts` | HMAC pseudonymous ID derivation |
| `artifacts/api-server/src/lib/kevin-circuit-breaker.ts` | Process-local circuit breaker |
| `artifacts/api-server/src/lib/kevin-client.ts` | Typed HTTP client for Hermes |
| `artifacts/api-server/src/lib/kevin-consent-service.ts` | Memory consent CRUD |
| `artifacts/api-server/src/lib/kevin-capability-service.ts` | Capability mode resolution + seeding |
| `artifacts/api-server/src/lib/kevin-navigation-registry.ts` | Allowlisted navigation routes |
| `artifacts/api-server/src/services/kevin-context-service.ts` | Context orchestration + prompt fragment builder |
| `artifacts/api-server/src/services/kevin-event-service.ts` | Durable event queue + worker |
| `artifacts/api-server/src/services/kevin-outcome-service.ts` | Training outcome recording + forwarding |
| `artifacts/api-server/src/routes/kevin-internal.ts` | Signal intake endpoint |
| `artifacts/api-server/src/routes/kevin-admin.ts` | Admin diagnostics endpoints |
| `artifacts/api-server/src/routes/kevin-memory.ts` | User memory settings endpoints |

## Files Modified

| File | Change |
|---|---|
| `lib/db/src/schema/index.ts` | Exports Kevin schema |
| `artifacts/api-server/src/index.ts` | Startup: seed capabilities, start worker, graceful shutdown |
| `artifacts/api-server/src/routes/index.ts` | Registers Kevin routes |
| `artifacts/api-server/src/routes/session-feedback.ts` | Hooks Kevin event + outcome on feedback submit |

---

## Applying the Migration

```bash
# Development / first-time setup
psql $DATABASE_URL -f lib/db/manual-migrations/0004_kevin_integration.sql

# Verify tables created
psql $DATABASE_URL -c "\dt kevin_*"
```

The migration is idempotent — safe to re-run.

---

## Rollback

To disable Kevin entirely:
```
KEVIN_INTEGRATION_ENABLED=false
```
No Kevin network calls will occur. Events already queued will remain in the DB but will not be dispatched.

To remove Kevin tables (destructive — lose all event/consent history):
```sql
DROP TABLE IF EXISTS kevin_identity_links CASCADE;
DROP TABLE IF EXISTS kevin_memory_consents CASCADE;
DROP TABLE IF EXISTS kevin_app_signals CASCADE;
DROP TABLE IF EXISTS kevin_training_outcomes CASCADE;
DROP TABLE IF EXISTS kevin_context_requests CASCADE;
DROP TABLE IF EXISTS kevin_app_events CASCADE;
DROP TABLE IF EXISTS kevin_app_capabilities CASCADE;
```

---

## Known Limitations

1. **All Kevin/Hermes endpoints are PENDING** — no live Hermes instance exists yet. All methods return `KEVIN_NOT_CONFIGURED` or `KEVIN_DISABLED` until `KEVIN_HERMES_BASE_URL` is set.
2. **Kevin context not yet wired into generation prompts** — the context service and prompt fragment builder are implemented; integration into the AI system prompt is a follow-up hook once Hermes is available.
3. **Cross-application context blocked** — Phase 13 identity linking is not implemented.
4. **Kevin memory deletion not guaranteed** — revoking consent stops future use but does not delete from Kevin's memory store until a confirmed deletion endpoint exists.
5. **Outcome retry worker not yet implemented** — outcomes that fail forwarding are marked `failed` but a retry loop (separate from the event worker) is a follow-up task.

---

## Verification Commands

```bash
# TypeScript typecheck
pnpm run typecheck

# Check Kevin tables in DB (after migration)
psql $DATABASE_URL -c "\dt kevin_*"

# Verify Kevin integration is disabled by default
KEVIN_INTEGRATION_ENABLED= node -e "require('./artifacts/api-server/src/lib/kevin-config').getKevinConfig()"

# Verify no Kevin secrets in client bundle
grep -r "KEVIN_HERMES_API_KEY\|KEVIN_INTERNAL_SERVICE_TOKEN\|KEVIN_PSEUDONYM_SALT" artifacts/trainchat/src/ || echo "No secrets in client bundle"
```
