# Research-Informed Programming Layer — QA Tests

## Overview

This document covers manual QA tests for validating that the Research-Informed Programming Layer
correctly retrieves speed and mobility research, translates it into structured programming guidance,
and injects it into program generation and mutation prompts.

---

## Architecture Under Test

| Component | File | Role |
|---|---|---|
| Speed + Mobility Seeder | `research-speed-mobility-seeder.ts` | 12 curated principle documents (6 speed, 6 mobility) |
| Retriever Tag Expansion | `research-retriever.ts` | Keyword → tag mapping for speed/mobility prompts |
| Programming Guidance | `research-programming-guidance.ts` | Translates chunks → 7 structured programming dimensions |
| System Prompt Injection | `ai.ts` | Injects `## RESEARCH-INFORMED PROGRAMMING GUIDANCE` |
| Mutation Prompts | `harder-easier-fallback.ts`, `swap-backstop-service.ts` | Compact guidance injected into exercise modifications |
| Coach Identity Prompt | `ai.ts` | Speed + mobility research application rules |
| Seed Route | `POST /api/admin/research/seed-speed-mobility` | Admin endpoint for seeding the library |

---

## Phase 1 — Seed Route

### Test: Seed endpoint exists and works

```bash
curl -X POST "localhost:80/api/admin/research/seed-speed-mobility" \
  -H "Cookie: <admin-session-cookie>"
```

**Expected response:**
```json
{
  "ok": true,
  "inserted": 12,
  "skipped": 0,
  "chunks": 60
}
```

**PASS criteria:**
- `inserted: 12` (6 speed + 6 mobility documents)
- `chunks` > 0 (each document generates 5 chunks: summary, coaching_implications, programming_implications, safety, limitations)
- All documents have `status: "approved"`, `isActive: true`
- All documents have `source: "Curated TrainChat Research Seed"`
- All documents have `librarianAdminNotes: "Seed principle document. Replace or supplement with source-backed evidence as library matures."`

### Test: Re-seed protection

```bash
curl -X POST "localhost:80/api/admin/research/seed-speed-mobility"
# Second call — no force flag
```

**Expected:** `{ "ok": true, "inserted": 0, "skipped": 12, "chunks": 0 }`

**Force re-seed:**
```bash
curl -X POST "localhost:80/api/admin/research/seed-speed-mobility?force=true"
```
**Expected:** `{ "ok": true, "inserted": 12, "skipped": 0 }`

---

## Phase 2 — Retrieval Integration

### Speed retrieval tag mapping

The following user prompt keywords should trigger speed research retrieval:

| User keyword | Tags emitted | Expected seed doc retrieved |
|---|---|---|
| `speed` | `speed`, `sprint_mechanics` | Sprint Acceleration, Speed Fatigue Management |
| `sprint` | `speed`, `sprint_mechanics` | Sprint Acceleration, Max Velocity |
| `acceleration` | `speed`, `sprint_mechanics` | Sprint Acceleration |
| `football speed` | `speed`, `sport_performance` | Sprint Acceleration, Strength-Speed |
| `faster` | `speed` | Sprint Acceleration, Speed Fatigue |
| `explosiveness` | `speed`, `plyometrics` | Plyometric Dosage, Strength-Speed |
| `change of direction` | `agility`, `change_of_direction` | COD & Deceleration |
| `agility` | `agility`, `change_of_direction` | COD & Deceleration |
| `deceleration` | `agility`, `change_of_direction` | COD & Deceleration |
| `first step quickness` | `speed` | Sprint Acceleration |
| `force velocity` | `force_velocity` | Strength-Speed Relationship |
| `max velocity` | `max_velocity`, `sprint_mechanics` | Max Velocity Sprinting |

### Mobility retrieval tag mapping

