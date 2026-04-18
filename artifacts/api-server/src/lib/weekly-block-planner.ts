/**
 * Weekly Block Planner — Hierarchical Programming Layer 2
 *
 * The program generation hierarchy:
 *   MONTH defines the mission      ← monthly-block-planner.ts
 *   WEEK  defines the emphasis     ← this module
 *   DAY   defines the session role ← program-architecture-engine.ts
 *   EXERCISE serves the day        ← exercise-variation-engine.ts
 *
 * This module receives a MonthlyBlockPlan and generates 4 WeeklyBlockPlans
 * that define the emphasis, stress allocation, and session roles for each
 * week of the monthly block.
 *
 * Week roles:
 *   establish  — learn, pattern, submaximal loads, wide volume tolerance
 *   build      — increase volume or load, progressive overload
 *   intensify  — peak expression, highest load/density, reduced volume
 *   deload     — active recovery, movement quality, 40–60% volume reduction
 */

import type { MonthlyBlockPlan, MonthlyBlockType, SpecialPopBlockType } from "./monthly-block-planner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeekRole = "establish" | "build" | "intensify" | "deload";

export interface SessionRoleDistribution {
  dayIndex: number;
  sessionRole: string;
  emphasis: string;
  neuralDemand: "high" | "moderate" | "low";
  stressLevel: "high" | "moderate" | "low";
  volumeBias: "high" | "moderate" | "low";
  intensityBias: "high" | "moderate" | "low";
  loadingNotes: string;
}

export interface WeeklyBlockPlan {
  weekNumber: number;
  role: WeekRole;
  weeklyEmphasis: string;
  stressAllocation: "building" | "peak" | "recovering" | "establishing";
  intensityBias: "high" | "moderate" | "low";
  volumeBias: "high" | "moderate" | "low";
  overallNeuralDemand: "high" | "moderate" | "low";
  sessionRoles: SessionRoleDistribution[];
  coachingNotes: string;
  progressionDirective: string;
}

// ─── Session Role Templates ───────────────────────────────────────────────────

interface SessionRoleTemplate {
  sessionRole: string;
  emphasis: string;
  neuralDemand: "high" | "moderate" | "low";
  stressLevel: "high" | "moderate" | "low";
  volumeBias: "high" | "moderate" | "low";
  intensityBias: "high" | "moderate" | "low";
  loadingNotes: string;
}

