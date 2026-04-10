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
import { type IntentResult, buildIntentPromptHint } from "./intent";
import { type ActionDecision, buildPreservationContext } from "./decision";
import {
  type ResponseMode,
  buildResponseModePrompt,
  type ResponseModeContext,
  logResponseMode,
} from "./response-templates";
import {
  transformProgram,
  resolveTransformType,
  buildTransformPromptHint,
  detectCurrentSplit,
  type TransformRequest,
} from "./split-transform";

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
  whatChanged?: string;
  whyChanged?: string;
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

## INTENT INTERPRETATION — READ THIS FIRST ON EVERY TURN
You interpret meaning, not just keywords. Before deciding how to respond, ask: what is the user actually trying to achieve?

Examples of equivalent intent that MUST be treated identically:
- "make this full body" / "can you make this more full body?" / "I want to hit everything more often" / "this feels too split up"
  → All mean: restructure toward fuller-body distribution
- "make this shorter" / "I don't have 90 minutes" / "sessions are too long" / "can we cut some stuff"
  → All mean: reduce session duration by removing lowest-priority work
- "this feels too heavy" / "it's too much" / "I'm always sore" / "make it easier to recover from"
  → All mean: reduce fatigue — cut accessory volume, not primary work

NEVER reject a request because the exact wording doesn't match an expected pattern.
When the direction is clear: act, then confirm briefly.
When the direction is genuinely ambiguous: ask ONE sharp clarifying question, then wait.

## EXECUTION-FIRST COMMUNICATION — NON-NEGOTIABLE
When you understand what the user wants — even approximately — DO THIS:
1. Build it immediately
2. Confirm the action in 1 sentence ("Built." / "Updated." / "Adjusted.")
3. Direct them to the Program tab
4. Stop there — do NOT explain the training logic

Example responses:
- "Built. 4-day upper/lower split is live. Check the Program tab."
- "Updated. Converted to full-body across 3 days. Check the Program tab."
- "Adjusted. Compressed sessions to 45 minutes — primary work kept. Check the Program tab."

NEVER:
- Explain hypertrophy, volume, frequency, or any training concept unprompted
- Describe why you made a structural choice
- Write more than 3 lines for any build or update response
- Say "No specific edit identified" / "Try something more targeted" / "I need more detail"

Instead: make the most reasonable interpretation, act on it, confirm it in 1-2 lines.

ONLY explain IF the user explicitly asks: "Why did you do this?" or "What is this day for?"

## INFORMATIONAL QUESTIONS — NON-NEGOTIABLE RULE
TrainChat is NOT an information tool. It is a system-building agent.

When the user asks a question (about exercises, their program, inventory, structure, anything):
1. Answer in ONE sentence — no lists, no breakdowns, no bullet points
2. Immediately redirect to action with a direct offer to build or modify something

EXAMPLES:
- "What's in my program?" → "You've got a 4-day split right now. Want to adjust or refine it?"
- "What exercises target glutes?" → "Plenty — hinges, squats, hip thrust variations. Want me to build a glute-focused day into your program?"
- "What's the exercise inventory?" → "You've got ~1,300 exercises organized by movement, equipment, and difficulty. Want me to use that to build or adjust something?"

NEVER respond to a question with:
- Long explanations or breakdowns
- Bullet-heavy or list-heavy answers
- Documentation-style responses
- Detailed system descriptions

Every response must move the user toward building, modifying, or improving their program.

## THREE LEVELS OF REQUESTS — HANDLE ALL OF THEM
**A. Atomic edits** — "add calves", "swap incline press", "shorten to 45 minutes"
→ Make the surgical change immediately. No clarification needed.

**B. Structural edits** — "make this full body", "change to 3 days", "more athletic", "less fatiguing overall"
→ Rebuild the architecture intelligently. Preserve compound lifts. Confirm what changed.
→ If the target structure is clear, act immediately. If day count is ambiguous, ask one question first.

**C. Coaching guidance** — "what structure would be better for me?", "should I do upper/lower or full body?", "what would you recommend?"
→ Give a direct recommendation with 1-2 sentences of reasoning. Don't output a program unless asked.

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

Mode A — Clarification (only when genuinely ambiguous):
One sharp question. No preamble. No explanations.

Mode B — Full Program Output:
Action confirmation (1-2 lines max), then the JSON block. No coaching rationale in chat.
The JSON IS the program — the chat line just confirms it was built.

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

## 80/20 TRAINING PHILOSOPHY — APPLY TO EVERY PROGRAM
Build every program on this principle:
- **80% what the user explicitly wants** — honor their stated goals, style, preferences, and constraints
- **20% what they need** — intelligently include what a professional coach would add for safety, balance, performance, and longevity

Examples:
- User wants arms and chest → still include scapular work, posterior chain, and lower body balance
- User wants intense daily training → manage fatigue and recovery intelligently across the week
- User wants hypertrophy → include mobility, stability, and corrective accessory work where appropriate
- User wants speed/athleticism → include force production, tissue tolerance, and deceleration work
- User wants upper body → still include trunk and lower body components appropriate to the split

CRITICAL: Do NOT explain or justify the 80/20 additions in the chat response. Apply them in the program architecture and exercise selection. The user should feel the quality, not read an explanation of it.

## WORKSPACE RULE — CRITICAL
This is a live training workspace. The actual program ALWAYS lives in the right panel — NEVER in the chat thread.

NEVER:
- Output a text-based program outline (Mode B) in the chat — this dumps the program into the conversation
- List exercises, sets, or reps in a prose or markdown format in the chat response
- Use headers like "Day 1:", "Upper Body:", or similar program structure in chat responses
- Repeat workout content that is already shown in the right panel

