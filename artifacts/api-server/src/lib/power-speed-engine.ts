/**
 * TrainChat Power & Speed Engine
 *
 * Phase 2 Intelligence Upgrade — Real power and speed programming.
 *
 * Separates:
 * - Strength (compound loading, progressive overload)
 * - Power (force-velocity, explosive intent, contrast/complex/PAP methods)
 * - Speed (sprint mechanics, acceleration, max velocity, COD)
 *
 * Architecture: Decoupled from AI/OpenAI. Generates structured context
 * injected into system prompts. Works alongside conditioning-engine.ts.
 */

// ─── Force-Velocity Classification ───────────────────────────────────────────

export type ForceVelocityType =
  | "max_strength"       // Heavy loading, slow velocity, maximal force (squat, deadlift, heavy press)
  | "strength_speed"     // Heavy load, intent to move fast (heavy sled, Olympic pull variations)
  | "speed_strength"     // Moderate load, fast velocity (jumps, med ball throws, light Olympic lifts)
  | "max_velocity";      // Body mass at maximum speed (sprinting, reactive plyos, plyometric drills)

export type SprintType =
  | "acceleration"       // 0–20m: force application angle, first-step mechanics
  | "max_velocity"       // 20–60m+: upright mechanics, stride frequency/length
  | "change_of_direction" // COD: deceleration, plant-and-drive, reactive agility
  | "reactive_agility";  // Reactive/agility: stimulus-response, open-loop decision making

export type PowerMethod =
  | "contrast_training"  // Heavy lift → explosive action (same pattern) with 3–5 min PAP window
  | "complex_training"   // Biomechanically similar heavy lift paired with plyometric
  | "pap"                // Post-activation potentiation protocol — structured contrast
  | "plyometric_focus"   // Pure plyometric/jump training session
  | "speed_strength";    // Moderate load, maximum velocity intent

// ─── Force-Velocity Exercise Map ─────────────────────────────────────────────

export interface ForceVelocityExercise {
  name: string;
  fvType: ForceVelocityType;
  description: string;
  prescriptionSets: number;
  prescriptionReps: string;
  restBetweenSets: string;
  coachNote: string;
  pairedWith?: string; // for contrast/complex pairing
}

export const FORCE_VELOCITY_EXERCISES: Record<ForceVelocityType, ForceVelocityExercise[]> = {
  max_strength: [
    {
      name: "Trap Bar Deadlift",
      fvType: "max_strength",
      description: "Maximum load with hip-dominant pull mechanics — builds the force foundation",
      prescriptionSets: 4,
      prescriptionReps: "2-5",
      restBetweenSets: "3-5 min",
      coachNote: "Brace fully, drive through the floor — this is the 'heavy' half of the contrast pair. Bar speed will be slow — that is expected at max strength loads.",
      pairedWith: "Trap Bar Jump",
    },
    {
      name: "Back Squat",
      fvType: "max_strength",
      description: "Bilateral squat strength — the force production foundation for all lower-body power",
      prescriptionSets: 4,
      prescriptionReps: "2-4",
      restBetweenSets: "3-5 min",
      coachNote: "Controlled descent (2 sec), explosive intent on the concentric — treat every rep as a max effort at this load.",
      pairedWith: "Box Jump",
    },
    {
      name: "Hex Bar Deadlift",
      fvType: "max_strength",
      description: "Trap bar alternative — more quad involvement, less lumbar stress",
      prescriptionSets: 4,
      prescriptionReps: "3-5",
      restBetweenSets: "3-5 min",
      coachNote: "Drive through the floor, not the bar — hips and knees extend simultaneously for maximum force output.",
    },
    {
      name: "Clean Pull / Romanian Deadlift",
      fvType: "max_strength",
      description: "Posterior chain dominant pulling pattern — builds the hip extension power that transfers to sprinting",
      prescriptionSets: 4,
      prescriptionReps: "3-5",
      restBetweenSets: "3 min",
      coachNote: "Lat tension maintained throughout — the pull is a hinge, not a row. This builds the posterior chain stiffness that powers sprint mechanics.",
    },
  ],

  strength_speed: [
    {
      name: "Heavy Sled Push",
      fvType: "strength_speed",
      description: "High-load, intent to drive fast — the strength-speed zone that bridges gym and track",
      prescriptionSets: 4,
      prescriptionReps: "20m push",
      restBetweenSets: "3-4 min",
      coachNote: "Moderate-to-heavy load that allows fast turnover but resists movement. Drive from a low angle — forward lean, powerful stride rate.",
    },
    {
      name: "Power Clean",
      fvType: "strength_speed",
      description: "Olympic pulling variation — force production through triple extension at speed",
      prescriptionSets: 5,
      prescriptionReps: "2-3",
      restBetweenSets: "3-5 min",
      coachNote: "The pull is a hip snap, not a bicep curl — bar stays close, triple extension is violent. Each rep begins when posture and intent are reset.",
    },
    {
      name: "Hang Power Clean",
      fvType: "strength_speed",
      description: "Olympic pulling variation from hang — explosive hip extension under load",
      prescriptionSets: 4,
      prescriptionReps: "2-3",
      restBetweenSets: "3-5 min",
      coachNote: "Hips back, then explosive extension — the bar should feel like it floats before you catch it. Power comes from the hips, not the arms.",
    },
    {
      name: "Hang Power Snatch",
      fvType: "strength_speed",
      description: "Olympic lifting — the fastest Olympic movement, maximum rate of force development",
      prescriptionSets: 4,
      prescriptionReps: "2-3",
      restBetweenSets: "3-5 min",
      coachNote: "Wrists and elbows punch up aggressively — the bar rises because of explosive hip extension, not pulling. Technical mastery required.",
    },
    {
      name: "Resisted Sprint (Light Sled)",
      fvType: "strength_speed",
      description: "Sprint mechanics under resistance — builds force application while maintaining sprint posture",
      prescriptionSets: 4,
      prescriptionReps: "20m resisted",
      restBetweenSets: "3-4 min",
      coachNote: "Load should not alter mechanics by more than 10% — if stride pattern degrades, the load is too heavy. Posture is the priority.",
    },
  ],

  speed_strength: [
    {
      name: "Box Jump",
      fvType: "speed_strength",
      description: "Reactive vertical power — intent is maximum height, not just getting on the box",
      prescriptionSets: 4,
      prescriptionReps: "3-5",
      restBetweenSets: "2-3 min",
      coachNote: "Full triple extension at the top — hips, knees, ankles extend completely. Step down (never jump down). Reset intent before every rep.",
      pairedWith: "Back Squat",
    },
    {
      name: "Broad Jump",
      fvType: "speed_strength",
      description: "Horizontal power expression — acceleration mechanics in jump form",
      prescriptionSets: 4,
      prescriptionReps: "3-5",
      restBetweenSets: "2-3 min",
      coachNote: "Drive through the floor with aggressive arm swing — project horizontally. This is your acceleration mechanics without a sled.",
      pairedWith: "Trap Bar Deadlift",
    },
    {
      name: "Trap Bar Jump",
      fvType: "speed_strength",
      description: "Loaded jump — the 'explosive' half of a contrast pair with heavy trap bar deadlift",
      prescriptionSets: 4,
      prescriptionReps: "3-5",
      restBetweenSets: "3 min",
      coachNote: "Light load (30–40% of trap bar max), maximum jump height every rep — this follows the heavy deadlift in a contrast pair to exploit PAP.",
    },
    {
      name: "Medicine Ball Overhead Scoop Toss",
      fvType: "speed_strength",
      description: "Posterior chain power expression — hip extension translated into explosive upper body drive",
      prescriptionSets: 4,
      prescriptionReps: "5",
      restBetweenSets: "90 sec",
      coachNote: "Hinge loads the posterior chain — the throw is the result of explosive hip extension, not an arm press. Drive violently through the floor.",
    },
    {
      name: "Medicine Ball Rotational Throw",
      fvType: "speed_strength",
      description: "Rotational power development — builds the rotational force that transfers to cutting, throwing, and striking",
      prescriptionSets: 4,
      prescriptionReps: "5 each side",
      restBetweenSets: "90 sec",
      coachNote: "Rotation initiates from the hips, not the shoulders — the arm drives the ball because the hip rotated first. Maximum power expression each throw.",
    },
    {
      name: "Depth Jump",
      fvType: "speed_strength",
      description: "Reactive plyometric — exploits the stretch-shortening cycle at maximum intensity",
      prescriptionSets: 4,
      prescriptionReps: "3-5",
      restBetweenSets: "3 min",
      coachNote: "Contact time is the metric — land and IMMEDIATELY explode upward. The ground is not a resting place. Intermediate/advanced athletes only.",
    },
  ],

  max_velocity: [
    {
      name: "Flying Sprint (20m build + 20m fly)",
      fvType: "max_velocity",
      description: "Maximum velocity sprint — only achievable when fully warmed up and not pre-fatigued",
      prescriptionSets: 4,
      prescriptionReps: "20m fly",
      restBetweenSets: "4-5 min",
      coachNote: "Build through the first 20m, then sprint at absolute maximum through the fly zone. Mechanics matter — tall posture, fast arm drive, piston leg cycle.",
    },
    {
      name: "Wicket Run (Hurdle Drill)",
      fvType: "max_velocity",
      description: "Wickets or hurdles placed at stride-length intervals — teaches max velocity mechanics",
      prescriptionSets: 4,
      prescriptionReps: "30m",
      restBetweenSets: "3-4 min",
      coachNote: "Cycles the leg through the correct flight path — knees up, foot dorsiflexed, tall posture. This builds the mechanical habit for max velocity running.",
    },
    {
      name: "Lateral Bound",
      fvType: "max_velocity",
      description: "Lateral reactive power — maximum velocity in the frontal plane, mirrors COD mechanics",
      prescriptionSets: 3,
      prescriptionReps: "4-5 each side",
      restBetweenSets: "2 min",
      coachNote: "Stick the landing — eccentric absorption before the next bound. Lateral force production and deceleration are the adaptations.",
    },
  ],
};

