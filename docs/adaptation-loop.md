---
title: Adaptation Loop — Readiness, Feedback, Performance Signals & System Adjustments
doc_type: implementation
subsystem: adaptation-loop
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/api-server/src/lib/adaptation.ts
  - artifacts/api-server/src/lib/check-in-adaptation.ts
  - artifacts/api-server/src/lib/performance-adaptation-service.ts
  - artifacts/api-server/src/lib/session-log-adaptation-analyzer.ts
  - artifacts/api-server/src/lib/system-adjustment-service.ts
  - artifacts/api-server/src/lib/next-session-intelligence.ts
  - artifacts/api-server/src/lib/block-projection.ts
  - artifacts/api-server/src/routes/readiness.ts
  - artifacts/api-server/src/routes/session-logs.ts
  - artifacts/api-server/src/routes/session-feedback.ts
  - artifacts/api-server/src/routes/system-adjustments.ts
related_architecture:
  - "CLAUDE.md §7 (adaptation loop: readiness/feedback → adaptation services → system-adjustment events)"
related_implementation:
  - "docs/memory.md (buildAdaptationContext composes memory dominance + performance signals; plan-gated)"
  - "docs/mutation-pipeline.md (adaptations write system_change_log via createChangeLogEntry)"
  - "docs/db-schema.md (readiness_entries, session_logs, system_adjustment_events, exercise_logs)"
  - "docs/exercise-programming.md (block projection / continuation overlaps periodization)"
  - "docs/ai-agents.md (adaptation context is a Coach-prompt layer; deterministic eval)"

last_generated: 2026-06-29
last_verified: 2026-06-29
verified_by: claude (Version 2, Wave 3 doc #9)
verified_commit: 78ee536
verification_method: >
  Read headers + exported signatures of adaptation.ts, check-in-adaptation.ts,
  performance-adaptation-service.ts, session-log-adaptation-analyzer.ts, system-adjustment-service.ts;
  read the readiness route apply paths and the session-logs adaptation region. Verified wiring with
  grep: context builders' consumers (buildAdaptationContext → conversations/insights/edit/directions;
  buildSessionLogContext → conversations; buildPerformanceAdaptationContext → adaptation.ts —
  WIRED, correcting an earlier mis-grep); check-in apply gating (evaluate vs apply-adjustment);
  session-logs auto-apply calls (applyNextSessionAdjustment, applyBlockProjectionToFutureWeeks,
  continuation generation, auto_progression); createAdjustmentEvent callers. NOT done: full read of
  the rule engines + analyzers; no runtime execution. Such claims are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0032, summary: "Split adaptation-application model: readiness check-ins are user-confirmed (evaluate → apply-adjustment), but session logging AUTO-applies next-session adjustments, block projections, and continuation-phase generation without confirmation; CLAUDE.md §7 does not distinguish", kind: doc-vs-code, severity: medium, status: open }
  - { id: DR-0033, summary: "Adaptation loop includes modules beyond CLAUDE.md §7's three named services: next-session-intelligence, block-projection, block-intelligence, and proactive insights (source proactive_agent/auto_adjust)", kind: doc-vs-code, severity: low, status: open }
  - { id: DR-0034, summary: "Auto-applied session-log adaptations write system_change_log but are not among createAdjustmentEvent callers — they may not surface in the user-visible system_adjustment_events feed (fed by check-ins + edits)", kind: code-vs-architecture, severity: low, status: open }
---

# Adaptation Loop — Readiness, Feedback, Performance Signals & System Adjustments

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Reconciled against the adaptation modules + routes. **Code wins** on disagreement. Rule-engine and
> analyzer bodies were read at header/signature level, not in full; runtime claims are **(UNVERIFIED)**.

## 1. Purpose & scope

How TrainChat closes the loop **prescribed → logged/felt → future programming**: it ingests daily
readiness, post-session feedback, and actual performance, turns them into adaptation signals/context,
and either suggests (check-ins) or applies (session logs) forward adjustments — surfacing high-signal
ones as user-visible events. Implements the adaptation parts of `CLAUDE.md §7`.

## 2. Source map

