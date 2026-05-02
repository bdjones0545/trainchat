// ─── Progression Intelligence Layer ──────────────────────────────────────────
//
// Phase 4 skill addition — system-wide progression model selection.
//
// Purpose:
//   Given a current program, user context, and behavioral signals, select the
//   optimal progression model and generate explicit weekly rules for 4 weeks.
//   Makes TrainChat's programs evolve over time rather than generating static
//   plans that never change.
//
// INTEGRATION:
//   - Called from Performance Architect build path when progression/time block
//     request is detected.
//   - Output injected into the architecture brief as a PROGRESSION PLAN section.
//   - CEO Heartbeat reads deloadRecommendation to flag programs that omit recovery.
//
// NEVER generates programs directly. NEVER speaks to users.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProgramStructure } from "../lib/ai";
import type { BehavioralSignal } from "./behavioral-intelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProgressionModel =
  | "linear"           // Add load each week. Best for beginners.
  | "double_progression" // Increase reps, then increase load. Intermediate general.
  | "wave"             // Load oscillates across weeks (e.g. 70%→80%→90%→deload).
  | "undulating"       // Varies rep ranges session-to-session or week-to-week.
  | "block"            // Accumulation → Intensification → Realization → Deload blocks.
  | "autoregulated"    // RPE-based. Load adjusts based on daily readiness.
  | "re_entry";        // Conservative restart after inactivity, pain, or injury.

export interface WeeklyProgressionRule {
  week: number;
  focus: string;
  loadRule: string;
  volumeRule: string;
  intensityRule: string;
  recoveryRule: string;
}

export interface ProgressionIntelligence {
  progressionModel: ProgressionModel;
  rationale: string;
  weeklyRules: WeeklyProgressionRule[];
  deloadRecommendation?: string;
  /**
   * Conditions that should trigger a programming adjustment mid-block.
   * Coach Agent surfaces these only if user explicitly asks about progression.
   */
  adjustmentTriggers: string[];
}

export interface ProgressionContext {
  userGoal: string | null;
  experienceLevel: string | null;
  trainingPhase?: string | null;
  painSignals?: string | null;
  fatigueSignals?: BehavioralSignal[];
  adherenceSignals?: BehavioralSignal[];
  recentEdits?: string[];
  researchGuidanceSummary?: string | null;
  daysPerWeek?: number | null;
  sport?: string | null;
}

// ─── Model Selection Logic ────────────────────────────────────────────────────

function selectProgressionModel(
  program: ProgramStructure,
  ctx: ProgressionContext,
): { model: ProgressionModel; rationale: string } {
  const goalLower = (ctx.userGoal ?? "").toLowerCase();
  const expLower = (ctx.experienceLevel ?? "intermediate").toLowerCase();
  const isRe_entry = ctx.adherenceSignals?.some((s) => s.type === "low_adherence") ?? false;
  const hasFatigue = ctx.fatigueSignals?.some((s) => s.confidence === "high") ?? false;
  const hasPain = !!(ctx.painSignals && ctx.painSignals.length > 2);
  const isBeginner = /beginner|novice|just start/i.test(expLower);
  const isAdvanced = /advanced|elite|experienced/i.test(expLower);
  const isStrength = /strength|powerlifting|1rm|max/i.test(goalLower);
  const isHypertrophy = /hypertrophy|muscle|size|bulk/i.test(goalLower);
  const isSpeed = /speed|sprint|power|athletic/i.test(goalLower) || /speed|sprint/i.test(ctx.sport ?? "");
  const totalDays = program.days?.length ?? 3;

  if (isRe_entry || hasPain) {
    return {
      model: "re_entry",
      rationale: hasPain
        ? "Pain signal detected — conservative re-entry progression preserves tissue tolerance."
        : "Return from inactivity detected — re-entry model restores baseline before progressive overload.",
    };
  }
  if (hasFatigue) {
    return {
      model: "autoregulated",
      rationale: "Fatigue signal detected — autoregulated progression allows load to adapt to daily readiness rather than forcing fixed increases.",
    };
  }
  if (isBeginner) {
    return {
      model: "linear",
      rationale: "Beginner trainees respond to linear progression — simple weekly load increases produce consistent adaptation.",
    };
  }
  if (isAdvanced && isStrength) {
    return {
      model: "wave",
      rationale: "Advanced strength athlete — wave loading alternates intensity to manage neural fatigue while preserving force output quality.",
    };
  }
  if (isAdvanced && totalDays >= 4) {
    return {
      model: "block",
      rationale: "Advanced multi-day program — block periodization sequences accumulation, intensification, and realization phases for peak adaptation.",
    };
  }
  if (isHypertrophy) {
    return {
      model: "double_progression",
      rationale: "Hypertrophy goal — double progression (reps then load) maximizes mechanical tension while controlling volume accumulation.",
    };
  }
  if (isSpeed) {
    return {
      model: "undulating",
      rationale: "Speed/power goal — undulating periodization preserves speed quality by varying neural demands session to session.",
    };
  }
  return {
    model: "double_progression",
    rationale: "Intermediate general trainee — double progression is the most practical and sustainable model for continued adaptation.",
  };
}