// ─── Sprint Session Templates ─────────────────────────────────────────────────

export interface SprintInterval {
  label: string;
  distance: string;
  effort: string;
  rest: string;
  sets: number;
  repsPerSet: number;
  totalDistance: string;
  notes: string;
}

export interface SprintSessionTemplate {
  sprintType: SprintType;
  sessionName: string;
  totalDuration: string;
  warmupProtocol: string;
  intervals: SprintInterval[];
  volumeCap: string;
  coachingCue: string;
  weeklyRole: string;
  commonErrors: string[];
  progressionWeek1: string;
  progressionWeek3: string;
  progressionWeek5: string;
}

export function buildSprintSessionTemplate(
  sprintType: SprintType,
  sport: string | null,
  week: number = 1,
): SprintSessionTemplate {
  const sportLabel = sport ? `${sport} ` : "";
  const s = sport?.toLowerCase() ?? "";
  const isFieldSport = s.includes("soccer") || s.includes("football") || s.includes("rugby") || s.includes("lacrosse");
  const isCourtSport = s.includes("basketball");

  switch (sprintType) {
    case "acceleration": {
      const shortReps = week <= 2 ? 4 : week <= 4 ? 5 : 6;
      const longReps = week <= 2 ? 3 : week <= 4 ? 4 : 5;
      return {
        sprintType,
        sessionName: `${sportLabel}Acceleration Development`,
        totalDuration: "45–55 min total",
        warmupProtocol: "10 min: jog 400m → A-skip 2 × 20m → B-skip 2 × 20m → high knees 2 × 20m → build-up strides 3 × 30m at 70%, 80%, 90%",
        intervals: [
          {
            label: "Phase 1 — Short Acceleration",
            distance: "10m sprint",
            effort: "100% — absolute max from a standing or 3-point start",
            rest: "90 sec walk-back",
            sets: 1,
            repsPerSet: shortReps,
            totalDistance: `${shortReps * 10}m`,
            notes: "Start position: 3-point stance or standing lean. Drive from low angle for first 3 steps. Focus on force application, not 'running fast'.",
          },
          {
            label: "Phase 2 — Extended Acceleration",
            distance: "20m sprint",
            effort: "100% — build through all 20m",
            rest: "2 min walk-back",
            sets: 1,
            repsPerSet: longReps,
            totalDistance: `${longReps * 20}m`,
            notes: "Acceleration phase extends to 20m. Body angle rises gradually — not upright at 5m. Arm drive powers the leg turnover.",
          },
        ],
        volumeCap: `${shortReps * 10 + longReps * 20}m total sprint distance — do not exceed 250m acceleration volume`,
        coachingCue: "Acceleration is force application, not running fast. Drive the ground away from you with each stride. The fastest athletes aren't trying to run fast — they're trying to drive hard.",
        weeklyRole: "1–2× per week, always first in session or as a standalone. Never after strength training.",
        commonErrors: [
          "Standing upright too quickly — maintain forward lean through the 10m mark",
          "Looking up too soon — neutral neck, eyes down at 15–20 degrees",
          "Arm crossing the midline — arms drive straight forward and back, not across",
          "Short rest — acceleration quality requires 90+ sec between every rep",
        ],
        progressionWeek1: `${shortReps} × 10m + ${longReps} × 20m with full recovery`,
        progressionWeek3: `${shortReps + 1} × 10m + ${longReps + 1} × 20m`,
        progressionWeek5: `${shortReps + 2} × 10m + ${longReps + 2} × 20m or add 30m acceleration reps`,
      };
    }

    case "max_velocity": {
      const flyReps = week <= 2 ? 3 : week <= 4 ? 4 : 5;
      return {
        sprintType,
        sessionName: `${sportLabel}Max Velocity Development`,
        totalDuration: "50–60 min total",
        warmupProtocol: "12 min: jog 400m → dynamic drill series (A-skip, B-skip, C-skip, high knees) 2 × 30m each → 4 × 40m build-ups at 70%, 80%, 90%, 95% — do NOT sprint before build-ups",
        intervals: [
          {
            label: "Phase 1 — Build-Up Fly Sprint",
            distance: "20m build + 20m fly",
            effort: "95–100% through the fly zone only — build in is relaxed",
            rest: "4–5 min full recovery",
            sets: 1,
            repsPerSet: flyReps,
            totalDistance: `${flyReps * 40}m (${flyReps * 20}m at max velocity)`,
            notes: "Build through the first 20m to reach maximum speed, then sprint through the 20m fly zone at absolute maximum. Timing gates on the fly zone if available.",
          },
        ],
        volumeCap: `${flyReps * 20}m at maximum velocity — max velocity volume cap is 100–200m true max-speed distance`,
        coachingCue: "Maximum velocity is achieved, not forced. The sprint is relaxed power — tall posture, fast arm cycle, knee drives high. If you're trying hard to go fast, you're blocking it.",
        weeklyRole: "1× per week — max velocity is high CNS cost and requires 48–72h before or after another demanding lower-body session.",
        commonErrors: [
          "Sprinting at max velocity without full warm-up — injury risk is high",
          "Insufficient rest between reps — max velocity requires 4–5 min minimum",
          "Sprinting before mechanics are established — max velocity drills must precede full sprints",
          "Over-prescription — max velocity volume must stay under 200m total",
        ],
        progressionWeek1: `${flyReps} × (20m build + 20m fly) with 4-5 min rest`,
        progressionWeek3: `${flyReps + 1} × (20m build + 20m fly)`,
        progressionWeek5: `${flyReps + 2} × (20m build + 20m fly) or extend fly zone to 30m`,
      };
    }

    case "change_of_direction": {
      const shuffleReps = week <= 2 ? 4 : week <= 4 ? 5 : 6;
      const shuttleReps = week <= 2 ? 4 : week <= 4 ? 5 : 6;
      return {
        sprintType,
        sessionName: `${sportLabel}Change of Direction (COD) Training`,
        totalDuration: "45–55 min total",
        warmupProtocol: "10 min: jog → lateral shuffle × 2 → backpedal × 2 → 3-cone drill at 60% × 2 → build-up strides × 2",
        intervals: [
          {
            label: "Phase 1 — Lateral COD",
            distance: isCourtSport ? "5-10-5 yard shuttle" : "5m lateral sprint and return",
            effort: "100% change of direction at each cone",
            rest: "90 sec",
            sets: 1,
            repsPerSet: shuffleReps,
            totalDistance: `${shuffleReps * 15}m`,
            notes: "Deceleration mechanics at the change point are the training stimulus — not the sprint. Sit into the hip, plant firmly, and drive back.",
          },
          {
            label: "Phase 2 — T-Drill or Pro-Agility",
            distance: isFieldSport ? "T-drill (10y × 5y × 5y pattern)" : "Pro agility shuttle (5-10-5)",
            effort: "Maximum speed through full pattern",
            rest: "2 min",
            sets: 1,
            repsPerSet: shuttleReps,
            totalDistance: "Variable",
            notes: "Full pattern, full speed — this develops the coordination and deceleration capacity for multi-directional sport demands.",
          },
        ],
        volumeCap: "Total COD reps: 8–12 per session. Quality degrades rapidly — stop when mechanics break.",
        coachingCue: "COD speed is deceleration speed. The athlete who can stop faster can start faster. Drive through the plant foot, not around it.",
        weeklyRole: "1–2× per week. Can follow a speed session with 24h rest or precede strength training.",
        commonErrors: [
          "Wide plant — foot must plant inside the turning point, not outside",
          "Upright posture at the change — hips must drop to decelerate properly",
          "Too much volume — COD quality degrades after 8–12 reps",
          "No warm-up — COD sprinting without ankle and hip activation is an injury risk",
        ],
        progressionWeek1: `${shuffleReps} × COD lateral + ${shuttleReps} × shuttle drill with full recovery`,
        progressionWeek3: `${shuffleReps + 1} × each pattern`,
        progressionWeek5: `${shuffleReps + 2} × each or add open-loop reactive component`,
      };
    }

    case "reactive_agility": {
      return {
        sprintType,
        sessionName: `${sportLabel}Reactive Agility Training`,
        totalDuration: "40–50 min total",
        warmupProtocol: "10 min: jog → shuffles → backpedal → mirror drill at 50% × 2 → build-ups × 3",
        intervals: [
          {
            label: "Mirror Drill",
            distance: "5m reactive zone",
            effort: "Match partner/signal at 100%",
            rest: "60 sec after each 10-sec bout",
            sets: 3,
            repsPerSet: 6,
            totalDistance: "Variable",
            notes: "React to the stimulus, don't anticipate. This trains the read-react-move pattern that closed agility drills cannot develop.",
          },
          {
            label: "Light-Based or Signal Agility",
            distance: "COD to one of 4 cones",
            effort: "100% reaction to signal",
            rest: "90 sec",
            sets: 2,
            repsPerSet: 6,
            totalDistance: "Variable",
            notes: "Stimulus-response — the training value is the decision-making under speed, not just the movement. Keep total reps low.",
          },
        ],
        volumeCap: "12–16 reactive reps per session — quality degrades when decision-making slows",
        coachingCue: "Reactive agility trains the brain, not just the body. The instant you see the signal, you move — no hesitation, no prediction.",
        weeklyRole: "1× per week for athletes. Separate from max velocity day by 24h minimum.",
        commonErrors: [
          "Anticipating the stimulus instead of reacting — must use unpredictable cues",
          "Over-programming — reactive quality degrades rapidly, keep volume low",
          "Poor base mechanics — reactive agility on top of poor COD mechanics is wasted",
        ],
        progressionWeek1: "3 sets × 6 mirror drill reps + 2 sets × 6 signal drill",
        progressionWeek3: "4 sets × 6 mirror + 3 sets × 6 signal",
        progressionWeek5: "Add sport-specific reactive scenarios (ball, opponent) to drills",
      };
    }
  }
}