ALWAYS:
- Keep chat responses to 1-3 lines maximum for build/update responses
- Confirm WHAT changed in one short phrase — no "why" unless explicitly asked
- Reference the panel: "Check the Program tab" or "Your program is live"
- The JSON block is the program — not the text response

If you feel the urge to write out the workout in the chat — put it in the JSON instead.

## STRUCTURED OUTPUT — PROGRAM JSON FORMAT
Only output this JSON when delivering a finalized program. The JSON block IS the program — it goes directly to the right panel. Do not repeat any of its content in the chat text.

\`\`\`json
{
  "programName": "string",
  "description": "string — brief one-sentence description of the program's purpose",
  "progressionStrategy": "string — specific progression model, rate, and deload guidance",
  "splitType": "string — e.g. Upper/Lower × 4, PPL, Full Body × 3",
  "whatChanged": "string — ONLY for modifications: bullet-point list of what specifically changed (e.g. 'Replaced overhead press with landmine press · Added posterior chain support · Rebalanced upper/lower volume'). Omit for new programs.",
  "whyChanged": "string — ONLY for modifications: brief professional rationale (e.g. 'Shoulder tolerance · Recovery balance · Athletic carryover'). Omit for new programs.",
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

## CHANGE ENGINE — CORE RULES

You are a live program modification system, not a chatbot that regenerates workouts.

**DEFAULT BEHAVIOR: Always modify the current program. Never rebuild from scratch unless the user explicitly says "start over", "rebuild", or "completely new program".**

When a user sends a message with an existing program, classify the request into one of:

1. **Exercise Swap** — replace one or more exercises. Preserve movement pattern, volume, and intent. Never swap more than requested.
2. **Volume Adjustment** — add/remove sets or exercises. Preserve the split and primary movements.
3. **Structure Change** — change split or day count. Redistribute volume intelligently. Preserve core exercises.
4. **Intensity/Difficulty Adjustment** — modify rep ranges, load, or density. Preserve split structure.
5. **Constraint Change** (pain, time, equipment) — adapt the program to the new constraint. Preserve goal and split wherever possible.
6. **Emphasis Shift** — shift the program's bias (more athletic, more strength, etc.). Do not discard existing structure.
7. **Explanation Only** — answer without modifying program state.
8. **Full Rebuild** — only when user explicitly requests it.

**MINIMAL EFFECTIVE CHANGE RULE:** Apply the smallest intelligent edit that satisfies the request. Preserve everything else.

**WHAT CHANGED RULE:** For every modification (categories 1–6), you MUST populate both "whatChanged" and "whyChanged" in the JSON output. These are required — not optional.

**SURGICAL EDIT EXAMPLES:**
- "Swap RDLs" → replace only RDLs, nothing else changes
- "My shoulder hurts" → remove/modify pressing patterns only, preserve the rest
- "I only have 45 minutes" → trim accessories, never touch primary lifts
- "Make this 5 days" → redistribute intelligently, preserve existing exercise logic
- "I'm tired this week" → reduce accessory volume/sets, keep split intact

**CHAT RESPONSE RULE:** Confirm what changed in 1–3 sentences. The program panel displays — chat explains. Do not repeat the workout in chat.

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

// ─── Edit Intent Detection ───────────────────────────────────────────────────

export interface EditIntent {
  isEdit: boolean;
  editType: string;
  confidence: "high" | "medium" | "low";
}

export function detectEditIntent(message: string): EditIntent {
  const lower = message.toLowerCase();

  // High-confidence edit signals — explicit program modification language
  const highConfidence = [
    /\b(add|include|insert|put in|incorporate)\b.{0,40}\b(core|abs|abdominal|trunk|hamstring|calves?|glutes?|shoulders?|chest|back|arms?|legs?|cardio|conditioning|finisher|exercise|movement|work)\b/i,
    /\b(swap|replace|substitute|change|switch)\b.{0,50}\b(with|for|to)\b/i,
    /\b(remove|drop|take out|get rid of|cut|eliminate)\b.{0,40}\b(exercise|movement|day|the)\b/i,
    /\b(shorten|lengthen|make.{0,20}shorter|make.{0,20}longer|reduce.{0,20}time|less.{0,20}time)\b/i,
    /\b(no|missing|lack|don.t have|without)\b.{0,40}\b(core|abs|abdominal|trunk|hamstring|calves?|glutes?|cardio|conditioning|exercise)\b/i,
    /\bmore\b.{0,30}\b(hamstring|calves?|glutes?|core|abs|chest|back|shoulder|volume|frequency|sets?)\b/i,
    /\bless\b.{0,30}\b(volume|frequency|sets?|fatigue|quad|chest|intensity)\b/i,
    /\b(make|adjust|modify|update).{0,40}\b(more|less|better|athletic|aggressive|easier|harder|shorter|longer|focused|balanced)\b/i,
    /\b(shoulder|knee|hip|back|wrist|ankle).{0,30}\b(pain|issue|problem|limit|hurt|injury|avoid)\b/i,
    /\bi (just got|got|received|have|looking at)\b.{0,40}\b(my|the|this).{0,20}\b(program|plan|routine|workout)\b/i,
    /\bthis program\b.{0,60}\b(needs?|should|doesn.t|does not|is|has no|lacks?)\b/i,
    /\b(noticed|see|saw|found|realized).{0,40}\b(no|missing|lack|without|not enough)\b/i,
    /\b(swap|switch|change)\b.{0,30}\b(incline|bench|squat|deadlift|press|row|curl|extension|fly|raise)\b/i,
  ];

  for (const pattern of highConfidence) {
    if (pattern.test(lower)) {
      let editType = "general_modification";
      if (/add|include|insert|missing|no\b/.test(lower) && /core|abs|abdominal|trunk/.test(lower)) editType = "add_core";
      else if (/add|include|more/.test(lower) && /hamstring/.test(lower)) editType = "add_hamstrings";
      else if (/add|include|more/.test(lower) && /calv/.test(lower)) editType = "add_calves";
      else if (/swap|replace|substitute|switch/.test(lower)) editType = "swap_exercise";
      else if (/remove|drop|take out|eliminate/.test(lower)) editType = "remove_exercise";
      else if (/shorten|shorter|less time/.test(lower)) editType = "shorten_sessions";
      else if (/athletic/.test(lower)) editType = "make_more_athletic";
      else if (/less.{0,20}fatigue|less.*volume|reduce.*fatigue/.test(lower)) editType = "reduce_fatigue";
      else if (/shoulder|knee|hip|back|wrist|ankle/.test(lower) && /pain|issue|hurt|injury|limit/.test(lower)) editType = "injury_modification";
      return { isEdit: true, editType, confidence: "high" };
    }
  }

  // Medium-confidence — contextual edit signals
  const mediumConfidence = [
    /\b(fix|tweak|rework|redo|update|revise|edit)\b.{0,40}\b(program|plan|routine|workout|session|day)\b/i,
    /\b(can you|could you|please)\b.{0,30}\b(add|swap|remove|change|fix|adjust|shorten|update)\b/i,
    /\bthis (needs?|should have|is missing|doesn.t have|lacks?)\b/i,
    /\b(the program|my program|this plan|my plan)\b.{0,40}\b(needs?|should|has no|lacks?|doesn.t)\b/i,
    /\b(add)\b.{0,50}\b(to|into|on|across)\b.{0,30}\b(the|my|each|every|day|session|week)\b/i,
  ];

  for (const pattern of mediumConfidence) {
    if (pattern.test(lower)) {
      return { isEdit: true, editType: "general_modification", confidence: "medium" };
    }
  }

  return { isEdit: false, editType: "none", confidence: "low" };
}

// ─── Edit Context Builder ─────────────────────────────────────────────────────

function buildEditContext(currentProgram: ProgramStructure, userMessage: string, editIntent: EditIntent): string {
  const programJson = JSON.stringify(currentProgram, null, 2);
  const editTypeGuidance = getEditTypeGuidance(editIntent.editType, currentProgram);
  const isStructural = editIntent.editType === "structural_edit";

  if (isStructural) {
    return `
