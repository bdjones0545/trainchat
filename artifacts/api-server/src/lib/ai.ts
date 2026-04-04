import { db, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  buildIntelligenceContext,
  buildDBExerciseContext,
  buildTrainingSpec,
  selectExercises,
  normalizeGoal,
  normalizeExperience,
  normalizeEquipment,
  detectInjuryFlags,
  type UserProfile,
  type GoalType,
  type ExerciseEntry,
  type MovementPattern,
} from "./training-intelligence";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  structuredData?: ProgramStructure | null;
}

export interface ProgramStructure {
  programName: string;
  description: string;
  progressionStrategy?: string;
  splitType?: string;
  days: ProgramDay[];
}

export interface ProgramDay {
  dayNumber: number;
  name: string;
  focus?: string;
  exercises: Exercise[];
  notes?: string;
}

export interface Exercise {
  name: string;
  classification?: string;
  sets: number;
  reps: string;
  rest: string;
  intent?: string;
  notes?: string;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

async function buildSystemPrompt(profile: UserProfile | null): Promise<string> {
  const coreIdentity = `You are TrainChat — an elite AI performance architect. Your purpose is to guide users in co-creating world-class, personalized training systems through intelligent coaching dialogue.

## YOUR IDENTITY
You think and communicate like someone at the intersection of:
- Exercise physiology expertise (adaptation science, periodization, energy systems, biomechanics)
- Division 1 Strength & Conditioning coaching (experience with high-performance athletes)
- Motor learning science (how strength, skill, and movement quality develop over time)
- Long-term performance planning — you think in training cycles, not single sessions

## COMMUNICATION STYLE — NON-NEGOTIABLE
- Precise and direct. No fluff. No filler. No hype.
- Concise: 2-5 sentences for conversational exchanges. No walls of text.
- Educational when it adds value — explain the *why* briefly when it helps the user understand a decision.
- Calm authority. You're confident, not motivational-poster-like.
- Never use: "Great question!", "Absolutely!", "Of course!", "Sure!", or any generic praise filler.
- Never repeat the user's input back to them verbatim.
- Line breaks and whitespace are your friend. Scannable > dense.

## CO-CREATION BEHAVIOR MODEL — ALWAYS FOLLOW THIS
Your job is NOT to immediately produce a finished program. Guide the user through a building process.

Sequence:
1. UNDERSTAND — What is the actual intent behind this request?
2. CLARIFY — Ask 1-3 sharp, targeted questions if critical information is missing.
3. PROPOSE — Offer a framework or structure before committing to full detail.
4. REFINE — Adjust based on feedback before finalizing.
5. OUTPUT — Deliver the full structured program when you have sufficient information.

Move faster through these steps when the request is already specific.
If you already have the user's profile, DO NOT ask for information you already know.

## INTELLIGENT PUSHBACK
Do not blindly comply with poor training decisions:
1. Acknowledge the intent briefly
2. Explain the issue in 1-2 sentences
3. Propose the better direction

Push back when users suggest:
- Training the same muscle to failure every session
- Splits that don't match their recovery capacity
- Volume beyond what their experience level can absorb
- Exercise choices that conflict with stated injuries or limitations
- Unrealistic volume or frequency for their schedule

You are the expert. Act like one.

## RESPONSE MODES

Mode A — Conversational Guidance (clarification phase):
Plain prose, 2-6 sentences. Ask focused, sharp questions.

Mode B — Structure Preview (before full detail):
Plain text outline. No JSON.
Example:
  Proposed Split: Upper / Lower × 4 days
  Day 1: Upper Push — strength focus (4-6 rep range, compound first)
  Day 2: Lower — squat pattern primary (back squat + RDL + accessories)
  Day 3: Upper Pull — volume focus (8-12 reps, back thickness + width)
  Day 4: Lower — hinge pattern primary (deadlift + leg press + accessories)
  Progression: Add reps first, then load. Deload every 4th week.
  Does this direction work, or do you want to adjust before I build it?

Mode C — Full Program Output (when ready):
Brief coaching rationale (2-3 sentences), then the JSON block.

## NSCA EXERCISE ORDER — MANDATORY HIERARCHY
Every session MUST follow this sequence. No exceptions unless explicitly overridden by the user:

1. **Plyometric / Explosive movements** — box jumps, med ball throws, reactive drills (CNS must be completely fresh)
2. **Olympic lifts / High-skill power movements** — power clean, hang clean, snatch, push press (technical demand requires unfatigued neural state)
3. **Primary strength lifts** — squat, deadlift, bench press, weighted pull-up (compound, highest priority for the session)
4. **Secondary compound lifts** — Romanian deadlift, incline press, barbell row (support the primary pattern)
5. **Accessory / Isolation work** — curls, lateral raises, leg extensions (can tolerate accumulated fatigue)
6. **Conditioning / Metabolic work** — sled, intervals, circuits (always last)

NEVER place high-skill or explosive lifts after fatigue-heavy work. Box jumps BEFORE squats. Power cleans BEFORE squats. Always.

## NSCA REP & INTENSITY ZONES
Match ALL rep ranges and set counts to these NSCA-defined zones:

**Strength:** 1–6 reps | 3–6 sets | primary and major compound lifts
**Power / Olympic:** 1–5 reps | 3–5 sets | maximal speed intent on every rep
**Hypertrophy:** 6–12 reps | 2–4 sets | accessory and secondary compound
**Endurance / Conditioning:** 12+ reps or time-based | 2–3 sets

Rules:
- Primary lifts → strength or power rep ranges
- Accessory lifts → hypertrophy rep ranges
- Never assign strength-zone reps to isolation work
- Never assign conditioning-zone rest to power or primary lifts

## REST PERIOD STANDARDS (NSCA)
Enforce strictly — rest duration must match the exercise classification:

- **Power / Olympic lifts:** 2–5 minutes (neural recovery required)
- **Primary strength lifts:** 2–5 minutes (systemic recovery required)
- **Secondary compound:** 90 seconds–2 minutes
- **Hypertrophy / Accessory:** 60–90 seconds
- **Conditioning:** variable (work:rest ratio based on energy system)

Never assign 60-second rest to power cleans, heavy squats, or deadlifts.

## MOVEMENT BALANCE — PER SESSION
Each session must include appropriate movement pattern balance:

**Lower body day:** squat pattern + hinge pattern + posterior chain accessory
**Upper body day:** horizontal or vertical push + horizontal or vertical pull + shoulder stability work
**Full body day:** one lower compound + one upper compound + balanced accessories

Avoid redundant loading (e.g., two horizontal pushes with no pull).

## NEURAL / INTENT INSTRUCTIONS — REQUIRED ON EVERY EXERCISE
Every exercise in the output MUST include a performance intent cue. This aligns with elite coaching standards:

Examples:
- "Explosive concentric — max intent on every rep"
- "Controlled eccentric (3 sec), explosive drive"
- "Stability focus — brace hard through the entire range"
- "Bar speed is the priority — use 70-80% and move it fast"
- "Full range, controlled tempo — feel the stretch at the bottom"

This is non-negotiable. An exercise without intent is incomplete coaching.

## FATIGUE MANAGEMENT — NEURAL DEMAND HIERARCHY
High neural demand work MUST come before fatiguing movements:
- Power and Olympic lifts → always in the first 1-2 slots
- Primary compound → before any accessory work
- Never program high-skill movements after squats, deadlifts, or heavy compounds
- If a session includes both explosive and heavy compound work, explosive work comes first

## PRE-OUTPUT VALIDATION (INTERNAL — run before every program output)
Before returning any program, verify:
☑ Exercise order follows the NSCA hierarchy (explosive → olympic → primary → secondary → accessory → conditioning)
☑ Rep ranges match NSCA zones by classification (strength 1-6, power 1-5, hypertrophy 6-12)
☑ Rest periods match exercise classification (power/strength: 2-5 min, hypertrophy: 60-90s)
☑ Each session has logical movement balance (no redundant loading)
☑ Every exercise has an intent cue

If any violation is found → auto-correct before output.

## STRUCTURED OUTPUT — PROGRAM JSON FORMAT
Only output this JSON when delivering a finalized program:

\`\`\`json
{
  "programName": "string",
  "description": "string",
  "progressionStrategy": "string — specific progression model, rate, and deload guidance",
  "splitType": "string — e.g. Upper/Lower × 4, PPL, Full Body × 3",
  "days": [
    {
      "dayNumber": 1,
      "name": "string — e.g. Upper Body — Push",
      "focus": "string — primary training focus/purpose of this session",
      "exercises": [
        {
          "name": "string",
          "classification": "string — e.g. Primary, Secondary, Plyometric, Olympic, Accessory, Conditioning",
          "sets": 4,
          "reps": "4-6",
          "rest": "3 min",
          "intent": "string — performance cue e.g. 'Explosive concentric, controlled eccentric (3s)'",
          "notes": "optional technique or execution note"
        }
      ],
      "notes": "optional coaching note for this day"
    }
  ]
}
\`\`\`

## MODIFICATION HANDLING
When a user asks to modify an existing program:
- Change ONLY what was requested
- Preserve the rest of the structure
- Do not rebuild from scratch
- Briefly note what changed and why

## CONVERSATION MEMORY
This conversation's history is included. Track what has been decided:
- Goals and constraints already stated — do not ask again
- Split structure agreed upon — preserve it during modifications
- Injuries mentioned — always apply them even if not re-stated`;

  if (!profile) {
    return coreIdentity + `

## USER CONTEXT
This user has not completed their training profile. If they ask for a personalized program, collect: goal, experience level, days per week, session duration, and equipment access.`;
  }

  // Build rich intelligence context from the training engine
  const intelligenceContext = buildIntelligenceContext(profile);

  // Build DB-backed exercise library context (async — gracefully skips on error)
  const exerciseLibraryContext = await buildDBExerciseContext(profile);

  return coreIdentity + `

## USER TRAINING PROFILE
(Provided by onboarding — do not ask for any of this information)

- Primary Goal: ${profile.trainingGoal}
- Experience Level: ${profile.experienceLevel}
- Preferred Training Style: ${profile.trainingStyle}
- Available Days: ${profile.daysPerWeek} days/week
- Session Duration: ${profile.sessionDuration} minutes
- Equipment: ${profile.equipmentAccess}
${profile.injuries ? `- Injuries / Limitations: ${profile.injuries}` : ""}
${profile.sportFocus ? `- Sport / Activity Focus: ${profile.sportFocus}` : ""}
${profile.exercisePreferences ? `- Exercise Preferences: ${profile.exercisePreferences}` : ""}
${profile.exercisesToAvoid ? `- Exercises to Avoid (NEVER program these): ${profile.exercisesToAvoid}` : ""}

${intelligenceContext}${exerciseLibraryContext}`;
}

// ─── JSON extractor ──────────────────────────────────────────────────────────

function extractStructuredData(content: string): {
  cleanContent: string;
  structuredData: ProgramStructure | null;
} {
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
  if (!jsonMatch) {
    return { cleanContent: content, structuredData: null };
  }

  try {
    const structuredData = JSON.parse(jsonMatch[1]) as ProgramStructure;
    const cleanContent = content.replace(/```json\n[\s\S]*?\n```/, "").trim();
    return { cleanContent, structuredData };
  } catch {
    logger.warn("Failed to parse structured program JSON from AI response");
    return { cleanContent: content, structuredData: null };
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function generateAIResponse(
  userMessage: string,
  history: ChatMessage[],
  userId: number,
  adaptationContext?: string,
  memoryContext?: string,
  insightHint?: string,
  conversionHint?: string
): Promise<AIResponse> {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const basePrompt = await buildSystemPrompt(profile ?? null);
  const extras = [adaptationContext, memoryContext, insightHint, conversionHint].filter(Boolean).join("\n\n");
  const systemPrompt = extras ? `${basePrompt}\n\n${extras}` : basePrompt;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return generateFallbackResponse(userMessage, history, profile ?? null);
  }

  try {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.slice(-30).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userMessage },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 2800,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const rawContent =
      data.choices[0]?.message?.content ?? "I'm unable to respond right now.";
    const { cleanContent, structuredData } = extractStructuredData(rawContent);

    return { content: cleanContent, structuredData };
  } catch (error) {
    logger.error({ error }, "OpenAI API call failed — using fallback");
    return generateFallbackResponse(userMessage, history, profile ?? null);
  }
}

// ─── Intelligent Fallback (no API key) ──────────────────────────────────────
// Uses the training intelligence engine for exercise selection and program design.
// Follows the same co-creation model as the real AI agent.

function generateFallbackResponse(
  userMessage: string,
  history: ChatMessage[],
  profile: UserProfile | null
): AIResponse {
  const lower = userMessage.toLowerCase();
  const userTurnCount = history.filter((m) => m.role === "user").length;
  const isFirstMessage = userTurnCount === 0;

  // ── Greeting ──
  if (isFirstMessage && lower.match(/^(hi|hey|hello|sup|what's up|yo)\b/)) {
    if (profile) {
      const goal = normalizeGoal(profile.trainingGoal);
      const goalLabel = profile.trainingGoal.toLowerCase();
      return {
        content: `Ready when you are. You're working toward ${goalLabel} with ${profile.daysPerWeek} days and ${profile.sessionDuration}-minute sessions. What are we building today — a new program, a split adjustment, or something else?`,
        structuredData: null,
      };
    }
    return {
      content: `Welcome to TrainChat. I'm your AI performance architect. What are you working toward — strength, muscle, athletic performance, or something else? Give me the context and we'll build from there.`,
      structuredData: null,
    };
  }

  // ── Capabilities ──
  if (lower.match(/what can you do|how does this work|help me|what.*(are you|is this)|capabilities/)) {
    return {
      content: `Here's what I do:\n\n**Program Design** — I build complete training programs around your goal, schedule, and equipment. Not templates — structured systems with intelligent exercise selection and progression built in.\n\n**Co-Creation** — I don't just hand you a workout. We build the structure together before I fill in the detail, so the program reflects your actual situation.\n\n**Modifications** — Natural language edits: "swap X", "shorten sessions", "make this more athletic", "I have knee pain now". I'll update surgically, not rebuild unnecessarily.\n\n**Coaching Context** — I explain the reasoning behind structure choices, exercise order, rep ranges, and progression logic.\n\nWhat do you want to build?`,
      structuredData: null,
    };
  }

  // ── Program request ──
  if (lower.match(/build|create|design|make|give me|generate|program|plan|routine|split|workout/)) {
    if (!profile) {
      return {
        content: `To build you the right program, I need a few things:\n\n1. **Primary goal** — strength, hypertrophy, athletic performance, general fitness?\n2. **Days per week** available to train\n3. **Session length** in minutes\n4. **Equipment** — full gym, dumbbells only, home setup, bodyweight?\n5. **Experience level** — beginner, intermediate, or advanced?\n\nGive me these and I'll build the structure.`,
        structuredData: null,
      };
    }

    const spec = buildTrainingSpec(profile);
    const isSpecificRequest =
      lower.match(/upper|lower|push|pull|full body|ppl|legs|split|day|4-day|3-day|5-day/);

    // If not yet specific — propose structure first (co-creation step 3)
    if (!isSpecificRequest && isFirstMessage) {
      return {
        content: `Based on your profile, here's what makes sense before I build it out:\n\n**Proposed Split:** ${spec.splitType}\n**Structure:** ${spec.splitDescription}\n\n**Why this works for you:** ${spec.splitRationale}\n\nSessions will stay within ${profile.sessionDuration} minutes. Progression follows ${spec.progressionModel.toLowerCase()}.\n\nDoes this direction work, or do you want to adjust anything before I build the full program?`,
        structuredData: null,
      };
    }

    // Build the program using the intelligence engine
    const program = buildIntelligentProgram(profile);
    const goal = normalizeGoal(profile.trainingGoal);
    const rationale = getGoalOpeningLine(goal, spec);

    return {
      content: `${rationale}\n\nBuilt around ${profile.daysPerWeek} days, ${profile.sessionDuration}-minute sessions, and ${profile.equipmentAccess}. ${spec.progressionModel} — details in the program. Tell me if you want to swap anything out or adjust the structure.`,
      structuredData: program,
    };
  }

  // ── Modification request ──
  if (lower.match(/swap|change|replace|modify|adjust|shorter|longer|remove|add|less.*volume|more.*volume|make.*athletic|make.*shorter|shoulder|knee|back/)) {
    if (profile?.injuries && lower.match(/shoulder|knee|back|hip|pain|hurt|injury/)) {
      return {
        content: `I already have your ${profile.injuries} noted, so those patterns are accounted for in any program I build. If something specific is aggravating it, tell me the exercise and I'll substitute immediately without touching the rest of the structure.`,
        structuredData: null,
      };
    }
    return {
      content: `To modify precisely, tell me which part of the program to change and the direction you want to go. I'll update only what's needed — everything else stays intact.\n\nFor example: "swap incline press for cable fly", "shorten each session by 10 minutes", "make leg day less quad-dominant".`,
      structuredData: null,
    };
  }

  // ── Injury / limitation (new) ──
  if (lower.match(/pain|injury|hurt|injured|irritated|tweak|sore|avoid/)) {
    if (profile?.injuries) {
      return {
        content: `You flagged ${profile.injuries} in your profile — that's already factored into any program I generate. If something new is bothering you, tell me:\n\n1. Which area or movement is affected\n2. Acute (just happened) or chronic (ongoing)\n3. What specifically aggravates it\n\nI'll program around it. Managing limitations is part of smart long-term training, not a setback.`,
        structuredData: null,
      };
    }
    return {
      content: `Important to flag this before we build. Tell me:\n\n1. Which area is affected?\n2. Is this acute (recent) or chronic (ongoing)?\n3. What movements specifically aggravate it?\n\nWith that context, I'll design around it — not just avoid the area, but use it to inform the entire structure.`,
      structuredData: null,
    };
  }

  // ── Progression / plateau ──
  if (lower.match(/plateau|stuck|not.*progress|stop.*growing|not.*getting stronger|not improving/)) {
    return {
      content: `Plateaus come from three places: insufficient overload, inadequate recovery, or a stale stimulus.\n\nBefore I diagnose, tell me: how long have you been on your current program, and what does your week-to-week progression look like? Are you adding load, reps, or nothing?`,
      structuredData: null,
    };
  }

  // ── Generic fallback — keep it co-creation ──
  if (profile) {
    return {
      content: `Understood. What specifically are you trying to build or resolve? The more precise you are, the more targeted I can be with the recommendation.`,
      structuredData: null,
    };
  }
  return {
    content: `Tell me more about what you're working toward. What's the primary outcome you want from your training, and what does your current setup look like?`,
    structuredData: null,
  };
}

// ─── Intelligence-powered program builder ────────────────────────────────────

function buildIntelligentProgram(profile: UserProfile): ProgramStructure {
  const goal = normalizeGoal(profile.trainingGoal);
  const experience = normalizeExperience(profile.experienceLevel);
  const equipment = normalizeEquipment(profile.equipmentAccess);
  const injuryFlags = detectInjuryFlags(profile.injuries);
  const spec = buildTrainingSpec(profile);

  // Exclude user-specified exercises
  const userExclusions = profile.exercisesToAvoid
    ? profile.exercisesToAvoid.split(/,|;|\n/).map((s) => s.trim()).filter(Boolean)
    : [];

  const baseFilter = {
    equipment,
    experience,
    injuryFlags,
    goal,
    excludeNames: userExclusions,
    preferStressLevel: injuryFlags.length > 0 ? ("low" as const) : ("any" as const),
  };

  const days = buildDays(goal, experience, equipment, injuryFlags, userExclusions, spec, profile);

  return {
    programName: buildProgramName(profile),
    description: buildProgramDescription(profile, spec),
    progressionStrategy: `${spec.progressionModel}. Rate: ${spec.progressionRate}. ${spec.deloadFrequency} deload.`,
    splitType: spec.splitType,
    days,
  };
}

function buildProgramName(profile: UserProfile): string {
  const goal = normalizeGoal(profile.trainingGoal);
  const labels: Record<GoalType, string> = {
    hypertrophy: "Hypertrophy",
    strength: "Strength",
    athletic_performance: "Athletic Performance",
    fat_loss: "Body Composition",
    general_fitness: "General Fitness",
    endurance: "Endurance",
  };
  const split = buildTrainingSpec(profile).splitType.split(" ")[0];
  return `${labels[goal]} — ${split} ${profile.daysPerWeek}-Day Program`;
}

function buildProgramDescription(profile: UserProfile, spec: ReturnType<typeof buildTrainingSpec>): string {
  const exp = normalizeExperience(profile.experienceLevel);
  const expLabel = exp === "beginner" ? "beginner" : exp === "intermediate" ? "intermediate" : "advanced";
  const injuryNote = spec.injuryFlags.length > 0 ? ` Programmed with ${spec.injuryFlags.map(f => f.replace("_", " ")).join(", ")} modifications.` : "";
  return `A ${profile.daysPerWeek}-day ${spec.splitType} program for ${expLabel} athletes targeting ${profile.trainingGoal.toLowerCase()}. ${profile.sessionDuration}-minute sessions, built for ${profile.equipmentAccess}.${injuryNote}`;
}

function getGoalOpeningLine(goal: GoalType, spec: ReturnType<typeof buildTrainingSpec>): string {
  switch (goal) {
    case "strength":
      return `Here's your strength program — structured around progressive loading on the primary compound lifts with intelligent fatigue management.`;
    case "hypertrophy":
      return `Here's your hypertrophy program — volume and mechanical tension are the drivers, with ${spec.primaryRepRange} reps on primary work and ${spec.secondaryRepRange} on accessories.`;
    case "athletic_performance":
      return `Here's your athletic performance program — explosive work comes first when the CNS is fresh, strength second, and conditioning integrated where appropriate.`;
    case "fat_loss":
      return `Here's your body composition program — resistance training takes priority to preserve muscle, structured with minimal rest to maximize session density.`;
    default:
      return `Here's your program — built around your goal, schedule, and constraints.`;
  }
}

// ─── Day builders ─────────────────────────────────────────────────────────────

function buildDays(
  goal: GoalType,
  experience: ReturnType<typeof normalizeExperience>,
  equipment: ReturnType<typeof normalizeEquipment>,
  injuryFlags: ReturnType<typeof detectInjuryFlags>,
  userExclusions: string[],
  spec: ReturnType<typeof buildTrainingSpec>,
  profile: UserProfile
): ProgramDay[] {
  const days = profile.daysPerWeek;
  const baseFilter = {
    equipment,
    experience,
    injuryFlags,
    goal,
    excludeNames: userExclusions,
    preferStressLevel: injuryFlags.length > 0 ? ("low" as const) : ("any" as const),
  };

  if (days <= 3) return buildFullBodyDays(goal, experience, spec, baseFilter, days);
  if (days === 4) return buildUpperLowerDays(goal, experience, spec, baseFilter);
  return buildPPLDays(goal, experience, spec, baseFilter, days);
}

// NSCA intent cues by exercise classification
const NSCA_INTENT_CUES: Record<string, string> = {
  power_explosive: "Explosive concentric — max intent on every rep. CNS must be fresh.",
  olympic: "Bar speed is the priority. Move with maximal intent. Reset between reps.",
  primary: "Max effort on working sets. Control the eccentric (2-3 sec), drive hard on the concentric.",
  secondary: "Controlled tempo throughout. Focus on the target muscle. 2 RIR on all working sets.",
  accessory: "Full range of motion. Stability focus. Feel the target muscle — quality over load.",
  conditioning: "Work:rest ratio is intentional. Maintain form under fatigue.",
};

function classifyExercise(pattern: MovementPattern): string {
  if (pattern === "power_explosive") return "Plyometric/Explosive";
  if (pattern === "squat" || pattern === "hinge") return "Primary";
  if (pattern === "push_horizontal" || pattern === "push_vertical" || pattern === "pull_horizontal" || pattern === "pull_vertical") return "Secondary Compound";
  if (pattern === "conditioning") return "Conditioning";
  return "Accessory";
}

function intentForPattern(pattern: MovementPattern): string {
  if (pattern === "power_explosive") return NSCA_INTENT_CUES.power_explosive;
  if (pattern === "squat" || pattern === "hinge") return NSCA_INTENT_CUES.primary;
  if (pattern === "push_horizontal" || pattern === "push_vertical" || pattern === "pull_horizontal" || pattern === "pull_vertical") return NSCA_INTENT_CUES.secondary;
  if (pattern === "conditioning") return NSCA_INTENT_CUES.conditioning;
  return NSCA_INTENT_CUES.accessory;
}

function exToDay(ex: ExerciseEntry, sets: number, reps: string, rest: string, patternOverride?: MovementPattern): Exercise {
  const pattern = patternOverride ?? ex.pattern;
  return {
    name: ex.name,
    classification: classifyExercise(pattern),
    sets,
    reps,
    rest,
    intent: intentForPattern(pattern),
    notes: ex.notes,
  };
}

// NSCA prescription lookup by pattern position (primary vs secondary vs accessory)
function nscaPrescription(
  pattern: MovementPattern,
  role: "primary" | "secondary" | "accessory",
  goal: GoalType
): { sets: number; reps: string; rest: string } {
  // Power/explosive: always 3-5 reps, 3-5 sets, 2-5 min
  if (pattern === "power_explosive") {
    return { sets: goal === "athletic_performance" ? 5 : 4, reps: "3-5", rest: "3 min" };
  }
  // Conditioning always last and time/rep based
  if (pattern === "conditioning" || pattern === "carry") {
    return { sets: 3, reps: "30-40m / 40 sec", rest: "90 sec" };
  }
  // Primary compounds: strength zone (1-6 reps, 3-6 sets, 2-5 min)
  if (role === "primary") {
    if (goal === "strength") return { sets: 5, reps: "3-5", rest: "3 min" };
    if (goal === "hypertrophy") return { sets: 4, reps: "6-8", rest: "2 min" };
    if (goal === "athletic_performance") return { sets: 4, reps: "4-6", rest: "3 min" };
    return { sets: 4, reps: "5-6", rest: "2 min" };
  }
  // Secondary compounds: hypertrophy-adjacent (6-12 reps, 2-4 sets, 90s-2min)
  if (role === "secondary") {
    if (goal === "strength") return { sets: 4, reps: "4-6", rest: "2 min" };
    if (goal === "hypertrophy") return { sets: 3, reps: "8-12", rest: "90 sec" };
    return { sets: 3, reps: "8-10", rest: "90 sec" };
  }
  // Accessory/isolation: hypertrophy zone (6-12+ reps, 2-3 sets, 60-90s)
  return { sets: 3, reps: "10-15", rest: "60 sec" };
}

function buildFullBodyDays(
  goal: GoalType,
  experience: ReturnType<typeof normalizeExperience>,
  spec: ReturnType<typeof buildTrainingSpec>,
  baseFilter: Parameters<typeof selectExercises>[0],
  numDays: number
): ProgramDay[] {
  const dayConfigs = [
    { name: "Full Body A — Compound Focus", focus: "Primary strength movements across all patterns", isA: true },
    { name: "Full Body B — Volume Focus", focus: "Higher reps, more total volume", isA: false },
    { name: "Full Body C — Athletic / Integration", focus: "Explosive work, unilateral, conditioning", isA: true, isC: true },
  ].slice(0, numDays);

  return dayConfigs.map((cfg, idx) => {
    const isC = "isC" in cfg && cfg.isC;
    // NSCA hierarchy: explosive first, then primary compounds, then secondary, then accessories
    const patterns = isC
      ? (["power_explosive", "squat", "hinge", "pull_horizontal", "core"] as const)
      : (["squat", "hinge", "push_horizontal", "pull_vertical", "core"] as const);

    const exercises: Exercise[] = [];
    const usedNames = new Set<string>();

    // NSCA hierarchy: patterns are already ordered correctly (explosive → primary → secondary → accessory)
    for (let pIdx = 0; pIdx < patterns.length; pIdx++) {
      const pattern = patterns[pIdx];
      const hits = selectExercises({
        ...baseFilter,
        patterns: [pattern],
        excludeNames: [...(baseFilter.excludeNames ?? []), ...usedNames],
        maxCount: 1,
      });

      if (hits.length === 0) continue;
      const ex = hits[0];
      usedNames.add(ex.name);

      // Determine NSCA role by pattern and position in the session
      const isExplosive = pattern === "power_explosive";
      const isPrimary = !isExplosive && (pattern === "squat" || pattern === "hinge") && pIdx <= 2;
      const isAccessory = pattern === "core" || pattern.startsWith("iso_");
      const role = isExplosive ? "primary" : isPrimary ? "primary" : isAccessory ? "accessory" : "secondary";

      const rx = nscaPrescription(pattern, role, goal);
      exercises.push(exToDay(ex, rx.sets, rx.reps, rx.rest, pattern));
    }

    // Conditioning finisher (always last — NSCA rule)
    const finisher = selectExercises({
      ...baseFilter,
      patterns: ["carry", "conditioning", "iso_legs"],
      excludeNames: [...(baseFilter.excludeNames ?? []), ...usedNames],
      maxCount: 1,
    });
    if (finisher.length > 0) {
      const rx = nscaPrescription(finisher[0].pattern, "accessory", goal);
      exercises.push(exToDay(finisher[0], rx.sets, rx.reps, rx.rest, finisher[0].pattern));
    }

    return {
      dayNumber: idx + 1,
      name: cfg.name,
      focus: cfg.focus,
      exercises,
      notes: idx === 0 ? `${spec.splitRationale}` : undefined,
    };
  });
}

function buildUpperLowerDays(
  goal: GoalType,
  experience: ReturnType<typeof normalizeExperience>,
  spec: ReturnType<typeof buildTrainingSpec>,
  baseFilter: Parameters<typeof selectExercises>[0]
): ProgramDay[] {
  const dayTemplates = [
    {
      dayNumber: 1,
      name: "Upper A — Push Focus",
      focus: "Horizontal and vertical push, primary strength",
      primaryPatterns: ["push_horizontal", "push_vertical"] as const,
      secondaryPatterns: ["pull_vertical", "iso_shoulders", "iso_arms"] as const,
    },
    {
      dayNumber: 2,
      name: "Lower A — Squat Dominant",
      focus: "Quad-dominant, primary squat pattern",
      primaryPatterns: ["squat"] as const,
      secondaryPatterns: ["hinge", "iso_legs", "core"] as const,
    },
    {
      dayNumber: 3,
      name: "Upper B — Pull Focus",
      focus: "Horizontal and vertical pull, volume emphasis",
      primaryPatterns: ["pull_horizontal", "pull_vertical"] as const,
      secondaryPatterns: ["push_horizontal", "iso_shoulders", "iso_arms"] as const,
    },
    {
      dayNumber: 4,
      name: "Lower B — Hinge Dominant",
      focus: "Posterior chain, hip-dominant movements",
      primaryPatterns: ["hinge"] as const,
      secondaryPatterns: ["squat", "iso_legs", "carry"] as const,
    },
  ];

  return dayTemplates.map((template, dayIdx) => {
    const usedNames = new Set<string>();
    const exercises: Exercise[] = [];

    // Primary exercises (2) — NSCA primary compound zones
    for (const pattern of template.primaryPatterns.slice(0, 2)) {
      const hits = selectExercises({
        ...baseFilter,
        patterns: [pattern],
        excludeNames: [...(baseFilter.excludeNames ?? []), ...usedNames],
        maxCount: 1,
      });
      if (hits.length > 0) {
        usedNames.add(hits[0].name);
        const rx = nscaPrescription(pattern, "primary", goal);
        exercises.push(exToDay(hits[0], rx.sets, rx.reps, rx.rest, pattern));
      }
    }

    // Secondary exercises (2-3) — NSCA secondary/accessory zones
    const secondaryCount = spec.exercisesPerSession.max - exercises.length - 1;
    for (const pattern of template.secondaryPatterns.slice(0, secondaryCount)) {
      const isIso = pattern.startsWith("iso_") || pattern === "carry" || pattern === "core";
      const hits = selectExercises({
        ...baseFilter,
        patterns: [pattern],
        excludeNames: [...(baseFilter.excludeNames ?? []), ...usedNames],
        maxCount: 1,
      });
      if (hits.length > 0) {
        usedNames.add(hits[0].name);
        const rx = nscaPrescription(pattern, isIso ? "accessory" : "secondary", goal);
        exercises.push(exToDay(hits[0], rx.sets, rx.reps, rx.rest, pattern));
      }
    }

    return {
      dayNumber: template.dayNumber,
      name: template.name,
      focus: template.focus,
      exercises,
      notes: dayIdx === 0 ? spec.splitRationale : undefined,
    };
  });
}

function buildPPLDays(
  goal: GoalType,
  experience: ReturnType<typeof normalizeExperience>,
  spec: ReturnType<typeof buildTrainingSpec>,
  baseFilter: Parameters<typeof selectExercises>[0],
  numDays: number
): ProgramDay[] {
  const templates = [
    {
      dayNumber: 1,
      name: "Push — Strength Focus",
      focus: "Heavy horizontal and vertical push",
      primary: ["push_horizontal", "push_vertical"] as const,
      secondary: ["iso_shoulders", "iso_arms"] as const,
    },
    {
      dayNumber: 2,
      name: "Pull — Strength Focus",
      focus: "Heavy horizontal and vertical pull, back thickness",
      primary: ["pull_horizontal", "pull_vertical"] as const,
      secondary: ["iso_shoulders", "iso_arms"] as const,
    },
    {
      dayNumber: 3,
      name: "Legs — Squat / Quad Focus",
      focus: "Quad-dominant, primary squat pattern",
      primary: ["squat", "hinge"] as const,
      secondary: ["iso_legs", "core"] as const,
    },
    {
      dayNumber: 4,
      name: "Push — Volume Focus",
      focus: "Moderate load, higher reps, pump emphasis",
      primary: ["push_horizontal", "iso_chest"] as const,
      secondary: ["push_vertical", "iso_shoulders", "iso_arms"] as const,
    },
    {
      dayNumber: 5,
      name: "Pull — Volume Focus",
      focus: "Back width and detail, higher rep ranges",
      primary: ["pull_vertical", "pull_horizontal"] as const,
      secondary: ["iso_back", "iso_arms"] as const,
    },
    {
      dayNumber: 6,
      name: "Legs — Hinge / Posterior Focus",
      focus: "Posterior chain, hamstrings, glutes",
      primary: ["hinge", "squat"] as const,
      secondary: ["iso_legs", "carry"] as const,
    },
  ].slice(0, numDays);

  return templates.map((template, dayIdx) => {
    const usedNames = new Set<string>();
    const exercises: Exercise[] = [];
    // Volume days (4-6) use secondary/hypertrophy zones; strength days use primary zones
    const isVolumeDay = dayIdx >= 3;

    for (const pattern of template.primary.slice(0, 2)) {
      const hits = selectExercises({
        ...baseFilter,
        patterns: [pattern],
        excludeNames: [...(baseFilter.excludeNames ?? []), ...usedNames],
        maxCount: 1,
      });
      if (hits.length > 0) {
        usedNames.add(hits[0].name);
        // NSCA: strength days → primary zone; volume days → secondary zone
        const rx = nscaPrescription(pattern, isVolumeDay ? "secondary" : "primary", goal);
        exercises.push(exToDay(hits[0], rx.sets, rx.reps, rx.rest, pattern));
      }
    }

    const accessoryCount = spec.exercisesPerSession.max - exercises.length;
    for (const pattern of template.secondary.slice(0, accessoryCount)) {
      const hits = selectExercises({
        ...baseFilter,
        patterns: [pattern],
        excludeNames: [...(baseFilter.excludeNames ?? []), ...usedNames],
        maxCount: 1,
      });
      if (hits.length > 0) {
        usedNames.add(hits[0].name);
        // NSCA: iso/carry patterns → accessory zone; others → secondary zone
        const isIso = pattern.startsWith("iso_") || pattern === "carry" || pattern === "core";
        const rx = nscaPrescription(pattern, isIso ? "accessory" : "secondary", goal);
        exercises.push(exToDay(hits[0], rx.sets, rx.reps, rx.rest, pattern));
      }
    }

    return {
      dayNumber: template.dayNumber,
      name: template.name,
      focus: template.focus,
      exercises,
      notes: dayIdx === 0 ? spec.splitRationale : undefined,
    };
  });
}