// ─── Power Session Templates ──────────────────────────────────────────────────

export interface PowerPair {
  primaryExercise: string;
  primaryLoad: string;
  primarySets: number;
  primaryReps: string;
  explosiveExercise: string;
  explosiveLoad: string;
  explosiveSets: number;
  explosiveReps: string;
  intraPairRest: string;
  betweenPairRest: string;
  method: PowerMethod;
  rationale: string;
  coachNote: string;
}

export interface PowerSessionTemplate {
  method: PowerMethod;
  sessionName: string;
  totalDuration: string;
  sessionOrder: string;
  pairs: PowerPair[];
  accessoryBlock: string;
  volumeRules: string;
  coachingCue: string;
  weeklyRole: string;
  antiPatterns: string[];
  progressionWeek1: string;
  progressionWeek3: string;
  progressionWeek5: string;
}

export function buildPowerSessionTemplate(
  method: PowerMethod,
  sport: string | null,
  equipment: string,
  week: number = 1,
): PowerSessionTemplate {
  const sportLabel = sport ? `${sport} ` : "";
  const hasOlympicLifts = equipment.toLowerCase().includes("barbell") || equipment.toLowerCase().includes("full");
  const hasSled = equipment.toLowerCase().includes("full") || equipment.toLowerCase().includes("commercial");

  switch (method) {
    case "contrast_training": {
      const heavySets = week <= 2 ? 3 : week <= 4 ? 4 : 5;
      return {
        method,
        sessionName: `${sportLabel}Contrast Training — Power Development`,
        totalDuration: "60–75 min total",
        sessionOrder: "Prep → Contrast Pair A → Contrast Pair B → Strength Support → Trunk",
        pairs: [
          {
            primaryExercise: "Back Squat or Trap Bar Deadlift",
            primaryLoad: "80–90% 1RM",
            primarySets: heavySets,
            primaryReps: "2-3",
            explosiveExercise: "Box Jump or Broad Jump",
            explosiveLoad: "Bodyweight",
            explosiveSets: heavySets,
            explosiveReps: "3-5",
            intraPairRest: "3–5 min after the primary lift, THEN immediately do the jump",
            betweenPairRest: "3 min between contrast pairs",
            method: "contrast_training",
            rationale: "The heavy squat/deadlift creates post-activation potentiation (PAP) — the neuromuscular system is primed to recruit more motor units for the explosive action that follows.",
            coachNote: "The jump must happen within 5–8 min of the heavy lift. If rest exceeds 10 min, the PAP window closes. The lift is not conditioning — it is neural priming.",
          },
          {
            primaryExercise: "Heavy Sled Push or Power Clean",
            primaryLoad: hasSled ? "Heavy resistance sled" : hasOlympicLifts ? "70–80% of clean max" : "Dumbbell Hang Clean",
            primarySets: heavySets,
            primaryReps: hasSled ? "20m" : "2-3",
            explosiveExercise: "Medicine Ball Overhead Scoop Toss",
            explosiveLoad: "10–15 lb med ball",
            explosiveSets: heavySets,
            explosiveReps: "5",
            intraPairRest: "3 min after primary, then immediately med ball",
            betweenPairRest: "3 min",
            method: "contrast_training",
            rationale: "Second contrast pair with a different primary pattern — ensures the posterior chain and hip extension system receive PAP benefits in multiple contexts.",
            coachNote: "Maintain maximum throw distance on all reps — if output drops, the rest is insufficient. The med ball should travel further after the heavy lift than it would without it.",
          },
        ],
        accessoryBlock: `${week <= 2 ? "2" : "3"} sets × 8–10 reps of unilateral hip dominant (single-leg RDL or hip thrust) + anti-rotation trunk (Pallof press)`,
        volumeRules: "Total heavy sets: 6–10. Total explosive reps: 15–25. Never exceed 30 explosive reps in a power session.",
        coachingCue: "The contrast pair is a unit — the lift sets the table, the jump or throw is the meal. Treat them as one exercise, not two.",
        weeklyRole: "1–2× per week. High CNS cost — 48h minimum between contrast sessions. Never the day before competition.",
        antiPatterns: [
          "Using contrast training with heavy load AND conditioning — these cannot coexist in the same session",
          "Extending rest beyond 10 min between heavy lift and explosive action — PAP window closes",
          "High rep primary lifts (8–12 reps) in contrast pairs — PAP is driven by near-maximal loading, not hypertrophy",
          "Over-programming explosive reps — 15–25 explosive reps is the session limit",
        ],
        progressionWeek1: `${heavySets} contrast pairs at 80–85% primary / bodyweight explosive`,
        progressionWeek3: `${heavySets} contrast pairs at 85–90% primary — increase load, maintain explosive quality`,
        progressionWeek5: `Add loaded explosive option (trap bar jump with 20–30% load) or reduce primary rest to 2.5 min when PAP response is established`,
      };
    }

    case "complex_training": {
      const sets = week <= 2 ? 3 : week <= 4 ? 4 : 5;
      return {
        method,
        sessionName: `${sportLabel}Complex Training — Lower Power`,
        totalDuration: "55–70 min total",
        sessionOrder: "Prep → Complex A (lower) → Complex B (upper) → Strength Support → Trunk",
        pairs: [
          {
            primaryExercise: "Front Squat or Trap Bar Deadlift",
            primaryLoad: "75–85% 1RM",
            primarySets: sets,
            primaryReps: "3",
            explosiveExercise: "Depth Jump or Box Jump",
            explosiveLoad: "Bodyweight",
            explosiveSets: sets,
            explosiveReps: "3",
            intraPairRest: "45 sec between primary and jump (brief rest in complex vs. full rest in contrast)",
            betweenPairRest: "3–4 min",
            method: "complex_training",
            rationale: "Complex training uses biomechanically similar movements in sequence — the squat pattern is mechanically similar to the jump, reinforcing the movement under fatigue then at full speed.",
            coachNote: "The brief rest distinguishes complex from contrast — you are linking the heavy movement to the explosive one. Quality drops in later sets are normal; stop if mechanics fail.",
          },
          {
            primaryExercise: hasOlympicLifts ? "Hang Power Clean" : "Dumbbell Hang Power Clean",
            primaryLoad: hasOlympicLifts ? "70% of clean max" : "Moderate",
            primarySets: sets,
            primaryReps: "3",
            explosiveExercise: "Medicine Ball Rotational Throw",
            explosiveLoad: "10–15 lb med ball",
            explosiveSets: sets,
            explosiveReps: "4 each side",
            intraPairRest: "45 sec",
            betweenPairRest: "3 min",
            method: "complex_training",
            rationale: "Olympic lift linked with med ball rotational throw — connects triple extension to rotational power expression.",
            coachNote: "Hip rotation drives the throw — it is not an arm exercise. The clean primes the hip extension system for maximum rotational output.",
          },
        ],
        accessoryBlock: `${sets - 1} sets × 8 reps of unilateral power (step-up or split squat with 2-sec descent)`,
        volumeRules: "Total complex pairs: 2. Total sets per complex: 3–5. Never stack 3 complex pairs in one session.",
        coachingCue: "Complex training links a loaded pattern to its explosive expression — the link between strength and sport performance happens in the brief rest between the two exercises.",
        weeklyRole: "1–2× per week. Can be run on days that aren't pure sprint days.",
        antiPatterns: [
          "Skipping the primary lift entirely — complex training requires both elements",
          "Using the same session for complex training AND conditioning — these goals conflict",
          "Prescribing 4+ exercises per complex — pairs only (2 exercises per complex)",
        ],
        progressionWeek1: `${sets} sets × 3 reps primary + ${sets} × 3 explosive`,
        progressionWeek3: `${sets} sets at higher primary load (+5%), same explosive quality`,
        progressionWeek5: `Introduce eccentric-enhanced primary (3-sec descent) to increase PAP response`,
      };
    }

    case "pap": {
      const sets = week <= 2 ? 3 : week <= 4 ? 4 : 5;
      return {
        method,
        sessionName: `${sportLabel}PAP Protocol — Post-Activation Potentiation`,
        totalDuration: "55–65 min total",
        sessionOrder: "Prep → PAP Block A → PAP Block B → Structural Strength → Trunk",
        pairs: [
          {
            primaryExercise: "Squat (heavy) or Clean Pull",
            primaryLoad: "85–93% 1RM (strength side)",
            primarySets: sets,
            primaryReps: "1-3",
            explosiveExercise: "Vertical Jump or Broad Jump (max effort)",
            explosiveLoad: "Bodyweight",
            explosiveSets: sets,
            explosiveReps: "2-3 max effort jumps",
            intraPairRest: "4–8 min between heavy lift and jump (full PAP window)",
            betweenPairRest: "3–4 min",
            method: "pap",
            rationale: "PAP protocol uses near-maximal loading (85–93%) and a longer inter-stimulus rest (4–8 min) to allow the nervous system to be primed without significant fatigue — resulting in enhanced explosive output.",
            coachNote: "The 4–8 min rest is not wasted time — it is where the PAP effect peaks. Time the jump at 5 min post-lift for maximum potentiation in most athletes.",
          },
          {
            primaryExercise: "Hex Bar Deadlift (heavy)",
            primaryLoad: "85–90% 1RM",
            primarySets: sets,
            primaryReps: "1-2",
            explosiveExercise: "Sprint Acceleration (20m)",
            explosiveLoad: "Bodyweight sprint",
            explosiveSets: sets,
            explosiveReps: "1 sprint at 100%",
            intraPairRest: "5 min between deadlift and sprint",
            betweenPairRest: "4 min",
            method: "pap",
            rationale: "Heavy deadlift → sprint — the PAP effect elevates motor unit recruitment in the hip extension system, directly improving sprint force application.",
            coachNote: "The sprint must be at 100% effort — this is not a conditioning drill. The PAP window gives you a superhuman effect for a limited time. Use it fully.",
          },
        ],
        accessoryBlock: `${sets - 2} sets structural support only (trunk and unilateral): Pallof press + single-leg RDL`,
        volumeRules: "PAP blocks only: 2. Total heavy reps: 4–8. Total explosive reps: 8–15. PAP does not include conditioning.",
        coachingCue: "PAP is the most powerful short-term performance enhancement available without substances. Earn it with the heavy lift, protect it with the rest, express it with the jump or sprint.",
        weeklyRole: "1× per week — high CNS cost. Run in the week's highest priority training day.",
        antiPatterns: [
          "Using light loads (below 80% 1RM) — PAP requires near-maximal neural activation to potentiate",
          "Too little rest (under 3 min) — this turns PAP into complex training. Different protocol, different response.",
          "Too much rest (over 10 min) — the PAP effect dissipates. 4–8 min is the window.",
          "Stacking conditioning after PAP blocks — fatigue eliminates the potentiation benefit",
        ],
        progressionWeek1: `${sets} sets PAP pairs at 85–88% primary with 5 min inter-stimulus rest`,
        progressionWeek3: `${sets} sets at 88–92% primary — increase loading, maintain explosive quality and rest timing`,
        progressionWeek5: `Individualize rest timing (some athletes peak at 3 min, some at 7 min) — test and record`,
      };
    }

    case "plyometric_focus": {
      const sets = week <= 2 ? 3 : week <= 4 ? 4 : 5;
      const footContacts = week <= 2 ? 40 : week <= 4 ? 60 : 80;
      return {
        method,
        sessionName: `${sportLabel}Plyometric Power Session`,
        totalDuration: "45–55 min total",
        sessionOrder: "Prep → Horizontal Power → Vertical Power → Lateral Power → Strength Support",
        pairs: [
          {
            primaryExercise: "Broad Jump",
            primaryLoad: "Bodyweight",
            primarySets: sets,
            primaryReps: "4-5",
            explosiveExercise: "Triple Hop for Distance",
            explosiveLoad: "Bodyweight",
            explosiveSets: sets,
            explosiveReps: "2-3 each leg",
            intraPairRest: "90 sec between exercises",
            betweenPairRest: "2 min",
            method: "plyometric_focus",
            rationale: "Horizontal plyometric progression — starts with bilateral broad jump, progresses to triple hop that demands single-leg loading and elastic energy return.",
            coachNote: "Drive through the hips every rep. Soft landing on triple hops — absorb eccentrically before the next hop. Contact time should feel short.",
          },
          {
            primaryExercise: "Box Jump",
            primaryLoad: "Bodyweight",
            primarySets: sets,
            primaryReps: "4-5",
            explosiveExercise: "Depth Jump",
            explosiveLoad: "Bodyweight",
            explosiveSets: week >= 3 ? sets : 0,
            explosiveReps: "3",
            intraPairRest: "90 sec",
            betweenPairRest: "2 min",
            method: "plyometric_focus",
            rationale: "Vertical plyometric block — box jump builds concentric power, depth jump (intermediate/advanced) trains the stretch-shortening cycle at maximum intensity.",
            coachNote: "Depth jumps are not for beginners. If depth jumps are prescribed: step off (don't jump off), land, and immediately jump — the ground is not a resting place.",
          },
        ],
        accessoryBlock: `Lateral bounds: ${sets} × 4 each side. Then ${sets - 1} × 8-10 single-leg squat for strength support`,
        volumeRules: `Total foot contacts: ${footContacts} maximum per session. Count every landing. Beginners: 40 max. Intermediate: 60. Advanced: 80–100.`,
        coachingCue: "Plyometrics develop elastic energy — the speed at which you can absorb and return force. Every landing is an opportunity to express reactive power, not just endure impact.",
        weeklyRole: "1–2× per week. High tissue loading — adequate recovery between sessions is mandatory. Never two consecutive plyometric days.",
        antiPatterns: [
          "Prescribing plyometrics as conditioning — plyometrics are NOT conditioning",
          "Treating plyometrics as high-rep (15–20 reps) — plyos are low rep, high quality",
          "Insufficient warm-up before depth jumps or box jumps",
          `Exceeding ${footContacts} foot contacts — exceeding volume limits causes overuse, not adaptation`,
        ],
        progressionWeek1: `${sets} × 4 broad jump + ${sets} × 4 box jump + lateral bounds (${footContacts} foot contacts total)`,
        progressionWeek3: `${sets} × 5 reps + add depth jump if intermediate+`,
        progressionWeek5: `${sets + 1} × 5 reps or increase surface complexity (reactive box jump with signal)`,
      };
    }

    case "speed_strength": {
      const sets = week <= 2 ? 3 : week <= 4 ? 4 : 5;
      return {
        method,
        sessionName: `${sportLabel}Speed-Strength Power Session`,
        totalDuration: "55–65 min total",
        sessionOrder: "Prep → Speed-Strength Block → Strength Support → Accessory",
        pairs: [
          {
            primaryExercise: hasOlympicLifts ? "Hang Power Clean or Power Snatch" : "Dumbbell Hang Clean",
            primaryLoad: hasOlympicLifts ? "60–75% — speed is the metric, not load" : "Moderate — maximize speed of movement",
            primarySets: sets,
            primaryReps: "2-4",
            explosiveExercise: "Medicine Ball Overhead Scoop Toss",
            explosiveLoad: "10–15 lb med ball",
            explosiveSets: sets,
            explosiveReps: "4-5",
            intraPairRest: "2 min",
            betweenPairRest: "2-3 min",
            method: "speed_strength",
            rationale: "Olympic lifting at moderate load with maximum velocity intent — the speed-strength zone targets rate of force development in the hip extension pattern that directly transfers to sprinting.",
            coachNote: "The load is a tool, not a target. Move it as fast as possible — if bar speed slows, reduce load. The adaptation is velocity, not load capacity.",
          },
          {
            primaryExercise: "Trap Bar Jump (loaded jump)",
            primaryLoad: "20–40% of trap bar max (light enough to jump high)",
            primarySets: sets,
            primaryReps: "3-5",
            explosiveExercise: "Sprint Acceleration (10m)",
            explosiveLoad: "Bodyweight",
            explosiveSets: sets,
            explosiveReps: "2",
            intraPairRest: "2–3 min",
            betweenPairRest: "3 min",
            method: "speed_strength",
            rationale: "Loaded jump → sprint acceleration — bridges the gym (loaded explosive) to the track (bodyweight sprint). Speed-strength transfers to sprint force application.",
            coachNote: "The jump should feel lighter than the sprint, not heavier. The loaded jump primes the hip extension system for the sprint that follows.",
          },
        ],
        accessoryBlock: `${sets - 1} sets structural work: single-leg RDL + Pallof press + hip thrust`,
        volumeRules: "Total speed-strength reps: 15–30. Sprint reps: 4–8 at 10m. Total explosive volume stays under 35 reps.",
        coachingCue: "Speed-strength is the zone where the weight room meets the track — moderate load at maximum velocity. The goal is to move faster with each session, not lift heavier.",
        weeklyRole: "1–2× per week. Less CNS cost than PAP or contrast training. Good for mid-week power maintenance.",
        antiPatterns: [
          "Loading Olympic lifts too heavy and losing velocity — defeats the speed-strength purpose",
          "Treating speed-strength sessions as strength sessions (heavy, slow) — different zone",
          "Adding conditioning after speed-strength work — fatigue eliminates the velocity adaptation",
        ],
        progressionWeek1: `${sets} sets speed-strength block at moderate load + ${sets} sprint acceleration reps`,
        progressionWeek3: `Add velocity tracking — time the Olympic lift bar speed or jump height`,
        progressionWeek5: `Increase complexity: add resisted sprint (light sled) after loaded jump sequence`,
      };
    }
  }
}

