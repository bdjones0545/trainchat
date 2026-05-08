// ─── TrainChat Intent Classification Layer ───────────────────────────────────
//
// Phase A of the agent routing architecture.
// Classifies every user message into a structured intent before response generation.
// This is a pure function module — no side effects, no DB calls, no AI calls.

import { logger } from "./logger";
import { getBestSportResolution } from "./sport-language-normalizer";

// ─── Extracted Constraints ────────────────────────────────────────────────────
//
// Structured hard constraints extracted directly from user input.
// These ALWAYS override profile defaults when present.
// Priority: explicit user input > stored profile > safe defaults.

export type SeasonContext =
  | "off_season"
  | "pre_season"
  | "in_season"
  | "post_season"
  | "return_to_play";

export interface ExtractedConstraints {
  sportFocus: string | null;
  primaryGoal: string | null;
  daysPerWeek: number | null;
  sessionDuration: number | null;
  equipment: string | null;
  experienceLevel: string | null;
  trainingBias: string | null;
  limitations: string | null;
  locationContext: string | null;
  seasonContext: SeasonContext | null;
  gameFrequencyPerWeek: number | null;
  practiceFrequencyPerWeek: number | null;
  userAge: number | null;
  isOlderAdult: boolean;
}

// ─── Constraint Extractor ─────────────────────────────────────────────────────
//
// Extracts hard constraints from a user's message.
// Called for CREATE_PROGRAM and PROGRAM_MODIFICATION intents before generation.

/**
 * Converts English number words (one–seven) to digit form so voice-transcribed
 * messages — where the browser renders "3" as "three" — hit the same regex
 * patterns as typed input. Scope limited to 1–7: the relevant range for
 * days-per-week and session-count constraints. Applied before ALL intent and
 * constraint regex so neither classifyIntent nor extractConstraints needs to
 * know whether input came from voice or keyboard.
 */
export function normalizeSpokenNumbers(text: string): string {
  return text
    .replace(/\bone\b/gi, "1")
    .replace(/\btwo\b/gi, "2")
    .replace(/\bthree\b/gi, "3")
    .replace(/\bfour\b/gi, "4")
    .replace(/\bfive\b/gi, "5")
    .replace(/\bsix\b/gi, "6")
    .replace(/\bseven\b/gi, "7");
}

