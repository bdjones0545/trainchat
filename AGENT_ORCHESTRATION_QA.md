# Agent Orchestration QA — TrainChat Three-Agent Architecture

**Status:** Active  
**Last Updated:** 2025-05-02  
**Scope:** Full audit of Coach Agent, Performance Architect Agent, and Research Librarian Agent — including orchestration contracts, routing rules, conflict resolution, validation gate, and observability.

---

## Phase 1 — Architecture Audit

### What Was Audited

The existing codebase was mapped to confirm actual agent boundaries before any code was written.

### Findings

#### Coach Agent
- **Lives in:** `artifacts/api-server/src/lib/ai.ts` (6837 lines)
- **Entry point:** `generateAIResponse(userMessage, history, userId, options)`
- **Responsibilities:** All user-facing conversation, program building (strength/speed/mobility), surgical edits, coaching responses, quality validation retries, variation mandate enforcement, safety filter (older adult substitution), population validation, return-from-injury validation, special considerations validation
- **What it does NOT do:** Research ingestion, research quality review, architecture brief generation (delegates to Performance Architect), research retrieval (delegates to `research-retriever.ts` which reads pre-approved docs only)

#### Performance Architect Agent
- **Lives in:** `artifacts/api-server/src/lib/program-architecture-engine.ts` (4284 lines)
- **Type:** Deterministic (no AI/LLM call) — pure function module
- **Key exports:** `buildArchitectureBrief()`, `validateProgramArchitecture()`, `computeWeeklyArchitecture()`, `enforceVariationMandateOnProgram()`, `getLastSlotSelection()`
- **Called from:** Inside `generateAIResponse()` in `ai.ts` — on build paths only (strength, speed, mobility each have their own brief builder)
- **Responsibilities:** Session identity assignment (CNS-driven), movement pattern allocation, weekly architecture computation, exercise slot selection via variation engine, variation mandate enforcement
- **What it does NOT do:** Make AI/OpenAI calls, interact with users, handle edits, manage research

#### Research Librarian Agent
- **Lives in:** `artifacts/api-server/src/research/research-librarian-agent.ts` (515 lines)
- **Type:** AI agent with dedicated system prompt (separate from Coach Agent)
- **Called from:** Admin routes only (`artifacts/api-server/src/routes/admin.ts`)
- **Responsibilities:** Research document quality evaluation, evidence type classification, trust level assignment, plain-language summary generation, coaching/programming implications extraction, retrieval chunk generation
- **What it does NOT do:** Interact with users, appear in any chat response, participate in program generation, read or write user programs, respond to user messages

#### Research Retriever (Not an Agent — Context Injector)
- **Lives in:** `artifacts/api-server/src/research/research-retriever.ts`
- **Called from:** Inside `buildSystemPrompt()` in `ai.ts`
- **Role:** Reads pre-approved research chunks from the DB and injects them as context into the Coach Agent's system prompt. Not an agent — it is a read-only context builder.

---

## Phase 2 — Orchestrator Implementation

### File Created

`artifacts/api-server/src/agents/agent-orchestrator.ts`

### What Was Implemented

1. **Typed Agent Roles** — `AgentRole` type: `"coach"`, `"performance_architect"`, `"research_librarian"`

2. **Orchestrator Routes** — `OrchestratorRoute` type:
   - `DIRECT_EDIT` — Atomic surgical edit, Coach only, Performance Architect skipped
   - `BUILD_WITH_ARCHITECT` — New build / structural rebuild, Performance Architect → Coach
   - `GUIDANCE` — Coaching/question response, Coach only
   - `RETRIEVE` — Return current program, no AI call
   - `LIBRARIAN_ADMIN` — Admin-only research, Librarian only, never user-facing
   - `NO_OP` — Error, paywall, or unroutable

3. **Conflict Resolution Hierarchy** — `CONFLICT_RESOLUTION_HIERARCHY` constant, five typed rules:
   - Rank 1: `SAFETY` — joint integrity, never program harmful movements
   - Rank 2: `MOVEMENT_QUALITY` — mechanics override load/volume
   - Rank 3: `GOAL_OUTPUT` — program must serve stated goal (sport category framework)
   - Rank 4: `FATIGUE_MANAGEMENT` — recovery capacity constrains all decisions
   - Rank 5: `USER_PREFERENCE` — honored within safety and quality bounds