// ─── Sport → Power/Speed Profile Mapping ─────────────────────────────────────

export interface PowerSpeedProfile {
  primaryPowerMethod: PowerMethod;
  primarySprintType: SprintType;
  secondarySprintType?: SprintType;
  fvEmphasis: ForceVelocityType[];
  powerSessionsPerWeek: number;
  sprintSessionsPerWeek: number;
  emphasis: string;
  sportCoachNote: string;
}

export function mapSportToPowerSpeedProfile(
  sport: string | null,
  goal: string,
  daysPerWeek: number,
): PowerSpeedProfile {
  const s = sport?.toLowerCase() ?? "";
  const g = goal.toLowerCase();

  if (s.includes("american football") || (s.includes("football") && !s.includes("soccer"))) {
    return {
      primaryPowerMethod: "contrast_training",
      primarySprintType: "acceleration",
      fvEmphasis: ["max_strength", "strength_speed", "speed_strength"],
      powerSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      sprintSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      emphasis: "Maximum force and acceleration power — football is dominated by 0–15m sprints with full recovery. Strength-speed and acceleration are the priority energy systems.",
      sportCoachNote: "Football: contrast training with heavy lower + sled push pairs develops the force application needed for blocking and route running. Acceleration 10–20m is the sprint domain.",
    };
  }

  if (s.includes("basketball")) {
    return {
      primaryPowerMethod: "plyometric_focus",
      primarySprintType: "change_of_direction",
      secondarySprintType: "reactive_agility",
      fvEmphasis: ["speed_strength", "max_velocity"],
      powerSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      sprintSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      emphasis: "Vertical power, reactive agility, and COD — basketball demands explosive jumping, landing/deceleration, and open-loop agility. Height and first-step quickness.",
      sportCoachNote: "Basketball: plyometric focus (box jump, depth jump) develops vertical power. COD and reactive agility training mirror in-game demands. Deceleration mechanics are as important as acceleration.",
    };
  }

  if (s.includes("soccer") || (s.includes("football") && !s.includes("american"))) {
    return {
      primaryPowerMethod: "complex_training",
      primarySprintType: "acceleration",
      secondarySprintType: "max_velocity",
      fvEmphasis: ["speed_strength", "strength_speed", "max_velocity"],
      powerSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      sprintSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.5)),
      emphasis: "Sprint speed and explosiveness for a multi-direction, multi-speed sport — soccer requires both max velocity (counter-attacks, through-balls) and acceleration (box penetration, recovery runs).",
      sportCoachNote: "Soccer: complex training with squat + jump pairs builds the lower-body power needed for sprint initiation. Both acceleration AND max velocity sessions are needed across the week.",
    };
  }

  if (s.includes("baseball") || s.includes("softball")) {
    return {
      primaryPowerMethod: "complex_training",
      primarySprintType: "acceleration",
      fvEmphasis: ["speed_strength", "strength_speed"],
      powerSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      sprintSessionsPerWeek: Math.min(1, Math.floor(daysPerWeek * 0.3)),
      emphasis: "Rotational power and short acceleration — baseball is dominated by rotational force (hitting) and sprint acceleration (baserunning, fielding). Maximum strength and speed-strength are key.",
      sportCoachNote: "Baseball: med ball rotational throws are as important as sprint work. Complex pairs with Olympic lifts + rotational throws develop the force-velocity profile needed for batting and pitching.",
    };
  }

  if (s.includes("track") || s.includes("sprinter") || g.includes("sprint") || g.includes("linear speed")) {
    return {
      primaryPowerMethod: "contrast_training",
      primarySprintType: "acceleration",
      secondarySprintType: "max_velocity",
      fvEmphasis: ["max_strength", "strength_speed", "max_velocity"],
      powerSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      sprintSessionsPerWeek: Math.min(3, Math.floor(daysPerWeek * 0.6)),
      emphasis: "Pure speed development — sprint specialization requires both acceleration mechanics AND max velocity development. Gym work serves speed, not the other way around.",
      sportCoachNote: "Track sprinters: gym work is secondary to sprint work. Heavy lifts (contrast pairs) develop force application, but sprint volume and quality are the primary adaptation driver.",
    };
  }

  if (s.includes("rugby") || s.includes("lacrosse") || s.includes("hockey")) {
    return {
      primaryPowerMethod: "contrast_training",
      primarySprintType: "acceleration",
      secondarySprintType: "change_of_direction",
      fvEmphasis: ["strength_speed", "speed_strength", "max_velocity"],
      powerSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      sprintSessionsPerWeek: Math.min(2, Math.floor(daysPerWeek * 0.4)),
      emphasis: "Power and speed for contact/multi-direction sports — acceleration off contact, COD speed, and sprint capacity across a game.",
      sportCoachNote: "Contact/field sports: contrast training develops the power to accelerate after contact. COD training develops the directional speed these sports demand.",
    };
  }

  // Goal-based: no sport
  if (/\bpower\b/.test(g) || g.includes("explosive")) {
    return {
      primaryPowerMethod: "contrast_training",
      primarySprintType: "acceleration",
      fvEmphasis: ["max_strength", "strength_speed", "speed_strength"],
      powerSessionsPerWeek: Math.min(3, Math.floor(daysPerWeek * 0.6)),
      sprintSessionsPerWeek: Math.min(1, Math.floor(daysPerWeek * 0.3)),
      emphasis: "General power development — contrast training and force-velocity work across all zones",
      sportCoachNote: "Non-sport power focus: emphasize contrast pairs and PAP protocols across multiple force-velocity zones.",
    };
  }

  if (/\bspeed\b/.test(g) || g.includes("sprint") || g.includes("fast")) {
    return {
      primaryPowerMethod: "speed_strength",
      primarySprintType: "acceleration",
      secondarySprintType: "max_velocity",
      fvEmphasis: ["speed_strength", "max_velocity", "strength_speed"],
      powerSessionsPerWeek: Math.min(1, Math.floor(daysPerWeek * 0.3)),
      sprintSessionsPerWeek: Math.min(3, Math.floor(daysPerWeek * 0.6)),
      emphasis: "Sprint speed development — acceleration and max velocity programming with gym work supporting sprint mechanics",
      sportCoachNote: "Speed focus: sprint sessions are the priority. Gym work (speed-strength) supports sprint mechanics — not the other way around.",
    };
  }

  // Default: general athletic power
  return {
    primaryPowerMethod: "complex_training",
    primarySprintType: "acceleration",
    fvEmphasis: ["speed_strength", "strength_speed"],
    powerSessionsPerWeek: Math.min(1, Math.floor(daysPerWeek * 0.3)),
    sprintSessionsPerWeek: Math.min(1, Math.floor(daysPerWeek * 0.3)),
    emphasis: "General athletic power — complex training and acceleration work for general performance",
    sportCoachNote: "General power: complex training pairs build the strength-to-power transfer needed for any athletic context.",
  };
}