export function extractConstraints(message: string): ExtractedConstraints {
  const lower = normalizeSpokenNumbers(message.toLowerCase().trim());

  // ── Sport focus ────────────────────────────────────────────────────────────
  const sportFocus = detectSport(lower);

  // ── Primary goal ──────────────────────────────────────────────────────────
  let primaryGoal: string | null = null;
  if (/\b(strength|strong|stronger|powerlifting|power)\b/.test(lower) && !/hypertrophy|muscle|mass|size/.test(lower)) {
    primaryGoal = "strength";
  } else if (/\b(hypertrophy|muscle|mass|size|bulk|gains?|build muscle)\b/.test(lower)) {
    primaryGoal = "hypertrophy";
  } else if (/\b(athletic|performance|sport|explosive|speed|agility)\b/.test(lower)) {
    primaryGoal = "athletic_performance";
  } else if (/\b(fat loss|weight loss|cut|cutting|lean|conditioning|cardio)\b/.test(lower)) {
    primaryGoal = "fat_loss";
  } else if (/\b(fitness|general|overall health|stay fit|stay active)\b/.test(lower)) {
    primaryGoal = "general_fitness";
  }
  // If sport is detected and no goal stated, default to athletic performance
  if (!primaryGoal && sportFocus) {
    primaryGoal = "athletic_performance";
  }

  // ── Days per week ─────────────────────────────────────────────────────────
  let daysPerWeek: number | null = null;
  const dayPatterns = [
    /\b(\d)\s*[\-–]?\s*day(?:s)?\s*(?:a|per)\s*week\b/i,
    /\b(\d)\s*[\-–]?\s*day(?:s)?\s*week(?:ly)?\b/i,
    /\b(\d)\s*times?\s*(?:a|per)\s*week\b/i,
    /\b(\d)\s*[\-–]?\s*day\s+(?:program|split|routine|plan)\b/i,
    /\b(\d)\s*[\-–]?\s*day\s+\w+\s+(?:program|split|routine|plan)\b/i,
    /\b(\d)\s*[\-–]?\s*day\s+(?:\w+\s+){0,4}(?:program|split|routine|plan|training)\b/i,
    /\btrain(?:ing)?\s+(\d)\s+days?\b/i,
    /\b(\d)\s+sessions?\s*(?:a|per)\s*week\b/i,
    /\bwant\s+a?\s*(\d)\s*[\-–]?\s*day\b/i,
    /\b(\d)\s*[\-–]?\s*days?\s+(?:strength|hypertrophy|athletic|cardio|conditioning|fat|muscle|power)\b/i,
  ];
  for (const pat of dayPatterns) {
    const m = lower.match(pat);
    if (m) {
      const raw = parseInt(m[1], 10);
      if (raw >= 1 && raw <= 7) {
        daysPerWeek = raw;
        break;
      }
    }
  }

  // ── Session duration ──────────────────────────────────────────────────────
  let sessionDuration: number | null = null;
  const durMatch = lower.match(/\b(\d{2,3})\s*(?:minute|min|minutes?|mins?)\b/i)
    ?? lower.match(/\b(\d)\s*hour(?:s)?\b/i);
  if (durMatch) {
    const raw = parseInt(durMatch[1], 10);
    // Convert hours to minutes if needed
    const isHour = /hour/.test(durMatch[0]);
    const minutes = isHour ? raw * 60 : raw;
    if (minutes >= 15 && minutes <= 180) sessionDuration = minutes;
  }

  // ── Equipment ─────────────────────────────────────────────────────────────
  let equipment: string | null = null;
  if (/\b(dumbbells? only|dumbbell only|only dumbbells?)\b/i.test(lower)) {
    equipment = "dumbbells only";
  } else if (/\b(home gym|home setup|home equipment|at home)\b/i.test(lower)) {
    equipment = "home gym";
  } else if (/\b(full gym|commercial gym|gym access|full access|gym)\b/i.test(lower)) {
    equipment = "full gym";
  } else if (/\b(no equipment|bodyweight|no weights?|no gym)\b/i.test(lower)) {
    equipment = "bodyweight";
  } else if (/\b(barbell|barbells?|squat rack|power rack)\b/i.test(lower)) {
    equipment = "barbell and rack";
  } else if (/\b(resistance bands?|bands? only)\b/i.test(lower)) {
    equipment = "resistance bands";
  } else if (/\b(kettlebell)\b/i.test(lower)) {
    equipment = "kettlebells";
  }

  // ── Experience level ──────────────────────────────────────────────────────
  let experienceLevel: string | null = null;
  if (/\b(beginner|new to (lifting|gym|training)|just started|starting out|novice|never (lifted|trained))\b/i.test(lower)) {
    experienceLevel = "beginner";
  } else if (/\b(intermediate|some experience|been (lifting|training|going to gym) for \d+)\b/i.test(lower)) {
    experienceLevel = "intermediate";
  } else if (/\b(advanced|experienced|years? of (lifting|training)|elite|competitive)\b/i.test(lower)) {
    experienceLevel = "advanced";
  }

  // ── Age extraction ────────────────────────────────────────────────────────
  let userAge: number | null = null;
  const agePatterns = [
    // "I am 65 years old", "I'm 65", "I am a 65-year-old"
    /\bi(?:'m| am)\s+(?:a\s+)?(\d{2})\s*(?:year[s]?\s*old|y\.?o\.?|years?)?\b(?!\s*(?:days?|weeks?|months?|sets?|reps?|pounds?|kg|lbs?|%|minutes?|hours?|second|sec))/i,
    // "65 year old", "65-year-old", "65yo", "65 y.o."
    /\b(\d{2})\s*[-]?\s*(?:year[s]?\s*old|y\.?o\.?)\b/i,
    // "65-year-old" with hyphens (e.g. "a 42-year-old baseball player")
    /\b(\d{2})\s*-\s*year[s]?[\s-]?old\b/i,
    // "age 65", "aged 65"
    /\bage[d]?\s+(\d{2})\b/i,
    // "female, 58" / "male, 58" / "woman, 58" — gender prefix + bare age
    /\b(?:female|male|woman|man|girl|boy)\s*,\s*(\d{2})\b(?!\s*(?:days?|weeks?|months?|sets?|reps?|pounds?|kg|lbs?|%|minutes?|hours?))/i,
    // "in my 60s", "in her 50s"
    /\bin\s+(?:my|her|his)\s+(50s|60s|70s|80s)\b/i,
  ];
  for (const pat of agePatterns) {
    const m = lower.match(pat);
    if (m) {
      const raw = m[1];
      if (raw === "50s") { userAge = 55; break; }
      if (raw === "60s") { userAge = 65; break; }
      if (raw === "70s") { userAge = 75; break; }
      if (raw === "80s") { userAge = 80; break; }
      const parsed = parseInt(raw, 10);
      if (parsed >= 18 && parsed <= 100) { userAge = parsed; break; }
    }
  }
  // Also detect "senior" or "older" references without explicit age
  if (!userAge && /\b(senior|older adult|elderly|retiree|retired)\b/i.test(lower)) {
    userAge = 65; // conservative estimate for "senior" references
  }
  const isOlderAdult = userAge !== null && userAge >= 50;

  // ── Training bias / style ─────────────────────────────────────────────────
  let trainingBias: string | null = null;
  if (/\b(compound|powerlifting|barbell-based|strength-based)\b/i.test(lower)) {
    trainingBias = "compound_focused";
  } else if (/\b(unilateral|single.leg|single.arm|asymmetry)\b/i.test(lower)) {
    trainingBias = "unilateral_focused";
  } else if (/\b(conditioning|cardio|aerobic|endurance)\b/i.test(lower)) {
    trainingBias = "conditioning_focused";
  }

  // ── Limitations / injuries ────────────────────────────────────────────────
  let limitations: string | null = null;
  const injuryPatterns = /\b(injury|injured|pain|hurt|avoid|can.t do|no (squats?|deadlifts?|pressing|running)|knee|shoulder|back|hip|wrist|ankle)\b/i;
  if (injuryPatterns.test(lower)) {
    // Extract around the keyword
    const match = lower.match(/([^.!?]*(?:injury|injured|pain|hurt|avoid|can.t do|no \w+|knee|shoulder|back|hip|wrist|ankle)[^.!?]*)/i);
    if (match) limitations = match[1].trim();
  }

  // ── Location context ──────────────────────────────────────────────────────
  let locationContext: string | null = null;
  if (/\b(hotel|travel|on the road|traveling|away)\b/i.test(lower)) {
    locationContext = "travel";
  } else if (/\b(home|house|apartment)\b/i.test(lower)) {
    locationContext = "home";
  } else if (/\b(gym|fitness center|studio)\b/i.test(lower)) {
    locationContext = "gym";
  } else if (/\b(outdoor|outside|park)\b/i.test(lower)) {
    locationContext = "outdoor";
  }

  // ── Season context ────────────────────────────────────────────────────────
  const seasonContext = detectSeasonContext(lower);

  // ── Game frequency ────────────────────────────────────────────────────────
  let gameFrequencyPerWeek: number | null = null;
  const gameFreqMatch = lower.match(/\b(\d)\s*(?:games?|matches?)\s*(?:a|per)\s*week\b/i)
    ?? lower.match(/\b(\d)\s*(?:times?|x)\s*(?:a|per)\s*week\b.*\b(?:play|game|match)\b/i);
  if (gameFreqMatch) {
    const raw = parseInt(gameFreqMatch[1], 10);
    if (raw >= 1 && raw <= 7) gameFrequencyPerWeek = raw;
  }

  // ── Practice frequency ────────────────────────────────────────────────────
  let practiceFrequencyPerWeek: number | null = null;
  const practiceFreqMatch = lower.match(/\b(\d)\s*(?:practices?|trainings?|sessions?)\s*(?:a|per)\s*week\b/i);
  if (practiceFreqMatch) {
    const raw = parseInt(practiceFreqMatch[1], 10);
    if (raw >= 1 && raw <= 7) practiceFrequencyPerWeek = raw;
  }

  return {
    sportFocus,
    primaryGoal,
    daysPerWeek,
    sessionDuration,
    equipment,
    experienceLevel,
    trainingBias,
    limitations,
    locationContext,
    seasonContext,
    gameFrequencyPerWeek,
    practiceFrequencyPerWeek,
    userAge,
    isOlderAdult,
  };
}

// ─── Build Contract Generator ─────────────────────────────────────────────────
//
// Generates a mandatory BUILD CONTRACT prompt from extracted constraints.
// Injected into the AI system prompt for CREATE_PROGRAM intents.
// This forces the AI to honor explicit user constraints over defaults.

export function buildConstraintContract(
  constraints: ExtractedConstraints,
  userMessage: string,
): string {
  const parts: string[] = [];

  parts.push(`## MANDATORY BUILD CONTRACT — EXTRACTED FROM USER INPUT`);
  parts.push(`The following constraints were explicitly stated by the user and MUST be honored. They override ALL profile defaults and template presets.\n`);
  parts.push(`**Original request:** "${userMessage}"\n`);
  parts.push(`**Extracted hard constraints:**`);

  if (constraints.daysPerWeek !== null) {
    parts.push(`- daysPerWeek = ${constraints.daysPerWeek} → The program MUST have exactly ${constraints.daysPerWeek} training days. BEFORE you output your JSON, count the number of elements in the "days" array. If it is not ${constraints.daysPerWeek}, fix it. This is NON-NEGOTIABLE.`);
  }
  if (constraints.primaryGoal) {
    parts.push(`- primaryGoal = ${constraints.primaryGoal} → The program goal MUST be ${constraints.primaryGoal}. Do NOT substitute hypertrophy, fat_loss, or any other goal unless this was explicitly stated.`);
  }
  if (constraints.sportFocus && !constraints.isOlderAdult) {
    parts.push(`- sportFocus = ${constraints.sportFocus} → Program MUST be biased for ${constraints.sportFocus} athletic performance. Apply sport-specific programming principles.`);
  }
  if (constraints.sessionDuration !== null) {
    parts.push(`- sessionDuration = ${constraints.sessionDuration} minutes → Sessions MUST fit within this duration.`);
  }
  if (constraints.equipment) {
    parts.push(`- equipment = ${constraints.equipment} → Only use exercises appropriate for this equipment access.`);
  }
  if (constraints.experienceLevel) {
    parts.push(`- experienceLevel = ${constraints.experienceLevel} → Program complexity and volume MUST match this level.`);
  }
  if (constraints.limitations) {
    parts.push(`- limitations = "${constraints.limitations}" → Avoid exercises conflicting with this limitation.`);
  }
  if (constraints.isOlderAdult && constraints.userAge !== null) {
    const ageBracket = constraints.userAge >= 70 ? "70+" : constraints.userAge >= 60 ? "60-69" : "50-59";
    parts.push(`- userAge = ${constraints.userAge} (age bracket: ${ageBracket}) → AGE-AWARE PROGRAMMING IS THE HIGHEST-PRIORITY CONSTRAINT. ALL other constraints are filtered through this lens. This is NON-NEGOTIABLE and cannot be overridden by sport context or goal context:`);
    parts.push(`  • PROHIBITED: Box jumps, broad jumps, depth jumps, power cleans, hang cleans, snatches, any plyometric landing, any Olympic lifting movement`);
    parts.push(`  • PROHIBITED: Conventional barbell deadlift at 1–6 reps (high spinal load under max force)`);
    parts.push(`  • PROHIBITED: Unscaled pull-ups as a primary movement (use lat pulldown or assisted pull-up)`);
    parts.push(`  • PROHIBITED: Bulgarian split squat under heavy load without bilateral support option`);
    parts.push(`  • REQUIRED: Rep ranges 8–12 for primary compounds, 12–15 for accessories (never aggressive 1–6 loading)`);
    parts.push(`  • REQUIRED: Sets capped at 2–4 per exercise with full recovery between sets`);
    parts.push(`  • REQUIRED: Joint-friendly substitutions — goblet squat or trap bar deadlift over conventional barbell patterns`);
    parts.push(`  • REQUIRED: Every session opens with a structured movement prep block (mobility, activation, tissue prep)`);
    parts.push(`  • REQUIRED: Program name and coach notes acknowledge the age context — not generic "athletic performance" framing`);
    if (constraints.sportFocus) {
      parts.push(`\n  AGE + SPORT INTEGRATION for ${constraints.sportFocus}: Sport athleticism IS included but expressed through age-appropriate movements:`);
      parts.push(`  • Rotational power → Cable chop/lift, med ball wall pass, rotational band press — NOT rotational plyometrics`);
      parts.push(`  • Lateral movement → Lateral step-up, lateral band walk, lateral split squat — NOT lateral bounds or box hops`);
      parts.push(`  • Explosive intent → Sled push (light), med ball scoop toss, power step-up — NOT box jumps or jump squats`);
      parts.push(`  • Court/field speed → Controlled direction-change drills, balance reach, single-leg stability — NOT reactive jump patterns`);
      parts.push(`  • Keep the sport's movement identity (lateral quickness, rotation, deceleration) but via controlled, low-impact loading`);
    }
  } else if (constraints.userAge !== null) {
    const mildBias = constraints.userAge >= 45;
    parts.push(`- userAge = ${constraints.userAge} → User is ${constraints.userAge} years old.${mildBias ? " Apply mild joint-friendly bias: prefer moderate rep ranges (6–12), include warm-up/prep, avoid aggressive max-strength loading unless experience warrants it." : " No special age restrictions apply."}`);
  }
  if (constraints.seasonContext) {
    const seasonLabels: Record<string, string> = {
      off_season: "OFF-SEASON",
      pre_season: "PRE-SEASON",
      in_season: "IN-SEASON",
      post_season: "POST-SEASON",
      return_to_play: "RETURN TO PLAY",
    };
    parts.push(`- seasonContext = ${constraints.seasonContext} → This is a ${seasonLabels[constraints.seasonContext]} program. Apply all ${seasonLabels[constraints.seasonContext]} programming rules: volume, intensity, exercise selection, session density, and day identity MUST reflect this phase.`);
  }
  if (constraints.gameFrequencyPerWeek !== null) {
    parts.push(`- gameFrequencyPerWeek = ${constraints.gameFrequencyPerWeek} → Athlete plays ${constraints.gameFrequencyPerWeek} game(s)/match(es) per week. Reduce lower-body eccentric stress and session fatigue accordingly. Readiness and recovery take priority.`);
  }
  if (constraints.practiceFrequencyPerWeek !== null) {
    parts.push(`- practiceFrequencyPerWeek = ${constraints.practiceFrequencyPerWeek} → Athlete has ${constraints.practiceFrequencyPerWeek} practice(s)/training session(s) per week. Total training stress must account for field/court load.`);
  }

  parts.push(`\n**VALIDATION REQUIREMENTS (YOU MUST CHECK THESE BEFORE OUTPUTTING JSON):**`);
  if (constraints.daysPerWeek !== null) {
    parts.push(`☑ Count: days array length === ${constraints.daysPerWeek}. STOP and recount if unsure. If wrong, fix before output.`);
  }
  if (constraints.primaryGoal) {
    parts.push(`☑ programName and description reflect "${constraints.primaryGoal}" — NOT a different goal`);
  }
  if (constraints.sportFocus) {
    if (constraints.isOlderAdult) {
      parts.push(`☑ programName or description references BOTH "${constraints.sportFocus}" sport support AND age-aware/joint-friendly design`);
      parts.push(`☑ NO explosive plyometrics, NO high-impact landings, NO max-strength barbell patterns (barbell deadlift 1–6 reps, etc.)`);
    } else {
      parts.push(`☑ programName or description references "${constraints.sportFocus}" or sport support`);
    }
  }
  if (constraints.isOlderAdult) {
    parts.push(`☑ ZERO prohibited exercises: no box jumps, no power cleans, no conventional barbell deadlift at 1–6 reps, no unscaled pull-ups as primary, no heavy Bulgarian split squat`);
    parts.push(`☑ Rep ranges are 8–12 for compounds, 12–15 for accessories — NOT aggressive 1–6 loading`);
    parts.push(`☑ Coach notes acknowledge the user's age and explain the age-aware programming rationale`);
  }
  if (constraints.seasonContext) {
    parts.push(`☑ programName or description includes the season phase (off-season, pre-season, in-season, etc.)`);
    parts.push(`☑ Volume, intensity, and exercise selection MATCH the ${constraints.seasonContext} programming rules`);
    parts.push(`☑ Day names and coach notes REFLECT the season phase — not generic fitness language`);
  }
  parts.push(`☑ NO invented constraints (no hypertrophy if strength was requested, no 4 days if 3 were requested)`);

  parts.push(`\n**BUILD CONTRACT RESPONSE FORMAT:**`);
  parts.push(`STEP 1: Output the complete JSON program block.`);
  parts.push(`STEP 2: Confirm what was built in 2–3 lines. Be specific about AGE-AWARE design if applicable. Example:`);
  if (constraints.isOlderAdult && constraints.sportFocus && constraints.daysPerWeek) {
    parts.push(`"Built a ${constraints.daysPerWeek}-day ${constraints.sportFocus} performance program with age-aware joint-friendly design for a ${constraints.userAge}-year-old. I biased the plan toward low-impact power, lateral stability, and recoverable strength — keeping the sport athleticism but through safe, sustainable movements. Check the Program tab."`);
    parts.push(`After the program, ask ONE smart follow-up: "Since you're ${constraints.userAge}, I kept this joint-friendly and low-impact by default. ${!constraints.equipment ? `Do you have full gym access, or should I scale this to dumbbells, bands, and bodyweight?` : `Want me to adjust anything — volume, intensity, or specific exercises?`}"`);
  } else if (constraints.sportFocus && constraints.seasonContext && constraints.daysPerWeek) {
    const seasonLabels: Record<string, string> = {
      off_season: "off-season",
      pre_season: "pre-season",
      in_season: "in-season",
      post_season: "post-season",
      return_to_play: "return-to-play",
    };
    parts.push(`"Built a ${constraints.daysPerWeek}-day ${constraints.sportFocus} ${seasonLabels[constraints.seasonContext]} program. Check the Program tab."`);
  } else if (constraints.sportFocus && constraints.primaryGoal && constraints.daysPerWeek) {
    parts.push(`"Built a ${constraints.daysPerWeek}-day ${constraints.primaryGoal} program with ${constraints.sportFocus} performance support. Check the Program tab."`);
  } else if (constraints.daysPerWeek && constraints.primaryGoal) {
    parts.push(`"Built a ${constraints.daysPerWeek}-day ${constraints.primaryGoal} program. Check the Program tab."`);
  }
  if (!(constraints.isOlderAdult && constraints.sportFocus)) {
    parts.push(`STEP 3: Ask exactly ONE refinement question about something not yet stated. Priority order:`);
    if (constraints.sportFocus && !constraints.seasonContext) {
      parts.push(`→ Season context is missing for a sport athlete — ask: "Are you in-season, off-season, or pre-season right now? I'll adjust the volume and intensity to match."`);
    } else if (!constraints.equipment) {
      parts.push(`→ Example: "Do you have full gym access, or should I adjust for limited equipment?"`);
    } else if (!constraints.sessionDuration) {
      parts.push(`→ Example: "How long are your sessions — 45 minutes or closer to an hour?"`);
    } else {
      parts.push(`→ Example: "Want me to adjust anything — volume, split structure, or exercise selection?"`);
    }
  }
  parts.push(`\nCRITICAL: Do NOT ask multiple questions. Do NOT ask about equipment AND experience AND days all at once. ONE question only.`);
  parts.push(`NEVER describe the wrong program. If you built a strength program, say strength — not hypertrophy.`);
  parts.push(`NEVER delay building with questions. The program MUST be output before any follow-up question.`);

  return parts.join("\n");
}

// ─── Intent Types ──────────────────────────────────────────────────────────────

export type IntentType =
  | "CREATE_PROGRAM"
  | "EDIT_PROGRAM"
  | "ADJUST_FOR_READINESS"
  | "ADJUST_FOR_PAIN"
  | "GENERAL_COACHING_QUESTION"
  | "RETRIEVE_CURRENT_PROGRAM"
  | "SAVE_PROGRAM"
  | "START_NEW_PROGRAM"
  | "CLARIFICATION_FOLLOWUP";

export interface IntentResult {
  type: IntentType;
  confidence: "high" | "medium" | "low";
  editSubtype?: string;
  metadata?: Record<string, unknown>;
}

export interface ClassificationContext {
  hasActiveProgram: boolean;
  conversationTurnCount: number;
}

// ─── Edit Subtype Classification ────────────────────────────────────────────

export type EditSubtype =
  | "add_core"
  | "add_hamstrings"
  | "add_calves"
  | "add_glutes"
  | "add_upper_back"
  | "add_shoulders"
  | "add_conditioning"
  | "swap_exercise"
  | "remove_exercise"
  | "shorten_sessions"
  | "lengthen_sessions"
  | "reduce_fatigue"
  | "increase_volume"
  | "make_more_athletic"
  | "make_more_strength"
  | "make_more_hypertrophy"
  | "reduce_frequency"
  | "increase_frequency"
  | "structural_edit"
  | "program_transformation"
  | "general_modification";

export interface StructuralEditMetadata {
  targetSplit: "full_body" | "upper_lower" | "ppl" | "push_pull" | "unknown";
  targetDays: number | null;
  targetGoalShift: "athletic" | "fat_loss" | "strength" | "hypertrophy" | "conditioning" | null;
  targetSport: string | null;
  preserveExercises: boolean;
}

// ─── Season Context Detection ─────────────────────────────────────────────────

export function detectSeasonContext(lower: string): SeasonContext | null {
  // Return to play — check first, most specific
  if (/\b(return to play|return from injury|coming back from|recovering from|rehab|rehabbing|post.?injury)\b/.test(lower)) return "return_to_play";

  // Post-season
  if (/\b(post.?season|after (the )?season|season (is |just |just ended|over|done|finished)|off for (the )?season|took time off|end of (the )?season)\b/.test(lower)) return "post_season";

  // In-season — explicit
  if (/\b(in.?season|during (the )?season|mid.?season|playing season|currently (playing|competing)|have games?|have matches?|playing (now|right now|this (week|month|season)))\b/.test(lower)) return "in_season";

  // In-season — inferred from game/match frequency
  if (/\b(\d)\s*(?:games?|matches?)\s*(?:a|per)\s*week\b/.test(lower)) return "in_season";

  // Pre-season
  if (/\b(pre.?season|before (the )?season|preseason|getting ready for (the )?season|season (starts|begins|is coming|coming up)|preparing for (the )?season)\b/.test(lower)) return "pre_season";

  // Off-season — explicit
  if (/\b(off.?season|offseason|no (games?|season|matches?)|between seasons?|not (currently )?playing|out of season|training (for )?next season)\b/.test(lower)) return "off_season";

  return null;
}

// ─── Sport Detection ──────────────────────────────────────────────────────────

// Maps the normalizer's canonical sport IDs → the legacy sport IDs this system uses.
// Legacy IDs are preserved to avoid breaking downstream prompt/profile code.
const NORMALIZER_TO_LEGACY_SPORT: Record<string, string> = {
  football: "american_football",
  flag_football: "american_football",
  soccer: "soccer",
  basketball: "basketball",
  baseball: "baseball",
  baseball_pitcher: "baseball",
  softball: "baseball",
  hockey: "hockey",
  rugby: "rugby",
  lacrosse: "lacrosse",
  volleyball: "volleyball",
  tennis: "tennis",
  padel: "tennis",
  pickleball: "pickleball",
  badminton: "badminton",
  squash: "squash",
  bowling: "bowling",
  wrestling: "combat_sports",
  boxing: "combat_sports",
  mma: "combat_sports",
  cricket: "cricket",
  cricket_bowler: "cricket",
  cricket_batter: "cricket",
  cricket_wicketkeeper: "cricket",
  golf: "golf",
  swimming: "swimming",
  track: "track",
  rowing: "rowing",
  cycling: "cycling",
};

export function detectSport(lower: string): string | null {
  // American football must be checked before generic "football" to avoid ambiguity
  if (/\b(american football|nfl|gridiron|quarterback|wide receiver|running back|linebacker|tight end|offensive line|defensive back|cornerback|safety|halfback|fullback)\b/.test(lower)) return "american_football";
  // Soccer — "football" is intentionally excluded here to prevent American football
  // players from being misclassified as soccer athletes
  if (/\b(soccer|futbol)\b/.test(lower)) return "soccer";
  // Generic "football" in isolation defaults to American football (most common
  // meaning in the primary US user context — separate from soccer/futbol)
  if (/\bfootball\b/.test(lower)) return "american_football";
  if (/\b(basketball|hoops|court|baller|hooper)\b/.test(lower)) return "basketball";
  if (/\b(baseball|softball|pitcher|batter|ballplayer)\b/.test(lower)) return "baseball";
  if (/\b(tennis|racket|racquet)\b/.test(lower)) return "tennis";
  if (/\b(swimming|swim|pool|swimmer)\b/.test(lower)) return "swimming";
  if (/\b(track|sprint|sprinting|running|runner|sprinter)\b/.test(lower)) return "track";
  if (/\b(hockey|ice hockey|field hockey)\b/.test(lower)) return "hockey";
  if (/\b(golf|golfer)\b/.test(lower)) return "golf";
  if (/\b(mma|jiu.?jitsu|bjj|wrestling|wrestler|judo|boxing|boxer|martial arts|combat|fighter)\b/.test(lower)) return "combat_sports";
  if (/\b(volleyball|beach volleyball)\b/.test(lower)) return "volleyball";
  if (/\b(lacrosse|laxer|lax)\b/.test(lower)) return "lacrosse";
  if (/\b(rowing|crew|rower)\b/.test(lower)) return "rowing";
  if (/\b(cycling|biking|cyclist)\b/.test(lower)) return "cycling";
  if (/\b(rugby|rugger)\b/.test(lower)) return "rugby";
  if (/\b(cricket|cricketer)\b/.test(lower)) return "cricket";
  if (/\b(pickleball|pickle)\b/.test(lower)) return "pickleball";
  if (/\b(badminton)\b/.test(lower)) return "badminton";

  // Fallback: use the sport language normalizer to catch player-identity words
  // (e.g. "I'm a golfer", "I play lacrosse", role words like "setter", "bowler")
  // that the regex patterns above don't cover.
  try {
    const resolved = getBestSportResolution(lower);
    if (resolved?.canonicalSportId) {
      return NORMALIZER_TO_LEGACY_SPORT[resolved.canonicalSportId] ?? resolved.canonicalSportId;
    }
  } catch {
    // Never let normalizer errors bubble into intent extraction
  }

  return null;
}

// ─── Main Classifier ────────────────────────────────────────────────────────

export function classifyIntent(
  message: string,
  context: ClassificationContext
): IntentResult {
  const lower = normalizeSpokenNumbers(message.toLowerCase().trim());

  // ── Priority 1: SAVE_PROGRAM ─────────────────────────────────────────────
  if (matchesSaveProgram(lower)) {
    logger.debug("[IntentRouter] → SAVE_PROGRAM");
    return { type: "SAVE_PROGRAM", confidence: "high" };
  }

  // ── Priority 2: RETRIEVE_CURRENT_PROGRAM ─────────────────────────────────
  if (matchesRetrieveProgram(lower)) {
    logger.debug("[IntentRouter] → RETRIEVE_CURRENT_PROGRAM");
    return { type: "RETRIEVE_CURRENT_PROGRAM", confidence: "high" };
  }

  // ── Priority 3: START_NEW_PROGRAM ────────────────────────────────────────
  if (matchesStartNewProgram(lower)) {
    logger.debug("[IntentRouter] → START_NEW_PROGRAM");
    return { type: "START_NEW_PROGRAM", confidence: "high" };
  }

  // ── Priority 4: ADJUST_FOR_PAIN ──────────────────────────────────────────
  const painResult = matchesPainAdjustment(lower);
  if (painResult.matched) {
    logger.debug({ bodyPart: painResult.bodyPart }, "[IntentRouter] → ADJUST_FOR_PAIN");
    return {
      type: "ADJUST_FOR_PAIN",
      confidence: painResult.confidence,
      metadata: { bodyPart: painResult.bodyPart },
    };
  }

  // ── Priority 4.5: CREATE_PROGRAM (high-confidence explicit signals) ───────
  // Must run BEFORE edit-program checks because patterns like
  // "build me a strength-focused program" or "give me an athletic plan" can
  // accidentally match EDIT_PROGRAM patterns (strength.focus, make.*athletic, etc.)
  // before reaching the CREATE_PROGRAM check at the old Priority 7.
  // Explicit creation verb: "build/create/design/generate/write/draft me a program"
  const explicitCreateVerb =
    /\b(build|create|design|generate|write|put together|develop|set up|draft)\b.{0,50}\b(program|plan|routine|workout|split|schedule|training)\b/i;
  // "give me / make me / get me a [new/custom/...] program"
  const explicitGiveMe =
    /\b(give me|make me|get me)\b.{0,30}\b(a|an|new|custom|personalized)\b.{0,30}\b(program|plan|routine|workout|split|training)\b/i;
  // Split-style phrasing: "3-day program", "upper/lower split", "PPL routine", "full body plan"
  const splitStyleRequest =
    /\b(\d[\-–]?day|upper[\s\-]?lower|push[\s\-]?pull[\s\-]?legs?|ppl|full[\s\-]?body|bro[\s\-]?split)\b.{0,30}\b(program|plan|routine|split|workout)\b/i;
  // "I want/need/am looking for a [new] program/plan" — indefinite article signals new, not edit
  const wantNeedProgram =
    /\b(i want|i need|i.m looking for|i.m after|looking for|need)\b.{0,30}\b(a|an|new)\b.{0,30}\b(program|plan|routine|workout|training)\b/i;
  // "can you build/create/make me a program"
  const canYouBuild =
    /\b(can you|could you|help me)\b.{0,30}\b(build|create|design|make|write|put together)\b.{0,30}\b(program|plan|routine|workout|training)\b/i;

  if (
    explicitCreateVerb.test(lower) ||
    explicitGiveMe.test(lower) ||
    splitStyleRequest.test(lower) ||
    wantNeedProgram.test(lower) ||
    canYouBuild.test(lower)
  ) {
    logger.debug("[IntentRouter] → CREATE_PROGRAM (explicit high-confidence signal before edit check)");
    return { type: "CREATE_PROGRAM", confidence: "high" };
  }

  // ── Priority 5: ADJUST_FOR_READINESS ─────────────────────────────────────
  const readinessResult = matchesReadinessAdjustment(lower);
  if (readinessResult.matched) {
    logger.debug({ signal: readinessResult.signal }, "[IntentRouter] → ADJUST_FOR_READINESS");
    return {
      type: "ADJUST_FOR_READINESS",
      confidence: readinessResult.confidence,
      metadata: { signal: readinessResult.signal },
    };
  }

  // ── Priority 6a: EDIT_PROGRAM (structural) ───────────────────────────────
  // Run structural detection first — it's more specific and higher stakes
  if (context.hasActiveProgram) {
    const structuralResult = matchesStructuralEdit(lower);
    if (structuralResult.matched) {
      logger.info(
        {
          targetSplit: structuralResult.meta.targetSplit,
          targetDays: structuralResult.meta.targetDays,
          targetGoalShift: structuralResult.meta.targetGoalShift,
        },
        "[IntentRouter] → EDIT_PROGRAM (structural_edit)"
      );
      return {
        type: "EDIT_PROGRAM",
        confidence: structuralResult.confidence,
        editSubtype: "structural_edit",
        metadata: structuralResult.meta as unknown as Record<string, unknown>,
      };
    }
  }

  // ── Priority 6b: EDIT_PROGRAM (program_transformation) ──────────────────
  // Intercepts broad goal/focus shift requests BEFORE atomic patterns.
  // "I want to focus more on endurance" should NOT be routed to a surgical
  // entity-level edit (add_conditioning) that always fails with 0 applied
  // changes. Instead, this routes to the block-level edit engine with explicit
  // transformation instructions.
  if (context.hasActiveProgram) {
    const transformResult = matchesProgramTransformation(lower);
    if (transformResult.matched) {
      logger.info(
        { direction: transformResult.direction },
        "[IntentRouter] → EDIT_PROGRAM (program_transformation)"
      );
      return {
        type: "EDIT_PROGRAM",
        confidence: "high",
        editSubtype: "program_transformation",
        metadata: { direction: transformResult.direction },
      };
    }
  }

  // ── Priority 6c: EDIT_PROGRAM (atomic) ───────────────────────────────────
  const editResult = matchesEditProgram(lower, context.hasActiveProgram);
  if (editResult.matched) {
    logger.debug({ editSubtype: editResult.subtype, confidence: editResult.confidence }, "[IntentRouter] → EDIT_PROGRAM");
    return {
      type: "EDIT_PROGRAM",
      confidence: editResult.confidence,
      editSubtype: editResult.subtype,
    };
  }

  // ── Priority 6d: EDIT_PROGRAM (training signal fallback) ─────────────────
  // Broad vibe-based catch for when there is an active program and the user's
  // message combines ANY modification-intent word with ANY training quality
  // term. Regex can never enumerate every way a person phrases a request
  // ("lean it into power", "gear it toward explosiveness", "I want it hitting
  // harder on strength", etc.).  Rather than chasing every phrasing, we check
  // two loose signals: (a) the user is indicating change/direction, and
  // (b) a training quality is named.  The edit engine's own AI layer then
  // figures out exactly what to change — we just need to route correctly.
  if (context.hasActiveProgram) {
    const trainingSignalResult = matchesTrainingSignalEdit(lower);
    if (trainingSignalResult.matched) {
      logger.info(
        { direction: trainingSignalResult.direction, trigger: trainingSignalResult.trigger },
        "[IntentRouter] → EDIT_PROGRAM (training_signal_fallback)"
      );
      return {
        type: "EDIT_PROGRAM",
        confidence: "medium",
        editSubtype: "program_transformation",
        metadata: { direction: trainingSignalResult.direction, via: "training_signal_fallback" },
      };
    }
  }

  // ── Priority 7: CREATE_PROGRAM ───────────────────────────────────────────
  const createResult = matchesCreateProgram(lower, context);
  if (createResult.matched) {
    logger.debug("[IntentRouter] → CREATE_PROGRAM");
    return { type: "CREATE_PROGRAM", confidence: createResult.confidence };
  }

  // ── Priority 8: GENERAL_COACHING_QUESTION ────────────────────────────────
  logger.debug("[IntentRouter] → GENERAL_COACHING_QUESTION (default)");
  return { type: "GENERAL_COACHING_QUESTION", confidence: "medium" };
}

// ─── Intent Matchers ─────────────────────────────────────────────────────────

function matchesSaveProgram(lower: string): boolean {
  return /\b(save|save this|save my program|save the program|save it|lock this in|keep this|store (this|my) program)\b/.test(lower);
}

function matchesRetrieveProgram(lower: string): boolean {
  return /\b(show me|show|display|see|view|get|pull up|what('s| is| does| are)|remind me).{0,30}\b(my|the|current|this|existing)\b.{0,20}\b(program|plan|routine|workout|split|schedule)\b/.test(lower)
    || /\b(my (current|existing|active|latest) (program|plan|routine|workout))\b/.test(lower)
    || /\b(what (do|does) (my|the) program look like)\b/.test(lower)
    || /\bshow (me )?(my |the )?(current |active |existing )?program\b/.test(lower);
}

function matchesStartNewProgram(lower: string): boolean {
  return /\b(start (over|fresh|new|from scratch)|new program|fresh (start|program)|reset (my )?(program|plan)|scrap (this|the|it)|let.s start over|start from scratch|completely new)\b/.test(lower)
    && !/\b(add|swap|change|modify|adjust|fix|update)\b/.test(lower);
}

function matchesPainAdjustment(lower: string): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  bodyPart?: string;
} {
  const bodyPartPatterns: Record<string, RegExp> = {
    shoulder: /\b(shoulder|rotator cuff|ac joint|deltoid)\b/,
    knee: /\b(knee|patellar|patella|mcl|acl|meniscus|kneecap)\b/,
    lower_back: /\b(lower back|lumbar|l4|l5|disc|herniat|back pain)\b/,
    hip: /\b(hip|glute|piriformis|it.?band|iliotibial|hip flexor)\b/,
    wrist: /\b(wrist|forearm|carpal)\b/,
    elbow: /\b(elbow|tennis elbow|golfer.s elbow|lateral epicondyl)\b/,
    ankle: /\b(ankle|achilles|plantar|foot)\b/,
    neck: /\b(neck|cervical|traps?|trapezius)\b/,
  };

  const painSignals = /\b(pain|hurt|hurts|hurting|ache|aching|sore|soreness|injury|injured|strain|sprain|tweak|tweaked|flare|flaring|aggravate|bother|bothering|issue|problem|tight|tightness|uncomfortable|discomfort|inflamed|inflammation|swollen)\b/;
  const acuteSignals = /\b(this week|today|right now|lately|recently|just|started|developed|new|sudden)\b/;

  if (!painSignals.test(lower)) return { matched: false, confidence: "low" as const };

  for (const [part, pattern] of Object.entries(bodyPartPatterns)) {
    if (pattern.test(lower)) {
      const isAcute = acuteSignals.test(lower);
      return {
        matched: true,
        confidence: isAcute ? "high" : "medium",
        bodyPart: part,
      };
    }
  }

  // Pain mentioned but no specific body part identified
  return { matched: true, confidence: "medium", bodyPart: "unspecified" };
}

function matchesReadinessAdjustment(lower: string): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  signal?: string;
} {
  const readinessPatterns: Array<{ signal: string; pattern: RegExp }> = [
    { signal: "poor_sleep", pattern: /\b(slept (badly|poorly|terribly|bad|little)|bad sleep|poor sleep|didn.t sleep|no sleep|sleep deprived|sleep deprivation|insomnia|4 hours?|3 hours?|couldn.t sleep|trouble sleeping|woke up|restless night)\b/ },
    { signal: "high_fatigue", pattern: /\b(exhausted|drained|wiped out|run down|burnout|burnt out|overtrained|overreaching|too tired|very tired|extremely tired|fatigued|no energy today|feeling flat|empty tank)\b/ },
    { signal: "illness", pattern: /\b(sick|ill|fever|cold|flu|under the weather|not feeling well|feeling off|stomach|nauseous|congested)\b/ },
    { signal: "high_stress", pattern: /\b(stressed( out)?|high stress|anxious|anxiety|mentally drained|busy week|crazy week|overwhelming)\b/ },
    { signal: "poor_recovery", pattern: /\b(still sore|not recovered|haven.t recovered|muscles? (are )?(still |super |really )?(sore|tight)|legs? (are )?(dead|toast|shot|cooked)|can.t (recover|bounce back))\b/ },
    { signal: "travel", pattern: /\b(travel(ling|ed|ing)?|jet lag(ged)?|long flight|on the road|different time zone|hotel gym)\b/ },
  ];

  const readinessModifiers = /\b(today|this week|right now|at the moment|currently|lately|this morning)\b/;

  for (const { signal, pattern } of readinessPatterns) {
    if (pattern.test(lower)) {
      const hasTemporalContext = readinessModifiers.test(lower);
      return {
        matched: true,
        confidence: hasTemporalContext ? "high" : "medium",
        signal,
      };
    }
  }

  return { matched: false, confidence: "low" as const };
}

// ─── Program Transformation Detection ────────────────────────────────────────
//
// Detects broad goal/focus shift requests that affect the entire program's
// direction, emphasis, or energy system bias. These are NOT surgical edits
// (no specific exercise or session targeted) — they require block-level or
// system-level restructuring by the edit engine.
//
// Runs BEFORE atomic edit pattern matching to prevent requests like
// "I want to focus more on endurance" from being misclassified as
// add_conditioning (surgical) and then failing with 0 applied changes.

const TRANSFORMATION_PATTERNS: Array<{ pattern: RegExp; direction: string }> = [
  // Endurance / aerobic focus
  { pattern: /\bfocus\s+(?:more\s+)?on\s+(?:endurance|aerobic|cardio\s+(?:capacity|fitness))\b/i, direction: "endurance" },
  { pattern: /\bmore\s+endurance[\s-](?:based?|focused?|work|training|oriented|heavy)\b/i, direction: "endurance" },
  { pattern: /\bmore\s+aerobic[\s-](?:based?|focused?|work|training|oriented|heavy)\b/i, direction: "endurance" },
  { pattern: /\bshift(?:ing)?\s+(?:toward?|to(?:ward)?)\s+(?:endurance|aerobic)\b/i, direction: "endurance" },
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:endurance|aerobic)[\s-](?:based?|focused?|oriented?)\b/i, direction: "endurance" },
  { pattern: /\bwant\s+(?:to\s+(?:build|develop|improve))?\s*(?:my\s+)?endurance\s+(?:more|further)?\b/i, direction: "endurance" },

  // Conditioning focus (distinct from "add a conditioning block" — this is a whole-program pivot)
  { pattern: /\bmore\s+conditioning[\s-](?:based?|focused?|heavy|oriented)\b/i, direction: "conditioning" },
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?conditioning[\s-](?:based?|focused?)\b/i, direction: "conditioning" },
  { pattern: /\bshift(?:ing)?\s+(?:toward?|to(?:ward)?)\s+conditioning\b/i, direction: "conditioning" },
  { pattern: /\bfocus\s+(?:more\s+)?on\s+(?:overall\s+)?conditioning\b/i, direction: "conditioning" },

  // Power / explosiveness focus
  { pattern: /\bfocus\s+(?:more\s+)?on\s+(?:power|explosiveness?)\b/i, direction: "power" },
  { pattern: /\bmore\s+(?:power|explosive(?:ness)?)[\s-](?:based?|focused?|work|training|oriented|heavy)\b/i, direction: "power" },
  { pattern: /\bshift(?:ing)?\s+(?:toward?|to(?:ward)?)\s+(?:power|explosiveness?)\b/i, direction: "power" },
  { pattern: /\bwant\s+(?:to\s+be\s+|to\s+get\s+)?more\s+(?:explosive|powerful)\b/i, direction: "power" },
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:power|explosive)[\s-](?:based?|focused?|oriented?)\b/i, direction: "power" },
  // "make it more for power/explosiveness" — casual phrasing not covered above
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?(?:power|explosiveness?|explosive)\b/i, direction: "power" },
  { pattern: /\b(?:more|geared)\s+(?:toward[s]?\s+|for\s+)?(?:power|explosiveness?|explosive\s+(?:work|training))\b/i, direction: "power" },
  { pattern: /\bpower(?:ful|fulness)?\s+(?:focused|based|training|development|work|program)\b/i, direction: "power" },

  // Speed focus
  { pattern: /\bfocus\s+(?:more\s+)?on\s+speed\b/i, direction: "speed" },
  { pattern: /\bmore\s+speed[\s-](?:based?|focused?|work|training|oriented)\b/i, direction: "speed" },
  { pattern: /\bshift(?:ing)?\s+(?:toward?|to(?:ward)?)\s+speed\b/i, direction: "speed" },

  // Hypertrophy focus (as a global program shift, not "add isolation work")
  { pattern: /\bfocus\s+(?:more\s+)?on\s+(?:hypertrophy|muscle\s+(?:building|growth|gain))\b/i, direction: "hypertrophy" },
  { pattern: /\bmore\s+hypertrophy[\s-](?:based?|focused?|heavy|oriented)\b/i, direction: "hypertrophy" },
  { pattern: /\bshift(?:ing)?\s+(?:toward?|to(?:ward)?)\s+(?:hypertrophy|muscle\s+(?:building|growth))\b/i, direction: "hypertrophy" },
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?hypertrophy[\s-](?:based?|focused?)\b/i, direction: "hypertrophy" },

  // Strength focus (as a program-wide shift)
  { pattern: /\bfocus\s+(?:more\s+)?on\s+(?:pure\s+)?strength\b/i, direction: "strength" },
  { pattern: /\bshift(?:ing)?\s+(?:toward?|to(?:ward)?)\s+(?:pure\s+)?strength\b/i, direction: "strength" },
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?strength[\s-](?:based?|focused?)\b/i, direction: "strength" },
  // "make it more for strength" — casual phrasing
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?(?:strength|strength\s+training)\b/i, direction: "strength" },
  { pattern: /\b(?:more|geared)\s+(?:toward[s]?\s+|for\s+)?strength(?:\s+training)?\b/i, direction: "strength" },

  // Hypertrophy focus — add "for X" casual phrasing
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?(?:hypertrophy|muscle\s+(?:building|growth|gain))\b/i, direction: "hypertrophy" },
  { pattern: /\b(?:more|geared)\s+(?:toward[s]?\s+|for\s+)?(?:hypertrophy|muscle\s+(?:building|growth|gain))\b/i, direction: "hypertrophy" },

  // Speed focus — add "for X" casual phrasing
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?speed\b/i, direction: "speed" },
  { pattern: /\b(?:more|geared)\s+(?:toward[s]?\s+|for\s+)?speed(?:\s+(?:work|training|development))?\b/i, direction: "speed" },

  // Overall intensity (program-wide)
  { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more|less)\s+intense(?:ity)?\b/i, direction: "intensity" },
  { pattern: /\b(?:increase|raise|bump\s+up)\s+(?:the\s+)?(?:overall\s+)?intensity(?:\s+(?:of\s+(?:the\s+)?)?(?:program|training))?\b/i, direction: "intensity" },

  // Overall volume (program-wide — distinct from "reduce one set")
  { pattern: /\b(?:reduce|lower|decrease)\s+(?:the\s+)?(?:overall\s+)?(?:volume|load|workload)\s+(?:across\s+(?:the\s+)?(?:program|week)|throughout|overall|program[\s-]wide)\b/i, direction: "volume_reduction" },
  { pattern: /\b(?:increase|raise|add)\s+(?:the\s+)?(?:overall\s+)?(?:volume|workload)\s+(?:across\s+(?:the\s+)?(?:program|week)|throughout|overall|program[\s-]wide)\b/i, direction: "volume_increase" },
];

