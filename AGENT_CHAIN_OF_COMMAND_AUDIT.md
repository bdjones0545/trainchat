# TrainChat — Agent Chain of Command Audit

**Date:** 2026-05-02
**Scope:** Three-agent architecture — Coach Agent, Performance Architect, Research Librarian
**Type:** Audit + integration hardening (no new features, no UX changes)

---

## 1. Agent Roles

| Agent | Internal Persona | Type | File | Responsibility |
|---|---|---|---|---|
| **Coach Agent** | Coach Atlas | AI (OpenAI, assembled system prompt) | `src/lib/ai.ts` | Only user-facing agent. Owns conversation, intent, constraints, final response. Applies CEO Heartbeat. |
| **Performance Architect** | Architect Vale | Deterministic (no LLM call) | `src/lib/program-architecture-engine.ts` | Internal programming architect. Owns CNS-driven structure, sequencing, periodization, split selection. Called only on build paths. |
| **Research Librarian** | Dr. Sable | AI (OpenAI, separate system prompt) | `src/research/research-librarian-agent.ts` | Admin-only evidence curator. Owns research ingestion, quality-gating, chunking. Never runs during user chat. |

---

## 2. Authority Hierarchy

Priority order (1 = highest, never overridden):

1. **SAFETY** — Injury, pain, joint integrity constraints. No agent may produce output that violates these.
2. **MOVEMENT_QUALITY** — Degraded mechanics override load and volume targets.
3. **GOAL_OUTPUT** — Program must serve the stated sport/goal.
4. **FATIGUE_MANAGEMENT** — Recovery capacity constrains all programming decisions.
5. **USER_PREFERENCE** — Honored within the bounds of all higher rules.

Defined in: `src/agents/agent-orchestrator.ts → CONFLICT_RESOLUTION_HIERARCHY`

Confirmed invariants:
- Research never overrides safety (ai.ts L340, L398: "Research guidance is directional, not rigid… does not override user safety constraints")
- Architect never violates user constraints (hardConstraints passed to buildArchitectureBrief, validated by validateArchitectureGate)
- Coach can reject/repair Architect output (CEO Heartbeat runs after brief injection, flags safety + structural issues)
- Librarian never influences live chat (assertLibrarianIsAdminOnly guard, LIBRARIAN_ADMIN route only)
- User experiences one unified TrainChat coach (persona names suppressed in production; only "TrainChat" surfaces to user)

---

## 3. Interaction Flow Diagrams

### A. New Program Build
```
User message
  → Coach Agent (intent extraction, constraint parsing)
  → Research Retriever (approved chunks from research_chunks table)
  → Research Programming Guidance (buildResearchProgrammingGuidance — directional only)
  → Performance Architect (buildArchitectureBrief — deterministic CNS brief)
  → [logArchitectHandoff emitted]
  → Coach Agent (generateAIResponse with brief injected into system prompt)
  → CEO Heartbeat (runCEOHeartbeatCheck — 9 coaching-standard checks)
  → Architecture Validation Gate (validateArchitectureGate — structural integrity)
  → [logValidationGateResult emitted]
  → Coach response returned to user
```

### B. Simple Exercise Edit (Button or Text)
```
User message / button signal
  → ExecutionPlanner (APPLY_MUTATION route — Architect skipped)
  → Edit Engine (interpretEditRequest + applyEditPlan)
  → Mutation Verifier
  → Coach confirmation response to user
```

### C. Whole-Program Restructure
```
User message
  → ExecutionPlanner (REBUILD_PROGRAM route)
  → [Same as Flow A from Performance Architect onward]
```

### D. Research Admin Action
```
Admin request (routes/admin.ts only)
  → assertLibrarianIsAdminOnly guard
  → Research Librarian (analyzeResearchDocument / reviewResearchCandidate)
  → research_documents / research_chunks tables
  → Admin approval decision
  → Approved chunks become available to research_retriever only
```

### E. Evidence Question (Why Is This Evidence-Based?)
```
User message
  → ExecutionPlanner (GUIDANCE route)
  → Coach Agent only
  → getRelevantResearchContextWithChunks (approved chunks only)
  → Coach explains in plain coaching language
  → No internal agent names exposed
```

---

## 4. Routing Matrix

| Trigger | execPlan.action | OrchestratorRoute | Agents Called | Architect? | Librarian? |
|---|---|---|---|---|---|
| New build / explicit rebuild | REBUILD_PROGRAM | BUILD_WITH_ARCHITECT | coach, performance_architect | ✅ Yes | ❌ No |
| Simple exercise edit | APPLY_MUTATION | DIRECT_EDIT | coach | ❌ No | ❌ No |
| Clarification followup | ASK_CLARIFICATION | DIRECT_EDIT | coach | ❌ No | ❌ No |
| Coaching question | GUIDANCE | GUIDANCE | coach | ❌ No | ❌ No |
| Retrieve current program | — | RETRIEVE | none (no AI call) | ❌ No | ❌ No |
| Research admin | isAdminRequest=true | LIBRARIAN_ADMIN | research_librarian | ❌ No | ✅ Yes |
| Error / paywall | NO_OP | NO_OP | none | ❌ No | ❌ No |