4. **Typed Handoff Contracts** — three typed interfaces:
   - `CoachToArchitectHandoff` — build context sent before architect runs
   - `ArchitectToCoachHandoff` — architect brief + locked selections returned to Coach
   - `LibrarianToResearchDatabaseHandoff` — librarian evaluation result (admin-only)

5. **Architecture Validation Gate** — `validateArchitectureGate()` function:
   - Non-blocking (never throws, never silently drops a program)
   - Focus-mode-aware (speed vs strength vs mobility rules differ)
   - Critical issues: empty program, day count mismatch, empty days
   - Warning issues: missing trunk work, missing unilateral, speed/strength focus bleed

6. **Observability Logging** — four structured log functions:
   - `logOrchestratorDecision()` — routing decision event
   - `logArchitectHandoff()` — architect → coach handoff
   - `logValidationGateResult()` — gate pass/fail
   - `logLibrarianHandoff()` — admin-only librarian → DB handoff

7. **Main `orchestrate()` Function** — takes `OrchestratorInput`, returns `OrchestratorDecision` with full observability event

8. **Agent Boundary Guards** — `assertLibrarianIsAdminOnly()`, `assertArchitectSkippedOnEditPath()`

9. **Conflict Resolver** — `resolveConflict(a, b)` returns which priority wins

---

## Phase 3 — Routing Rules

### Rule Priority Order

```
1. LIBRARIAN_ADMIN    — admin-only, never user-facing
2. RETRIEVE           — return program without AI call  
3. NO_OP              — error or paywall
4. DIRECT_EDIT        — fast path: APPLY_MUTATION or ASK_CLARIFICATION
5. BUILD_WITH_ARCHITECT — build path: new program or structural rebuild
6. GUIDANCE           — coaching/question response (fallback)
```

### Decision Matrix

| Exec Plan Action  | Intent Type              | Route                 | Agents            |
|-------------------|--------------------------|-----------------------|-------------------|
| Any               | (admin flag set)         | LIBRARIAN_ADMIN       | research_librarian |
| Any               | RETRIEVE_CURRENT_PROGRAM | RETRIEVE              | (none)            |
| NO_OP             | Any                      | NO_OP                 | (none)            |
| APPLY_MUTATION    | Any                      | DIRECT_EDIT           | coach             |
| ASK_CLARIFICATION | Any                      | DIRECT_EDIT           | coach             |
| REBUILD_PROGRAM   | Any                      | BUILD_WITH_ARCHITECT  | architect + coach |
| GUIDANCE          | CREATE_PROGRAM           | BUILD_WITH_ARCHITECT  | architect + coach |
| GUIDANCE          | START_NEW_PROGRAM        | BUILD_WITH_ARCHITECT  | architect + coach |
| GUIDANCE          | (other)                  | GUIDANCE              | coach             |

### Critical Routing Constraints

- **Research Librarian is NEVER called** on any user-initiated route. `LIBRARIAN_ADMIN` only fires when `isAdminRequest: true`.
- **Performance Architect is NEVER called** on `DIRECT_EDIT` or `GUIDANCE` paths. Calling it on edit paths would add latency to every surgical edit.
- **Simple edits are fast-path** — `APPLY_MUTATION` goes straight to Coach, no architect involvement.
- **Structural rebuilds always use the architect** — any `REBUILD_PROGRAM` or new build intent triggers `BUILD_WITH_ARCHITECT`.

---

## Phase 4 — Handoff Contracts

### Coach → Architect Handoff

Triggered at the start of every `BUILD_WITH_ARCHITECT` route, before `buildArchitectureBrief()` is called.

**Contract shape:**
```typescript
interface CoachToArchitectHandoff {
  daysPerWeek: number | null;   // From extracted constraints or agent settings
  sport: string | null;          // From message or profile (message takes priority)
  goal: string | null;           // Primary training goal
  userMessage: string;           // Raw message for semantic extraction fallback
  focusMode: "strength" | "speed" | "mobility";
  variationSeed: number;         // Random seed for exercise variation
  hardConstraints: {             // From persisted constraint memory
    bannedItems: string[];
    dislikedItems: string[];
    painRegions: string[];
    sport: string | null;
  } | null;
}
```