function matchesProgramTransformation(lower: string): { matched: boolean; direction: string } {
  for (const { pattern, direction } of TRANSFORMATION_PATTERNS) {
    if (pattern.test(lower)) {
      return { matched: true, direction };
    }
  }
  return { matched: false, direction: "" };
}

// ─── Structural Edit Detection ───────────────────────────────────────────────
//
// Handles high-level program restructuring requests:
//   "make this full body", "convert to upper/lower", "change to 3 days", etc.
// These are detected BEFORE atomic edit patterns because they require a full
// program redesign rather than a surgical modification.

function matchesStructuralEdit(lower: string): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  meta: StructuralEditMetadata;
} {
  const noMatch = {
    matched: false,
    confidence: "low" as const,
    meta: { targetSplit: "unknown" as const, targetDays: null, targetGoalShift: null, targetSport: null, preserveExercises: true },
  };

  // ── Split type conversion ──────────────────────────────────────────────────
  const fullBodyPattern = /\b(more full.?body|make.{0,20}full.?body|convert.{0,20}(to|into).{0,20}full.?body|full.?body (split|structure|approach|program|style)|full.?body it|go full.?body|switch.{0,20}full.?body|prefer.{0,20}full.?body|rather.{0,30}full.?body|want.{0,20}full.?body)\b/i;
  const upperLowerPattern = /\b(upper.lower|upper\/lower|convert.{0,20}(to|into).{0,20}upper.lower|make.{0,20}upper.lower|upper lower split)\b/i;
  const pplPattern = /\b(push.pull.legs?|ppl.split|ppl.program|convert.{0,20}(to|into).{0,20}(ppl|push.pull))\b/i;
  const pushPullPattern = /\b(push.pull (split|program|style)|convert.{0,20}(to|into).{0,20}push.pull(?!.legs))\b/i;

  // ── Implicit full-body intent — natural language expressions ─────────────
  // These don't use "full body" explicitly but clearly mean more integration
  const implicitFullBodyPattern = /\b(hit.{0,20}everything.{0,20}(more often|each (day|session|workout)|every (day|session))|train.{0,20}everything.{0,20}(more|each|every)|feels?.{0,20}too (split|isolated|separated|broken up|chopped up)|too (isolated|split|separated|siloed)|want.{0,30}(more integrated|more balanced|hit more muscle)|more.{0,20}(integrated|balanced).{0,20}(approach|sessions?|structure)|each (session|day).{0,20}(more|full|complete|comprehensive))\b/i;

  // ── Goal/orientation shift ─────────────────────────────────────────────────
  const fatLossPattern = /\b(more.{0,20}(fat.loss|fat burning|weight.loss|cutting|calorie burning)|better for (fat.loss|cutting|losing weight|burning fat)|fat.loss (focus|oriented|style|version))\b/i;
  const conditioningPattern = /\b(more conditioning focused|conditioning.first|more.{0,20}conditioning|conditioning.heavy|prioritize conditioning|sport.specific conditioning)\b/i;
  const performancePattern = /\b(better for performance|performance.focused|performance.based|more performance|athletic performance|sport performance)\b/i;
  const hypertrophyShiftPattern = /\b(less bodybuilding|more bodybuilding|more.{0,20}muscle building|muscle.building focus|hypertrophy.first|bodybuilding style program)\b/i;
  const strengthShiftPattern = /\b(more powerlifting|powerlifting.style|strength.first|strength.focused program|strength.only|pure strength|upper body strength|lower body strength|want.{0,20}strength)\b/i;

  // ── Structural ambiguity (medium confidence only if has active program) ────
  const structuralVagueness = /\b(restructure|reorganize|redesign|rebalance|rethink|completely change.{0,20}structure|change.{0,20}structure|different structure|different split|different layout|different setup)\b/i;

  // ─────────────────────────────────────────────────────────────────────────

  let targetSplit: StructuralEditMetadata["targetSplit"] = "unknown";
  let targetDays: number | null = null;
  let targetGoalShift: StructuralEditMetadata["targetGoalShift"] = null;
  let targetSport: string | null = null;

  if (fullBodyPattern.test(lower) || implicitFullBodyPattern.test(lower)) targetSplit = "full_body";
  else if (upperLowerPattern.test(lower)) targetSplit = "upper_lower";
  else if (pplPattern.test(lower)) targetSplit = "ppl";
  else if (pushPullPattern.test(lower)) targetSplit = "push_pull";

  const dayMatch = lower.match(/\b(\d)\s*[\-–]?\s*day\b|\b(\d)\s*days?\s*(a|per)\s*week\b/i);
  if (dayMatch) {
    const raw = parseInt(dayMatch[1] ?? dayMatch[2] ?? "", 10);
    if (raw >= 2 && raw <= 7) targetDays = raw;
  }

  if (fatLossPattern.test(lower)) targetGoalShift = "fat_loss";
  else if (conditioningPattern.test(lower) || performancePattern.test(lower)) targetGoalShift = "conditioning";
  else if (hypertrophyShiftPattern.test(lower)) targetGoalShift = "hypertrophy";
  else if (strengthShiftPattern.test(lower)) targetGoalShift = "strength";

  // Sport-specific requests map to athletic goal shift
  targetSport = detectSport(lower);
  const hasSportRequest = targetSport !== null && /\b(for|train(ing)?|optimize|help|prep(are)?|focus|built|program|geared)\b/.test(lower);
  if (hasSportRequest && !targetGoalShift) targetGoalShift = "athletic";

  const hasSplitChange = targetSplit !== "unknown";
  const hasDayChange = targetDays !== null;
  const hasGoalShift = targetGoalShift !== null;
  const hasVagueStructural = structuralVagueness.test(lower);

  // Split / day-count changes are unambiguous structural edits regardless of scope language.
  if (hasSplitChange || hasDayChange) {
    return {
      matched: true,
      confidence: "high",
      meta: { targetSplit, targetDays, targetGoalShift, targetSport, preserveExercises: true },
    };
  }

  // Goal / orientation / sport / vague structural shifts are only program-wide when the
  // message does NOT target a specific session. Phrases like "add more conditioning to
  // day 3" or "I want strength training on day 3" are atomic session edits — they must
  // NOT be intercepted here and redirected to the structural rewrite path. Without this
  // guard they would pre-empt the high-confidence atomic edit patterns at Priority 6c.
  //
  // Session-specific signals: "day N", "session N", "on/to/for/into day/session N",
  // ordinal day references like "first session", "third day".
  const isSessionSpecific =
    /\b(?:day|session)\s+\d|\b(?:on|to|for|into|add\s+\w+\s+to)\s+(?:day|session)\s+|\b(?:first|second|third|fourth|fifth|sixth|seventh)\s+(?:day|session)\b/i;

  if (hasGoalShift || hasVagueStructural || hasSportRequest) {
    if (isSessionSpecific.test(lower)) {
      return noMatch;
    }
    return {
      matched: true,
      confidence: "medium",
      meta: { targetSplit, targetDays, targetGoalShift, targetSport, preserveExercises: true },
    };
  }

  return noMatch;
}