Routing source of truth: `src/agents/agent-orchestrator.ts → resolveOrchestratorRoute()`
Routing entry point: `src/lib/execution-planner.ts → buildExecutionPlan()`

---

## 5. Handoff Contracts

### Coach → Performance Architect (`CoachToArchitectHandoff`)
| Field | Required | Default |
|---|---|---|
| daysPerWeek | Yes | null (uses profile fallback) |
| sport | Yes | null |
| goal | Yes | null |
| userMessage | Yes | "" |
| focusMode | Yes | "strength" |
| variationSeed | Yes | random float |
| hardConstraints | Yes | null (no constraints) |

### Performance Architect → Coach Agent (`ArchitectToCoachHandoff`)
| Field | Required | Default |
|---|---|---|
| architectureBriefText | Yes | null (fallback: no brief injected) |
| lockedExerciseSelections | Yes | null |
| weeklyArchitecture | Yes | null |
| briefSource | Yes | "none" |
| sessionCount | Yes | 0 |
| briefGenerated | Yes | false |
| briefError | Yes | null |

### Research Librarian → Research Database (`LibrarianToResearchDatabaseHandoff`)
| Field | Required | Notes |
|---|---|---|
| documentId | Yes | — |
| candidateTitle | Yes | — |
| candidateCategory | Yes | — |
| librarianResult | Yes | recommendation, confidence, evidenceType, trustLevel, chunks, warningFlags |
| triggeredBy | Yes | Always `"admin"` — invariant enforced by type system |
| handoffAt | Yes | ISO timestamp |

All contracts are fully typed in `src/agents/agent-orchestrator.ts`.

---

## 6. Conflict Resolution Rules

| Conflict | Resolution | Governed By |
|---|---|---|
| Architect output conflicts with safety | CEO Heartbeat flags → override recommended | ceo-heartbeat.ts checkSafety |
| Architect output conflicts with equipment | validateArchitectureGate flags critical issue | agent-orchestrator.ts validateArchitectureGate |
| Research conflicts with user context | User context wins; research is "directional, not rigid" | ai.ts L340, L398 |
| Coach response conflicts with structured program | Structured program wins; Coach rephrases only | generateAIResponse: structured output takes precedence |
| Button payload conflicts with parsed text | Button payload wins (Step 0 in execution planner — highest override) | execution-planner.ts L128 |
| Research confidence is low/conflicting | Conservative programming wins; research not applied | research-programming-guidance.ts confidence checks |

---

## 7. Observability (AgentChain Log)

Every turn emits a structured `[AgentOrchestrator]` log event via `logOrchestratorDecision()`.

Fields emitted per turn:
- `route` — OrchestratorRoute (BUILD_WITH_ARCHITECT, DIRECT_EDIT, GUIDANCE, etc.)
- `participatingAgents` — which agents were called
- `focusMode` — strength / speed / mobility
- `intentType` — classified intent
- `execPlanAction` — execution planner action
- `isBuildPath` — whether Architect was used
- `architectUsed` — boolean
- `librarianUsed` — boolean (always false on user turns)
- `conflictRulesApplied` — which priority rules were active
- `validationResult` — architecture gate result (on build paths)

Build-path turns additionally emit:
- `[AgentOrchestrator] Architect → Coach handoff` via `logArchitectHandoff()`
- `[AgentOrchestrator] Architecture validation gate` result via `logValidationGateResult()`

All events are tagged `[AgentOrchestrator]` for log filtering. Never exposed to users.

---

## 8. Overlap Audit