**Data sources:**
- `daysPerWeek` — `extractedConstraints.daysPerWeek ?? intentResult.metadata.targetDays ?? agentSettings.training.daysPerWeek`
- `sport` — `extractSportFromRequest(userMessage, extractedConstraints.sportFocus ?? agentSettings.training.sport)`
- `goal` — `extractedConstraints.primaryGoal ?? agentSettings.training.goal`
- `variationSeed` — `Math.random()` per call (ensures program variation across builds)
- `hardConstraints` — loaded from `constraint-memory.ts` for every user

### Architect → Coach Handoff

Returned after the architect runs, injected into the Coach's system prompt.

**Contract shape:**
```typescript
interface ArchitectToCoachHandoff {
  architectureBriefText: string | null;  // Injected into system prompt
  lockedExerciseSelections: Record<string, unknown> | null;  // Enforced post-gen
  weeklyArchitecture: Record<string, unknown> | null;  // For validation gate
  briefSource: "strength" | "speed" | "mobility" | "none";
  sessionCount: number;
  briefGenerated: boolean;
  briefError: string | null;  // Error details if generation failed
}
```

**Failure behavior:**
- If `buildArchitectureBrief()` throws, `briefGenerated` is `false`, `briefError` is set
- The Coach Agent continues WITHOUT the brief — programs can still be built without it
- `lockedExerciseSelections` may still be populated even if the brief failed (partial recovery)
- This is the existing behavior — the orchestrator makes it formally typed

### Librarian → Research DB Handoff

Admin-only. Written after a Librarian evaluation call completes.

**Contract shape:**
```typescript
interface LibrarianToResearchDatabaseHandoff {
  documentId: number;
  candidateTitle: string;
  candidateSource: string;
  candidateCategory: string;
  librarianResult: {
    recommendation: "approve" | "reject" | "needs_review";
    confidence: "strong" | "moderate" | "limited" | "conflicting";
    evidenceType: string;
    trustLevel: "gold" | "high" | "supporting" | "reject";
    chunksGenerated: number;
    warningFlags: string[];
  };
  triggeredBy: "admin";  // Enforces admin-only invariant
  handoffAt: string;     // ISO timestamp
}
```

**Invariant:** `triggeredBy` is always `"admin"` — this field makes it structurally impossible for a user chat session to emit this handoff without explicitly setting the flag, which would be caught in code review.

---

## Phase 5 — Architecture Validation Gate

### Gate Function

`validateArchitectureGate(input: ArchitectureValidationInput): ArchitectureValidationResult`

### Validation Checks

| Check                    | Severity  | Focus Modes | Condition                                    |
|--------------------------|-----------|-------------|----------------------------------------------|
| `empty_program`          | critical  | all         | `program.days.length === 0`                  |
| `day_count_mismatch`     | critical  | all         | Generated days ≠ requested days              |
| `empty_days`             | critical  | all         | Any day with 0 exercises                     |
| `missing_exercises`      | warning   | all         | Any day with < 4 exercises                   |
| `no_trunk_work`          | warning   | str, mob    | No "Trunk" or "Carry" classification found   |
| `no_unilateral`          | warning   | strength    | No "Unilateral" classification found         |
| `focus_bleed`            | warning   | speed       | Session names contain "strength"/"hypertrophy"|

### Gate Behavior

- **Non-blocking** — gate never throws, never silently drops programs
- **Returns result** — callers (conversations.ts, ai.ts) decide what to do
- **Critical issues** → logged at `logger.error` with `[AgentOrchestrator]` tag
- **Warnings** → logged at `logger.warn` with `[AgentOrchestrator]` tag
- **Clean pass** → logged at `logger.info`
- **Not run on edit paths** — only fires when `isBuildIntent: true`

### Gate vs. Existing Validators

The gate is an **additional** check that sits above the existing validators:
- `validateProgramAgainstConstraints()` in `ai.ts` — checks day count constraint violations (already existing)
- `validateProgrammingQuality()` — checks programming quality rules (already existing)
- `validateSpeedOutputForBleed()` — speed-specific bleed check (already existing)
- `validateArchitectureGate()` — NEW: holistic structural integrity check with typed results

