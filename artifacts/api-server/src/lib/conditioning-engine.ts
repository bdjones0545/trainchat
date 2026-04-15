/**
 * TrainChat Conditioning / Energy System Engine
 *
 * Phase 1 Intelligence Upgrade — Real conditioning programming.
 *
 * Replaces "resistance training with circuits" with:
 * - True energy system classification
 * - Structured work:rest prescriptions
 * - Modality-specific session templates
 * - Sport-specific conditioning logic
 * - Progressive overload for conditioning work
 *
 * Architecture: This module is intentionally decoupled from AI/OpenAI.
 * It is the conditioning brain that generates structured context injected into prompts.
 */

// ─── Energy System Types ──────────────────────────────────────────────────────

export type EnergySystemType =
  | "aerobic_base"          // Aerobic development — steady-state, low intensity, long duration
  | "aerobic_power"         // Tempo work — moderate intensity, sustained effort
  | "lactate_threshold"     // Threshold intervals — at/near threshold, longer intervals
  | "vo2max"                // VO2max intervals — high intensity, short intervals, full recovery
  | "anaerobic_capacity"    // Glycolytic capacity — max effort, moderate rest
  | "repeat_sprint_ability"; // RSA — short sprints, short rest, multiple sets

// ─── Modality Types ───────────────────────────────────────────────────────────

export type ConditioningModality =
  | "running"             // Tempo runs, sprint work, shuttles
  | "sled"                // Sled push/pull
  | "rower"               // Rowing machine intervals
  | "bike"                // Assault bike / stationary bike
  | "jump_rope"           // Jump rope conditioning
  | "shuttle_run"         // Shuttle run / direction-change sprints
  | "sprint"              // Linear sprint work
  | "bodyweight_circuit"; // Bodyweight-only conditioning (last resort)

// ─── Energy System Profiles ───────────────────────────────────────────────────

export interface EnergySystemProfile {
  type: EnergySystemType;
  label: string;
  description: string;
  primaryAdaptation: string;
  intensityRange: string;         // e.g., "60–70% max HR"
  workDurationRange: string;      // e.g., "20–40 min continuous" or "4–8 min per interval"
  restRatio: string;              // e.g., "1:1", "1:3", "continuous"
  repRange: string;               // e.g., "3–6 intervals" or "continuous"
  totalSessionTime: string;       // e.g., "25–40 min"
  progressionMethod: string;      // How this system progresses over time
  coachNote: string;
  weeklyFrequency: string;        // How often per week this system is trained
}

export const ENERGY_SYSTEM_PROFILES: Record<EnergySystemType, EnergySystemProfile> = {
  aerobic_base: {
    type: "aerobic_base",
    label: "Aerobic Base",
    description: "Builds the aerobic foundation — steady-state or long-interval work at conversational effort",
    primaryAdaptation: "Cardiac output, mitochondrial density, aerobic efficiency",
    intensityRange: "60–70% max HR (conversational pace — can speak in sentences)",
    workDurationRange: "20–40 min continuous or 3–5 min intervals",
    restRatio: "continuous or 1:1",
    repRange: "1 continuous block or 4–6 long intervals",
    totalSessionTime: "25–45 min",
    progressionMethod: "Add 5 min per week until 40 min continuous. Then increase to moderate intensity.",
    coachNote: "This is the foundation of all conditioning. Resist the urge to go faster — the adaptation lives at this intensity.",
    weeklyFrequency: "1–3×/week depending on sport demand",
  },

  aerobic_power: {
    type: "aerobic_power",
    label: "Aerobic Power (Tempo)",
    description: "Tempo intervals at comfortably hard effort — just below the point where conversation becomes difficult",
    primaryAdaptation: "Lactate clearance, aerobic power output, sustained speed",
    intensityRange: "75–85% max HR (can speak a few words, not full sentences)",
    workDurationRange: "5–15 min per interval",
    restRatio: "1:0.5 (half the work duration)",
    repRange: "2–4 intervals",
    totalSessionTime: "30–40 min",
    progressionMethod: "Increase work duration by 1–2 min every 2 weeks. Add a rep when duration hits the top of range.",
    coachNote: "Tempo work is not a race. Consistent effort across all reps — the last interval should feel like the first.",
    weeklyFrequency: "1–2×/week",
  },

  lactate_threshold: {
    type: "lactate_threshold",
    label: "Lactate Threshold",
    description: "Sustained high-intensity intervals at threshold — the edge of sustainable maximum effort",
    primaryAdaptation: "Lactate threshold elevation, high-intensity aerobic capacity",
    intensityRange: "85–92% max HR (8–9/10 RPE — hard but controlled)",
    workDurationRange: "3–8 min per interval",
    restRatio: "1:1 (equal work and rest)",
    repRange: "3–6 intervals",
    totalSessionTime: "30–45 min",
    progressionMethod: "Add 1 interval every 2 weeks. When 6 intervals are achievable, reduce rest by 15 sec.",
    coachNote: "This is the most impactful conditioning intensity zone. Pace is everything — start controlled, hold the effort.",
    weeklyFrequency: "1–2×/week",
  },

  vo2max: {
    type: "vo2max",
    label: "VO2max Intervals",
    description: "Short, maximal-effort intervals with full recovery — develops peak aerobic capacity",
    primaryAdaptation: "VO2max, stroke volume, oxygen delivery ceiling",
    intensityRange: "90–100% max HR (9–10/10 RPE — near maximal)",
    workDurationRange: "1–3 min per interval",
    restRatio: "1:1 to 1:2 (full recovery between efforts)",
    repRange: "4–8 intervals",
    totalSessionTime: "25–35 min",
    progressionMethod: "Add 1 interval every 2 weeks. When 8 intervals are achievable, reduce rest to 1:1.",
    coachNote: "Every interval is a max effort. If the last rep doesn't feel like the hardest, the rest is too short or effort too low.",
    weeklyFrequency: "1×/week (high CNS cost)",
  },

  anaerobic_capacity: {
    type: "anaerobic_capacity",
    label: "Anaerobic Capacity",
    description: "Maximum glycolytic output — explosive short efforts with moderate recovery",
    primaryAdaptation: "Anaerobic glycolytic capacity, power endurance, repeat high-intensity effort",
    intensityRange: "100% effort (all-out for each rep)",
    workDurationRange: "10–30 sec all-out effort per rep",
    restRatio: "1:3 to 1:5 (incomplete recovery — that's the stress)",
    repRange: "6–12 reps",
    totalSessionTime: "20–30 min",
    progressionMethod: "Add 2 reps every 2 weeks. When 12 reps are achievable, reduce rest by 10 sec.",
    coachNote: "This is game-speed conditioning. The ability to repeat high efforts with short rest is what separates athletes.",
    weeklyFrequency: "1–2×/week",
  },

  repeat_sprint_ability: {
    type: "repeat_sprint_ability",
    label: "Repeat Sprint Ability (RSA)",
    description: "Short sprint clusters with minimal intra-set rest — develops game-specific conditioning",
    primaryAdaptation: "Repeat sprint ability, phosphocreatine resynthesis, sprint capacity under fatigue",
    intensityRange: "100% sprint effort every rep",
    workDurationRange: "10–30m sprints (3–6 sec effort)",
    restRatio: "1:4 to 1:6 intra-set / 2–3 min between sets",
    repRange: "4–6 sprints per set × 2–4 sets",
    totalSessionTime: "20–30 min",
    progressionMethod: "Add 1 rep per set every 2 weeks. When 6 reps/set is achieved, add a set.",
    coachNote: "The quality of each sprint matters more than completing every rep. If speed drops >10%, end the set.",
    weeklyFrequency: "1–2×/week",
  },
};

