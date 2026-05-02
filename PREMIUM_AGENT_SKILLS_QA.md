# TrainChat — Premium Agent Skills QA

Documents the expected behavior for each premium skill upgrade.
Run these checks manually or as part of structured regression testing.

---

## Phase 1 — Coach Agent Premium Skills

### Test 1 — Behavioral Coaching: Athletic Intent
**Input:** "Make this more athletic"

**PASS criteria:**
- Detects architectural/athletic scope (not local exercise swap)
- Routes to Architect for athletic transfer overlay
- Response acknowledges sport-transfer intent
- No generic "here's your new program" without structural reasoning

**FAIL indicators:**
- Swaps one exercise and calls it done
- Ignores sport-transfer context
- Outputs a generic response with no structural awareness

---

### Test 2 — True Swap Skill
**Input:** Tap swap button on any exercise

**PASS criteria:**
- Exercise name changes to a different exercise
- Movement intent, equipment, and goal are preserved
- Same-exercise swap is rejected (TrueSwap skill enforces actual change)

**FAIL indicators:**
- Exercise name is identical after "swap"
- Equipment constraint violated (e.g. barbell swap when user has dumbbells only)

---

### Test 3 — Progression Lever Skill
**Input:** "Make this harder"

**PASS criteria:**
- Correct lever selected for context:
  - Beginner → reps or sets
  - Intermediate+ → load or tempo
  - Athletic → complexity or density
- Not every exercise gets maxed out simultaneously

**FAIL indicators:**
- All exercises have reps doubled
- No structural awareness of training age or goal
- Response implies "harder = more volume" without nuance

---

### Test 4 — Safety Hard Law + Behavioral Coaching
**Input:** "My knee hurts but I still want to train hard"

**PASS criteria:**
- Safety Law preserved — no high-impact knee exercises
- Pain acknowledged explicitly
- Hard training alternative provided (upper body, hip-dominant, trunk, conditioning)
- Response does not simply reduce all intensity

**FAIL indicators:**
- Knee-aggravating exercises remain (box jumps, deep squats, jumping lunges)
- Training intensity removed entirely without offering alternatives
- Safety constraint ignored

---

### Test 5 — Program Architecture + Athletic Transfer
**Input:** "Build me a creative 4-day football strength and speed plan"

**PASS criteria:**
- Not a generic push/pull/legs template
- Sport-specific structure: strength days + speed/CNS days separated
- Progression model present (not flat rep/set scheme throughout)
- Power/plyometric work present on speed days
- Coach explanation references sport transfer

**FAIL indicators:**
- Generic bodybuilding-style split with no sport relevance
- No power or plyometric work
- Flat rep scheme across all days
- "Creative" request produced a standard template

---

### Test 6 — Evidence Application (Coaching Translation)
**Input:** "Why is this structured this way?"

**PASS criteria:**
- Concise, evidence-informed explanation in plain language
- References structural intent (CNS sequencing, fatigue distribution, etc.)
- Does not reproduce raw research citations
- Feels like a coach explaining, not a paper being read

**FAIL indicators:**
- Response is generic ("this is a well-balanced program")
- Response uses academic language without translation
- No connection to user's actual program structure

---

### Test 7 — Behavioral Coaching: Readiness / Low Recovery
**Input:** Check-in submitted with low recovery score (1–3)

**PASS criteria:**
- Adjustment suggested (reduced intensity, deload, active recovery option)
- User is not forced into a change — adjustment is offered
- Tone is supportive, not alarmed

**FAIL indicators:**
- Full deload forced without user choice
- Low recovery ignored entirely
- Response treats it as a standard training day

---

### Test 8 — Memory Suppression (Settings Toggle)
**Input:** Settings → Memory off → send a message

**PASS criteria:**
- Memory context suppressed appropriately
- System does not reference past goals/injuries/preferences when memory is off
- Coaching responses treat user as context-free

**FAIL indicators:**
- Memory still referenced when turned off
- System appears to ignore the toggle

---

## Phase 5 — CEO Heartbeat Premium Skills

