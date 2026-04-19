/**
 * TrainChat Programming Quality Validator
 *
 * Post-generation validation layer that verifies the AI's output actually
 * reflects the intelligence engines that fired for a given request.
 *
 * Problem it solves:
 * The engines inject expert-level context into the system prompt, but GPT-4o
 * doesn't always execute that context faithfully. The prompt injection is
 * necessary — but not sufficient. This validator is the enforcement layer
 * that confirms the output contains the required programming signals.
 *
 * Validation is text-based (not another AI call): it scans the generated
 * ProgramStructure and raw content for required domain-specific signals,
 * returns pass/warning/fail with specifics, and provides targeted retry
 * instructions when the output drifts from the engine's requirements.
 *
 * This validator never leaks internals to the user-facing response.
 */

import { logger } from "./logger";
import type { RoutingDecision } from "./message-router";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProgrammingValidationStatus = "pass" | "warning" | "fail";

export interface ProgrammingValidationInput {
  userMessage: string;
  profile: {
    trainingGoal?: string;
    experienceLevel?: string;
    daysPerWeek?: number;
    sportFocus?: string | null;
    injuries?: string | null;
  } | null;
  generatedProgram: {
    programName?: string;
    description?: string;
    progressionStrategy?: string;
    splitType?: string;
    days: Array<{
      dayNumber: number;
      name?: string;
      focus?: string;
      notes?: string;
      exercises: Array<{
        name: string;
        sets: number;
        reps: string;
        rest: string;
        intent?: string;
        notes?: string;
        classification?: string;
      }>;
    }>;
  };
  cleanContent: string;
  routing: RoutingDecision;
}

export interface ProgrammingValidationResult {
  status: ProgrammingValidationStatus;
  passedChecks: string[];
  failedChecks: string[];
  warnings: string[];
  dominantFailureReason?: string;
  retryRecommended: boolean;
  retryInstructions: string[];
  debug: {
    activeEngines: string[];
    dominantDomain: string;
    totalChecksRun: number;
  };
}

// ─── Text Collection ──────────────────────────────────────────────────────────
// Aggregate all text content from the generated program and AI response into
// one searchable string so pattern matching is consistent and efficient.

function collectProgramText(
  program: ProgrammingValidationInput["generatedProgram"],
  cleanContent: string,
): string {
  const parts: string[] = [
    cleanContent,
    program.programName ?? "",
    program.description ?? "",
    program.progressionStrategy ?? "",
    program.splitType ?? "",
  ];
  for (const day of program.days) {
    parts.push(day.name ?? "", day.focus ?? "", day.notes ?? "");
    for (const ex of day.exercises) {
      parts.push(
        ex.name,
        ex.reps,
        ex.rest,
        ex.intent ?? "",
        ex.notes ?? "",
        ex.classification ?? "",
      );
    }
  }
  return parts.join(" ").toLowerCase();
}

// ─── Conditioning Engine Validation ─────────────────────────────────────────
// Confirms that a true conditioning session exists — not just high-rep lifting.

const CONDITIONING_PASS_PATTERNS = [
  /\b(interval|intervals)\b/,
  /\b(tempo\s*run|tempo\s*work|tempo\s*interval)\b/,
  /\b(repeat\s*sprint|rsa|sprint\s*cluster)\b/,
  /\b(sled\s*(push|pull|drag))\b/,
  /\b(rower|rowing\s*machine|assault\s*bike|air\s*bike|echo\s*bike|jump\s*rope|shuttle\s*run)\b/,
  /\b(aerobic\s*base|aerobic\s*work|aerobic\s*session|conditioning\s*session|energy\s*system)\b/,
  /\d+\s*(x|×)\s*\d+[\s-]*(min|minutes?)/,             // "4 × 2 min" or "6 x 3 min"
  /\d+\s*s(ec(ond)?s?)?\s*(on|off|work|rest)/,          // "30s on / 90s off"
  /work\s*[:\/.]\s*rest/,                               // "work:rest" or "work/rest"
  /\b(lactate|vo2|aerobic\s*capacity|heart\s*rate)\b/,
  /\b(cardio|conditioning\s*day|conditioning\s*block)\b/,
];

const CONDITIONING_FAIL_PATTERNS = [
  // Generic high-rep lifting is NOT conditioning
  /superset|circuit\s*(training)?|amrap|emom/,
];

