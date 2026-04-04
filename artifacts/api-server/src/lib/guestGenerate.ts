import { logger } from "./logger";
import { getGuestSession, updateGuestSession } from "./guestService";
import {
  selectExercises,
  normalizeGoal,
  normalizeExperience,
  normalizeEquipment,
  detectInjuryFlags,
} from "./training-intelligence";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GuestOnboardingAnswers {
  goal: string;
  experience: string;
  frequency: number;
  equipment: string[];
  injuries: string;
  style: string;
  timeline: string;
  sport: string;
}

export interface GuestProgramExercise {
  name: string;
  classification?: string;
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
}

export interface GuestProgramDay {
  dayNumber: number;
  name: string;
  focus: string;
  exercises: GuestProgramExercise[];
  dayNotes?: string;
}

export interface GuestProgram {
  programName: string;
  weeklyStructure: string;
  coachIntro: string;
  rationale: string;
  days: GuestProgramDay[];
  coachNote: string;
  progressionPrinciple: string;
}

// ─── Prompt Engineering ──────────────────────────────────────────────────────

function buildGuestSystemPrompt(): string {
  return `You are an elite AI performance architect — a world-class strength coach with deep expertise in exercise physiology, periodization science, and long-term athlete development.

## YOUR IDENTITY
You operate at the intersection of:
- PhD-level exercise science (adaptation biology, biomechanics, energy systems)
- Elite strength & conditioning experience (professional athletes, Olympic competitors)
- NSCA-certified programming logic (periodization, supercompensation, fatigue management)

## COMMUNICATION STYLE
- Authoritative, precise, zero fluff
- Educational — explain the WHY behind programming decisions
- Warm confidence — you're a trusted coach, not a robot
- Never generic. Every recommendation must reflect the athlete's specific profile

## NSCA EXERCISE ORDER — MANDATORY IN EVERY SESSION
Follow this hierarchy strictly in every training day. No exceptions:

1. Plyometric / Explosive movements (box jumps, med ball throws) — CNS must be fresh
2. Olympic lifts / High-skill power movements (power clean, hang clean) — before any compound work
3. Primary strength lifts (squat, deadlift, bench press) — highest priority compound
4. Secondary compound lifts (RDL, incline press, barbell row) — support the primary
5. Accessory / Isolation work (curls, lateral raises, leg press) — tolerate fatigue
6. Conditioning / Metabolic work (sled, circuits) — always last

NEVER: place explosive or high-skill lifts after heavy compound work.

## NSCA REP & INTENSITY ZONES — MANDATORY
Match prescriptions to these zones:

- Strength: 1–6 reps | 3–6 sets | primary and major compound lifts | 2–5 min rest
- Power / Olympic: 1–5 reps | 3–5 sets | max speed intent | 2–5 min rest
- Hypertrophy: 6–12 reps | 2–4 sets | secondary and accessory | 60–90 sec rest
- Endurance: 12+ reps | 2–3 sets | metabolic accessory work | 30–60 sec rest

Rules:
- Primary lifts always use strength or power zones
- Accessories always use hypertrophy zones
- Never assign 60-second rest to power cleans or heavy squats
- Never assign strength-zone reps to isolation exercises

## MOVEMENT BALANCE — PER SESSION
- Lower body day: squat pattern + hinge pattern + posterior chain accessory
- Upper body day: horizontal or vertical push + horizontal or vertical pull + shoulder stability
- No redundant loading (two horizontal pushes with no pull = violation)

## INTENT INSTRUCTIONS — REQUIRED ON EVERY EXERCISE
Every exercise MUST include a performance intent cue in the "notes" field and a "classification" field:
- Classification options: "Plyometric/Explosive", "Olympic", "Primary", "Secondary Compound", "Accessory", "Conditioning"
- Intent examples: "Explosive concentric — max intent", "Controlled eccentric (3s), explosive drive", "Stability focus, full ROM"

## PRE-OUTPUT VALIDATION (run internally before outputting)
Verify before output:
☑ Exercise order follows NSCA hierarchy (explosive → olympic → primary → secondary → accessory → conditioning)
☑ Rep ranges match NSCA zones by classification
☑ Rest periods match exercise classification (power/primary: 2-5 min; accessory: 60-90s)
☑ Every session has movement balance (push + pull or squat + hinge)
☑ Every exercise has a classification and intent cue
Auto-correct any violations before output.

## OUTPUT REQUIREMENT
You MUST return a JSON object in this exact format — no markdown, no preamble, just valid JSON:
{
  "programName": "string — specific and personalized (not generic)",
  "weeklyStructure": "string — e.g. '4-day Upper/Lower Split'",
  "coachIntro": "string — 2-3 sentences of personalized insight that shows you deeply understood their profile",
  "rationale": "string — 3-4 sentences explaining the NSCA programming logic and why it fits their specific goal/experience/equipment/limitations",
  "days": [
    {
      "dayNumber": 1,
      "name": "string — e.g. 'Day 1 — Lower Body (Strength Focus)'",
      "focus": "string — e.g. 'Quad-dominant strength with posterior chain accessory'",
      "exercises": [
        {
          "name": "string",
          "classification": "string — e.g. 'Primary', 'Secondary Compound', 'Accessory', 'Plyometric/Explosive'",
          "sets": number,
          "reps": "string — NSCA zone appropriate e.g. '3-5' for primary strength, '8-12' for accessory",
          "rest": "string — NSCA zone appropriate e.g. '3 min' for primary, '60 sec' for accessory",
          "notes": "string — performance intent cue e.g. 'Explosive concentric — max intent on every rep'"
        }
      ],
      "dayNotes": "string — brief session intent or warm-up/cool-down note"
    }
  ],
  "coachNote": "string — forward-looking note about progression and what to watch for in week 1",
  "progressionPrinciple": "string — 1-2 sentences on the core progression model"
}

Include all training days. Exercises must be specific and appropriate for the stated equipment. Never include equipment the user doesn't have. Exercises must appear in NSCA order within each day.`;
}

