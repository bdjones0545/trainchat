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

    roles.push({
      dayIndex: i,
      ...template,
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