function matchesEditProgram(lower: string, hasActiveProgram: boolean): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  subtype: EditSubtype;
} {
  const noMatch = { matched: false, confidence: "low" as const, subtype: "general_modification" as EditSubtype };

  // Guard: messages that open with a question word are questions, not edit requests.
  // e.g. "Is this program safe for me?", "Do you think this is too much?",
  //      "Can I do this?", "Should I change anything?", "How does this work?"
  // These should fall through to GENERAL_COACHING_QUESTION, not EDIT_PROGRAM.
  const questionOpener = /^(is|are|do|does|did|can|could|should|would|will|was|were|what|how|why|which|who|when)\b/i;
  if (questionOpener.test(lower.trim())) return noMatch;

  // High-confidence edit patterns — context-independent (clearly surgical modifications)
  const highConfidencePatterns: Array<{ pattern: RegExp; subtype: EditSubtype }> = [
    { pattern: /\b(add|include|insert|put in|incorporate|need|missing|no)\b.{0,40}\b(core|abs|abdominal|trunk|anti.?rotation|anti.?extension)\b/i, subtype: "add_core" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(hamstring|hams|leg curl|nordic|glute.ham|rdl|romanian)\b/i, subtype: "add_hamstrings" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(calv|calves|calf raises?)\b/i, subtype: "add_calves" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(glute|hip thrust|glute bridge|butt)\b/i, subtype: "add_glutes" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(upper back|rhomboid|rear delt|face pull|band pull|scapula)\b/i, subtype: "add_upper_back" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(shoulder|deltoid|press|lateral raise|overhead)\b/i, subtype: "add_shoulders" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(cardio|conditioning|intervals?|hiit|aerobic|endurance|sled|finisher)\b/i, subtype: "add_conditioning" },
    { pattern: /\b(add|include|more|incorporate|want|need)\b.{0,40}\b(jump|jumps|jumping|plyometric|plyometrics|explosive|box jump|broad jump|bound|bounding|hop|hops|hopping|depth jump|vertical)\b/i, subtype: "make_more_athletic" },
    { pattern: /\b(swap|replace|substitute|change|switch|swap out)\b.{0,60}(with|for|to)\b/i, subtype: "swap_exercise" },
    { pattern: /\bswap\b.{0,40}\b(incline|bench|squat|deadlift|press|row|curl|extension|fly|raise|dip|pulldown|pull.up)\b/i, subtype: "swap_exercise" },
    { pattern: /\b(remove|drop|take out|get rid of|cut|eliminate|ditch)\b.{0,40}\b(exercise|movement|it|that|the|this)\b/i, subtype: "remove_exercise" },
    { pattern: /\b(shorten|make.{0,20}shorter|less.{0,20}time|45 min|30 min|reduce.{0,20}(session|time))\b/i, subtype: "shorten_sessions" },
    { pattern: /\b(lengthen|make.{0,20}longer|more.{0,20}time|90 min|longer sessions?)\b/i, subtype: "lengthen_sessions" },
    { pattern: /\b(less.{0,20}(fatiguing|fatigue|volume|intense|demanding|grueling|exhausting)|reduce.{0,20}(volume|fatigue|load))\b/i, subtype: "reduce_fatigue" },
    { pattern: /\b(more.{0,20}(volume|sets|work)|increase.{0,20}(volume|sets)|add.{0,20}(sets|volume))\b/i, subtype: "increase_volume" },
    { pattern: /\b(less.{0,20}(days?|frequency|sessions?)|train.{0,20}(less|fewer)|reduce.{0,20}(frequency|days?))\b/i, subtype: "reduce_frequency" },
    { pattern: /\b(more.{0,20}(days?|frequency|sessions?)|train.{0,20}more|increase.{0,20}(frequency|days?))\b/i, subtype: "increase_frequency" },
    { pattern: /\b(i (just got|got|received|have|looking at)).{0,40}(my|the|this).{0,20}(program|plan|routine|workout)\b/i, subtype: "general_modification" },
    { pattern: /\bthis program\b.{0,60}\b(needs?|should|doesn.t|does not|has no|lacks?)\b/i, subtype: "general_modification" },
    { pattern: /\b(noticed|see|saw|found|realized).{0,40}\b(no|missing|lack|without|not enough)\b/i, subtype: "general_modification" },
    // "Make this/it/day N harder/more challenging/more intense" — broad difficulty escalation requests
    { pattern: /\b(make|make it|make this|make (day|session|week))\b.{0,40}\b(harder|more challenging|more intense|more difficult|more demanding|tougher)\b/i, subtype: "general_modification" },
    // "Add more/extra/some exercises to day N / to this session" — generic exercise addition
    { pattern: /\badd\b.{0,30}\b(more|extra|some|additional)?\b.{0,20}\b(exercises?|movements?|lifts?|work)\b.{0,30}\b(to|on|for|into)\b.{0,20}\b(day|session)\b/i, subtype: "general_modification" },
    // "Add more exercises" without specific day — still clearly an edit
    { pattern: /\badd\s+(?:more|extra|some|additional)\s+(?:exercises?|movements?|lifts?)\b/i, subtype: "general_modification" },
    // "I want to make day N harder" or "day 1 needs to be harder"
    { pattern: /\b(day\s*\d|session\s*\d|week\s*\d)\b.{0,40}\b(harder|tougher|more intense|more challenging|more demanding)\b/i, subtype: "general_modification" },
    // "This session/day feels too easy" — context-sensitive intensity adjustment
    { pattern: /\b(this|today.s|that)?\s*(session|day|workout)\b.{0,30}\b(feels?|seems?|is)\b.{0,20}\b(too easy|not hard enough|not challenging enough|too light|easy)\b/i, subtype: "general_modification" },
  ];

  for (const { pattern, subtype } of highConfidencePatterns) {
    if (pattern.test(lower)) {
      return { matched: true, confidence: "high", subtype };
    }
  }

  // Goal-shift patterns — only treated as edits when an active program already exists.
  // Without a program, "make it more athletic" or "strength-focused" is more likely a new
  // program description that slipped past the CREATE_PROGRAM priority check.
  if (hasActiveProgram) {
    const goalShiftPatterns: Array<{ pattern: RegExp; subtype: EditSubtype }> = [
      { pattern: /\b(more athletic|athletic (focus|training|style)|sport(s)?.specific|explosive|power (work|development)|make.*athletic)\b/i, subtype: "make_more_athletic" },
      { pattern: /\b(more.{0,20}strength|strength.{0,20}focus|heavier|lower reps?|stronger|make.*strength|strength.?based)\b/i, subtype: "make_more_strength" },
      { pattern: /\b(more.{0,20}(hypertrophy|muscle|gains?|size)|make.*hypertrophy|bodybuilding style|pump)\b/i, subtype: "make_more_hypertrophy" },
      // "make it more for power/explosive" — catch casual "for X" phrasing that slips past TRANSFORMATION_PATTERNS
      { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?(?:power|explosiveness?|explosive)\b/i, subtype: "make_more_athletic" },
      { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?(?:strength|strength\s+training)\b/i, subtype: "make_more_strength" },
      { pattern: /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?(?:hypertrophy|muscle\s+(?:building|growth|gain))\b/i, subtype: "make_more_hypertrophy" },
    ];
    for (const { pattern, subtype } of goalShiftPatterns) {
      if (pattern.test(lower)) {
        return { matched: true, confidence: "high", subtype };
      }
    }
  }

  // Medium-confidence: requires active program context to interpret as edit
  if (hasActiveProgram) {
    const mediumConfidencePatterns: Array<{ pattern: RegExp; subtype: EditSubtype }> = [
      { pattern: /\b(fix|tweak|rework|redo|update|revise|edit|adjust|change)\b.{0,40}\b(program|plan|routine|workout|session|day|it|this)\b/i, subtype: "general_modification" },
      { pattern: /\b(can you|could you|please).{0,30}\b(add|swap|remove|change|fix|adjust|shorten|update)\b/i, subtype: "general_modification" },
      { pattern: /\bthis (needs?|should have|is missing|doesn.t have|lacks?)\b/i, subtype: "general_modification" },
      { pattern: /\b(the program|my program|this plan|my plan).{0,40}\b(needs?|should|has no|lacks?|doesn.t)\b/i, subtype: "general_modification" },
      // Natural feedback language — user expressing dissatisfaction or wanting change
      { pattern: /\b(not (loving|feeling|vibing with)|don.t love|don.t like|not (great|ideal|sure about)|feels?.{0,20}(off|wrong|weird|awkward|heavy|too much|not right)|something feels)\b/i, subtype: "general_modification" },
      { pattern: /\b(want.{0,20}(something|it).{0,20}(different|changed|adjusted|tweaked|better|easier|lighter)|make.{0,20}it.{0,20}(feel|work|be).{0,20}(better|different|easier|lighter|harder))\b/i, subtype: "general_modification" },
      { pattern: /\b(sessions? (feel|are).{0,30}(too|very|really).{0,20}(long|hard|heavy|much|intense|fatiguing|exhausting|short|easy|light))\b/i, subtype: "general_modification" },
      { pattern: /\b(i.m (always|usually|often|getting|feeling)).{0,30}(sore|tired|beat up|exhausted|drained|fatigued|smashed)\b/i, subtype: "reduce_fatigue" },
      { pattern: /\b(not enough|need more).{0,40}(recovery|rest|time off|days off)\b/i, subtype: "reduce_fatigue" },
      { pattern: /\b(can.t|don.t have).{0,20}(enough time|that long|that much time|90 min|an hour|the time)\b/i, subtype: "shorten_sessions" },
    ];
    for (const { pattern, subtype } of mediumConfidencePatterns) {
      if (pattern.test(lower)) {
        return { matched: true, confidence: "medium", subtype };
      }
    }
  }

  return noMatch;
}