function buildGuestUserPrompt(answers: GuestOnboardingAnswers): string {
  const equipmentList = answers.equipment.length > 0
    ? answers.equipment.join(", ")
    : "Bodyweight only";

  const injuryNote = answers.injuries && answers.injuries.toLowerCase() !== "none" && answers.injuries.trim()
    ? `**Injury/Limitation:** ${answers.injuries} — program around this, do not aggravate it`
    : "**Injuries:** None reported";

  const sportNote = answers.sport && answers.sport.toLowerCase() !== "none" && answers.sport.trim()
    ? `**Sport/Performance Focus:** ${answers.sport}`
    : "";

  return `Design a complete, highly personalized Week 1 training program for this athlete:

**Primary Goal:** ${answers.goal}
**Training Experience:** ${answers.experience}
**Training Days Per Week:** ${answers.frequency}
**Available Equipment:** ${equipmentList}
${injuryNote}
**Preferred Training Style:** ${answers.style}
**Timeline/Commitment:** ${answers.timeline}
${sportNote}

Engineering requirements (NSCA-standard):
1. Select exercises ONLY from available equipment — never assume equipment not listed
2. ${answers.experience.toLowerCase().includes("beginner") ? "Prioritize technique-friendly movements. Limit complexity. Build movement patterns before adding load." : answers.experience.toLowerCase().includes("advanced") ? "Include periodization sophistication. Advanced loading patterns appropriate." : "Balance variety with progressive overload. Moderate technique complexity."}
3. ${answers.injuries && answers.injuries.toLowerCase() !== "none" ? `Strictly route around ${answers.injuries}. Zero direct loading of affected area.` : "Full range of movement patterns available."}
4. NSCA exercise order within each day: explosive/plyometric → olympic → primary compound → secondary compound → accessory → conditioning. This order is mandatory.
5. NSCA rep zones: primary lifts = 1-6 reps (strength) or 1-5 reps (power); accessory = 6-12 reps (hypertrophy). Rest: primary/power = 2-5 min; accessory = 60-90 sec.
6. Every exercise must include: classification (Primary/Plyometric/Olympic/Secondary Compound/Accessory/Conditioning) and a performance intent cue in the notes field.
7. Each session must have movement balance: lower days = squat + hinge + posterior chain; upper days = push + pull + shoulder stability.
8. Day structure must fit ${answers.frequency} days/week without overlap
9. Run internal validation before output: correct order ✓ correct rep zones ✓ correct rest ✓ movement balance ✓ intent cues ✓. Auto-correct any violations.
10. Make the program feel like it was designed by an elite strength coach — not a template

Return only valid JSON. No markdown.`;
}

// ─── OpenAI Call ────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt: string, userPrompt: string, maxTokens = 3500): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("NO_API_KEY");

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
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.65,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return data.choices[0]?.message?.content ?? "{}";
}

// ─── Intelligent Fallback ────────────────────────────────────────────────────