| File | Wired? | Responsibility |
|---|---|---|
| `lib/adaptation.ts` (392) | ✅ | `buildAdaptationContext` — composes "how the athlete **feels**" (readiness/check-in trends) + **memory dominance** (`resolveMemoryConstraints`) + "what they **did**" (`buildPerformanceAdaptationContext`) into one context block. |
| `lib/check-in-adaptation.ts` (585) | ✅ (readiness route) | Deterministic readiness rules: `computeReadinessScore`, `determineAdaptationMode`, `buildEditPlanForMode`, `evaluateCheckIn` (**no apply**), `applyCheckInAdjustment` (**user-confirmed apply**). |
| `lib/performance-adaptation-service.ts` (618) | ✅ (via adaptation.ts) | `buildPerformanceAdaptationContext` — movement/session signals from `exercise_logs`/`session_logs`. |
| `lib/session-log-adaptation-analyzer.ts` (335) | ✅ (session-logs route) | `analyzeSessionLogAdaptation`, `buildSessionLogContext` — scope rules (pain → adjust similar; repeated fatigue → reduce; repeated easy → progress). |
| `lib/system-adjustment-service.ts` (372) | ✅ | `createAdjustmentEvent`/`getAdjustmentEvents` → the **visible** `system_adjustment_events`. |
| `lib/next-session-intelligence.ts`, `lib/block-projection.ts` | ✅ (session-logs) | `applyNextSessionAdjustment`, `applyBlockProjectionToFutureWeeks` — **auto-applied** forward adaptation (DR-0033). |

## 3. The two adaptation paths (headline: split apply model)

### 3.1 Readiness check-ins — **user-confirmed** (no auto-apply)
`POST /api/readiness` saves the entry and calls `evaluateCheckIn` — which **does not apply any plan
changes** (route comment: "Evaluate readiness — does NOT apply any plan changes"). It returns a
proposed adaptation (mode + change details). The change is applied only when the user calls
`POST /api/readiness/apply-adjustment` → `applyCheckInAdjustment`, which writes the edit and a
`createChangeLogEntry` (label `source: "auto_adjust"`, though the *trigger* is user-confirmed) and a
visible `createAdjustmentEvent`. Matches the engine's own "WITHOUT auto-applying" header.

### 3.2 Session logging — **auto-applied** forward adaptation
`POST /api/session-logs` runs `analyzeSessionLogAdaptation`, then **automatically**:
`applyNextSessionAdjustment(userId)` (fire-and-forget), `applyBlockProjectionToFutureWeeks(userId,
projection)`, and auto-generates a continuation phase when a block completes — with change intents
`auto_progression` / `load_reduction`. These apply **without user confirmation**.