// ─── Goal → Energy System Mapping ────────────────────────────────────────────

export interface ConditioningProfile {
  primarySystems: EnergySystemType[];
  secondarySystems: EnergySystemType[];
  emphasis: string;
  weeklyConditioningDays: number;
}

export function mapGoalToEnergySystems(
  goal: string,
  sport: string | null,
  daysPerWeek: number,
  context?: string,
): ConditioningProfile {
  const g = goal.toLowerCase();
  const s = sport?.toLowerCase() ?? "";
  const c = context?.toLowerCase() ?? "";

  // Sport-specific overrides take precedence
  if (s.includes("soccer") || s.includes("football") && !s.includes("american")) {
    return {
      primarySystems: ["repeat_sprint_ability", "aerobic_base"],
      secondarySystems: ["anaerobic_capacity", "aerobic_power"],
      emphasis: "Repeat sprint ability and aerobic base — soccer demands 10–12km per match with 40–60 short sprints",
      weeklyConditioningDays: Math.min(3, Math.floor(daysPerWeek * 0.6)),
    };
  }

  if (s.includes("american football") || s.includes("football") || c.includes("football")) {
    return {
      primarySystems: ["anaerobic_capacity", "repeat_sprint_ability"],
      secondarySystems: ["aerobic_base"],
      emphasis: "Anaerobic power and repeat sprint ability — American football is short-burst, high-intensity work with 30–40 sec recovery",
      weeklyConditioningDays: Math.min(2, Math.floor(daysPerWeek * 0.4)),
    };
  }

  if (s.includes("basketball")) {
    return {
      primarySystems: ["repeat_sprint_ability", "anaerobic_capacity"],
      secondarySystems: ["aerobic_base", "vo2max"],
      emphasis: "Court speed and repeat sprint capacity — basketball demands multi-directional bursts every 15–30 sec",
      weeklyConditioningDays: Math.min(2, Math.floor(daysPerWeek * 0.5)),
    };
  }

  if (s.includes("baseball") || s.includes("softball")) {
    return {
      primarySystems: ["anaerobic_capacity", "repeat_sprint_ability"],
      secondarySystems: ["aerobic_base"],
      emphasis: "Explosive burst capacity and recovery — baseball is alactic with short, maximal efforts and full recovery",
      weeklyConditioningDays: Math.min(2, Math.floor(daysPerWeek * 0.4)),
    };
  }

  if (s.includes("track") || s.includes("sprint") || s.includes("sprinter")) {
    return {
      primarySystems: ["anaerobic_capacity", "vo2max"],
      secondarySystems: ["repeat_sprint_ability", "aerobic_base"],
      emphasis: "Maximum speed capacity and glycolytic power — sprint events require absolute top-end speed and speed endurance",
      weeklyConditioningDays: Math.min(3, Math.floor(daysPerWeek * 0.5)),
    };
  }

  if (s.includes("rugby") || s.includes("lacrosse") || s.includes("hockey")) {
    return {
      primarySystems: ["repeat_sprint_ability", "aerobic_base", "anaerobic_capacity"],
      secondarySystems: ["lactate_threshold"],
      emphasis: "Multi-system conditioning — field sports with continuous play require all energy systems",
      weeklyConditioningDays: Math.min(3, Math.floor(daysPerWeek * 0.5)),
    };
  }

  if (s.includes("combat") || s.includes("mma") || s.includes("boxing") || s.includes("wrestling")) {
    return {
      primarySystems: ["anaerobic_capacity", "vo2max"],
      secondarySystems: ["lactate_threshold", "aerobic_base"],
      emphasis: "Anaerobic power endurance — combat sports demand sustained high-intensity effort across rounds",
      weeklyConditioningDays: Math.min(3, Math.floor(daysPerWeek * 0.5)),
    };
  }

  // Goal-based mapping (no sport or general sport)
  if (/endurance|cardio|conditioning|aerobic|engine|work.?capacity/.test(g)) {
    if (/game|sport|athletic/.test(g) || /game|sport|athletic/.test(c)) {
      return {
        primarySystems: ["repeat_sprint_ability", "anaerobic_capacity"],
        secondarySystems: ["aerobic_base", "lactate_threshold"],
        emphasis: "Athletic conditioning — general game-speed capacity across energy systems",
        weeklyConditioningDays: Math.min(3, Math.floor(daysPerWeek * 0.6)),
      };
    }
    if (/cardio|aerobic|base|foundation|stamina/.test(g) || /cardio|aerobic|base/.test(c)) {
      return {
        primarySystems: ["aerobic_base", "aerobic_power"],
        secondarySystems: ["lactate_threshold"],
        emphasis: "Aerobic development — build the cardiovascular foundation through structured aerobic work",
        weeklyConditioningDays: Math.min(3, Math.floor(daysPerWeek * 0.6)),
      };
    }
    return {
      primarySystems: ["aerobic_base", "lactate_threshold"],
      secondarySystems: ["vo2max", "aerobic_power"],
      emphasis: "General conditioning — aerobic base first, then threshold development",
      weeklyConditioningDays: Math.min(3, Math.floor(daysPerWeek * 0.5)),
    };
  }

  if (/fat.?loss|weight.?loss|cut|lean|body.?comp/.test(g)) {
    return {
      primarySystems: ["aerobic_base", "aerobic_power"],
      secondarySystems: ["anaerobic_capacity"],
      emphasis: "Metabolic conditioning — steady aerobic work maximizes caloric output while preserving muscle",
      weeklyConditioningDays: Math.min(2, Math.floor(daysPerWeek * 0.4)),
    };
  }

  if (/athletic|performance|sport/.test(g)) {
    return {
      primarySystems: ["repeat_sprint_ability", "anaerobic_capacity"],
      secondarySystems: ["aerobic_base", "vo2max"],
      emphasis: "Athletic performance conditioning — power endurance and game-speed capacity",
      weeklyConditioningDays: Math.min(2, Math.floor(daysPerWeek * 0.4)),
    };
  }

  // Default: general fitness
  return {
    primarySystems: ["aerobic_base"],
    secondarySystems: ["aerobic_power"],
    emphasis: "Foundational conditioning — general aerobic development and work capacity",
    weeklyConditioningDays: Math.min(1, Math.floor(daysPerWeek * 0.3)),
  };
}