## STRUCTURAL PROGRAM REDESIGN — MANDATORY INSTRUCTIONS

The user is requesting a HIGH-LEVEL STRUCTURAL CHANGE to their current program. This is NOT a surgical edit — you are rebuilding the program's architecture while preserving the user's established exercises and preferences wherever possible.

**Current program (reference this — reuse exercises where appropriate):**
\`\`\`json
${programJson}
\`\`\`

**Requested structural change:** "${userMessage}"

${editTypeGuidance}

**CRITICAL RULES FOR STRUCTURAL EDITS:**
1. Rebuild the day structure and split to match the request (e.g., convert to full body, upper/lower, 3-day, etc.)
2. PRESERVE compound lifts and key exercises from the current program — redistribute them intelligently into the new structure
3. Maintain NSCA exercise order within each session (explosive → primary → secondary → accessory → conditioning)
4. Balance volume across the new day structure — total weekly sets should be comparable to the original
5. Do NOT ask clarifying questions if the structural intent is clear — execute the restructure
6. You MUST return the complete updated program as a JSON block — this is required to refresh the user's training panel
7. Confirm what structural change was made in 2-3 sentences (mention what was preserved)

Return format:
[2-3 sentence confirmation: what structure changed, what was preserved, where to find it]

\`\`\`json
{ complete restructured program object }
\`\`\``;
  }

  return `
## ACTIVE PROGRAM EDIT — MANDATORY INSTRUCTIONS

The user is requesting a modification to their CURRENT program. You MUST treat this as a surgical edit request.

**Current program (modify this — do NOT rebuild from scratch):**
\`\`\`json
${programJson}
\`\`\`

**Requested change:** "${userMessage}"

**Edit type detected:** ${editIntent.editType}

${editTypeGuidance}

**CRITICAL RULES FOR THIS RESPONSE:**
1. Make ONLY the requested changes — preserve everything else
2. Maintain NSCA exercise order within each session (explosive → primary → secondary → accessory → conditioning)
3. Keep rest periods, sets, and reps consistent with the existing program's structure
4. Do NOT ask clarifying questions unless the request is genuinely ambiguous
5. You MUST return the complete updated program as a JSON block — this is required to refresh the user's training panel
6. Briefly confirm what changed (2-3 sentences MAX) before the JSON block
7. If you cannot make the change safely, explain why briefly and make the best alternative modification

Return format:
[2-3 sentence confirmation of what changed and why]

\`\`\`json
{ complete updated program object }
\`\`\``;
}

