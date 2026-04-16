/**
 * Edit Intent Service — Phase 2 + Phase 3
 *
 * Interprets natural language modification requests and produces
 * a machine-readable edit plan that the EditEngine can apply to
 * the structured training system.
 *
 * Phase 3 addition: TargetContext allows the caller to pass explicit
 * object IDs into the interpretation flow, focusing the AI on a specific
 * exercise, session, week, or phase.
 */

import { logger } from "./logger";
import { buildSwapContext, getProgressions, findExerciseByName } from "./exercise-service";
import { resolveHarderEasierFallback } from "./harder-easier-fallback";
import {
  classifyExerciseFamily,
  getExerciseFamilySchema,
  resolveField,
  resolutionToUpdates,
  validateTrainingConstraints,
  type LogicalField,
  type FieldResolution,
  type FieldForbiddenResult,
  type ConstraintOutcome,
} from "./prescription-schema";

// ─── Edit Plan Types ─────────────────────────────────────────────────────────

export type EditScope = "exercise" | "session" | "week" | "block" | "system";

export type EditChangeType =
  | "add_exercise"
  | "update_exercise"
  | "replace_exercise"
  | "delete_exercise"
  | "update_session"
  | "update_week"
  | "update_phase";

export interface EditChange {
  type: EditChangeType;
  id: number;
  sessionId?: number;
  exercise?: {
    name: string;
    category?: string;
    sets?: number;
    reps?: string;
    rest?: string;
    tempo?: string;
    notes?: string;
  };
  updates?: Record<string, unknown>;
  replacement?: {
    name: string;
    category?: string;
    sets?: number;
    reps?: string;
    rest?: string;
    tempo?: string;
    notes?: string;
  };
  reason?: string;
}

export interface EditPlan {
  intent: string;
  scope: EditScope;
  changeSummary: string;
  changes: EditChange[];
  /** Developer-only routing trace — never rendered in UI */
  _debugRoute?: {
    openaiCalled: boolean;
    openaiSucceeded: boolean;
    /** deterministic = fast sync rules, no OpenAI; rule_based = rules used as fallback after OpenAI failed */
    pathUsed: "openai" | "library_progression" | "rule_based" | "deterministic";
    rejectionReason?: string;
  };
}

// ─── Target Context (Phase 3) ─────────────────────────────────────────────────

export interface TargetContext {
  type: "exercise" | "session" | "week" | "phase";
  id: number;
  label?: string;
  parentLabel?: string;
}

// ─── Default Execution Layer ──────────────────────────────────────────────────
//
// Resolves natural-language day/session/week references into a concrete
// TargetContext BEFORE OpenAI is called. This eliminates the most common
// source of "no changes applied" outcomes by ensuring the AI receives an
// explicit entity ID instead of trying to infer it from the serialized system.
//
// Priority order:
//  1. UIContext explicit selection (selectedSessionId, selectedExerciseId, …)
//  2. "day N" / "session N" → Nth training session across the whole system
//  3. Ordinal words ("first session", "second day") → same positional logic
//  4. "week N" → Nth week by weekNumber
//  5. Session label keyword match ("upper body", "push day", etc.)
//  6. undefined → let OpenAI reason from the serialized system alone

export function resolveTargetFromRequest(
  userRequest: string,
  system: any,
  uiContext?: Record<string, unknown> | null
): TargetContext | undefined {
  // ── Priority 1: UIContext explicit selection ──────────────────────────────
  if (uiContext?.selectedExerciseId && uiContext.selectedExerciseName) {
    return {
      type: "exercise",
      id: uiContext.selectedExerciseId as number,
      label: uiContext.selectedExerciseName as string,
    };
  }

  if (uiContext?.selectedSessionId) {
    return {
      type: "session",
      id: uiContext.selectedSessionId as number,
      label: (uiContext.selectedSessionName as string | null | undefined) ?? undefined,
    };
  }

  if (uiContext?.selectedWeek != null) {
    const targetWeekNum = uiContext.selectedWeek as number;
    for (const phase of system.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        if (week.weekNumber === targetWeekNum) {
          return { type: "week", id: week.id, label: week.label ?? `Week ${targetWeekNum}` };
        }
      }
    }
  }

  // ── Collect all training sessions (non-rest, in document order) ───────────
  const allSessions: { id: number; label: string; weekLabel?: string }[] = [];
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      for (const session of week.sessions ?? []) {
        if (!session.isRestDay) {
          allSessions.push({
            id: session.id,
            label: session.label ?? "Session",
            weekLabel: week.label ?? undefined,
          });
        }
      }
    }
  }

  // ── Collect all weeks ─────────────────────────────────────────────────────
  const allWeeks: { id: number; weekNumber: number; label?: string }[] = [];
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      allWeeks.push({ id: week.id, weekNumber: week.weekNumber, label: week.label });
    }
  }

  const lower = userRequest.toLowerCase();

  // ── Priority 2: "day N" / "session N" → positional session ───────────────
  const dayNumMatch = lower.match(/\bday\s+(\d+)\b/) ?? lower.match(/\bsession\s+(\d+)\b/);
  if (dayNumMatch) {
    const dayIndex = parseInt(dayNumMatch[1], 10) - 1;
    if (dayIndex >= 0 && allSessions[dayIndex]) {
      const s = allSessions[dayIndex];
      return { type: "session", id: s.id, label: s.label, parentLabel: s.weekLabel };
    }
  }

  // ── Priority 3: ordinal day words ("first session", "second day") ─────────
  const ordinalMap: Record<string, number> = {
    first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5, seventh: 6,
  };
  const ordinalMatch = lower.match(
    /\b(first|second|third|fourth|fifth|sixth|seventh)\s+(?:day|session|training\s+day)\b/
  );
  if (ordinalMatch) {
    const dayIndex = ordinalMap[ordinalMatch[1]];
    if (dayIndex != null && allSessions[dayIndex]) {
      const s = allSessions[dayIndex];
      return { type: "session", id: s.id, label: s.label, parentLabel: s.weekLabel };
    }
  }

  // ── Priority 4: "week N" → specific week ─────────────────────────────────
  const weekNumMatch = lower.match(/\bweek\s+(\d+)\b/);
  if (weekNumMatch) {
    const weekNum = parseInt(weekNumMatch[1], 10);
    const week = allWeeks.find((w) => w.weekNumber === weekNum);
    if (week) {
      return { type: "week", id: week.id, label: week.label ?? `Week ${weekNum}` };
    }
  }

  // ── Priority 5: session label keyword match ───────────────────────────────
  const labelPatterns: [RegExp, string][] = [
    [/\bupper[\s-]?body\b/, "upper"],
    [/\blower[\s-]?body\b/, "lower"],
    [/\bpush\s+day\b/, "push"],
    [/\bpull\s+day\b/, "pull"],
    [/\bleg\s+day\b|\blegs?\s+day\b/, "leg"],
    [/\bfull[\s-]?body\b/, "full"],
    [/\bback\s+day\b/, "back"],
    [/\bchest\s+day\b/, "chest"],
    [/\bshoulder\s+day\b/, "shoulder"],
    [/\barm\s+day\b/, "arm"],
    [/\bcore\s+day\b/, "core"],
    [/\bcondition(?:ing)?\s+day\b/, "condition"],
    [/\bstrength\s+day\b/, "strength"],
  ];
  for (const [pattern, keyword] of labelPatterns) {
    if (pattern.test(lower)) {
      const matched = allSessions.find((s) => s.label.toLowerCase().includes(keyword));
      if (matched) {
        return { type: "session", id: matched.id, label: matched.label, parentLabel: matched.weekLabel };
      }
    }
  }

  return undefined;
}

// ─── System Context Serializer ───────────────────────────────────────────────

