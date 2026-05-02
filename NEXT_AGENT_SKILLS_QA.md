# TrainChat Next-Level Agent Skills QA Guide

Tests for all Phase 1–9 skill additions. All layers are internal — users only see "TrainChat."

---

## Phase 1 — Behavioral Intelligence

### Test 1a — Fatigue Pattern
**Prompt sequence (same session):**
1. "Make this easier"
2. "Make the next day easier too"
3. "I'm tired today"

**PASS conditions:**
- `analyzeBehavioralSignals` emits `fatigue_risk` signal at moderate/high confidence
- Programming adjustment: volume reduction, simplified sessions
- Coach Atlas tone: acknowledges without dwelling; normalizes recovery
- `programmingContext` string injected into architecture brief

### Test 1b — Under-Challenged Pattern
**Prompt sequence:**
1. "Make this harder"
2. "This is still too easy"

**PASS conditions:**
- `under_challenged` signal detected at moderate/high confidence
- Programming adjustment: intensity increase, load tier up
- Fatigue management preserved — does not blindly add volume

---

## Phase 2 — Constraint Optimization

### Test 2 — Complex Constraint Build
**Prompt:** "Build me a 3-day football speed and strength plan with dumbbells only and knee pain."

**PASS conditions:**
- `constraintTradeoffs` field populated on `WeeklyArchitecture`
- Tradeoffs include: equipment constraint handling, knee-safe substitutions, speed quality preservation
- Example entries expected:
  - "Used dumbbell RDL instead of barbell deadlift to preserve hinge intent with available equipment."
  - "Removed knee-dominant plyometrics; preserved speed intent through hip-dominant power work."
  - "Reduced lower-body bilateral volume to protect knee; compensated with single-leg quality work."
- Program is still sport-appropriate and speed-quality-preserving

---

## Phase 3 — Evidence Conflict Handling (Admin)

### Test 3 — Mixed Evidence Topic
**Scenario:** Admin submits research on a topic with mixed evidence (e.g. stretching and injury prevention).

**PASS conditions:**
- `evidenceConflictProfile.hasConflict: true`
- `conflictSummary` accurately describes the nature of the disagreement
- `practicalResolution` provides a conservative, defensible middle-ground recommendation
- `confidenceImpact` = "downgrade_to_moderate" or "downgrade_to_limited"
- Overall `confidence` field reflects the downgrade
- Librarian (Dr. Sable) does NOT auto-approve despite mixed evidence

**FAIL conditions:**
- Conflict ignored and confidence assigned as "strong"
- Program created (Dr. Sable must never create programs)

---

## Phase 4 — Progression Intelligence

### Test 4 — 4-Week Progression Request
**Prompt:** "Progress this program for 4 weeks."

**PASS conditions:**
- `buildProgressionIntelligence` called with the current program and context
- `progressionModel` selected is appropriate for the user's goal and experience
- All 4 `weeklyRules` are present with non-empty fields
- `deloadRecommendation` is present
- `adjustmentTriggers` include at least 3 entries
- Brief section formatted and injected via `formatProgressionBriefSection`

**Model selection expectations:**
| User profile | Expected model |
|-------------|----------------|
| Beginner | linear |
| Intermediate, hypertrophy | double_progression |
| Advanced, strength | wave |
| Advanced, multi-day | block |
| Speed/power athlete | undulating |
| Returning from inactivity | re_entry |
| High fatigue signal | autoregulated |

---

## Phase 5 — Mutation Scope Decision (Intent Scaling)

### Test 5a — Button vs Typed Chat
**Exercise edit button click:** "Make harder" on a specific exercise  
**Expected:** `scope: "exercise"`, `confidence: "high"`

**Typed chat:** "Make this harder"  
**Expected:** `scope: "session"` or `"program"` depending on active program state

**Typed chat:** "Progress this for football"  
**Expected:** `scope: "architecture"`, `confidence: "moderate"` or `"high"`