// ─── Weekly Rules Builder ─────────────────────────────────────────────────────

function buildWeeklyRules(
  model: ProgressionModel,
  ctx: ProgressionContext,
): WeeklyProgressionRule[] {
  switch (model) {
    case "linear":
      return [
        { week: 1, focus: "Establish baseline", loadRule: "Start at RPE 6–7", volumeRule: "Baseline sets/reps as prescribed", intensityRule: "Technical quality priority", recoveryRule: "Full rest between sessions" },
        { week: 2, focus: "Build load", loadRule: "Add 2.5–5kg to primary lifts", volumeRule: "Maintain baseline volume", intensityRule: "RPE 7–8", recoveryRule: "Normal rest intervals" },
        { week: 3, focus: "Progress load", loadRule: "Add another 2.5–5kg", volumeRule: "Maintain volume", intensityRule: "RPE 8", recoveryRule: "Monitor fatigue — reduce if needed" },
        { week: 4, focus: "Deload", loadRule: "Reduce load by 30–40%", volumeRule: "Reduce sets to 2 per exercise", intensityRule: "RPE 5–6", recoveryRule: "Prioritize sleep and tissue recovery" },
      ];
    case "double_progression":
      return [
        { week: 1, focus: "Rep accumulation — lower end of range", loadRule: "Load set for lower rep target (e.g. 3×8)", volumeRule: "Standard volume", intensityRule: "RPE 7", recoveryRule: "Normal rest" },
        { week: 2, focus: "Rep accumulation — upper end of range", loadRule: "Same load, add reps (e.g. 3×10)", volumeRule: "Slight volume increase from rep gains", intensityRule: "RPE 7–8", recoveryRule: "Normal rest" },
        { week: 3, focus: "Load increase — reset reps", loadRule: "Increase load 2.5–5%; reset reps to lower end", volumeRule: "Maintain volume", intensityRule: "RPE 8", recoveryRule: "Monitor cumulative fatigue" },
        { week: 4, focus: "Deload / consolidation", loadRule: "Reduce load 20–30%", volumeRule: "Reduce to 2 sets per lift", intensityRule: "RPE 5–6", recoveryRule: "Active recovery, prioritize sleep" },
      ];
    case "wave":
      return [
        { week: 1, focus: "Accumulation wave", loadRule: "70–75% 1RM or RPE 7", volumeRule: "Higher volume — 4–5 sets", intensityRule: "Controlled, technical priority", recoveryRule: "Full recovery between sessions" },
        { week: 2, focus: "Intensification wave", loadRule: "80–85% 1RM or RPE 8–8.5", volumeRule: "Moderate volume — 3–4 sets", intensityRule: "High intensity — bar speed priority", recoveryRule: "Extended rest — 3–5 min primary lifts" },
        { week: 3, focus: "Peak wave", loadRule: "88–92% 1RM or RPE 9", volumeRule: "Lower volume — 2–3 heavy sets", intensityRule: "Near-maximal — technical excellence", recoveryRule: "Maximum rest — no secondary fatigue" },
        { week: 4, focus: "Deload / reset", loadRule: "60–65% 1RM or RPE 5–6", volumeRule: "Low volume — 2 sets", intensityRule: "Movement quality focus", recoveryRule: "Full systemic recovery" },
      ];
    case "undulating":
      return [
        { week: 1, focus: "Power emphasis (Week A)", loadRule: "Heavy — 3–5 rep range", volumeRule: "Lower volume, high quality", intensityRule: "Explosive intent on every rep", recoveryRule: "Full inter-session recovery" },
        { week: 2, focus: "Strength emphasis (Week B)", loadRule: "Moderate-heavy — 5–8 rep range", volumeRule: "Moderate volume", intensityRule: "Controlled tempo, full ROM", recoveryRule: "Normal rest" },
        { week: 3, focus: "Volume emphasis (Week C)", loadRule: "Moderate — 8–12 rep range", volumeRule: "Higher volume", intensityRule: "Time under tension focus", recoveryRule: "Monitor fatigue accumulation" },
        { week: 4, focus: "Deload — movement quality", loadRule: "Light — 50–60% of working loads", volumeRule: "Reduced sets", intensityRule: "Technique and mobility focus", recoveryRule: "Full recovery and restoration" },
      ];
    case "block":
      return [
        { week: 1, focus: "Accumulation — volume base", loadRule: "65–75% 1RM", volumeRule: "High volume — 4–5 sets × 8–12", intensityRule: "RPE 6–7.5", recoveryRule: "Normal inter-session recovery" },
        { week: 2, focus: "Intensification — load quality", loadRule: "78–85% 1RM", volumeRule: "Moderate — 3–4 sets × 4–8", intensityRule: "RPE 7.5–8.5", recoveryRule: "Extended rest on primary movements" },
        { week: 3, focus: "Realization — peak expression", loadRule: "88–95% 1RM", volumeRule: "Low — 2–3 heavy sets", intensityRule: "RPE 8.5–9.5", recoveryRule: "Maximum rest; no secondary fatigue" },
        { week: 4, focus: "Deload / transition", loadRule: "60% 1RM", volumeRule: "2 sets per pattern", intensityRule: "RPE 5–6", recoveryRule: "Full restoration before next block" },
      ];
    case "autoregulated":
      return [
        { week: 1, focus: "Calibration", loadRule: "Target RPE 7 — adjust up/down based on readiness", volumeRule: "Standard sets", intensityRule: "Effort guides load, not fixed numbers", recoveryRule: "Sleep and HRV awareness" },
        { week: 2, focus: "Build — if readiness supports it", loadRule: "Target RPE 7.5–8 if feeling recovered", volumeRule: "Add set if RPE is below target", intensityRule: "Quality > numbers", recoveryRule: "Back off a tier if fatigue is high" },
        { week: 3, focus: "Peak — if fatigue is low", loadRule: "RPE 8–8.5", volumeRule: "Match week 2 or reduce if fatigued", intensityRule: "Readiness-dependent", recoveryRule: "Full rest before primary sessions" },
        { week: 4, focus: "Mandatory deload regardless of readiness", loadRule: "RPE 5–6", volumeRule: "2 sets per movement", intensityRule: "Movement quality", recoveryRule: "Full systemic reset" },
      ];
    case "re_entry":
      return [
        { week: 1, focus: "Movement re-establishment", loadRule: "50–60% of previous working load", volumeRule: "2 sets per exercise", intensityRule: "RPE 5–6 — technique first", recoveryRule: "Extra rest days if needed; total wellness priority" },
        { week: 2, focus: "Volume restore", loadRule: "65–70% of working load", volumeRule: "3 sets — back to standard density", intensityRule: "RPE 6–7", recoveryRule: "Normal rest intervals" },
        { week: 3, focus: "Intensity restore", loadRule: "Back to previous working load", volumeRule: "Standard volume", intensityRule: "RPE 7–8", recoveryRule: "Monitor for delayed soreness" },
        { week: 4, focus: "Progressive overload resumes", loadRule: "Small load increase (2.5–5kg)", volumeRule: "Maintain standard", intensityRule: "RPE 7.5–8", recoveryRule: "Normal deload on Week 5 if no deload had been done" },
      ];
  }
}