// Session roles vary by week position and block type
const SESSION_ROLES_BY_WEEKROLE: Record<WeekRole, SessionRoleTemplate[]> = {
  establish: [
    {
      sessionRole: "Pattern Establishment",
      emphasis: "Movement quality, position finding, load tolerance assessment",
      neuralDemand: "moderate",
      stressLevel: "moderate",
      volumeBias: "moderate",
      intensityBias: "low",
      loadingNotes: "RPE 6–7 max. Learn the exercise — not the heaviest possible load. Use 3 working sets.",
    },
    {
      sessionRole: "Volume Baseline",
      emphasis: "Accumulating work across patterns, finding sustainable rep ranges",
      neuralDemand: "moderate",
      stressLevel: "moderate",
      volumeBias: "moderate",
      intensityBias: "low",
      loadingNotes: "Moderate load across multiple sets. Complete all reps cleanly. No grinding reps.",
    },
    {
      sessionRole: "Technique Priority",
      emphasis: "Technical refinement, unilateral pattern confidence, trunk control",
      neuralDemand: "low",
      stressLevel: "low",
      volumeBias: "moderate",
      intensityBias: "low",
      loadingNotes: "Load is secondary to form. Slow eccentric tempos where appropriate. Leave reps in reserve.",
    },
    {
      sessionRole: "Aerobic Capacity Base",
      emphasis: "Energy system baseline, interval structure, work capacity foundation",
      neuralDemand: "low",
      stressLevel: "low",
      volumeBias: "high",
      intensityBias: "low",
      loadingNotes: "Zone 2–3 effort for conditioning elements. Comfortable intensity — not breathless.",
    },
    {
      sessionRole: "Full Pattern Integration",
      emphasis: "All movement patterns within a session, sequencing and flow",
      neuralDemand: "moderate",
      stressLevel: "moderate",
      volumeBias: "moderate",
      intensityBias: "low",
      loadingNotes: "Moderate across the board — this is a baseline, not a test.",
    },
  ],

  build: [
    {
      sessionRole: "Progressive Load",
      emphasis: "Increase load or reps from establish week, push toward working sets",
      neuralDemand: "high",
      stressLevel: "high",
      volumeBias: "high",
      intensityBias: "moderate",
      loadingNotes: "RPE 7–8. If reps were achieved in establish week, add 2.5–5kg. Aim for 4 working sets.",
    },
    {
      sessionRole: "Volume Accumulation",
      emphasis: "Higher work volume, more sets per pattern, moderate intensity",
      neuralDemand: "moderate",
      stressLevel: "high",
      volumeBias: "high",
      intensityBias: "moderate",
      loadingNotes: "More total sets than last week. Priority on completing all working sets cleanly.",
    },
    {
      sessionRole: "Strength Expression",
      emphasis: "Top sets at higher intensity — working toward peak loads",
      neuralDemand: "high",
      stressLevel: "high",
      volumeBias: "moderate",
      intensityBias: "high",
      loadingNotes: "Work up to a heavy top set (RPE 8–8.5). Back-off sets for volume. CNS demands are high — recovery essential.",
    },
    {
      sessionRole: "Density Work",
      emphasis: "Same volume as establish week but in less time — improved efficiency",
      neuralDemand: "moderate",
      stressLevel: "moderate",
      volumeBias: "high",
      intensityBias: "moderate",
      loadingNotes: "Reduce rest periods by 15–20% from last week. Maintain load quality — do not sacrifice weight for pace.",
    },
    {
      sessionRole: "Power Development",
      emphasis: "Explosive work prioritized, contrast pairs if applicable",
      neuralDemand: "high",
      stressLevel: "high",
      volumeBias: "moderate",
      intensityBias: "high",
      loadingNotes: "Power work first while CNS is fresh. Heavy strength work follows. Contrast pairs increase rate of force development.",
    },
  ],

  intensify: [
    {
      sessionRole: "Peak Strength Expression",
      emphasis: "Heaviest loads of the block, highest intensity, minimal volume",
      neuralDemand: "high",
      stressLevel: "high",
      volumeBias: "low",
      intensityBias: "high",
      loadingNotes: "RPE 8.5–9.5. Work up to true top sets. Volume drops — quality replaces quantity. This is peak expression.",
    },
    {
      sessionRole: "High Neural Demand",
      emphasis: "Heavy compound movement + complementary explosive power",
      neuralDemand: "high",
      stressLevel: "high",
      volumeBias: "low",
      intensityBias: "high",
      loadingNotes: "Longer rest between sets. No rushing. This session demands full recovery between efforts.",
    },
    {
      sessionRole: "Max Effort Power",
      emphasis: "Maximum explosive output — plyometrics at full intensity",
      neuralDemand: "high",
      stressLevel: "high",
      volumeBias: "low",
      intensityBias: "high",
      loadingNotes: "Low rep count, max quality per rep. 3–5 reps per set. Full recovery between sets.",
    },
    {
      sessionRole: "Structural Integrity Day",
      emphasis: "Lower neural demand session within intensify week — maintain without taxing CNS",
      neuralDemand: "moderate",
      stressLevel: "moderate",
      volumeBias: "moderate",
      intensityBias: "moderate",
      loadingNotes: "RPE 7–7.5 ceiling. Maintain competency without adding to the accumulated weekly stress.",
    },
    {
      sessionRole: "Competitive Demand Simulation",
      emphasis: "High-output work that mirrors sport/competition demands",
      neuralDemand: "high",
      stressLevel: "high",
      volumeBias: "moderate",
      intensityBias: "high",
      loadingNotes: "Full effort. This is the closest the gym session gets to competition demand.",
    },
  ],

  deload: [
    {
      sessionRole: "Active Recovery",
      emphasis: "Movement quality only — full systemic recovery is the goal",
      neuralDemand: "low",
      stressLevel: "low",
      volumeBias: "low",
      intensityBias: "low",
      loadingNotes: "50–60% of normal volume. 60–70% of normal load. RPE ≤5. This is recovery, not training.",
    },
    {
      sessionRole: "Pattern Maintenance",
      emphasis: "Maintain motor patterns and joint health — do not add fatigue",
      neuralDemand: "low",
      stressLevel: "low",
      volumeBias: "low",
      intensityBias: "low",
      loadingNotes: "2–3 sets per exercise maximum. Avoid failure at all costs. This session should feel easy — that's the point.",
    },
    {
      sessionRole: "Tissue Quality Work",
      emphasis: "Soft tissue, joint health, eccentric resilience at low load",
      neuralDemand: "low",
      stressLevel: "low",
      volumeBias: "low",
      intensityBias: "low",
      loadingNotes: "Isometric holds, tempo work, bodyweight focus. Nordic curls, Copenhagen, face pulls, mobility flows.",
    },
    {
      sessionRole: "Mobility & Structural Care",
      emphasis: "Mobility work, targeted structural exercises, no heavy loading",
      neuralDemand: "low",
      stressLevel: "low",
      volumeBias: "low",
      intensityBias: "low",
      loadingNotes: "Therapeutic intent. Yoga flow, mobility drills, light resistance work only.",
    },
    {
      sessionRole: "Reload & Prepare",
      emphasis: "Low-volume, moderate-feel session — reestablish readiness for next block",
      neuralDemand: "low",
      stressLevel: "low",
      volumeBias: "low",
      intensityBias: "low",
      loadingNotes: "Finish feeling better than when you started. Leave the gym energized.",
    },
  ],
};

// ─── Week-Role to Coaching Notes ─────────────────────────────────────────────

