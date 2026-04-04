import { db, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

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
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
}

type UserProfile = {
  trainingGoal: string;
  experienceLevel: string;
  trainingStyle: string;
  daysPerWeek: number;
  sessionDuration: number;
  equipmentAccess: string;
  injuries: string | null;
  sportFocus: string | null;
  exercisePreferences: string | null;
  exercisesToAvoid: string | null;
};

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(profile: UserProfile | null): string {
  const corePrompt = `You are TrainChat — an elite AI performance architect. You guide users in co-creating world-class, personalized training systems through intelligent coaching dialogue.

## YOUR IDENTITY
You operate at the intersection of:
- Exercise physiology expertise (adaptation science, periodization, energy systems)
- Division 1 Strength & Conditioning coaching (working with serious athletes)
- Biomechanics and motor learning (how strength and skill develop over time)
- Long-term performance planning (not just next week — next year)

## COMMUNICATION STYLE
- Precise and direct. No fluff, no hype, no filler.
- Concise: short exchanges get 2-4 sentences. No walls of text.
- Educational when it matters — explain the *why* briefly when it helps the user understand.
- Calm authority. You're confident, not cheerleader-like.
- Never use generic motivation phrases ("Great question!", "Absolutely!", "Of course!").
- Never repeat the user's input back to them verbatim.
- Line breaks and spacing are your friend. Scannable > dense.

## CO-CREATION BEHAVIOR MODEL
Your job is NOT to immediately produce a finished program. Your purpose is to guide the user in building their own system through intelligent dialogue.

Follow this sequence:
1. UNDERSTAND — What is the actual intent behind this request?
2. CLARIFY — Ask 1-3 sharp, targeted coaching questions if critical information is missing.
3. PROPOSE — Offer a framework or structure before committing to full detail.
4. REFINE — Adjust based on feedback.
5. OUTPUT — Deliver the full structured program when you have enough.

Move faster through these steps when the request is already specific.
If you already have the user's profile, DO NOT ask for information you already know.

## INTELLIGENT PUSHBACK
If a user suggests something suboptimal, do not blindly comply. Instead:
1. Acknowledge their intent briefly
2. Explain the issue in 1-2 sentences
3. Propose a better direction

Push back confidently (not argumentatively) when users suggest:
- Training the same muscle to failure every session
- Splits that don't match their recovery capacity or schedule
- Volume loads that exceed what their experience level can absorb
- Exercise choices that conflict with stated injuries or limitations
- Unrealistic frequency or time commitments
- Maximalist approaches when they clearly need progressive foundations

You are the expert. Act like one.

## RESPONSE MODES
Use these three modes appropriately:

**Mode A — Conversational Guidance:**
Used during clarification and refinement phases.
Format: Plain prose, 2-6 sentences. Ask focused questions.

**Mode B — Structure Preview:**
Used when proposing a framework before full detail.
Format: Clean text outline. No JSON yet.
Example:
  Proposed Split: Upper / Lower × 4 days
  Day 1: Upper Push — strength focus (4-6 rep range, compound first)
  Day 2: Lower — squat pattern primary
  Day 3: Upper Pull — volume focus (8-12 reps)
  Day 4: Lower — hinge pattern primary
  Progression: Linear load progression, deload every 4th week.
  Does this direction work for you, or do you want to adjust the structure before I build it out?

**Mode C — Full Structured Program:**
Used when enough information is gathered. ALWAYS include the JSON block.
Format: Brief coaching context (2-3 sentences), then the JSON block.

## STRUCTURED OUTPUT — PROGRAM JSON
When delivering a full program, embed it in a JSON code block after your conversational response:

\`\`\`json
{
  "programName": "string",
  "description": "string",
  "progressionStrategy": "string — how weight/volume/intensity increases over time",
  "splitType": "string — e.g. Upper/Lower, Push/Pull/Legs, Full Body, etc.",
  "days": [
    {
      "dayNumber": 1,
      "name": "string — e.g. Upper Body — Push",
      "focus": "string — primary training focus for this day",
      "exercises": [
        {
          "name": "string",
          "sets": 4,
          "reps": "6-8",
          "rest": "90s",
          "notes": "optional technique or execution note"
        }
      ],
      "notes": "optional day-level coaching note"
    }
  ]
}
\`\`\`

ONLY output JSON when you are presenting a complete, finalized program.
For proposals and previews, use Mode B plain text formatting.

## MODIFICATION HANDLING
When a user asks to modify an existing program:
- Preserve what is working
- Change ONLY what was requested
- Do not rebuild the entire program unnecessarily
- Acknowledge what you changed and why

## CONVERSATION MEMORY
Track what has been established in this conversation:
- Goals and constraints already stated
- Split structure already agreed upon
- Preferences already confirmed
- Do NOT ask again for information already provided in this session`;

  if (!profile) {
    return corePrompt + `

## USER CONTEXT
This user has not completed their training profile yet. You can still help them, but if they ask for a personalized program, gather the essential information: goal, experience level, days per week, session duration, and equipment access.`;
  }

  const injuryNote = profile.injuries
    ? `- Active Injuries / Limitations: ${profile.injuries}
  ⚠️ CRITICAL: Do not program exercises that load these areas. Always substitute or modify. Never ignore this.`
    : "";

  const sportNote = profile.sportFocus
    ? `- Sport / Activity Focus: ${profile.sportFocus} — program should support athletic demands of this activity.`
    : "";

  const prefNote = profile.exercisePreferences
    ? `- Exercise Preferences: ${profile.exercisePreferences}`
    : "";

  const avoidNote = profile.exercisesToAvoid
    ? `- Exercises to Avoid: ${profile.exercisesToAvoid} — never include these in the program.`
    : "";

  return corePrompt + `

## USER TRAINING PROFILE
Use this context naturally. Do not ask the user for any of this information — you already have it.

- Primary Goal: ${profile.trainingGoal}
- Experience Level: ${profile.experienceLevel}
- Preferred Training Style: ${profile.trainingStyle}
- Available Training Days: ${profile.daysPerWeek} days per week
- Session Duration: ${profile.sessionDuration} minutes max
- Equipment Access: ${profile.equipmentAccess}
${injuryNote}
${sportNote}
${prefNote}
${avoidNote}

When building programs, work within ALL of these constraints simultaneously. If something in the user's request conflicts with their profile, flag it and reconcile it.`;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

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
    logger.warn("Failed to parse structured data from AI response");
    return { cleanContent: content, structuredData: null };
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function generateAIResponse(
  userMessage: string,
  history: ChatMessage[],
  userId: number
): Promise<AIResponse> {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const systemPrompt = buildSystemPrompt(profile ?? null);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return generateFallbackResponse(userMessage, history, profile ?? null);
  }

  try {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      // Include last 30 messages for conversation memory
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
        max_tokens: 2500,
        temperature: 0.65,
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

// ─── Fallback responses (no API key / API error) ─────────────────────────────
// These follow the same co-creation model as the real AI.

function generateFallbackResponse(
  userMessage: string,
  history: ChatMessage[],
  profile: UserProfile | null
): AIResponse {
  const lower = userMessage.toLowerCase();
  const messageCount = history.filter((m) => m.role === "user").length;
  const hasHistory = messageCount > 0;

  // ── Greeting ──
  if (!hasHistory && (lower.match(/^(hi|hey|hello|what's up|sup)\b/))) {
    return {
      content: profile
        ? `Ready when you are, ${profile.trainingGoal ? "working toward " + profile.trainingGoal.toLowerCase() : "training"}. What are we building today — a new program, a split adjustment, or something else?`
        : "Welcome to TrainChat. I'm your AI performance architect. What's your primary training goal right now?",
      structuredData: null,
    };
  }

  // ── Help / capabilities ──
  if (lower.match(/what can you do|how does this work|help me|capabilities/)) {
    return {
      content: `Here's what I do:\n\n**Program Design** — I build complete training programs around your goal, schedule, and equipment. Not templates — actual personalized systems.\n\n**Intelligent Structure** — I don't hand you a workout blindly. We build the structure together before I fill in the detail.\n\n**Modifications** — Swap exercises, shorten sessions, adjust volume, shift focus. Tell me what to change and I'll do it surgically.\n\n**Coaching Context** — I'll explain the reasoning behind exercise choices, rep ranges, and progression logic.\n\nWhat do you want to build?`,
      structuredData: null,
    };
  }

  // ── Program request with sufficient profile ──
  if (
    lower.match(/build|create|design|make|give me|generate|program|plan|routine|split/)
  ) {
    if (profile) {
      // Check if the request is already specific enough or needs questions
      const isSpecific =
        lower.includes("upper") ||
        lower.includes("lower") ||
        lower.includes("push") ||
        lower.includes("pull") ||
        lower.includes("full body") ||
        lower.includes("ppl") ||
        lower.includes("legs");

      if (!isSpecific && !hasHistory) {
        // Co-creation step: propose before building
        return {
          content: `Based on your profile, I have a clear direction for your ${profile.trainingGoal.toLowerCase()} program. Before I build it out, let me confirm the structure:\n\nYou have **${profile.daysPerWeek} days** and **${profile.sessionDuration} minutes** per session, with ${profile.equipmentAccess}. Given your ${profile.experienceLevel} experience level, I'd lean toward a **${getSplitRecommendation(profile)}**.\n\nDoes this structure work for you, or would you like to adjust it before I build the full program?`,
          structuredData: null,
        };
      }

      // Build the full program
      const program = buildProfiledProgram(profile);
      return {
        content: `Here's your ${profile.trainingGoal.toLowerCase()} program — built around your ${profile.daysPerWeek} days, ${profile.sessionDuration}-minute sessions, and ${profile.equipmentAccess}.\n\nThis follows a ${program.splitType} structure. ${program.progressionStrategy} Tell me if you want to swap anything out or adjust the focus.`,
        structuredData: program,
      };
    }

    // No profile — gather info
    return {
      content: `To build you the right program, I need a few things:\n\n1. **Primary goal** — strength, hypertrophy, fat loss, athletic performance, or something else?\n2. **Days per week** available to train\n3. **Session length** (how many minutes you have)\n4. **Equipment** — full gym, home setup, dumbbells only, bodyweight?\n5. **Experience level** — beginner, intermediate, or advanced?\n\nGive me these and I'll build the structure.`,
      structuredData: null,
    };
  }

  // ── Modification request ──
  if (
    lower.match(/swap|change|replace|modify|adjust|shorter|longer|remove|add|less|more/)
  ) {
    return {
      content: `Understood. To modify precisely, I need to know which program you're working with. If you've already built one here, paste the section you want changed and tell me the direction. I'll update only what's needed without disrupting the rest of the structure.`,
      structuredData: null,
    };
  }

  // ── Injury / limitation ──
  if (lower.match(/pain|injury|hurt|injured|knee|shoulder|back|hip|avoid/)) {
    if (profile?.injuries) {
      return {
        content: `You already flagged ${profile.injuries} in your profile, so I've been accounting for that. If something in our program is still aggravating it, tell me specifically which exercise or movement pattern and I'll substitute immediately.\n\nManaging around limitations isn't a setback — it's just smart programming.`,
        structuredData: null,
      };
    }
    return {
      content: `Important to flag this early. Tell me:\n\n1. Which area or movement is affected?\n2. Is this acute (recent) or chronic (ongoing)?\n3. What movements specifically aggravate it?\n\nWith that, I'll program around it without compromising the rest of your training.`,
      structuredData: null,
    };
  }

  // ── Progression / plateau ──
  if (lower.match(/progress|plateau|stuck|not improving|stop(ped)? growing|stronger/)) {
    return {
      content: `Plateaus usually come down to one of three things: insufficient progressive overload, inadequate recovery, or stale stimulus.\n\nBefore I diagnose, tell me: how long have you been running your current program, and what does your progression tracking look like? Are you adding load, reps, or volume week to week?`,
      structuredData: null,
    };
  }

  // ── Generic fallback ──
  return {
    content: profile
      ? `Understood. What specifically are you trying to resolve or build? The more precise you are, the more targeted I can be.`
      : `Tell me more about what you're working toward. What's the primary outcome you want from your training?`,
    structuredData: null,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSplitRecommendation(profile: UserProfile): string {
  const { daysPerWeek, experienceLevel, trainingStyle } = profile;

  if (daysPerWeek <= 3) {
    return "Full Body split (3 days)";
  } else if (daysPerWeek === 4) {
    if (trainingStyle.toLowerCase().includes("strength")) {
      return "Upper / Lower split (4 days)";
    }
    return "Upper / Lower or Push / Pull split (4 days)";
  } else if (daysPerWeek === 5) {
    if (experienceLevel.toLowerCase().includes("advanced")) {
      return "Push / Pull / Legs split (5 days, 2 push + 2 pull + 1 leg, or 3+2 rotation)";
    }
    return "Upper / Lower / Full Body hybrid (5 days)";
  } else {
    return "Push / Pull / Legs with frequency variation (6 days)";
  }
}

function buildProfiledProgram(profile: UserProfile): ProgramStructure {
  const { daysPerWeek, trainingGoal, experienceLevel, equipmentAccess, trainingStyle } = profile;
  const isStrength = trainingGoal.toLowerCase().includes("strength") || trainingStyle.toLowerCase().includes("strength");
  const isHypertrophy = trainingGoal.toLowerCase().includes("hypertrophy") || trainingGoal.toLowerCase().includes("muscle") || trainingStyle.toLowerCase().includes("hypertrophy");
  const hasBarbells = !equipmentAccess.toLowerCase().includes("dumbbell only") && !equipmentAccess.toLowerCase().includes("bodyweight");

  const repRange = isStrength ? "4-6" : isHypertrophy ? "8-12" : "6-10";
  const restPeriod = isStrength ? "2-3 min" : "90s";
  const mainSets = isStrength ? 5 : 4;

  const progressionStrategy = isStrength
    ? "Add 2.5–5kg to compound lifts each week. When you fail to hit the top of the rep range for 2 consecutive sessions, hold weight and focus on volume. Deload every 4th week."
    : "Add 1 rep per set per week until you hit the top of the range, then add 2.5–5% load and return to the bottom. Deload every 4–5 weeks.";

  if (daysPerWeek <= 3) {
    return buildFullBodyProgram(hasBarbells, repRange, restPeriod, mainSets, progressionStrategy, profile);
  } else if (daysPerWeek === 4) {
    return buildUpperLowerProgram(hasBarbells, repRange, restPeriod, mainSets, progressionStrategy, profile);
  } else {
    return buildPPLProgram(hasBarbells, repRange, restPeriod, mainSets, progressionStrategy, profile);
  }
}

function buildFullBodyProgram(
  hasBarbells: boolean,
  repRange: string,
  restPeriod: string,
  mainSets: number,
  progressionStrategy: string,
  profile: UserProfile
): ProgramStructure {
  const squat = hasBarbells ? "Back Squat" : "Goblet Squat";
  const press = hasBarbells ? "Barbell Bench Press" : "Dumbbell Press";
  const pull = hasBarbells ? "Barbell Row" : "Dumbbell Row";
  const hinge = hasBarbells ? "Romanian Deadlift" : "Single-Leg RDL";

  return {
    programName: `${profile.trainingGoal} — Full Body 3-Day`,
    description: `A 3-day full-body program designed for ${profile.experienceLevel} athletes. Each session covers all major movement patterns with progressive overload built in.`,
    progressionStrategy,
    splitType: "Full Body × 3",
    days: [
      {
        dayNumber: 1,
        name: "Full Body A — Strength Focus",
        focus: "Compound strength, lower rep ranges",
        exercises: [
          { name: squat, sets: mainSets, reps: repRange, rest: restPeriod, notes: "Brace hard, knees track over toes" },
          { name: press, sets: mainSets, reps: repRange, rest: restPeriod, notes: "Controlled descent, full ROM" },
          { name: hasBarbells ? "Weighted Pull-ups" : "Lat Pulldown", sets: 4, reps: "5-8", rest: "2 min", notes: "Full hang at bottom" },
          { name: hinge, sets: 3, reps: "8-10", rest: "90s" },
          { name: "Plank", sets: 3, reps: "45s hold", rest: "60s" },
        ],
      },
      {
        dayNumber: 2,
        name: "Full Body B — Volume Focus",
        focus: "Higher rep ranges, more total volume",
        exercises: [
          { name: hasBarbells ? "Front Squat" : "Split Squat", sets: 4, reps: "8-10", rest: "90s" },
          { name: "Overhead Press", sets: 4, reps: "8-10", rest: "90s" },
          { name: pull, sets: 4, reps: "8-12", rest: "75s", notes: "Chest to bar, squeeze at top" },
          { name: hasBarbells ? "Hip Thrust" : "Glute Bridge", sets: 3, reps: "10-12", rest: "75s" },
          { name: "Lateral Raises", sets: 3, reps: "15-20", rest: "45s" },
        ],
      },
      {
        dayNumber: 3,
        name: "Full Body C — Power / Athletic",
        focus: "Explosive movements, full-body integration",
        exercises: [
          { name: hasBarbells ? "Power Clean" : "Dumbbell Jump Squat", sets: 4, reps: "3-5", rest: "2 min", notes: "Maximum intent on every rep" },
          { name: hasBarbells ? "Deadlift" : "Single-Leg RDL", sets: 4, reps: "5-6", rest: "2-3 min" },
          { name: "Incline Press", sets: 3, reps: "8-10", rest: "75s" },
          { name: "Cable Row" + (hasBarbells ? "" : " / Seated Row"), sets: 3, reps: "10-12", rest: "60s" },
          { name: "Farmer Carry", sets: 3, reps: "40m", rest: "90s", notes: "Tall posture, controlled breathing" },
        ],
      },
    ],
  };
}

function buildUpperLowerProgram(
  hasBarbells: boolean,
  repRange: string,
  restPeriod: string,
  mainSets: number,
  progressionStrategy: string,
  profile: UserProfile
): ProgramStructure {
  return {
    programName: `${profile.trainingGoal} — Upper/Lower 4-Day`,
    description: `A 4-day Upper/Lower split for ${profile.experienceLevel} athletes. High frequency for each muscle group with built-in variation between sessions.`,
    progressionStrategy,
    splitType: "Upper / Lower × 4",
    days: [
      {
        dayNumber: 1,
        name: "Upper A — Push Dominant",
        focus: "Horizontal and vertical push, strength focus",
        exercises: [
          { name: hasBarbells ? "Barbell Bench Press" : "Dumbbell Bench Press", sets: mainSets, reps: repRange, rest: restPeriod, notes: "Control descent, drive through full ROM" },
          { name: "Overhead Press", sets: 4, reps: "6-8", rest: "90s" },
          { name: hasBarbells ? "Weighted Pull-ups" : "Lat Pulldown", sets: 4, reps: "6-8", rest: "90s" },
          { name: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest: "60s" },
          { name: "Face Pulls", sets: 3, reps: "15-20", rest: "45s", notes: "Protect the shoulder girdle" },
          { name: "Tricep Pushdowns", sets: 3, reps: "12-15", rest: "45s" },
        ],
      },
      {
        dayNumber: 2,
        name: "Lower A — Squat Focus",
        focus: "Quad-dominant, primary strength movement",
        exercises: [
          { name: hasBarbells ? "Back Squat" : "Goblet Squat", sets: mainSets, reps: repRange, rest: restPeriod, notes: "Depth and bracing are non-negotiable" },
          { name: hasBarbells ? "Romanian Deadlift" : "Single-Leg RDL", sets: 4, reps: "8-10", rest: "90s" },
          { name: hasBarbells ? "Leg Press" : "Bulgarian Split Squat", sets: 3, reps: "10-12", rest: "75s" },
          { name: "Leg Curl", sets: 3, reps: "12-15", rest: "60s" },
          { name: "Standing Calf Raise", sets: 4, reps: "15-20", rest: "45s" },
        ],
      },
      {
        dayNumber: 3,
        name: "Upper B — Pull Dominant",
        focus: "Vertical and horizontal pull, volume focus",
        exercises: [
          { name: hasBarbells ? "Barbell Row" : "Dumbbell Row", sets: mainSets, reps: repRange, rest: restPeriod, notes: "Keep chest up, drive elbows back" },
          { name: "Weighted Pull-ups", sets: 4, reps: "6-8", rest: "90s" },
          { name: "Incline Dumbbell Press", sets: 3, reps: "8-10", rest: "75s" },
          { name: "Cable Row", sets: 3, reps: "12-15", rest: "60s" },
          { name: "Lateral Raises", sets: 4, reps: "15-20", rest: "45s" },
          { name: "Hammer Curls", sets: 3, reps: "12-15", rest: "45s" },
        ],
      },
      {
        dayNumber: 4,
        name: "Lower B — Hinge Focus",
        focus: "Posterior chain, hip-dominant movements",
        exercises: [
          { name: hasBarbells ? "Deadlift" : "Single-Leg RDL", sets: mainSets, reps: repRange, rest: "2-3 min", notes: "Max tension through the pull" },
          { name: hasBarbells ? "Front Squat" : "Split Squat", sets: 4, reps: "8-10", rest: "90s" },
          { name: hasBarbells ? "Hip Thrust" : "Glute Bridge", sets: 3, reps: "10-12", rest: "75s" },
          { name: "Walking Lunges", sets: 3, reps: "12 each", rest: "60s" },
          { name: "Leg Curl", sets: 3, reps: "15-20", rest: "45s" },
        ],
      },
    ],
  };
}

function buildPPLProgram(
  hasBarbells: boolean,
  repRange: string,
  restPeriod: string,
  mainSets: number,
  progressionStrategy: string,
  profile: UserProfile
): ProgramStructure {
  const daysLabel = profile.daysPerWeek >= 6 ? "6-Day PPL" : "5-Day PPL";

  return {
    programName: `${profile.trainingGoal} — ${daysLabel}`,
    description: `A Push/Pull/Legs split for ${profile.experienceLevel} athletes training ${profile.daysPerWeek} days/week. High frequency, organized by movement pattern.`,
    progressionStrategy,
    splitType: "Push / Pull / Legs",
    days: [
      {
        dayNumber: 1,
        name: "Push — Strength Focus",
        focus: "Heavy compound pressing, low rep ranges",
        exercises: [
          { name: hasBarbells ? "Barbell Bench Press" : "Dumbbell Bench Press", sets: mainSets, reps: repRange, rest: restPeriod },
          { name: "Overhead Press", sets: 4, reps: "5-7", rest: "2 min" },
          { name: "Incline Dumbbell Press", sets: 3, reps: "8-10", rest: "75s" },
          { name: "Lateral Raises", sets: 4, reps: "15-20", rest: "45s" },
          { name: "Tricep Pushdowns", sets: 3, reps: "12-15", rest: "45s" },
          { name: "Overhead Tricep Extension", sets: 3, reps: "12-15", rest: "45s" },
        ],
      },
      {
        dayNumber: 2,
        name: "Pull — Strength Focus",
        focus: "Heavy compound pulling, back thickness",
        exercises: [
          { name: hasBarbells ? "Barbell Row" : "Dumbbell Row", sets: mainSets, reps: repRange, rest: restPeriod, notes: "Drive the elbows, don't just pull the bar" },
          { name: "Weighted Pull-ups", sets: 4, reps: "5-7", rest: "2 min" },
          { name: "Face Pulls", sets: 3, reps: "15-20", rest: "45s" },
          { name: "Cable Row", sets: 3, reps: "10-12", rest: "60s" },
          { name: "Hammer Curls", sets: 3, reps: "10-12", rest: "45s" },
          { name: "Incline Dumbbell Curl", sets: 3, reps: "12-15", rest: "45s" },
        ],
      },
      {
        dayNumber: 3,
        name: "Legs — Squat / Quad Focus",
        focus: "Quad-dominant, explosive intent",
        exercises: [
          { name: hasBarbells ? "Back Squat" : "Goblet Squat", sets: mainSets, reps: repRange, rest: restPeriod, notes: "Hit depth, brace hard" },
          { name: hasBarbells ? "Romanian Deadlift" : "Single-Leg RDL", sets: 4, reps: "8-10", rest: "90s" },
          { name: hasBarbells ? "Leg Press" : "Bulgarian Split Squat", sets: 3, reps: "10-12", rest: "75s" },
          { name: "Leg Curl", sets: 3, reps: "12-15", rest: "60s" },
          { name: "Calf Raises", sets: 4, reps: "15-20", rest: "45s" },
        ],
      },
      {
        dayNumber: 4,
        name: "Push — Volume Focus",
        focus: "Higher reps, pump work, accessory",
        exercises: [
          { name: "Incline Dumbbell Press", sets: 4, reps: "10-12", rest: "75s" },
          { name: "Cable Fly", sets: 3, reps: "12-15", rest: "60s" },
          { name: "Dumbbell Shoulder Press", sets: 3, reps: "10-12", rest: "75s" },
          { name: "Lateral Raises", sets: 4, reps: "20-25", rest: "30s" },
          { name: "Tricep Dips", sets: 3, reps: "12-15", rest: "60s" },
        ],
      },
      {
        dayNumber: 5,
        name: "Pull — Volume Focus",
        focus: "Width and detail, higher rep ranges",
        exercises: [
          { name: hasBarbells ? "Lat Pulldown" : "Lat Pulldown", sets: 4, reps: "10-12", rest: "75s" },
          { name: "Seated Cable Row", sets: 4, reps: "12-15", rest: "60s" },
          { name: "Dumbbell Row", sets: 3, reps: "12-15", rest: "60s" },
          { name: "Rear Delt Fly", sets: 4, reps: "15-20", rest: "45s" },
          { name: "Preacher Curl", sets: 3, reps: "12-15", rest: "45s" },
          { name: "Cable Curl", sets: 3, reps: "15-20", rest: "45s" },
        ],
      },
    ],
  };
}