So the system has **two different application models** for adaptation: check-ins require confirmation;
session completion auto-progresses/reduces and projects blocks forward. `CLAUDE.md §7` ("continuously
refined through dialogue and check-ins") does not distinguish the two. (DR-0032.)

## 4. Context injection (the "feel + did" half)

`buildAdaptationContext(userId, focusMode)` (adaptation.ts) composes three sub-signals:
1. **Readiness/feel trends** (`computeReadinessTrendDirection`, `TrendSignals`).
2. **Memory dominance** — `resolveMemoryConstraints` (the governing override; `memory.md §4`).
3. **Performance** — `buildPerformanceAdaptationContext` (actual logged loads/reps from
   `exercise_logs`/`session_logs`). *(Correction: this builder IS wired — consumed by adaptation.ts;
   an earlier grep excluded it in error.)*

It is consumed by `conversations.ts`, `insights.ts`, `training-system-edit.ts`,
`training-system-directions.ts`, and is **plan-gated** by `adaptationContext` (`memory.md §3/DR-0026`).
`buildSessionLogContext` (analyzer) is separately injected into `conversations.ts`.

## 5. Visible system-adjustment events

`createAdjustmentEvent` writes the user-facing `system_adjustment_events` (title/summary/scope/
priority/isNew). **Callers:** `routes/training-system-edit.ts`, `lib/check-in-adaptation.ts`,
`routes/system-adjustments.ts`. Notably **session-logs is not a caller** — so the auto-applied
session adaptations (§3.2) write to `system_change_log` (audit) but may **not** surface in the visible
adjustments feed that check-in/edit adaptations populate. (DR-0034 — caller-census based; the exact
visible-feed contents were not runtime-verified.)

## 6. Broader adaptation surface (beyond §7's three services)

The loop is wider than CLAUDE.md §7's named trio (check-in / performance / session-log). Also present:
`next-session-intelligence` (`applyNextSessionAdjustment`), `block-projection`
(`applyBlockProjectionToFutureWeeks`), `block-intelligence.ts` (change `source: "auto_adjust"`), and
`insights.ts` (change `source: "proactive_agent"`). These add automatic/proactive adaptation paths
not reflected in §7. (DR-0033.)

## 7. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0032 | Split apply model: check-ins user-confirmed; session logs auto-apply (next-session/block-projection/continuation). | doc-vs-code | medium |
| DR-0033 | Adaptation loop includes next-session-intelligence, block-projection, block-intelligence, proactive insights beyond §7's three services. | doc-vs-code | low |
| DR-0034 | Auto session adaptations write system_change_log but may not surface in the visible system_adjustment_events feed. | code-vs-architecture | low |

No new `high`-severity items.

## 8. Cross-references to prior implementation docs

- **`memory.md`:** `buildAdaptationContext` composes memory dominance + performance signals; injection
  is plan-gated (`adaptationContext`).
- **`mutation-pipeline.md`:** all adaptations (confirmed or auto) write `system_change_log` via
  `createChangeLogEntry` — the universal audit layer; the no-transaction caveat (DR-0006) applies.
- **`db-schema.md`:** sources are `readiness_entries`/`session_feedback`/`session_logs`/`exercise_logs`;
  outputs are `system_change_log` + `system_adjustment_events`; the soft references in `session_logs`
  are read here.
- **`exercise-programming.md`:** block-projection / continuation-phase generation overlaps the
  periodization engine (auto-generating future blocks).
- **`ai-agents.md`:** adaptation context is a Coach-prompt layer; check-in evaluation is deterministic,
  like the Architect.

## 9. Recommended CLAUDE.md updates

Proposals only (governance §2/§7):
1. **§7** — Distinguish the **two apply models**: readiness check-ins are **user-confirmed**; session
   logging **auto-applies** next-session/block-projection/continuation adaptations. (DR-0032.)
2. **§7** — Expand the adaptation-loop module list to include next-session-intelligence,
   block-projection, block-intelligence, and proactive insights. (DR-0033.)
3. **§7** — Clarify which adaptations surface as visible `system_adjustment_events` vs which are
   audit-only (`system_change_log`). (DR-0034.)

The loop design (deterministic eval, feel+did+memory context, scope-aware adjustment) is sound; the
gaps are the undocumented auto-apply path and the broader module set.

## 10. Files reviewed

Headers/signatures: `adaptation.ts`, `check-in-adaptation.ts`, `performance-adaptation-service.ts`,
`session-log-adaptation-analyzer.ts`, `system-adjustment-service.ts`. Routes: `readiness.ts`
(apply paths), `session-logs.ts` (adaptation region). Wiring greps for all context builders,
apply functions, and `createAdjustmentEvent` callers across `artifacts/api-server/src`.

## 11. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Check-in user-confirmed path | **High** | Route comments + evaluate/apply split read. |
| Session-log auto-apply path (DR-0032) | **High** | applyNextSessionAdjustment/blockProjection/continuation call sites. |
| buildAdaptationContext composition (feel+memory+performance) | **High** | Exports + consumer grep (corrected). |
| Visible-event callers (DR-0034) | **Medium-High** | Caller census; visible-feed contents not runtime-verified. |
| Broader module set (DR-0033) | **High** | source-tag + import grep. |
| Rule-engine / analyzer internals | **Medium** | Headers/signatures, not full bodies. |
| **Runtime behavior** | **UNVERIFIED** | No execution. |

Overall: **high confidence in the loop structure, wiring, and the split apply-model finding.** Open
gaps (full rule-engine read; runtime; exact visible-feed contents) keep this at **L3**.

## 12. Verification record

- Verified at commit `78ee536` (current date 2026-06-29).
- Independent checks: `buildPerformanceAdaptationContext` consumer = adaptation.ts (wired);
  readiness apply only via `/apply-adjustment`; session-logs calls `applyNextSessionAdjustment` +
  `applyBlockProjectionToFutureWeeks` + continuation; `createAdjustmentEvent` callers = edit /
  check-in / system-adjustments (not session-logs); auto/proactive sources in block-intelligence +
  insights.
- Not run (documented gaps): full rule-engine/analyzer read; runtime; visible-feed verification.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