// ─── Sprint Volume Rules ──────────────────────────────────────────────────────

export const SPRINT_VOLUME_RULES = {
  acceleration: {
    maxDistancePerSession: 250,   // meters
    maxRepsPerSession: 16,
    minRestBetweenReps: "90 sec",
    minRestBetweenSets: "3 min",
    volumeNote: "Acceleration volume must stay under 250m total distance per session. Quality degrades at higher volumes — stop when mechanics break.",
  },
  max_velocity: {
    maxDistancePerSession: 200,   // meters at true max velocity (not build-up distance)
    maxRepsPerSession: 8,
    minRestBetweenReps: "4-5 min",
    minRestBetweenSets: "4 min",
    volumeNote: "Max velocity sessions are the shortest in distance but highest in CNS cost. 100–200m of true max-speed distance is the entire session's budget.",
  },
  change_of_direction: {
    maxRepsPerSession: 12,
    minRestBetweenReps: "90 sec",
    minRestBetweenSets: "2 min",
    volumeNote: "COD quality degrades after 10–12 reps. When deceleration mechanics break, the session is over.",
  },
  reactive_agility: {
    maxBoutsPerSession: 20,
    minRestBetweenBouts: "60 sec",
    volumeNote: "Reactive agility sessions are short — decision quality is the metric. When decision time slows, end the session.",
  },
} as const;

