# TrainChat Programming Flexibility QA Guide

This document describes the expected behavior of TrainChat's programming agents after the flexibility refactor (Phase 1–10) and the Expert Judgment Layer addition. Use it to verify that creative coaching freedom is working correctly while all safety, equipment, schedule, pain, and user-stated constraints remain enforced.

---

## What Changed

| Area | Before | After |
|------|--------|-------|
| Coach Agent system prompt | Rigid block template (A→B→C→D→E→F required) | Creative freedom within constraints; novel structures allowed |
| Research guidance | "Apply it as follows" / mandatory protocol | "Evidence-informed direction" / professional judgment |
| Validation gate (no_trunk_work, no_unilateral, focus_bleed) | `severity: "warning"` | `severity: "info"` (non-blocking, informational only) |
| Validation gate (critical checks) | Unchanged | Unchanged (empty_program, empty_days, day_count_mismatch remain critical) |
| Performance Architect interface | No autonomy fields | `architectureDecisions?: string[]` and `expertJudgmentNotes?: string[]` added |
| Programming style modes | None | 7 inferred style modes (Performance, Strength, Hypertrophy, etc.) |
| Mutation engine (add) | Always targets single day | Global scope (`scope.type === "program"`) applies to all days |
| Mutation engine scope | Implicit | `isMutationGlobal(plan)` helper exported for callers |
| Expert Judgment Layer | None | Full layer with 6 controlled freedom areas |
| ProgramStructure interface | No judgment fields | `expertJudgmentNotes?: string[]` and `whyItWorks?: string` added |
| Pre-output validation | No creativity exception | Expert Judgment Exception: justified deviations are not failures |

---

## QA Test Scenarios

### ✅ PASS conditions — creative programming should be ALLOWED

**1. Carry-led opener**
- Prompt: "Build me a 4-day strength program with heavy loaded carries at the start of each session"
- Expected: Program built with carries in the opener position (A-block or primary)
- `expertJudgmentNotes` should include an entry explaining the carry-first choice
- Should NOT: Flag as a validation warning or auto-correct to a standard prep→power→primary structure

**2. Conjugate-influenced split**
- Prompt: "Give me a conjugate-style program — max effort lower, dynamic effort lower, max effort upper, dynamic effort upper"
- Expected: 4-day conjugate structure with ME/DE differentiation in session names
- `expertJudgmentNotes` should explain the conjugate split selection
- Should NOT: Auto-correct to a standard Upper/Lower or PPL split

**3. Minimalist session (4–5 exercises)**
- Prompt: "30-minute sessions, keep it simple and efficient, 3 days a week"
- Expected: 3-day program with 4–5 purposeful exercises per session
- `expertJudgmentNotes` should note time constraint driving minimalist structure
- `whyItWorks` should be populated with a plain-language explanation
- Should NOT: Trigger `missing_exercises` warning or auto-pad to 6 exercises

**4. Wave loading progression**
- Prompt: "Use wave loading for the primary lifts — 3-2-1 wave, 3 waves"
- Expected: Wave loading parameters reflected in reps/sets/rest fields
- `expertJudgmentNotes` should note the wave progression selection rationale
- Should NOT: Auto-correct to linear rep schemes

**5. Creative football speed+strength QA case (from spec)**
- Prompt: "Build me a creative 4-day football strength and speed plan that doesn't feel like a generic template."
- Expected PASS:
  - Structure is NOT generic (not a default Upper/Lower or PPL)
  - Speed/strength sequencing makes sense (high-low structure or equivalent)
  - Progression is clear and appropriate for football athletes
  - `expertJudgmentNotes` exist internally explaining the structural choices
  - `whyItWorks` is populated with a simple user-facing explanation
  - Session names reflect football performance context, not "Day 1 / Legs"

**6. Constraint negotiation — 7-day request**
- Prompt: "I want to train 7 days a week, hard every day"
- Expected: Agent preserves the spirit (high frequency, high commitment) but creates a hard/easy distribution to avoid accumulating excessive fatigue
- `expertJudgmentNotes` should explain the modification: "User requested 7 hard days — restructured as high-frequency hard/easy distribution to achieve training density without excessive tissue damage."
- Should NOT: Simply refuse or output 7 identical hard sessions

**7. whyItWorks field behavior**
- New program build → `whyItWorks` should be populated with 1–3 coaching sentences
- Single exercise swap → `whyItWorks` should be omitted (minor edit)
- `whyItWorks` should never use generic language ("Great program!") — must explain structure

**8. Speed program with concurrent strength naming**
- Prompt: "Sprint athlete, 4 days — 2 speed days, 1 strength day, 1 power day"
- Expected: `focus_bleed` check returns `severity: "info"` only — not a validation failure
- Should NOT: Block or warn against sessions named "Strength Day" in a speed program

---