function getEditTypeGuidance(editType: string, program: ProgramStructure): string {
  switch (editType) {
    case "add_core":
      return `**CORE ADDITION GUIDANCE:**
- Identify which days currently lack core/trunk work
- Add 2-3 core exercises distributed intelligently across the week
- Place core exercises at the END of sessions (after primary and secondary compound work)
- Choose exercises appropriate to the program's goal:
  • Hypertrophy → cable crunches, hanging leg raises, weighted sit-ups (3×12-15, 60 sec rest)
  • Strength → planks, ab wheel rollouts, dead bugs (3-4×8-10, 90 sec rest)
  • Athletic performance → anti-rotation press, pallof press, suitcase carries, Copenhagen planks (3-4×8-12 each side)
- Do NOT add 5+ ab exercises to one day — spread them efficiently
- Maintain existing session structure — core is a finisher, not a focus`;

    case "add_hamstrings":
      return `**HAMSTRING ADDITION GUIDANCE:**
- Add 1-2 hamstring-focused exercises to the most appropriate lower body days
- Prioritize: Romanian deadlift, Nordic curl, lying leg curl, glute-ham raise, seated leg curl
- Place after primary hinge/squat movements
- Hypertrophy prescription: 3×10-12, 75-90 sec rest
- Avoid redundancy if the program already has RDL or stiff-leg deadlifts`;

    case "add_calves":
      return `**CALF ADDITION GUIDANCE:**
- Add 2-3 sets of calf work to 2-3 sessions across the week
- Standing calf raises, seated calf raises, single-leg calf raises
- Place at the END of lower body sessions or as filler between sets
- Hypertrophy prescription: 3×12-20, 45-60 sec rest`;

    case "swap_exercise":
      return `**EXERCISE SWAP GUIDANCE:**
- Identify the exact exercise being swapped
- Replace with a movement of similar classification (primary for primary, accessory for accessory)
- Match the movement pattern (e.g., horizontal push for horizontal push)
- Maintain the same sets/reps/rest prescription
- Preserve NSCA position order`;

    case "remove_exercise":
      return `**EXERCISE REMOVAL GUIDANCE:**
- Remove the specified exercise
- Do NOT replace it with something else unless the session is clearly under-volume
- Adjust session structure to remain balanced`;

    case "shorten_sessions":
      return `**SESSION SHORTENING GUIDANCE:**
- Remove the lowest-priority accessory exercises first
- Reduce set counts before removing entire exercises
- Keep all primary compound work intact
- Target the conditioning/finisher block first if time is the concern`;

    case "make_more_athletic":
      return `**ATHLETIC ENHANCEMENT GUIDANCE:**
- Add or enhance explosive/power work at the START of sessions (med ball throws, box jumps, power cleans, hang cleans)
- Include more unilateral work (single-leg deadlifts, Bulgarian split squats, single-arm rows)
- Add carries or anti-rotation core work
- Increase conditioning density on appropriate days`;

    case "reduce_fatigue":
      return `**FATIGUE REDUCTION GUIDANCE:**
- Reduce total sets by 20-30% on the highest-volume days
- Lower rep ranges slightly on accessory work
- Add rest days between demanding sessions if the split allows
- Remove or reduce conditioning volume`;

    case "injury_modification":
      return `**INJURY MODIFICATION GUIDANCE:**
- Identify and remove all exercises that load the affected area
- Replace with appropriate alternatives that maintain movement balance
- Consider pain-free range adjustments (e.g., partial ROM, incline bench for shoulder issues)
- Apply the modification consistently across ALL days in the program`;

    case "structural_edit":
      return `**STRUCTURAL REDESIGN GUIDANCE:**

You are restructuring the program's architecture. Reference the current program above and determine:

**Step 1 — Identify the target structure from the user's request:**
- "full body" → every session trains full body (quads, hinge, horizontal push/pull, vertical push/pull, core each day)
- "upper/lower" → alternate upper body days and lower body days
- "PPL / push-pull-legs" → push day (chest/shoulder/triceps), pull day (back/biceps), leg day
- "3 days" / "4 days" / "5 days" → rebuild with the specified number of training days

**Step 2 — Preserve from the current program:**
- All primary compound lifts (squat, deadlift, bench, press, row patterns)
- User's established exercise preferences (if any are repeated, keep them)
- Current goal (hypertrophy, strength, athletic) — just redistribute it

**Step 3 — Redistribute intelligently:**
- Spread preserved exercises across the new day structure
- Fill gaps with appropriate exercises for the new structure's movement requirements
- Balance volume: each day should have roughly equal total work unless the split dictates otherwise (e.g., pull day is often slightly higher volume)
- NSCA order within each session: explosive → primary → secondary → accessory → conditioning

**Step 4 — Update program metadata:**
- Update \`splitType\` to reflect the new structure (e.g., "Full Body × 3", "Upper/Lower × 4")
- Update \`programName\` if the split type changed significantly
- Update \`days[].name\` to reflect new session focus (e.g., "Full Body A", "Upper Body — Push Focus")`;

    default:
      return `**GENERAL MODIFICATION GUIDANCE:**
- Apply the requested change intelligently
- Maintain program integrity and NSCA standards
- Preserve all unaffected structure`;
  }
}

// ─── AI Response Options ─────────────────────────────────────────────────────