function validateConditioningEngine(
  text: string,
  program: ProgrammingValidationInput["generatedProgram"],
): { passed: boolean; reason: string; isWarning: boolean } {
  const signalCount = CONDITIONING_PASS_PATTERNS.filter((p) => p.test(text)).length;

  // Strong pass: 3+ conditioning signals in the output
  if (signalCount >= 3) {
    return { passed: true, reason: "Conditioning signals present (intervals, modality, structure)", isWarning: false };
  }

  // Weak pass: 1–2 signals — acceptable but note it
  if (signalCount >= 1) {
    // Check if there's a dedicated conditioning day
    const hasConditioningDay = program.days.some((d) =>
      /(conditioning|cardio|aerobic|energy\s*system|interval)/i.test((d.focus ?? "") + " " + (d.name ?? "")),
    );
    if (hasConditioningDay) {
      return { passed: true, reason: "Dedicated conditioning session found", isWarning: false };
    }
    return { passed: true, reason: "Some conditioning signals present (1–2)", isWarning: true };
  }

  // Fail: no real conditioning signals
  return {
    passed: false,
    reason: "No true conditioning session found — no intervals, modality, or work:rest structure despite conditioning request",
    isWarning: false,
  };
}

// ─── Power / Speed Engine Validation ─────────────────────────────────────────
// Confirms that low-rep, high-intent power or sprint work is present.

const POWER_EXERCISE_PATTERNS = [
  /\b(box\s*jump|vertical\s*jump|broad\s*jump|depth\s*jump|trap\s*bar\s*jump|standing\s*long\s*jump)\b/,
  /\b(power\s*clean|hang\s*(power\s*)?clean|hang\s*(power\s*)?snatch|clean\s*pull|power\s*snatch)\b/,
  /\b(med(icine)?\s*ball\s*throw|wall\s*ball\s*slam|slam\s*ball)\b/,
  /\b(contrast|complex\s*training|pap|post.activation\s*potentiation)\b/,
  /\b(sled\s*push|sled\s*pull|resisted\s*sprint)\b/,
  /\b(sprint\s*drill|acceleration\s*drill|flying\s*sprint)\b/,
  /\b(plyometric|plyo\b)/,
];

const SPEED_SIGNALS = [
  /\b\d+\s*m\s*(sprint|dash|run|fly)\b/,           // "30m sprint", "20m fly"
  /\b(acceleration|max\s*velocity|top\s*speed)\b/,
  /\b(full\s*(recovery|rest)|4[\s-]6\s*min\s*rest|5\s*min\s*rest)\b/, // quality rest for speed
  /\b(change\s*of\s*direction|cod\b|agility\s*(drill|work|ladder))\b/,
];

const LOW_REP_SIGNALS = [
  /\b[1-5]\s*(x|×)\s*[1-5]\b/,          // "4 × 3", "5 × 2"
  /\breps?:?\s*[1-5]\b/,                 // "reps: 3"
  /\b(3|4|5)\s*reps?\b/,                 // "3 reps", "5 reps"
  /\b[1-3]\s*reps?\s*(per\s*set|\/\s*set)?\b/,  // "2 reps per set"
];

function validatePowerSpeedEngine(
  text: string,
  _program: ProgrammingValidationInput["generatedProgram"],
  isPowerDominant: boolean,
): { passed: boolean; reason: string; isWarning: boolean } {
  const hasPowerExercise = POWER_EXERCISE_PATTERNS.some((p) => p.test(text));
  const hasSpeedSignal = SPEED_SIGNALS.some((p) => p.test(text));
  const hasLowRep = LOW_REP_SIGNALS.some((p) => p.test(text));

  if (hasPowerExercise && (hasLowRep || hasSpeedSignal)) {
    return { passed: true, reason: "Power exercises + quality structure (low reps or sprint signals) present", isWarning: false };
  }

  if (hasPowerExercise) {
    return {
      passed: true,
      reason: "Power exercises present (low-rep structure could be stronger)",
      isWarning: true,
    };
  }

  if (hasSpeedSignal && hasLowRep) {
    return { passed: true, reason: "Speed + low-rep structure present", isWarning: false };
  }

  if (isPowerDominant) {
    return {
      passed: false,
      reason: "Power/speed engine was dominant but output contains no power exercises, no sprint structure, and no low-rep quality work",
      isWarning: false,
    };
  }

  // Not dominant — a warning is sufficient
  return {
    passed: true,
    reason: "Power/speed context active as support — limited signals present",
    isWarning: true,
  };
}

// ─── Sport Engine Validation ──────────────────────────────────────────────────
// Confirms the sport actually shaped the program, not just labeled it.