// ─── Modality Selection ───────────────────────────────────────────────────────

export interface ModalityRecommendation {
  primary: ConditioningModality;
  alternatives: ConditioningModality[];
  reason: string;
}

export function selectConditioningModality(
  sport: string | null,
  equipment: string,
  systemType: EnergySystemType,
  context?: string,
): ModalityRecommendation {
  const s = sport?.toLowerCase() ?? "";
  const e = equipment.toLowerCase();
  const isFieldSport = s.includes("soccer") || s.includes("football") || s.includes("rugby") || s.includes("lacrosse");
  const isCourtSport = s.includes("basketball") || s.includes("volleyball");
  const hasLimitedEquipment = e.includes("dumbbell") || e.includes("bodyweight") || e.includes("band") || e.includes("home");
  const hasFullGym = e.includes("full") || e.includes("commercial") || e.includes("barbell");
  const hasSled = hasFullGym;
  const hasRower = hasFullGym;

  // RSA and sprint work: field sports use sprints/shuttles
  if (systemType === "repeat_sprint_ability") {
    if (isFieldSport || isCourtSport) {
      return {
        primary: "shuttle_run",
        alternatives: ["sprint", "bike"],
        reason: `${s || "sport"} athletes develop RSA most specifically through directional sprints and shuttle patterns that mirror game movement`,
      };
    }
    return {
      primary: "sprint",
      alternatives: ["shuttle_run", "bike"],
      reason: "Linear sprint work develops the acceleration mechanics and phosphocreatine system for repeat sprint capacity",
    };
  }

  // Anaerobic capacity: short all-out efforts
  if (systemType === "anaerobic_capacity") {
    if (hasLimitedEquipment) {
      return {
        primary: "jump_rope",
        alternatives: ["bodyweight_circuit", "sprint"],
        reason: "High-intensity jump rope intervals develop anaerobic capacity with minimal equipment",
      };
    }
    if (hasSled) {
      return {
        primary: "sled",
        alternatives: ["bike", "sprint"],
        reason: "Sled push maximizes lower-body power output without eccentric loading — ideal for anaerobic capacity blocks",
      };
    }
    return {
      primary: "bike",
      alternatives: ["sprint", "jump_rope"],
      reason: "Assault bike intervals allow maximum power output across all limbs — extremely effective for anaerobic capacity",
    };
  }

  // VO2max: high intensity, requires good modality for max output
  if (systemType === "vo2max") {
    if (hasLimitedEquipment) {
      return {
        primary: "running",
        alternatives: ["jump_rope", "bodyweight_circuit"],
        reason: "Running at high intensity is the most accessible VO2max stimulus — requires no equipment",
      };
    }
    return {
      primary: hasRower ? "rower" : "bike",
      alternatives: ["running", "sprint"],
      reason: hasRower
        ? "Rowing is a full-body VO2max stimulus — engages legs, back, and arms simultaneously for maximum oxygen demand"
        : "Assault bike demands full upper and lower body engagement — ideal for VO2max development",
    };
  }

  // Lactate threshold: sustained moderate-high effort
  if (systemType === "lactate_threshold") {
    if (isFieldSport) {
      return {
        primary: "running",
        alternatives: ["shuttle_run", "rower"],
        reason: `Threshold runs directly transfer to ${s || "field sport"} match demands — same movement pattern, same physiological adaptation`,
      };
    }
    if (hasLimitedEquipment) {
      return {
        primary: "running",
        alternatives: ["jump_rope"],
        reason: "Threshold running requires no equipment and directly builds the aerobic capacity that supports all high-intensity work",
      };
    }
    return {
      primary: hasRower ? "rower" : "bike",
      alternatives: ["running", "shuttle_run"],
      reason: "Sustained threshold work on the rower or bike builds lactate threshold without the impact stress of running",
    };
  }

  // Aerobic base and tempo: lower intensity, longer duration
  if (systemType === "aerobic_base" || systemType === "aerobic_power") {
    if (isFieldSport) {
      return {
        primary: "running",
        alternatives: ["bike", "rower"],
        reason: `Running builds sport-specific aerobic base that directly transfers to ${s || "field sport"} demands`,
      };
    }
    if (hasLimitedEquipment) {
      return {
        primary: "running",
        alternatives: ["jump_rope", "bodyweight_circuit"],
        reason: "Running is the most accessible aerobic base modality — progressive distance and pace over weeks",
      };
    }
    return {
      primary: "running",
      alternatives: [hasRower ? "rower" : "bike", hasRower ? "bike" : "jump_rope"],
      reason: "Running provides direct cardiovascular adaptation. Rower and bike are excellent alternatives for low-impact sessions.",
    };
  }

  return {
    primary: "running",
    alternatives: ["bike", "rower"],
    reason: "Running is the most versatile conditioning modality across goals and contexts",
  };
}