// ─── Adjustment Triggers ──────────────────────────────────────────────────────

function buildAdjustmentTriggers(model: ProgressionModel, ctx: ProgressionContext): string[] {
  const base = [
    "Technique degrades at current load → reduce weight, preserve movement quality.",
    "Sleep or recovery quality drops significantly → autoregulate load down for that session.",
    "Pain or new joint discomfort appears → immediately substitute with a pain-safe variation.",
  ];
  if (model === "linear") {
    base.push("If same load is missed twice in a row → deload and reset.");
  }
  if (model === "block") {
    base.push("If RPE targets feel too easy in Week 3 → this is normal. Trust the structure.");
  }
  if (model === "re_entry") {
    base.push("If soreness or fatigue is higher than expected → repeat Week 1 before advancing.");
  }
  if (ctx.sport && /speed|sprint|power/i.test(ctx.sport)) {
    base.push("If sprint quality degrades in on-field sessions → reduce gym volume for that week.");
  }
  return base;
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

/**
 * Build a ProgressionIntelligence plan for the given program and context.
 *
 * @param program - The current ProgramStructure to build progression around.
 * @param ctx     - User context: goal, experience, signals, sport, phase.
 * @returns       Full 4-week progression plan with model, weekly rules, and triggers.
 */
export function buildProgressionIntelligence(
  program: ProgramStructure,
  ctx: ProgressionContext,
): ProgressionIntelligence {
  const { model, rationale } = selectProgressionModel(program, ctx);
  const weeklyRules = buildWeeklyRules(model, ctx);
  const adjustmentTriggers = buildAdjustmentTriggers(model, ctx);

  const deloadRecommendation =
    model === "re_entry"
      ? "Re-entry programs do not add a standard deload — the entire block is conservative. Resume normal deload cycle after Week 4."
      : "Week 4 is always a deload week. Do not skip it. The adaptation from weeks 1–3 is realized during the deload, not during the hard weeks.";

  return { progressionModel: model, rationale, weeklyRules, deloadRecommendation, adjustmentTriggers };
}

/**
 * Format a ProgressionIntelligence result as an architecture brief section.
 * Injected into the Performance Architect brief when a time-block or progression
 * request is detected.
 */
export function formatProgressionBriefSection(pi: ProgressionIntelligence): string {
  const weekLines = pi.weeklyRules.map(
    (w) =>
      `  Week ${w.week} — ${w.focus}\n` +
      `    Load: ${w.loadRule}\n` +
      `    Volume: ${w.volumeRule}\n` +
      `    Intensity: ${w.intensityRule}\n` +
      `    Recovery: ${w.recoveryRule}`,
  );
  return [
    "## PROGRESSION INTELLIGENCE — 4-WEEK PLAN",
    `Model: **${pi.progressionModel.toUpperCase()}**`,
    `Rationale: ${pi.rationale}`,
    "",
    "### Weekly Rules",
    ...weekLines,
    "",
    `### Deload Guidance`,
    pi.deloadRecommendation ?? "Apply standard deload in Week 4.",
    "",
    "### Adjustment Triggers",
    ...pi.adjustmentTriggers.map((t) => `- ${t}`),
  ].join("\n");
}
