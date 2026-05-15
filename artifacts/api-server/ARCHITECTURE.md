# TrainChat API Server — Architecture Reference

## Overview

TrainChat is an agent-first AI training platform. The API server runs a three-agent architecture with a deterministic pre-classification layer, a unified validation gate, and a rule-driven execution engine for safe program mutation.

---

## Agent vs Engine Distinction

| Component | Type | Description |
|---|---|---|
| Coach Atlas | **Agent** | User-facing LLM. Handles conversation, coaching, clarification. |
| Performance Architect (Vale) | **Agent** | LLM responsible for program design (BUILD_WITH_ARCHITECT path). |
| Research Librarian (Dr. Sable) | **Agent** | LLM responsible for evaluating research documents (admin-only). |
| Execution Planner | **Engine** | Deterministic intent classifier + plan builder. Calls LLM only when ambiguous. |
| Periodization Engine | **Engine** | Block periodization model — accumulation, intensification, realization, deload. |
| Progression Intelligence Engine | **Engine** | Determines per-exercise progression model (load, reps, wave, double-progression, etc.). |
| Behavioral Intelligence Engine | **Engine** | Detects fatigue, enthusiasm, hesitancy signals from conversation history. |
| Architecture Validation Engine | **Engine** | Structural + quality gate. Runs post-generation; safety violations are blocking. |
| Conversation Context Resolver | **Engine** | In-memory deictic reference tracker. Resolves "that exercise", "Day 2", "undo". |
| Fail-Safe Edit Lock | **Engine** | Per-user/focus-mode mutex. Prevents concurrent program mutations. |

---

## Request Flow (Program Mutation)

```
User Message
    │
    ▼
┌─────────────────────────────────┐
│  STEP 0 — Button Signal Override │  (sidebar button → forced APPLY_MUTATION)
└─────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  STEP 0.25 — Deterministic Pre-      │  (≤8-word clear commands → skip LLM)
│  Classifier                          │  "make it harder", "deload", "more volume"
└──────────────────────────────────────┘
    │ (no match → LLM)
    ▼
┌─────────────────────────────────────┐
│  STEP 0.5 — LLM Intent Interpreter  │  (OpenAI: classify intent, extract scope)
└─────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  STEP 1–3 — Deterministic Overrides  │  (pending clarification, low-detail,
│  (post-LLM)                          │   directional inference, vague-guard)
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  Execution Engine                    │  (routes to: APPLY_MUTATION, BUILD_PROGRAM,
│                                      │   ASK_CLARIFICATION, etc.)
└──────────────────────────────────────┘
    │ (if program generation)
    ▼
┌──────────────────────────────────────┐
│  Architecture Validation Engine      │  (structural checks + CEO quality checks)
│  (unified gate, post-generation)     │  Safety violations → BLOCKING
│                                      │  Day count mismatch → warning
└──────────────────────────────────────┘
    │
    ▼
  SSE stream → client
```

---

## Architecture Validation Gate

The unified gate (`validateArchitectureGate`) runs two check families:

### Structural Checks (always run on build intents)
| Check | Severity |
|---|---|
| Empty program (no days) | **Critical / Blocking** |
| Empty day (day with no exercises) | **Critical / Blocking** |
| Day count mismatch | Critical (logged, non-blocking) |
| Missing exercises (<4 per day) | Warning |
| No trunk/core work detected | Info |
| No unilateral work (strength only) | Info |
| Focus bleed (speed with strength names) | Info |

### CEO Quality Checks (run when coachContext is provided)
| Check | Severity |
|---|---|
| Safety violation (pain/injury contraindication) | **Critical / Blocking** |
| Goal misalignment | Warning |
| Structural quality concerns | Info |

---

## Conversation Context Resolver

In-memory, DB-free layer. Tracks deictic references across turns and rewrites them before the execution planner runs.

| Reference Type | Turn Limit | Time Limit |
|---|---|---|
| ExerciseReference | 2 turns | 5 minutes |
| SessionReference | 2 turns | 5 minutes |
| MutationReference | 30 turns | 30 minutes |

MutationReference has a much longer window so "undo" and "redo" feel like document editor operations, not timed API calls.

---

## Edit Lock

The fail-safe edit lock (`acquireFailSafeEditLock`) is a per-user/focus-mode in-memory mutex with a 20-second TTL. It prevents concurrent program mutations from the same user.

Key format: `chat:{userId}:{focusMode}` (conversation SSE path)  
Key format: `route:{userId}:{focusMode}` (training-system-edit.ts path)

Lock status is exposed via:
```
GET /api/training-system/edit-lock-status?focusMode=strength&source=chat
```

---

## Intelligence Status

Programs now carry an `intelligenceStatus` field that surfaces active engine signals to the Live Program Panel:

```typescript
intelligenceStatus?: {
  periodizationPhase?: string;   // e.g. "Accumulation", "Intensification"
  progressionModel?: string;     // e.g. "Double Progression", "Wave Loading"
  adaptationDirective?: string;  // e.g. "Fatigue protection active"
  recoveryStatus?: string;       // e.g. "Recovery protection active"
  behavioralSignals?: Array<{ type: string; label: string }>;
}
```

Displayed as compact badges in the Program tab header of the Live Program Panel.

---

## Key Files

| File | Role |
|---|---|
| `src/lib/execution-planner.ts` | Intent classification + plan building |
| `src/agents/agent-orchestrator.ts` | Agent handoff contracts + architecture validation gate |
| `src/agents/ceo-heartbeat.ts` | CEO quality checks (deterministic, 9 rules) |
| `src/lib/ai.ts` | Core AI response pipeline (7000+ lines) |
| `src/lib/conversation-context-resolver.ts` | Deictic reference resolution |
| `src/lib/fail-safe.ts` | Edit lock + fail-safe prompt section |
| `src/lib/training-intelligence.ts` | Training spec computation + AI context building |
| `src/lib/progression.ts` | Auto-progression engine (log-driven) |
| `src/lib/periodization-engine.ts` | Block periodization model |
| `src/lib/mutation-ontology.ts` | Mutation type registry + intent → mutation mapping |
| `src/routes/conversations.ts` | SSE conversation handler (main mutation path) |
| `src/routes/training-system-edit.ts` | Right-panel mutation handler (non-chat path) |
| `src/routes/training-system.ts` | Training system CRUD + edit lock status |