function buildCoachingNotes(
  role: WeekRole,
  blockType: MonthlyBlockType | SpecialPopBlockType,
): string {
  switch (role) {
    case "establish":
      return `ESTABLISH WEEK — The priority is learning, not loading. Athletes should finish every session feeling competent and energized, not depleted. This week sets the technical baseline for the entire block. Do not rush load progression — patterns established now are the foundation every subsequent week builds on. RPE ceiling: 7/10.`;

    case "build":
      if (blockType === "accumulation" || blockType === "hypertrophy_support") {
        return `BUILD WEEK — Volume is the primary driver this week. Add sets, add reps, increase load only when previous rep targets are achieved cleanly. Athletes should feel the work this week — productive fatigue is appropriate. Manage recovery between sessions carefully. RPE ceiling: 8/10.`;
      }
      return `BUILD WEEK — Load progression is the primary driver. Working toward top sets that challenge without exceeding technique. Volume is secondary to load quality. Athletes should feel strength coming — confidence in heavy positions. RPE ceiling: 8/10.`;

    case "intensify":
      return `INTENSIFY WEEK — This is peak expression. Loads are the heaviest of the block. Volume drops to support recovery from high neural demand. Athletes should prepare mentally and physically — adequate sleep, nutrition, and warm-up time. CNS demand is high. Do not add extra sessions or accessory volume this week. RPE ceiling: 9.5/10.`;

    case "deload":
      return `DELOAD WEEK — Non-negotiable recovery. Resistance to deloading is common but misguided. Supercompensation happens during deload, not during hard training. This week, do less and recover more. Athletes who deload properly outperform those who don't over the long term. Volume: 50–60% of normal. Load: 60–70% of normal. RPE ceiling: 5/10.`;

    default:
      return "";
  }
}

function buildProgressionDirective(
  role: WeekRole,
  blockType: MonthlyBlockType | SpecialPopBlockType,
): string {
  switch (role) {
    case "establish":
      return "Select working weights at RPE 6–7. Record all loads, sets, and reps — this establishes the Week 1 baseline that Weeks 2–3 will progress from.";

    case "build":
      if (blockType === "accumulation" || blockType === "hypertrophy_support") {
        return "Add 1 set to primary exercises vs. Week 1. If all reps were achieved, add 2.5–5kg on bilateral compounds, 1–2.5kg on isolation. Target RPE 7.5–8.";
      }
      return "Progress loads by 2.5–5% vs. Week 1. Work up to heavier top sets. Back-off volume provides hypertrophy stimulus while top sets build intensity tolerance. RPE 7.5–8.";

    case "intensify":
      return "Peak week: work up to true 1–3 rep top sets or max RPE 9 working sets. This is the culmination of the block. Volume is deliberately reduced — quality over quantity.";

    case "deload":
      return "Use 60–70% of Week 3 loads. Reduce set count by 40–50%. Do not add exercises. The goal is supercompensation and readiness for the next block, not training effect.";

    default:
      return "";
  }
}

// ─── Weekly Plan Builder ──────────────────────────────────────────────────────

function buildWeeklyEmphasis(
  role: WeekRole,
  blockType: MonthlyBlockType | SpecialPopBlockType,
  weekNumber: number,
): string {
  const blockName = blockType.replace(/_/g, " ");

  switch (role) {
    case "establish":
      return `Week ${weekNumber} (Establish): Introduce the ${blockName} framework. Pattern learning and load baseline. Movement quality is the output — not load.`;
    case "build":
      return `Week ${weekNumber} (Build): Progressive overload on established patterns. ${blockType === "accumulation" || blockType === "hypertrophy_support" ? "Volume increase — more sets and reps." : "Load increase — heavier working sets."} Push toward adaptation threshold.`;
    case "intensify":
      return `Week ${weekNumber} (Intensify): Peak expression of the ${blockName}. Highest loads or densest sessions of the entire block. Reduced volume. Full recovery between sessions.`;
    case "deload":
      return `Week ${weekNumber} (Deload): Mandatory recovery. System consolidation. 50% volume, 65% load. Supercompensation happens here — not during hard weeks.`;
  }
}

// ─── Block-Type Session Role Overlays ────────────────────────────────────────
// Override generic session role names with block-type-specific language.
// A power_conversion block should not say "Pattern Establishment" — it should say
// "Power Introduction". A hypertrophy block should not say "Progressive Load" — it
// should say "Volume Accumulation". This makes the session intent legible to the AI
// and ultimately to the user.

interface SessionRoleOverride {
  sessionRole: string;
  emphasis: string;
  loadingNotes: string;
}

const BLOCK_SESSION_ROLE_OVERLAYS: Partial<Record<
  MonthlyBlockType | SpecialPopBlockType,
  Partial<Record<WeekRole, SessionRoleOverride[]>>