export function serializeSystemForPrompt(system: any): string {
  const lines: string[] = [];

  lines.push(`TRAINING SYSTEM: ${system.name}`);
  lines.push(`Goal: ${system.overarchingGoal}`);
  lines.push(`Style: ${system.trainingStyle}`);
  lines.push(`Frequency: ${system.weeklyFrequency}x/week`);
  lines.push(`Equipment: ${system.equipmentAccess}`);
  if (system.constraints) lines.push(`Constraints: ${system.constraints}`);
  lines.push("");

  for (const phase of system.phases ?? []) {
    lines.push(`PHASE [id:${phase.id}]: ${phase.name} (${phase.status})`);
    lines.push(`  Goal: ${phase.goal}`);
    if (phase.emphasis) lines.push(`  Emphasis: ${phase.emphasis}`);
    lines.push("");

    for (const week of phase.weeks ?? []) {
      lines.push(
        `  WEEK [id:${week.id}] Week ${week.weekNumber} — ${week.label ?? ""} (${week.status}) [volume: ${week.volumeLevel}]`
      );
      if (week.focus) lines.push(`    Focus: ${week.focus}`);

      for (const session of week.sessions ?? []) {
        lines.push(
          `    SESSION [id:${session.id}]: ${session.label} (${session.sessionType}) day=${session.dayOfWeek ?? "?"}`
        );
        if (session.emphasis) lines.push(`      Emphasis: ${session.emphasis}`);
        if (session.warmupNotes) lines.push(`      Warmup: ${session.warmupNotes}`);
        if (session.coachingNotes) lines.push(`      Coaching: ${session.coachingNotes}`);

        for (const ex of session.exercises ?? []) {
          lines.push(
            `      EXERCISE [id:${ex.id}]: ${ex.name} | cat:${ex.category} | ${ex.sets}×${ex.reps} | rest:${ex.rest}${ex.notes ? ` | notes:${ex.notes}` : ""}${ex.tempo ? ` | tempo:${ex.tempo}` : ""}`
          );
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── AI Edit Prompt Builder ──────────────────────────────────────────────────

function buildEditSystemPrompt(
  systemContext: string,
  targetContext?: TargetContext,
  adaptationContext?: string,
  decisionMemoryContext?: string,
  exerciseSwapContext?: string
): string {
  let targetFocus = "";
  if (targetContext) {
    const typeLabel = targetContext.type.toUpperCase();
    const idLabel = `[id:${targetContext.id}]`;
    const nameLabel = targetContext.label ? ` "${targetContext.label}"` : "";
    const parentLabel = targetContext.parentLabel ? ` in ${targetContext.parentLabel}` : "";

    // For session targets: also provide the exact sessionId to use in add_exercise changes.
    // This prevents the AI from guessing the wrong sessionId when the user says "day N".
    const sessionIdHint = targetContext.type === "session"
      ? `\nFor any add_exercise changes, use "sessionId": ${targetContext.id} — this is the exact SESSION id for this day.`
      : "";

    targetFocus = `\nEDIT FOCUS:\nThe user is specifically targeting: ${typeLabel} ${idLabel}${nameLabel}${parentLabel}.\nFocus ALL changes on this specific object. Only expand scope if the user's request explicitly requires broader changes. Prefer targeted, surgical edits to this one object.${sessionIdHint}\n`;
  }

  const adaptationSection = adaptationContext
    ? `\n${adaptationContext}\n\nIncorporate the above readiness and adaptation signals naturally when they are relevant to the edit being requested. A coach who knows the user's current state will make smarter, more contextual recommendations.\n`
    : "";

  const decisionMemorySection = decisionMemoryContext
    ? `\n${decisionMemoryContext}\n`
    : "";

  const swapSection = exerciseSwapContext
    ? `\nEXERCISE SWAP INTELLIGENCE:\n${exerciseSwapContext}\nWhen performing a swap/replace:\n- If the user's request EXPLICITLY names a specific target exercise (e.g. "replace X with Pause Back Squat"), use EXACTLY that name — do not substitute with a candidate from the list.\n- If the user does NOT name a specific target (e.g. "swap this for something harder"), choose from the SWAP CANDIDATES or PROGRESSION OPTIONS list above.\n- Never invent exercise names not present in either the user's request or the candidates list.\n`
    : "";

  return `You are an elite performance architect editing a user's structured training system. You program according to NSCA strength & conditioning principles.

You know this athlete. You have worked with them before and remember the decisions you've made together.

You will receive:
1. The user's current structured training system (with IDs for every entity)
2. A natural language modification request
${targetFocus}${swapSection}
Your job is to produce a structured JSON edit plan.

RULES:
- Edit ONLY what the user requests. Preserve everything else.
- Do not rewrite the entire program unless explicitly asked.
- Use exact IDs from the system context.
- Prefer surgical changes (1-3 exercises, 1 session, or week-level notes) over broad rewrites.
- Maintain NSCA programming logic at all times (see NSCA STANDARDS below).
- If swapping an exercise, ALWAYS use a name from the SWAP CANDIDATES list if provided.
- If reducing volume, reduce accessory/finisher sets first (not primary lifts unless asked).
- If changing a session to recovery/mobility, update type + replace exercises with light work.
- In the changeSummary, write like a coach who KNOWS this athlete. Reference past decisions when
  directly relevant (e.g. "Building on the volume reduction we did last week..."). Use "we",
  "let's". Never say "here is your new program". Be concise but human.
- Reference injury flags or pain patterns from decision history when they are relevant.

CRITICAL — DIRECT PRESCRIPTION COMMANDS (highest priority):
When the user states an explicit numeric or field change — reps, sets, rest, load, duration, distance, height, tempo — apply it immediately and literally. Do NOT route to progression/regression or generic edit logic.
- "Increase reps to 10" → update_exercise with { "reps": "10" }
- "Make this 3 sets" → update_exercise with { "sets": 3 }
- "Lower rest to 60 sec" → update_exercise with { "rest": "60s" }
- "Use 25 lbs" → update_exercise with { "notes": "Target load: 25 lb" }
- "Make this 8 reps each side" → update_exercise with { "reps": "8 each side" }
- "Make this 30 seconds" → update_exercise with { "reps": "30s" }
- "Set distance to 8 feet" → update_exercise with { "notes": "Target distance: 8 ft" }
- "Add a 3-second pause" → update_exercise with { "tempo": "3-1-X-0" }
The changeSummary MUST confirm exactly what changed: field name + old value (if known) + new value.
Good: "Updated Shrimp Squat to 10 reps each side." Bad: "Done" or "1 change applied."

CRITICAL — SESSION COACHING TRANSFORMATION REQUESTS:
When the target is a SESSION and the request contains coaching transformation language (explosive, power, athletic, hypertrophy, strength, endurance), you MUST make REAL structural changes — not just update emphasis or coachingNotes text fields. A session-description-only response is a FAILURE.

SESSION COACHING TRANSFORMATION RULES:

EXPLOSIVE / POWER SESSION ("make day 1 more explosive", "add power to this session"):
- Add 1 explosive/plyometric movement (Box Jump, Broad Jump, Jump Squat, Med Ball Slam) if none exists in the session
- Reduce primary lift reps to power range: 2-4 reps
- Add 3-1-X-0 tempo to primary lifts (3-sec eccentric, controlled pause, explosive concentric)
- Set rest to 2-3 min on primary lifts for full CNS recovery
- Reduce or remove slow high-rep hypertrophy accessories (12+ rep accessories → 8-10 or remove)
- Update session emphasis (secondary change, after structural changes)
- changeSummary MUST name specific exercise(s) added and prescription changes made (NOT "refocused toward explosive qualities")

HYPERTROPHY SESSION ("make this a hypertrophy session", "focus on muscle building"):
- Move primary lift reps to 6-10 range
- Add 1-2 isolation accessory exercises targeting the session's primary muscle group
- Extend sets on accessories by 1 set
- Set rest to 60-90s on accessories (metabolic demand)
- changeSummary must name added exercises and rep range changes

CONDITIONING SESSION ("add conditioning to this session", "make this more metabolic"):
- Add a conditioning finisher (10-15 min assault bike, rowing intervals, or similar)
- Reduce rest on accessories to 60s
- changeSummary must name the finisher and sessions affected

RULE: If a coaching transformation only produces update_session, update_week, or update_phase changes (text fields only) with NO add_exercise, replace_exercise, or update_exercise changes touching sets/reps/tempo/rest → the response is INVALID. You must include at least one structural change.

CRITICAL — BLOCK / PHASE MUTATION REQUESTS (highest priority after prescription commands):
When the target is a PHASE and the request contains a block-level mutation intent, you MUST make REAL structural changes to the sessions and exercises — not just update the phase label or notes. A phase update-only response is NOT acceptable.

BLOCK MUTATION RULES:

1. INCREASE_POWER_BIAS — "focus more on power", "more explosive work", "power bias":
   - Add 1-2 explosive/plyometric exercises (jumps, bounds, medicine ball throws) to the first slot of each lower or full-body session
   - Replace 1-2 hypertrophy/accessory sets with force-expression work (e.g., replace a leg curl set with a broad jump or box jump)
   - Update session emphasis fields to reflect power/force-expression focus
   - Update phase goal and emphasis to reflect the shift (e.g., from "Foundation Strength" to "Strength + Power")
   - Keep primary compound strength work — do NOT remove squats, deadlifts, or presses
   - changeSummary must name specific exercises added/changed and sessions affected

2. INCREASE_HYPERTROPHY_BIAS — "shift toward hypertrophy", "more muscle focus", "hypertrophy bias":
   - Move rep ranges on secondary compound exercises to 8-12+
   - Add 1-2 accessory exercises (isolation work) targeting key muscle groups in relevant sessions
   - Reduce heavy low-rep primary work slightly (but don't eliminate it)
   - Update phase emphasis and session coaching notes
   - changeSummary must name what changed in rep zones and what was added

3. INCREASE_SPORT_SPECIFICITY — "more hockey-specific", "sport-specific emphasis":
   - Add rotational, lateral, and multi-directional exercises (lateral bounds, rotational med ball throws, change-of-direction patterns)
   - Include deceleration and reactive elements in session architecture
   - Replace non-transferable isolation accessories with sport-transfer movements
   - Update session emphasis to reflect sport demand
   - changeSummary must name specific sport-transfer exercises added and which accessories were replaced

4. REDUCE_VOLUME — "reduce volume", "less total work":
   - Remove 1-2 sets from accessory exercises across the week (not primary lifts)
   - Trim finisher/conditioning work first
   - Reduce secondary compound volume before touching primary lifts
   - Update week volumeLevel fields if appropriate
   - changeSummary must name what was trimmed and from which sessions

5. SHORTEN_BLOCK — "shorten to 3 weeks", "shorter block":
   - Update phase name/notes to reflect the shorter duration
   - Update week labels to indicate compressed progression
   - changeSummary must describe the new timeline and how progression was adjusted

6. INCREASE_SPORT_SPECIFICITY (any named sport):
   - Identify the sport from the request (hockey, football, basketball, etc.)
   - Add appropriate sport-transfer work (lateral mechanics for hockey/basketball, rotational power for baseball, collision prep for football/rugby)
   - changeSummary must name the sport and list the specific exercises added

7. ENDURANCE_TRANSFORMATION — "focus more on endurance", "more endurance-based", "want to build my endurance", "shift toward aerobic":
   - Add energy-system work to ALL sessions: rowing intervals, ski erg, assault bike, or running (time-based, not mileage)
   - Reduce rest intervals on secondary compound and accessory exercises (target 60–90 sec rather than 90–120 sec)
   - Add 1 dedicated conditioning finisher (10–15 min) to at least 2 sessions per week
   - Update rep ranges on accessory lifts toward the higher end (10–15 reps) to increase metabolic demand
   - Update session emphasis and phase goal to reflect aerobic capacity focus
   - Keep all primary compound lifts — do NOT remove squats, deadlifts, or presses
   - changeSummary must name which sessions got conditioning finishers and describe the rest-interval changes

8. CONDITIONING_TRANSFORMATION — "more conditioning-based", "shift toward conditioning", "conditioning-focused":
   - Same protocol as ENDURANCE_TRANSFORMATION but with higher-intensity intervals (HIIT-style, tabata, or circuit work) rather than steady-state aerobic
   - Add conditioning circuits (3–4 exercises, minimal rest) as session finishers
   - Pair accessory exercises as supersets where possible to increase density
   - changeSummary must name specific conditioning methods added and sessions affected

9. SPEED_TRANSFORMATION — "focus more on speed", "more speed work", "shift toward speed":
   - Add acceleration/deceleration drills (10–30m sprints, agility ladder, cone patterns) to at least 2 sessions
   - Add plyometric speed-expression work (drop step bounds, resisted sprints, reactive agility) before primary lifts
   - Reduce pure hypertrophy accessory volume to make room — trim 1 set per accessory exercise
   - Update session emphasis and phase goal to reflect speed/agility focus
   - changeSummary must name specific speed drills added and what accessory volume was trimmed

10. INTENSITY_TRANSFORMATION — "make this more intense", "increase overall intensity":
    - Tighten rest intervals on all secondary and accessory exercises (15–30 sec shorter than current)
    - Increase set counts on secondary compound lifts by 1 set
    - Add a 1RM-percentage note to primary lifts if not already present (e.g., "aim for 80–85% 1RM")
    - Add tempo prescriptions to primary lifts if not already present (e.g., "3-1-X-0")
    - Update session emphasis fields to reflect intensity focus
    - changeSummary must describe what changed in rest times, set counts, and any new tempo prescriptions

BLOCK MUTATION — SCOPE AND CHANGES:
- Use scope: "block" for all block mutations
- Include update_phase change to update phase name, goal, emphasis, and notes
- Include update_session changes for session emphasis fields
- Include update_exercise / add_exercise / replace_exercise / delete_exercise for actual structural exercise changes
- Include update_week changes for volumeLevel where appropriate
- changeSummary MUST describe the structural changes made, not just "block updated"

Good changeSummary for power bias: "Shifted the Foundation Strength Block toward strength + power. Added Box Jumps to Day 1 (lower force session) and Medicine Ball Rotational Throws to Day 2. Replaced the leg curl accessory set on Day 3 with Lateral Bounds. Updated session emphases to reflect force-expression focus while keeping all primary lifts intact."
Bad changeSummary: "Block updated to increase power focus." or "Done."

CRITICAL — HARDER / EASIER REQUESTS (exercise level):
When the user says "make it harder", "make it easier", or similar:
- NEVER use a generic descriptor as the replacement exercise name. Forbidden names: "a harder variation", "an easier variation", "harder variation", "easier variation", "a progression", "a regression", "harder exercise", "easier exercise", "a harder squat variation", or any similar placeholder phrase.
- If choosing substitution: use a REAL NAMED EXERCISE from the PROGRESSION OPTIONS / REGRESSION OPTIONS injected above (if provided), or from the variation ladders below.
- If no confident real exercise name is available: apply a REAL PRESCRIPTION CHANGE to the current exercise (tempo, pause, sets, reps, rest) using update_exercise — do NOT use replace_exercise with a generic name.
- For explosive/plyometric exercises (jumps, broad jumps, bounds): NEVER add load-based progressions — use distance/height targets, set count, or variation changes.
- For trunk/core exercises (Pallof press, plank, bird dog): use lever length, pause duration, or stance changes.
- For strength primaries (squat, deadlift, bench, press): use replace_exercise with a real named variation first (see ladders below); if no clear option, add eccentric tempo (e.g. "3-1-X-0") via update_exercise.
- The changeSummary MUST state exactly what changed: real exercise name if swapped, tempo if added, reps if changed.
- Example good changeSummary: "Changed Back Squat to Pause Back Squat — same sets and reps, but the 2-second pause at the bottom eliminates the stretch reflex."
- Example bad changeSummary: "Progression cue added." or "Replaced with harder variation."

VARIATION LADDERS — use these real exercise names for substitution:

Back Squat → Harder: Pause Back Squat, Tempo Back Squat, Front Squat, Safety Bar Squat
Back Squat → Easier: Box Squat, Goblet Squat, Split Squat, Dumbbell Goblet Squat
Deadlift → Harder: Pause Deadlift, Deficit Deadlift, Romanian Deadlift (heavier)
Deadlift → Easier: Romanian Deadlift, Trap Bar Deadlift, Single-Leg Romanian Deadlift
Bench Press → Harder: Pause Bench Press, Tempo Bench Press, Close-Grip Bench Press
Bench Press → Easier: Dumbbell Bench Press, Incline Dumbbell Press, Machine Chest Press
Barbell Row → Harder: Pendlay Row, Paused Barbell Row, Single-Arm Barbell Row
Barbell Row → Easier: Chest-Supported Row, Seated Cable Row, Machine Row
Pull-Up / Chin-Up → Harder: Weighted Pull-Up, L-Sit Pull-Up, Archer Pull-Up
Pull-Up / Chin-Up → Easier: Band-Assisted Pull-Up, Ring Row, Lat Pulldown
Overhead Press → Harder: Push Press, Seated Overhead Press, Z-Press
Overhead Press → Easier: Dumbbell Overhead Press, Landmine Press, Machine Shoulder Press
Romanian Deadlift → Harder: Single-Leg Romanian Deadlift, Pause Romanian Deadlift
Romanian Deadlift → Easier: Dumbbell Romanian Deadlift, Good Morning
Hip Thrust → Harder: Single-Leg Hip Thrust, Pause Hip Thrust
Hip Thrust → Easier: Glute Bridge, Banded Glute Bridge
Dumbbell Bench Press → Harder: Pause Dumbbell Bench Press, Dumbbell Floor Press
Dumbbell Bench Press → Easier: Machine Chest Press, Cable Chest Fly
Split Squat → Harder: Rear Foot Elevated Split Squat, Walking Lunge, Barbell Split Squat
Split Squat → Easier: Goblet Squat, Step-Up, Assisted Split Squat
Dumbbell Row → Harder: Chest-Supported Dumbbell Row, Pendlay Row
Dumbbell Row → Easier: Seated Cable Row, Machine Row

NSCA STANDARDS — PRESERVE THESE IN EVERY EDIT:

1. EXERCISE ORDER (must be maintained after any edit):
   Explosive/Plyometric → Olympic/High-skill → Primary Compound → Secondary Compound → Accessory/Isolation → Conditioning
   Never place high-skill or explosive lifts after fatigue-heavy compound work.
   If inserting a new exercise, place it in the correct hierarchy position.

2. REP & INTENSITY ZONES (must be respected when changing sets/reps):
   - Primary lifts (squat, deadlift, bench): 1–6 reps | 3–6 sets | 2–5 min rest
   - Power/Olympic lifts: 1–5 reps | 3–5 sets | 2–5 min rest (max speed intent)
   - Secondary compound: 6–10 reps | 3–4 sets | 90 sec–2 min rest
   - Accessory/Isolation: 6–12 reps | 2–3 sets | 60–90 sec rest
   - Conditioning: variable / time-based | 60–90 sec rest
   Never assign short rest (60 sec) to primary or power lifts.
   Never assign strength-zone reps (1-5) to isolation exercises.

3. MOVEMENT BALANCE (must not be broken by edits):
   - Lower body session: must retain squat pattern + hinge pattern
   - Upper body session: must retain a push + a pull
   - Swapping a pull for another push = balance violation (flag and propose alternative)

4. INTENT CUES (always include when adding or updating exercises):
   Every exercise prescription must have an intent note:
   - Power/explosive: "Explosive concentric — max intent on every rep"
   - Primary: "Control the eccentric (2-3 sec), drive hard on the concentric"
   - Accessory: "Full ROM — quality and stability over load"

5. FATIGUE MANAGEMENT (never violate):
   If a swap would place a high-skill or explosive movement after a primary compound, reorder it first.

PRE-EDIT VALIDATION (run internally before producing output):
☑ Does the change preserve NSCA exercise order in affected sessions?
☑ Do new or modified reps/rest values match the exercise classification?
☑ Is movement balance (push/pull, squat/hinge) preserved?
☑ Are intent cues included in new or modified exercise entries?
Auto-correct any violations before output.

AVAILABLE CHANGE TYPES:
- add_exercise: insert a NEW exercise into a session (use sessionId — the SESSION [id:N] from the system context). Do NOT use add_exercise to replace an existing one — use replace_exercise for that.
- update_exercise: change sets, reps, rest, tempo, notes, name, category on an existing exercise
- replace_exercise: swap one exercise for a new one (provide full replacement details)
- delete_exercise: remove an exercise entirely
- update_session: change label, sessionType, emphasis, warmupNotes, cooldownNotes, coachingNotes, isRestDay on a session
- update_week: change label, focus, volumeLevel, notes on a week
- update_phase: change name, goal, emphasis, notes on a phase

SCOPE DEFINITIONS:
- exercise: only 1-3 specific exercises
- session: one full training session
- week: changes across an entire week
- block: changes to the phase/block level
- system: program-wide changes

OUTPUT FORMAT — return ONLY valid JSON, no other text:
{
  "intent": "string — brief label like reduce_volume, swap_exercise, add_exercise, change_session_type, etc.",
  "scope": "exercise|session|week|block|system",
  "changeSummary": "string — 1-4 sentences, coach-like, explaining what changed and why. Reference past decisions when relevant.",
  "changes": [
    {
      "type": "add_exercise",
      "id": 0,
      "sessionId": <integer — SESSION [id:N] from system context>,
      "exercise": { "name": "...", "category": "primary|accessory|warmup", "sets": 3, "reps": "8-10", "rest": "90s", "notes": "..." },
      "reason": "short string"
    },
    {
      "type": "update_exercise|replace_exercise|delete_exercise|update_session|update_week|update_phase",
      "id": <integer — the exact ID from the system context>,
      "updates": { ... only the fields being changed ... },
      "replacement": { "name": "...", "category": "...", "sets": 0, "reps": "...", "rest": "...", "notes": "..." },
      "reason": "short string explaining this specific change"
    }
  ]
}

CURRENT TRAINING SYSTEM:
${systemContext}${adaptationSection}${decisionMemorySection}`;
}

// ─── AI Interpretation ───────────────────────────────────────────────────────

async function interpretWithAI(
  userRequest: string,
  systemContext: string,
  targetContext?: TargetContext,
  adaptationContext?: string,
  decisionMemoryContext?: string,
  exerciseSwapContext?: string
): Promise<EditPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = buildEditSystemPrompt(systemContext, targetContext, adaptationContext, decisionMemoryContext, exerciseSwapContext);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userRequest },
        ],
        max_tokens: 1500,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, errText }, "OpenAI edit API error");
      return null;
    }

    const data = (await response.json()) as { choices: { message: { content: string } }[] };
    const raw = data.choices[0]?.message?.content ?? "{}";

    const parsed = JSON.parse(raw) as EditPlan;

    if (!parsed.changes || !Array.isArray(parsed.changes)) {
      logger.warn("AI edit plan missing changes array");
      return null;
    }

    return parsed;
  } catch (err) {
    logger.error({ err }, "Failed to interpret edit with AI");
    return null;
  }
}