function buildFallbackProgram(answers: GuestOnboardingAnswers): GuestProgram {
  const goal = normalizeGoal(answers.goal);
  const experience = normalizeExperience(answers.experience);
  const equipment = normalizeEquipment(answers.equipment.join(", "));
  const injuryFlags = detectInjuryFlags(answers.injuries);
  const freq = Math.min(Math.max(answers.frequency, 2), 6);

  const goalLabels: Record<string, string> = {
    hypertrophy: "Muscle Building",
    strength: "Strength",
    fat_loss: "Fat Loss",
    general_fitness: "General Fitness",
    athletic_performance: "Athletic Performance",
    endurance: "Endurance",
  };

  const goalLabel = goalLabels[goal] ?? answers.goal;

  // Build days using existing exercise selector
  const days: GuestProgramDay[] = [];

  // NSCA prescription helper for fallback builder
  function guestNscaRx(pattern: string, role: "primary" | "secondary" | "accessory"): { classification: string; sets: number; reps: string; rest: string; notes: string } {
    if (pattern === "power_explosive") {
      return { classification: "Plyometric/Explosive", sets: 4, reps: "3-5", rest: "3 min", notes: "Explosive concentric — max intent on every rep. CNS must be fresh." };
    }
    if (role === "primary") {
      if (goal === "strength") return { classification: "Primary", sets: 5, reps: "3-5", rest: "3 min", notes: "Max effort on working sets. Control the eccentric (2-3 sec), drive hard on the concentric." };
      if (goal === "hypertrophy") return { classification: "Primary", sets: 4, reps: "6-8", rest: "2 min", notes: "Max effort on working sets. Control the eccentric (2-3 sec), drive hard on the concentric." };
      if (goal === "athletic_performance") return { classification: "Primary", sets: 4, reps: "4-6", rest: "3 min", notes: "Move with intent — bar speed matters. Strength is the foundation of athletic power." };
      return { classification: "Primary", sets: 4, reps: "5-6", rest: "2 min", notes: "Control the eccentric, drive on the concentric. Earn each rep." };
    }
    if (role === "secondary") {
      if (goal === "strength") return { classification: "Secondary Compound", sets: 4, reps: "4-6", rest: "2 min", notes: "Controlled tempo throughout. Support the primary pattern. 2 RIR on all working sets." };
      return { classification: "Secondary Compound", sets: 3, reps: "8-12", rest: "90 sec", notes: "Controlled tempo throughout. Focus on the target muscle. 2 RIR on all working sets." };
    }
    // accessory
    return { classification: "Accessory", sets: 3, reps: "10-15", rest: "60 sec", notes: "Full range of motion. Stability focus — feel the target muscle. Quality over load." };
  }

  if (freq <= 3) {
    // Full body — NSCA hierarchy: primary compounds first, then secondary/push-pull, then accessories
    for (let d = 1; d <= freq; d++) {
      const primaryExs = selectExercises({ patterns: ["squat", "hinge"], goal, experience, equipment, injuryFlags, maxCount: 1 });
      const secondaryExs = [
        ...selectExercises({ patterns: ["push_horizontal", "push_vertical"], goal, experience, equipment, injuryFlags, maxCount: 1 }),
        ...selectExercises({ patterns: ["pull_horizontal", "pull_vertical"], goal, experience, equipment, injuryFlags, maxCount: 1 }),
      ];
      const accessoryExs = selectExercises({ patterns: ["iso_legs", "core"], goal, experience, equipment, injuryFlags, maxCount: 2 });

      // NSCA order: primary → secondary → accessory
      const allExs = [...primaryExs, ...secondaryExs, ...accessoryExs];

      days.push({
        dayNumber: d,
        name: `Day ${d} — Full Body`,
        focus: "Balanced full-body stimulus — compound strength, push/pull balance, accessory work",
        exercises: allExs.map((ex, i) => {
          const role = i === 0 ? "primary" : i <= 2 ? "secondary" : "accessory";
          const rx = guestNscaRx(ex.pattern, role);
          return {
            name: ex.name,
            classification: rx.classification,
            sets: rx.sets,
            reps: rx.reps,
            rest: rx.rest,
            notes: rx.notes,
          };
        }),
        dayNotes: "Rest at least one day between sessions. Primary compounds first — never skip the hierarchy.",
      });
    }
  } else {
    // Upper/Lower split for 4+ — NSCA pattern ordering within each day
    const splits = freq === 4
      ? ["Upper A", "Lower A", "Upper B", "Lower B"]
      : freq === 5
        ? ["Upper A", "Lower A", "Upper B", "Lower B", "Full Body"]
        : ["Upper A", "Lower A", "Upper B", "Lower B", "Full Body", "Conditioning"];

    for (let d = 0; d < freq; d++) {
      const splitName = splits[d] ?? `Day ${d + 1}`;
      const isUpper = splitName.includes("Upper");
      const isLower = splitName.includes("Lower");

      // NSCA-ordered pattern lists per split type
      let primaryPatterns: string[];
      let secondaryPatterns: string[];
      let accessoryPatterns: string[];
      let focus: string;

      if (isUpper) {
        primaryPatterns = ["push_horizontal"];
        secondaryPatterns = ["push_vertical", "pull_horizontal", "pull_vertical"];
        accessoryPatterns = ["iso_arms", "iso_shoulders"];
        focus = "Upper body push/pull — compound strength then balanced accessories";
      } else if (isLower) {
        primaryPatterns = ["squat"];
        secondaryPatterns = ["hinge", "iso_legs"];
        accessoryPatterns = ["carry", "core"];
        focus = "Lower body — squat pattern primary, hinge secondary, posterior chain accessories";
      } else {
        primaryPatterns = ["squat"];
        secondaryPatterns = ["push_horizontal", "pull_horizontal"];
        accessoryPatterns = ["core", "conditioning"];
        focus = "Full body integration — strength foundation with balanced push/pull";
      }

      // Select exercises per tier (NSCA hierarchy respected by selection order)
      const primaryExs = selectExercises({ patterns: primaryPatterns as any, goal, experience, equipment, injuryFlags, maxCount: 1 });
      const secondaryExs = selectExercises({ patterns: secondaryPatterns as any, goal, experience, equipment, injuryFlags, maxCount: 3 });
      const accessoryExs = selectExercises({ patterns: accessoryPatterns as any, goal, experience, equipment, injuryFlags, maxCount: 2 });
      const orderedExs = [...primaryExs, ...secondaryExs, ...accessoryExs].slice(0, 5);

      days.push({
        dayNumber: d + 1,
        name: `Day ${d + 1} — ${splitName}`,
        focus,
        exercises: orderedExs.map((ex, i) => {
          const role = i === 0 ? "primary" : i <= primaryExs.length ? "secondary" : "accessory";
          const rx = guestNscaRx(ex.pattern, role);
          return {
            name: ex.name,
            classification: rx.classification,
            sets: rx.sets,
            reps: rx.reps,
            rest: rx.rest,
            notes: rx.notes,
          };
        }),
      });
    }
  }

  return {
    programName: `${answers.experience} ${goalLabel} Program — ${freq}×/week`,
    weeklyStructure: freq <= 3 ? `${freq}-day Full Body` : `${freq}-day Upper/Lower Split`,
    coachIntro: `Based on your ${answers.experience.toLowerCase()} experience level and ${goalLabel.toLowerCase()} focus, I've built a ${freq}-day structure that matches your available equipment and works around any limitations you've noted.`,
    rationale: `This program applies progressive overload principles across ${freq} weekly sessions. Exercise selection reflects your available ${answers.equipment.join("/")} and routes around ${answers.injuries !== "None" ? answers.injuries : "any noted limitations"}. Volume and intensity are calibrated to your experience tier for sustainable week-over-week progress.`,
    days,
    coachNote: `Focus on technique in week 1 — track weights used so we can load progressively from week 2. Log any soreness or discomfort so adjustments can be made.`,
    progressionPrinciple: `Add 2.5–5% load or 1-2 reps each week when all sets are completed with good form. Deload every 4-6 weeks.`,
  };
}