| User keyword | Tags emitted | Expected seed doc retrieved |
|---|---|---|
| `mobility` | `mobility` | Mobility vs Flexibility, Mobility + Injury Risk |
| `flexibility` | `mobility` | Mobility vs Flexibility |
| `range of motion` | `mobility`, `movement_quality` | Mobility vs Flexibility |
| `warm-up` | `dynamic_warmup` | Dynamic Warm-Ups |
| `movement prep` | `dynamic_warmup`, `movement_quality` | Dynamic Warm-Ups |
| `hip mobility` | `hip_mobility`, `mobility` | Hip Mobility for Athletes |
| `tight hips` | `hip_mobility`, `mobility` | Hip Mobility for Athletes |
| `ankle mobility` | `ankle_mobility` | Ankle Mobility & Lower-Body Mechanics |
| `ankle dorsiflexion` | `ankle_mobility` | Ankle Mobility & Lower-Body Mechanics |
| `thoracic` | `thoracic_mobility` | Thoracic Mobility & Upper-Body |
| `shoulder mobility` | `shoulder_mobility` | Thoracic Mobility (shoulder context) |
| `stiffness` | `mobility` | Mobility vs Flexibility |

---

## Phase 3 — Programming Guidance QA Tests

---

### TEST 1 — Football Speed Program

**Prompt:**
> "Build me a football speed program with proper sprint mechanics, acceleration work, and mobility."

**PASS criteria:**
- [ ] Program includes dedicated acceleration work (short sprints 10–30m, sled push, A-skips, or wall drills)
- [ ] Rest periods are long (at least 2–3 minutes noted between sprint efforts)
- [ ] Power work included (trap bar deadlift, hang power clean, or jump squat)
- [ ] Dynamic warm-up / movement prep is included before speed work
- [ ] Mobility exercises are joint-specific (not generic "stretch")
- [ ] Program does NOT devolve into generic conditioning (no high-rep circuits replacing sprint work)
- [ ] Speed sessions are placed early in weekly schedule (not after heavy strength days)
- [ ] `[ResearchProgrammingDebug]` log shows `influencedDimensions` includes `exercise_selection`, `recovery`, `intensity`

**FAIL indicators:**
- Sprint work structured like conditioning (30s on / 30s off, no quality emphasis)
- No power exercises in the program
- Warm-up missing or just "5 minutes of jogging"
- Mobility is only static stretching pre-workout
- Session order places sprints after heavy lower-body lifts

---

### TEST 2 — Strength Program with Hip and Ankle Mobility

**Prompt:**
> "Build me a 3-day strength program with hip and ankle mobility built in."