const SPORT_SIGNALS: Record<string, RegExp[]> = {
  football: [
    /\b(sled|resisted\s*sprint|power\s*clean|acceleration\s*drill)\b/,
    /\b(bilateral\s*force|hip\s*extension|lower\s*body\s*power)\b/,
    /\b(lineman|skill\s*position|first\s*step|block|tackle|scrimmage)\b/,
  ],
  basketball: [
    /\b(box\s*jump|vertical\s*jump|depth\s*jump|jump\s*training)\b/,
    /\b(decel|deceleration|landing\s*mechanics|reactive)\b/,
    /\b(lateral\s*quickness|change\s*of\s*direction|first\s*step)\b/,
  ],
  soccer: [
    /\b(repeat\s*sprint|rsa|nordic\s*(curl|hamstring))\b/,
    /\b(single.leg|unilateral|bilateral\s*balance)\b/,
    /\b(aerobic\s*base|work\s*capacity|tempo\s*run)\b/,
  ],
  baseball: [
    /\b(rotational|anti.rotation|pallof|landmine\s*rotation)\b/,
    /\b(arm\s*care|shoulder\s*health|external\s*rotation|cuff)\b/,
    /\b(hip\s*hinge|glute|posterior\s*chain)\b/,
  ],
  track: [
    /\b(acceleration|max\s*velocity|sprint\s*mechanics)\b/,
    /\b(\d+m\s*(sprint|dash|run))\b/,
    /\b(full\s*recovery|between\s*sprints|sprint\s*rest)\b/,
  ],
  hockey: [
    /\b(lateral\s*power|hip\s*abduction|skating\s*mechanics)\b/,
    /\b(shift|explosive|anaerobic\s*capacity)\b/,
    /\b(repeat\s*sprint|short\s*burst)\b/,
  ],
  rugby: [
    /\b(aerobic\s*base|repeat\s*sprint|collision|contact)\b/,
    /\b(upper\s*body\s*strength|bilateral\s*strength|scrum)\b/,
    /\b(acceleration|multi.directional)\b/,
  ],
  lacrosse: [
    /\b(acceleration|change\s*of\s*direction|repeat\s*sprint)\b/,
    /\b(rotational|stick\s*handling|upper\s*body)\b/,
  ],
  volleyball: [
    /\b(vertical\s*jump|jump\s*training|reactive\s*power)\b/,
    /\b(landing\s*mechanics|approach|blocking)\b/,
    /\b(shoulder|rotator|overhead\s*stability)\b/,
  ],
};

function validateSportEngine(
  text: string,
  sport: string | null,
  isSportDominant: boolean,
): { passed: boolean; reason: string; isWarning: boolean } {
  if (!sport) {
    return { passed: true, reason: "No specific sport — validation skipped", isWarning: false };
  }

  const patterns = SPORT_SIGNALS[sport.toLowerCase()];
  if (!patterns || patterns.length === 0) {
    return { passed: true, reason: `No specific signal patterns for sport: ${sport}`, isWarning: false };
  }

  const matchCount = patterns.filter((p) => p.test(text)).length;

  if (matchCount >= 2) {
    return { passed: true, reason: `${sport} architecture signals present (${matchCount}/${patterns.length} categories)`, isWarning: false };
  }

  if (matchCount >= 1) {
    return {
      passed: true,
      reason: `${sport} signals partially present — could be more sport-specific`,
      isWarning: true,
    };
  }

  if (isSportDominant) {
    return {
      passed: false,
      reason: `Sport engine fired for ${sport} but output contains no ${sport}-specific exercise, movement, or conditioning signals`,
      isWarning: false,
    };
  }

  return {
    passed: true,
    reason: `${sport} context active as support — limited sport-specific signals`,
    isWarning: true,
  };
}

// ─── Re-Entry Engine Validation ───────────────────────────────────────────────
// Safety-critical: verifies conservative output in early phases.

const REENTRY_AGGRESSIVE_SIGNALS = [
  /\b(max\s*effort|all.out|to\s*failure|near\s*failure|push\s*to\s*failure)\b/,
  /\brpe\s*[89](\.\d)?(?!\s*[-–]\s*10)\b/,     // RPE 8 or 9 without "–10" (standalone high RPE)
  /\brpe\s*10\b/,                               // RPE 10 = max effort
  /\b(hiit|high.intensity\s*interval)\b/,
  /\b(sprint\s*all\s*out|all.out\s*sprint|max\s*sprint)\b/,
  /\b(anaerobic\s*capacity|maximum\s*intensity)\b/,
];