// ─── Generic Placeholder Guard ────────────────────────────────────────────────
// Detects exercise names that are descriptive phrases rather than real exercise
// names. These must never be committed to the database — they are the root cause
// of "a harder variation" appearing as an exercise card title.

const GENERIC_PLACEHOLDER_PATTERNS = [
  /^(a\s+|an\s+)?(harder|easier|more difficult|less difficult|simpler|advanced|beginner|intermediate)\s+(variation|option|exercise|version|alternative|progression|regression|movement|squat variation|deadlift variation|press variation|row variation)$/i,
  /^(harder|easier)\s+(variation|option|exercise|version|alternative|progression|regression|movement)$/i,
  /^a\s+(progression|regression|substitution|alternative|modification)$/i,
  /^(more (challenging|difficult)|less (challenging|difficult))\s*(variation|option|exercise|version|alternative)?$/i,
  /^(harder|easier|simpler|advanced|beginner)\s+(squat|deadlift|bench|press|row|pull|push|hinge|lunge|carry|swing)\s+(variation|alternative|option|version)?$/i,
];

export function isGenericPlaceholder(name: string): boolean {
  if (!name || name.trim().length === 0) return true;
  return GENERIC_PLACEHOLDER_PATTERNS.some((p) => p.test(name.trim()));
}

// ─── Exercise-Aware Harder / Easier Mutation Builders ────────────────────────
// These produce REAL prescription changes, never note-only mutations.

function classifyExercise(name: string): "explosive" | "trunk" | "primary_strength" | "accessory" {
  const n = name.toLowerCase();
  if (/jump|broad jump|box jump|bound|sprint|plyometric|med ball|medicine ball|hurdle/i.test(n)) return "explosive";
  if (/pallof|anti.rotation|plank|bird.dog|dead.bug|hollow|ab wheel|landmine rot/i.test(n)) return "trunk";
  if (/squat|deadlift|bench press|barbell press|overhead press|chin.up|pull.up|dip|row|rdl|romanian/i.test(n)) return "primary_strength";
  return "accessory";
}

function buildHarderMutation(exerciseId: number, exerciseName: string): EditPlan {
  const kind = classifyExercise(exerciseName);

  if (kind === "explosive") {
    return {
      intent: "harder_variation",
      scope: "exercise",
      changeSummary: `${exerciseName} difficulty increased: rep target tightened to 4 quality reps with complete recovery between sets. Each attempt must be maximal — don't accumulate fatigue.`,
      changes: [{
        type: "update_exercise",
        id: exerciseId,
        updates: { reps: "4", notes: "Harder: each rep must be a true max-effort attempt. Full 90–120 sec rest between sets. Prioritise distance/height over volume." },
        reason: "User requested harder explosive variation — increased effort demand",
      }],
    };
  }

  if (kind === "trunk") {
    return {
      intent: "harder_variation",
      scope: "exercise",
      changeSummary: `${exerciseName} made harder: 3-second isometric hold at end range added. Full bracing required — no counter-rotation allowed.`,
      changes: [{
        type: "update_exercise",
        id: exerciseId,
        updates: { tempo: "3-0-3-0", notes: "Harder: 3-second hold at full extension/end range. Maintain complete anti-rotation throughout. Zero momentum." },
        reason: "User requested harder trunk variation — added isometric pause",
      }],
    };
  }

  if (kind === "primary_strength") {
    return {
      intent: "harder_variation",
      scope: "exercise",
      changeSummary: `${exerciseName} made harder with a 3-1-X-0 tempo: 3-second eccentric, 1-second pause at the bottom, then drive hard. Same load — this eliminates the stretch reflex and increases time under tension significantly.`,
      changes: [{
        type: "update_exercise",
        id: exerciseId,
        updates: { tempo: "3-1-X-0", notes: "Harder: 3-sec eccentric, 1-sec dead-stop pause, explosive concentric. Keep the same load — the tempo makes it dramatically harder. Maintain controlled form throughout." },
        reason: "User requested harder variation — applied eccentric tempo prescription",
      }],
    };
  }

  // Accessory: add controlled tempo and tighten reps
  return {
    intent: "harder_variation",
    scope: "exercise",
    changeSummary: `${exerciseName} made harder with a 2-1-1-0 tempo: slow concentric, 1-second hold at peak contraction, controlled return. Eliminate all momentum — full ROM, full tension.`,
    changes: [{
      type: "update_exercise",
      id: exerciseId,
      updates: { tempo: "2-1-1-0", notes: "Harder: 2-sec concentric, 1-sec squeeze at peak, 1-sec eccentric. No momentum. Full ROM every rep." },
      reason: "User requested harder accessory variation — applied tempo to eliminate momentum",
    }],
  };
}