---

## Phase 6 — Conflict Resolution Hierarchy

### The Five Rules (Priority Order)

#### Rule 1: SAFETY (Rank 1 — Highest)
**Trigger conditions:**
- User has flagged injury or pain region
- Return-from-injury mode is active (`routing.returnFromInjury.detected`)
- Special considerations mode is active (`routing.specialConsiderations.detected`)
- Request asks for training that directly risks harm (same-muscle failure training, prohibited exercises)

**Coach Agent behavior:** Acknowledge intent (1 line) → state safety concern (1 sentence) → redirect and execute safe alternative

**Example violations and resolutions:**
- User requests box jumps + return-from-injury knee mode active → remove box jumps, use step-up with control emphasis
- User requests heavy deadlift + back pain flagged → use hip-dominant pattern with reduced load (RPE 5-6), controlled tempo
- User wants to train biceps to failure daily → note recovery constraint, adjust to 2x/week with progressive load

#### Rule 2: MOVEMENT_QUALITY (Rank 2)
**Trigger conditions:**
- User reports form breakdown
- Beginner classification detected
- Re-entry phase (returning from break)

**Coach Agent behavior:** Reduce load or volume to restore mechanics. Never add load at the cost of technique quality.

#### Rule 3: GOAL_OUTPUT (Rank 3)
**Trigger conditions:**
- Sport-specific goal detected (any sport category)
- Explicit programming goal stated
- Season context is active

**Coach Agent behavior:** Apply the correct sport category framework (Categories 1–5) and rep/set prescriptions. Never default to generic bodybuilding unless explicitly requested.

#### Rule 4: FATIGUE_MANAGEMENT (Rank 4)
**Trigger conditions:**
- Readiness signal detected ("cooked", "flat", "smoked", poor sleep)
- Volume exceeds recovery capacity for experience level
- High training frequency without sufficient rest

**Coach Agent behavior:** Cut accessory volume before primary work. Preserve compound movements when reducing. Communicate the reduction in 1 line.

#### Rule 5: USER_PREFERENCE (Rank 5 — Lowest)
**Trigger conditions:**
- Equipment preference stated
- Exercise style preference expressed
- Session duration or scheduling preference

**Coach Agent behavior:** Honor the preference without explanation or commentary. Just apply it.

---

## Phase 7 — Prompt Audit

### System Prompt Structure (ai.ts `buildSystemPrompt`)

The Coach Agent's system prompt is assembled from these layers in order:

| Layer | Source | When Injected |
|-------|--------|---------------|
| Core identity + conflict rules | Hard-coded in `buildSystemPrompt()` | Always |
| Research boundary rules | Hard-coded | Always |
| Research context (pre-approved) | `getRelevantResearchContextWithChunks()` | When chunks retrieved |
| Research programming guidance | `buildResearchProgrammingGuidance()` | When chunks retrieved |
| Training profile | `buildIntelligenceContext(profile)` | When profile exists |
| Exercise library | `buildDBExerciseContext(profile)` | Always (async) |
| Knowledge base | `retrieveRelevantKnowledge()` | Always (async) |
| Sport context | `buildSportContext()` | When sport detected |
| Conditioning context | `buildConditioningContext()` | When conditioning active |
| Power/speed context | `buildPowerSpeedContext()` | When power/speed active |
| Periodization context | `buildPeriodizationContext()` | When periodization active |
| Re-entry context | `buildReEntryContext()` | When re-entry active |
| Mobility context | `buildMobilityContext()` | When mobility active |
| Special considerations | `buildSpecialConsiderationsContext()` | When SC active |
| Return-from-injury | `buildReturnFromInjuryContext()` | When RFI active |
| Architecture brief | `buildArchitectureBrief()` / speed / mobility | Build paths only |
| Behavior instructions | `buildBehaviorInstructions()` | When agent settings present |
| Intent hint | `buildIntentPromptHint()` | When intent classified |
| Edit context | `buildEditContext()` | Edit paths only |
| Specialist context | `decideProgramAdjustment()` | Edit paths with program |
| Preservation context | `buildPreservationContext()` | When action decision present |
| Constraint contract | `buildConstraintContract()` | Build paths with constraints |
| Response mode prompt | `buildResponseModePrompt()` | Always |
| Build compact instruction | `buildSkeletonCompactInstruction()` | Build paths only |