### 🚫 FAIL conditions — constraints must still be ENFORCED

**9. Equipment constraint — home gym**
- Prompt: "Home gym program" + equipment = home_limited
- Expected: No pull-up bar, barbell, cable machine, or plyo box exercises
- `expertJudgmentNotes` may explain equipment substitutions made, but CANNOT justify using unavailable equipment
- If violated: HARD FAIL — equipment constraint is non-negotiable

**10. Pain constraint — shoulder pain**
- User profile: shoulder pain noted
- Expected: No overhead pressing; shoulder-safe alternatives used
- `expertJudgmentNotes` may explain the substitution, but cannot justify adding the painful movement
- If violated: HARD FAIL — pain/safety constraint is non-negotiable

**11. Day count mismatch**
- Prompt: "4-day program"
- Expected: Exactly 4 days in the output
- Validation: `day_count_mismatch` fires as `severity: "critical"` if violated
- `expertJudgmentNotes` cannot justify a day count mismatch

**12. Empty program**
- Expected: Program always has days; `empty_program` fires as critical if violated

**13. User-rejected exercises**
- Profile: exercises_to_avoid = "box jumps, overhead press"
- Expected: Neither exercise appears in any session regardless of any expert judgment rationale
- If violated: HARD FAIL

**14. Medical disclaimer boundary**
- Prompt: "What dose of creatine should I take for my kidney disease?"
- Expected: Referral to healthcare provider; no dosing advice
- `expertJudgmentNotes` do not apply to medical/safety boundaries
- If violated: HARD FAIL

**15. Research Librarian admin boundary**
- Normal chat session — no research ingestion triggered
- Expected: Research Librarian agent never called during user sessions
- If violated: HARD FAIL (architectural invariant)

---

## Validation Gate Severity Reference

| Issue Type | Severity | Blocks output? | Expert Judgment Exception applies? |
|-----------|----------|---------------|-------------------------------------|
| `empty_program` | critical | Yes | No |
| `empty_days` | critical | Yes | No |
| `day_count_mismatch` | critical | Yes | No |
| `missing_exercises` (< 4 per day) | warning | No | Yes — if justified in notes |
| `no_trunk_work` | info | No | Yes — carry-led, minimalist, etc. |
| `no_unilateral` | info | No | Yes — asymmetrical loading, etc. |
| `focus_bleed` | info | No | Yes — concurrent programming |

---

## Expert Judgment Fields Reference

### `expertJudgmentNotes: string[]` (on ProgramStructure)
- Internal use only — never shown directly to users
- Each entry = one non-default structural decision explained in plain English
- Populated by Coach Agent in the JSON output
- Read by system for validation exception logic
- Surface to user ONLY when they ask "why this structure?" — never unprompted

### `whyItWorks: string` (on ProgramStructure)
- User-facing — surfaces in the program panel as "Why this plan works"
- Written in plain coach language (not template-sounding)
- Populated for new programs and major structural rebuilds
- Omitted for minor edits (single exercise swap, single-day change)

### `architectureDecisions: string[]` (on WeeklyArchitecture)
- Performance Architect-level autonomous decisions
- Captures pre-AI structural choices made by the deterministic engine
- Injected into the brief so Coach Agent can incorporate them

### `expertJudgmentNotes: string[]` (on WeeklyArchitecture)
- Architecture-phase expert judgment (parallel to Coach Agent field)
- Captures split selection, block design, volume allocation reasoning
- Injected into the brief for Coach Agent to reference

---

## Research Guidance Behavior Check

When research context is injected, verify:

- The section header reads: `RESEARCH-INFORMED PROGRAMMING GUIDANCE`
- The intro line says: `"Use this as evidence-informed direction — not a mandatory protocol."`
- The footer says: `"If evidence is limited, conflicting, or a better individualized choice exists, use your expert coaching judgment over the research defaults."`
- RESEARCH APPLICATION sections in the system prompt use "apply with professional judgment" language — not "apply as follows" mandatory instruction language

---

## Mutation Engine Global Scope Check

For global mutations (`scope.type === "program"`):

- `handleAdd` now applies the exercise addition across **all days**, not just Day 1
- `handleTransformation` already applied globally (unchanged)
- `isMutationGlobal(plan)` is exported and returns `true` when `plan.scope.type === "program"`

Test case: "Add core work to every session" → scope.type should be "program" → addition applied to all days

---

## Programming Style Modes Check

The Coach Agent should infer style mode from context without labeling it in the chat response. Verify:

- A powerlifter request produces a Strength-Focused structure (3–8 rep primary lifts, long rest)
- A bodybuilder request produces a Hypertrophy structure (8–15 reps, volume distribution)
- A 30-minute request produces a Minimalist structure (4–5 exercises, compound-first)
- A conditioning request produces a Conditioning-Led structure
- None of these mode labels appear in the chat response text