function buildEasierMutation(exerciseId: number, exerciseName: string): EditPlan {
  const kind = classifyExercise(exerciseName);

  if (kind === "explosive") {
    return {
      intent: "easier_variation",
      scope: "exercise",
      changeSummary: `${exerciseName} adjusted to a lower-demand version: increased rest and reduced rep count. Focus on landing mechanics and full recovery between efforts.`,
      changes: [{
        type: "update_exercise",
        id: exerciseId,
        updates: { reps: "3", rest: "2 min", notes: "Easier: reduce distance or height target by 20%. Prioritise landing quality — soft knees, controlled stop. Full rest between sets." },
        reason: "User requested easier explosive variation — reduced demand",
      }],
    };
  }

  if (kind === "trunk") {
    return {
      intent: "easier_variation",
      scope: "exercise",
      changeSummary: `${exerciseName} regressed: shorter hold duration and reduced leverage. Build position stability before progressing lever length or load.`,
      changes: [{
        type: "update_exercise",
        id: exerciseId,
        updates: { tempo: "1-0-1-0", reps: "8-10", notes: "Easier: reduce lever or load. 1-second hold only. Prioritise perfect position over duration. Stop if you feel any rotation or compensation." },
        reason: "User requested easier trunk variation — reduced hold demand",
      }],
    };
  }

  if (kind === "primary_strength") {
    return {
      intent: "easier_variation",
      scope: "exercise",
      changeSummary: `${exerciseName} adjusted to a higher rep, lower intensity zone. Rep range widened to 6–8 — keep loads moderate and focus on movement quality.`,
      changes: [{
        type: "update_exercise",
        id: exerciseId,
        updates: { reps: "6-8", notes: "Easier: use a load that allows clean reps at 3+ RIR. Focus on technique and controlled eccentric. No grinding reps." },
        reason: "User requested easier variation — shifted to higher rep / lower intensity zone",
      }],
    };
  }

  // Accessory: slow tempo for quality
  return {
    intent: "easier_variation",
    scope: "exercise",
    changeSummary: `${exerciseName} adjusted to a quality-focused prescription: lighter load, wider rep range, controlled pace. Build movement competency before increasing intensity.`,
    changes: [{
      type: "update_exercise",
      id: exerciseId,
      updates: { reps: "12-15", notes: "Easier: reduce load by 20-30%. Full ROM, controlled pace. Focus on muscle connection over weight moved." },
      reason: "User requested easier accessory variation — higher rep quality zone",
    }],
  };
}

// ─── Progression-Based Fallback Plan Builder ──────────────────────────────────
// Used when AI fails and we have library progression data available.
// Produces a real replace_exercise mutation from the exercise library.

function buildProgressionFallbackPlan(
  targetContext: TargetContext,
  progressions: { easier: any[]; harder: any[] },
  direction: "harder" | "easier"
): EditPlan | null {
  const candidates = direction === "harder" ? progressions.harder : progressions.easier;
  if (candidates.length === 0) return null;

  const exerciseId = targetContext.id;
  const exerciseName = targetContext.label ?? "the exercise";
  const best = candidates[0];
  const newName = best.name as string;

  return {
    intent: direction === "harder" ? "harder_variation" : "easier_variation",
    scope: "exercise",
    changeSummary: direction === "harder"
      ? `Changed ${exerciseName} to ${newName} — a more demanding variation in the same movement pattern. Sets and reps carried over.`
      : `Changed ${exerciseName} to ${newName} — a less demanding variation to build quality volume. Sets and reps carried over.`,
    changes: [{
      type: "replace_exercise",
      id: exerciseId,
      replacement: {
        name: newName,
        notes: direction === "harder"
          ? `Progression from ${exerciseName}. Maintain the same sets/reps — the movement demand is higher. Control the eccentric.`
          : `Regression from ${exerciseName}. Build movement quality and confidence here before returning to the original.`,
      },
      reason: `User requested ${direction} variation — library match: ${newName}`,
    }],
  };
}

// ─── High-Priority Prescription Parser ───────────────────────────────────────
// Extracts direct numeric/field mutations from the user request.
// Runs BEFORE easier/harder/swap routing so "Increase reps to 10" never
// ends up in the generic chooser modal.

interface PrescriptionMutation {
  intent: string;
  field: string;
  newValue: string | number;
  summary: string;
  updates: Record<string, unknown>;
  /** Set when the requested field is forbidden for this exercise type */
  forbidden?: true;
  forbiddenMessage?: string;
  /** Raw numeric value before formatting — used by constraint validator */
  rawNumericValue?: number;
  /** Raw unit string before normalization — used by constraint validator */
  rawUnit?: string;
}

function parsePrescriptionCommand(request: string, exerciseLabel: string): PrescriptionMutation | null {
  const lower = request.toLowerCase();
  const eachSide = /\beach\s+side\b|\bper\s+side\b|\beach\s+(leg|arm)\b/.test(lower);

  // ── Internal helper: resolve via schema and build mutation ─────────────────
  function resolve(
    logicalField: LogicalField,
    numericValue: number,
    rawUnit: string
  ): PrescriptionMutation | null {
    if (numericValue <= 0) return null;

    const result = resolveField(logicalField, numericValue, rawUnit, exerciseLabel, eachSide);

    if ("forbidden" in result) {
      // The field is not valid for this exercise type — return a coach message
      return {
        intent: "prescription_blocked",
        field: logicalField,
        newValue: `${numericValue} ${rawUnit}`,
        summary: result.coachMessage,
        updates: {},
        forbidden: true,
        forbiddenMessage: result.coachMessage,
      };
    }

    const updates = resolutionToUpdates(result);

    return {
      intent: `change_${result.logicalField}`,
      field: result.logicalField,
      newValue: result.displayValue,
      summary: buildSummary(exerciseLabel, result.logicalField, result.displayValue),
      updates,
      rawNumericValue: result.numericValue,
      rawUnit: result.unit,
    };
  }

  function buildSummary(label: string, field: LogicalField | string, displayValue: string): string {
    switch (field) {
      case "reps": return `Updated ${label} to ${displayValue} reps.`;
      case "repsEachSide": return `Updated ${label} to ${displayValue}.`;
      case "sets": return `Updated ${label} to ${displayValue} sets.`;
      case "rest": return `Changed rest on ${label} to ${displayValue}.`;
      case "load": return `Set ${label} target load to ${displayValue}.`;
      case "height": return `Set ${label} box/target height to ${displayValue}.`;
      case "distance": return `Set ${label} target distance to ${displayValue}.`;
      case "duration": return `Updated ${label} to a ${displayValue} hold.`;
      case "tempo": return `Added ${displayValue} tempo to ${label}.`;
      default: return `Updated ${label} (${field}) to ${displayValue}.`;
    }
  }

  // ── TEMPO (highest priority — explicit pattern like "3-1-X-0") ────────────
  const tempoMatch = request.match(/(\d)-(\d)-([Xx\d])-(\d)/);
  if (tempoMatch) {
    const tempo = `${tempoMatch[1]}-${tempoMatch[2]}-${tempoMatch[3]}-${tempoMatch[4]}`;
    return { intent: "change_tempo", field: "tempo", newValue: tempo, summary: `Added ${tempo} tempo to ${exerciseLabel}.`, updates: { tempo } };
  }

  // ── PAUSE ("add a 3-second pause") ───────────────────────────────────────
  const pauseMatch = request.match(/(?:add\s+a?\s*)?(\d+)[- ]second\s+(?:pause|hold|stop)/i);
  if (pauseMatch) {
    const n = parseInt(pauseMatch[1], 10);
    const tempo = `${n}-1-X-0`;
    return { intent: "change_tempo", field: "tempo", newValue: tempo, summary: `Added ${n}s pause to ${exerciseLabel} (tempo ${tempo}).`, updates: { tempo } };
  }

  // ── DURATION / HOLD (before reps — catches "30 seconds" for holds) ────────
  const durationPatterns = [
    /(?:make\s+(?:this|it)|hold\s+(?:for)?|do|set(?:\s+(?:to|it))?)\s+(?:a\s+)?(\d+)[- ]*(seconds?|sec|minutes?|min)\s*(?:hold|plank|brace|iso)?/i,
    /(\d+)[- ]*(seconds?|sec|minutes?|min)\s*(?:hold|plank|brace|iso)/i,
  ];
  for (const re of durationPatterns) {
    const m = request.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = (m[2] ?? "sec").toLowerCase();
      const r = resolve("duration", n, unit);
      if (r) return r;
    }
  }

  // ── HEIGHT ────────────────────────────────────────────────────────────────
  const heightMatch = request.match(
    /(?:set\s+(?:height\s+)?to|use\s+(?:a\s+)?|from\s+(?:a\s+)?|jump\s+(?:from|onto|over)\s+(?:a\s+)?)\s*(\d+(?:\.\d+)?)[- ]*(inches?|in|cm|centimeters?)/i
  );
  if (heightMatch) {
    const r = resolve("height", parseFloat(heightMatch[1]), heightMatch[2]);
    if (r) return r;
  }

  // ── DISTANCE ─────────────────────────────────────────────────────────────
  const distMatch = request.match(
    /(?:set\s+(?:distance\s+)?to|jump\s+(?:for)?|target|do)\s+(\d+(?:\.\d+)?)[- ]*(feet|foot|ft|meters?|m)\b/i
  );
  if (distMatch) {
    const r = resolve("distance", parseFloat(distMatch[1]), distMatch[2]);
    if (r) return r;
  }

  // ── LOAD / WEIGHT ─────────────────────────────────────────────────────────
  const loadMatch = request.match(
    /(?:use|set|target|try|start\s+(?:at|with)|do)\s+(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kgs?|kilograms?)/i
  );
  if (loadMatch) {
    const r = resolve("load", parseFloat(loadMatch[1]), loadMatch[2]);
    if (r) return r;
  }

  // ── REST ──────────────────────────────────────────────────────────────────
  const restPatterns = [
    /(?:lower|reduce|cut|change|set|increase|shorten|extend)?\s*(?:the\s+)?rest(?:\s+(?:to|period|time))?\s+(?:to\s+)?(\d+)\s*(sec(?:onds?)?|min(?:utes?)?)?/i,
    /(\d+)\s*(?:sec(?:onds?)?|min(?:utes?)?)\s+(?:rest|recovery|between)/i,
    /rest\s+(\d+)\s*(sec(?:onds?)?|min(?:utes?)?)?/i,
  ];
  for (const re of restPatterns) {
    const m = request.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = (m[2] ?? "").toLowerCase() || (n <= 10 ? "min" : "sec");
      const r = resolve("rest", n, unit);
      if (r) return r;
    }
  }

  // ── SETS ──────────────────────────────────────────────────────────────────
  const setPatterns = [
    /(?:make\s+(?:this|it)|do|use|set(?:\s+(?:it|this))?\s+to|change(?:\s+sets?)?\s+to|change\s+(?:it|this)\s+to)\s+(\d+)\s+sets?/i,
    /(\d+)\s+sets?\s*(?:of\b|$)/i,
    /sets?\s+(?:to|at|=)\s+(\d+)/i,
  ];
  for (const re of setPatterns) {
    const m = request.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 20) {
        const r = resolve("sets", n, "count");
        if (r) return r;
      }
    }
  }

  // ── REPS ──────────────────────────────────────────────────────────────────
  const repPatterns = [
    /(?:increase|raise|bump|set|change|make\s+(?:it|this))\s+reps?\s+(?:to|at)\s+(\d+)/i,
    /(?:increase|raise|bump|set|change|make\s+(?:it|this)?)\s+to\s+(\d+)\s+reps?/i,
    /(?:make\s+(?:it|this)\s+)?(\d+)\s+reps?(?:\s+each\s+side|\s+per\s+side|\s+each\s+(?:leg|arm))?/i,
    /(?:do|perform|use)\s+(\d+)\s+reps?/i,
    /reps?\s+(?:to|at|=)\s+(\d+)/i,
    // "Make this 12 each side" — N each side without the word "reps"
    /(?:make\s+(?:it|this)\s+)?(\d+)\s+(?:each\s+side|per\s+side|each\s+(?:leg|arm))/i,
    // "Make this 12" — bare number at end (last resort)
    /(?:make\s+(?:it|this)|set\s+(?:it|this)\s+to)\s+(\d+)(?:\s+each\s+side|\s+per\s+side)?$/i,
  ];
  for (const re of repPatterns) {
    const m = request.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 100) {
        const r = resolve("reps", n, "count");
        if (r) return r;
      }
    }
  }

  return null;
}

// ─── Rule-Based Fallback Interpreter ────────────────────────────────────────