>> = {
  power_conversion: {
    establish: [
      { sessionRole: "Power Introduction", emphasis: "Learn contrast pair structure — sub-maximal strength with explosive primer", loadingNotes: "60–70% loads on strength work. Explosive primer first (3 × 3 jumps or throws). No grinding." },
      { sessionRole: "Force-Velocity Baseline", emphasis: "Establish power output baseline — measure jump height, sprint time, or bar speed", loadingNotes: "Quality over quantity. Every explosive rep must be max intent. 2–3 min rest between power sets." },
      { sessionRole: "Athletic Strength Foundation", emphasis: "Build the strength base that contrast training will amplify — force production base", loadingNotes: "75–80% loads. Technique priority — power block needs clean bilateral patterns to contrast from." },
      { sessionRole: "Reactive Strength Introduction", emphasis: "Introduce plyometric sequencing — landing mechanics, reactive rebound, short contact", loadingNotes: "Low plyometric volume (2 × 5 per movement). Emphasize ground contact quality — not height." },
      { sessionRole: "Rotational Power Primer", emphasis: "Med ball work and rotational power patterns — introduce explosive hip and trunk patterns", loadingNotes: "Overhead throws, rotational slams, lateral med ball tosses. Low sets, max intent." },
    ],
    build: [
      { sessionRole: "Contrast Pair Session", emphasis: "Heavy strength set immediately followed by explosive equivalent — PAP activation", loadingNotes: "80–85% strength load → immediate explosive. 3–5 min full rest between pairs. Maximum output on explosive." },
      { sessionRole: "Plyometric Volume Build", emphasis: "Increase plyometric volume — more jumps, bounds, throws with maintained quality", loadingNotes: "Add sets vs Week 1. Quality non-negotiable. If landing mechanics degrade, stop the set." },
      { sessionRole: "Strength-Power Complex", emphasis: "Heavy compound lift + ballistic equivalent — full contrast protocol", loadingNotes: "Work up to 83–87% top set. Follow with 3 × 3 explosive equivalent. Full CNS recovery between pairs." },
      { sessionRole: "Speed-Strength Work", emphasis: "Velocity-based loading — fast bar speed at moderate loads (60–70% intent-speed)", loadingNotes: "Move every rep as fast as possible. Bar speed > bar load. This develops the force-velocity curve." },
      { sessionRole: "Power Endurance Circuit", emphasis: "Multiple explosive movements in sequence — power output under fatigue", loadingNotes: "Short rest (60–90 sec). Power endurance — not maximum power. Maintain form across all reps." },
    ],
    intensify: [
      { sessionRole: "Peak Contrast Expression", emphasis: "Heaviest loads paired with maximum explosive output — peak rate of force development", loadingNotes: "90%+ strength loads in contrast. Max intent on every explosive rep. 4–5 min rest between pairs." },
      { sessionRole: "Maximum Power Output", emphasis: "Absolute power peak — highest jumps, fastest throws, greatest bar velocity", loadingNotes: "Reduce volume by 30%. Every rep is maximum effort. This is the performance peak of the block." },
      { sessionRole: "Competitive Speed-Strength", emphasis: "Sport-transfer power expression — the gym session that mirrors athletic demand", loadingNotes: "Full effort. High-velocity work at game-relevant movement patterns." },
      { sessionRole: "Neural Peak Expression", emphasis: "CNS at peak — heavy loading + explosive finisher, full recovery between efforts", loadingNotes: "Longest rest periods of the block. Quality at maximum. This session demands full recovery." },
    ],
    deload: [
      { sessionRole: "Power Preservation", emphasis: "Maintain explosive patterns with 40–50% volume reduction — do not detrain power", loadingNotes: "3 × 3 jumps/throws max. 65–70% strength loads. The goal is CNS recovery, not training effect." },
      { sessionRole: "Movement Quality Reset", emphasis: "Technique refinement — fix any compensations that appeared during intensify week", loadingNotes: "Light loads. Slow down — emphasize position and intent, not speed or weight." },
    ],
  },

  hypertrophy_support: {
    establish: [
      { sessionRole: "Volume Baseline", emphasis: "Learn positions for muscle growth — feel the muscle working, establish mind-muscle connection", loadingNotes: "3 sets × 12–15 reps. RPE 6–7. Feel the muscle — not just move the weight." },
      { sessionRole: "Pump Day Foundation", emphasis: "Introduce metabolic stress — higher rep accessory work, blood flow to target muscles", loadingNotes: "Moderate loads, 10–15 reps, short rest (60–75 sec). Pump is the signal — not intensity." },
      { sessionRole: "Structural Balance Session", emphasis: "Full range of motion priority — establish movement quality for full stretch hypertrophy", loadingNotes: "Slow eccentrics (3–4 count). Full ROM non-negotiable. Load is secondary." },
      { sessionRole: "Muscle Group Priority", emphasis: "Focus on a priority muscle group — multi-angle attack to establish volume tolerance", loadingNotes: "3 exercises for priority area. 3 × 10–15 each. Rest 90 sec. Leave 2 reps in reserve." },
      { sessionRole: "Movement Integration Pump", emphasis: "Full-body pump — multiple patterns at moderate intensity for overall stimulus", loadingNotes: "Circuit-friendly. Higher reps, shorter rest. Metabolic stress across all major groups." },
    ],
    build: [
      { sessionRole: "Volume Accumulation", emphasis: "Add sets vs Week 1 — progressive volume overload is the primary driver", loadingNotes: "4 working sets. If all reps achieved last week, add 2.5–5% load. Double progression model." },
      { sessionRole: "Density Pump", emphasis: "Same work volume in less time — density increases metabolic stress and hypertrophy signal", loadingNotes: "Reduce rest by 15–20%. Maintain load quality — do not sacrifice weight for pace." },
      { sessionRole: "Muscle Peak Stimulus", emphasis: "Heaviest loads of the hypertrophy range (6–8 reps) — tension-driven hypertrophy", loadingNotes: "RPE 8–8.5. Work up to top sets at 6–8 reps. Back-off sets maintain volume stimulus." },
      { sessionRole: "Full Pump Session", emphasis: "Volume peak — maximum metabolic stress session across all target muscles", loadingNotes: "4–5 sets. Short rest. Pump is maximal. This session drives muscle swelling and growth signal." },
      { sessionRole: "Isolation Intensity", emphasis: "Isolation movements at intensity — single-joint exercises at near-failure reps", loadingNotes: "3–4 × 10–15 to near failure. Leave 1–2 reps in reserve. Quality contraction every rep." },
    ],
    intensify: [
      { sessionRole: "Peak Volume Stimulus", emphasis: "4–5 working sets at peak hypertrophy loads — maximum muscle growth signal of the block", loadingNotes: "RPE 8–9. Near-failure on final set. Longest rest periods of the block to support load quality." },
      { sessionRole: "Mechanical Tension Peak", emphasis: "Heaviest loads in full range of motion — maximum mechanical tension hypertrophy", loadingNotes: "6–8 rep top sets. Controlled eccentric. Full stretch at bottom. This is the tension peak." },
      { sessionRole: "Metabolic Stress Peak", emphasis: "Maximum pump — highest density session, shortest rest, highest rep counts", loadingNotes: "3–4 × 12–20. 45–60 sec rest. Occlusion-style pump. Volume is the goal, not load." },
      { sessionRole: "Priority Muscle Peak", emphasis: "Final priority muscle stimulation before deload — maximum volume for target area", loadingNotes: "Extra sets on priority area. Near-failure. This is the last heavy stimulus before recovery." },
    ],
    deload: [
      { sessionRole: "Pump Maintenance", emphasis: "Maintain muscle stimulus without adding fatigue — light pump, no failure", loadingNotes: "2–3 sets × 12–15. RPE ≤5. Blood flow and nutrient delivery — not training stimulus." },
      { sessionRole: "Movement Quality Reset", emphasis: "Full range of motion at light loads — reinforce positions for next block", loadingNotes: "Light loads. Slow eccentrics. This session should feel restorative." },
    ],
  },

  strength_emphasis: {
    establish: [
      { sessionRole: "Technical Foundation", emphasis: "Learn the heavy patterns at submaximal loads — position, bracing, and bar path", loadingNotes: "80% loads. Technique is the output — not load. Record every session for next week's baseline." },
      { sessionRole: "Strength Volume Base", emphasis: "Working sets across the primary lifts — build volume tolerance at heavy loads", loadingNotes: "4 × 5 at 78–82%. Clean reps across all sets. No grinding. Baseline for Week 2 progression." },
      { sessionRole: "Back-Off Volume", emphasis: "Heavy top set followed by back-off sets — intensity + volume combination", loadingNotes: "Work to RPE 8 top set. Drop 10–12% for 3 × 5 back-off. Full recovery between heavy sets." },
      { sessionRole: "Structural Support Day", emphasis: "Accessory work to support the primary lifts — target weakness points", loadingNotes: "Moderate loads. Accessory movements serve the primary lifts. Don't exhaust CNS for support work." },
    ],
    build: [
      { sessionRole: "Heavy Working Sets", emphasis: "Progress loads from Week 1 — heavier working sets across primary patterns", loadingNotes: "Add 2.5–5% vs Week 1. RPE 8. Complete all prescribed sets. This is the overload week." },
      { sessionRole: "Top Set Focus", emphasis: "Work to a heavy top set — single or triple at RPE 8.5–9, then back-off volume", loadingNotes: "Work up methodically. 1–3 heavy top sets. Back-off volume at 85% of top set. Log everything." },
      { sessionRole: "Strength Density", emphasis: "More total heavy volume — extra back-off sets, more reps at working weight", loadingNotes: "Add 1 set to primary compound. Maintain load. Density drives strength adaptations over time." },
      { sessionRole: "Complementary Strength Day", emphasis: "Second heavy day of the week — reinforce primary pattern from a different angle", loadingNotes: "Different variation of primary pattern (pause, deficit, close grip). 78–83% loads." },
    ],
    intensify: [
      { sessionRole: "Peak Strength Expression", emphasis: "Heaviest loads of the block — work up to true top sets at RPE 9–9.5", loadingNotes: "This is the peak. 1–3 reps at near-max. Full rest (4–5 min). No accessory work to protect CNS." },
      { sessionRole: "Max Effort Day", emphasis: "Maximum strength expression — competition-style loading, no holding back", loadingNotes: "RPE 9.5. Warm-up well. This session is the culmination of the block. Go heavy." },
      { sessionRole: "Technical Max", emphasis: "Top sets with perfect technique — validate that technique holds under peak load", loadingNotes: "If technique breaks at this load, back off. A clean technical max is worth more than a grinding PR." },
      { sessionRole: "Heavy Complementary Day", emphasis: "Heavy variation on the secondary pattern — maintain strength base across all patterns", loadingNotes: "RPE 8.5. Different primary lift than Day 1. Both primary patterns reach peak this week." },
    ],
    deload: [
      { sessionRole: "Technical Deload", emphasis: "Movement quality at light loads — reinforce technique before next block", loadingNotes: "60–65% loads. 3 × 5 max. Perfect reps. No weight increase this week." },
      { sessionRole: "Active Recovery Strength", emphasis: "Blood flow and joint health — maintain motor patterns without neural demand", loadingNotes: "50–60% loads. Feel good. Leave the gym more energized than when you entered." },
    ],
  },

  work_capacity: {
    establish: [
      { sessionRole: "Conditioning Baseline", emphasis: "Establish work:rest ratios and session density baseline — find sustainable pace", loadingNotes: "Zone 2–3 effort. Complete all work. Record times for Week 2 density comparison." },
      { sessionRole: "Interval Foundation", emphasis: "Structured interval introduction — named work duration and rest duration", loadingNotes: "State energy system: aerobic base / lactate threshold / VO2max. Every rep has work and rest times." },
      { sessionRole: "Strength Conditioning", emphasis: "Compound strength work at conditioning-appropriate loads — strength base for work capacity", loadingNotes: "Moderate loads. 3 × 8–12. This maintains strength while building conditioning base." },
      { sessionRole: "Aerobic Base Development", emphasis: "Sub-threshold sustained work — build the aerobic engine that powers all higher intensities", loadingNotes: "Zone 2 steady state or structured interval at moderate intensity. RPE 5–6. Long duration." },
    ],
    build: [
      { sessionRole: "Density Progression", emphasis: "Same work volume in less time — improve efficiency and aerobic capacity", loadingNotes: "Reduce rest by 15–20% from Week 1. Maintain quality — do not sacrifice intensity for pace." },
      { sessionRole: "Lactate Threshold Work", emphasis: "Sustained high-intensity intervals — push the threshold, build race-pace endurance", loadingNotes: "Work at RPE 7–8. Named intervals: 3 × 5 min at threshold, 2 min rest. Log all times." },
      { sessionRole: "Circuit Conditioning", emphasis: "Multi-exercise conditioning circuit — sustained work output across compound movements", loadingNotes: "4–6 stations. 40–50 sec work / 15–20 sec transition. 3–4 rounds. Record total completion time." },
      { sessionRole: "VO2max Intervals", emphasis: "Short, high-intensity intervals — push maximum oxygen uptake capacity", loadingNotes: "30 sec max effort / 90 sec rest × 8–10. Full effort. This builds the aerobic ceiling." },
    ],
    intensify: [
      { sessionRole: "Peak Conditioning Output", emphasis: "Maximum sustainable work output — highest density session of the block", loadingNotes: "Compressed rest periods. All-out effort. This is the fitness test — can you maintain quality under fatigue?" },
      { sessionRole: "Race-Pace Simulation", emphasis: "Competition-level conditioning demands — sport-specific or goal-specific intensity", loadingNotes: "Specific work to the goal (5K pace, sport conditioning, fight rounds). Maximal sustainable intensity." },
      { sessionRole: "Anaerobic Capacity Peak", emphasis: "Peak anaerobic work — highest intensity intervals with incomplete recovery", loadingNotes: "Maximum effort. Incomplete rest. Build tolerance to high-intensity fatigue states." },
    ],
    deload: [
      { sessionRole: "Active Recovery Conditioning", emphasis: "Light aerobic work — flush fatigue, maintain aerobic fitness, promote recovery", loadingNotes: "Zone 2 only. 20–30 min easy. No intervals. Active recovery, not training." },
      { sessionRole: "Movement Quality Day", emphasis: "Technique and mobility focus — no conditioning demands, pure recovery", loadingNotes: "Yoga flow, mobility work, light movement. Recovery is the goal." },
    ],
  },

  re_entry_resilience: {
    establish: [
      { sessionRole: "Movement Confidence", emphasis: "Reestablish movement patterns at very low load — confidence and tissue preparation", loadingNotes: "RPE 5 maximum. Bodyweight or very light load. Leave feeling good, not fatigued." },
      { sessionRole: "Tissue Preparation", emphasis: "Warm tissue to training demands — gentle loading to reinforce movement quality", loadingNotes: "Isometric before dynamic. Bilateral before unilateral. 2 × 10–15 per movement." },
      { sessionRole: "Work Capacity Assessment", emphasis: "Understand current work tolerance — set the floor for progressive loading", loadingNotes: "Conservative loads. Record all sets/reps. This establishes the baseline for Week 2." },
    ],
    build: [
      { sessionRole: "Progressive Load Day", emphasis: "Small load increase from Week 1 — confidence at slightly higher demands", loadingNotes: "RPE 6–7 max. Small weight increase where Week 1 felt easy. Conservative progression." },
      { sessionRole: "Volume Tolerance Build", emphasis: "Add one set to primary movements — assess recovery between sessions", loadingNotes: "Additional set on primary lifts. Maintain quality. Recovery is still the primary constraint." },
      { sessionRole: "Movement Repertoire Day", emphasis: "Expand the exercise variety — introduce additional movement patterns at low load", loadingNotes: "New movements at RPE 5–6. Learn the movement — not test the limit." },
    ],
    intensify: [
      { sessionRole: "Challenge Day", emphasis: "Moderate challenge — assess true capacity after 2 weeks of foundation work", loadingNotes: "RPE 7–7.5 ceiling. First real test of readiness. Note any discomfort for coach review." },
      { sessionRole: "Full Session Competency", emphasis: "Complete full session template at moderate loads — prove session tolerance", loadingNotes: "All exercises in the template. Moderate effort. Success is completing all sets with good form." },
    ],
    deload: [
      { sessionRole: "Consolidation Day", emphasis: "Solidify gains — submaximal practice of all learned patterns at reduced volume", loadingNotes: "60% volume. RPE 5. Movement quality only. Prepare for next block entry." },
      { sessionRole: "Readiness Assessment", emphasis: "Light activity to assess recovery and readiness for the next block", loadingNotes: "Easy movement. How does the body feel? This informs the next block selection." },
    ],
  },
};