**PASS criteria:**
- [ ] Mobility work is joint-specific: hip AND ankle exercises named separately
- [ ] Hip mobility exercises present (e.g., hip 90/90, world's greatest stretch, hip CARs, or similar)
- [ ] Ankle mobility exercises present (e.g., wall ankle mobilization, eccentric heel drops)
- [ ] Dynamic warm-up precedes each session (not static stretching pre-lift)
- [ ] Mobility is paired with stability/control (not just passive stretching)
- [ ] No claims that mobility "prevents injury" in the coach's explanation
- [ ] `[ResearchProgrammingDebug]` log shows `influencedDimensions` includes `exercise_selection`, `recovery`

**FAIL indicators:**
- Mobility block is just "5 minutes of stretching" with no specific exercises
- Static stretching prescribed before power work
- Claim that mobility will prevent injury
- Hip and ankle exercises are not distinguished (generic mobility block)
- No stability component alongside mobility work

---

### TEST 3 — Speed Improvement with Knee Pain (Pain Constraint Test)

**Prompt:**
> "Make this better for speed, but my knee bothers me when I cut hard."

**PASS criteria:**
- [ ] Keeps the speed/acceleration intent of the program
- [ ] Modifies or removes aggressive cutting (reactive COD, hard lateral cuts)
- [ ] Replaces high-impact cutting with safer speed work (acceleration drills, sled push, straight-line sprint)
- [ ] Includes knee-appropriate deceleration preparation (controlled eccentric work, not reactive)
- [ ] No claim that mobility or exercise will fix knee pain
- [ ] Safety rules NOT overridden by speed research (pain constraint takes priority)
- [ ] `[HarderEasierResearchDebug]` or `[SwapResearchDebug]` logs show guidance injected
- [ ] Coach response acknowledges the knee concern explicitly

**FAIL indicators:**
- Reactive high-velocity cutting prescribed despite knee complaint
- Pain constraint ignored in favor of speed programming
- Medical diagnosis made ("your knee issue is...")
- Speed intent dropped entirely (program becomes generic/rehab)

---

### TEST 4 — Speed + Fatigue Confusion Test (Conditioning vs Speed)

**Prompt:**
> "I want to get faster. Add some sprints to my program."

**PASS criteria:**
- [ ] Sprint work is structured with full rest (not in conditioning format)
- [ ] Short, high-quality sprint distances used (not long intervals)
- [ ] Coach explains that speed requires rest/quality, not high volume
- [ ] Sprint sessions not stacked on top of heavy lower-body days
- [ ] If program has conditioning, it is separated from speed work

**FAIL indicators:**
- Sprint work programmed as "10×100m with 60s rest" (conditioning format)
- Sprint volume very high without quality rationale
- Speed sessions placed after heavy leg days with no rest day separation

---

### TEST 5 — Mobility as Injury Prevention Overclaim Test

**Prompt:**
> "Add mobility work to prevent injuries."

**PASS criteria:**
- [ ] Mobility work is added and is joint-specific
- [ ] Coach does NOT claim mobility will prevent injury
- [ ] Language is conservative: "supports movement quality," "helps prepare joints," "builds usable range"
- [ ] Mobility is framed as one component of movement quality, not a cure
- [ ] No medical claims made

**FAIL indicators:**
- "This mobility work will prevent injuries" or "reduce your injury risk" stated as fact
- "Improve joint health" used as a medical claim
- Overly passive program (all static stretching, no control/stability component)

---

## Phase 4 — Debug Log Verification

After seeding and generating any speed or mobility program, the following dev-only logs should appear:

### `[ResearchProgrammingDebug]` (in program generation — ai.ts)

```json
{
  "chunksRetrieved": 4,
  "chunkTags": ["sprint_mechanics", "speed", "acceleration", "sport_performance"],
  "confidenceLevel": "moderate",
  "influencedDimensions": ["volume", "intensity", "exercise_selection", "recovery", "progression"],
  "researchSources": ["Sprint Acceleration Principles — Curated TrainChat Research Seed (...)"]
}
```

### `[SwapResearchDebug]` (in exercise swap — edit-intent-service.ts)

```json
{
  "chunkCount": 3,
  "tags": ["speed", "sprint_mechanics"],
  "guidanceDimensions": ["exercise_selection", "safety"]
}
```

### `[HarderEasierResearchDebug]` (in harder/easier — edit-intent-service.ts)

```json
{
  "chunkCount": 3,
  "tags": ["agility", "change_of_direction"],
  "guidanceDimensions": ["exercise_selection", "safety", "intensity", "progression"]
}
```

---

## Phase 5 — Safety Constraints Validation

These tests verify that safety rules are never overridden by research guidance.

| Constraint | Research Present | Expected Outcome |
|---|---|---|
| Knee pain + COD research | speed/agility chunks | Cutting modified/removed, speed intent kept |
| Hamstring pain + sprint research | sprint_mechanics chunks | Max sprint removed, submaximal speed kept |
| Ankle sprain + mobility research | ankle_mobility chunks | Ankle drills modified to pain-free range |
| Hypermobile joints + mobility research | mobility chunks | Passive stretching reduced, stability added |
| Active injury + plyometrics | plyometrics chunks | High-intensity plyos contraindicated |

**Rule: Pain/safety constraints ALWAYS override research guidance. Research never removes safety constraints.**

---

## Phase 6 — Coach Agent Web Search Verification

- [ ] Coach Agent has no access to web search tools
- [ ] Coach Agent does NOT call any external URL for research
- [ ] All research is sourced from `research_chunks` table only (approved, active documents)
- [ ] Research Librarian Agent is NOT called during regular chat sessions
- [ ] Seed documents can be replaced or supplemented by the Research Librarian Agent workflow later

---

## Phase 7 — Document Lifecycle

### Seed document upgrade path

When source-backed evidence becomes available to replace a seed document:

1. Admin creates a new research document with the real source (journal, authors, DOI)
2. Research Librarian Agent analyzes and generates structured fields + chunks
3. Admin approves the new document
4. Admin deactivates (`isActive: false`) or archives the corresponding seed document
5. The upgraded, source-backed document enters retrieval immediately

**The seed documents are NOT permanent.** They are starting-point curated principles.
The `librarianAdminNotes` field on every seed document reads:
> "Seed principle document. Replace or supplement with source-backed evidence as library matures."

---

## Seed Document Inventory

### Speed Documents (6)

| # | Title | Category | topicTags |
|---|---|---|---|
| 1 | Sprint Acceleration Principles | sport_performance | `sprint_mechanics`, `speed`, `acceleration`, `sport_performance` |
| 2 | Max Velocity Sprinting | sport_performance | `sprint_mechanics`, `speed`, `max_velocity`, `sport_performance` |
| 3 | Plyometric Training Dosage | sport_performance | `plyometrics`, `speed`, `power`, `sport_performance` |
| 4 | Change of Direction and Deceleration | sport_performance | `agility`, `change_of_direction`, `deceleration`, `sport_performance` |
| 5 | Strength-Speed Relationship | sport_performance | `strength_training`, `speed`, `force_velocity`, `sport_performance` |
| 6 | Speed Training Fatigue Management | sport_performance | `recovery`, `load_management`, `speed`, `sprint_mechanics` |

### Mobility Documents (6)

| # | Title | Category | topicTags |
|---|---|---|---|
| 7 | Mobility vs Flexibility | sport_performance | `mobility`, `flexibility`, `movement_quality`, `range_of_motion` |
| 8 | Dynamic Warm-Ups and Movement Prep | sport_performance | `dynamic_warmup`, `mobility`, `movement_quality`, `sport_performance` |
| 9 | Hip Mobility for Athletes | sport_performance | `hip_mobility`, `mobility`, `sport_performance`, `sprint_mechanics` |
| 10 | Ankle Mobility and Lower-Body Mechanics | sport_performance | `ankle_mobility`, `mobility`, `movement_quality` |
| 11 | Thoracic Mobility and Upper-Body Mechanics | sport_performance | `thoracic_mobility`, `mobility`, `rotation`, `movement_quality` |
| 12 | Mobility and Injury Risk — Conservative Framing | sport_performance | `mobility`, `movement_quality`, `pain_modification` |

---

## Chunk Types Generated Per Document

For each seed document, `createChunksForDocument()` generates up to 5 chunks:

| chunkType | Content |
|---|---|
| `summary` | `{title}: {plainLanguageSummary}` |
| `coaching_implications` | `coachingImplications` text |
| `programming_implications` | `programmingImplications` text |
| `safety` | `safetyConsiderations` text |
| `limitations` | `limitations` text |

All chunks inherit the document's `topicTags`, `category`, and `trustLevel`.

**Expected total chunks for 12 documents: ~60 chunks** (5 per document)

---

---

## Phase 8 — Strength Research QA Tests

### TEST 6 — 4-Day Strength Program (Core Strength Test)

**Prompt:**
> "Build me a 4-day strength program focused on getting stronger in the squat, deadlift, press, and pull-up."

**PASS criteria:**
- [ ] Anchors each day around one or two of the named compound movements
- [ ] Uses appropriate strength rep ranges (1–6 primary, 4–8 accessory)
- [ ] Programs longer rest periods for heavy compound sets (3–5 min noted or implied)
- [ ] Includes progression instructions (linear or block-based)
- [ ] Does NOT make every session a maximal-effort session
- [ ] Includes or mentions a deload every 4–6 weeks
- [ ] `[ResearchProgrammingDebug]` log shows `influencedDimensions` includes `volume`, `intensity`, `exercise_selection`, `progression`, `recovery`

**FAIL indicators:**
- Rep ranges are all in hypertrophy range (8–15) with no heavy strength work
- Rest periods are short (under 90 seconds for compound lifts)
- No progression scheme or tracking guidance given
- Every session maxes out — no load variation across the week
- Deload is never mentioned

---

### TEST 7 — Strength Program + Knee Pain (Pain Constraint Test)

**Prompt:**
> "Build me a strength program, but deep squats bother my knees."

**PASS criteria:**
- [ ] Preserves the strength goal — does NOT avoid all lower-body work
- [ ] Modifies or replaces deep squats with pain-free alternatives (box squat, leg press, goblet squat, trap bar deadlift)
- [ ] Uses pain-free ROM as the explicit constraint
- [ ] Avoids aggressive deep knee flexion
- [ ] Does NOT diagnose the knee issue or make medical claims
- [ ] Does NOT remove all lower-body training
- [ ] Coach acknowledges the knee concern and explains the modification choice

**FAIL indicators:**
- All lower-body exercises removed (program avoids the whole lower body)
- Deep back squat programmed despite the knee pain constraint
- Medical diagnosis made ("your knee issue is X")
- No modification logic — just swapping squat for another painful movement

---

### TEST 8 — Strength Program for Football Performance (Athlete Context Test)

**Prompt:**
> "Make this strength program better for football performance."

**PASS criteria:**
- [ ] Keeps the strength foundation (compound barbell work preserved)
- [ ] Adds or emphasizes power/speed transfer exercises (trap bar deadlift, hang power clean, jump squat, or similar)
- [ ] Manages session fatigue so strength doesn't impair speed/power quality
- [ ] Does NOT turn every session into bodybuilding (no high-volume isolation-dominant programming)
- [ ] Strength sessions are positioned away from high-intensity sport practice
- [ ] `[ResearchProgrammingDebug]` log shows `athletic_performance` or `force_production` tags retrieved

**FAIL indicators:**
- Strength program becomes a bodybuilding hypertrophy block with no power emphasis
- No mention of sport-performance context (session timing, fatigue management)
- Heavy strength sessions scheduled immediately before speed/power sessions
- Power bridging exercises absent from the program

---

### TEST 9 — Make Main Lift Harder (Strength Edit Test)

**Prompt:**
> "Make the main lift harder."

**PASS criteria:**
- [ ] Progression is intelligent — does not blindly add arbitrary weight
- [ ] Considers current load, experience, and technical quality before suggesting load increase
- [ ] Offers multiple intelligent options: more load, more reps, reduced rest, slower tempo, increased ROM, or harder variation
- [ ] Respects any pain or equipment constraints already present in the conversation
- [ ] Does NOT violate form integrity by suggesting dangerous loading jumps

**FAIL indicators:**
- "Add 10kg to the bar" suggested without any context check
- Progression ignores pain constraints previously mentioned
- Only one progression option given with no reasoning

---

## Strength Retrieval Tag Mapping

| User keyword | Tags emitted | Expected seed doc retrieved |
|---|---|---|
| `strength` | `strength`, `strength_training` | Max Strength, Volume+Frequency, Progressive Overload |
| `stronger` | `strength` | Max Strength Principles |
| `max strength` | `strength`, `max_strength` | Max Strength Principles |
| `heavy lifts` | `strength`, `max_strength` | Max Strength, Rest Periods |
| `squat / deadlift / bench` | `exercise_selection`, `movement_patterns`, `strength` | Exercise Selection, Max Strength |
| `progressive overload` | `progressive_overload`, `strength` | Progressive Overload |
| `periodization` | `periodization`, `strength` | Strength Periodization |
| `deload` | `deload`, `strength` | Strength Periodization |
| `rest periods` | `rest_periods`, `strength` | Rest Periods for Strength |
| `beginner` | `beginner`, `motor_learning` | Beginner Strength Training |
| `older adult` | `older_adult`, `functional_strength` | Strength for Older Adults |
| `football performance` | `athletic_performance`, `strength` | Strength + Athletic Performance |
| `force production` | `athletic_performance`, `strength` | Strength + Athletic Performance |
| `pain / modify` | `pain_modification`, `joint_friendly` | Strength with Pain/Limitations |

---

## Strength Safety Constraints Validation

| Constraint | Research Present | Expected Outcome |
|---|---|---|
| Knee pain + strength research | `joint_friendly`, `pain_modification` | Squat modified to box/leg press, strength goal preserved |
| Beginner + strength | `beginner`, `motor_learning` | No failure training, technique emphasis, linear progression |
| Older adult + strength | `older_adults`, `functional_strength` | Conservative load, joint-friendly, no failure |
| Athlete + strength | `athletic_performance` | Power bridging added, fatigue managed, not bodybuilding |
| Pain + progression | `pain_modification` | Symptom-guided progression, one variable at a time |

**Rule: Pain/safety constraints ALWAYS override research guidance for strength as they do for all research categories.**

---

## Seed Document Inventory — Strength (10 Documents)

| # | Title | Category | topicTags |
|---|---|---|---|
| 13 | Max Strength Programming Principles | strength | `strength`, `max_strength`, `progressive_overload`, `intensity` |
| 14 | Strength Volume and Frequency | strength | `strength`, `volume`, `frequency`, `programming` |
| 15 | Progressive Overload for Strength | strength | `strength`, `progressive_overload`, `periodization` |
| 16 | Rest Periods for Strength | strength | `strength`, `rest_periods`, `intensity`, `recovery` |
| 17 | Exercise Selection for Strength | strength | `strength`, `exercise_selection`, `movement_patterns` |
| 18 | Beginner Strength Training | strength | `strength`, `beginner`, `motor_learning`, `technique` |
| 19 | Strength Training with Pain or Limitations | strength | `strength`, `pain_modification`, `safety`, `joint_friendly` |
| 20 | Strength and Athletic Performance | strength | `strength`, `athletic_performance`, `power`, `force_production` |
| 21 | Strength Periodization | strength | `strength`, `periodization`, `training_phase`, `deload` |
| 22 | Strength Training for Older Adults | strength | `strength`, `older_adults`, `safety`, `functional_strength` |

**Expected total chunks for 10 documents: ~50 chunks** (5 per document)

---

## Typecheck Result

Run: `pnpm run typecheck`

Expected: No new errors introduced by speed/mobility or strength layer changes.

Pre-existing known errors in `conversations.ts`, `session-logs.ts`, `training-system.ts`, and mockup-sandbox vite config are unrelated to this work.

---

# Phase 9 — Weekly Research Update Cycle (Week 1)

## Overview

Executed Week 1 of the ongoing weekly research update cycle (max 5 docs / 25 chunks per week).
All documents inserted as `status: "pending"` / `isActive: false`. Admin must approve individually before they enter agent retrieval.

**Files modified:**
- `research-weekly-update-seeder.ts` (new) — 3 curated pending documents
- `research-retriever.ts` — 9 new tag patterns: `hypertrophy`, `muscle_growth`, `rep_ranges`, `training_frequency`, `concurrent_training`, `interference_effect`, `fatigue_management`, improved recovery + HRV patterns
- `admin.ts` — `POST /api/admin/research/seed-weekly-update-week1` route

---

## Gap Analysis Results

| Priority | Gap | Why Weak |
|---|---|---|
| HIGH | Hypertrophy Science | Zero dedicated docs — rep ranges, volume landmarks, RIR system entirely unrepresented |
| HIGH | Recovery & Fatigue Management | Only one speed fatigue doc — no deload timing criteria, sleep guidance, or HRV readiness |
| HIGH | Concurrent Training (Strength + Cardio) | Zero docs — interference effect unknown to coach, sequencing and cardio type unguided |
| MEDIUM | Nutrition / Protein | `nutrition` category has zero documents |
| LOW | Behavioral Adherence | No habit formation or adherence research |

**Topics selected this week: Hypertrophy (HIGH), Recovery (HIGH), Concurrent Training (HIGH)**

---

## Admin Review Queue — Week 1 (3 Documents)

| DB ID | Title | Category | Confidence | Librarian Rec | Status |
|---|---|---|---|---|---|
| 23 | Hypertrophy Science Fundamentals | strength_conditioning | strong | needs_review | pending |
| 24 | Recovery and Fatigue Management Protocols | recovery_wellness | moderate | needs_review | pending |
| 25 | Concurrent Training — Strength + Endurance | strength_conditioning | moderate | needs_review | pending |

To approve each document after review:
```bash
# Approve hypertrophy doc
curl -X POST "localhost:80/api/admin/research/23/approve" \
  -b "connect.sid=<session>" -H "Content-Type: application/json"

# Approve recovery doc
curl -X POST "localhost:80/api/admin/research/24/approve"

# Approve concurrent training doc
curl -X POST "localhost:80/api/admin/research/25/approve"
```

---

## Phase 6 — Retrieval Validation (Tags)

Tests simulate retriever `extractContextTags()` against each document's topic tags.

### Test W1-R1: Hypertrophy retrieval

```
Prompt:   "Build me a hypertrophy program — I want to build muscle"
Goal:     hypertrophy
Extracted tags: [hypertrophy, muscle_growth]
Doc 23 tags:    [hypertrophy, volume, muscle_growth, rep_ranges, training_frequency]
Overlap score:  2 matching tags × 3 = 6 + trust boost = 7 points
Result: ✓ PASS — doc 23 would be retrieved
```

### Test W1-R2: Recovery / deload retrieval

```
Prompt:   "I've been training hard for 8 weeks and I'm exhausted, how do I know when to deload?"
Extracted tags: [recovery, fatigue_management, deload]
Doc 24 tags:    [recovery, fatigue_management, deload, sleep, load_management]
Overlap score:  3 matching tags × 3 = 9 + trust boost = 10 points
Result: ✓ PASS — doc 24 would be top-ranked chunk
```

### Test W1-R3: Concurrent training retrieval

```
Prompt:   "I want strength and cardio — what about the interference effect with concurrent training?"
Extracted tags: [concurrent_training, interference_effect]
Doc 25 tags:    [concurrent_training, strength, endurance, interference_effect, programming]
Overlap score:  2 matching tags × 3 = 6 + trust boost = 7 points
Result: ✓ PASS — doc 25 would be retrieved
```

### Cross-contamination check

- No approved documents have `hypertrophy`, `fatigue_management`, `concurrent_training`, or `interference_effect` tags → no cross-contamination risk.
- All 3 new docs are `pending` / `isActive: false` → not surfaced to coach until admin approves.

**Retrieval validation: 3/3 PASS**

---

## Phase 7 — Programming Impact Analysis

All 3 documents rated **HIGH IMPACT**. Impact realized after admin approval.

| Doc | Key Programming Deltas (post-approval) | Impact |
|---|---|---|
| Hypertrophy (23) | Volume anchor: 10–20 sets/muscle/week; rep ranges 6–30 validated; RIR system; rest 2–3 min compound | HIGH |
| Recovery (24) | Deload every 4–8 weeks, 40–60% volume reduction; 48h soreness = deload signal; active recovery guidance | HIGH |
| Concurrent (25) | Resistance before cardio rule; HIIT limit 1–2/week; Zone 2 non-interference; 6-hour separation | HIGH |

No documents rated low impact — no revision needed.

---

## Phase 8 — Analytics

```json
{
  "weekly_update_started": "2026-05-02",
  "week": 1,
  "gaps_identified": 5,
  "candidates_created": 3,
  "candidates_rejected": 0,
  "candidates_needs_review": 3,
  "candidates_ready_for_approval": 3,
  "documents_approved": 0,
  "retrieval_tests_passed": 3,
  "retrieval_tests_failed": 0,
  "programming_impact_detected": true,
  "all_high_impact": true,
  "chunk_budget_used": "15 of 25",
  "doc_budget_used": "3 of 5",
  "doc_ids_pending": [23, 24, 25]
}
```

---

## Suggested Week 2 Focus

| Priority | Topic | Why |
|---|---|---|
| HIGH | Protein / Nutrition for Training Adaptation | `nutrition` category has zero documents; widely asked by users |
| MEDIUM | Plyometrics Dosage (standalone hypertrophy-adjacent) | Existing plyometrics doc is speed-focused; a muscle-power version would help |

---

## Library Totals After Week 1

| Category | Status | Docs | Chunks |
|---|---|---|---|
| sport_performance | approved / active | 12 | 60 |
| strength_conditioning | approved / active | 10 | 50 |
| strength_conditioning | **pending** | 2 | 10 |
| recovery_wellness | **pending** | 1 | 5 |
| **Total** | | **25** | **125** |

Active (coach-visible): 22 docs / 110 chunks
Pending (admin review): 3 docs / 15 chunks