function interpretWithRules(userRequest: string, system: any, targetContext?: TargetContext): EditPlan {
  const lower = userRequest.toLowerCase();

  const currentWeek = findCurrentWeek(system);
  const currentSession = findCurrentSession(system);

  // ── Targeted: swap/replace a specific exercise ──
  if (targetContext?.type === "exercise") {
    const exerciseId = targetContext.id;
    const label = targetContext.label ?? "the exercise";

    // ── HIGH PRIORITY: direct prescription mutation ──────────────────────────
    // Run BEFORE swap/easier/harder so "change reps to 10" or "make this 3 sets"
    // never falls into the wrong branch.
    const prescription = parsePrescriptionCommand(userRequest, label);
    if (prescription) {
      if (prescription.forbidden) {
        // Field is invalid for this exercise type — surface a coach message,
        // no database change.
        return {
          intent: "prescription_blocked",
          scope: "exercise",
          changeSummary: prescription.forbiddenMessage ?? prescription.summary,
          changes: [],
        };
      }

      // ── Constraint validation (runs after schema is confirmed valid) ─────
      // Checks physiological / programming principles and returns one of:
      //   valid      → apply without any coaching note
      //   suboptimal → apply, but append a warning to the change summary
      //   invalid    → block the change, surface suggestions
      const constraint: ConstraintOutcome = validateTrainingConstraints(
        label,
        prescription.field as LogicalField,
        prescription.rawNumericValue ?? 0,
        prescription.rawUnit ?? "count"
      );

      if (constraint.outcome === "invalid") {
        const sug = constraint.suggestions?.length
          ? ` Alternatives: ${constraint.suggestions.join("; ")}.`
          : "";
        return {
          intent: "prescription_blocked",
          scope: "exercise",
          changeSummary: `${constraint.message}${sug}`.trim(),
          changes: [],
        };
      }

      // Suboptimal: apply the change but append the coaching note
      const changeSummary =
        constraint.outcome === "suboptimal" && constraint.warningNote
          ? `${prescription.summary} ${constraint.warningNote}`
          : prescription.summary;

      return {
        intent: prescription.intent,
        scope: "exercise",
        changeSummary,
        changes: [{
          type: "update_exercise",
          id: exerciseId,
          updates: prescription.updates,
          reason: `Direct prescription edit: ${prescription.field} → ${prescription.newValue}`,
        }],
      };
    }

    // Match "swap/replace/change/switch [this|it|out|anything] for/with/to [target]"
    // OR "substitute/sub [this|it] with [target]"
    // OR "use/do [target] instead"
    // OR "try [target]"
    // Covers both "swap this for X" and "replace Back Squat with X" formats.
    const swapTo = (
      userRequest.match(/(?:swap|replace|change|switch|substitute|sub)\s+.+?\s+(?:for|with|to)\s+(.+)$/i)?.[1]?.trim() ||
      userRequest.match(/(?:swap|replace|change|switch|substitute|sub)\s+(?:this|it|out)?\s*(?:for|with|to)\s+(.+)$/i)?.[1]?.trim() ||
      userRequest.match(/(?:use|do)\s+(.+?)\s+instead$/i)?.[1]?.trim() ||
      userRequest.match(/^try\s+(.+?)(?:\s+instead)?$/i)?.[1]?.trim()
    );
    const wantsEasier = lower.match(/easier|simpler|lighter|beginner|reduce/);
    const wantsHarder = lower.match(/harder|heavier|advanced|progress/);
    const wantsExplosive = lower.match(/explosive|power|speed|fast/);
    const wantsShoulder = lower.match(/shoulder|rotator|shoulder.friendly/);
    const wantsMoreSets = lower.match(/add.*set|more.*set|\+1 set|one more set/);
    const wantsLessSets = lower.match(/remove.*set|less.*set|fewer.*set|drop.*set/);
    const wantsReps = lower.match(/change.*rep|rep.*range|reps/);

    // Guard: only commit a swap if the resolved name is a real exercise, not a generic placeholder.
    // "Replace Back Squat with a harder variation" would extract "a harder variation" from the
    // regex — which must never be committed. Fall through to wantsHarder/wantsEasier instead.
    if (swapTo && !isGenericPlaceholder(swapTo)) {
      return {
        intent: "swap_exercise",
        scope: "exercise",
        changeSummary: `${label} has been swapped for ${swapTo}. Sets, reps, and rest prescription carried over from the original slot.`,
        changes: [{
          type: "replace_exercise",
          id: exerciseId,
          replacement: { name: swapTo, notes: `Substituted for ${label}` },
          reason: `User requested swap to ${swapTo}`,
        }],
      };
    }

    if (wantsShoulder) {
      return {
        intent: "injury_modification",
        scope: "exercise",
        changeSummary: `${label} modified for shoulder health. Notes added to cue pain-free range of motion and appropriate load selection.`,
        changes: [{ type: "update_exercise", id: exerciseId, updates: { notes: "Shoulder modification: keep elbows tucked, use pain-free ROM only. If discomfort persists, use neutral-grip or machine variation." }, reason: "Shoulder-friendly modification" }],
      };
    }

    if (wantsExplosive) {
      return {
        intent: "add_explosive_emphasis",
        scope: "exercise",
        changeSummary: `${label} updated with explosive execution cues. Use 60-75% of your max and focus on bar speed through the concentric.`,
        changes: [{ type: "update_exercise", id: exerciseId, updates: { tempo: "X10X", notes: "Explosive concentric — control down, accelerate up. Move the bar with intent." }, reason: "Adding explosive cue" }],
      };
    }

    if (wantsMoreSets) {
      return {
        intent: "increase_sets",
        scope: "exercise",
        changeSummary: `Added a set to ${label}. Monitor recovery — if accumulative fatigue rises, pull back to original prescription.`,
        changes: [{ type: "update_exercise", id: exerciseId, updates: { sets: "INCREMENT" as any }, reason: "User requested additional set" }],
      };
    }

    if (wantsLessSets) {
      return {
        intent: "reduce_sets",
        scope: "exercise",
        changeSummary: `Removed a set from ${label} to reduce local fatigue at this movement pattern.`,
        changes: [{ type: "update_exercise", id: exerciseId, updates: { sets: "DECREMENT" as any }, reason: "User requested set reduction" }],
      };
    }

    if (wantsReps) {
      const higherReps = lower.match(/higher|more|increase|up/);
      const lowerReps = lower.match(/lower|less|decrease|down/);
      const newReps = higherReps ? "10-15" : lowerReps ? "4-6" : "8-12";
      return {
        intent: "change_rep_range",
        scope: "exercise",
        changeSummary: `Rep range on ${label} adjusted to ${newReps}. Load accordingly — target 2-3 RIR on working sets.`,
        changes: [{ type: "update_exercise", id: exerciseId, updates: { reps: newReps }, reason: "User requested rep range change" }],
      };
    }

    if (wantsEasier) {
      return buildEasierMutation(exerciseId, label);
    }

    if (wantsHarder) {
      return buildHarderMutation(exerciseId, label);
    }

    return {
      intent: "exercise_note",
      scope: "exercise",
      changeSummary: `Notes updated on ${label} based on your request.`,
      changes: [{ type: "update_exercise", id: exerciseId, updates: { notes: userRequest }, reason: "User modification note" }],
    };
  }

  // ── Targeted: session-level edit ──
  if (targetContext?.type === "session") {
    const sessionId = targetContext.id;
    const label = targetContext.label ?? "this session";

    if (lower.match(/recover|rest|easy|light|active/)) {
      return {
        intent: "change_session_type",
        scope: "session",
        changeSummary: `${label} has been converted to an active recovery session. Training stimulus is set to minimal — priority is movement quality and tissue prep.`,
        changes: [{
          type: "update_session",
          id: sessionId,
          updates: { sessionType: "recovery", emphasis: "Active recovery and tissue work", coachingNotes: "Recovery day: move well, not hard. Foam roll, light work, nothing that creates significant fatigue." },
          reason: "User requested recovery emphasis",
        }],
      };
    }

    if (lower.match(/shorten|shorter|quick|fast|30 min|less time/)) {
      return {
        intent: "shorten_session",
        scope: "session",
        changeSummary: `${label} shortened. Finishers and lower-priority accessories trimmed. Primary work remains intact.`,
        changes: [{ type: "update_session", id: sessionId, updates: { coachingNotes: "Time-compressed session: skip finishers if time is short. Primary and main accessories take priority." }, reason: "User requested shorter session" }],
      };
    }

    if (lower.match(/athletic|explosive|sport|power|dynamic/)) {
      // ── Structural explosive transformation ──────────────────────────────────
      // Must produce real programming changes — not just description text updates.
      // Rule: at least one of add_exercise, or update_exercise with sets/reps/tempo/rest
      // must be produced. If no structural changes are possible, fall through to the
      // generic fallback (changes: []) so auto-escalation to AGENT fires.
      const targetSession = findSessionById(system, sessionId);
      const changes: EditChange[] = [];
      const addedExerciseNames: string[] = [];
      const modifiedExerciseNames: string[] = [];

      if (targetSession) {
        const exercises: any[] = targetSession.exercises ?? [];

        // 1. Add an explosive movement if none exists in this session
        const hasExplosiveMovement = exercises.some((ex: any) =>
          /\b(box|broad)\s+jump|jump\s+squat|power\s+clean|power\s+snatch|med\s+ball|medicine\s+ball|bound|plyometric/i.test(ex.name)
        );

        if (!hasExplosiveMovement) {
          const hasLowerBodyLift = exercises.some((ex: any) =>
            /squat|deadlift|lunge|leg\s+press|hip\s+thrust|romanian|rdl|hamstring|glute/i.test(ex.name)
          );
          const explosiveChoice = hasLowerBodyLift ? "Box Jump" : "Med Ball Slam";
          changes.push({
            type: "add_exercise",
            id: 0,
            sessionId,
            exercise: {
              name: explosiveChoice,
              category: "explosive",
              sets: 4,
              reps: "5",
              rest: "2-3 min",
              tempo: "X10X",
              notes: "Max intent every rep. Full reset between sets — quality, not fatigue. Reset posture completely before each set.",
            },
            reason: "Adding explosive power movement to session",
          });
          addedExerciseNames.push(explosiveChoice);
        }

        // 2. Adjust primary lifts into power rep range with tempo and rest for CNS recovery
        for (const ex of exercises) {
          if (ex.category === "primary") {
            const repsStr: string = ex.reps ?? "";
            const repUpdates: Record<string, unknown> = {
              tempo: "3-1-X-0",
              rest: "2-3 min",
              notes: "Power focus: 3-sec eccentric, controlled pause, explosive concentric. Target 70-80% of max.",
            };
            const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
            const singleMatch = repsStr.match(/^(\d+)$/);
            if (rangeMatch && parseInt(rangeMatch[2]) > 5) {
              repUpdates.reps = "2-4";
            } else if (singleMatch && parseInt(singleMatch[1]) > 5) {
              repUpdates.reps = "3-5";
            }
            changes.push({
              type: "update_exercise",
              id: ex.id,
              updates: repUpdates,
              reason: "Adjusting primary lift for explosive power output",
            });
            modifiedExerciseNames.push(ex.name);
          }
        }

        // 3. Reduce slow high-rep hypertrophy accessories that conflict with power focus
        for (const ex of exercises) {
          if (ex.category === "accessory") {
            const repsStr: string = ex.reps ?? "";
            const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
            if (rangeMatch && parseInt(rangeMatch[1]) >= 12) {
              changes.push({
                type: "update_exercise",
                id: ex.id,
                updates: { reps: "8-10", rest: "90s", notes: "Pulled back to strength-accessory range to preserve power focus of this session." },
                reason: "Reducing hypertrophy-rep accessory to preserve power session quality",
              });
              modifiedExerciseNames.push(ex.name);
            }
          }
        }
      }

      // Validation: only commit if at least one structural change was produced.
      // "Structural" = add_exercise, replace_exercise, or update_exercise touching
      // a programming field (sets, reps, tempo, rest) — NOT just text fields.
      const hasStructuralChange = changes.some(c =>
        c.type === "add_exercise" ||
        c.type === "replace_exercise" ||
        (c.type === "update_exercise" && c.updates &&
          Object.keys(c.updates).some(k => ["sets", "reps", "tempo", "rest"].includes(k)))
      );

      if (hasStructuralChange) {
        // Add session description update as secondary (after structural changes confirmed)
        changes.push({
          type: "update_session",
          id: sessionId,
          updates: {
            emphasis: "Power and force expression — explosive and athletic emphasis",
            coachingNotes: "Power session: start with max-intent explosive work. Primaries at 70-80% with bar speed focus. Rest fully between sets — quality, not fatigue.",
          },
          reason: "Updating session description to reflect explosive focus",
        });

        const summaryParts: string[] = [];
        if (addedExerciseNames.length) summaryParts.push(`Added ${addedExerciseNames.join(", ")}`);
        if (modifiedExerciseNames.length) summaryParts.push(`adjusted ${modifiedExerciseNames.join(", ")} for power output (3-1-X-0 tempo, 2-4 reps, 2-3 min rest)`);

        return {
          intent: "explosive_session_transformation",
          scope: "session",
          changeSummary: `${label} restructured for explosive output: ${summaryParts.join("; ")}. Power rep ranges and extended rest locked in for full CNS recovery between sets.`,
          changes,
        };
      }
      // No structural changes possible (e.g. session has no exercises yet) →
      // fall through to generic fallback (changes: []) to auto-escalate to AGENT.
    }

    if (lower.match(/equipment|dumbbell|hotel|travel|minimal/)) {
      return {
        intent: "equipment_constraint",
        scope: "session",
        changeSummary: `${label} updated for limited equipment. Note added to guide appropriate substitutions on the day.`,
        changes: [{ type: "update_session", id: sessionId, updates: { coachingNotes: "Equipment-limited session: substitute barbell movements for dumbbell equivalents. Goblet squat, DB press, DB row, DB hinge work well here." }, reason: "Equipment constraint modification" }],
      };
    }

    if (lower.match(/volume|reduce.*volume|less.*volume/)) {
      return {
        intent: "reduce_session_volume",
        scope: "session",
        changeSummary: `${label} volume trimmed. Accessories reduced; primary work preserved. Session density is lower than planned.`,
        changes: [{ type: "update_session", id: sessionId, updates: { emphasis: "Reduced volume day — primaries only", coachingNotes: "Pulled back to primary work this session. Skip accessories if fatigue is high." }, reason: "Volume reduction on session" }],
      };
    }
  }

  // ── Targeted: week-level edit ──
  if (targetContext?.type === "week") {
    const weekId = targetContext.id;
    if (lower.match(/deload|easier|back off|recover/)) {
      return {
        intent: "deload_week",
        scope: "week",
        changeSummary: "Week converted to a deload. Volume and intensity targets reduced to allow full systemic recovery before returning to progressive work.",
        changes: [{ type: "update_week", id: weekId, updates: { volumeLevel: "deload", focus: "Deload week — recovery priority", notes: "This week is a planned deload. Reduce loads by 40-50%, cut volume by ~40%, train for quality not accumulation." }, reason: "User requested deload week" }],
      };
    }

    if (lower.match(/travel|hotel|minimal|dumbbell|equipment/)) {
      return {
        intent: "travel_mode",
        scope: "week",
        changeSummary: "Week updated for travel/limited equipment. Note added to guide modifications throughout the week.",
        changes: [{ type: "update_week", id: weekId, updates: { focus: "Travel week — equipment-adapted", notes: "Limited equipment this week: substitute barbell movements for dumbbell or bodyweight equivalents throughout." }, reason: "Travel equipment constraint" }],
      };
    }

    if (lower.match(/increase intensity|push harder|heavier|more intensity/)) {
      return {
        intent: "increase_intensity",
        scope: "week",
        changeSummary: "Week intensity target elevated. Progress loads on primary movements, target 1-2 RIR on top sets.",
        changes: [{ type: "update_week", id: weekId, updates: { volumeLevel: "high", focus: "High intensity accumulation", notes: "Push loads this week. Target 1-2 RIR on primaries. Keep accessories conservative if needed." }, reason: "Intensity escalation requested" }],
      };
    }

    if (lower.match(/reduce|less|lower.*volume|fatigue/)) {
      return {
        intent: "reduce_weekly_volume",
        scope: "week",
        changeSummary: "Week volume pulled back. Accessory work reduced; primary structure retained. Allows fatigue to dissipate without losing training frequency.",
        changes: [{ type: "update_week", id: weekId, updates: { volumeLevel: "low", focus: "Reduced volume — fatigue management", notes: "Lower volume week: cut accessories by 1-2 sets each. Primary movements unchanged." }, reason: "Weekly volume reduction" }],
      };
    }
  }

  // ── Targeted: phase-level edit ──
  if (targetContext?.type === "phase") {
    const phaseId = targetContext.id;
    const label = targetContext.label ?? "this block";

    if (lower.match(/power|explosive|speed|athletic/)) {
      return {
        intent: "refocus_block_power",
        scope: "block",
        changeSummary: `${label} refocused toward power and explosive development. Primary movements will emphasize bar speed and neural output over mechanical hypertrophy.`,
        changes: [{ type: "update_phase", id: phaseId, updates: { emphasis: "Power and explosive development — bar speed, neural output, dynamic effort emphasis", goal: "Develop explosive strength and power output across primary patterns" }, reason: "Power emphasis refocus" }],
      };
    }

    if (lower.match(/hypertrophy|muscle|size|volume|mass/)) {
      return {
        intent: "refocus_block_hypertrophy",
        scope: "block",
        changeSummary: `${label} shifted toward hypertrophy emphasis. Mechanical tension and metabolic stress are the primary training drivers for this block.`,
        changes: [{ type: "update_phase", id: phaseId, updates: { emphasis: "Hypertrophy — mechanical tension and metabolic stress primary drivers", goal: "Maximize muscle development through progressive volume and mechanical load" }, reason: "Hypertrophy emphasis refocus" }],
      };
    }

    if (lower.match(/field|sport|athletic|performance|speed/)) {
      return {
        intent: "refocus_block_athletic",
        scope: "block",
        changeSummary: `${label} reoriented toward field-sport and athletic performance. Strength work serves power and speed transfer rather than peak force production alone.`,
        changes: [{ type: "update_phase", id: phaseId, updates: { emphasis: "Field-sport athletic development — strength, speed, and movement quality integrated", goal: "Develop athletic performance qualities transferable to sport" }, reason: "Athletic/field-sport refocus" }],
      };
    }
  }

  // ── Reduce volume (week-level, no specific target) ──
  if (lower.match(/lower.*volume|reduce.*volume|less.*volume|cut.*volume|back.*off|beat up|fatigued|deload/)) {
    const changes: EditChange[] = [];

    for (const phase of system.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        if (week.status !== "current") continue;
        changes.push({ type: "update_week", id: week.id, updates: { volumeLevel: "low", focus: "Reduced volume — recovery emphasis" }, reason: "User requested lower volume" });

        for (const session of week.sessions ?? []) {
          for (const ex of session.exercises ?? []) {
            if ((ex.category === "accessory" || ex.category === "finisher") && ex.sets > 2) {
              changes.push({ type: "update_exercise", id: ex.id, updates: { sets: Math.max(ex.sets - 1, 2) }, reason: "Reducing accessory volume" });
            }
          }
        }
      }
    }

    if (changes.length === 0 && currentWeek) {
      changes.push({ type: "update_week", id: currentWeek.id, updates: { volumeLevel: "low" }, reason: "Volume reduction requested" });
    }

    return {
      intent: "reduce_volume",
      scope: "week",
      changeSummary: "Accessory and finisher sets reduced by one across the current week. Primary lifts remain intact — recovery is the priority right now.",
      changes,
    };
  }

  // ── Increase volume ──
  if (lower.match(/more.*volume|increase.*volume|push.*harder|add.*volume|ramp.*up/)) {
    const changes: EditChange[] = [];
    for (const phase of system.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        if (week.status !== "current") continue;
        changes.push({ type: "update_week", id: week.id, updates: { volumeLevel: "high", focus: "Increased volume accumulation" }, reason: "User requested more volume" });
        for (const session of week.sessions ?? []) {
          for (const ex of session.exercises ?? []) {
            if (ex.category === "accessory" && ex.sets < 4) {
              changes.push({ type: "update_exercise", id: ex.id, updates: { sets: ex.sets + 1 }, reason: "Adding accessory volume" });
            }
          }
        }
      }
    }
    return {
      intent: "increase_volume",
      scope: "week",
      changeSummary: "Added one set to accessory work across the current week. Primary lifts unchanged — added volume comes from accessory accumulation.",
      changes,
    };
  }

  // ── Make a day a recovery/mobility day ──
  if (lower.match(/recovery day|rest day|mobility day|make.*easy|easy day|active recovery|light day/)) {
    const changes: EditChange[] = [];
    if (currentSession) {
      changes.push({
        type: "update_session",
        id: currentSession.id,
        updates: { sessionType: "recovery", emphasis: "Active recovery and mobility", coachingNotes: "Light session today — focus on movement quality and tissue work. Keep intensity low.", warmupNotes: "10 min: foam rolling, hip circles, thoracic rotation, shoulder CARs" },
        reason: "Converting session to recovery emphasis",
      });
      for (const ex of currentSession.exercises ?? []) {
        if (ex.category === "primary" || ex.category === "accessory") {
          changes.push({ type: "update_exercise", id: ex.id, updates: { sets: 2, reps: "10-15", rest: "60 sec", notes: "Light weight, movement quality focus" }, reason: "Reducing intensity for recovery day" });
        }
      }
    }
    return {
      intent: "change_session_type",
      scope: "session",
      changeSummary: "Today's session converted to active recovery focus. Exercise prescriptions lightened significantly — movement quality day, not a stimulus day.",
      changes,
    };
  }

  // ── Swap exercise ──
  const swapMatch = lower.match(/swap|replace|change|switch/);
  if (swapMatch) {
    const forMatch = userRequest.match(/(?:swap|replace|change|switch)\s+(.+?)\s+(?:for|with|to)\s+(.+)/i);
    if (forMatch && currentSession) {
      const fromName = forMatch[1].trim();
      const toName = forMatch[2].trim();
      const targetEx = currentSession.exercises?.find((e: any) => e.name.toLowerCase().includes(fromName.toLowerCase()));
      if (targetEx) {
        return {
          intent: "swap_exercise",
          scope: "exercise",
          changeSummary: `${targetEx.name} replaced with ${toName}. Same sets, reps, and rest prescription preserved — only the implement changes.`,
          changes: [{
            type: "replace_exercise",
            id: targetEx.id,
            replacement: { name: toName, category: targetEx.category, sets: targetEx.sets, reps: targetEx.reps, rest: targetEx.rest, notes: `Substituted in for ${targetEx.name}` },
            reason: `User requested swap: ${fromName} → ${toName}`,
          }],
        };
      }
    }
  }

  // ── Equipment constraint ──
  if (lower.match(/dumbbell|hotel gym|home gym|no barbell|only have|limited equipment|travel/)) {
    const changes: EditChange[] = [];
    const barbellToDb: Record<string, string> = {
      "Barbell Back Squat": "Dumbbell Goblet Squat",
      "Barbell Bench Press": "Dumbbell Bench Press",
      "Conventional Deadlift": "Dumbbell Romanian Deadlift",
      "Barbell Row": "Dumbbell Row",
      "Overhead Press": "Dumbbell Shoulder Press",
      "Barbell Curl": "Dumbbell Curl",
      "Barbell Front Squat": "Dumbbell Goblet Squat",
      "Romanian Deadlift": "Dumbbell Romanian Deadlift",
    };

    const targetWeek = currentWeek;
    if (targetWeek) {
      for (const session of targetWeek.sessions ?? []) {
        for (const ex of session.exercises ?? []) {
          const replacement = barbellToDb[ex.name];
          if (replacement) {
            changes.push({ type: "replace_exercise", id: ex.id, replacement: { name: replacement, category: ex.category, sets: ex.sets, reps: ex.reps, rest: ex.rest }, reason: "Barbell → dumbbell swap for equipment constraint" });
          }
        }
      }
    }

    return {
      intent: "equipment_constraint",
      scope: "week",
      changeSummary: changes.length > 0
        ? `${changes.length} barbell-dependent exercises swapped for dumbbell equivalents across the current week. Set/rep prescriptions preserved.`
        : "Equipment noted. Current week's exercises are already compatible with limited equipment.",
      changes,
    };
  }

  // ── Adjust intensity down ──
  if (lower.match(/easier|too hard|back off intensity|reduce intensity|tone.*down|scale.*back/)) {
    const changes: EditChange[] = [];
    for (const phase of system.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        if (week.status !== "current") continue;
        for (const session of week.sessions ?? []) {
          for (const ex of session.exercises ?? []) {
            if (ex.category === "primary") {
              const repsMatch = ex.reps?.match(/(\d+)-(\d+)/);
              if (repsMatch) {
                const newMin = parseInt(repsMatch[1]) + 2;
                const newMax = parseInt(repsMatch[2]) + 2;
                changes.push({ type: "update_exercise", id: ex.id, updates: { reps: `${newMin}-${newMax}`, notes: "Adjusted to higher rep range — focus on quality" }, reason: "Reduced intensity by shifting to higher rep range" });
              }
            }
          }
        }
      }
    }
    return {
      intent: "reduce_intensity",
      scope: "week",
      changeSummary: "Primary lifts shifted to higher rep ranges across the current week. Neural demand reduced while maintaining training stimulus. Sustainable way to back off without cutting volume.",
      changes,
    };
  }

  // ── Explosive/power emphasis ──
  if (lower.match(/explosive|power|speed|fast.*twitch|athletic|sport/)) {
    const changes: EditChange[] = [];
    for (const phase of system.phases ?? []) {
      if (phase.status !== "current") continue;
      changes.push({ type: "update_phase", id: phase.id, updates: { emphasis: "Power and explosive development — speed work prioritized", notes: "Adjusted for explosive/power emphasis at user request" }, reason: "Power emphasis" });
      for (const week of phase.weeks ?? []) {
        if (week.status !== "current") continue;
        for (const session of week.sessions ?? []) {
          for (const ex of session.exercises ?? []) {
            if (ex.category === "primary") {
              changes.push({ type: "update_exercise", id: ex.id, updates: { notes: "Explosive concentric. Use submaximal load (60-75%), move bar fast." }, reason: "Adding explosive execution cue" });
            }
          }
        }
      }
    }
    return {
      intent: "add_explosive_emphasis",
      scope: "block",
      changeSummary: "Current block updated for power and explosive development. Primary exercises carry bar-speed cues — use submaximal loads (60-75%) and accelerate through the concentric.",
      changes,
    };
  }

  // ── Injury ──
  if (lower.match(/knee|shoulder|back|hip|pain|hurt|injured|sore|irritated/)) {
    const injuredPart = lower.match(/knee|shoulder|back|hip/)?.[0] ?? "joint";
    const avoidPatterns: Record<string, string[]> = {
      knee: ["squat", "lunge", "leg press", "step-up", "jump"],
      shoulder: ["overhead", "press", "dip", "upright row"],
      back: ["deadlift", "row", "good morning", "hyperextension"],
      hip: ["squat", "deadlift", "lunge", "hip thrust"],
    };

    const patterns = avoidPatterns[injuredPart] ?? [];
    const changes: EditChange[] = [];

    if (currentSession) {
      for (const ex of currentSession.exercises ?? []) {
        const matches = patterns.some((p) => ex.name.toLowerCase().includes(p));
        if (matches) {
          changes.push({ type: "update_exercise", id: ex.id, updates: { notes: `Modified for ${injuredPart} irritation — reduce range of motion and use pain-free load only. Consider subbing with unilateral or machine variation if discomfort persists.` }, reason: `Injury modification for ${injuredPart}` });
        }
      }
    }

    return {
      intent: "injury_modification",
      scope: "session",
      changeSummary: `Exercises that load the ${injuredPart} flagged with modification notes in today's session. Train pain-free ROM. Consider machine or unilateral substitutions. If pain persists past 72 hours, pause loading that pattern.`,
      changes,
    };
  }

  // ── Generic fallback ──
  return {
    intent: "general_modification",
    scope: "system",
    changeSummary: "No specific edit identified for that request. Try something more targeted — 'swap barbell bench for dumbbell bench', 'reduce volume this week', or 'make Friday a recovery day'.",
    changes: [],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findCurrentWeek(system: any): any | null {
  // 1st: exact "current" status
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      if (week.status === "current") return week;
    }
  }
  // 2nd: in-progress / active
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      if (week.status === "in_progress" || week.status === "active") return week;
    }
  }
  // 3rd: first non-completed week
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      if (week.status !== "completed" && week.status !== "done") return week;
    }
  }
  // Last resort: very first week
  return system.phases?.[0]?.weeks?.[0] ?? null;
}

