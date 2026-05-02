# TrainChat CEO Heartbeat QA Guide

This document covers the expected behavior of the CEO Heartbeat Check layer. The Coach Agent runs this final quality gate on every program output before it reaches the user.

---

## What It Is

The CEO Heartbeat is a deterministic, zero-latency check (no AI call) that runs after all upstream validation layers (constraint enforcement, quality validation, special considerations, return-from-injury, population, variation mandate) and immediately before the final `return { content, structuredData }`.

It implements nine coaching standard checks. The Coach Agent is the "CEO" — final decision-maker on every output.

**Never exposed to users. Never modifies safety rules. Never redesigns unnecessarily.**

---

## The Nine Checks

| # | Check | What It Catches |
|---|-------|-----------------|
| 1 | Clarity | Missing intent cues; generic day names ("Legs", "Day 1") |
| 2 | Goal Alignment | Rep ranges mismatched to stated goal (strength goal → 12-rep program) |
| 3 | Practicality | Too many exercises for the stated session length; day count mismatch |
| 4 | Coaching Quality | Missing or generic coach notes |
| 5 | Flow & Structure | Power/Plyometric exercises placed AFTER Primary strength (missequencing) |
| 6 | Fatigue & Recovery | Sessions with >14 exercises (junk volume) |
| 7 | Safety | Exercises that may aggravate stated pain limitations |
| 8 | Simplicity | Beginner program overloaded with exercises; excessive classification diversity |
| 9 | Confidence | Program without a name, description, or exercises in a session |

---

## Output Structure

```typescript
{
  pass: boolean;                 // true = all checks cleared
  concerns: string[];            // substantive issues — logged loudly
  minorAdjustments?: string[];   // non-blocking observations
  overrideRecommended?: boolean; // true = structural/safety issue, log for monitoring
}
```

---

## Test Scenarios

### Test 1 — Overcomplicated Program

**Setup:**
- User is a beginner
- Program has 11 exercises per session across 4 days
- Day names are "Day 1", "Day 2", "Day 3", "Day 4"
- No intent cues on exercises

**Expected result:**
- `pass: false`
- Concerns include Clarity (missing intent cues), Clarity (generic day names), Simplicity (beginner + too many exercises)
- `overrideRecommended: true`
- Logged at `[CEOHeartbeat] FAIL`

---

### Test 2 — Misaligned Goal

**Setup:**
- User goal: "strength / powerlifting"
- Program generates primary lifts with 12–15 rep ranges

**Expected result:**
- `pass: false`
- Concerns include `Goal Alignment: User goal is strength but primary exercises average ~13 reps.`
- `overrideRecommended: false` (only one concern)
- Logged at `[CEOHeartbeat] FAIL`

---

### Test 3 — Unsafe Output

**Setup:**
- User has shoulder pain noted in context
- Program includes "Overhead Press" on Day 1

**Expected result:**
- `pass: false`
- Concerns include `Safety: Day "X" contains "Overhead Press" which may aggravate the user's stated shoulder pain limitation.`
- `overrideRecommended: true` (safety concern triggers override flag)
- Logged at `[CEOHeartbeat] FAIL — overrideRecommended`

---

### Test 4 — Clean Program

**Setup:**
- All exercises have intent cues
- Day names reflect training intent
- Coach notes are substantive
- Exercise counts are 6–8 per session
- No pain limitation conflicts
- Block order is correct (Prep → Power → Primary → Secondary)

**Expected result:**
- `pass: true`
- `concerns: []`
- Logged at `[CEOHeartbeat] PASS`

---

### Test 5 — Creative Program with Expert Judgment

**Setup:**
- Program uses a non-standard split (high-low structure)
- `hasExpertJudgmentNotes: true`
- Flow order is non-standard but justified
- Goal alignment check would normally flag

**Expected result:**
- Flow & Structure concerns are suppressed (expert judgment exception applies)
- Goal Alignment concerns are suppressed
- Simplicity concerns are suppressed
- `pass: true` if no safety/critical issues remain
- Logged at `[CEOHeartbeat] PASS (creative — expert judgment notes present)`

---

### Test 6 — Session Length Violation

**Setup:**
- Session length context: "30 min"
- Day has 9 exercises

**Expected result:**
- `pass: false`
- Concerns include `Practicality: Day "X" has 9 exercises but session length is ~30 min.`

---

### Test 7 — Missing Coach Notes

**Setup:**
- Day notes are "Great lower body day! Work hard!"

**Expected result:**
- `pass: false`
- Concerns include `Coaching Quality: 1 day(s) missing substantive coach notes.`

---

### Test 8 — Missequenced Power Work

**Setup:**
- Day sequence: Prep → Primary (Back Squat) → Power (Hang Power Clean) → Secondary

**Expected result:**
- `pass: false`
- Concerns include `Flow & Structure: Day "X" has a power exercise appearing AFTER a Primary lift.`

---

## Dev Log Format

```
[CEOHeartbeat] PASS
  program: "Athlete Power Block"
  days: 4
  concerns: 0
  minor: 2
  overrideRecommended: false

[CEOHeartbeat] FAIL
  program: "General Fitness 3-Day"
  days: 3
  concerns: 3
  minor: 1
  overrideRecommended: true
  concernDetail: [
    "Clarity: 12 exercise(s) missing intent cues.",
    "Safety: Day 'Upper Body' contains 'Overhead Press' ...",
    "Coaching Quality: 2 day(s) missing substantive coach notes."
  ]
```

---

## Integration Point

File: `artifacts/api-server/src/lib/ai.ts`

Location: After all validation layers (population validator, variation mandate), before the Final Latency Audit and final `return { content: cleanContent, structuredData }`.

Runs only when: `isBuildIntent && structuredData !== null`

Non-blocking: `overrideRecommended` is logged but never silently drops or replaces the program. It flags for observation and future retry logic.

---

## Constraint Guarantees

The CEO Heartbeat:
- Never overrides safety constraints (it flags safety concerns but does not make enforcement decisions — upstream safety validators already do that)
- Never redesigns a program (it only logs concerns — the Coach Agent's prompt instruction handles self-correction)
- Never adds latency (zero async calls, zero I/O)
- Never exposes results to users
- Has no side effects on the returned `structuredData`