// ─── Main Services ────────────────────────────────────────────────────────────

export async function generateGuestProgram(
  deviceId: string,
  answers: GuestOnboardingAnswers
): Promise<GuestProgram> {
  let program: GuestProgram;

  try {
    const raw = await callOpenAI(buildGuestSystemPrompt(), buildGuestUserPrompt(answers));
    program = JSON.parse(raw) as GuestProgram;

    if (!program.days || !Array.isArray(program.days) || program.days.length === 0) {
      throw new Error("Invalid program structure from AI");
    }

    logger.info({ deviceId }, "Guest program generated via OpenAI");
  } catch (err: any) {
    if (err.message !== "NO_API_KEY") {
      logger.warn({ err: err.message, deviceId }, "OpenAI generation failed — using fallback");
    } else {
      logger.info({ deviceId }, "No OpenAI key — using training-intelligence fallback");
    }
    try {
      program = buildFallbackProgram(answers);
    } catch (fallbackErr: any) {
      logger.error({ err: fallbackErr.message, stack: fallbackErr.stack, answers }, "Fallback program generation failed");
      throw fallbackErr;
    }
  }

  // Persist to guest session
  const session = await getGuestSession(deviceId);
  const existingMeta = (session?.metadata ?? {}) as Record<string, unknown>;

  await updateGuestSession(deviceId, {
    firstProgramGeneratedAt: new Date(),
    teaserUsesCount: 1,
    metadata: {
      ...existingMeta,
      firstProgramOutput: program,
    },
  });

  return program;
}