function findCurrentSession(system: any): any | null {
  const dow = new Date().getDay();
  const week = findCurrentWeek(system);
  if (!week) return null;
  const byday = week.sessions?.find((s: any) => s.dayOfWeek === dow && !s.isRestDay);
  if (byday) return byday;
  return week.sessions?.find((s: any) => !s.isRestDay) ?? week.sessions?.[0] ?? null;
}

function findSessionById(system: any, sessionId: number): any | null {
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      for (const session of week.sessions ?? []) {
        if (session.id === sessionId) return session;
      }
    }
  }
  return null;
}

// ─── Intent Router ───────────────────────────────────────────────────────────
//
// Classifies each edit request as DETERMINISTIC or AGENT before any mutation logic.
//
//  DETERMINISTIC — fast path, zero OpenAI cost:
//    • Exact numeric prescription (set/rep/weight/rest/tempo with a real number)
//    • Exact named exercise swap (non-placeholder target extracted from message)
//    • Simple set add/remove ("add a set", "remove a set", "+1 set")
//
//  AGENT — OpenAI interpretation layer:
//    • Coaching / transformation language ("make this harder", "more explosive")
//    • Structural session changes ("add more exercises to day 1")
//    • No exercise target in context
//    • Anything that doesn't map deterministically
//
// Auto-escalation: if a DETERMINISTIC request produces zero changes,
// the router automatically re-routes to the AGENT path.