/** Apply block-type-specific session role language where defined. */
function applyBlockTypeOverlay(
  template: SessionRoleTemplate,
  blockType: MonthlyBlockType | SpecialPopBlockType,
  role: WeekRole,
  dayIndex: number,
): SessionRoleTemplate {
  const blockOverlays = BLOCK_SESSION_ROLE_OVERLAYS[blockType];
  if (!blockOverlays) return template;
  const weekRoleOverlays = blockOverlays[role];
  if (!weekRoleOverlays || weekRoleOverlays.length === 0) return template;

  const override = weekRoleOverlays[dayIndex % weekRoleOverlays.length];
  if (!override) return template;

  return {
    ...template,
    sessionRole: override.sessionRole,
    emphasis: override.emphasis,
    loadingNotes: override.loadingNotes,
  };
}

function assignSessionRoles(
  role: WeekRole,
  daysPerWeek: number,
  blockType: MonthlyBlockType | SpecialPopBlockType,
  sport: string | null,
): SessionRoleDistribution[] {
  const templates = SESSION_ROLES_BY_WEEKROLE[role];
  const roles: SessionRoleDistribution[] = [];

  for (let i = 0; i < daysPerWeek; i++) {
    let template: SessionRoleTemplate;

    if (role === "deload") {
      // Deload: alternate active recovery and maintenance
      template = i % 2 === 0
        ? templates[0] // Active Recovery
        : templates[1]; // Pattern Maintenance
    } else if (role === "intensify") {
      // Intensify: alternate high CNS demand with structural integrity
      if (daysPerWeek >= 4) {
        // One structural integrity session per 4-day intensify week
        template = (i === daysPerWeek - 2) ? templates[3] : templates[Math.min(i, 2)];
      } else {
        template = templates[Math.min(i, 2)];
      }
    } else if (role === "establish") {
      // Establish: rotate through patterns systematically
      const establishOrder = [0, 2, 1, 4, 3]; // pattern, technique, volume, integration, aerobic
      template = templates[establishOrder[i % templates.length]];
    } else {
      // Build: progress from volume to load to density to power across the week
      const buildOrder = [0, 1, 4, 2, 3]; // progressive load, volume, power, strength, density
      template = templates[buildOrder[i % templates.length]];
    }

    // Combat sports: conditioning days get marked as "conditioning density"
    const s = (sport ?? "").toLowerCase();
    const isCombat = s.includes("mma") || s.includes("boxing") || s.includes("wrestling");
    if (isCombat && i === daysPerWeek - 1 && role !== "deload") {
      roles.push({
        dayIndex: i,
        sessionRole: "Conditioning Priority",
        emphasis: "Energy system development — work capacity and lactic tolerance",
        neuralDemand: "moderate",
        stressLevel: role === "intensify" ? "high" : "moderate",
        volumeBias: role === "intensify" ? "moderate" : "high",
        intensityBias: "moderate",
        loadingNotes: "Conditioning rounds with named work:rest ratios. Not a strength session.",
      });
      continue;
    }

    const overlaidTemplate = applyBlockTypeOverlay(template, blockType, role, i);
    roles.push({
      dayIndex: i,
      ...overlaidTemplate,
    });
  }

  return roles;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function buildWeeklyBlockPlans(
  monthlyPlan: MonthlyBlockPlan,
  daysPerWeek: number,
  sport: string | null,
  seed: number,
): WeeklyBlockPlan[] {
  const weekRoles: WeekRole[] = ["establish", "build", "intensify", "deload"];

  const plans: WeeklyBlockPlan[] = weekRoles.map((role, index) => {
    const weekNumber = index + 1;
    const sessionRoles = assignSessionRoles(role, daysPerWeek, monthlyPlan.blockType, sport);

    const weeklyEmphasis = buildWeeklyEmphasis(role, monthlyPlan.blockType, weekNumber);
    const coachingNotes = buildCoachingNotes(role, monthlyPlan.blockType);
    const progressionDirective = buildProgressionDirective(role, monthlyPlan.blockType);

    const overallNeuralDemand: "high" | "moderate" | "low" =
      role === "establish" ? "moderate" :
      role === "build" ? monthlyPlan.neuralDemandProfile :
      role === "intensify" ? "high" :
      "low";

    return {
      weekNumber,
      role,
      weeklyEmphasis,
      stressAllocation:
        role === "establish" ? "establishing" :
        role === "build" ? "building" :
        role === "intensify" ? "peak" :
        "recovering",
      intensityBias:
        role === "establish" ? "low" :
        role === "build" ? "moderate" :
        role === "intensify" ? "high" :
        "low",
      volumeBias:
        role === "establish" ? "moderate" :
        role === "build" ? "high" :
        role === "intensify" ? "low" :
        "low",
      overallNeuralDemand,
      sessionRoles,
      coachingNotes,
      progressionDirective,
    };
  });

  // Audit log all 4 weeks
  if (process.env.NODE_ENV !== "production") {
    plans.forEach((p) => {
      console.log("[BuildAudit:WeeklyBlock]", JSON.stringify({
        weekNumber: p.weekNumber,
        role: p.role,
        stressAllocation: p.stressAllocation,
        intensityBias: p.intensityBias,
        volumeBias: p.volumeBias,
        overallNeuralDemand: p.overallNeuralDemand,
        sessionCount: p.sessionRoles.length,
        sessionRoles: p.sessionRoles.map(s => s.sessionRole),
      }));

      p.sessionRoles.forEach((sr) => {
        console.log("[BuildAudit:SessionRole]", JSON.stringify({
          week: p.weekNumber,
          weekRole: p.role,
          dayIndex: sr.dayIndex,
          sessionRole: sr.sessionRole,
          emphasis: sr.emphasis,
          neuralDemand: sr.neuralDemand,
          stressLevel: sr.stressLevel,
        }));
      });
    });
  }

  return plans;
}

/**
 * Returns the context for a SPECIFIC week — used when generating initial program
 * (typically Week 1 "establish" is the template, but all 4 weeks are described).
 */
export function buildWeeklyBlockContext(
  plans: WeeklyBlockPlan[],
  activeWeekNumber: number = 1,
): string {
  const activePlan = plans.find(p => p.weekNumber === activeWeekNumber) ?? plans[0];

  const allWeekSummaries = plans.map(p =>
    `  Week ${p.weekNumber} [${p.role.toUpperCase()}]: ${p.weeklyEmphasis}`
  ).join("\n");

  const sessionRoleLines = activePlan.sessionRoles.map((sr, i) =>
    `  Day ${i + 1} — ${sr.sessionRole}
    Emphasis: ${sr.emphasis}
    Neural demand: ${sr.neuralDemand.toUpperCase()} | Stress: ${sr.stressLevel.toUpperCase()} | Volume bias: ${sr.volumeBias.toUpperCase()} | Intensity bias: ${sr.intensityBias.toUpperCase()}
    Loading notes: ${sr.loadingNotes}`
  ).join("\n\n");

  return `## WEEKLY BLOCK PLAN — HIERARCHICAL PROGRAMMING LAYER 2
Current Week: Week ${activePlan.weekNumber} (${activePlan.role.toUpperCase()})
Weekly Emphasis: ${activePlan.weeklyEmphasis}

STRESS ALLOCATION: ${activePlan.stressAllocation.toUpperCase()}
INTENSITY BIAS: ${activePlan.intensityBias.toUpperCase()} | VOLUME BIAS: ${activePlan.volumeBias.toUpperCase()} | OVERALL NEURAL DEMAND: ${activePlan.overallNeuralDemand.toUpperCase()}

COACHING DIRECTIVE:
${activePlan.coachingNotes}

PROGRESSION DIRECTIVE FOR THIS WEEK:
${activePlan.progressionDirective}

SESSION ROLES THIS WEEK (inherit these roles into each day's architecture):
${sessionRoleLines}

FOUR-WEEK PROGRESSION ARC:
${allWeekSummaries}`;
}