// ─── Training Signal Fallback ─────────────────────────────────────────────────
//
// Broad vibe-based intent detector. Called as Priority 6d — after all specific
// edit matchers — but ONLY when an active program exists.
//
// The problem with regex-only classification: there are effectively infinite
// natural-language ways to say "make my program more powerful":
//   "lean it into power", "gear it toward explosiveness", "I want it hitting
//   harder on strength", "make it feel more athletic", "push the power side more"
//
// Rather than enumerating every phrasing, we detect TWO independent signals:
//
//   Signal A — MODIFICATION INTENT
//     Any word indicating the user wants to change, shift, or redirect something.
//     ("make", "more", "lean", "push", "gear", "shift", "turn", "take", ...)
//
//   Signal B — TRAINING QUALITY TERM
//     A named training quality or adaptation target.
//     ("power", "explosive", "strength", "speed", "athletic", "endurance", ...)
//
// If BOTH are present in a message from a user who already has a program,
// it is almost certainly a program modification request.  We route it to the
// edit engine (program_transformation) and let the AI inside the engine
// determine exactly what changes to make — it is far better at semantics than
// this classifier.
//
// FALSE-POSITIVE GUARD: Pure coaching/knowledge questions ("what are the
// benefits of power training?", "how do I build more speed?") almost never
// combine a modification-intent verb with a first-person program reference, so
// we also require either a first-person or "it/this/the program" anchor when
// the modification signal alone is ambiguous.