export interface AIResponseOptions {
  adaptationContext?: string;
  memoryContext?: string;
  insightHint?: string;
  conversionHint?: string;
  currentProgram?: ProgramStructure | null;
  intentResult?: IntentResult | null;
  actionDecision?: ActionDecision | null;
  transformHint?: string;
  responseMode?: ResponseMode;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function generateAIResponse(
  userMessage: string,
  history: ChatMessage[],
  userId: number,
  options: AIResponseOptions = {}
): Promise<AIResponse> {
  const {
    adaptationContext,
    memoryContext,
    insightHint,
    conversionHint,
    currentProgram,
    intentResult,
    actionDecision,
    transformHint,
    responseMode,
  } = options;

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const basePrompt = await buildSystemPrompt(profile ?? null);

  // ── Intent-driven context building ───────────────────────────────────────
  // Use the pre-classified intent result from the router instead of re-detecting.
  // Fall back to internal detection only if no intent was passed.
  let editContext: string | null = null;
  let legacyEditIntent: EditIntent | null = null;

  // ── Change Engine: build edit context for all modification intents ───────
  // The AI must always operate from the current active program state.
  // EDIT_PROGRAM, ADJUST_FOR_PAIN, and ADJUST_FOR_READINESS all modify the
  // existing program — each gets an appropriately typed edit context.
  const isModificationIntent =
    intentResult?.type === "EDIT_PROGRAM" ||
    intentResult?.type === "ADJUST_FOR_PAIN" ||
    intentResult?.type === "ADJUST_FOR_READINESS";

  if (isModificationIntent && currentProgram) {
    // Map intent type to the most appropriate edit subtype
    let editType = intentResult!.editSubtype ?? "general_modification";
    if (intentResult?.type === "ADJUST_FOR_PAIN") {
      const bodyPart = intentResult.metadata?.bodyPart as string | undefined;
      editType = bodyPart ? `pain_adjustment_${bodyPart}` : "pain_adjustment";
    } else if (intentResult?.type === "ADJUST_FOR_READINESS") {
      const signal = intentResult.metadata?.signal as string | undefined;
      editType = signal === "poor_sleep" || signal === "high_fatigue" || signal === "poor_recovery"
        ? "reduce_fatigue"
        : "general_modification";
    }

    const syntheticEditIntent: EditIntent = {
      isEdit: true,
      editType,
      confidence: intentResult!.confidence,
    };
    editContext = buildEditContext(currentProgram, userMessage, syntheticEditIntent);
    legacyEditIntent = syntheticEditIntent;
    logger.info(
      { intentType: intentResult!.type, editType, confidence: intentResult!.confidence },
      "[ChangeEngine] Building edit context — AI will modify current program, not rebuild"
    );
  } else if (isModificationIntent && !currentProgram) {
    logger.warn(
      { intentType: intentResult?.type },
      "[ChangeEngine] Modification intent but no current program — AI will handle without program context"
    );
  } else if (!intentResult) {
    // Legacy path: classify internally (backwards compat for direct calls)
    const detected = detectEditIntent(userMessage);
    if (detected.isEdit && currentProgram) {
      editContext = buildEditContext(currentProgram, userMessage, detected);
      legacyEditIntent = detected;
    }
  }

  // Build intent-specific prompt hint (pain, readiness, retrieve, etc.)
  const intentHint = intentResult ? buildIntentPromptHint(intentResult) : null;

  // Build preservation context from decision tree (injected after edit context)
  const preservationContext = actionDecision
    ? buildPreservationContext(actionDecision.preservationRules, actionDecision.actionType)
    : null;

  // Build response mode formatting prompt — always injected last so it takes priority
  let responseModePrompt: string | null = null;
  if (responseMode && actionDecision) {
    const rmCtx: ResponseModeContext = {
      actionType: actionDecision.actionType,
      mode: responseMode,
      targetDescription: actionDecision.targetDescription,
      inferenceRationale: actionDecision.inferenceRationale,
      clarifyingQuestion: actionDecision.clarifyingQuestion,
    };
    responseModePrompt = buildResponseModePrompt(rmCtx);
    logResponseMode(rmCtx);
  }

  const extras = [adaptationContext, memoryContext, insightHint, conversionHint, intentHint, editContext, preservationContext, transformHint, responseModePrompt]
    .filter(Boolean)
    .join("\n\n");
  const systemPrompt = extras ? `${basePrompt}\n\n${extras}` : basePrompt;
  const apiKey = process.env.OPENAI_API_KEY;

  const activeEditIntent = legacyEditIntent;

  if (!apiKey) {
    return generateFallbackResponse(userMessage, history, profile ?? null, {
      currentProgram: currentProgram ?? null,
      editIntent: activeEditIntent ?? undefined,
      intentResult: intentResult ?? undefined,
    });
  }

  try {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.slice(-30).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userMessage },
    ];

    // Use decision-tree token budget if available, otherwise fall back to context-based heuristic
    const maxTokens = actionDecision?.recommendedMaxTokens
      ?? (editContext !== null || intentResult?.type === "ADJUST_FOR_PAIN" || intentResult?.type === "ADJUST_FOR_READINESS" ? 4000 : 2800);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: maxTokens,
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
    return generateFallbackResponse(userMessage, history, profile ?? null, {
      currentProgram: currentProgram ?? null,
      editIntent: activeEditIntent ?? undefined,
      intentResult: intentResult ?? undefined,
    });
  }
}

// ─── Intelligent Fallback (no API key) ──────────────────────────────────────
// Uses the training intelligence engine for exercise selection and program design.
// Follows the same co-creation model as the real AI agent.

interface FallbackOptions {
  currentProgram?: ProgramStructure | null;
  editIntent?: EditIntent;
  intentResult?: IntentResult;
}

