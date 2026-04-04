/**
 * Edit Intent Service — Phase 2
 *
 * Interprets natural language modification requests and produces
 * a machine-readable edit plan that the EditEngine can apply to
 * the structured training system.
 *
 * Flow:
 *   User request → AI interpretation → EditPlan JSON → EditEngine applies → change summary
 */

import { logger } from "./logger";

// ─── Edit Plan Types ─────────────────────────────────────────────────────────

export type EditScope = "exercise" | "session" | "week" | "block" | "system";

export type EditChangeType =
  | "update_exercise"
  | "replace_exercise"
  | "delete_exercise"
  | "update_session"
  | "update_week"
  | "update_phase";

export interface EditChange {
  type: EditChangeType;
  id: number;
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

function buildEditSystemPrompt(systemContext: string): string {
  return `You are an elite performance architect editing a user's structured training system.

You will receive:
1. The user's current structured training system (with IDs for every entity)
2. A natural language modification request

Your job is to produce a structured JSON edit plan.

RULES:
- Edit ONLY what the user requests. Preserve everything else.
- Do not rewrite the entire program unless explicitly asked.
- Use exact IDs from the system context.
- Prefer surgical changes (1-3 exercises, 1 session, or week-level notes) over broad rewrites.
- Maintain programming logic: exercise order, balance between push/pull, stress/recovery.
- If swapping an exercise, choose one that fits the same pattern and equipment.
- If reducing volume, reduce accessory/finisher sets first (not primary lifts unless asked).
- If changing a session to recovery/mobility, update type + replace exercises with light work.
- Explain changes clearly in changeSummary — write like a coach, not a robot.

AVAILABLE CHANGE TYPES:
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
  "intent": "string — brief label like reduce_volume, swap_exercise, change_session_type, etc.",
  "scope": "exercise|session|week|block|system",
  "changeSummary": "string — 1-4 sentences, coach-like, explaining what changed and why",
  "changes": [
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
${systemContext}`;
}

// ─── AI Interpretation ───────────────────────────────────────────────────────

async function interpretWithAI(
  userRequest: string,
  systemContext: string
): Promise<EditPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = buildEditSystemPrompt(systemContext);

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

function interpretWithRules(userRequest: string, system: any): EditPlan {
  const lower = userRequest.toLowerCase();

  const currentWeek = findCurrentWeek(system);
  const currentSession = findCurrentSession(system);

  // ── Reduce volume (week-level) ──
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
      changeSummary: "I've reduced accessory and finisher sets by one across the current week and marked the week as lower volume. Primary lifts remain intact — recovery is the priority right now.",
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
      changeSummary: "I've added one set to accessory work across the current week and marked it as a high-volume week. Primary lifts are unchanged — the added volume comes from accessory accumulation.",
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
        updates: {
          sessionType: "recovery",
          emphasis: "Active recovery and mobility",
          coachingNotes: "Light session today — focus on movement quality and tissue work. Keep intensity low.",
          warmupNotes: "10 min: foam rolling, hip circles, thoracic rotation, shoulder CARs",
        },
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
      changeSummary: `I've converted today's session to an active recovery focus. Exercise prescriptions have been lightened significantly — this is a movement-quality day, not a training stimulus day.`,
      changes,
    };
  }

  // ── Swap exercise (basic rule-based) ──
  const swapMatch = lower.match(/swap|replace|change|switch/);
  if (swapMatch) {
    const forMatch = userRequest.match(/(?:swap|replace|change|switch)\s+(.+?)\s+(?:for|with|to)\s+(.+)/i);
    if (forMatch && currentSession) {
      const fromName = forMatch[1].trim();
      const toName = forMatch[2].trim();
      const targetEx = currentSession.exercises?.find((e: any) =>
        e.name.toLowerCase().includes(fromName.toLowerCase())
      );
      if (targetEx) {
        return {
          intent: "swap_exercise",
          scope: "exercise",
          changeSummary: `I've replaced ${targetEx.name} with ${toName}, preserving the same sets, reps, and rest prescription. The movement pattern emphasis for this slot remains unchanged.`,
          changes: [{
            type: "replace_exercise",
            id: targetEx.id,
            replacement: {
              name: toName,
              category: targetEx.category,
              sets: targetEx.sets,
              reps: targetEx.reps,
              rest: targetEx.rest,
              notes: `Substituted in for ${targetEx.name}`,
            },
            reason: `User requested swap: ${fromName} → ${toName}`,
          }],
        };
      }
    }
  }

  // ── Equipment constraint (dumbbells only, hotel gym, etc.) ──
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
            changes.push({
              type: "replace_exercise",
              id: ex.id,
              replacement: { name: replacement, category: ex.category, sets: ex.sets, reps: ex.reps, rest: ex.rest },
              reason: `Replaced barbell movement with dumbbell equivalent for equipment constraint`,
            });
          }
        }
      }
    }

    return {
      intent: "equipment_constraint",
      scope: "week",
      changeSummary: changes.length > 0
        ? `I've swapped ${changes.length} barbell-dependent exercises across the current week for dumbbell equivalents. Set/rep prescriptions are preserved — only the implement changes.`
        : `Equipment noted. Your current week's exercises are already compatible with limited equipment.`,
      changes,
    };
  }

  // ── Adjust intensity (reduce) ──
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
      changeSummary: "I've shifted primary lifts to higher rep ranges across the current week, which reduces neural demand while maintaining training stimulus. This is a sustainable way to back off without cutting volume entirely.",
      changes,
    };
  }

  // ── Explosive / power emphasis ──
  if (lower.match(/explosive|power|speed|fast.*twitch|athletic|sport/)) {
    const changes: EditChange[] = [];
    for (const phase of system.phases ?? []) {
      if (phase.status !== "current") continue;
      changes.push({ type: "update_phase", id: phase.id, updates: { emphasis: "Power and explosive development — speed work prioritized", notes: "Adjusted for explosive/power emphasis at user request" }, reason: "User requested more explosive training" });
      for (const week of phase.weeks ?? []) {
        if (week.status !== "current") continue;
        for (const session of week.sessions ?? []) {
          for (const ex of session.exercises ?? []) {
            if (ex.category === "primary") {
              changes.push({ type: "update_exercise", id: ex.id, updates: { notes: "Explosive concentric. If using submaximal load (60-75%), move bar fast." }, reason: "Adding explosive execution cue" });
            }
          }
        }
      }
    }
    return {
      intent: "add_explosive_emphasis",
      scope: "block",
      changeSummary: "I've updated the current block emphasis toward power and explosive development. Primary exercises now include bar-speed cues — use submaximal loads (60-75% of your max) and focus on moving the weight as fast as possible through the concentric.",
      changes,
    };
  }

  // ── Injury / pain adjustment ──
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
          changes.push({
            type: "update_exercise",
            id: ex.id,
            updates: { notes: `Modified for ${injuredPart} irritation — reduce range of motion and use pain-free load only. Consider subbing with a unilateral or machine variation if discomfort persists.` },
            reason: `Injury modification for ${injuredPart}`,
          });
        }
      }
    }

    return {
      intent: "injury_modification",
      scope: "session",
      changeSummary: `I've flagged exercises that load the ${injuredPart} in today's session with modification notes. Train pain-free range of motion and consider substituting affected movements with machine or unilateral versions until it settles. If pain persists beyond 72 hours, pause loading that pattern.`,
      changes,
    };
  }

  // ── Generic fallback ──
  return {
    intent: "general_modification",
    scope: "system",
    changeSummary: "I couldn't identify a specific structured edit for this request. Try being more specific — for example: 'swap barbell bench for dumbbell bench', 'reduce volume this week', or 'make Friday a recovery day'.",
    changes: [],
  };
}

// ─── Helper: Find current week and session ────────────────────────────────────

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

export async function interpretEditRequest(
  userRequest: string,
  system: any
): Promise<EditPlan> {
  const systemContext = serializeSystemForPrompt(system);

  const aiPlan = await interpretWithAI(userRequest, systemContext);

  if (aiPlan && aiPlan.changes.length >= 0) {
    logger.info({ intent: aiPlan.intent, scope: aiPlan.scope, changes: aiPlan.changes.length }, "AI edit plan generated");
    return aiPlan;
  }

  logger.info("Falling back to rule-based edit interpretation");
  return interpretWithRules(userRequest, system);
}