const MODIFICATION_INTENT_SIGNALS = /\b(make|more|shift|lean|push|gear|pivot|turn|take|move|add|bring|go|get|feel|hit|want|need|adjust|change|convert|flip|focus|bias|swing|dial|tune|skew|tilt|weight)\b/i;

const TRAINING_QUALITY_TERMS = /\b(power|powerful|explosive|explosiveness|plyometric|speed|fast|quickness|agility|strength|strong|stronger|athletic|athleticism|performance|endurance|aerobic|cardio|conditioning|hypertrophy|muscle|size|gains?|mass|lean|fat.loss|cutting|metabolic|functional|sport.?specific|reactive|ballistic)\b/i;

// Anchor: user is talking about their own program or themselves, not asking a
// generic coaching question.
const PROGRAM_ANCHOR = /\b(it|this|the program|my program|the plan|my plan|the routine|my routine|i want|i need|i.d like|can you|make it|make this|let.s|we should)\b/i;

function matchesTrainingSignalEdit(lower: string): {
  matched: boolean;
  direction: string;
  trigger: string;
} {
  const noMatch = { matched: false, direction: "general", trigger: "" };

  // Guard: question-form sentences are not edit requests
  const questionOpener = /^(is|are|do|does|did|can|could|should|would|will|was|were|what|how|why|which|who|when)\b/i;
  if (questionOpener.test(lower.trim())) return noMatch;

  const hasModificationIntent = MODIFICATION_INTENT_SIGNALS.test(lower);
  const hasTrainingQuality = TRAINING_QUALITY_TERMS.test(lower);

  if (!hasModificationIntent || !hasTrainingQuality) return noMatch;

  // Require a program anchor to avoid false-positives on pure coaching questions
  // ("how do I get more powerful?") — those rarely have "it / this / the program" refs
  const hasProgramAnchor = PROGRAM_ANCHOR.test(lower);
  if (!hasProgramAnchor) return noMatch;

  // Exclude messages that are clearly pure knowledge questions, not requests for change
  const isKnowledgeQuestion = /\b(what is|what are|how do|how does|why is|why does|can you explain|tell me about|what.s the difference|should i|is it better|which is)\b/i;
  if (isKnowledgeQuestion.test(lower) && !/\b(make|shift|change|adjust|convert)\b/i.test(lower)) return noMatch;

  // Identify the most likely direction from the training quality present
  let direction = "general";
  if (/\b(power|powerful|explosive|explosiveness|plyometric|ballistic|reactive)\b/i.test(lower)) direction = "power";
  else if (/\b(speed|fast|quickness|agility)\b/i.test(lower)) direction = "speed";
  else if (/\b(strength|strong|stronger)\b/i.test(lower)) direction = "strength";
  else if (/\b(endurance|aerobic|cardio)\b/i.test(lower)) direction = "endurance";
  else if (/\b(conditioning|metabolic|sport.?specific)\b/i.test(lower)) direction = "conditioning";
  else if (/\b(athletic|athleticism|performance|functional|reactive)\b/i.test(lower)) direction = "athletic";
  else if (/\b(hypertrophy|muscle|size|gains?|mass)\b/i.test(lower)) direction = "hypertrophy";
  else if (/\b(lean|fat.loss|cutting)\b/i.test(lower)) direction = "fat_loss";

  const qualityMatch = lower.match(TRAINING_QUALITY_TERMS);
  const trigger = qualityMatch ? qualityMatch[0] : "training_quality";

  return { matched: true, direction, trigger };
}