| Skill | Check Name | Expected Behavior |
|---|---|---|
| Clarity Check | Day naming + intent cues | Rejects generic "Day 1", "Legs", etc. |
| Goal Match Check | Rep range alignment | Flags strength rep ranges in hypertrophy programs |
| Practicality Check | Session density + day count | Flags 18 exercises per session |
| Coaching Quality Check | Note substance | Flags empty or generic coach notes |
| Flow & Structure Check | Block order | Flags conditioning before strength on same day |
| Fatigue Economics Check | Volume distribution | Flags excessive junk volume |
| Safety Check | Pain region compliance | Flags knee exercises when knee pain is declared |
| Simplicity Check | Program complexity | Flags 6-day PHAT-style programs for beginners |
| Confidence Check | Exercise completeness | Flags sessions with missing exercises |
| Identity Check | TrainChat philosophy | Flags generic or overbuilt programs |

**Skill output metadata** (internal/dev logs):
- `skillsRun` — list of all 10 check names executed
- `confidence` — `"high"` (0 concerns), `"moderate"` (1–2 concerns), `"low"` (3+ concerns)
- `fallbackUsed` — `true` when expert judgment latitude was granted

---

## Phase 6 — Shared Skill Output Metadata

| Field | Type | Purpose |
|---|---|---|
| `skillUsed` | `string` | Which premium skill handled the mutation |
| `confidence` | `"low" \| "moderate" \| "high"` | Confidence in the result |
| `fallbackUsed` | `boolean` | Whether deterministic fallback path was taken |
| `skillsRun` | `string[]` | All checks run (CEO Heartbeat) |

**Populated in:**
- `applyMutation()` → `skillUsed`, `confidence`, `fallbackUsed`
- `runCEOHeartbeatCheck()` → `skillsRun`, `confidence`, `fallbackUsed`

**Not yet wired:**
- Swap fallback detection (deterministic fallback map vs. cluster/AI path) — future enhancement

---

## Phase 7 — Hard Laws Verification

These must never be violated regardless of premium skill activation:

| Law | Verified By |
|---|---|
| Safety and pain constraints override all programming goals | `checkSafety()` in CEO Heartbeat |
| Equipment constraints respected | Architect constraint optimization + mutation equipment filters |
| User-excluded exercises require confirmation | Architect hard rule |
| No diagnosis or medical treatment claims | Coach identity laws + librarian skill rules |
| Research Librarian is admin-only | Orchestrator architectural invariant |
| Internal agent names never appear to users | Coach identity laws |
| Program state and user-facing receipt must agree | Trust Protection skill |

---

## Typecheck Result

Run: `pnpm run typecheck`

Expected: zero new errors in edited files.
Pre-existing errors in test fixtures and unrelated type gaps are not introduced by this upgrade.

---

## Files Changed

| File | Phase | Change |
|---|---|---|
| `artifacts/api-server/src/lib/ai.ts` | 1 | Added `## PREMIUM COACHING SKILLS` section (6 skills) to Coach Agent system prompt |
| `artifacts/api-server/src/agents/agent-personas.ts` | 1, 2, 3 | Enhanced `skills[]` arrays for all three personas with premium skill names |
| `artifacts/api-server/src/agents/ceo-heartbeat.ts` | 5, 6 | Added `skillsRun`, `confidence`, `fallbackUsed` to `CEOHeartbeatResult`; populated in `runCEOHeartbeatCheck` |
| `artifacts/api-server/src/lib/mutation-engine.ts` | 4, 6 | Added `skillUsed`, `confidence`, `fallbackUsed` to `applyMutation` return; each handler tagged with skill name |
| `artifacts/api-server/src/research/research-librarian-agent.ts` | 3 | Added `## PREMIUM RESEARCH SKILLS` section (6 skills) to librarian system prompt |
| `artifacts/api-server/src/lib/program-architecture-engine.ts` | 2 | Added `PREMIUM ARCHITECT SKILLS` section to engine header |
| `artifacts/api-server/src/agents/agent-orchestrator.ts` | — | ARCHITECTURAL INVARIANTS (from previous refactor) |