**Prompt size guardrail:** `PROMPT_SIZE_WARN_THRESHOLD = 22000` chars — logs `[BuildPerfWarning]` when exceeded

**Research boundary in prompt (lines 210–227):** The system prompt explicitly states the Research Librarian boundary — the Coach is told it never touches ingestion, and only consumes pre-approved context. This is consistent with the orchestrator's `assertLibrarianIsAdminOnly()` guard.

### Conflict Resolution in Prompt vs. Orchestrator

The system prompt's `## CONFLICT RESOLUTION PRIORITY ORDER` section (lines 202–209 of `ai.ts`) matches exactly the typed `CONFLICT_RESOLUTION_HIERARCHY` in the orchestrator:

| Rank | Prompt Text                          | Orchestrator Type      |
|------|--------------------------------------|------------------------|
| 1    | Safety and joint integrity           | `SAFETY`               |
| 2    | Movement quality                     | `MOVEMENT_QUALITY`     |
| 3    | Goal-specific output                 | `GOAL_OUTPUT`          |
| 4    | Fatigue management                   | `FATIGUE_MANAGEMENT`   |
| 5    | User preference                      | `USER_PREFERENCE`      |

**These are in sync.** No discrepancy detected.

---

## Phase 8 — Observability Logging

### Log Tags

All orchestrator events use `[AgentOrchestrator]` as the primary tag. Existing agent-specific tags are preserved and supplemented.

| Event                   | Log Level | Tag                           |
|-------------------------|-----------|-------------------------------|
| Routing decision        | info      | `[AgentOrchestrator]`         |
| Architect handoff       | info      | `[AgentOrchestrator]`         |
| Validation gate pass    | info      | `[AgentOrchestrator]`         |
| Validation gate warning | warn      | `[AgentOrchestrator]`         |
| Validation gate fail    | error     | `[AgentOrchestrator]`         |
| Librarian handoff       | info      | `[AgentOrchestrator]`         |
| Architect brief built   | info      | `[ArchitectureEngine]` (existing) |
| Build audit             | info      | `[ProgramGenerationPathAudit]` (existing) |
| Quality validation      | warn/info | `[QualityValidator]` (existing) |
| Speed bleed audit       | warn/error| `[SpeedBleedAudit]` (existing) |

### Structured Fields per Event

**`logOrchestratorDecision(event)`** fields:
- `route` — which orchestrator route was selected
- `participatingAgents` — array of agent roles
- `focusMode` — strength / speed / mobility
- `intentType` — from intent classifier
- `execPlanAction` — from execution planner
- `isBuildPath` — boolean
- `architectUsed` — boolean
- `librarianUsed` — boolean
- `conflictRulesApplied` — array of priority names

**`logArchitectHandoff(handoff, result)`** fields:
- `focusMode`, `daysPerWeek`, `sport`, `goal`
- `briefGenerated`, `briefSource`, `sessionCount`
- `hasLockedSelections`, `briefError`

**`logValidationGateResult(result, context)`** fields:
- `focusMode`, `programName`, `dayCount`
- `issues` (critical only at error level)
- `warnings` (at warn level)
- `summary`

---

## Phase 9 — QA Test Scenarios

### Test Group A: Routing Rules

**A.1 — Simple edit is DIRECT_EDIT (no architect)**
- Input: `execPlanAction: "APPLY_MUTATION"`, `intentType: "EDIT_PROGRAM"`
- Expected route: `DIRECT_EDIT`
- Expected agents: `["coach"]`
- Expected: No `[ArchitectureEngine]` log emitted
- Verify: `architectUsed: false` in observability event

**A.2 — New build triggers BUILD_WITH_ARCHITECT**
- Input: `execPlanAction: "GUIDANCE"`, `intentType: "CREATE_PROGRAM"`
- Expected route: `BUILD_WITH_ARCHITECT`
- Expected agents: `["performance_architect", "coach"]`
- Verify: `[ArchitectureEngine] Architecture brief injected into prompt` in logs

**A.3 — Structural rebuild triggers BUILD_WITH_ARCHITECT**
- Input: `execPlanAction: "REBUILD_PROGRAM"`, `intentType: "EDIT_PROGRAM"`
- Expected route: `BUILD_WITH_ARCHITECT`
- Expected agents: `["performance_architect", "coach"]`