function matchesCreateProgram(lower: string, context: ClassificationContext): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
} {
  const strongCreate = /\b(build|create|design|make|generate|give me|write|put together|develop|set up|draft)\b.{0,40}\b(program|plan|routine|workout|split|schedule|training)\b/i;
  const splitRequest = /\b(\d.?day|upper.lower|push.pull|ppl|full body|bro split)\b.{0,30}\b(program|plan|routine|split|workout)?\b/i;
  const goalWithDays = /\b(train|workout|lift|gym|exercise).{0,40}\b(\d.days?|times? (a|per) week)\b/i;
  const freshRequest = /\b(i want|i need|i.m looking|can you|help me|give me).{0,30}\b(a|an|my|new).{0,20}\b(program|plan|routine|workout)\b/i;

  if (strongCreate.test(lower)) return { matched: true, confidence: "high" };
  if (splitRequest.test(lower)) return { matched: true, confidence: "high" };
  if (goalWithDays.test(lower)) return { matched: true, confidence: "medium" };
  if (freshRequest.test(lower)) return { matched: true, confidence: "medium" };

  // If they have no program yet and say something that sounds like a training goal, treat as create
  if (!context.hasActiveProgram && context.conversationTurnCount <= 2) {
    const goalSignal = /\b(strength|muscle|hypertrophy|performance|athletic|fat loss|body comp|lean|bulk|cut|shred)\b/;
    if (goalSignal.test(lower)) return { matched: true, confidence: "low" };
  }

  return { matched: false, confidence: "low" };
}

