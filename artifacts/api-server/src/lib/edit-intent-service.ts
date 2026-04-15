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
}

// ─── Target Context (Phase 3) ─────────────────────────────────────────────────

export interface TargetContext {
  type: "exercise" | "session" | "week" | "phase";
  id: number;
  label?: string;
  parentLabel?: string;
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
  const targetFocus = targetContext
    ? `\nEDIT FOCUS:\nThe user is specifically targeting: ${targetContext.type.toUpperCase()} [id:${targetContext.id}]${targetContext.label ? ` "${targetContext.label}"` : ""}${targetContext.parentLabel ? ` in ${targetContext.parentLabel}` : ""}.\nFocus ALL changes on this specific object. Only expand scope if the user's request explicitly requires broader changes. Prefer targeted, surgical edits to this one object.\n`
    : "";

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
      return {
        intent: "athletic_emphasis",
        scope: "session",
        changeSummary: `${label} refocused toward athletic and explosive qualities. Primaries updated with speed cues; conditioning emphasis added.`,
        changes: [{ type: "update_session", id: sessionId, updates: { emphasis: "Athletic performance — explosive and dynamic emphasis", coachingNotes: "Athletic day: primaries should feel powerful, not heavy. Move bar with intent." }, reason: "User requested athletic emphasis" }],
      };
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
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      if (week.status === "current") return week;
    }
  }
  return null;
}

function findCurrentSession(system: any): any | null {
  const dow = new Date().getDay();
  const week = findCurrentWeek(system);
  if (!week) return null;
  return week.sessions?.find((s: any) => s.dayOfWeek === dow) ?? week.sessions?.[0] ?? null;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

// Detects swap/progression intent from user request keywords

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

export async function interpretEditRequest(
  userRequest: string,
  system: any,
  targetContext?: TargetContext,
  adaptationContext?: string,
  decisionMemoryContext?: string
): Promise<EditPlan> {
  const systemContext = serializeSystemForPrompt(system);

  // ── Exercise Intelligence: inject swap candidates or progressions ──────────
  let exerciseSwapContext: string | undefined;
  // Hold onto progressions so rule-based fallback can produce a real library swap
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
        exerciseSwapContext = await buildSwapContext({
          exerciseName,
          equipmentLevel,
        });
        logger.info({ exerciseName, equipmentLevel }, "Injecting swap context from exercise library");
      } else {
        // Easier or harder — use progressions
        const progressions = await getProgressions(exerciseName);
        fetchedProgressions = progressions;
        const target = swapIntent === "easier" ? progressions.easier : progressions.harder;
        if (target.length > 0) {
          const label = swapIntent === "easier" ? "REGRESSION OPTIONS" : "PROGRESSION OPTIONS";
          exerciseSwapContext = `${label} for "${exerciseName}" (prefer these — use replace_exercise with one of these exact names):\n${target.map((ex) => `  - ${ex.name} (${(ex.equipment as string[]).join("/")}, ${ex.difficultyLevel})`).join("\n")}`;
          logger.info({ exerciseName, swapIntent, count: target.length }, "Injecting progression context from exercise library");
        } else {
          // Fallback to cluster-based swap when no direct progressions
          exerciseSwapContext = await buildSwapContext({ exerciseName, equipmentLevel });
          logger.info({ exerciseName, swapIntent }, "No direct progressions — injecting cluster swap context");
        }
      }
    } catch (err) {
      logger.warn({ err, exerciseName }, "Failed to load exercise swap context — proceeding without it");
    }
  }

  const aiPlan = await interpretWithAI(
    userRequest,
    systemContext,
    targetContext,
    adaptationContext,
    decisionMemoryContext,
    exerciseSwapContext
  );

  if (aiPlan && Array.isArray(aiPlan.changes) && aiPlan.changes.length > 0) {
    // Guard 1: if AI produced a harder/easier intent but only changed notes, reject it and use our fallback
    const isProgressionIntent = /harder_variation|easier_variation|increase_difficulty|decrease_difficulty/i.test(aiPlan.intent);
    const onlyNotesChange = aiPlan.changes.every((c) => {
      if (c.type !== "update_exercise") return false;
      const keys = Object.keys(c.updates ?? {});
      return keys.length === 1 && keys[0] === "notes";
    });

    // Guard 2: if AI produced a replace_exercise with a generic placeholder name, reject it.
    // This catches cases where the AI outputs "replacement": {"name": "a harder variation", ...}
    const hasGenericReplacementName = aiPlan.changes.some((c) => {
      if (c.type !== "replace_exercise") return false;
      const replacementName = (c as any).replacement?.name ?? (c as any).updates?.name ?? "";
      if (isGenericPlaceholder(replacementName)) {
        logger.warn(
          { replacementName, intent: aiPlan.intent },
          "[InterpretEdit] AI produced generic placeholder name in replace_exercise — rejecting"
        );
        return true;
      }
      return false;
    });

    if (isProgressionIntent && onlyNotesChange) {
      logger.warn({ intent: aiPlan.intent, changes: aiPlan.changes.length }, "AI produced note-only mutation for progression request — rejecting, using real mutation fallback");
    } else if (hasGenericReplacementName) {
      logger.warn({ intent: aiPlan.intent }, "AI produced generic placeholder in replace_exercise — rejecting, using real mutation fallback");
    } else {
      logger.info({ intent: aiPlan.intent, scope: aiPlan.scope, changes: aiPlan.changes.length }, "AI edit plan generated");
      return aiPlan;
    }
  }

  // ── Fallback: progression-aware plan using library data ──────────────────
  if (
    (resolvedSwapIntent === "harder" || resolvedSwapIntent === "easier") &&
    fetchedProgressions &&
    targetContext?.type === "exercise"
  ) {
    const libFallback = buildProgressionFallbackPlan(targetContext, fetchedProgressions, resolvedSwapIntent);
    if (libFallback) {
      logger.info({ intent: libFallback.intent, exercise: targetContext.label, direction: resolvedSwapIntent }, "Using library progression fallback plan");
      return libFallback;
    }
  }

  // ── Final fallback: exercise-aware rule-based mutation ────────────────────
  logger.info("Falling back to rule-based edit interpretation");
  return interpretWithRules(userRequest, system, targetContext);
}