**A.4 — RETRIEVE_CURRENT_PROGRAM skips all agents**
- Input: `intentType: "RETRIEVE_CURRENT_PROGRAM"`
- Expected route: `RETRIEVE`
- Expected agents: `[]`
- Verify: No AI call is made, program returned directly from DB

**A.5 — Librarian never fires for user chat**
- Input: `isAdminRequest: false`
- Expected: `LIBRARIAN_ADMIN` route never selected
- Verify: No `research-librarian-agent.ts` invocation during any user-facing route

**A.6 — Admin request triggers LIBRARIAN_ADMIN**
- Input: `isAdminRequest: true`
- Expected route: `LIBRARIAN_ADMIN`
- Expected agents: `["research_librarian"]`
- Verify: `[AgentOrchestrator] Research Librarian → Research Database handoff logged`

### Test Group B: Conflict Resolution

**B.1 — SAFETY overrides USER_PREFERENCE**
- Scenario: User requests box jumps but return-from-injury mode is active for the knee
- Expected: Box jumps removed, step-up with control substituted
- Verify: `[ReturnFromInjuryValidator]` safety validation log; no box jumps in final program

**B.2 — SAFETY overrides GOAL_OUTPUT**
- Scenario: User requests heavy compound lifting but special considerations mode is active
- Expected: Load reduced, explosive elements removed, session density capped at 4–6 exercises
- Verify: `[SpecialConsiderationsValidator]` safety validation log; no explosive exercises

**B.3 — MOVEMENT_QUALITY overrides FATIGUE_MANAGEMENT**
- Scenario: User reports form breakdown → ask to add volume
- Expected: Agent does not add volume, references movement quality constraint
- Verify: Response acknowledges mechanics before any volume discussion

**B.4 — GOAL_OUTPUT overrides USER_PREFERENCE (sport framework)**
- Scenario: Soccer athlete (Category 2) requests bodybuilding push/pull/legs split
- Expected: Explain the framework once briefly, provide Category 2-appropriate program
- Verify: `[RoutingHint] SPORT-SPECIFIC ARCHITECTURE` in logs; rep ranges in 5–8 zone

**B.5 — USER_PREFERENCE honored when no higher rule applies**
- Scenario: User requests dumbbell-only program with no injury flags
- Expected: Home gym framework applied, no barbell movements
- Verify: `HOME GYM EQUIPMENT CONSTRAINT` injected into prompt

### Test Group C: Architecture Validation Gate

**C.1 — Clean program passes validation**
- Input: 4-day strength program with 6 exercises per day, trunk and unilateral present
- Expected: `passed: true`, `hasCriticalIssues: false`, 0 issues
- Verify: `[AgentOrchestrator] Architecture validation gate passed cleanly` in logs

**C.2 — Day count mismatch is critical**
- Input: User requested 4 days, program has 3 days
- Expected: `passed: false`, `hasCriticalIssues: true`, issue type `day_count_mismatch`
- Verify: `[AgentOrchestrator] Architecture validation gate FAILED` at error level

**C.3 — Empty day is critical**
- Input: Program where Day 2 has no exercises
- Expected: `passed: false`, `hasCriticalIssues: true`, issue type `empty_days`

**C.4 — Missing trunk is warning (not critical)**
- Input: Strength program with no "Trunk" or "Carry" classification
- Expected: `passed: true`, `hasCriticalIssues: false`, 1 warning issue
- Verify: `[AgentOrchestrator] Architecture validation gate passed with warnings` at warn level

**C.5 — Speed/strength focus bleed is warning**
- Input: Speed program where Day 1 is named "Upper Strength + Press"
- Expected: Warning issue type `focus_bleed`; program not rejected (warning only)

**C.6 — Edit paths skip gate entirely**
- Input: `isBuildIntent: false`
- Expected: Gate returns immediately with `passed: true`, empty issues, summary says "skipped"

### Test Group D: Handoff Contracts

**D.1 — CoachToArchitectHandoff fields are typed correctly**
- Verify: `daysPerWeek` is `number | null` (not string)
- Verify: `sport` maps to the canonical sport identifier, not a display name
- Verify: `hardConstraints.bannedItems` is populated from constraint memory