// ─── Routing Context Builder ─────────────────────────────────────────────────
// Builds system prompt injections appropriate for each intent type.
// Used by ai.ts to enrich the AI prompt based on the classified intent.

export function buildIntentPromptHint(intent: IntentResult): string | null {
  switch (intent.type) {
    case "ADJUST_FOR_PAIN": {
      const part = (intent.metadata?.bodyPart as string) ?? "unspecified area";
      const partLabel = part.replace("_", " ");
      return `
## SESSION MODIFICATION — PAIN/LIMITATION CONTEXT
The user has flagged a pain or injury concern involving their **${partLabel}**.

Instructions:
- Acknowledge the pain context briefly and professionally
- If you have an active program to modify: adjust exercises that load the affected area, suggest appropriate alternatives
- If you do not: factor this limitation into any program you build
- Do NOT be alarming or dramatic — this is performance coaching, not medical advice
- Remind them to consult a medical professional if appropriate, but keep it brief
- Focus on what they CAN train around the limitation`;
    }

    case "ADJUST_FOR_READINESS": {
      const signal = (intent.metadata?.signal as string) ?? "low_readiness";
      const signalDescriptions: Record<string, string> = {
        poor_sleep: "poor sleep last night",
        high_fatigue: "high accumulated fatigue or burnout",
        illness: "current illness or being under the weather",
        high_stress: "elevated stress levels",
        poor_recovery: "incomplete muscle recovery from previous sessions",
        travel: "travel or schedule disruption",
      };
      const signalDesc = signalDescriptions[signal] ?? "reduced readiness";
      return `
## SESSION MODIFICATION — READINESS CONTEXT
The user has flagged a readiness issue: **${signalDesc}**.

Instructions:
- Acknowledge their situation briefly and normalize it — managing readiness is smart training
- Recommend appropriate training adjustments:
  • Poor sleep/high fatigue → reduce volume 20-30%, avoid max effort, prioritize technique
  • Illness → recommend rest or very light movement only
  • High stress → reduce intensity, stick to lower CNS demand movements
  • Poor recovery → active recovery, mobility, or lighter session
  • Travel → bodyweight or minimal equipment alternatives
- If they have a program: suggest which day/session to scale or swap
- Keep it practical and specific — not generic wellness advice`;
    }

    case "RETRIEVE_CURRENT_PROGRAM":
      return `
## RETRIEVE REQUEST
The user wants to see their current program. Present the active program clearly if it exists in the context. Do not rebuild it from scratch unless asked.`;

    case "START_NEW_PROGRAM":
      return `
## FRESH START REQUEST
The user wants to start fresh with a new program. Treat this as a CREATE_PROGRAM request. Collect any missing profile information, propose a structure, then build the program.`;

    case "GENERAL_COACHING_QUESTION":
      return null;

    default:
      return null;
  }
}

// ─── Debug Summary ───────────────────────────────────────────────────────────

export function logIntentSummary(
  message: string,
  intent: IntentResult,
  hasProgram: boolean
): void {
  logger.info(
    {
      intent: intent.type,
      confidence: intent.confidence,
      editSubtype: intent.editSubtype ?? null,
      metadata: intent.metadata ?? null,
      hasActiveProgram: hasProgram,
      messagePreview: message.slice(0, 80),
    },
    "[IntentRouter] Request classified"
  );
}