function validateReEntryEngine(
  text: string,
  program: ProgrammingValidationInput["generatedProgram"],
): { passed: boolean; reason: string; isWarning: boolean; hardFail: boolean } {
  // Check 1: No aggressive language in full text
  const aggressiveMatch = REENTRY_AGGRESSIVE_SIGNALS.find((p) => p.test(text));
  if (aggressiveMatch) {
    return {
      passed: false,
      reason: `Re-entry plan contains aggressive language or intensity prescription: "${aggressiveMatch.source.slice(0, 50)}"`,
      isWarning: false,
      hardFail: true,
    };
  }

  // Check 2: First day/session volume — no exercise should have >3 sets in reacclimation
  const firstDay = program.days[0];
  if (firstDay) {
    const overloadedExercises = firstDay.exercises.filter((ex) => ex.sets > 3);
    if (overloadedExercises.length > 2) {
      return {
        passed: false,
        reason: `Re-entry first session has ${overloadedExercises.length} exercises with >3 sets — too aggressive for reacclimation phase`,
        isWarning: false,
        hardFail: true,
      };
    }
  }

  // Check 3: Weekly set volume — conservative total for early re-entry
  const totalSetsDay1 = firstDay?.exercises.reduce((acc, ex) => acc + ex.sets, 0) ?? 0;
  if (totalSetsDay1 > 18) {
    return {
      passed: false,
      reason: `Re-entry first session has total set count of ${totalSetsDay1} — exceeds safe reacclimation volume (target ≤18 total sets)`,
      isWarning: false,
      hardFail: true,
    };
  }

  // Check 4: Conditioning should be moderate
  const hasIntenseConditioning =
    /\b(vo2max|anaerobic\s*capacity|all.out\s*interval|max\s*effort\s*interval)\b/i.test(text);
  if (hasIntenseConditioning) {
    return {
      passed: false,
      reason: "Re-entry program prescribes high-intensity conditioning (VO2max/anaerobic capacity) — must be aerobic base only",
      isWarning: false,
      hardFail: true,
    };
  }

  // Soft check: verify some re-entry language exists
  const hasConservativeLanguage =
    /\b(conservative|gradual|rebuild|re.?entry|re.?acclimation|light|low\s*intensity|easy|build\s*up|phase\s*1|reintroduc)\b/i.test(text);
  if (!hasConservativeLanguage) {
    return {
      passed: true,
      reason: "Re-entry checks passed but conservative framing language is minimal",
      isWarning: true,
      hardFail: false,
    };
  }

  return {
    passed: true,
    reason: "Re-entry constraints met — conservative volume and intensity confirmed",
    isWarning: false,
    hardFail: false,
  };
}

// ─── Periodization Engine Validation ─────────────────────────────────────────
// Confirms that advanced/multi-week structure actually evolves over time.

const PERIODIZATION_SIGNALS = [
  /\b(block|phase|accumulation|intensification|realization|deload)\b/,
  /\b(wave\s*loading|progressive\s*overload|volume\s*progression)\b/,
  /\b(week\s*[1-8]|wk\s*[1-8])\b/,
  /\b(deload|recovery\s*week|back.off\s*week)\b/,
  /\b(progression\s*model|linear\s*progression|double\s*progression)\b/,
];

function validatePeriodizationEngine(
  text: string,
  profile: ProgrammingValidationInput["profile"],
): { passed: boolean; reason: string; isWarning: boolean } {
  const isAdvanced =
    profile?.experienceLevel === "advanced" ||
    profile?.experienceLevel === "intermediate";

  const signalCount = PERIODIZATION_SIGNALS.filter((p) => p.test(text)).length;

  if (signalCount >= 2) {
    return { passed: true, reason: "Block/periodization structure signals present", isWarning: false };
  }

  if (signalCount >= 1) {
    if (isAdvanced) {
      return {
        passed: true,
        reason: "Periodization signal present — could be more structurally explicit for advanced user",
        isWarning: true,
      };
    }
    return { passed: true, reason: "Periodization signal present", isWarning: false };
  }

  // No signals at all
  if (isAdvanced) {
    return {
      passed: false,
      reason: "Periodization engine active for advanced user but no block structure, phase references, or progression model detected",
      isWarning: false,
    };
  }

  return {
    passed: true,
    reason: "Periodization context active — acceptable for beginner/novice without full block structure",
    isWarning: true,
  };
}

// ─── Cross-Engine Coherence Validation ───────────────────────────────────────
// Checks that the dominant context visibly shapes the output when multiple
// engines are active — preventing one engine from quietly overriding another.

function validateCrossEngineCoherence(
  text: string,
  routing: RoutingDecision,
): { warnings: string[] } {
  const warnings: string[] = [];
  const { dominantDomain } = routing;

  // Re-entry + power/speed: re-entry should suppress aggressive power work in week 1
  if (routing.reEntry.active && routing.powerSpeed) {
    const hasEarlyPowerWork =
      /\b(power\s*clean|hang\s*clean|box\s*jump|sprint\s*session)\b/.test(text);
    if (hasEarlyPowerWork) {
      warnings.push(
        "Re-entry is active but output may include power/speed work too early — re-entry overrides speed/power aggressiveness in early phases",
      );
    }
  }

  // In-season + high volume: season modulation should reduce volume
  if (routing.season.context === "in_season" && dominantDomain !== "reEntry") {
    const hasHighVolume = /\b([5-6]\s*(x|×)\s*[5-9]|4\s*(x|×)\s*[8-9])\b/.test(text);
    if (hasHighVolume) {
      warnings.push(
        "In-season context detected but output may have high volume (5-6 sets) — in-season programming requires reduced volume to maintain freshness",
      );
    }
  }

  // Conditioning dominant but strength volume very high
  if (dominantDomain === "conditioning") {
    const hasExcessiveStrengthVolume =
      (text.match(/\b(squat|deadlift|bench|press|row)\b/g) ?? []).length > 15;
    if (hasExcessiveStrengthVolume) {
      warnings.push(
        "Conditioning is the dominant request but output appears heavily weighted toward strength exercises — conditioning sessions may be under-represented",
      );
    }
  }

  return { warnings };
}