**D.2 — ArchitectToCoachHandoff briefGenerated is false when architect fails**
- Simulate: `buildArchitectureBrief()` throws
- Expected: `briefGenerated: false`, `briefError` is non-null
- Verify: Coach Agent still runs (non-blocking), `lockedExerciseSelections` may be non-null

**D.3 — LibrarianToResearchDatabaseHandoff triggeredBy is always "admin"**
- Verify: TypeScript type system enforces literal `"admin"` — only admin routes can create this handoff
- Verify: `documentId` corresponds to a real `research_documents` row
- Verify: `chunksGenerated` matches actual chunks written to `research_chunks`

### Test Group E: Observability

**E.1 — Every conversation turn emits one `[AgentOrchestrator]` routing event**
- Send a message → verify exactly one `[AgentOrchestrator]` routing event in logs
- Verify all required fields are present: `route`, `participatingAgents`, `focusMode`, `intentType`, `execPlanAction`

**E.2 — Build path emits architect handoff log**
- Build a new program → verify `[AgentOrchestrator] Performance Architect → Coach Agent handoff complete`
- Verify `briefGenerated: true`, `sessionCount > 0`

**E.3 — Edit path does NOT emit architect handoff log**
- Send a surgical edit → verify NO `[AgentOrchestrator] Performance Architect → Coach Agent handoff complete`

**E.4 — Validation gate logs fire on build paths**
- Build a new program → verify one of:
  - `[AgentOrchestrator] Architecture validation gate passed cleanly`
  - `[AgentOrchestrator] Architecture validation gate passed with warnings`
  - `[AgentOrchestrator] Architecture validation gate FAILED`
- Verify gate does NOT fire on edit paths

---

## Phase 10 — Invariant Verification Checklist

Run this checklist after any change to `ai.ts`, `conversations.ts`, `program-architecture-engine.ts`, or any admin route:

- [ ] Research Librarian is only imported in `admin.ts` and `research-librarian-agent.ts` — not in `conversations.ts` or `ai.ts`
- [ ] `buildArchitectureBrief()` is only called on `isBuildIntent === true` paths in `ai.ts`
- [ ] `buildSpeedArchitectureBrief()` only fires when `focusMode === "speed" && isBuildIntent`
- [ ] `buildMobilityArchitectureBrief()` only fires when `focusMode === "mobility" && isBuildIntent`
- [ ] `enforceVariationMandateOnProgram()` fires after AI generation, before return, on all build paths
- [ ] `validateArchitectureGate()` is non-blocking — no throws propagate to the user
- [ ] Conflict resolution hierarchy rank order matches system prompt section (verified 2025-05-02)
- [ ] No agent name ("Coach Agent", "Performance Architect", "Research Librarian") appears in any user-visible response text
- [ ] `LibrarianToResearchDatabaseHandoff.triggeredBy` is always `"admin"`
- [ ] `[AgentOrchestrator]` log tag is present on all orchestrator observability events

---

## Change Log

| Date       | Phase | Change |
|------------|-------|--------|
| 2025-05-02 | 1     | Initial architecture audit — three-agent boundaries mapped and confirmed |
| 2025-05-02 | 2     | Agent orchestrator implemented (`src/agents/agent-orchestrator.ts`) |
| 2025-05-02 | 3     | Routing rules documented and typed (`resolveOrchestratorRoute`) |
| 2025-05-02 | 4     | Handoff contracts typed: `CoachToArchitectHandoff`, `ArchitectToCoachHandoff`, `LibrarianToResearchDatabaseHandoff` |
| 2025-05-02 | 5     | Architecture validation gate implemented (`validateArchitectureGate`) |
| 2025-05-02 | 6     | Conflict resolution hierarchy typed as `CONFLICT_RESOLUTION_HIERARCHY` constant |
| 2025-05-02 | 7     | Prompt audit completed — conflict hierarchy confirmed in sync with system prompt |
| 2025-05-02 | 8     | Observability logging implemented with four structured log functions |
| 2025-05-02 | 9     | QA test scenarios documented (27 scenarios across 5 groups) |
| 2025-05-02 | 10    | Invariant verification checklist created |
