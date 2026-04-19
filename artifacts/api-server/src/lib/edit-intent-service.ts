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
import { extractAgentIntentProfile, buildAgentIntentProfilePromptSection } from "./language-system";
import { auditLanguageInterpretation } from "./language-audit";
import { buildSwapContext, getProgressions, findExerciseByName, getSwapCandidates } from "./exercise-service";
import { resolveHarderEasierFallback } from "./harder-easier-fallback";
import { runIntentFamilyPipeline, logIntentFamilyDebug, type IntentFamilyPipelineResult } from "./intent-family-engine";
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

// ─── Deictic Session Reference Detector ──────────────────────────────────────
// Detects phrases like "this day", "this session", "today", "today's workout"
// where the user clearly refers to ONE specific session but without naming it
// by number or label. When this returns true and resolveTargetFromRequest
// returned undefined (no UIContext session is active), the edit engine cannot
// determine which session the user means and must ask for clarification instead
// of silently applying a program-wide change.

const DEICTIC_SESSION_RE =
  /\b(?:this\s+(?:day|session|workout|training\s+(?:session|day))|today(?:'s)?(?:\s+(?:session|workout|training|day))?)\b/i;

export function hasDeiticSessionReference(userRequest: string): boolean {
  return DEICTIC_SESSION_RE.test(userRequest);
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
  exerciseSwapContext?: string,
  intentFamilyDirective?: string,
  languageSystemSection?: string
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
    ? `\nEXERCISE SWAP INTELLIGENCE:\n${exerciseSwapContext}\nWhen performing a swap/replace:\n- If the user's request EXPLICITLY names a specific target exercise (e.g. "replace X with Pause Back Squat"), use EXACTLY that name — do not substitute with a candidate from the list.\n- If the user does NOT name a specific target (e.g. "swap this for something harder", "give me a different exercise", "replace this with something else"), this is an OPEN-ENDED SWAP. Choose the BEST candidate from the SWAP CANDIDATES list above automatically. Do NOT write vague placeholder text as the exercise name.\n- Never use placeholder phrases like "a different exercise", "another exercise", "something else", "another variation", or any similar generic text as an exercise name in a replace_exercise change.\n- Never invent exercise names not present in either the user's request or the candidates list.\n- The changeSummary must always state the EXACT exercise name chosen (e.g. "Broad Jump replaced with Box Jump") — never say "replaced with a different exercise".\n`
    : "";

  const intentFamilySection = intentFamilyDirective
    ? `\n${intentFamilyDirective}\n`
    : "";

  const langSection = languageSystemSection
    ? `\n${languageSystemSection}\n`
    : "";

  return `You are an elite performance architect editing a user's structured training system. You program according to NSCA strength & conditioning principles.

You know this athlete. You have worked with them before and remember the decisions you've made together.

You will receive:
1. The user's current structured training system (with IDs for every entity)
2. A natural language modification request
${targetFocus}${swapSection}${intentFamilySection}${langSection}
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
- IDENTITY REQUIRED: Produce an update_session change setting label (title) AND emphasis (subtitle) to reflect the new explosive identity.
  Example label: "Lower Power — Explosive Output + Bar Speed"
  Example emphasis: "Horizontal power, elastic force expression, and high-velocity lower-body force development"
  Adapt to the session's actual body region (Upper/Lower/Full Body).
- changeSummary MUST name specific exercise(s) added and prescription changes made (NOT "refocused toward explosive qualities")

STRENGTH SESSION ("make this a strength session", "more strength", "heavier focus"):
- Shift primary lift reps to 3-6 range
- Extend rest to 3-5 min on primary compound lifts
- Reduce or remove high-rep isolation accessories
- IDENTITY REQUIRED: Produce an update_session change setting label AND emphasis to reflect the new strength identity.
  Example label: "Lower Strength — Maximal Force Output"
  Example emphasis: "Heavy compound loading, peak force development, and bilateral strength expression"

HYPERTROPHY SESSION ("make this a hypertrophy session", "focus on muscle building"):
- Move primary lift reps to 6-10 range
- Add 1-2 isolation accessory exercises targeting the session's primary muscle group
- Extend sets on accessories by 1 set
- Set rest to 60-90s on accessories (metabolic demand)
- IDENTITY REQUIRED: Produce an update_session change setting label AND emphasis to reflect the new hypertrophy identity.
  Example label: "Upper Hypertrophy — Volume + Mechanical Tension"
  Example emphasis: "Isolation volume, metabolic stress, and progressive mechanical tension for muscle-building"
- changeSummary must name added exercises and rep range changes

ENDURANCE SESSION ("more endurance", "make this more endurance-based", "lower impact aerobic"):
- Shift rep ranges to 12-20+ or time-based
- Tighten rest to 30-60 sec
- Add a circuit or density block
- IDENTITY REQUIRED: Produce an update_session change setting label AND emphasis to reflect the new endurance identity.
  Example label: "Lower Strength Endurance — Work Capacity"
  Example emphasis: "High-rep density, compressed rest intervals, and aerobic capacity integration across the session"

CONDITIONING SESSION ("add conditioning to this session", "make this more metabolic"):
- Add a conditioning finisher (10-15 min assault bike, rowing intervals, or similar)
- Reduce rest on accessories to 60s
- IDENTITY REQUIRED: Produce an update_session change setting label AND emphasis to reflect the new conditioning identity.
  Example label: "Full Body Conditioning — Metabolic Output"
  Example emphasis: "High-intensity interval conditioning, circuit density, and cardiovascular work capacity"
- changeSummary must name the finisher and sessions affected

RULE: If a coaching transformation only produces update_session, update_week, or update_phase changes (text fields only) with NO add_exercise, replace_exercise, or update_exercise changes touching sets/reps/tempo/rest → the response is INVALID. You must include at least one structural change.

IDENTITY RULE: Every session coaching transformation (explosive, strength, hypertrophy, endurance, conditioning) MUST include an update_session change that updates BOTH label (the day title) AND emphasis (the one-line subtitle description). A transformation that leaves label and emphasis unchanged is INCOMPLETE — even if structural changes were made.

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
- Include update_session changes for each session affected — MUST update BOTH "label" AND "emphasis" fields to reflect the new training identity
- Include update_exercise / add_exercise / replace_exercise / delete_exercise for actual structural exercise changes
- Include update_week changes for volumeLevel where appropriate
- changeSummary MUST describe the structural changes made, not just "block updated"

BLOCK MUTATION — IDENTITY RULE:
Every block mutation that changes training emphasis MUST produce update_session changes that update BOTH "label" (the day title) AND "emphasis" (the one-line session descriptor) for each affected session. Examples:
- INCREASE_POWER_BIAS: session label → "Lower Power — Explosive Output + Bar Speed", emphasis → "Horizontal power, elastic force expression, and high-velocity lower-body development"
- ENDURANCE_TRANSFORMATION: session label → "Lower Strength Endurance — Work Capacity", emphasis → "High-rep density, compressed rest, and aerobic capacity integration"
- CONDITIONING_TRANSFORMATION: session label → "Full Body Conditioning — Metabolic Output", emphasis → "Interval conditioning circuits, minimal rest, and cardiovascular work capacity"
Do NOT leave session label and emphasis unchanged when the training emphasis shifts.

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
  exerciseSwapContext?: string,
  intentFamilyDirective?: string,
  languageSystemSection?: string
): Promise<EditPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = buildEditSystemPrompt(systemContext, targetContext, adaptationContext, decisionMemoryContext, exerciseSwapContext, intentFamilyDirective, languageSystemSection);

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
  // ── Open-ended swap language (user wants system to choose, not a literal exercise name) ──
  /^(a\s+)?(different|another|alternative|other|new)\s+(exercise|movement|variation|jump|squat|lift|drill|option|one)$/i,
  /^something\s+(else|different|similar|better|new|other|more\s+suitable|appropriate)$/i,
  /^(another|a\s+different)\s+one$/i,
  /^(any|a)\s+(good\s+)?(alternative|substitute|replacement|option|choice|movement|exercise)$/i,
  /^(a\s+)?different\s+(movement|exercise|option|variation|drill)$/i,
  /^(a\s+)?(suitable|appropriate|better|similar)\s+(alternative|substitute|replacement|exercise|movement|option)$/i,
  /^(another|a\s+different)\s+(jump|squat|press|pull|push|hinge|row|carry|drill|variation)$/i,
  /^(a\s+)?(new|fresh)\s+(exercise|movement|option|variation|alternative)$/i,
  /^something\s+(else\s+)?(here|instead)$/i,
  /^(any|another)\s+(exercise|movement|option|variation|one)(\s+(here|instead))?$/i,
];

export function isGenericPlaceholder(name: string): boolean {
  if (!name || name.trim().length === 0) return true;
  return GENERIC_PLACEHOLDER_PATTERNS.some((p) => p.test(name.trim()));
}

// ─── Open-Ended Swap Detection ────────────────────────────────────────────────
//
// Detects when a user's message contains swap intent with a vague/open-ended
// replacement target — meaning the system should automatically choose the best
// substitute from the library rather than treating the phrase as a literal name.
//
// Examples that match:
//   "Swap broad jump for a different exercise"
//   "Give me another jump here"
//   "Replace this with something else"
//   "Use a different movement"
//   "Swap this for another variation"

const OPEN_ENDED_SWAP_PATTERNS = [
  /\b(a|an)?\s*(different|another|alternative|other|new)\s+(exercise|movement|variation|jump|squat|lift|drill|option|one)\b/i,
  /\bsomething\s+(else|different|similar|better|new|other|more\s+suitable|appropriate)\b/i,
  /\b(another|a\s+different)\s+one\b/i,
  /\b(any|a)\s+(good|suitable|appropriate|better|similar|reasonable|great)?\s*(alternative|substitute|replacement|option|choice)\b/i,
  /\b(a\s+)?different\s+(movement|exercise|option|variation|drill)\b/i,
  /\b(give\s+me|show\s+me|find\s+me)\s+(a|another)\s+(exercise|movement|variation|jump|option|alternative)\b/i,
  /\b(replace|swap)\s+(this|it)\s+(out\s+)?(?:for|with)\s+(something|anything|another|a\s+different)\b/i,
  /\b(another|a\s+different)\s+(jump|squat|press|pull|push|hinge|row|carry|drill|variation)\b/i,
  /\b(use|try)\s+a\s+(different|new|alternative)\s+(exercise|movement|variation|option)\b/i,
  /\b(a\s+)?new\s+(exercise|movement|option|variation|alternative)\b/i,
  /\bswap\s+.+?\s+(?:for|with)\s+(a\s+)?(different|another|alternative|suitable|similar|good|appropriate|better)\b/i,
  /\b(change|switch)\s+.+?\s+to\s+(something|anything|another)\b/i,
  /\b(?:for|with)\s+(?:a\s+)?(?:suitable|appropriate|good|better|similar|reasonable)\s+(?:alternative|substitute|replacement|option)\b/i,
];

export function isOpenEndedSwapLanguage(text: string): boolean {
  return OPEN_ENDED_SWAP_PATTERNS.some((p) => p.test(text));
}

// ─── Swap Source Name Extractor ───────────────────────────────────────────────
// When a swap request lacks a specific target context but names the source exercise
// in the text, extract that source name so we can find candidates for it.

function extractSwapSourceName(userRequest: string): string | null {
  const match =
    userRequest.match(/(?:swap|replace)\s+(.+?)\s+(?:for|with)\s+/i)?.[1]?.trim() ||
    userRequest.match(/(?:change|switch)\s+(.+?)\s+to\s+/i)?.[1]?.trim() ||
    null;

  if (!match) return null;

  const lower = match.toLowerCase().trim();
  // Skip generic source references
  if (/^(this|it|out|the exercise|the movement|this exercise|this movement)$/.test(lower)) return null;
  if (match.length > 60) return null; // too long to be an exercise name

  return match;
}

// ─── Equipment Level Resolver ─────────────────────────────────────────────────

function resolveEquipmentLevel(system: any): string {
  const access = (system.equipmentAccess ?? "").toLowerCase();
  if ((access.includes("dumbbell") && !access.includes("barbell")) || access.includes("dumbbells_only")) {
    return "dumbbells_only";
  }
  if (access.includes("bodyweight") || access.includes("no equipment") || access.includes("bodyweight_only")) {
    return "bodyweight";
  }
  return "full_gym";
}

// ─── Injury Flags Resolver ────────────────────────────────────────────────────

function resolveInjuryFlags(system: any): string[] {
  const flags = system.injuryFlags ?? system.specialConsiderations;
  if (!flags) return [];
  return [flags].flat().filter(Boolean) as string[];
}

// ─── Coaching Focus Label (user-facing translation) ──────────────────────────
//
// Translates internal movement-pattern identifiers into plain coaching language
// for user-facing acknowledgment text only.
// Internal logs, reasons, and engine traces should NOT use this function.

function coachingFocusLabel(movementPattern?: string | null): string {
  const p = (movementPattern ?? "").toLowerCase().replace(/ /g, "_");
  if (p.includes("pull") || p.includes("row")) return "pulling focus";
  if (p.includes("squat") || p.includes("lunge")) return "lower-body strength focus";
  if (p.includes("hinge") || p.includes("deadlift")) return "posterior-chain focus";
  if (p.includes("push") || p.includes("press")) return "pressing focus";
  if (p.includes("jump") || p.includes("plyometric") || p.includes("power")) return "explosive emphasis";
  if (p.includes("carry") || p.includes("stability")) return "stability focus";
  if (p.includes("core") || p.includes("anti_rotation")) return "core focus";
  if (p.includes("conditioning") || p.includes("cardio")) return "conditioning focus";
  return "training focus";
}

// ─── Open-Ended Swap Auto-Selector ───────────────────────────────────────────
//
// When the user's swap intent is clear but the replacement is open-ended,
// this function automatically selects the best valid substitute from the library.
//
// Ranking policy:
//   1. Cluster members (same movement family / direct swap alternatives)
//   2. Movement-pattern fallback (same pattern, filtered by equipment/injury)
//   3. null (no safe substitute found — fall through to AGENT or clarification)
//
// The selected substitute is immediately committed as a canonical exercise.
// No vague placeholder text is ever written.

async function autoSelectOpenEndedSwap(opts: {
  exerciseName: string;
  exerciseId: number;
  userRequest: string;
  system: any;
}): Promise<EditPlan | null> {
  const { exerciseName, exerciseId, userRequest, system } = opts;

  const equipmentLevel = resolveEquipmentLevel(system);
  const injuryFlags = resolveInjuryFlags(system);

  const debugInfo: Record<string, unknown> = {
    originalRequest: userRequest.slice(0, 120),
    swapMode: "OPEN_ENDED_SWAP",
    currentExercise: exerciseName,
    equipmentLevel,
    injuryFlags,
  };

  let candidates: Awaited<ReturnType<typeof getSwapCandidates>> = [];

  try {
    candidates = await getSwapCandidates({
      exerciseName,
      equipmentLevel,
      injuryFlags,
      maxCount: 8,
    });
  } catch (err) {
    logger.warn({ err, exerciseName }, "[OpenEndedSwap] getSwapCandidates threw — cannot auto-resolve");
    return null;
  }

  debugInfo.candidateList = candidates.map((c) => c.name);
  debugInfo.candidateCount = candidates.length;

  if (candidates.length === 0) {
    debugInfo.result = "no_candidates";
    if (process.env.NODE_ENV !== "production") {
      console.log("[open-ended-swap:debug]", JSON.stringify(debugInfo));
    }
    logger.warn({ exerciseName }, "[OpenEndedSwap] No candidates found — cannot auto-resolve");
    return null;
  }

  // Pick best candidate (already ranked: cluster → pattern)
  const selected = candidates[0];
  const selectedName = selected.name;

  // Build a human rationale for the change summary
  const patternLabel = selected.movementPattern?.replace(/_/g, " ") ?? "similar movement";
  const focusLabel = coachingFocusLabel(selected.movementPattern);
  const rationale = `to keep the same ${focusLabel}`;

  debugInfo.selectedSubstitute = selectedName;
  debugInfo.rankingReason = selected.clusterId ? "cluster_match" : "movement_pattern_fallback";
  debugInfo.clarificationBypassed = true;
  debugInfo.result = "auto_selected";

  if (process.env.NODE_ENV !== "production") {
    console.log("[open-ended-swap:debug]", JSON.stringify(debugInfo));
  }

  logger.info(
    {
      exerciseName,
      selectedSubstitute: selectedName,
      rankingReason: debugInfo.rankingReason,
      candidateCount: candidates.length,
      swapMode: "OPEN_ENDED_SWAP",
    },
    "[OpenEndedSwap] Auto-selected substitute — committing canonical exercise"
  );

  return {
    intent: "swap_exercise",
    scope: "exercise",
    changeSummary: `${exerciseName} replaced with ${selectedName} — chosen ${rationale}. Sets, reps, and rest stayed the same.`,
    changes: [
      {
        type: "replace_exercise",
        id: exerciseId,
        replacement: {
          name: selectedName,
          notes: `Substituted for ${exerciseName} (${patternLabel} pattern preserved).`,
        },
        reason: `Open-ended swap auto-selection: ${exerciseName} → ${selectedName} (${rationale})`,
      },
    ],
  };
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

// ─── Structured Intent Registry ──────────────────────────────────────────────
//
// Canonical mapping of quick-action intent keys to their default scope.
// Quick actions that pass an intent bypass NLP entirely and route here.

export const COMMAND_INTENTS = {
  shorten_session:    { scopeDefault: "today" },
  reduce_volume:      { scopeDefault: "week" },
  increase_power:     { scopeDefault: "block" },
  recovery_focus:     { scopeDefault: "week" },
  convert_to_rest_day: { scopeDefault: "today" },
  travel_mode:        { scopeDefault: "today" },
} as const;

export type CommandIntentKey = keyof typeof COMMAND_INTENTS;

// ─── NLP → Structured Intent Mapper ──────────────────────────────────────────
//
// Called when NLP interpretation produces no actionable plan.
// Maps common natural language patterns to a structured intent key so we can
// route them through the deterministic handler instead of returning a failure.

export function mapNLPToIntent(userRequest: string): CommandIntentKey | null {
  const lower = userRequest.toLowerCase();

  if (/\b(shorten|shorter|quick|less time|no time|pressed for time|30 min|45 min)\b/.test(lower)) {
    return "shorten_session";
  }
  if (/\b(less volume|reduce volume|lower volume|cut volume|trim volume|less work)\b/.test(lower)) {
    return "reduce_volume";
  }
  if (/\b(more power|increase power|power focus|more explosive|add explosive)\b/.test(lower)) {
    return "increase_power";
  }
  if (/\b(recovery focus|recover|deload|reduce fatigue|less fatigue|regenerate)\b/.test(lower)) {
    return "recovery_focus";
  }
  if (/\b(rest day|convert.*rest|make.*rest|rest today)\b/.test(lower)) {
    return "convert_to_rest_day";
  }
  if (/\b(travel|dumbbells only|no gym|minimal equipment|hotel|bodyweight only)\b/.test(lower)) {
    return "travel_mode";
  }

  return null;
}

// ─── Structured Intent Handler ────────────────────────────────────────────────
//
// Deterministic execution for every registered quick-action intent.
// Never calls OpenAI. Always produces a valid EditPlan with real changes.

export function handleStructuredIntent(
  intent: CommandIntentKey | string,
  system: any,
  targetContext?: TargetContext
): EditPlan {
  switch (intent) {
    case "shorten_session":
      return handleShortenSession(system, targetContext);
    case "reduce_volume":
      return handleReduceVolume(system, targetContext);
    case "increase_power":
      return handleIncreasePower(system, targetContext);
    case "recovery_focus":
      return handleRecoveryFocus(system, targetContext);
    case "convert_to_rest_day":
      return handleConvertToRestDay(system, targetContext);
    case "travel_mode":
      return handleTravelMode(system, targetContext);
    default:
      logger.warn({ intent }, "[handleStructuredIntent] Unknown intent — falling back to reduce_volume");
      return handleReduceVolume(system, targetContext);
  }
}

// ─── shorten_session ──────────────────────────────────────────────────────────
//
// Reduces accessory exercise sets by 25–35% and compresses rest times.
// Primary compound lifts are protected. Falls back to coaching note only
// if the session has no accessory or secondary exercises to trim.

function handleShortenSession(system: any, targetContext?: TargetContext): EditPlan {
  const session =
    targetContext?.type === "session"
      ? findSessionById(system, targetContext.id)
      : findCurrentSession(system);

  if (!session) {
    return {
      intent: "shorten_session",
      scope: "session",
      changeSummary: "Session compressed — primary work preserved, finishers cut.",
      changes: [],
      _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
    };
  }

  const sessionLabel = targetContext?.label ?? session.label ?? "Today's session";
  const exercises: any[] = session.exercises ?? [];
  const changes: EditChange[] = [];
  const trimmedNames: string[] = [];

  for (const ex of exercises) {
    const cat = (ex.category ?? "").toLowerCase();
    const isPrimary = cat === "primary";

    if (isPrimary) continue;

    const updates: Record<string, unknown> = {};

    // Reduce sets by ~30% (floor at 2)
    if (ex.sets != null && typeof ex.sets === "number" && ex.sets > 2) {
      const newSets = Math.max(2, Math.floor(ex.sets * 0.7));
      if (newSets < ex.sets) {
        updates.sets = newSets;
      }
    }

    // Compress rest times
    const restStr: string = ex.rest ?? "";
    const restMinMatch = restStr.match(/(\d+)\s*-\s*(\d+)\s*min/i);
    const restSecMatch = restStr.match(/(\d+)\s*s(?:ec)?/i);
    if (restMinMatch) {
      const lo = parseInt(restMinMatch[1]);
      const hi = parseInt(restMinMatch[2]);
      if (lo >= 2) {
        updates.rest = `${Math.max(1, lo - 1)}-${Math.max(lo, hi - 1)} min`;
      }
    } else if (restSecMatch) {
      const sec = parseInt(restSecMatch[1]);
      if (sec > 60) {
        updates.rest = `${Math.max(30, Math.floor(sec * 0.7))}s`;
      }
    }

    if (Object.keys(updates).length > 0) {
      changes.push({ type: "update_exercise", id: ex.id, updates, reason: "Compressing session — time-constrained" });
      trimmedNames.push(ex.name);
    }
  }

  // Always add a coaching note on the session itself
  changes.push({
    type: "update_session",
    id: session.id,
    updates: { coachingNotes: "Time-compressed session: primary lifts take priority. Skip finishers if pressed. Quality > quantity today." },
    reason: "Session shortened per quick action",
  });

  const summary =
    trimmedNames.length > 0
      ? `${sessionLabel} shortened. Trimmed sets and rest on: ${trimmedNames.slice(0, 3).join(", ")}${trimmedNames.length > 3 ? ` +${trimmedNames.length - 3} more` : ""}. Primary lifts untouched.`
      : `${sessionLabel} compressed — primary work intact, finishers flagged as optional.`;

  return {
    intent: "shorten_session",
    scope: "session",
    changeSummary: summary,
    changes,
    _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
  };
}

// ─── reduce_volume ────────────────────────────────────────────────────────────
//
// Removes 1 set from accessory exercises across the current week (or targeted scope).
// Primary compound lifts are always protected.

function handleReduceVolume(system: any, targetContext?: TargetContext): EditPlan {
  const week =
    targetContext?.type === "week"
      ? (() => {
          for (const phase of system.phases ?? []) {
            for (const w of phase.weeks ?? []) {
              if (w.id === targetContext.id) return w;
            }
          }
          return null;
        })()
      : targetContext?.type === "session"
      ? null
      : findCurrentWeek(system);

  const session =
    targetContext?.type === "session" ? findSessionById(system, targetContext.id) : null;

  const sessions: any[] = session
    ? [session]
    : (week?.sessions ?? []).filter((s: any) => !s.isRestDay);

  const changes: EditChange[] = [];
  const trimmedNames: string[] = [];

  for (const s of sessions) {
    for (const ex of s.exercises ?? []) {
      const cat = (ex.category ?? "").toLowerCase();
      if (cat === "primary") continue;
      if (ex.sets != null && typeof ex.sets === "number" && ex.sets > 2) {
        const newSets = ex.sets - 1;
        changes.push({ type: "update_exercise", id: ex.id, updates: { sets: newSets }, reason: "Volume reduction — dropped 1 accessory set" });
        trimmedNames.push(ex.name);
      }
    }
  }

  const scopeLabel =
    session ? (targetContext?.label ?? session.label ?? "this session") :
    week ? (targetContext?.label ?? week.label ?? "this week") : "current scope";

  const summary =
    trimmedNames.length > 0
      ? `Volume reduced for ${scopeLabel}. Dropped 1 set from: ${trimmedNames.slice(0, 4).join(", ")}${trimmedNames.length > 4 ? ` +${trimmedNames.length - 4} more` : ""}. Primary lifts untouched.`
      : `Volume already lean for ${scopeLabel} — no accessory sets to trim. Primary work protected.`;

  return {
    intent: "reduce_volume",
    scope: week ? "week" : "session",
    changeSummary: summary,
    changes,
    _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
  };
}

// ─── increase_power ───────────────────────────────────────────────────────────
//
// Adds explosive tempo cues to primary lifts in the current session and
// injects a plyometric movement if none exists.

function handleIncreasePower(system: any, targetContext?: TargetContext): EditPlan {
  const session =
    targetContext?.type === "session"
      ? findSessionById(system, targetContext.id)
      : findCurrentSession(system);

  if (!session) {
    return { intent: "increase_power", scope: "session", changeSummary: "No active session found to apply power focus.", changes: [],
      _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" } };
  }

  const sessionLabel = targetContext?.label ?? session.label ?? "Today's session";
  const exercises: any[] = session.exercises ?? [];
  const changes: EditChange[] = [];

  const hasExplosive = exercises.some((ex: any) =>
    /\b(box|broad)\s+jump|jump\s+squat|power\s+clean|med\s+ball|medicine\s+ball|bound/i.test(ex.name)
  );

  if (!hasExplosive) {
    const hasLower = exercises.some((ex: any) => /squat|deadlift|lunge|hip\s+thrust|romanian|rdl/i.test(ex.name));
    const explosive = hasLower ? "Box Jump" : "Med Ball Slam";
    changes.push({
      type: "add_exercise", id: 0, sessionId: session.id,
      exercise: { name: explosive, category: "explosive", sets: 4, reps: "4", rest: "2 min", tempo: "X10X",
        notes: "Max intent each rep — full reset between sets. Focus on hip extension and bar speed." },
      reason: "Power focus — explosive movement injection",
    });
  }

  const primaryLifts = exercises.filter((ex: any) => (ex.category ?? "").toLowerCase() === "primary");
  for (const ex of primaryLifts) {
    changes.push({
      type: "update_exercise", id: ex.id,
      updates: { tempo: "3-1-X-0", rest: "3 min", notes: "Power focus: bar speed on concentric. Reset completely between sets." },
      reason: "Power emphasis — tempo and rest updated",
    });
  }

  const summary = `${sessionLabel} shifted toward power. Explosive tempo applied to primary lifts${!hasExplosive ? "; Box Jump / Med Ball Slam added" : ""}. Full CNS recovery between sets.`;

  return {
    intent: "increase_power",
    scope: "session",
    changeSummary: summary,
    changes,
    _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
  };
}

// ─── recovery_focus ───────────────────────────────────────────────────────────
//
// Drops accessory sets by 1 and softens rest times across the current week's
// sessions to reduce accumulated fatigue.

function handleRecoveryFocus(system: any, targetContext?: TargetContext): EditPlan {
  const week =
    targetContext?.type === "week"
      ? (() => {
          for (const phase of system.phases ?? []) {
            for (const w of phase.weeks ?? []) {
              if (w.id === targetContext.id) return w;
            }
          }
          return null;
        })()
      : findCurrentWeek(system);

  const sessions: any[] = (week?.sessions ?? []).filter((s: any) => !s.isRestDay);
  const changes: EditChange[] = [];
  const sessionNames: string[] = [];

  for (const s of sessions) {
    let modified = false;
    for (const ex of s.exercises ?? []) {
      const cat = (ex.category ?? "").toLowerCase();
      if (cat === "primary") continue;
      if (ex.sets != null && typeof ex.sets === "number" && ex.sets > 2) {
        changes.push({ type: "update_exercise", id: ex.id, updates: { sets: ex.sets - 1, notes: "Recovery week: stop 3+ RIR. No grinding." }, reason: "Recovery focus — accessory volume reduced" });
        modified = true;
      }
    }
    if (modified) {
      sessionNames.push(s.label ?? "Session");
      changes.push({
        type: "update_session", id: s.id,
        updates: { coachingNotes: "Recovery focus: move well, not hard. Terminate sets well before failure. Prioritise tissue quality over load." },
        reason: "Recovery focus coaching note",
      });
    }
  }

  const scopeLabel = targetContext?.label ?? week?.label ?? "this week";
  const summary =
    changes.length > 0
      ? `Recovery focus applied across ${scopeLabel}. Accessory volume reduced in ${sessionNames.slice(0, 3).join(", ")}. Primary work maintained at controlled intensity.`
      : `${scopeLabel} is already at low volume — no further reduction needed. Coaching cues updated to reflect recovery intent.`;

  return {
    intent: "recovery_focus",
    scope: "week",
    changeSummary: summary,
    changes,
    _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
  };
}

// ─── convert_to_rest_day ──────────────────────────────────────────────────────
//
// Converts the current (or targeted) session to active recovery. Updates type,
// emphasis, and coaching notes. Does not delete exercises but flags the session.

function handleConvertToRestDay(system: any, targetContext?: TargetContext): EditPlan {
  const session =
    targetContext?.type === "session"
      ? findSessionById(system, targetContext.id)
      : findCurrentSession(system);

  if (!session) {
    return { intent: "convert_to_rest_day", scope: "session", changeSummary: "No active session found to convert.", changes: [],
      _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" } };
  }

  const sessionLabel = targetContext?.label ?? session.label ?? "Today's session";
  const changes: EditChange[] = [{
    type: "update_session", id: session.id,
    updates: {
      sessionType: "recovery",
      isRestDay: true,
      emphasis: "Full recovery — tissue quality and nervous system restoration",
      coachingNotes: "Rest day. If you move, keep it light: walk, stretch, foam roll. No training load. Protect tomorrow's performance.",
    },
    reason: "Converted to rest day via quick action",
  }];

  return {
    intent: "convert_to_rest_day",
    scope: "session",
    changeSummary: `${sessionLabel} converted to a full rest day. Recovery and nervous system restoration prioritised. See you tomorrow.`,
    changes,
    _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
  };
}

// ─── travel_mode ──────────────────────────────────────────────────────────────
//
// Applies an equipment constraint note to the current session and flags
// barbell/machine exercises with modification cues for dumbbell/bodyweight alternatives.

function handleTravelMode(system: any, targetContext?: TargetContext): EditPlan {
  const session =
    targetContext?.type === "session"
      ? findSessionById(system, targetContext.id)
      : findCurrentSession(system);

  if (!session) {
    return { intent: "travel_mode", scope: "session", changeSummary: "No active session found for travel mode.", changes: [],
      _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" } };
  }

  const sessionLabel = targetContext?.label ?? session.label ?? "Today's session";
  const exercises: any[] = session.exercises ?? [];
  const changes: EditChange[] = [];
  const flaggedNames: string[] = [];

  for (const ex of exercises) {
    const needsEquipment = /barbell|cable|machine|rack|smith|leg\s+press|pull-?down|seated\s+row/i.test(ex.name);
    if (needsEquipment) {
      changes.push({
        type: "update_exercise", id: ex.id,
        updates: { notes: "Travel mode: substitute with dumbbell or bodyweight variation. Maintain intent, not the tool." },
        reason: "Travel mode — equipment-dependent exercise flagged",
      });
      flaggedNames.push(ex.name);
    }
  }

  changes.push({
    type: "update_session", id: session.id,
    updates: { coachingNotes: "Travel mode: dumbbells and bodyweight only. Keep the movement patterns, adjust the tools. Intensity stays, equipment changes." },
    reason: "Travel mode — session coaching note updated",
  });

  const summary =
    flaggedNames.length > 0
      ? `${sessionLabel} adapted for travel. Equipment notes added to: ${flaggedNames.slice(0, 3).join(", ")}${flaggedNames.length > 3 ? ` +${flaggedNames.length - 3} more` : ""}. Session intent preserved.`
      : `${sessionLabel} looks travel-friendly already. Coaching notes updated to confirm dumbbell/bodyweight focus.`;

  return {
    intent: "travel_mode",
    scope: "session",
    changeSummary: summary,
    changes,
    _debugRoute: { openaiCalled: false, openaiSucceeded: false, pathUsed: "deterministic" },
  };
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
        changeSummary: `${label} has been swapped for ${swapTo}. Sets, reps, and rest stayed the same.`,
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
        changeSummary: `Removed a set from ${label} to reduce local fatigue.`,
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
      // ── EXPLOSIVE TRANSFORMATION BUNDLE ─────────────────────────────────────
      // Requirements (minimum 2 of these structural changes must fire):
      //   1. Add explosive movement (mandatory if none exists)
      //   2. Adjust primary lift rep scheme → power range (2-5 reps)
      //   3. Apply tempo (3-1-X-0) + rest (2-3 min) to primary lifts
      //   4. Reduce conflicting hypertrophy accessories (12+ reps → 8-10)
      // Validation: totalStructuralChanges < 2 → fall through to AGENT.
      // Text-only change (description alone, or tempo alone) is NOT valid.
      const targetSession = findSessionById(system, sessionId);
      const changes: EditChange[] = [];
      const addedExerciseNames: string[] = [];
      const modifiedExerciseNames: string[] = [];

      if (targetSession) {
        const exercises: any[] = targetSession.exercises ?? [];

        // ── BUNDLE CHANGE 1: Explosive movement (mandatory if none present) ────
        const hasExplosiveMovement = exercises.some((ex: any) =>
          /\b(box|broad)\s+jump|jump\s+squat|power\s+clean|power\s+snatch|med\s+ball|medicine\s+ball|bound|plyometric/i.test(ex.name)
        );

        if (!hasExplosiveMovement) {
          const hasLowerBodyLift = exercises.some((ex: any) =>
            /squat|deadlift|lunge|leg\s+press|hip\s+thrust|romanian|rdl|hamstring|glute/i.test(ex.name)
          );
          const isUpperBody = exercises.some((ex: any) =>
            /bench|press|row|pull|chin|dip|shoulder|chest/i.test(ex.name)
          );
          const explosiveChoice =
            hasLowerBodyLift ? "Box Jump" :
            isUpperBody ? "Med Ball Slam" :
            "Box Jump";

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
              notes: "Max intent every rep — reset completely between sets. Sub-maximal load (60-70% of max), explosive concentric on every rep.",
            },
            reason: "Explosive movement addition — non-optional for power transformation",
          });
          addedExerciseNames.push(explosiveChoice);
        }

        // ── BUNDLE CHANGE 2+3: Primary lifts → power rep range + tempo + rest ─
        // Always apply the full power bundle. Rep scheme shifts to 3-5 if currently
        // above power range (> 5 reps). Tempo and rest are always applied.
        const primaryLifts = exercises.filter((ex: any) => ex.category === "primary");
        for (const ex of primaryLifts) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMax = rangeMatch
            ? parseInt(rangeMatch[2])
            : singleMatch
            ? parseInt(singleMatch[1])
            : 99;

          const repUpdates: Record<string, unknown> = {
            tempo: "3-1-X-0",
            rest: "2-3 min",
            notes: "Power bundle: 3-sec eccentric, 1-sec pause, explosive concentric. Target 70-80% of max — bar speed is the priority.",
          };

          if (currentMax > 5) {
            repUpdates.reps = "3-5";
          } else if (currentMax === 5) {
            repUpdates.reps = "2-4";
          }
          // If already ≤ 4: keep reps, still apply tempo/rest (structural via tempo key)

          changes.push({
            type: "update_exercise",
            id: ex.id,
            updates: repUpdates,
            reason: "Power bundle: shifting primary lift to power rep range with tempo and extended rest",
          });
          modifiedExerciseNames.push(ex.name);
        }

        // ── BUNDLE CHANGE 4: Reduce slow hypertrophy accessories ──────────────
        // Accessories programmed at 12+ reps conflict with power session quality.
        const accessories = exercises.filter((ex: any) => ex.category === "accessory");
        for (const ex of accessories) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMin = rangeMatch
            ? parseInt(rangeMatch[1])
            : singleMatch
            ? parseInt(singleMatch[1])
            : 0;

          if (currentMin >= 12) {
            changes.push({
              type: "update_exercise",
              id: ex.id,
              updates: {
                reps: "8-10",
                rest: "90s",
                notes: "Reduced from hypertrophy range — preserving power session quality and CNS freshness.",
              },
              reason: "Reducing high-rep accessory to preserve power focus",
            });
            modifiedExerciseNames.push(ex.name);
          }
        }
      }

      // ── VALIDATION: minimum 2 structural changes required ────────────────────
      // "Structural" = add_exercise, replace_exercise, delete_exercise, or
      // update_exercise touching sets/reps/tempo/rest.
      // A tempo-only single change or description-only change does NOT qualify.
      const bundleStructuralChanges = changes.filter(c =>
        c.type === "add_exercise" ||
        c.type === "replace_exercise" ||
        c.type === "delete_exercise" ||
        (c.type === "update_exercise" && c.updates &&
          Object.keys(c.updates).some(k => ["sets", "reps", "tempo", "rest"].includes(k)))
      );

      if (bundleStructuralChanges.length >= 2) {
        // Commit: add session description as final secondary change
        changes.push({
          type: "update_session",
          id: sessionId,
          updates: {
            emphasis: "Power and force expression — explosive output prioritized",
            coachingNotes: "Power session: open with max-intent explosive work. Primaries at 70-80% with bar speed focus. Full recovery between sets — execution quality over fatigue.",
          },
          reason: "Updating session emphasis to reflect power focus",
        });

        const summaryParts: string[] = [];
        if (addedExerciseNames.length) {
          summaryParts.push(`added ${addedExerciseNames.join(" and ")}`);
        }
        if (modifiedExerciseNames.length) {
          const named = modifiedExerciseNames.slice(0, 3).join(" and ");
          const hasTempo = changes.some(c => c.type === "update_exercise" && (c.updates as any)?.tempo);
          const hasReps = changes.some(c => c.type === "update_exercise" && (c.updates as any)?.reps);
          const details: string[] = [];
          if (hasReps) details.push("shifted to power rep range (2-5)");
          if (hasTempo) details.push("3-1-X-0 tempo");
          details.push("2-3 min rest");
          summaryParts.push(`adjusted ${named} — ${details.join(", ")}`);
        }

        return {
          intent: "explosive_session_transformation",
          scope: "session",
          changeSummary: `${label} restructured for explosive output: ${summaryParts.join("; ")}. Primary lifts locked at 70-80% load with controlled eccentrics and full CNS recovery between sets.`,
          changes,
        };
      }

      // Fewer than 2 structural changes possible (e.g. session has no exercises yet,
      // or already has explosive movement and primary reps already in power range) →
      // fall through to return { changes: [] }, which triggers auto-escalation to AGENT.
    }

    if (lower.match(/endurance|aerobic|cardio|metabolic|work.capacity|stamina|conditioning/)) {
      // ── ENDURANCE TRANSFORMATION BUNDLE ─────────────────────────────────────
      // Requirements (minimum 2 structural changes):
      //   1. Add conditioning finisher (if no conditioning work exists)
      //   2. Tighten rest on primary lifts (metabolic density → 90s)
      //   3. Push accessories to higher rep range (12-15) for endurance adaptation
      const targetSession = findSessionById(system, sessionId);
      const endChanges: EditChange[] = [];
      const endAddedNames: string[] = [];
      const endModifiedNames: string[] = [];

      if (targetSession) {
        const exercises: any[] = targetSession.exercises ?? [];

        // CHANGE 1: Add conditioning finisher (mandatory if none exists)
        const hasConditioningWork = exercises.some((ex: any) =>
          /\b(bike|row|sled|finisher|conditioning|cardio|run|sprint|interval|treadmill|assault|hiit|circuit|rower)\b/i.test(ex.name)
        );
        if (!hasConditioningWork) {
          const hasLowerBody = exercises.some((ex: any) =>
            /squat|deadlift|lunge|leg|hip|glute|hamstring/i.test(ex.name)
          );
          const finisherName = hasLowerBody ? "Rowing Machine Intervals" : "Assault Bike Intervals";
          endChanges.push({
            type: "add_exercise",
            id: 0,
            sessionId,
            exercise: {
              name: finisherName,
              category: "conditioning",
              sets: 8,
              reps: "30s on / 30s off",
              rest: "30s",
              notes: "Endurance finisher. Target 75-80% max HR. Controlled, sustainable effort — not all-out.",
            },
            reason: "Adding conditioning finisher for endurance session",
          });
          endAddedNames.push(finisherName);
        }

        // CHANGE 2: Tighten rest on primaries for metabolic density
        const primaryLifts = exercises.filter((ex: any) => ex.category === "primary");
        for (const ex of primaryLifts) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMin = rangeMatch ? parseInt(rangeMatch[1]) : (singleMatch ? parseInt(singleMatch[1]) : 0);

          const endUpdates: Record<string, unknown> = {
            rest: "90s",
            notes: "Endurance focus: moderate load (60-70% of max), controlled pace, 90s rest to build work capacity.",
          };
          if (currentMin < 8) {
            endUpdates.reps = "8-12";
          }
          endChanges.push({
            type: "update_exercise",
            id: ex.id,
            updates: endUpdates,
            reason: "Adjusting primary lift for endurance density: tighter rest, higher rep range",
          });
          endModifiedNames.push(ex.name);
        }

        // CHANGE 3: Push accessories to endurance rep zone (12-15)
        const accessories = exercises.filter((ex: any) => ex.category === "accessory");
        for (const ex of accessories) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMax = rangeMatch ? parseInt(rangeMatch[2]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMax < 12) {
            endChanges.push({
              type: "update_exercise",
              id: ex.id,
              updates: { reps: "12-15", rest: "60s", notes: "Pushed to endurance rep zone — tight rest, sustainable effort." },
              reason: "Extending accessory to endurance rep range",
            });
            endModifiedNames.push(ex.name);
          }
        }
      }

      // Minimum 2 structural changes required
      const enduranceStructural = endChanges.filter(c =>
        c.type === "add_exercise" || c.type === "replace_exercise" ||
        (c.type === "update_exercise" && c.updates &&
          Object.keys(c.updates).some(k => ["sets", "reps", "rest"].includes(k)))
      );

      if (enduranceStructural.length >= 2) {
        endChanges.push({
          type: "update_session",
          id: sessionId,
          updates: {
            emphasis: "Endurance and work capacity — metabolic density, sustained output",
            coachingNotes: "Endurance session: tighter rest, higher reps, conditioning finisher to close. Quality reps with minimal recovery between sets.",
          },
          reason: "Updating session emphasis for endurance focus",
        });

        const summaryParts: string[] = [];
        if (endAddedNames.length) summaryParts.push(`added ${endAddedNames.join(" and ")}`);
        if (endModifiedNames.length) {
          const named = endModifiedNames.slice(0, 3).join(" and ");
          summaryParts.push(`adjusted ${named} for endurance output (90s rest, rep range pushed to 8-15)`);
        }

        return {
          intent: "endurance_session_transformation",
          scope: "session",
          changeSummary: `${label} restructured for endurance and work capacity: ${summaryParts.join("; ")}. Rest pulled tight and conditioning finisher added — builds sustained output without losing structural integrity.`,
          changes: endChanges,
        };
      }
      // < 2 structural changes → fall through to AGENT
    }

    if (lower.match(/hypertrophy|muscle.build|muscle.growth|muscle.mass|bodybuilding|bigger|size/)) {
      // ── HYPERTROPHY TRANSFORMATION BUNDLE ────────────────────────────────────
      // Requirements (minimum 2 structural changes):
      //   1. Add 1-2 isolation accessories targeting session's primary muscle group
      //   2. Move primary lifts to hypertrophy rep range (6-10)
      //   3. Adjust accessories to 10-15 rep range with 60-90s rest
      const targetSession = findSessionById(system, sessionId);
      const hypChanges: EditChange[] = [];
      const hypAddedNames: string[] = [];
      const hypModifiedNames: string[] = [];

      if (targetSession) {
        const exercises: any[] = targetSession.exercises ?? [];
        const isLowerBodySession = exercises.some((ex: any) =>
          /squat|deadlift|lunge|leg|hip|glute|hamstring/i.test(ex.name)
        );

        // CHANGE 1: Add isolation accessory
        const isolationChoice = isLowerBodySession ? "Leg Extension" : "Cable Fly";
        const alreadyHasIsolation = exercises.some((ex: any) =>
          /cable.*fly|fly|leg.*extension|leg.*curl|lateral.*raise|curl|pushdown|kickback/i.test(ex.name)
        );
        if (!alreadyHasIsolation) {
          hypChanges.push({
            type: "add_exercise",
            id: 0,
            sessionId,
            exercise: {
              name: isolationChoice,
              category: "accessory",
              sets: 3,
              reps: "12-15",
              rest: "60s",
              notes: "Hypertrophy isolation work. High rep, feel the muscle. 2-sec contraction at peak.",
            },
            reason: "Adding isolation accessory for hypertrophy focus",
          });
          hypAddedNames.push(isolationChoice);
        }

        // CHANGE 2: Primary lifts → hypertrophy rep range (6-10)
        const primaryLifts = exercises.filter((ex: any) => ex.category === "primary");
        for (const ex of primaryLifts) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMax = rangeMatch ? parseInt(rangeMatch[2]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMax < 6 || currentMax > 12) {
            hypChanges.push({
              type: "update_exercise",
              id: ex.id,
              updates: { reps: "6-10", rest: "90s", notes: "Hypertrophy zone: moderate load, control the eccentric, squeeze the contraction." },
              reason: "Moving primary lift to hypertrophy rep range",
            });
            hypModifiedNames.push(ex.name);
          }
        }

        // CHANGE 3: Accessories → 10-15 rep range, 60s rest
        const accessories = exercises.filter((ex: any) => ex.category === "accessory");
        for (const ex of accessories) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMin = rangeMatch ? parseInt(rangeMatch[1]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMin < 10) {
            hypChanges.push({
              type: "update_exercise",
              id: ex.id,
              updates: { reps: "10-15", rest: "60-75s", notes: "Hypertrophy range — keep rest tight for metabolic demand." },
              reason: "Moving accessory into hypertrophy rep range",
            });
            hypModifiedNames.push(ex.name);
          }
        }
      }

      // Minimum 2 structural changes required
      const hypStructural = hypChanges.filter(c =>
        c.type === "add_exercise" || c.type === "replace_exercise" ||
        (c.type === "update_exercise" && c.updates &&
          Object.keys(c.updates).some(k => ["sets", "reps", "rest"].includes(k)))
      );

      if (hypStructural.length >= 2) {
        hypChanges.push({
          type: "update_session",
          id: sessionId,
          updates: {
            emphasis: "Hypertrophy — mechanical tension, metabolic stress, volume accumulation",
            coachingNotes: "Hypertrophy session: moderate loads, controlled eccentrics, 60-90s rest to keep metabolic demand high. Feel every rep.",
          },
          reason: "Updating session emphasis for hypertrophy focus",
        });

        const summaryParts: string[] = [];
        if (hypAddedNames.length) summaryParts.push(`added ${hypAddedNames.join(" and ")}`);
        if (hypModifiedNames.length) {
          const named = hypModifiedNames.slice(0, 3).join(" and ");
          summaryParts.push(`adjusted ${named} for hypertrophy output (6-10 rep range, 60-90s rest)`);
        }

        return {
          intent: "hypertrophy_session_transformation",
          scope: "session",
          changeSummary: `${label} restructured for hypertrophy: ${summaryParts.join("; ")}. Rep ranges in growth zone, rest intervals tightened to drive metabolic stress.`,
          changes: hypChanges,
        };
      }
      // < 2 structural changes → fall through to AGENT
    }

    if (lower.match(/strength|stronger|heavier|max.strength|strength.focus|strength.based/)) {
      // ── STRENGTH TRANSFORMATION BUNDLE ───────────────────────────────────────
      // Requirements (minimum 2 structural changes):
      //   1. Reduce primary lift reps to strength zone (3-6)
      //   2. Extend rest to 3-5 min for CNS recovery
      //   3. Add load progression note targeting 85-92% of max
      const targetSession = findSessionById(system, sessionId);
      const strChanges: EditChange[] = [];
      const strModifiedNames: string[] = [];

      if (targetSession) {
        const exercises: any[] = targetSession.exercises ?? [];

        // CHANGE 1+2: Primary lifts → strength rep range + full rest
        const primaryLifts = exercises.filter((ex: any) => ex.category === "primary");
        for (const ex of primaryLifts) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMin = rangeMatch ? parseInt(rangeMatch[1]) : (singleMatch ? parseInt(singleMatch[1]) : 0);

          const strUpdates: Record<string, unknown> = {
            rest: "3-5 min",
            notes: "Strength focus: target 85-92% of max. Full recovery between sets. Quality over speed — brace hard, lift heavy.",
          };
          if (currentMin > 6) {
            strUpdates.reps = "3-6";
          }
          strChanges.push({
            type: "update_exercise",
            id: ex.id,
            updates: strUpdates,
            reason: "Applying strength bundle: low reps, heavy load, full rest",
          });
          strModifiedNames.push(ex.name);
        }

        // CHANGE 3: Reduce accessories — trim volume to preserve strength output
        const accessories = exercises.filter((ex: any) => ex.category === "accessory");
        for (const ex of accessories) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMax = rangeMatch ? parseInt(rangeMatch[2]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMax > 10) {
            strChanges.push({
              type: "update_exercise",
              id: ex.id,
              updates: { reps: "6-8", rest: "2 min", notes: "Pulled back from high-rep range to preserve strength capacity on primaries." },
              reason: "Reducing accessory volume to preserve strength output",
            });
            strModifiedNames.push(ex.name);
          }
        }
      }

      // Minimum 2 structural changes required
      const strStructural = strChanges.filter(c =>
        c.type === "update_exercise" && c.updates &&
        Object.keys(c.updates).some(k => ["sets", "reps", "rest"].includes(k))
      );

      if (strStructural.length >= 2) {
        strChanges.push({
          type: "update_session",
          id: sessionId,
          updates: {
            emphasis: "Maximal strength — heavy loads, full recovery, neural drive",
            coachingNotes: "Strength session: target top-end intensity. Low reps, full rest, every set counts. Leave 1-2 reps in reserve on primaries.",
          },
          reason: "Updating session emphasis for strength focus",
        });

        const named = strModifiedNames.slice(0, 3).join(" and ");
        return {
          intent: "strength_session_transformation",
          scope: "session",
          changeSummary: `${label} restructured for maximal strength: adjusted ${named} to strength zone (3-6 reps, 3-5 min rest, 85-92% load target). Accessories pulled back to preserve neural output.`,
          changes: strChanges,
        };
      }
      // < 2 structural changes → fall through to AGENT
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

    // Derives a new block name by swapping the style keyword in the existing name.
    // e.g. "Foundation Strength Block" + "Hypertrophy" → "Foundation Hypertrophy Block"
    // Falls back to "<Focus> Block" if the existing name has no recognizable style word.
    function deriveBlockName(existingName: string, newFocusWord: string): string {
      const styled = existingName.replace(
        /\b(strength|power|hypertrophy|endurance|conditioning|athletic|speed|explosive|aerobic)\b/gi,
        newFocusWord
      );
      return styled !== existingName ? styled : `${newFocusWord} Block`;
    }

    if (lower.match(/power|explosive|speed|athletic/)) {
      // ── BLOCK-LEVEL POWER/EXPLOSIVE TRANSFORMATION ──────────────────────────
      // For each session in the phase:
      //   1. Add explosive movement if none exists
      //   2. Primary lifts → 3-5 reps, 3-1-X-0 tempo, 2-3 min rest
      //   3. Accessories at 12+ reps → pulled to 8-10 (conflict with CNS recovery)
      //   4. Update session emphasis
      //   5. Update phase emphasis + goal
      const blockPowerChanges: EditChange[] = [];

      const targetPhase = (system.phases ?? []).find((p: any) => p.id === phaseId);
      const allPowerSessions: any[] = [];
      for (const week of targetPhase?.weeks ?? []) {
        for (const session of week.sessions ?? []) allPowerSessions.push(session);
      }
      const seenPowerIds = new Set<number>();
      const uniquePowerSessions = allPowerSessions.filter((s: any) => {
        if (seenPowerIds.has(s.id)) return false;
        seenPowerIds.add(s.id);
        return true;
      });

      for (const session of uniquePowerSessions) {
        const exercises: any[] = session.exercises ?? [];
        const hasExplosive = exercises.some((ex: any) =>
          /\b(box|broad)\s+jump|jump\s+squat|power\s+clean|power\s+snatch|med\s+ball|medicine\s+ball|bound|plyometric/i.test(ex.name)
        );
        if (!hasExplosive) {
          const hasLower = exercises.some((ex: any) =>
            /squat|deadlift|lunge|leg\s+press|hip\s+thrust|romanian|rdl|hamstring|glute/i.test(ex.name)
          );
          const isUpper = exercises.some((ex: any) =>
            /bench|press|row|pull|chin|dip|shoulder|chest/i.test(ex.name)
          );
          const explosiveName = hasLower ? "Box Jump" : isUpper ? "Med Ball Slam" : "Box Jump";
          blockPowerChanges.push({
            type: "add_exercise",
            id: 0,
            sessionId: session.id,
            exercise: {
              name: explosiveName,
              category: "explosive",
              sets: 4,
              reps: "5",
              rest: "2-3 min",
              tempo: "X10X",
              notes: "Max intent every rep — full reset between sets. 60-70% load, explosive concentric.",
            },
            reason: "Block power refocus — explosive movement addition",
          });
        }
        for (const ex of exercises.filter((e: any) => e.category === "primary")) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMax = rangeMatch ? parseInt(rangeMatch[2]) : (singleMatch ? parseInt(singleMatch[1]) : 99);
          const repUpdates: Record<string, unknown> = { tempo: "3-1-X-0", rest: "2-3 min", notes: "Power block: 3-sec eccentric, explosive concentric. 70-80% of max — bar speed is priority." };
          if (currentMax > 5) repUpdates.reps = "3-5";
          else if (currentMax === 5) repUpdates.reps = "2-4";
          blockPowerChanges.push({ type: "update_exercise", id: ex.id, updates: repUpdates, reason: "Block power refocus — primary lift to power range" });
        }
        for (const ex of exercises.filter((e: any) => e.category === "accessory")) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMin = rangeMatch ? parseInt(rangeMatch[1]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMin >= 12) {
            blockPowerChanges.push({ type: "update_exercise", id: ex.id, updates: { reps: "8-10", rest: "90s", notes: "Reduced from hypertrophy range — preserving power focus and CNS freshness." }, reason: "Block power refocus — trimming high-rep accessories" });
          }
        }
        blockPowerChanges.push({ type: "update_session", id: session.id, updates: { emphasis: "Power and force expression — explosive output prioritized", coachingNotes: "Power session: open with explosive work. Primaries at 70-80% with bar speed focus. Full recovery between sets." }, reason: "Block power refocus — session emphasis" });
      }

      blockPowerChanges.push({ type: "update_phase", id: phaseId, updates: { name: deriveBlockName(label, "Power"), emphasis: "Power and explosive development — bar speed, neural output, dynamic effort emphasis", goal: "Develop explosive strength and power output across primary patterns" }, reason: "Block power refocus — phase emphasis" });

      const powerStructural = blockPowerChanges.filter(c =>
        c.type === "add_exercise" ||
        (c.type === "update_exercise" && c.updates && Object.keys(c.updates).some(k => ["sets", "reps", "tempo", "rest"].includes(k)))
      ).length;

      if (powerStructural >= 1) {
        return {
          intent: "refocus_block_power",
          scope: "block",
          changeSummary: `${label} restructured for explosive output across all sessions — explosive movements added, primary lifts shifted to 3-5 rep power range with 3-1-X-0 tempo and 2-3 min rest, conflicting high-rep accessories reduced.`,
          changes: blockPowerChanges,
        };
      }
      return {
        intent: "refocus_block_power",
        scope: "block",
        changeSummary: `${label} refocused toward power and explosive development.`,
        changes: [{ type: "update_phase", id: phaseId, updates: { name: deriveBlockName(label, "Power"), emphasis: "Power and explosive development — bar speed, neural output, dynamic effort emphasis", goal: "Develop explosive strength and power output across primary patterns" }, reason: "Power emphasis refocus" }],
      };
    }

    if (lower.match(/hypertrophy|muscle|size|volume|mass/)) {
      // ── BLOCK-LEVEL HYPERTROPHY TRANSFORMATION ─────────────────────────────
      // Iterates every session in this phase and applies the same structural
      // changes as the session-level hypertrophy bundle:
      //   1. Primary lifts → 6-10 reps, 90s rest
      //   2. Accessories → 10-15 reps, 60-75s rest
      //   3. Add one isolation accessory per session if missing
      //   4. Update session label + emphasis text
      //   5. Update phase emphasis + goal
      const blockChanges: EditChange[] = [];

      const targetPhase = (system.phases ?? []).find((p: any) => p.id === phaseId);
      const allSessions: any[] = [];
      for (const week of targetPhase?.weeks ?? []) {
        for (const session of week.sessions ?? []) {
          allSessions.push(session);
        }
      }

      // Deduplicate sessions by id (same session appears in multiple weeks)
      const seenSessionIds = new Set<number>();
      const uniqueSessions = allSessions.filter((s: any) => {
        if (seenSessionIds.has(s.id)) return false;
        seenSessionIds.add(s.id);
        return true;
      });

      for (const session of uniqueSessions) {
        const exercises: any[] = session.exercises ?? [];
        const isLowerBody = exercises.some((ex: any) =>
          /squat|deadlift|lunge|leg|hip|glute|hamstring/i.test(ex.name)
        );

        // Primary lifts → 6-10 reps
        for (const ex of exercises.filter((e: any) => e.category === "primary")) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMax = rangeMatch ? parseInt(rangeMatch[2]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMax < 6 || currentMax > 12) {
            blockChanges.push({
              type: "update_exercise",
              id: ex.id,
              updates: { reps: "6-10", rest: "90s", notes: "Hypertrophy zone: moderate load, control the eccentric, squeeze the contraction." },
              reason: "Block hypertrophy refocus — primary lift rep range",
            });
          }
        }

        // Accessories → 10-15 reps, tighter rest
        for (const ex of exercises.filter((e: any) => e.category === "accessory")) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMin = rangeMatch ? parseInt(rangeMatch[1]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMin < 10) {
            blockChanges.push({
              type: "update_exercise",
              id: ex.id,
              updates: { reps: "10-15", rest: "60-75s", notes: "Hypertrophy range — keep rest tight for metabolic demand." },
              reason: "Block hypertrophy refocus — accessory rep range",
            });
          }
        }

        // Add isolation accessory if missing
        const hasIsolation = exercises.some((ex: any) =>
          /cable.*fly|fly|leg.*extension|leg.*curl|lateral.*raise|curl|pushdown|kickback/i.test(ex.name)
        );
        if (!hasIsolation && exercises.length > 0) {
          const isolationName = isLowerBody ? "Leg Extension" : "Cable Fly";
          blockChanges.push({
            type: "add_exercise",
            id: 0,
            sessionId: session.id,
            exercise: {
              name: isolationName,
              category: "accessory",
              sets: 3,
              reps: "12-15",
              rest: "60s",
              notes: "Hypertrophy isolation. Feel the target muscle. 2-sec contraction at peak.",
            },
            reason: "Block hypertrophy refocus — adding isolation accessory",
          });
        }

        // Update session emphasis text
        blockChanges.push({
          type: "update_session",
          id: session.id,
          updates: {
            emphasis: "Hypertrophy — mechanical tension, metabolic stress, volume accumulation",
            coachingNotes: "Hypertrophy focus: moderate loads, controlled eccentrics, 60-90s rest to drive metabolic demand. Feel every rep.",
          },
          reason: "Block hypertrophy refocus — session emphasis",
        });
      }

      // Update the phase itself
      blockChanges.push({
        type: "update_phase",
        id: phaseId,
        updates: {
          name: deriveBlockName(label, "Hypertrophy"),
          emphasis: "Hypertrophy — mechanical tension and metabolic stress primary drivers",
          goal: "Maximize muscle development through progressive volume and mechanical load",
        },
        reason: "Block hypertrophy refocus — phase emphasis",
      });

      const structuralCount = blockChanges.filter(c =>
        c.type === "add_exercise" ||
        (c.type === "update_exercise" && c.updates &&
          Object.keys(c.updates).some(k => ["sets", "reps", "rest"].includes(k)))
      ).length;

      if (structuralCount >= 1) {
        return {
          intent: "refocus_block_hypertrophy",
          scope: "block",
          changeSummary: `${label} restructured for hypertrophy across all sessions — primary lifts moved to 6-10 rep range, accessories to 10-15 reps with tighter rest, isolation work added. Mechanical tension and metabolic stress are the primary training drivers.`,
          changes: blockChanges,
        };
      }

      // Fallback: text-only if no exercises found
      return {
        intent: "refocus_block_hypertrophy",
        scope: "block",
        changeSummary: `${label} shifted toward hypertrophy emphasis. Mechanical tension and metabolic stress are the primary training drivers for this block.`,
        changes: [{ type: "update_phase", id: phaseId, updates: { name: deriveBlockName(label, "Hypertrophy"), emphasis: "Hypertrophy — mechanical tension and metabolic stress primary drivers", goal: "Maximize muscle development through progressive volume and mechanical load" }, reason: "Hypertrophy emphasis refocus" }],
      };
    }

    if (lower.match(/field|sport|athletic|performance|speed/)) {
      return {
        intent: "refocus_block_athletic",
        scope: "block",
        changeSummary: `${label} reoriented toward field-sport and athletic performance. Strength work serves power and speed transfer rather than peak force production alone.`,
        changes: [{ type: "update_phase", id: phaseId, updates: { name: deriveBlockName(label, "Athletic"), emphasis: "Field-sport athletic development — strength, speed, and movement quality integrated", goal: "Develop athletic performance qualities transferable to sport" }, reason: "Athletic/field-sport refocus" }],
      };
    }

    if (lower.match(/endurance|aerobic|cardio|metabolic|work.capacity|stamina|conditioning/)) {
      // ── BLOCK-LEVEL ENDURANCE/CONDITIONING TRANSFORMATION ─────────────────
      // For each session in the phase:
      //   1. Add conditioning finisher if no conditioning work exists
      //   2. Tighten rest on primaries → 90s, push reps to 8-12 if below
      //   3. Push accessories to endurance rep zone (12-15, 60s rest)
      //   4. Update session emphasis
      //   5. Update phase emphasis + goal
      const blockEndChanges: EditChange[] = [];

      const targetPhaseEnd = (system.phases ?? []).find((p: any) => p.id === phaseId);
      const allEndSessions: any[] = [];
      for (const week of targetPhaseEnd?.weeks ?? []) {
        for (const session of week.sessions ?? []) allEndSessions.push(session);
      }
      const seenEndIds = new Set<number>();
      const uniqueEndSessions = allEndSessions.filter((s: any) => {
        if (seenEndIds.has(s.id)) return false;
        seenEndIds.add(s.id);
        return true;
      });

      for (const session of uniqueEndSessions) {
        const exercises: any[] = session.exercises ?? [];
        const hasConditioning = exercises.some((ex: any) =>
          /\b(bike|row|sled|conditioning|cardio|run|sprint|interval|treadmill|assault|hiit|circuit|rower)\b/i.test(ex.name)
        );
        if (!hasConditioning) {
          const hasLower = exercises.some((ex: any) =>
            /squat|deadlift|lunge|leg|hip|glute|hamstring/i.test(ex.name)
          );
          const finisherName = hasLower ? "Rowing Machine Intervals" : "Assault Bike Intervals";
          blockEndChanges.push({
            type: "add_exercise",
            id: 0,
            sessionId: session.id,
            exercise: {
              name: finisherName,
              category: "conditioning",
              sets: 8,
              reps: "30s on / 30s off",
              rest: "30s",
              notes: "Endurance finisher. Target 75-80% max HR. Controlled, sustainable effort.",
            },
            reason: "Block endurance refocus — conditioning finisher",
          });
        }
        for (const ex of exercises.filter((e: any) => e.category === "primary")) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMin = rangeMatch ? parseInt(rangeMatch[1]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          const endUpdates: Record<string, unknown> = { rest: "90s", notes: "Endurance focus: moderate load (60-70% of max), controlled pace, 90s rest to build work capacity." };
          if (currentMin < 8) endUpdates.reps = "8-12";
          blockEndChanges.push({ type: "update_exercise", id: ex.id, updates: endUpdates, reason: "Block endurance refocus — primary lift rest and rep density" });
        }
        for (const ex of exercises.filter((e: any) => e.category === "accessory")) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMax = rangeMatch ? parseInt(rangeMatch[2]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMax < 12) {
            blockEndChanges.push({ type: "update_exercise", id: ex.id, updates: { reps: "12-15", rest: "60s", notes: "Pushed to endurance rep zone — tight rest, sustainable effort." }, reason: "Block endurance refocus — accessory rep range" });
          }
        }
        blockEndChanges.push({ type: "update_session", id: session.id, updates: { emphasis: "Endurance and work capacity — metabolic density, sustained output", coachingNotes: "Endurance session: tighter rest, higher reps, conditioning finisher to close. Quality reps with minimal recovery between sets." }, reason: "Block endurance refocus — session emphasis" });
      }

      blockEndChanges.push({ type: "update_phase", id: phaseId, updates: { name: deriveBlockName(label, "Endurance"), emphasis: "Endurance and work capacity — aerobic base, metabolic density, sustained output", goal: "Build aerobic capacity and work capacity through sustained moderate-intensity training" }, reason: "Block endurance refocus — phase emphasis" });

      const endStructural = blockEndChanges.filter(c =>
        c.type === "add_exercise" ||
        (c.type === "update_exercise" && c.updates && Object.keys(c.updates).some(k => ["sets", "reps", "rest"].includes(k)))
      ).length;

      if (endStructural >= 1) {
        return {
          intent: "refocus_block_endurance",
          scope: "block",
          changeSummary: `${label} restructured for endurance and work capacity across all sessions — conditioning finishers added, primary lifts adjusted to 8-12 reps at 90s rest, accessories pushed to 12-15 rep zone. Metabolic density is the primary training driver.`,
          changes: blockEndChanges,
        };
      }
      return {
        intent: "refocus_block_endurance",
        scope: "block",
        changeSummary: `${label} shifted toward endurance and aerobic capacity development.`,
        changes: [{ type: "update_phase", id: phaseId, updates: { name: deriveBlockName(label, "Endurance"), emphasis: "Endurance and work capacity — aerobic base, metabolic density, sustained output", goal: "Build aerobic capacity and work capacity through sustained moderate-intensity training" }, reason: "Endurance emphasis refocus" }],
      };
    }

    if (lower.match(/strength|stronger|max.strength|force.production|low.rep/)) {
      // ── BLOCK-LEVEL STRENGTH TRANSFORMATION ──────────────────────────────
      // For each session in the phase:
      //   1. Primary lifts → 3-6 reps, 2-4 min rest (max strength zone)
      //   2. Accessories → 6-10 reps, 2 min rest (complementary strength work)
      //   3. Update session emphasis
      //   4. Update phase emphasis + goal
      const blockStrengthChanges: EditChange[] = [];

      const targetPhaseStr = (system.phases ?? []).find((p: any) => p.id === phaseId);
      const allStrSessions: any[] = [];
      for (const week of targetPhaseStr?.weeks ?? []) {
        for (const session of week.sessions ?? []) allStrSessions.push(session);
      }
      const seenStrIds = new Set<number>();
      const uniqueStrSessions = allStrSessions.filter((s: any) => {
        if (seenStrIds.has(s.id)) return false;
        seenStrIds.add(s.id);
        return true;
      });

      for (const session of uniqueStrSessions) {
        const exercises: any[] = session.exercises ?? [];
        for (const ex of exercises.filter((e: any) => e.category === "primary")) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMax = rangeMatch ? parseInt(rangeMatch[2]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMax > 6) {
            blockStrengthChanges.push({ type: "update_exercise", id: ex.id, updates: { reps: "3-6", rest: "2-4 min", notes: "Max strength zone: 80-90% of 1RM. Full recovery between sets. Aim for 1-2 RIR on top sets." }, reason: "Block strength refocus — primary lift to max strength range" });
          }
        }
        for (const ex of exercises.filter((e: any) => e.category === "accessory")) {
          const repsStr: string = ex.reps ?? "";
          const rangeMatch = repsStr.match(/(\d+)-(\d+)/);
          const singleMatch = repsStr.match(/^(\d+)$/);
          const currentMin = rangeMatch ? parseInt(rangeMatch[1]) : (singleMatch ? parseInt(singleMatch[1]) : 0);
          if (currentMin > 10) {
            blockStrengthChanges.push({ type: "update_exercise", id: ex.id, updates: { reps: "6-10", rest: "2 min", notes: "Strength-support zone: moderate load, controlled reps. Serves the primary lifts." }, reason: "Block strength refocus — accessory to strength support range" });
          }
        }
        blockStrengthChanges.push({ type: "update_session", id: session.id, updates: { emphasis: "Max strength — peak force production, neural drive, 1-2 RIR on primaries", coachingNotes: "Strength session: heavy primary work at 80-90% of max. Full recovery between sets. Technical execution is non-negotiable at these loads." }, reason: "Block strength refocus — session emphasis" });
      }

      blockStrengthChanges.push({ type: "update_phase", id: phaseId, updates: { name: deriveBlockName(label, "Strength"), emphasis: "Max strength development — peak force production, progressive overload, technical excellence", goal: "Maximize peak force output on primary compound movements through structured progressive overload" }, reason: "Block strength refocus — phase emphasis" });

      const strStructural = blockStrengthChanges.filter(c =>
        c.type === "add_exercise" ||
        (c.type === "update_exercise" && c.updates && Object.keys(c.updates).some(k => ["sets", "reps", "rest"].includes(k)))
      ).length;

      if (strStructural >= 1) {
        return {
          intent: "refocus_block_strength",
          scope: "block",
          changeSummary: `${label} restructured for max strength across all sessions — primary lifts shifted to 3-6 rep zone at 2-4 min rest (80-90% of 1RM), accessories pulled to 6-10 rep strength-support range. Peak force production is the training driver.`,
          changes: blockStrengthChanges,
        };
      }
      return {
        intent: "refocus_block_strength",
        scope: "block",
        changeSummary: `${label} shifted toward max strength development.`,
        changes: [{ type: "update_phase", id: phaseId, updates: { name: deriveBlockName(label, "Strength"), emphasis: "Max strength development — peak force production, progressive overload, technical excellence", goal: "Maximize peak force output on primary compound movements" }, reason: "Strength emphasis refocus" }],
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
      // Guard: if the replacement target is open-ended/vague, do NOT commit it as an exercise name.
      // The open-ended swap path in interpretEditRequest (Step 2.5) will handle this asynchronously.
      if (isGenericPlaceholder(toName) || isOpenEndedSwapLanguage(toName)) {
        logger.info(
          { fromName, toName: toName.slice(0, 60), reason: "open_ended_target" },
          "[interpretWithRules] Open-ended swap target detected — skipping rule commit, deferring to auto-select"
        );
        // Return empty changes — caller (interpretEditRequest Step 2.5) handles this
        return { intent: "swap_exercise", scope: "exercise", changeSummary: "", changes: [] };
      }
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

  // ── Generic fallback — attempt NLP-to-intent mapping before giving up ──
  const mappedIntent = mapNLPToIntent(userRequest);
  if (mappedIntent) {
    logger.info({ mappedIntent, request: userRequest.slice(0, 80) }, "[interpretWithRules] NLP fallback mapped to structured intent");
    return handleStructuredIntent(mappedIntent, system, targetContext);
  }

  return {
    intent: "general_modification",
    scope: "session",
    changeSummary: "Noted. Try something like 'shorten today', 'less volume this week', or 'make this a rest day' for an instant update.",
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

  // ── Rule 5: Session-level coaching transformations → DETERMINISTIC ──────────
  // ALL recognized training intents for session targets are handled by interpretWithRules
  // which produces real structural changes. This prevents false clarification loops for
  // known coaching language like "more endurance based", "more explosive", "hypertrophy
  // focused", etc.
  //
  // KNOWN_INTENTS: endurance, explosive, power, strength, hypertrophy, conditioning,
  //   fat loss, speed, athletic
  //
  // If the deterministic bundle produces < 2 structural changes, it falls through to AGENT.
  if (targetContext?.type === "session") {
    const KNOWN_INTENT_SESSION = /\b(explosive|power|athletic|more\s+(explosive|powerful|athletic)|endurance|aerobic|cardio|metabolic|work.capacity|stamina|conditioning|hypertrophy|muscle.building|muscle.growth|strength|stronger|speed|fast.twitch|fat.loss|weight.loss|cutting|leaner)\b/i;
    if (KNOWN_INTENT_SESSION.test(lower)) {
      logger.info(
        { lower: lower.slice(0, 100), targetType: targetContext.type },
        "[EditRouter] Intent override → forcing transformation execution (known session intent)"
      );
      return { route: "DETERMINISTIC", reason: "session_known_intent_transformation" };
    }
  }

  // ── Rule 6: Phase/block-level coaching transformations → DETERMINISTIC ────────
  // Block-scope intents (hypertrophy, power, etc.) are handled by interpretWithRules
  // which now produces real structural changes across all sessions in the phase.
  // Routing to DETERMINISTIC here prevents a wasted LLM call for these common commands.
  if (targetContext?.type === "phase") {
    const KNOWN_INTENT_PHASE = /\b(hypertrophy|muscle.building|muscle.growth|muscle.mass|bodybuilding|bigger|size|power|explosive|speed|athletic|performance|field|sport|endurance|aerobic|cardio|metabolic|work.capacity|stamina|conditioning|strength|stronger|max.strength)\b/i;
    if (KNOWN_INTENT_PHASE.test(lower)) {
      logger.info(
        { lower: lower.slice(0, 100), targetType: targetContext.type },
        "[EditRouter] Intent override → forcing transformation execution (known phase intent)"
      );
      return { route: "DETERMINISTIC", reason: "phase_known_intent_transformation" };
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
        // Explosive/power coaching bundles require a MINIMUM of 2 structural changes.
        // A structural change = add_exercise, replace_exercise, delete_exercise, or
        // update_exercise touching sets/reps/tempo/rest. Text-only updates don't count.
        const isExplosiveIntent = /\b(explosive|power|athletic|more\s+(explosive|powerful|athletic))\b/i.test(userRequest);
        const structuralCount = rulePlan.changes.filter(c =>
          c.type === "add_exercise" ||
          c.type === "replace_exercise" ||
          c.type === "delete_exercise" ||
          (c.type === "update_exercise" && c.updates &&
            Object.keys(c.updates).some(k => ["sets", "reps", "tempo", "rest"].includes(k)))
        ).length;
        const minimumRequired = isExplosiveIntent ? 2 : 1;

        if (structuralCount < minimumRequired) {
          logger.warn(
            { intent: rulePlan.intent, structuralCount, minimumRequired },
            `[EditRouter] Coaching bundle insufficient (${structuralCount}/${minimumRequired} structural changes) — escalating to AGENT`
          );
          // Fall through to AGENT — do NOT return here
        } else {
          logger.info(
            { intent: rulePlan.intent, scope: rulePlan.scope, structuralCount, route: "deterministic" },
            `[EditRouter] Deterministic coaching bundle resolved (${structuralCount} structural changes) — OpenAI not called`
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

  // ── Step 2.5: OPEN-ENDED SWAP auto-resolution ────────────────────────────
  //
  // Triggered when:
  //   a) The user's message contains swap intent with a vague/open-ended replacement
  //      (e.g. "swap broad jump for a different exercise", "replace this with something else")
  //   b) We have enough information to identify the source exercise
  //
  // The system automatically picks the best valid substitute from the exercise library.
  // This is a deterministic async step — no OpenAI cost. Skips AGENT entirely when
  // a valid candidate is found.
  //
  // Swap modes:
  //   EXACT_SWAP        — user names a specific replacement → DETERMINISTIC (handled above)
  //   OPEN_ENDED_SWAP   — user uses vague language → THIS STEP auto-selects
  //   CLARIFICATION_REQ — no safe substitute found → falls through to AGENT
  {
    const openEndedDetected = isOpenEndedSwapLanguage(userRequest);

    if (openEndedDetected) {
      let swapSourceName: string | null = null;
      let swapSourceId: number | undefined;

      // Case A: Exercise target context provided (user clicked the exercise)
      if (targetContext?.type === "exercise" && targetContext.label) {
        swapSourceName = targetContext.label;
        swapSourceId = targetContext.id;
      }
      // Case B: No exercise context — try to extract source name from request text
      else {
        const extracted = extractSwapSourceName(userRequest);
        if (extracted) {
          // Try to find this exercise in the system by name match
          outer: for (const phase of system.phases ?? []) {
            for (const week of phase.weeks ?? []) {
              for (const session of week.sessions ?? []) {
                const found = (session.exercises ?? []).find(
                  (ex: any) => ex.name.toLowerCase().includes(extracted.toLowerCase())
                );
                if (found) {
                  swapSourceName = found.name;
                  swapSourceId = found.id;
                  break outer;
                }
              }
            }
          }
          if (!swapSourceId) {
            // Use the extracted text even without a DB id — let autoSelect try
            swapSourceName = extracted;
          }
        }
      }

      if (swapSourceName && swapSourceId) {
        logger.info(
          { swapSourceName, swapSourceId, request: userRequest.slice(0, 100), swapMode: "OPEN_ENDED_SWAP" },
          "[EditRouter] Open-ended swap detected — attempting auto-selection from library"
        );

        try {
          const openEndedPlan = await autoSelectOpenEndedSwap({
            exerciseName: swapSourceName,
            exerciseId: swapSourceId,
            userRequest,
            system,
          });

          if (openEndedPlan && openEndedPlan.changes.length > 0) {
            logger.info(
              {
                exerciseName: swapSourceName,
                selectedSubstitute: (openEndedPlan.changes[0] as any)?.replacement?.name,
                swapMode: "OPEN_ENDED_SWAP",
                route: "auto_selected_no_ai",
              },
              "[EditRouter] Open-ended swap auto-resolved — OpenAI not called"
            );
            return {
              ...openEndedPlan,
              _debugRoute: {
                openaiCalled: false,
                openaiSucceeded: false,
                pathUsed: "deterministic",
              },
            };
          }

          // No candidates found — log and fall through to AGENT for intelligent fallback
          logger.warn(
            { exerciseName: swapSourceName, swapMode: "OPEN_ENDED_SWAP" },
            "[EditRouter] Open-ended swap: no library candidates — escalating to AGENT"
          );
        } catch (err) {
          logger.warn({ err, swapSourceName }, "[EditRouter] Open-ended swap resolution threw — falling through to AGENT");
        }
      } else {
        logger.info(
          { request: userRequest.slice(0, 100), swapMode: "OPEN_ENDED_SWAP" },
          "[EditRouter] Open-ended swap: source exercise unclear — escalating to AGENT for interpretation"
        );
      }
    }
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

  // ── Step 3.8: Run Intent Family Pipeline ─────────────────────────────────
  // Normalizes user language into a stable intent family and builds a
  // transformation directive to inject into the AI system prompt.
  let intentFamilyPipelineResult: IntentFamilyPipelineResult | null = null;
  let intentFamilyDirective: string | undefined;

  try {
    const sessionCount = (system.phases ?? []).reduce((acc: number, phase: any) =>
      acc + (phase.weeks ?? []).reduce((wacc: number, week: any) =>
        wacc + (week.sessions ?? []).filter((s: any) => !s.isRestDay).length, 0), 0);
    const targetSessionLabel = targetContext?.type === "session" ? targetContext.label : undefined;

    intentFamilyPipelineResult = runIntentFamilyPipeline(userRequest, {
      dayCount: sessionCount,
      sessionLabel: targetSessionLabel,
    });

    intentFamilyDirective = intentFamilyPipelineResult.promptDirective;

    logIntentFamilyDebug({
      originalRequest: userRequest,
      normalizedFamily: intentFamilyPipelineResult.familyResult.family,
      targetScope: intentFamilyPipelineResult.familyResult.targetScope,
      scopeSource: intentFamilyPipelineResult.familyResult.scopeSource,
      confidence: intentFamilyPipelineResult.familyResult.confidence,
      chosenPath: "openai",
      transformationBundle: intentFamilyPipelineResult.familyResult.family,
      minimumStructuralChanges: intentFamilyPipelineResult.bundle.minimumStructuralChanges,
      matchedPatterns: intentFamilyPipelineResult.familyResult.matchedPatterns,
    });
  } catch (err) {
    logger.warn({ err }, "[IntentFamilyEngine] Pipeline failed — proceeding without directive");
  }

  // ── Language System — AgentIntentProfile for edit flow ───────────────────
  // Runs before the OpenAI call so the profile section can be injected into the
  // edit system prompt. Errors are non-fatal — the edit flow continues without it.
  let editLanguageSystemSection: string | undefined;
  try {
    const editProfile = extractAgentIntentProfile(userRequest, true);
    auditLanguageInterpretation(editProfile);
    const profileSection = buildAgentIntentProfilePromptSection(editProfile);
    if (profileSection) editLanguageSystemSection = profileSection;
  } catch (langErr) {
    logger.warn({ langErr }, "[LanguageSystem][Edit] Profile extraction failed — continuing without it");
  }

  // ── Step 4: Call OpenAI ───────────────────────────────────────────────────
  logger.info(
    { request: userRequest.slice(0, 100), hasTargetContext: !!targetContext, targetType: targetContext?.type, escalatedFrom: classification.route === "DETERMINISTIC" ? "deterministic" : undefined, intentFamily: intentFamilyPipelineResult?.familyResult.family },
    "[EditRouter] Calling OpenAI — route: agent_openai"
  );

  const aiPlan = await interpretWithAI(
    userRequest,
    systemContext,
    targetContext,
    adaptationContext,
    decisionMemoryContext,
    exerciseSwapContext,
    intentFamilyDirective,
    editLanguageSystemSection
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

    // Guard 3: coaching transformation produced insufficient structural changes → reject
    // Explosive/power bundles require minimum 2 structural changes.
    // Any coaching intent that only updates text fields is a FAILURE.
    const isCoachingTransformIntent = /\b(explosive|power|athletic|hypertrophy|endurance|more\s+intense|stronger|faster)\b/i.test(userRequest) &&
      (targetContext?.type === "session" || targetContext?.type === "week" || targetContext?.type === "phase" || !targetContext);
    const isExplosiveTransformIntent = /\b(explosive|power|athletic|more\s+(explosive|powerful|athletic))\b/i.test(userRequest);
    const aiStructuralCount = aiPlan.changes.filter(c =>
      c.type === "add_exercise" ||
      c.type === "replace_exercise" ||
      c.type === "delete_exercise" ||
      (c.type === "update_exercise" && c.updates &&
        Object.keys(c.updates).some(k => ["sets", "reps", "tempo", "rest"].includes(k)))
    ).length;
    const aiMinimumRequired = isExplosiveTransformIntent ? 2 : 1;
    const isCoachingBundleInsufficient = isCoachingTransformIntent && aiStructuralCount < aiMinimumRequired && aiPlan.changes.length > 0;
    if (isCoachingBundleInsufficient) {
      logger.warn(
        { intent: aiPlan.intent, aiStructuralCount, aiMinimumRequired },
        `[EditRouter] AI coaching bundle insufficient (${aiStructuralCount}/${aiMinimumRequired} structural changes) — rejecting`
      );
    }

    if (isProgressionIntent && onlyNotesChange) {
      logger.warn({ intent: aiPlan.intent, changes: aiPlan.changes.length }, "[EditRouter] AI returned note-only mutation for progression — rejecting");
    } else if (hasGenericReplacementName) {
      logger.warn({ intent: aiPlan.intent }, "[EditRouter] AI returned generic placeholder in replace_exercise — rejecting");
    } else if (isCoachingBundleInsufficient) {
      // Already logged above — insufficient structural changes, fall through to library/rules fallback
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