// ─── AI Prompt Context Builder ────────────────────────────────────────────────

/**
 * Builds power/speed intelligence context injected into the AI system prompt.
 * Called when goal is power, speed, or sport with power/speed demands.
 */
export function buildPowerSpeedContext(
  goal: string,
  sport: string | null,
  equipment: string,
  daysPerWeek: number,
): string {
  const profile = mapSportToPowerSpeedProfile(sport, goal, daysPerWeek);
  const powerTemplate = buildPowerSessionTemplate(profile.primaryPowerMethod, sport, equipment, 1);
  const sprintTemplate = buildSprintSessionTemplate(profile.primarySprintType, sport, 1);
  const secondarySprintTemplate = profile.secondarySprintType
    ? buildSprintSessionTemplate(profile.secondarySprintType, sport, 1)
    : null;

  const fvZones = profile.fvEmphasis.map(fv => {
    const fvMap: Record<ForceVelocityType, string> = {
      max_strength: "Max Strength (heavy compounds, 85–95% 1RM, slow velocity)",
      strength_speed: "Strength-Speed (heavy sled, Olympic pulls, 60–80% 1RM at max intent)",
      speed_strength: "Speed-Strength (jumps, med ball throws, 30–60% 1RM at max speed)",
      max_velocity: "Max Velocity (sprinting, reactive plyos, bodyweight at top speed)",
    };
    return `  - ${fvMap[fv]}`;
  }).join("\n");

  const powerPairsText = powerTemplate.pairs.map((pair, i) => `
  Pair ${i + 1}: ${pair.primaryExercise} → ${pair.explosiveExercise}
  Primary: ${pair.primarySets} × ${pair.primaryReps} @ ${pair.primaryLoad}
  Explosive: ${pair.explosiveSets} × ${pair.explosiveReps}
  Rest: ${pair.intraPairRest} (intra-pair) / ${pair.betweenPairRest} (between pairs)
  Method rationale: ${pair.rationale}`).join("\n");

  const sprintIntervalsText = sprintTemplate.intervals.map(interval => `
  ${interval.label}: ${interval.sets === 1 ? "" : `${interval.sets} sets × `}${interval.repsPerSet} × ${interval.distance}
  Effort: ${interval.effort}
  Rest: ${interval.rest}
  Total distance: ${interval.totalDistance}
  Notes: ${interval.notes}`).join("\n");

  return `
## POWER & SPEED INTELLIGENCE — MANDATORY

This user's request requires REAL power and/or speed programming. These are distinct CNS-dominant qualities with specific rules that MUST be followed.

### POWER/SPEED PROFILE FOR THIS USER
Goal: ${goal}
Sport: ${sport ?? "None"}
Equipment: ${equipment}
Emphasis: ${profile.emphasis}

### FORCE-VELOCITY ZONES TO TARGET
${fvZones}

### POWER METHOD: ${powerTemplate.method.replace(/_/g, " ").toUpperCase()}
Session: ${powerTemplate.sessionName}
Duration: ${powerTemplate.totalDuration}
Session order: ${powerTemplate.sessionOrder}
Weekly role: ${powerTemplate.weeklyRole}

Power Pairs (use these structures as templates):
${powerPairsText}

Accessory block: ${powerTemplate.accessoryBlock}
Volume rules: ${powerTemplate.volumeRules}
Coaching cue: ${powerTemplate.coachingCue}

Progression:
- Week 1: ${powerTemplate.progressionWeek1}
- Week 3: ${powerTemplate.progressionWeek3}
- Week 5: ${powerTemplate.progressionWeek5}

### SPRINT METHOD: ${sprintTemplate.sessionName}
Warm-up: ${sprintTemplate.warmupProtocol}
Volume cap: ${sprintTemplate.volumeCap}
Coaching cue: ${sprintTemplate.coachingCue}
Weekly role: ${sprintTemplate.weeklyRole}

Sprint Structure:
${sprintIntervalsText}

Progression:
- Week 1: ${sprintTemplate.progressionWeek1}
- Week 3: ${sprintTemplate.progressionWeek3}
- Week 5: ${sprintTemplate.progressionWeek5}
${secondarySprintTemplate ? `
### SECONDARY SPRINT METHOD: ${secondarySprintTemplate.sessionName}
Weekly role: ${secondarySprintTemplate.weeklyRole}
Volume cap: ${secondarySprintTemplate.volumeCap}
` : ""}
### MANDATORY POWER/SPEED PROGRAMMING RULES

1. **Session sequence is non-negotiable:** Speed → Power → Strength → Accessory. NEVER place strength before speed or power.
2. **Power reps are low, rest is long:** Power = 1–5 reps per set. Rest = 2–5 min between sets. No exceptions.
3. **Sprint reps require full recovery:** Every sprint rep requires full rest (90 sec minimum, 4–5 min for max velocity). Sprints with short rest are conditioning, not speed development.
4. **Plyometrics are NOT conditioning:** Box jumps, broad jumps, and depth jumps are power development tools. Never prescribe them in circuits or with short rest.
5. **Power and conditioning cannot coexist in the same session block:** After power work, the session ends with structural/accessory work only. No metabolic conditioning after power blocks.
6. **Force-velocity zone specificity:** The program must target different F-V zones — heavy strength AND explosive work AND sprint work. Not just "box jumps added to lifting."
7. **Language must name the method and purpose:**
   - Instead of "added explosive work" → "Added contrast pair: Trap Bar Deadlift (4×3 @ 85%) followed by Box Jump (4×4 BW) with 4-min PAP window to develop rate of force development in the hip extension pattern"
   - Instead of "sprint drills" → "Acceleration development: 5×10m + 4×20m sprints with full 2-min recovery — targeting first-step force application mechanics"
8. **Weekly structure must vary power/speed sessions:** Different sessions target different F-V zones. Not the same session repeated.

### POWER/SPEED ANTI-PATTERNS — NEVER DO THESE
- Prescribing box jumps with 60-second rest — plyometrics require 2–3 min minimum
- "HIIT" or circuit-style power work — this is conditioning, not power development
- Adding "jumps" to a hypertrophy session without specifying method, rest, and purpose
- Sprint work described as "3 sets of sprints" without distance, recovery, or total volume
- Placing sprint or power work AFTER heavy strength lifting
- Using moderate reps (8–15) for power development exercises
- Prescribing max velocity sprints without full warm-up protocol

### SPORT-SPECIFIC OVERLAY
${profile.sportCoachNote}
`.trim();
}

// ─── Detection Functions ──────────────────────────────────────────────────────

export function isPowerRequest(goal: string, request?: string): boolean {
  const g = (goal + " " + (request ?? "")).toLowerCase();
  return (
    /\bpower\b/.test(g) ||
    /explosive(ness)?|contrast.training|complex.training|pap|post.activation|force.velocity|rate.of.force|rfd|plyometric|vertical.jump|\bjump\b|\bjumps\b|jump.higher|bounce|reactiv(e|ity)|first.?step|box.jump|broad.jump|jumper|more.explosive|more.power/.test(g)
  );
}

export function isSpeedRequest(goal: string, request?: string): boolean {
  const g = (goal + " " + (request ?? "")).toLowerCase();
  return (
    /\bspeed\b/.test(g) ||
    /\bsprint\b|acceleration|max.velocity|change.of.direction|\bcod\b|first.?step|quickness|agility|linear.speed|deceleration|decelerating|sprint.work|more.speed|faster|speed.work|speed.training|sprint.training/.test(g)
  );
}

export function isPowerOrSpeedGoal(rawGoal: string): boolean {
  const g = rawGoal.toLowerCase();
  return isPowerRequest(g) || isSpeedRequest(g);
}