| Overlap Found | Risk Level | Recommended Fix | Status |
|---|---|---|---|
| Coach Agent system prompt injected "Architect Vale" persona name in architecture brief header text | **HIGH** — AI could echo the internal name in user responses | Replace persona label with neutral "Internal Programming Engine" | ✅ Fixed (`program-architecture-engine.ts`) |
| `orchestrate()` defined in agent-orchestrator.ts but never called from conversations.ts | **MEDIUM** — structured chain-of-command decision log was never emitted; routing decisions were unobservable | Wire `orchestrate()` + `logOrchestratorDecision()` into conversations.ts after buildExecutionPlan() | ✅ Fixed (`conversations.ts`) |
| `validateArchitectureGate()` defined in agent-orchestrator.ts but never called after program generation | **MEDIUM** — Architect's structural gate was a dead layer; CEO Heartbeat ran alone | Call `validateArchitectureGate()` + `logValidationGateResult()` in ai.ts alongside CEO Heartbeat | ✅ Fixed (`ai.ts`) |
| `logArchitectHandoff()` defined but never called after brief generation | **LOW** — Architect → Coach handoff was untracked in logs | Call `logArchitectHandoff()` in ai.ts after buildArchitectureBrief | ✅ Fixed (`ai.ts`) |
| `console.log("[CEOHeartbeat]"...)` in server code | **LOW** — Violates workspace rule (server code must use `logger`, never `console`) | Replace with `logger.debug` | ✅ Fixed (`ai.ts`) |
| Research guidance labeled "programming guidance" but passed to Coach as soft prompt context | **NONE** — System prompt explicitly labels it "directional, not rigid" (L340, L398) | No fix needed — correctly implemented | ✅ Confirmed |
| Librarian called from admin.ts only | **NONE** — Admin guard (`requireAdmin`) + `assertLibrarianIsAdminOnly()` prevents user-triggered Librarian calls | No fix needed | ✅ Confirmed |
| Architect output included in Coach's system prompt (brief injection) | **NONE** — This is the intended pattern; the brief is a structural mandate injected before the AI call, not user-facing output | No fix needed | ✅ Confirmed |

---

## 9. Files Changed

| File | Change | Reason |
|---|---|---|
| `artifacts/api-server/src/lib/program-architecture-engine.ts` | Removed "Architect Vale — Internal Performance Architect" from architecture brief header; replaced with "Internal Programming Engine" | Prevent persona name leakage into AI-generated text |
| `artifacts/api-server/src/lib/ai.ts` | Added imports for `validateArchitectureGate`, `logValidationGateResult`, `logArchitectHandoff`; wired all three into the program generation path; replaced `console.log("[CEOHeartbeat]")` with `logger.debug` | Wire up disconnected observability layers; fix server code violation |
| `artifacts/api-server/src/routes/conversations.ts` | Added import for `orchestrate`, `logOrchestratorDecision`; wired `orchestrate()` call after `buildExecutionPlan()` to emit structured chain-of-command log every turn | Connect the orchestrator's observability layer to the main request pipeline |

---

## 10. QA Test Cases

### Test 1 — New Program Build
**Input:** "Build me a 4-day football strength and speed program."
**Expected route:** `BUILD_WITH_ARCHITECT`
**Expected agents:** `["performance_architect", "coach"]`
**Expected flow:** Coach → Research Retriever → Research Guidance → Architect brief → logArchitectHandoff → Coach generates → CEO Heartbeat → Architecture Gate → logValidationGateResult → Response
**Verify:** No internal agent names in response text; program has 4 days; focus = strength or speed.

### Test 2 — Simple Button Swap
**Input:** UI button `exercise_swap` or text "swap the Romanian deadlift"
**Expected route:** `DIRECT_EDIT`
**Expected agents:** `["coach"]`
**Expected flow:** ExecutionPlanner APPLY_MUTATION → Edit Engine → Mutation Verifier → Coach confirmation
**Verify:** Architect NOT called; Librarian NOT called; one exercise changed.

### Test 3 — Whole-Program Restructure
**Input:** "Make this a 3-day program instead."
**Expected route:** `BUILD_WITH_ARCHITECT`
**Expected agents:** `["performance_architect", "coach"]`
**Expected flow:** ExecutionPlanner REBUILD_PROGRAM → Architect called
**Verify:** Program has 3 days after rebuild.

### Test 4 — Research Admin Action
**Input:** POST `/api/admin/research/documents/:id/analyze`
**Expected route:** `LIBRARIAN_ADMIN`
**Expected agents:** `["research_librarian"]`
**Expected flow:** requireAdmin guard → analyzeResearchDocument → research_documents updated → admin reviews
**Verify:** Coach NOT called; Architect NOT called; user chat agents bypassed.

### Test 5 — Safety Conflict
**Input:** "Make this harder but my knee hurts."
**Expected route:** `DIRECT_EDIT` or `GUIDANCE`
**Expected behavior:** Safety wins (rank 1). CEO Heartbeat `checkSafety` detects knee-flagged exercises. CONFLICT_RESOLUTION_HIERARCHY SAFETY > USER_PREFERENCE.
**Verify:** No high-impact knee exercises added; response acknowledges constraint.

### Test 6 — Evidence Request
**Input:** "Why is this evidence-based?"
**Expected route:** `GUIDANCE`
**Expected agents:** `["coach"]`
**Expected flow:** Coach retrieves approved research chunks; explains in plain coaching language
**Verify:** No internal names (Coach Atlas, Architect Vale, Dr. Sable) in response; no raw chunk text exposed.

### Test 7 — Retry / Clarification Replay
**Input:** Pending clarification active → user answers "Day 2"
**Expected flow:** `resolveClarification()` resolves scope → `APPLY_MUTATION` with recovered intent family → reconstructed request replayed through edit engine
**Verify:** Original intent replayed with resolved scope; no new clarification question asked.
