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
    ? `\nEXERCISE SWAP INTELLIGENCE:\n${exerciseSwapContext}\nWhen performing a swap/replace, you MUST choose an exercise from the SWAP CANDIDATES list above. Use the exact name as shown. If no candidate perfectly fits, pick the closest one. Do not invent exercise names.\n`
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

// ─── Rule-Based Fallback Interpreter ────────────────────────────────────────

function interpretWithRules(userRequest: string, system: any, targetContext?: TargetContext): EditPlan {
  const lower = userRequest.toLowerCase();

  const currentWeek = findCurrentWeek(system);
  const currentSession = findCurrentSession(system);

  // ── Targeted: swap/replace a specific exercise ──
  if (targetContext?.type === "exercise") {
    const exerciseId = targetContext.id;
    const label = targetContext.label ?? "the exercise";

    const swapTo = lower.match(/(?:swap|replace|change|switch)\s+(?:this\s+)?(?:for|with|to)\s+(.+)/i)?.[1]?.trim();
    const wantsEasier = lower.match(/easier|simpler|lighter|beginner|reduce/);
    const wantsHarder = lower.match(/harder|heavier|advanced|progress/);
    const wantsExplosive = lower.match(/explosive|power|speed|fast/);
    const wantsShoulder = lower.match(/shoulder|rotator|shoulder.friendly/);
    const wantsMoreSets = lower.match(/add.*set|more.*set|\+1 set|one more set/);
    const wantsLessSets = lower.match(/remove.*set|less.*set|fewer.*set|drop.*set/);
    const wantsReps = lower.match(/change.*rep|rep.*range|reps/);

    if (swapTo) {
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
      return {
        intent: "easier_variation",
        scope: "exercise",
        changeSummary: `${label} adjusted to a less demanding prescription. Use this opportunity to build movement quality and accumulate clean volume.`,
        changes: [{ type: "update_exercise", id: exerciseId, updates: { notes: "Regressed: use lighter load, higher reps, shorter ROM or machine variation as needed. Prioritize quality over intensity." }, reason: "User requested easier variation" }],
      };
    }

    if (wantsHarder) {
      return {
        intent: "harder_variation",
        scope: "exercise",
        changeSummary: `${label} progression cue added. Increase load or shift to a more demanding variation when your current prescription feels submaximal.`,
        changes: [{ type: "update_exercise", id: exerciseId, updates: { notes: "Progression: load is ready to increase when you can hit the top of the rep range at 2+ RIR for 2 consecutive sessions." }, reason: "User requested harder progression cue" }],
      };
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
  if (lower.match(/\bswap\b|\breplace\b|\bsubstitute\b|\bswitch\b|\balternative\b|\bother.*exercise\b|\bdifferent.*exercise\b/)) return "swap";
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
        const target = swapIntent === "easier" ? progressions.easier : progressions.harder;
        if (target.length > 0) {
          const label = swapIntent === "easier" ? "REGRESSION OPTIONS" : "PROGRESSION OPTIONS";
          exerciseSwapContext = `${label} for "${exerciseName}" (prefer these):\n${target.map((ex) => `  - ${ex.name} (${(ex.equipment as string[]).join("/")}, ${ex.difficultyLevel})`).join("\n")}`;
          logger.info({ exerciseName, swapIntent, count: target.length }, "Injecting progression context from exercise library");
        } else {
          // Fallback to cluster-based swap
          exerciseSwapContext = await buildSwapContext({ exerciseName, equipmentLevel });
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

  if (aiPlan && Array.isArray(aiPlan.changes)) {
    logger.info({ intent: aiPlan.intent, scope: aiPlan.scope, changes: aiPlan.changes.length }, "AI edit plan generated");
    return aiPlan;
  }

  logger.info("Falling back to rule-based edit interpretation");
  return interpretWithRules(userRequest, system, targetContext);
}