// ─── Conditioning Session Templates ──────────────────────────────────────────

export interface ConditioningInterval {
  label: string;
  effort: string;
  duration: string;
  rest: string;
  sets?: number;
  repsPerSet?: number;
  notes: string;
}

export interface ConditioningSessionTemplate {
  energySystem: EnergySystemType;
  modality: ConditioningModality;
  sessionName: string;
  totalDuration: string;
  structure: ConditioningInterval[];
  coachingCue: string;
  weeklyRole: string;
  progressionWeek1: string;
  progressionWeek3: string;
  progressionWeek5: string;
}

export function buildConditioningSessionTemplate(
  system: EnergySystemType,
  modality: ConditioningModality,
  sport: string | null,
  week: number = 1,
): ConditioningSessionTemplate {
  const sportLabel = sport ? `${sport} ` : "";

  switch (system) {
    case "aerobic_base": {
      if (modality === "running") {
        const totalMin = week <= 2 ? 20 : week <= 4 ? 25 : week <= 6 ? 30 : 35;
        return {
          energySystem: "aerobic_base",
          modality,
          sessionName: `${sportLabel}Aerobic Base — Steady Run`,
          totalDuration: `${totalMin + 10} min total`,
          structure: [
            { label: "Warm-Up", effort: "Easy jog", duration: "5 min", rest: "none", notes: "Conversational pace — you should be able to speak full sentences" },
            { label: "Steady Effort", effort: "60–70% max HR", duration: `${totalMin} min`, rest: "none", notes: "Controlled, consistent pace throughout. If HR rises above 70%, slow down — the adaptation is in this zone." },
            { label: "Cool-Down", effort: "Walk", duration: "5 min", rest: "none", notes: "Gradual transition — heart rate should be under 120 bpm before stopping" },
          ],
          coachingCue: "This is not a race. The aerobic base lives at a pace that feels almost too easy — trust it.",
          weeklyRole: "1–2× per week, preferably on days without heavy lower body strength work",
          progressionWeek1: `${totalMin} min steady at 60–70% HR`,
          progressionWeek3: `${Math.min(totalMin + 5, 35)} min at 65–70% HR`,
          progressionWeek5: `${Math.min(totalMin + 10, 40)} min at 70% HR or begin adding 1 aerobic power session`,
        };
      }
      if (modality === "rower" || modality === "bike") {
        const label = modality === "rower" ? "Row" : "Bike";
        const totalMin = week <= 2 ? 20 : week <= 4 ? 25 : 30;
        return {
          energySystem: "aerobic_base",
          modality,
          sessionName: `${sportLabel}Aerobic Base — Steady ${label}`,
          totalDuration: `${totalMin + 10} min total`,
          structure: [
            { label: "Warm-Up", effort: "Easy pace", duration: "3 min", rest: "none", notes: "Settle into rhythm, no power output targets yet" },
            { label: "Steady State", effort: "60–70% max HR", duration: `${totalMin} min`, rest: "none", notes: `Maintain consistent pace on the ${label.toLowerCase()}. Heart rate is your guide — stay in the 60–70% zone.` },
            { label: "Cool-Down", effort: "Easy paddle", duration: "3 min", rest: "none", notes: "Reduce pace gradually" },
          ],
          coachingCue: `${label}ing at aerobic base intensity is lower impact than running — ideal for recovery days or when legs are taxed from strength work.`,
          weeklyRole: "1–2× per week",
          progressionWeek1: `${totalMin} min at 60–70% HR`,
          progressionWeek3: `${Math.min(totalMin + 5, 35)} min`,
          progressionWeek5: `${Math.min(totalMin + 10, 40)} min or add 1 aerobic power session`,
        };
      }
      // Default bodyweight/jump rope
      return {
        energySystem: "aerobic_base",
        modality,
        sessionName: `${sportLabel}Aerobic Base — Low-Impact Circuit`,
        totalDuration: "25–35 min",
        structure: [
          { label: "Warm-Up", effort: "March in place + arm circles", duration: "3 min", rest: "none", notes: "Gradual elevation of heart rate" },
          {
            label: "Continuous Circuit",
            effort: "60–70% max HR",
            duration: "20–30 min",
            rest: "none",
            notes: "Alternate: 2 min jog / 1 min mountain climbers / 2 min jump rope / 1 min step touch. Continuous — no full stops.",
          },
          { label: "Cool-Down", effort: "Walk", duration: "3 min", rest: "none", notes: "Heart rate below 120 before stopping" },
        ],
        coachingCue: "Keep moving. The aerobic base is built through continuous, low-intensity effort — not rest periods.",
        weeklyRole: "1–2× per week",
        progressionWeek1: "20 min circuit",
        progressionWeek3: "25 min circuit",
        progressionWeek5: "30 min or transition to running-based aerobic base",
      };
    }

    case "aerobic_power": {
      const reps = week <= 2 ? 2 : week <= 4 ? 3 : 4;
      const workMin = week <= 2 ? 8 : week <= 4 ? 10 : 12;
      const restMin = Math.ceil(workMin / 2);
      if (modality === "running") {
        return {
          energySystem: "aerobic_power",
          modality,
          sessionName: `${sportLabel}Tempo Run Intervals`,
          totalDuration: `${reps * (workMin + restMin) + 10} min total`,
          structure: [
            { label: "Warm-Up", effort: "Easy jog", duration: "5 min", rest: "none", notes: "Build into the effort gradually" },
            { label: "Tempo Interval", effort: "75–85% max HR", duration: `${workMin} min`, rest: `${restMin} min easy jog`, sets: reps, notes: "Comfortably hard — you can say 2–3 words at a time but not a sentence. Hold this pace across all intervals." },
            { label: "Cool-Down", effort: "Walk/jog", duration: "5 min", rest: "none", notes: "Heart rate recovery check" },
          ],
          coachingCue: "The last interval should feel like the first. If pacing falls apart, the rest period was too short or the effort too high.",
          weeklyRole: "1–2× per week, not on the day before or after speed work",
          progressionWeek1: `${reps}× ${workMin} min at 75–85% HR with ${restMin} min rest`,
          progressionWeek3: `${reps + 1}× ${workMin} min with ${restMin} min rest`,
          progressionWeek5: `${reps + 2}× ${workMin} min or increase to ${workMin + 2} min per interval`,
        };
      }
      return {
        energySystem: "aerobic_power",
        modality,
        sessionName: `${sportLabel}Aerobic Power Intervals — ${modality === "rower" ? "Row" : "Bike"}`,
        totalDuration: `${reps * (workMin + restMin) + 10} min`,
        structure: [
          { label: "Warm-Up", effort: "Easy pace", duration: "3 min", rest: "none", notes: "Settle into the machine" },
          { label: "Power Interval", effort: "75–85% max effort", duration: `${workMin} min`, rest: `${restMin} min easy`, sets: reps, notes: "Push above aerobic base — strong, consistent stroke. Don't sprint, don't coast." },
          { label: "Cool-Down", effort: "Easy", duration: "3 min", rest: "none", notes: "Gradual reduction in output" },
        ],
        coachingCue: "Aerobic power intervals bridge the gap between base work and threshold training. Consistency across reps is the goal.",
        weeklyRole: "1–2× per week",
        progressionWeek1: `${reps}× ${workMin} min`,
        progressionWeek3: `${reps + 1}× ${workMin} min`,
        progressionWeek5: `${reps + 2}× ${workMin} min or add threshold session`,
      };
    }

    case "lactate_threshold": {
      const reps = week <= 2 ? 3 : week <= 4 ? 4 : week <= 6 ? 5 : 6;
      const workMin = week <= 2 ? 4 : week <= 4 ? 5 : 6;
      return {
        energySystem: "lactate_threshold",
        modality,
        sessionName: `${sportLabel}Lactate Threshold Intervals`,
        totalDuration: `${reps * (workMin * 2) + 10} min total`,
        structure: [
          { label: "Warm-Up", effort: "Easy pace", duration: "5 min", rest: "none", notes: "Gradual build — joints warm, heart rate rising" },
          {
            label: "Threshold Interval",
            effort: "85–92% max HR (8–9/10 RPE)",
            duration: `${workMin} min`,
            rest: `${workMin} min easy`,
            sets: reps,
            notes: `${modality === "running" ? "Controlled hard run — faster than tempo, not a sprint." : modality === "rower" ? "Strong, powerful strokes — consistent split time target." : "High power output — controlled, not frantic."}  Pace must hold from rep 1 to rep ${reps}.`,
          },
          { label: "Cool-Down", effort: "Easy", duration: "5 min", rest: "none", notes: "HR recovery — walk or very easy movement" },
        ],
        coachingCue: "Start the first interval at 90% of what you think you can hold. The rep you're proud of is the last one completed at the right pace.",
        weeklyRole: "1–2× per week — this is high-quality work, not filler",
        progressionWeek1: `${reps}× ${workMin} min @ 85–92% HR with ${workMin} min rest`,
        progressionWeek3: `${reps + 1}× ${workMin} min with ${workMin} min rest`,
        progressionWeek5: `${reps + 2}× ${workMin} min or reduce rest to ${Math.max(workMin - 1, 3)} min`,
      };
    }

    case "vo2max": {
      const reps = week <= 2 ? 4 : week <= 4 ? 5 : week <= 6 ? 6 : 7;
      const workMin = 2;
      return {
        energySystem: "vo2max",
        modality,
        sessionName: `${sportLabel}VO2max Intervals`,
        totalDuration: `${reps * (workMin * 2) + 10} min total`,
        structure: [
          { label: "Warm-Up", effort: "Easy pace", duration: "5 min", rest: "none", notes: "This session demands full output — warm up thoroughly" },
          {
            label: "VO2max Interval",
            effort: "90–100% max HR (9–10/10)",
            duration: `${workMin} min`,
            rest: `${workMin} min full recovery`,
            sets: reps,
            notes: `${modality === "running" ? "Near-sprint pace — you should not be able to speak." : modality === "rower" ? "Maximum stroke rate and power." : "Max cadence, full effort."} Every rep is a max effort — reset fully before the next one.`,
          },
          { label: "Cool-Down", effort: "Walk/easy", duration: "5 min", rest: "none", notes: "Extended recovery — this session taxes the system significantly" },
        ],
        coachingCue: "VO2max intervals demand honest effort. The rest period exists for a reason — use all of it.",
        weeklyRole: "1× per week maximum — high CNS cost, plan 48+ hours before next demanding session",
        progressionWeek1: `${reps}× ${workMin} min at 90–100% with ${workMin} min rest`,
        progressionWeek3: `${reps + 1}× ${workMin} min`,
        progressionWeek5: `${reps + 2}× ${workMin} min or reduce rest to 90 sec when ${reps + 2} reps are solid`,
      };
    }

    case "anaerobic_capacity": {
      const reps = week <= 2 ? 6 : week <= 4 ? 8 : week <= 6 ? 10 : 12;
      const workSec = 20;
      const restSec = workSec * 4;
      if (modality === "sprint" || modality === "shuttle_run") {
        return {
          energySystem: "anaerobic_capacity",
          modality,
          sessionName: `${sportLabel}Anaerobic Capacity — ${modality === "shuttle_run" ? "Shuttle Sprints" : "Flat Sprints"}`,
          totalDuration: `${Math.round((reps * (workSec + restSec)) / 60) + 10} min total`,
          structure: [
            { label: "Warm-Up", effort: "Jog + dynamic drills", duration: "8 min", rest: "none", notes: "A-skips, high knees, 2×20m build-up strides before max efforts" },
            {
              label: `${modality === "shuttle_run" ? "Shuttle" : "Sprint"}`,
              effort: "100% effort — all out",
              duration: `${modality === "shuttle_run" ? "5-10-5 yard shuttle" : "20m sprint (~3 sec)"}`,
              rest: `${restSec} sec walk back`,
              sets: reps,
              notes: "Every rep is a max effort. Speed drops more than 10% = set is over. Quality over completion.",
            },
            { label: "Cool-Down", effort: "Walk", duration: "5 min", rest: "none", notes: "Heart rate recovery" },
          ],
          coachingCue: "These are not jog efforts. Every rep must be a genuine all-out attempt — the recovery ratio is designed for full speed output.",
          weeklyRole: "1–2× per week, never the day before speed work or heavy lower body",
          progressionWeek1: `${reps} reps × 20m sprint with ${restSec}s rest`,
          progressionWeek3: `${reps + 2} reps with ${restSec}s rest`,
          progressionWeek5: `${reps + 4} reps or reduce rest to ${restSec - 20}s`,
        };
      }
      if (modality === "sled") {
        return {
          energySystem: "anaerobic_capacity",
          modality,
          sessionName: `${sportLabel}Anaerobic Capacity — Sled Pushes`,
          totalDuration: `${Math.round((reps * (workSec + restSec)) / 60) + 10} min total`,
          structure: [
            { label: "Warm-Up", effort: "Light sled drag + hip activation", duration: "5 min", rest: "none", notes: "2–3 light-load sled pushes to prime the hip drive pattern" },
            {
              label: "Max Effort Sled Push",
              effort: "100% — fastest possible turnover",
              duration: "20m push",
              rest: `${restSec} sec`,
              sets: reps,
              notes: "Moderate load (enough to resist but allow fast turnover). Drive from low angle — forward lean, powerful strides.",
            },
            { label: "Cool-Down", effort: "Walk", duration: "5 min", rest: "none", notes: "Reduce heart rate before leaving the facility" },
          ],
          coachingCue: "Sled pushes develop anaerobic capacity without the deceleration demands of sprinting — excellent for athletes with lower-body injury history.",
          weeklyRole: "1–2× per week",
          progressionWeek1: `${reps} sled pushes × 20m`,
          progressionWeek3: `${reps + 2} pushes`,
          progressionWeek5: `${reps + 4} pushes or increase load by 10%`,
        };
      }
      // Bike default
      return {
        energySystem: "anaerobic_capacity",
        modality,
        sessionName: `${sportLabel}Anaerobic Capacity — Bike Sprints`,
        totalDuration: `${Math.round((reps * (workSec + restSec)) / 60) + 10} min`,
        structure: [
          { label: "Warm-Up", effort: "Easy bike", duration: "5 min", rest: "none", notes: "Build into it — increase cadence over the last minute" },
          {
            label: "All-Out Sprint",
            effort: "Max RPM — everything",
            duration: `${workSec} sec`,
            rest: `${restSec} sec easy pedaling`,
            sets: reps,
            notes: "Maximum cadence and resistance. If you can talk at any point during the effort, you're not working hard enough.",
          },
          { label: "Cool-Down", effort: "Easy pedal", duration: "5 min", rest: "none", notes: "Gradual wind-down" },
        ],
        coachingCue: "Assault bike anaerobic intervals are among the hardest conditioning methods available — and among the most effective for building glycolytic capacity.",
        weeklyRole: "1–2× per week",
        progressionWeek1: `${reps}× ${workSec}s max effort with ${restSec}s rest`,
        progressionWeek3: `${reps + 2}× ${workSec}s with ${restSec}s rest`,
        progressionWeek5: `${reps + 4}× or reduce rest to ${restSec - 20}s`,
      };
    }

    case "repeat_sprint_ability": {
      const setsPerWeek = week <= 2 ? 2 : week <= 4 ? 3 : 4;
      const repsPerSet = week <= 2 ? 4 : week <= 4 ? 5 : 6;
      const sprintDist = sport?.toLowerCase().includes("basketball") ? "15m" : "20m";
      const intraRest = "20 sec";
      const interSetRest = "2–3 min";

      return {
        energySystem: "repeat_sprint_ability",
        modality: modality === "shuttle_run" ? "shuttle_run" : "sprint",
        sessionName: `${sportLabel}Repeat Sprint Ability (RSA)`,
        totalDuration: `${setsPerWeek * 3 + 15} min total`,
        structure: [
          { label: "Warm-Up", effort: "Easy jog + dynamic drills", duration: "8 min", rest: "none", notes: "A-skips × 2, high knees × 2, 2×20m build-up strides" },
          {
            label: "Sprint Set",
            effort: "100% — flat-out",
            duration: `${sprintDist} sprint (~3–4 sec)`,
            rest: `${intraRest} between sprints / ${interSetRest} between sets`,
            sets: setsPerWeek,
            repsPerSet,
            notes: `${repsPerSet} sprints × ${setsPerWeek} sets. ${intraRest} rest between sprints, ${interSetRest} between sets. Quality first — stop a rep early if mechanics break down.`,
          },
          { label: "Cool-Down", effort: "Walk", duration: "5 min", rest: "none", notes: "Heart rate below 120 before leaving" },
        ],
        coachingCue: `RSA training is what separates athletes in the final 20 minutes of a game. The short rest is the training stimulus — don't extend it.`,
        weeklyRole: "1–2× per week — the most sport-specific conditioning method for field and court athletes",
        progressionWeek1: `${setsPerWeek} sets × ${repsPerSet} sprints with ${intraRest} intra-set rest`,
        progressionWeek3: `${setsPerWeek} sets × ${repsPerSet + 1} sprints`,
        progressionWeek5: `${setsPerWeek + 1} sets × ${repsPerSet + 1} sprints or reduce intra-set rest to 15 sec`,
      };
    }

    default:
      return buildConditioningSessionTemplate("aerobic_base", modality, sport, week);
  }
}