function generateFallbackResponse(
  userMessage: string,
  history: ChatMessage[],
  profile: UserProfile | null,
  options: FallbackOptions = {}
): AIResponse {
  const { currentProgram, editIntent, intentResult } = options;
  const lower = userMessage.toLowerCase();
  const userTurnCount = history.filter((m) => m.role === "user").length;
  const isFirstMessage = userTurnCount === 0;

  // ── Readiness adjustment fallback ────────────────────────────────────────
  if (intentResult?.type === "ADJUST_FOR_READINESS") {
    const signal = intentResult.metadata?.signal as string ?? "general";
    const responses: Record<string, string> = {
      poor_sleep: `Poor sleep degrades force production, reaction time, and recovery speed. This is not a day to push intensity.\n\nFor today:\n- Drop load 15-20% across all sets\n- Keep reps technical — stop 3+ reps before failure\n- Skip any max-effort or PR attempts\n- Prioritize compound movements, cut accessories if needed\n\nConsistency over intensity. One suboptimal session won't derail the program — but training through CNS suppression can.`,
      high_fatigue: `Accumulated fatigue is real and requires a response, not a push-through.\n\nOptions based on where you are:\n1. **Deload session** — reduce all loads by 40-50%, keep the same movements, lower reps\n2. **Active recovery** — 30 minutes of walking, light cycling, or mobility work\n3. **Full rest** — if you're at the point of systemic fatigue, one full day off accelerates recovery more than a junk session\n\nWhich direction fits your situation?`,
      illness: `Training while ill is counterproductive — your immune system is already taxed and adding training stress delays recovery.\n\nRecommendation: rest until symptoms are gone. Once you're at 80%+, start with a reduced volume session before returning to normal loads.\n\nIf you're insisting on movement: light walking or mobility only. No lifting.`,
      high_stress: `High psychological stress elevates cortisol, which competes with the adaptations you're training for.\n\nFor today: reduce intensity 20-30%, avoid failure sets, and focus on movement quality over load. If available, prioritize compound movements and skip high-demand isolation work.\n\nManaging recovery is part of the training system — not separate from it.`,
      poor_recovery: `If your muscles haven't recovered, you're training on borrowed time.\n\nFor today: switch to an antagonist muscle group or active recovery. If the program has a rest day tomorrow, consider swapping.\n\nTell me which day you're supposed to train and I'll adjust accordingly.`,
      travel: `Constrained environment changes the execution, not the objective.\n\nIf you have access to a hotel gym: focus on compound bodyweight or dumbbell movements. If not: bodyweight circuit targeting the same muscle groups as today's session.\n\nWhat equipment do you have access to right now?`,
    };
    return {
      content: responses[signal] ?? `Noted on the readiness concern. Reduce session intensity 20-30% today and prioritize recovery. What does your schedule look like for the next 48 hours?`,
      structuredData: null,
    };
  }

  // ── Pain adjustment fallback ──────────────────────────────────────────────
  if (intentResult?.type === "ADJUST_FOR_PAIN") {
    const bodyPart = intentResult.metadata?.bodyPart as string ?? "unspecified";
    const partLabel = bodyPart.replace("_", " ");
    return {
      content: `Flagging the ${partLabel} issue before we continue. A few things:\n\n1. If this is acute (recent, sharp, or getting worse) — stop training that area and consult a medical professional before loading it again.\n2. If this is chronic or a familiar pattern — we can program around it. Tell me:\n   - Is it sharp/acute or dull/chronic?\n   - What movements aggravate it?\n   - What range of motion is pain-free?\n\nWith that context, I'll remove the problematic exercises from the program and replace them with appropriate alternatives. The rest of the structure stays intact.`,
      structuredData: null,
    };
  }

  // ── Edit request with current program (fallback mutation engine) ──
  const activeEditIntent = editIntent;
  if (activeEditIntent?.isEdit && currentProgram) {
    logger.info({ editType: activeEditIntent.editType }, "[FallbackEditPipeline] Applying fallback program mutation");
    const mutated = applyFallbackMutation(currentProgram, activeEditIntent.editType, lower, profile);
    if (mutated) {
      const confirmations: Record<string, string> = {
        add_core: "Added core work across the program. Core exercises are placed at the end of appropriate sessions to preserve NSCA exercise order and avoid competing with primary lifts. Updated structure is in the right panel.",
        add_hamstrings: "Added hamstring-focused accessory work to lower body days. Placed after primary hinge movements to maintain NSCA order. Updated structure is in the right panel.",
        add_calves: "Added calf work to lower body sessions as end-of-session accessories. Updated structure is in the right panel.",
        swap_exercise: "Exercise swap applied. Movement pattern and NSCA classification preserved. Updated structure is in the right panel.",
        remove_exercise: "Exercise removed. Remaining structure is intact. Updated structure is in the right panel.",
        shorten_sessions: "Lowest-priority accessory work trimmed to shorten sessions. Primary compound structure preserved. Updated structure is in the right panel.",
        make_more_athletic: "Added explosive work to session openings and enhanced conditioning integration. Updated structure is in the right panel.",
        reduce_fatigue: "Reduced accessory volume on high-demand days. Primary compound work preserved. Updated structure is in the right panel.",
        injury_modification: "Removed exercises that conflict with the stated limitation and replaced where needed. Updated structure is in the right panel.",
        structural_edit: "Converted the program to the new structure while preserving your main compound lifts and overall training volume. The updated plan is in the right panel.",
        general_modification: "Modification applied. Updated structure is in the right panel.",
      };
      return {
        content: confirmations[activeEditIntent.editType] ?? "Modification applied. Updated structure is in the right panel.",
        structuredData: mutated,
      };
    }
    return {
      content: "I understood the requested change, but couldn't apply it to the current program state. Regenerating the updated structure now.",
      structuredData: profile ? buildIntelligentProgram(profile) : null,
    };
  }

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

    // Build the program immediately — no propose-and-ask step
    const program = buildIntelligentProgram(profile);
    const goal = normalizeGoal(profile.trainingGoal);

    return {
      content: getGoalConfirmationLine(goal, profile.daysPerWeek),
      structuredData: program,
    };
  }

  // ── Modification request ──
  if (lower.match(/swap|change|replace|modify|adjust|shorter|longer|remove|add|less.*volume|more.*volume|make.*athletic|make.*shorter|shoulder|knee|back|full.?body|upper.lower|split up|hit everything|more often/)) {
    if (profile?.injuries && lower.match(/shoulder|knee|back|hip|pain|hurt|injury/)) {
      return {
        content: `I already have your ${profile.injuries} noted, so those patterns are accounted for in any program I build. If something specific is aggravating it, tell me the exercise and I'll substitute immediately without touching the rest of the structure.`,
        structuredData: null,
      };
    }
    // If they have an active program and a modification intent, give a helpful inference
    // rather than demanding precise wording
    if (currentProgram) {
      if (lower.match(/full.?body|hit everything|too split|more often/)) {
        return {
          content: `I can convert this to a full-body structure while keeping your main lifts. Do you want to stay at ${currentProgram.days.length} days or simplify to 3?`,
          structuredData: null,
        };
      }
      if (lower.match(/shorter|less time|too long|45 min|don.t have.*time/)) {
        return {
          content: `I'll trim the lowest-priority accessory work to shorten each session. Primary compound work stays intact. Send this in the main chat with your program active and I'll apply the change.`,
          structuredData: null,
        };
      }
      if (lower.match(/too much|too fatiguing|always sore|hard to recover|exhausting/)) {
        return {
          content: `Sounds like the recovery load is too high. I can reduce accessory volume on the heaviest days and increase rest between demanding sessions. Want me to apply that now?`,
          structuredData: null,
        };
      }
    }
    return {
      content: `What direction do you want to go — split type, volume, exercise selection, or session length? One of those will point me where to start.`,
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

function getGoalConfirmationLine(goal: GoalType, daysPerWeek: number): string {
  switch (goal) {
    case "strength":
      return `Built. ${daysPerWeek}-day strength program is live.\n\nCheck the Program tab — want to adjust anything?`;
    case "hypertrophy":
      return `Built. ${daysPerWeek}-day hypertrophy split is ready.\n\nProgram tab has it. Want me to bias it toward size, strength, or performance?`;
    case "athletic_performance":
      return `Built. ${daysPerWeek}-day athletic performance program is live.\n\nCheck the Program tab — want to adjust anything?`;
    case "fat_loss":
      return `Built. ${daysPerWeek}-day body composition program is ready.\n\nCheck the Program tab — want to adjust anything?`;
    default:
      return `Built. ${daysPerWeek}-day program is live.\n\nCheck the Program tab — want to adjust anything?`;
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

// ─── Fallback Program Mutation Engine ────────────────────────────────────────
// Applied when OpenAI is unavailable. Performs deterministic surgical edits.

function getMovementPattern(exerciseName: string): string {
  const name = exerciseName.toLowerCase();
  if (/(squat|front squat|goblet|hack squat|leg press|lunge|split squat|bulgarian)/.test(name)) return "squat";
  if (/(deadlift|rdl|romanian|stiff.leg|rack pull|sumo|trap.bar)/.test(name)) return "hinge";
  if (/(bench|push.up|dip|incline|decline|fly|chest press)/.test(name)) return "horizontal_push";
  if (/(overhead press|military press|shoulder press|ohp|arnold|z press)/.test(name)) return "vertical_push";
  if (/(row|cable row|t.bar|chest.supported|seal row|pendlay)/.test(name)) return "horizontal_pull";
  if (/(pull.up|chin.up|lat pulldown|pulldown|pull down)/.test(name)) return "vertical_pull";
  if (/(carry|farmer|suitcase|yoke|loaded carry)/.test(name)) return "carry";
  if (/(clean|snatch|jerk|med ball|box jump|broad jump|power)/.test(name)) return "explosive";
  return "accessory";
}

function applyFallbackMutation(
  program: ProgramStructure,
  editType: string,
  _lowerMessage: string,
  _profile: UserProfile | null
): ProgramStructure | null {
  const mutated: ProgramStructure = JSON.parse(JSON.stringify(program));

  switch (editType) {
    case "add_core": {
      const coreExercises: Exercise[] = [
        { name: "Dead Bug", classification: "Accessory", sets: 3, reps: "8 each side", rest: "60 sec", intent: "Anti-extension focus — press lower back into floor throughout. Quality over speed." },
        { name: "Pallof Press", classification: "Accessory", sets: 3, reps: "10 each side", rest: "60 sec", intent: "Anti-rotation focus — resist trunk rotation completely. Keep hips square." },
        { name: "Ab Wheel Rollout", classification: "Accessory", sets: 3, reps: "8-10", rest: "75 sec", intent: "Full anti-extension load — brace hard before initiating, maintain neutral spine throughout." },
        { name: "Copenhagen Plank", classification: "Accessory", sets: 3, reps: "20-30 sec each side", rest: "60 sec", intent: "Adductor and lateral core — maintain rigid position from head to heel." },
        { name: "Hanging Knee Raise", classification: "Accessory", sets: 3, reps: "12-15", rest: "60 sec", intent: "Posterior pelvic tilt at the top — avoid swinging. Controlled descent." },
      ];
      let coreAdded = 0;
      const coreIdx = [0];
      for (const day of mutated.days) {
        if (coreAdded >= 3) break;
        const hasCore = day.exercises.some(ex =>
          /(core|plank|crunch|ab |abs|trunk|pallof|dead bug|hollow|rollout|leg raise|sit.?up)/i.test(ex.name)
        );
        if (!hasCore) {
          const coreEx = coreExercises[coreIdx[0] % coreExercises.length];
          coreIdx[0]++;
          day.exercises.push({ ...coreEx });
          coreAdded++;
        }
      }
      if (coreAdded === 0) {
        for (let i = 0; i < Math.min(2, mutated.days.length); i++) {
          mutated.days[i].exercises.push({ ...coreExercises[i % coreExercises.length] });
        }
      }
      return mutated;
    }

    case "add_hamstrings": {
      const hamExercises: Exercise[] = [
        { name: "Romanian Deadlift", classification: "Secondary Compound", sets: 3, reps: "10-12", rest: "90 sec", intent: "Controlled eccentric — feel the hamstring stretch at the bottom. Drive hips forward at the top." },
        { name: "Seated Leg Curl", classification: "Accessory", sets: 3, reps: "12-15", rest: "60 sec", intent: "Full range — feel the contraction at peak, slow eccentric." },
        { name: "Nordic Curl", classification: "Accessory", sets: 3, reps: "5-8", rest: "90 sec", intent: "Eccentric focus — lower as slowly as possible. Pull back up with hip extension." },
      ];
      let added = 0;
      for (const day of mutated.days) {
        if (added >= 2) break;
        const isLower = /(leg|lower|squat|hinge|hamstring|glute)/i.test(day.name + (day.focus ?? ""));
        if (isLower) {
          const alreadyHas = day.exercises.some(ex => /(hamstring|leg curl|nordic|glute.ham|rdl|romanian)/i.test(ex.name));
          if (!alreadyHas) {
            day.exercises.push({ ...hamExercises[added % hamExercises.length] });
            added++;
          }
        }
      }
      return mutated;
    }

    case "add_calves": {
      const calfEx: Exercise = {
        name: "Standing Calf Raise",
        classification: "Accessory",
        sets: 3,
        reps: "15-20",
        rest: "45 sec",
        intent: "Full range — pause at the bottom for a stretch, squeeze hard at the top.",
      };
      let added = 0;
      for (const day of mutated.days) {
        if (added >= 3) break;
        const isLower = /(leg|lower|squat|hinge|calv)/i.test(day.name + (day.focus ?? ""));
        if (isLower) {
          const alreadyHas = day.exercises.some(ex => /calf|calves/i.test(ex.name));
          if (!alreadyHas) {
            day.exercises.push({ ...calfEx });
            added++;
          }
        }
      }
      return mutated;
    }

    case "shorten_sessions": {
      for (const day of mutated.days) {
        const accessoryIndices = day.exercises
          .map((ex, i) => ({ ex, i }))
          .filter(({ ex }) => ex.classification === "Accessory" || ex.classification === "Conditioning")
          .map(({ i }) => i);
        if (accessoryIndices.length > 0) {
          const removeIdx = accessoryIndices[accessoryIndices.length - 1];
          day.exercises.splice(removeIdx, 1);
        }
      }
      return mutated;
    }

    case "reduce_fatigue": {
      for (const day of mutated.days) {
        for (const ex of day.exercises) {
          if ((ex.classification === "Accessory" || ex.classification === "Conditioning") && ex.sets > 2) {
            ex.sets = ex.sets - 1;
          }
        }
      }
      return mutated;
    }

    case "make_more_athletic": {
      const explosiveEx: Exercise = {
        name: "Box Jump",
        classification: "Plyometric/Explosive",
        sets: 4,
        reps: "4-5",
        rest: "2 min",
        intent: "Explosive concentric — max intent on every rep. Land softly with knees tracking toes. CNS must be completely fresh.",
      };
      let added = 0;
      for (const day of mutated.days) {
        if (added >= 2) break;
        const alreadyExplosive = day.exercises.some(ex =>
          /(box jump|power clean|hang clean|snatch|med ball|plyometric)/i.test(ex.name)
        );
        if (!alreadyExplosive) {
          day.exercises.unshift({ ...explosiveEx });
          added++;
        }
      }
      return mutated;
    }

    case "structural_edit": {
      // Delegate to the split transformation engine — it handles all structural
      // rebuilds with proper exercise redistribution, validation, and logging.
      const msg = _lowerMessage;
      const currentSplit = detectCurrentSplit(program);
      const currentDays = program.days.length;

      // Infer target structure from the raw message
      let targetSplit = "unknown";
      let targetDays: number | null = null;
      let targetGoalShift: string | null = null;

      if (/full.?body/i.test(msg)) targetSplit = "full_body";
      else if (/upper.?lower/i.test(msg)) targetSplit = "upper_lower";
      else if (/push.pull.legs?|ppl/i.test(msg)) targetSplit = "ppl";

      const dayMatch = msg.match(/(\d)\s*-?\s*day/);
      if (dayMatch) targetDays = parseInt(dayMatch[1], 10);

      if (/athletic/i.test(msg)) targetGoalShift = "athletic";
      else if (/fat.loss|conditioning|cardio/i.test(msg)) targetGoalShift = "fat_loss";

      const transformType = resolveTransformType(targetSplit, targetDays, targetGoalShift, currentDays);
      const transformRequest: TransformRequest = {
        type: transformType,
        targetDays: targetDays ?? currentDays,
        userProfile: _profile,
        rawRequest: _lowerMessage,
      };

      const result = transformProgram(program, transformRequest);
      return result.program;
    }

    default:
      return null;
  }
}