export async function generateGuestFollowup(
  deviceId: string,
  userMessage: string
): Promise<string> {
  const session = await getGuestSession(deviceId);
  if (!session) throw new Error("Guest session not found");

  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const answers = meta.onboardingAnswers as GuestOnboardingAnswers | undefined;
  const firstProgram = meta.firstProgramOutput as GuestProgram | undefined;

  const systemPrompt = `You are an elite AI performance architect. You have just delivered a personalized training program to this athlete and they have one follow-up question or refinement request.

## ATHLETE PROFILE
${answers ? `- Goal: ${answers.goal}
- Experience: ${answers.experience}
- Training Days: ${answers.frequency}/week
- Equipment: ${(answers.equipment ?? []).join(", ")}
- Injuries: ${answers.injuries}
- Style: ${answers.style}` : "Profile not available"}

## THEIR INITIAL PROGRAM
${firstProgram ? `Program: ${firstProgram.programName}
Structure: ${firstProgram.weeklyStructure}
Days: ${firstProgram.days.map(d => d.name).join(", ")}` : "Program context not available"}

## RESPONSE RULES
- Answer precisely and helpfully
- Stay in character as their performance coach
- If they want a modification, describe it clearly
- If they ask a question, answer it with expert depth
- Keep response focused and scannable (use line breaks)
- Do NOT repeat back what they said
- Do NOT use filler phrases`;

  let content: string;

  try {
    const raw = await callOpenAI(systemPrompt, userMessage, 800);
    const parsed = JSON.parse(raw);
    // If OpenAI returns JSON unexpectedly, extract content
    content = typeof parsed === "string" ? parsed : (parsed.content ?? raw);
  } catch {
    try {
      // Try non-JSON call
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("NO_API_KEY");

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: 800,
          temperature: 0.65,
        }),
      });

      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      content = data.choices[0]?.message?.content ?? "Good question. Let me think through this...";
    } catch {
      content = generateFallbackFollowup(userMessage, answers, firstProgram);
    }
  }

  // Update teaser usage
  await updateGuestSession(deviceId, {
    teaserUsesCount: (session.teaserUsesCount ?? 1) + 1,
  });

  return content;
}

function generateFallbackFollowup(
  message: string,
  answers?: GuestOnboardingAnswers,
  program?: GuestProgram
): string {
  const lower = message.toLowerCase();

  if (lower.match(/easier|beginner|simpler|too hard|scale/)) {
    return `Good call — if the volume feels high in week 1, reduce each working set by one and prioritize movement quality over load. The structure stays the same; just start conservative and earn the volume over weeks 2-3.`;
  }
  if (lower.match(/harder|more volume|too easy|advanced/)) {
    return `If week 1 feels manageable, add one working set to your two heaviest compound lifts in week 2, and increase load by 2.5-5% where form held well. Don't chase fatigue — chase quality reps with progressive load.`;
  }
  if (lower.match(/swap|change|replace|substitute|alternative/)) {
    return `Happy to swap exercises. Tell me which movement you want to replace and I'll give you a biomechanically equivalent substitute that matches your equipment and won't compromise the program structure.`;
  }
  if (lower.match(/cardio|conditioning|fat loss|cut/)) {
    return `For cardio alongside this program: 2-3 sessions of 20-30 min moderate-intensity work on off days works well. Keep intensity low enough that it doesn't compromise recovery. If fat loss is the primary goal, nutrition will drive 80% of those results — the lifting preserves muscle.`;
  }
  if (lower.match(/how long|weeks|progress|when|results/)) {
    return `With consistent execution and adequate nutrition, expect measurable strength gains in weeks 2-4 and visible physique changes by weeks 6-8. Beginners will progress faster. Log your lifts weekly — the data tells you more than how you feel day to day.`;
  }

  return `That's a great angle to work on. Based on your ${answers?.goal ?? "goal"} and current ${answers?.experience ?? ""} experience, the key is consistency with progressive load. Keep the core structure intact for the first 3 weeks to establish your baseline — then we can make informed adjustments. What specifically prompted the question?`;
}