// ─── Weekly Conditioning Structure Builder ────────────────────────────────────

export interface ConditioningWeekPlan {
  dayAssignments: ConditioningDayAssignment[];
  weeklyNarrative: string;
  progressionNarrative: string;
}

export interface ConditioningDayAssignment {
  dayLabel: string;
  energySystem: EnergySystemType;
  modality: ConditioningModality;
  sessionTemplate: ConditioningSessionTemplate;
}

export function buildWeeklyConditioningPlan(
  profile: ConditioningProfile,
  sport: string | null,
  equipment: string,
  week: number = 1,
): ConditioningWeekPlan {
  const { primarySystems, secondarySystems, weeklyConditioningDays } = profile;
  const allSystems = [...primarySystems, ...secondarySystems];
  const assignments: ConditioningDayAssignment[] = [];

  // Assign systems to days — primary first, then secondary
  for (let i = 0; i < weeklyConditioningDays && i < allSystems.length; i++) {
    const system = allSystems[i];
    const modRec = selectConditioningModality(sport, equipment, system);
    const template = buildConditioningSessionTemplate(system, modRec.primary, sport, week);
    const dayLabels = ["Day A", "Day B", "Day C", "Day D"];
    assignments.push({
      dayLabel: dayLabels[i] ?? `Day ${i + 1}`,
      energySystem: system,
      modality: modRec.primary,
      sessionTemplate: template,
    });
  }

  // Build weekly narrative
  const systemNames = primarySystems.map(s => ENERGY_SYSTEM_PROFILES[s].label).join(" + ");
  const weeklyNarrative = [
    `Weekly conditioning targets: ${systemNames}.`,
    assignments.map((a, i) => `Session ${i + 1}: ${ENERGY_SYSTEM_PROFILES[a.energySystem].label} via ${a.modality.replace("_", " ")}.`).join(" "),
    `Energy systems vary across the week — this is intentional. Different sessions target different adaptation zones.`,
  ].join(" ");

  const progressionNarrative = [
    `Week 1 baseline: ${assignments[0]?.sessionTemplate.progressionWeek1 ?? "establish baseline"}.`,
    `Week 3: ${assignments[0]?.sessionTemplate.progressionWeek3 ?? "add volume"}.`,
    `Week 5: ${assignments[0]?.sessionTemplate.progressionWeek5 ?? "increase intensity"}.`,
  ].join(" ");

  return { dayAssignments: assignments, weeklyNarrative, progressionNarrative };
}