export interface EditRouteDecision {
  route: "DETERMINISTIC" | "AGENT";
  reason: string;
}

function detectSwapIntent(userRequest: string): "swap" | "easier" | "harder" | null {
  const lower = userRequest.toLowerCase();
  // Prescription commands (numeric field edits) are NOT swaps even if they use "change ... to"
  if (/\b\d+\s*(reps?|sets?|sec(?:onds?)?|min(?:utes?)?|lbs?|pounds?|kg|feet|ft|inches?)\b/.test(lower)) {
    // Explicit number + field = prescription command, skip swap routing
    // (still fall through to easier/harder checks below)
  } else if (lower.match(/\bswap\b|\breplace\b|\bsubstitute\b|\bsub\b|\bswitch\b|\balternative\b|\bother.*exercise\b|\bdifferent.*exercise\b|\buse\b.*\binstead\b|\btry\b|\bconvert\b|\bchange.*to\b/)) {
    return "swap";
  }
  if (lower.match(/\beasier\b|\bsimpler\b|\bregress\b|\btoo hard\b|\btoo difficult\b/)) return "easier";
  if (lower.match(/\bharder\b|\bprogress\b|\badvance\b|\bmore.*difficult\b|\btoo easy\b/)) return "harder";
  return null;
}

// Extracts the explicit replacement exercise name from a swap-style request.
// Returns null if no concrete name is present (i.e. the target is a generic placeholder).
function extractSwapTargetName(userRequest: string): string | null {
  const name =
    userRequest.match(/(?:swap|replace|change|switch|substitute|sub)\s+.+?\s+(?:for|with|to)\s+(.+)$/i)?.[1]?.trim() ||
    userRequest.match(/(?:swap|replace|change|switch|substitute|sub)\s+(?:this|it|out)?\s*(?:for|with|to)\s+(.+)$/i)?.[1]?.trim() ||
    userRequest.match(/(?:use|do)\s+(.+?)\s+instead$/i)?.[1]?.trim() ||
    userRequest.match(/^try\s+(.+?)(?:\s+instead)?$/i)?.[1]?.trim() ||
    null;
  if (!name || isGenericPlaceholder(name)) return null;
  return name;
}