// ─── Main Validator ──────────────────────────────────────────────────────────

export function validateProgrammingQuality(
  input: ProgrammingValidationInput,
): ProgrammingValidationResult {
  const { generatedProgram, cleanContent, routing, profile } = input;
  const text = collectProgramText(generatedProgram, cleanContent);

  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const warnings: string[] = [];
  const retryInstructions: string[] = [];

  const { dominantDomain, debug } = routing;
  const activeEngines = debug.enginesActive;
  let totalChecksRun = 0;

  // ── Conditioning Engine ──────────────────────────────────────────────────
  if (routing.conditioning) {
    totalChecksRun++;
    const result = validateConditioningEngine(text, generatedProgram);
    if (!result.passed) {
      failedChecks.push(`CONDITIONING: ${result.reason}`);
      retryInstructions.push(
        "The output FAILED conditioning validation: no true conditioning session exists. " +
        "You MUST include at least one explicit conditioning session with structured work:rest intervals, " +
        "a named conditioning modality (e.g., tempo run, assault bike intervals, sled push, repeat sprints), " +
        "and a clear work/rest prescription (e.g., '6 × 2 min hard / 2 min easy'). " +
        "High-rep lifting does NOT count as conditioning.",
      );
    } else if (result.isWarning) {
      warnings.push(`Conditioning: ${result.reason}`);
      passedChecks.push("Conditioning structure present (with improvement opportunity)");
    } else {
      passedChecks.push("Conditioning engine: valid conditioning session confirmed");
    }
  }

  // ── Power / Speed Engine ─────────────────────────────────────────────────
  if (routing.powerSpeed) {
    totalChecksRun++;
    const isPowerDominant = dominantDomain === "powerSpeed";
    const result = validatePowerSpeedEngine(text, generatedProgram, isPowerDominant);
    if (!result.passed) {
      failedChecks.push(`POWER/SPEED: ${result.reason}`);
      retryInstructions.push(
        "The output FAILED power/speed validation: no power exercises, no sprint structure, and no low-rep quality work detected. " +
        "Include at minimum: (1) plyometric or Olympic-derivative exercises (box jumps, power cleans, jumps) with 3–5 reps and 3–5 min rest, " +
        "(2) place explosive/power work at the START of sessions, not after conditioning or fatigue work, " +
        "(3) use contrast pairing (heavy compound → explosive variation) if appropriate.",
      );
    } else if (result.isWarning) {
      warnings.push(`Power/Speed: ${result.reason}`);
      passedChecks.push("Power/speed structure partially present");
    } else {
      passedChecks.push("Power/speed engine: power exercises + quality structure confirmed");
    }
  }

  // ── Sport Architecture Engine ────────────────────────────────────────────
  if (routing.sport.active) {
    totalChecksRun++;
    const sport = routing.sport.sport;
    const isSportDominant = dominantDomain === "sport";
    const result = validateSportEngine(text, sport, isSportDominant);
    if (!result.passed) {
      failedChecks.push(`SPORT (${sport ?? "unknown"}): ${result.reason}`);
      retryInstructions.push(
        `The output FAILED sport validation for ${sport ?? "the specified sport"}: no sport-specific exercise patterns, ` +
        `conditioning logic, or movement emphasis detected. ` +
        `The program must visibly reflect ${sport ?? "the sport"} — session architecture, exercise selection, ` +
        `conditioning modality, and movement emphasis must all match what a real ${sport ?? "sport"} coach would program. ` +
        `A generic strength program with a sport label is NOT acceptable.`,
      );
    } else if (result.isWarning) {
      warnings.push(`Sport (${sport}): ${result.reason}`);
      passedChecks.push(`Sport (${sport}) signals partially present`);
    } else {
      passedChecks.push(`Sport engine (${sport}): sport-specific architecture confirmed`);
    }
  }

  // ── Re-Entry Engine ──────────────────────────────────────────────────────
  // Safety-critical: treated with highest enforcement priority
  if (routing.reEntry.active) {
    totalChecksRun++;
    const result = validateReEntryEngine(text, generatedProgram);
    if (!result.passed) {
      failedChecks.push(`RE-ENTRY [SAFETY]: ${result.reason}`);
      retryInstructions.push(
        "The output FAILED re-entry safety validation. This is a hard safety failure. " +
        "The user is returning from a training break and MUST receive a conservative plan. " +
        "MANDATORY corrections: " +
        "(1) Week 1 / Session 1 must have ≤2–3 sets per primary exercise, not 4–5. " +
        "(2) Intensity must be RPE 4–6 maximum in reacclimation — no max effort, no near-failure, no RPE 8+. " +
        "(3) Conditioning must be aerobic base only (easy walk/bike/tempo) — no HIIT, no all-out intervals, no anaerobic capacity work in week 1. " +
        "(4) Remove any explicit 'max effort', 'all-out', 'to failure' language. " +
        "Rebuild the plan with genuine conservatism — the athlete needs to re-establish tissue tolerance before real training.",
      );
    } else if (result.isWarning) {
      warnings.push(`Re-entry: ${result.reason}`);
      passedChecks.push("Re-entry safety checks passed (conservative framing could be stronger)");
    } else {
      passedChecks.push("Re-entry engine: conservative volume, intensity, and safety confirmed");
    }
  }

  // ── Periodization Engine ─────────────────────────────────────────────────
  if (routing.periodization) {
    totalChecksRun++;
    const result = validatePeriodizationEngine(text, profile);
    if (!result.passed) {
      failedChecks.push(`PERIODIZATION: ${result.reason}`);
      retryInstructions.push(
        "The output FAILED periodization validation: no block structure or progression model detected for an intermediate/advanced user. " +
        "You MUST organize the program into distinct blocks or phases (e.g., Accumulation → Intensification → Realization, or clearly labeled Week 1–4 with changing volume/intensity). " +
        "Advanced users cannot use simple 'add weight weekly' linear progression — include block-level volume and intensity shifts, " +
        "define the progression model explicitly, and include a deload protocol.",
      );
    } else if (result.isWarning) {
      warnings.push(`Periodization: ${result.reason}`);
      passedChecks.push("Periodization structure partially present");
    } else {
      passedChecks.push("Periodization engine: block structure and progression model confirmed");
    }
  }

  // ── Cross-Engine Coherence ───────────────────────────────────────────────
  if (activeEngines.length > 1) {
    const coherenceResult = validateCrossEngineCoherence(text, routing);
    warnings.push(...coherenceResult.warnings);
  }

  // ── Status Resolution ────────────────────────────────────────────────────
  // Fail = any check failed; Warning = checks passed but with warnings; Pass = clean
  let status: ProgrammingValidationStatus;
  let dominantFailureReason: string | undefined;
  let retryRecommended: boolean;

  if (failedChecks.length > 0) {
    status = "fail";
    dominantFailureReason = failedChecks[0];
    retryRecommended = true;
  } else if (warnings.length > 0) {
    status = "warning";
    retryRecommended = false;
  } else {
    status = "pass";
    retryRecommended = false;
  }

  const result: ProgrammingValidationResult = {
    status,
    passedChecks,
    failedChecks,
    warnings,
    dominantFailureReason,
    retryRecommended,
    retryInstructions,
    debug: {
      activeEngines,
      dominantDomain,
      totalChecksRun,
    },
  };

  // ── Structured Logging ───────────────────────────────────────────────────
  logger.info(
    {
      qualityValidation: {
        status,
        totalChecksRun,
        passedCount: passedChecks.length,
        failedCount: failedChecks.length,
        warningCount: warnings.length,
        retryRecommended,
        dominantDomain,
        activeEngines,
        failedChecks: failedChecks.length > 0 ? failedChecks : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    },
    "[QualityValidator] Programming quality validation complete",
  );

  return result;
}

// ─── Quality Scoring System ───────────────────────────────────────────────────
// Dimensional quality score (0–10) that operates independently of the binary
// pass/fail validator above. Designed to catch systematically weak outputs that
// technically pass each check but collectively under-perform.
//
// 5 dimensions × 0–2 points each = 0–10 total.
// Threshold: 6/10 — scores below trigger a targeted repair pass.

export interface QualityDimensionScore {
  dimension: string;
  score: 0 | 1 | 2;
  reason: string;
}

export interface ProgramQualityScore {
  score: number;
  threshold: number;
  dimensions: QualityDimensionScore[];
  retryRecommended: boolean;
}

export function scoreProgramQuality(
  program: ProgrammingValidationInput["generatedProgram"],
  cleanContent: string,
  routing: RoutingDecision,
): ProgramQualityScore {
  const text = collectProgramText(program, cleanContent);
  const dimensions: QualityDimensionScore[] = [];
  const threshold = 6;

  // ── Dimension 1: Progression Logic (0–2) ──────────────────────────────────
  // Does the program indicate HOW to progress over time?
  {
    const strongProgressionSignals = [
      /\b(progressive\s*overload|add\s*(weight|load)|increase\s*(load|weight|reps?))\b/i,
      /\b(week\s*[1-4]|phase\s*[1-3]|deload|taper|wave\s*load)\b/i,
      /\b(progression\s*(model|strategy|scheme)|double\s*progression|linear\s*progression)\b/i,
    ];
    const weakProgressionSignals = [
      /\b(progress|build|advance|develop|improve)\b/i,
      /\b(increase|add|more)\b/i,
    ];
    const strongCount = strongProgressionSignals.filter(p => p.test(text)).length;
    const weakCount = weakProgressionSignals.filter(p => p.test(text)).length;

    if (strongCount >= 2) {
      dimensions.push({ dimension: "progression_logic", score: 2, reason: "Explicit progression model — overload mechanism, phase structure, or deload protocol present" });
    } else if (strongCount >= 1 || weakCount >= 2) {
      dimensions.push({ dimension: "progression_logic", score: 1, reason: "Some progression language — could be more explicit about the overload mechanism" });
    } else {
      dimensions.push({ dimension: "progression_logic", score: 0, reason: "No progression model detected — program lacks explicit overload mechanism or phase structure" });
    }
  }

  // ── Dimension 2: Volume Balance (0–2) ──────────────────────────────────────
  // Is volume distributed appropriately across the days?
  {
    const days = program.days;
    if (days.length === 0) {
      dimensions.push({ dimension: "volume_balance", score: 0, reason: "No days — cannot assess volume distribution" });
    } else {
      const exerciseCounts = days.map(d => d.exercises.length);
      const maxEx = Math.max(...exerciseCounts);
      const minEx = Math.min(...exerciseCounts);
      const avgEx = exerciseCounts.reduce((a, b) => a + b, 0) / exerciseCounts.length;
      const variance = maxEx - minEx;

      if (avgEx >= 3 && avgEx <= 8 && variance <= 3) {
        dimensions.push({ dimension: "volume_balance", score: 2, reason: `Volume well-distributed — avg ${avgEx.toFixed(1)} exercises/session, variance ${variance}` });
      } else if (avgEx >= 2 && avgEx <= 10 && variance <= 5) {
        dimensions.push({ dimension: "volume_balance", score: 1, reason: `Volume acceptable — avg ${avgEx.toFixed(1)} exercises/session, variance ${variance}` });
      } else {
        dimensions.push({ dimension: "volume_balance", score: 0, reason: `Volume imbalanced — avg ${avgEx.toFixed(1)} exercises/session, variance ${variance} (one session much heavier/lighter than others)` });
      }
    }
  }

  // ── Dimension 3: Exercise Diversity (0–2) ──────────────────────────────────
  // Are exercises varied or repetitive across sessions?
  {
    const allExerciseNames = program.days.flatMap(d => d.exercises.map(e => e.name.toLowerCase()));
    const uniqueNames = new Set(allExerciseNames);
    const totalExercises = allExerciseNames.length;
    const diversityRatio = totalExercises > 0 ? uniqueNames.size / totalExercises : 0;

    if (diversityRatio >= 0.7 && uniqueNames.size >= 8) {
      dimensions.push({ dimension: "exercise_diversity", score: 2, reason: `Good diversity — ${uniqueNames.size} unique exercises across ${totalExercises} total (${Math.round(diversityRatio * 100)}%)` });
    } else if (diversityRatio >= 0.5 && uniqueNames.size >= 5) {
      dimensions.push({ dimension: "exercise_diversity", score: 1, reason: `Moderate diversity — ${uniqueNames.size} unique exercises (${Math.round(diversityRatio * 100)}%) — some repetition` });
    } else {
      dimensions.push({ dimension: "exercise_diversity", score: 0, reason: `Low diversity — only ${uniqueNames.size} unique exercises (${Math.round(diversityRatio * 100)}%) — high repetition across sessions` });
    }
  }

  // ── Dimension 4: Session Coherence (0–2) ──────────────────────────────────
  // Do sessions have clear intent and proper structure?
  {
    const namedSessions = program.days.filter(d => d.name && d.name.trim().length > 3);
    const sessionNameRatio = program.days.length > 0 ? namedSessions.length / program.days.length : 0;

    const hasNotes = program.days.some(d => d.exercises.some(e => e.notes && e.notes.length > 10));
    const hasRest = program.days.some(d => d.exercises.some(e => e.rest && e.rest.length > 0));
    const hasFocus = program.days.some(d => d.focus && d.focus.length > 3);

    const coherencePoints = (sessionNameRatio >= 0.8 ? 1 : 0) + (hasNotes ? 1 : 0) + (hasRest ? 1 : 0) + (hasFocus ? 1 : 0);

    if (coherencePoints >= 3) {
      dimensions.push({ dimension: "session_coherence", score: 2, reason: "Sessions have clear intent — named, focused, with exercise notes and rest periods" });
    } else if (coherencePoints >= 2) {
      dimensions.push({ dimension: "session_coherence", score: 1, reason: "Sessions partially coherent — could improve focus labeling, notes, or rest prescriptions" });
    } else {
      dimensions.push({ dimension: "session_coherence", score: 0, reason: "Sessions lack structure — missing names, focus labels, exercise notes, or rest periods" });
    }
  }

  // ── Dimension 5: Goal Alignment (0–2) ──────────────────────────────────────
  // Does the program visibly serve the user's goal / the dominant domain?
  {
    const { dominantDomain } = routing;

    const domainSignalMap: Record<string, RegExp[]> = {
      conditioning: [/\b(interval|tempo|aerobic|conditioning|work.rest|rsa)\b/i, /\b(cardio|modality|lactate|vo2)\b/i],
      powerSpeed: [/\b(power|explosive|sprint|plyometric|jump|low.rep)\b/i, /\b(acceleration|velocity|contrast)\b/i],
      sport: [/\b(sport|athletic|game|competition|field|court|on.ice|in.season)\b/i],
      mobility: [/\b(mobility|range|stretch|cars|pails|rails|joint|capsule)\b/i, /\b(passive|active.control|end.range)\b/i],
      periodization: [/\b(phase|block|accumulation|intensification|deload|wave)\b/i],
      returnFromInjury: [/\b(conservative|graded|reintroduc|pain.free|re.entry)\b/i],
      base: [/\b(strength|compound|progressive|linear)\b/i, /\b(squat|deadlift|bench|row|press)\b/i],
    };

    const patterns = domainSignalMap[dominantDomain] ?? domainSignalMap["base"];
    const matchCount = patterns.filter(p => p.test(text)).length;

    if (matchCount >= 2) {
      dimensions.push({ dimension: "goal_alignment", score: 2, reason: `Strong goal alignment — multiple ${dominantDomain} signals confirmed in output` });
    } else if (matchCount >= 1) {
      dimensions.push({ dimension: "goal_alignment", score: 1, reason: `Partial goal alignment — some ${dominantDomain} signals present but output could be more specific` });
    } else {
      dimensions.push({ dimension: "goal_alignment", score: 0, reason: `Weak goal alignment — ${dominantDomain} was dominant domain but output lacks domain-specific signals` });
    }
  }

  const score = dimensions.reduce((acc, d) => acc + d.score, 0);

  return {
    score,
    threshold,
    dimensions,
    retryRecommended: score < threshold,
  };
}

export function buildQualityScoringRetryPrompt(scoreResult: ProgramQualityScore): string {
  const weakDimensions = scoreResult.dimensions.filter(d => d.score < 2);
  const lines = [
    "PROGRAM QUALITY SCORE BELOW THRESHOLD — TARGETED IMPROVEMENTS REQUIRED",
    "",
    `Quality score: ${scoreResult.score}/${scoreResult.threshold * 2} (threshold: ${scoreResult.threshold}).`,
    "The program was generated but scored below the quality bar on the following dimensions.",
    "Apply the targeted corrections below without regenerating from scratch.",
    "",
    "DIMENSIONS TO IMPROVE:",
    ...weakDimensions.map(d => `• ${d.dimension.toUpperCase()} (${d.score}/2): ${d.reason}`),
    "",
    "TARGETED CORRECTIONS:",
    ...weakDimensions.map(d => {
      if (d.dimension === "progression_logic") return "- Add an explicit progression model: name how load/reps increase week over week (e.g., 'Add 2.5kg to primary lifts each week' or define a deload protocol).";
      if (d.dimension === "volume_balance") return "- Rebalance volume: ensure each session has 4–7 exercises. Sessions should not vary by more than 3 exercises in count.";
      if (d.dimension === "exercise_diversity") return "- Add exercise variety: replace repeated exercises with appropriate alternatives. Aim for 70%+ unique exercises across the program.";
      if (d.dimension === "session_coherence") return "- Improve session structure: every day needs a descriptive name, a focus label, exercise notes (coaching cues), and rest periods for every exercise.";
      if (d.dimension === "goal_alignment") return "- Strengthen goal alignment: the dominant domain must be visibly present — ensure domain-specific exercises, rep schemes, and language reflect the user's actual request.";
      return `- Improve ${d.dimension}`;
    }),
    "",
    "Output the complete corrected program as valid JSON. Preserve the structure, only improve the flagged dimensions.",
  ];
  return lines.join("\n");
}

// ─── Retry Prompt Builder ─────────────────────────────────────────────────────
// Generates a targeted correction prompt for the AI retry pass.
// Tells the model exactly what failed and what to fix — not a blind regeneration.

export function buildQualityRetryPrompt(
  result: ProgrammingValidationResult,
): string {
  const lines = [
    "PROGRAMMING QUALITY VALIDATION FAILED — MANDATORY CORRECTIONS REQUIRED",
    "",
    "The program you just generated does not meet the required programming standards for this request.",
    "Do NOT simply regenerate — apply the specific corrections listed below.",
    "",
    "FAILED CHECKS:",
    ...result.failedChecks.map((c) => `• ${c}`),
    "",
    "REQUIRED CORRECTIONS:",
    ...result.retryInstructions.map((instruction, i) => `${i + 1}. ${instruction}`),
    "",
    "CRITICAL RULES FOR THIS CORRECTION:",
    "- Keep all structural elements that were correct (days, split, exercise selection that was appropriate)",
    "- Only change the elements that failed the checks above",
    "- Output the complete corrected program as valid JSON in the standard format",
    "- Do not apologize or explain — just output the corrected program",
  ];

  return lines.join("\n");
}