// ─── AI Prompt Context Builder ────────────────────────────────────────────────

/**
 * Builds the conditioning intelligence context injected into the AI system prompt.
 * Called when the goal is conditioning, endurance, fat loss, or athletic performance.
 */
export function buildConditioningContext(
  goal: string,
  sport: string | null,
  equipment: string,
  daysPerWeek: number,
  context?: string,
): string {
  const profile = mapGoalToEnergySystems(goal, sport, daysPerWeek, context);
  const primarySystem = profile.primarySystems[0];
  const secondarySystem = profile.secondarySystems[0];
  const primaryProfile = ENERGY_SYSTEM_PROFILES[primarySystem];
  const secondaryProfile = secondarySystem ? ENERGY_SYSTEM_PROFILES[secondarySystem] : null;
  const primaryModRec = selectConditioningModality(sport, equipment, primarySystem);
  const secondaryModRec = secondarySystem ? selectConditioningModality(sport, equipment, secondarySystem) : null;

  const primaryTemplate = buildConditioningSessionTemplate(primarySystem, primaryModRec.primary, sport, 1);
  const secondaryTemplate = secondarySystem
    ? buildConditioningSessionTemplate(secondarySystem, secondaryModRec!.primary, sport, 1)
    : null;

  const systemList = profile.primarySystems.concat(profile.secondarySystems)
    .map(s => `- **${ENERGY_SYSTEM_PROFILES[s].label}**: ${ENERGY_SYSTEM_PROFILES[s].description}`)
    .join("\n");

  const primaryStructureLines = primaryTemplate.structure.map(s => {
    const setsStr = s.sets ? ` × ${s.sets} sets` : "";
    const repsStr = s.repsPerSet ? ` (${s.repsPerSet} reps/set)` : "";
    return `  • ${s.label}: ${s.duration}${setsStr}${repsStr} @ ${s.effort} | Rest: ${s.rest}\n    Notes: ${s.notes}`;
  }).join("\n");

  const secondaryStructureLines = secondaryTemplate
    ? secondaryTemplate.structure.map(s => {
        const setsStr = s.sets ? ` × ${s.sets} sets` : "";
        return `  • ${s.label}: ${s.duration}${setsStr} @ ${s.effort} | Rest: ${s.rest}\n    Notes: ${s.notes}`;
      }).join("\n")
    : null;

  return `
## CONDITIONING / ENERGY SYSTEM INTELLIGENCE — MANDATORY

This user's request requires REAL conditioning programming — not circuits, not short-rest lifting, not vague "cardio finishers."

### CONDITIONING PROFILE FOR THIS USER
Goal: ${goal}
Sport: ${sport ?? "None"}
Equipment: ${equipment}
Emphasis: ${profile.emphasis}
Weekly conditioning days: ${profile.weeklyConditioningDays} (within the ${daysPerWeek}-day program)

### ENERGY SYSTEMS TO TARGET
${systemList}

### PRIMARY CONDITIONING SESSION: ${primaryTemplate.sessionName}
Modality: ${primaryModRec.primary.replace(/_/g, " ")} (rationale: ${primaryModRec.reason})
Duration: ${primaryTemplate.totalDuration}
Weekly role: ${primaryTemplate.weeklyRole}
Coaching cue: ${primaryTemplate.coachingCue}

Structure:
${primaryStructureLines}

Progression:
- Week 1: ${primaryTemplate.progressionWeek1}
- Week 3: ${primaryTemplate.progressionWeek3}
- Week 5: ${primaryTemplate.progressionWeek5}
${secondaryTemplate && secondaryProfile ? `
### SECONDARY CONDITIONING SESSION: ${secondaryTemplate.sessionName}
Modality: ${secondaryModRec!.primary.replace(/_/g, " ")}
Duration: ${secondaryTemplate.totalDuration}
Weekly role: ${secondaryTemplate.weeklyRole}

Structure:
${secondaryStructureLines}

Progression:
- Week 1: ${secondaryTemplate.progressionWeek1}
- Week 3: ${secondaryTemplate.progressionWeek3}
- Week 5: ${secondaryTemplate.progressionWeek5}
` : ""}

### MANDATORY CONDITIONING PROGRAMMING RULES
1. **Conditioning ≠ circuits** — A "conditioning" session must include real intervals, real work:rest prescriptions, and a named energy system target.
2. **Conditioning ≠ short-rest lifting** — Reducing rest on strength work is not conditioning programming.
3. **Every conditioning session must specify:**
   - The energy system it targets (e.g., "Repeat Sprint Ability")
   - The work:rest ratio (e.g., "20m sprint / 80 sec walk back")
   - The modality (e.g., "shuttle run," "bike," "rower," "tempo run")
   - The structure (sets, reps or duration, rest)
   - The progression (what changes next week or in 2 weeks)
4. **Session placement rules:**
   - Aerobic base and tempo work → stand-alone sessions or after strength work
   - VO2max and anaerobic capacity → stand-alone sessions, never after heavy strength
   - RSA sessions → stand-alone; 48h separation from heavy lower body strength
   - Never stack high-CNS conditioning with high-CNS strength on same day
5. **Conditioning language must be specific:**
   - Instead of "added conditioning" → use "Added ${primarySystem.replace(/_/g, " ")} work: ${primaryTemplate.structure.find(s => s.sets)?.sets ?? 4}×${primaryTemplate.structure.find(s => s.sets)?.duration ?? "20 sec"} at full effort with ${primaryTemplate.structure.find(s => s.sets)?.rest ?? "adequate rest"} to develop ${primaryProfile.primaryAdaptation.split(",")[0]}"
   - State the energy system, the structure, and the purpose every time
6. **Progressions must be explicit:** State Week 1, Week 3, and Week 5 targets when building conditioning programs.

### CONDITIONING ANTI-PATTERNS — NEVER DO THESE
- "Circuit training" as the conditioning prescription (unless the user explicitly asks for circuits)
- "Reduce rest periods" as a conditioning suggestion — this is not conditioning
- Generic "cardio finishers" without specifying modality, intensity, duration, or rest
- "3 sets of 15 burpees" as a conditioning session — this is not structured conditioning
- Treating all conditioning as the same (aerobic base ≠ repeat sprints ≠ VO2max intervals)
`.trim();
}

// ─── Detection: Is this request conditioning-dominant? ────────────────────────

export function isConditioningRequest(goal: string, request?: string): boolean {
  const g = (goal + " " + (request ?? "")).toLowerCase();
  return (
    /endurance|conditioning|cardio|aerobic|engine|work.?capacity|stamina|repeat.?sprint|vo2|lactate|interval|tempo.?run|sprint.?work/.test(g)
  );
}

export function isConditioningGoal(rawGoal: string): boolean {
  const g = rawGoal.toLowerCase();
  return /endurance|conditioning|cardio|aerobic|stamina|work.?capacity|engine/.test(g);
}