export function classifyEditRequest(
  userRequest: string,
  targetContext?: TargetContext
): EditRouteDecision {
  const lower = userRequest.toLowerCase();

  // ── Rule 1: No exercise target = can't be deterministic ──────────────────
  // Phase/week/session/system-level requests need OpenAI to reason about scope.
  if (targetContext?.type === "exercise") {
    const exerciseLabel = targetContext.label ?? "";

    // ── Rule 2: Exact numeric prescription → DETERMINISTIC ─────────────────
    // parsePrescriptionCommand handles sets/reps/weight/rest/tempo with real numbers.
    const prescription = parsePrescriptionCommand(userRequest, exerciseLabel);
    if (prescription) {
      return { route: "DETERMINISTIC", reason: "numeric_prescription" };
    }

    // ── Rule 3: Exact named swap to a real exercise → DETERMINISTIC ─────────
    const swapTarget = extractSwapTargetName(userRequest);
    if (swapTarget) {
      return { route: "DETERMINISTIC", reason: "exact_named_swap" };
    }

    // ── Rule 4: Simple set add/remove → DETERMINISTIC ──────────────────────
    // Matches: "add a set", "add 1 set", "add 2 sets", "+1 set", "one more set"
    if (/\b(add|plus|\+)\s*(\d+\s+|a\s+)?sets?\b|\+\d+\s*sets?\b|one\s+more\s+set\b/i.test(lower)) {
      return { route: "DETERMINISTIC", reason: "set_add" };
    }
    // Matches: "remove a set", "remove 1 set", "drop a set", "-1 set", "fewer sets"
    if (/\b(remove|drop|minus)\s*(\d+\s+|a\s+)?sets?\b|-\d*\s*sets?\b|fewer\s+sets?\b|less\s+sets?\b/i.test(lower)) {
      return { route: "DETERMINISTIC", reason: "set_remove" };
    }
  }

  // ── Rule 5: Session-level coaching transformations with structural rules → DETERMINISTIC ──
  // Explosive/power/athletic requests against a session target are handled by interpretWithRules
  // which produces real structural changes (add_exercise, update_exercise for sets/reps/tempo/rest).
  if (targetContext?.type === "session") {
    if (/\bexplosive\b|\bpower\b|\bathletic\b|\bmore\s+(explosive|powerful|athletic)\b/i.test(lower)) {
      return { route: "DETERMINISTIC", reason: "session_explosive_transformation" };
    }
  }

  // ── Everything else → AGENT ───────────────────────────────────────────────
  // Includes: harder/easier, explosive/endurance coaching language, session/week/phase
  // transforms, and any request without a deterministic exercise target.
  const agentReason =
    !targetContext ? "no_target_context" :
    targetContext.type !== "exercise" ? `${targetContext.type}_level_edit` :
    "exercise_coaching_transformation";

  return { route: "AGENT", reason: agentReason };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function interpretEditRequest(
  userRequest: string,
  system: any,
  targetContext?: TargetContext,
  adaptationContext?: string,
  decisionMemoryContext?: string
): Promise<EditPlan> {
  const systemContext = serializeSystemForPrompt(system);

  // ── Step 1: Classify the request ─────────────────────────────────────────
  const classification = classifyEditRequest(userRequest, targetContext);

  logger.info(
    { route: classification.route, reason: classification.reason, request: userRequest.slice(0, 100), targetType: targetContext?.type },
    `[EditRouter] Classified → ${classification.route} (${classification.reason})`
  );

  // ── Step 2: DETERMINISTIC fast path ──────────────────────────────────────
  // Zero API cost. interpretWithRules is synchronous and sub-millisecond.
  if (classification.route === "DETERMINISTIC") {
    const rulePlan = interpretWithRules(userRequest, system, targetContext);

    if (rulePlan.changes.length > 0) {
      // ── Validation layer: coaching intents must produce structural changes ─
      // If the plan only contains text-field updates (update_session/update_phase/update_week
      // with no exercise selection or prescription changes), reject and escalate to AGENT.
      const isCoachingIntent = /\b(explosive|power|athletic|hypertrophy|endurance|more\s+intense|stronger|faster|more\s+(powerful|athletic|explosive))\b/i.test(userRequest);
      if (isCoachingIntent) {
        const hasStructuralChange = rulePlan.changes.some(c =>
          c.type === "add_exercise" ||
          c.type === "replace_exercise" ||
          c.type === "delete_exercise" ||
          (c.type === "update_exercise" && c.updates &&
            Object.keys(c.updates).some(k => ["sets", "reps", "tempo", "rest"].includes(k)))
        );
        if (!hasStructuralChange) {
          logger.warn(
            { intent: rulePlan.intent, changes: rulePlan.changes.length },
            "[EditRouter] Coaching intent produced text-only changes — rejecting, escalating to AGENT"
          );
          // Fall through to AGENT — do NOT return here
        } else {
          logger.info(
            { intent: rulePlan.intent, scope: rulePlan.scope, changes: rulePlan.changes.length, route: "deterministic" },
            "[EditRouter] Deterministic coaching path resolved with structural changes — OpenAI not called"
          );
          return {
            ...rulePlan,
            _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
          };
        }
      } else {
        logger.info(
          { intent: rulePlan.intent, scope: rulePlan.scope, changes: rulePlan.changes.length, route: "deterministic" },
          "[EditRouter] Deterministic path resolved — OpenAI not called"
        );
        return {
          ...rulePlan,
          _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
        };
      }
    }

    // Auto-escalation: deterministic rules produced no changes (or coaching validation failed) → escalate to AGENT
    logger.warn(
      { reason: classification.reason, intent: rulePlan.intent },
      "[EditRouter] Deterministic path produced no changes — auto-escalating to AGENT"
    );
    // Fall through to AGENT path
  }

  // ── Step 3: AGENT path — build exercise intelligence context ─────────────
  // Only runs for AGENT requests (or auto-escalated DETERMINISTIC failures).
  let exerciseSwapContext: string | undefined;
  let fetchedProgressions: { easier: any[]; harder: any[] } | null = null;
  let resolvedSwapIntent: "swap" | "easier" | "harder" | null = null;

  const swapIntent = detectSwapIntent(userRequest);
  if (swapIntent && targetContext?.type === "exercise" && targetContext.label) {
    const exerciseName = targetContext.label;
    const equipmentLevel = system.equipmentAccess
      ? (system.equipmentAccess.toLowerCase().includes("dumbbell") && !system.equipmentAccess.toLowerCase().includes("barbell")
          ? "dumbbells_only"
          : system.equipmentAccess.toLowerCase().includes("bodyweight") || system.equipmentAccess.toLowerCase().includes("no equipment")
          ? "bodyweight"
          : "full_gym")
      : "full_gym";

    resolvedSwapIntent = swapIntent;

    try {
      if (swapIntent === "swap") {
        exerciseSwapContext = await buildSwapContext({ exerciseName, equipmentLevel });
        logger.info({ exerciseName, equipmentLevel }, "[EditRouter] Injecting swap context from exercise library");
      } else {
        const progressions = await getProgressions(exerciseName);
        fetchedProgressions = progressions;
        const target = swapIntent === "easier" ? progressions.easier : progressions.harder;
        if (target.length > 0) {
          const label = swapIntent === "easier" ? "REGRESSION OPTIONS" : "PROGRESSION OPTIONS";
          exerciseSwapContext = `${label} for "${exerciseName}" (prefer these — use replace_exercise with one of these exact names):\n${target.map((ex) => `  - ${ex.name} (${(ex.equipment as string[]).join("/")}, ${ex.difficultyLevel})`).join("\n")}`;
          logger.info({ exerciseName, swapIntent, count: target.length }, "[EditRouter] Injecting progression context from exercise library");
        } else {
          exerciseSwapContext = await buildSwapContext({ exerciseName, equipmentLevel });
          logger.info({ exerciseName, swapIntent }, "[EditRouter] No direct progressions — injecting cluster swap context");
        }
      }
    } catch (err) {
      logger.warn({ err, exerciseName }, "[EditRouter] Failed to load exercise swap context — proceeding without it");
    }
  }

  // ── Step 3.5: Structured Harder/Easier fallback (OpenAI) ─────────────────
  // ONLY runs when:
  //   a) swapIntent is "harder" or "easier"
  //   b) the exercise library returned zero progressions in that direction
  //   c) the exercise has a target context
  //
  // This is a TARGETED structured call — much tighter than the general OpenAI
  // edit prompt. It returns { changeType, replacementExerciseName, prescriptionAdjustments }
  // which is validated and converted to an EditPlan before the general call runs.
  // If it succeeds we return immediately; the general OpenAI call (Step 4) is skipped.

  if (
    (resolvedSwapIntent === "harder" || resolvedSwapIntent === "easier") &&
    fetchedProgressions !== null &&
    fetchedProgressions[resolvedSwapIntent].length === 0 &&
    targetContext?.type === "exercise" &&
    targetContext.label
  ) {
    const exerciseName = targetContext.label;
    const direction = resolvedSwapIntent;
    const equipmentLevel = system.equipmentAccess
      ? (system.equipmentAccess.toLowerCase().includes("dumbbell") && !system.equipmentAccess.toLowerCase().includes("barbell")
          ? "dumbbells_only"
          : system.equipmentAccess.toLowerCase().includes("bodyweight") || system.equipmentAccess.toLowerCase().includes("no equipment")
          ? "bodyweight"
          : "full_gym")
      : "full_gym";

    // Extract exercise metadata from the system for richer context
    let movementPattern: string | undefined;
    let category: string | undefined;
    let sessionLabel: string | undefined;

    outer: for (const phase of system.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        for (const session of week.sessions ?? []) {
          const found = (session.exercises ?? []).find((ex: any) => ex.id === targetContext.id);
          if (found) {
            category = found.category;
            sessionLabel = session.label ?? session.sessionType;
            break outer;
          }
        }
      }
    }

    const fallbackCtx = {
      exerciseName,
      exerciseId: targetContext.id,
      direction,
      movementPattern,
      category,
      sessionLabel,
      programGoal: system.goal ?? system.programGoal,
      sport: system.sport,
      equipmentLevel,
      injuryFlags: system.injuryFlags ?? system.specialConsiderations
        ? [system.injuryFlags ?? system.specialConsiderations].flat().filter(Boolean)
        : [],
      notes: system.specialConsiderations,
      userId: system.userId,
    };

    try {
      const fallbackPlan = await resolveHarderEasierFallback(fallbackCtx);
      if (fallbackPlan) {
        logger.info(
          { exercise: exerciseName, direction, intent: fallbackPlan.intent },
          "[EditRouter] Structured harder/easier fallback succeeded — skipping general OpenAI call"
        );
        return fallbackPlan;
      }
    } catch (err) {
      logger.warn({ err, exerciseName }, "[EditRouter] Structured harder/easier fallback threw — continuing to general OpenAI");
    }
  }

  // ── Step 4: Call OpenAI ───────────────────────────────────────────────────
  logger.info(
    { request: userRequest.slice(0, 100), hasTargetContext: !!targetContext, targetType: targetContext?.type, escalatedFrom: classification.route === "DETERMINISTIC" ? "deterministic" : undefined },
    "[EditRouter] Calling OpenAI — route: agent_openai"
  );

  const aiPlan = await interpretWithAI(
    userRequest,
    systemContext,
    targetContext,
    adaptationContext,
    decisionMemoryContext,
    exerciseSwapContext
  );

  if (aiPlan && Array.isArray(aiPlan.changes) && aiPlan.changes.length > 0) {
    // Guard 1: progression intent with note-only mutation → reject, use library fallback
    const isProgressionIntent = /harder_variation|easier_variation|increase_difficulty|decrease_difficulty/i.test(aiPlan.intent);
    const onlyNotesChange = aiPlan.changes.every((c) => {
      if (c.type !== "update_exercise") return false;
      const keys = Object.keys(c.updates ?? {});
      return keys.length === 1 && keys[0] === "notes";
    });

    // Guard 2: generic placeholder name in replace_exercise → reject
    const hasGenericReplacementName = aiPlan.changes.some((c) => {
      if (c.type !== "replace_exercise") return false;
      const replacementName = (c as any).replacement?.name ?? (c as any).updates?.name ?? "";
      if (isGenericPlaceholder(replacementName)) {
        logger.warn({ replacementName, intent: aiPlan.intent }, "[EditRouter] AI produced generic placeholder in replace_exercise — rejecting");
        return true;
      }
      return false;
    });

    // Guard 3: coaching transformation produced text-only changes → reject
    // A coaching intent (explosive, power, athletic, hypertrophy) that only updates
    // description text fields is a FAILURE — must have at least one structural change.
    const isCoachingTransformIntent = /\b(explosive|power|athletic|hypertrophy|endurance|more\s+intense|stronger|faster)\b/i.test(userRequest) &&
      (targetContext?.type === "session" || targetContext?.type === "week" || targetContext?.type === "phase" || !targetContext);
    const aiHasStructuralChange = aiPlan.changes.some(c =>
      c.type === "add_exercise" ||
      c.type === "replace_exercise" ||
      c.type === "delete_exercise" ||
      (c.type === "update_exercise" && c.updates &&
        Object.keys(c.updates).some(k => ["sets", "reps", "tempo", "rest"].includes(k)))
    );
    const isCoachingTextOnly = isCoachingTransformIntent && !aiHasStructuralChange && aiPlan.changes.length > 0;
    if (isCoachingTextOnly) {
      logger.warn({ intent: aiPlan.intent, changes: aiPlan.changes.length }, "[EditRouter] AI returned text-only changes for coaching transformation — rejecting");
    }

    if (isProgressionIntent && onlyNotesChange) {
      logger.warn({ intent: aiPlan.intent, changes: aiPlan.changes.length }, "[EditRouter] AI returned note-only mutation for progression — rejecting");
    } else if (hasGenericReplacementName) {
      logger.warn({ intent: aiPlan.intent }, "[EditRouter] AI returned generic placeholder in replace_exercise — rejecting");
    } else if (isCoachingTextOnly) {
      // Already logged above — fall through to library/rules fallback
    } else {
      logger.info(
        { intent: aiPlan.intent, scope: aiPlan.scope, changes: aiPlan.changes.length, route: "agent_openai" },
        "[EditRouter] OpenAI edit plan accepted"
      );
      return {
        ...aiPlan,
        _debugRoute: {
          openaiCalled: true,
          openaiSucceeded: true,
          pathUsed: "openai",
          ...(classification.route === "DETERMINISTIC" ? { rejectionReason: "escalated_from_deterministic" } : {}),
        },
      };
    }
  } else {
    logger.warn(
      { result: aiPlan === null ? "null" : "empty_changes", hasApiKey: !!process.env.OPENAI_API_KEY },
      "[EditRouter] OpenAI plan unusable — falling back to library/rules"
    );
  }

  // ── Step 5: Library progression fallback ─────────────────────────────────
  if (
    (resolvedSwapIntent === "harder" || resolvedSwapIntent === "easier") &&
    fetchedProgressions &&
    targetContext?.type === "exercise"
  ) {
    const libFallback = buildProgressionFallbackPlan(targetContext, fetchedProgressions, resolvedSwapIntent);
    if (libFallback) {
      logger.info({ intent: libFallback.intent, exercise: targetContext.label, direction: resolvedSwapIntent }, "[EditRouter] Using library progression fallback");
      return {
        ...libFallback,
        _debugRoute: { openaiCalled: true, openaiSucceeded: false, pathUsed: "library_progression" },
      };
    }
  }

  // ── Step 6: Rule-based safety net ────────────────────────────────────────
  logger.info(
    { request: userRequest.slice(0, 100), route: "rule_based_fallback" },
    "[EditRouter] Using rule-based safety net — all prior paths failed"
  );
  const rulePlan = interpretWithRules(userRequest, system, targetContext);
  return {
    ...rulePlan,
    _debugRoute: {
      openaiCalled: true,
      openaiSucceeded: false,
      pathUsed: "rule_based",
      rejectionReason: aiPlan === null ? "openai_returned_null" : "openai_empty_or_rejected_plan",
    },
  };
}