### Test 5b — Architecture-Level Request
**Prompt:** "Make this better for football"  
**Expected:** `scope: "architecture"`, routes to Performance Architect

**Prompt:** "Swap this exercise"  
**Expected:** `scope: "exercise"`, routes to mutation pipeline

**Prompt:** "Progress this for 4 weeks"  
**Expected:** `scope: "architecture"` or `"program"`, routes to Progression Intelligence + Architect

---

## Phase 6 — Coaching Identity Filter (CEO Heartbeat)

### Test 6 — "Hardest Possible" Request
**Prompt:** "Build me the hardest possible 7-day program."

**PASS conditions:**
- `identityAlignment` = "acceptable" or "strong" (not "weak")
- If the AI generated junk volume, heartbeat flags `identityConcerns`
- Coach creates a smart hard/easy high-frequency structure, not 7 identical all-out sessions
- Session naming reflects training intent, not "Day 1 / Hard Day"
- `overrideRecommended` = false if concerns are minor

**Identity concerns that should be caught:**
- 7 identical hard sessions → identity concern: "randomFatigueBias"
- Excessive consecutive high-load days → identity concern: "recoveryNeglected"
- No progression logic visible → identity concern: "staticIntensity"

---

## Phase 7 — Session Experience Design

### Test 7 — 45-Minute Strength Session
**Prompt:** "Build me a 45-minute strength session."

**PASS conditions:**
- Program JSON includes `sessionFlowNotes` on each day
- Flow notes describe: ramp-up phase, main work, support work, optional finisher
- Notes are specific to this session, not generic
- Example expected entries:
  - "Opens with low-friction prep to prime the CNS before the primary strength work."
  - "Main block sequenced strength-first while neural drive is highest."
  - "Finisher is optional — skip if session time is tight or fatigue is high."
- `sessionFlowNotes` does NOT duplicate the coach `notes` field

---

## Phase 8 — Orchestrator Flow

### Test 8 — Simple Edit Stays Fast
**Scenario:** User clicks "Swap exercise" button

**PASS conditions:**
- Route = `DIRECT_EDIT`
- Only Coach Agent runs
- No Behavioral Intelligence, No Progression Intelligence, No Performance Architect
- Fast path preserved

### Test 8b — Complex Build Calls More Layers
**Scenario:** User requests full program rebuild with sport context and progression request

**PASS conditions:**
- Route = `BUILD_WITH_ARCHITECT`
- Performance Architect generates brief
- Progression Intelligence injected if "4 weeks" or progression language detected
- Behavioral signals considered if recent session history exists
- CEO Heartbeat + Identity Filter runs last

---

## Phase 9 — Admin Librarian Conflict Test

**Scenario:** Admin submits two research documents with conflicting findings on the same topic.

**PASS conditions:**
- Both documents ingested separately
- Dr. Sable flags conflict on the second document or when retrieved together
- Conflict handled gracefully — neither overclaims
- No user impact from the conflict (research layer is internal)

---

## Typecheck Validation

All new/modified files must pass:
```
pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit
```

Files added:
- `src/agents/behavioral-intelligence.ts`
- `src/agents/progression-intelligence.ts`

Files modified:
- `src/agents/ceo-heartbeat.ts` — identity filter added
- `src/lib/mutation-engine.ts` — MutationScopeDecision + determineMutationScope
- `src/lib/program-architecture-engine.ts` — constraintTradeoffs field
- `src/research/research-librarian-agent.ts` — evidenceConflictProfile
- `src/lib/ai.ts` — sessionFlowNotes on ProgramDay, session experience prompt section
- `src/agents/agent-orchestrator.ts` — updated flow comment

Expected result: zero new TypeScript errors.

---

## Constraint Guarantees

All new layers must satisfy:
- No user-facing internal agent names
- Simple edits remain on the fast path
- Safety constraints override all agent logic
- Research Librarian never called during user chat
- All new fields are optional (backward-compatible with existing programs)
