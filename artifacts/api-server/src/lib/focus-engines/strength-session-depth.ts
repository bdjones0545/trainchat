// ─── Strength Session Depth Augmentation Layer ────────────────────────────────
//
// Mirrors the speed-engine depth expander pattern.
// Guarantees that every generated strength session meets a minimum exercise
// count (5 for working sessions, 4 for deload) BEFORE the program is saved.
//
// Pipeline position: runs in ai.ts AFTER all validation/repair passes and
// BEFORE the structuredData is returned to the caller. This guarantees minimum
// depth regardless of what the AI returned.
//
// Slot order (fill priority when exercises are missing):
//   1. prep      — movement prep / tissue quality
//   2. power     — explosive primer (omitted for deload sessions)
//   3. secondary — structural complement to the primary compound
//   4. unilateral — single-leg / single-arm (lower and full-body sessions)
//   5. trunk     — anti-extension / anti-rotation
//   6. finisher  — structural accessory (lowest priority)
//
// Each augmentation exercise is a concrete, appropriately classified exercise
// that can be audited by name in production logs.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

type StrengthExerciseTemplate = {
  name: string;
  classification: string;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
};

export interface StrengthSessionDepthAudit {
  dayIndex: number;
  sessionName: string;
  sessionType: string;
  exercisesBeforeExpansion: number;
  minimumRequired: number;
  wasExpanded: boolean;
  exercisesAdded: string[];
  slotsFilledBy: string[];
  exercisesAfterExpansion: number;
}

export interface StrengthSessionDepthScore {
  sessionName: string;
  sessionType: string;
  exerciseCount: number;
  minimumRequired: number;
  minimumMet: boolean;
  hasPrepWork: boolean;
  hasPrimaryCompound: boolean;
  hasSecondaryWork: boolean;
  hasUnilateral: boolean;
  hasTrunk: boolean;
  score: number;
  passed: boolean;
}

// ─── Minimum Depth by Session Name Pattern ───────────────────────────────────

const STRENGTH_SESSION_MINIMUM_DEPTH: Array<{ pattern: RegExp; minimum: number; target: number }> = [
  { pattern: /deload|active.recovery|restoration|flush/i, minimum: 4, target: 4 },
  { pattern: /power|neural|explosive|potentiation|speed.strength/i, minimum: 5, target: 6 },
  { pattern: /lower|squat|hinge|deadlift|leg|posterior.chain/i, minimum: 5, target: 6 },
  { pattern: /upper|press|push|pull|bench|chest|shoulder|row|back/i, minimum: 5, target: 6 },
  { pattern: /full.body|total.body/i, minimum: 5, target: 6 },
];

// ─── Session Type Classifier ──────────────────────────────────────────────────

type StrengthSessionCategory =
  | "lower"
  | "upper"
  | "full_body"
  | "power_neural"
  | "deload"
  | "default";

function classifyStrengthSession(name: string): StrengthSessionCategory {
  const n = name.toLowerCase();
  if (/deload|active.recovery|restoration|flush/i.test(n)) return "deload";
  if (/power|neural|explosive|potentiation|speed.strength/i.test(n)) return "power_neural";
  if (/lower|squat|hinge|deadlift|leg|posterior.chain/i.test(n)) return "lower";
  if (/upper|press|push|pull|bench|chest|shoulder|row|back/i.test(n)) return "upper";
  if (/full.body|total.body/i.test(n)) return "full_body";
  return "default";
}

function getSessionMinimum(name: string): { minimum: number; target: number } {
  for (const { pattern, minimum, target } of STRENGTH_SESSION_MINIMUM_DEPTH) {
    if (pattern.test(name)) return { minimum, target };
  }
  return { minimum: 5, target: 6 };
}

// ─── Augmentation Banks ───────────────────────────────────────────────────────
//
// Each bank entry is indexed by slot role. The expander iterates slots in order
// and picks the first exercise from that slot's list that is not already
// represented in the session (name comparison, case-insensitive).

const STRENGTH_AUGMENTATION_BANKS: Record<StrengthSessionCategory, Record<string, StrengthExerciseTemplate[]>> = {

  // ── Lower-body dominant sessions (squat or hinge focus) ────────────────────
  lower: {
    prep: [
      {
        name: "Glute Bridge Activation",
        classification: "Prep",
        sets: 2,
        reps: "12 reps",
        rest: "30s",
        notes: "Hip activation before loading — drive through heels, full lockout at top. 2 sec hold at top each rep. NOT a strength exercise — tissue quality and neural prep only",
      },
      {
        name: "Hip CARs + Ankle Circles",
        classification: "Prep",
        sets: 1,
        reps: "6 each direction",
        rest: "N/A",
        notes: "Controlled articular rotation at hip — slow and deliberate through full range. Follow with 10 ankle circles each direction. Joint prep, not conditioning",
      },
    ],
    power: [
      {
        name: "Box Jump",
        classification: "Power",
        sets: 3,
        reps: "4 reps",
        rest: "90s",
        notes: "Explosive triple extension — land softly with full hip absorption. Step down, reset. NOT conditioning — full rest between sets. Stop if landing quality drops",
      },
      {
        name: "Squat Jump",
        classification: "Power",
        sets: 3,
        reps: "5 reps",
        rest: "90s",
        notes: "Bodyweight countermovement jump — max height intent, absorb landing through hips and knees, not the back. Full rest. Quality over reps",
      },
    ],
    secondary: [
      {
        name: "Romanian Deadlift",
        classification: "Secondary",
        sets: 3,
        reps: "8–10 reps",
        rest: "90s",
        notes: "Hip hinge structural complement — flat back, feel hamstring tension at bottom. Bar stays close to shins throughout. Complement to the primary squat pattern, not the session anchor",
      },
      {
        name: "Dumbbell Romanian Deadlift",
        classification: "Secondary",
        sets: 3,
        reps: "10 reps",
        rest: "75s",
        notes: "Single or double dumbbell RDL — maintain neutral spine, push hips back to load hamstrings. Structural balance complement. Choose load that allows quality over heavy",
      },
    ],
    unilateral: [
      {
        name: "Reverse Lunge",
        classification: "Unilateral",
        sets: 3,
        reps: "8 reps per leg",
        rest: "75s",
        notes: "Step back, lower rear knee toward floor — front shin stays vertical. Drive through front heel to stand. Single-leg positional control and knee stability",
      },
      {
        name: "Box Step-Up",
        classification: "Unilateral",
        sets: 3,
        reps: "8 reps per leg",
        rest: "60s",
        notes: "Step onto box with full hip extension at top — no push from trail leg. Controlled lower. Moderate height, quality over load. Hip drive and single-leg stability",
      },
    ],
    trunk: [
      {
        name: "Pallof Press",
        classification: "Trunk",
        sets: 3,
        reps: "10 reps per side",
        rest: "60s",
        notes: "Anti-rotation — press cable or band straight out, hold 1s, return under control. Tall posture, slight hip hinge. The goal is resisting rotation, not generating it",
      },
      {
        name: "Dead Bug",
        classification: "Trunk",
        sets: 3,
        reps: "6 reps per side",
        rest: "60s",
        notes: "Anti-extension — lower back pressed into floor throughout. Opposite arm/leg slow lower. Stop before lower back lifts. Breathing integrated — exhale on effort",
      },
    ],
    finisher: [
      {
        name: "Single-Leg Hip Thrust",
        classification: "Accessory",
        sets: 3,
        reps: "10 reps per leg",
        rest: "60s",
        notes: "Unilateral glute isolation close — drive through single heel, full lockout at top, 1s hold. Structural posterior chain support. Low load, high quality",
      },
      {
        name: "Nordic Hamstring Curl",
        classification: "Accessory",
        sets: 3,
        reps: "5 reps",
        rest: "90s",
        notes: "Eccentric hamstring integrity — partner anchors ankles or use machine. Lower as slowly as possible, catch at bottom. Structural posterior chain resilience. Quality over reps",
      },
    ],
  },

  // ── Upper-body dominant sessions (press or pull focus) ─────────────────────
  upper: {
    prep: [
      {
        name: "Band Pull-Apart",
        classification: "Prep",
        sets: 2,
        reps: "15 reps",
        rest: "30s",
        notes: "Scapular retraction activation — arms straight, pull band to chest height, hold 1s. Posture prep before pressing. Light band, full retraction each rep",
      },
      {
        name: "Wall Slide + Deep Squat",
        classification: "Prep",
        sets: 2,
        reps: "8 reps",
        rest: "30s",
        notes: "Wall slide: arms on wall, slide up and down maintaining contact — thoracic extension and scapular positioning. Follow with bodyweight deep squat for hip/thoracic activation",
      },
    ],
    power: [
      {
        name: "Medicine Ball Chest Pass",
        classification: "Power",
        sets: 3,
        reps: "5 reps",
        rest: "75s",
        notes: "Explosive upper body power — throw against wall or to partner with maximum velocity. Reset before each rep. Pressing power expression, not conditioning",
      },
      {
        name: "Medicine Ball Overhead Slam",
        classification: "Power",
        sets: 3,
        reps: "5 reps",
        rest: "75s",
        notes: "Full extension overhead, then forceful slam — upper body power and trunk stiffness. Full rest between sets. NOT conditioning — explosive intent every rep",
      },
    ],
    secondary: [
      {
        name: "Dumbbell Row",
        classification: "Secondary",
        sets: 3,
        reps: "10 reps per side",
        rest: "75s",
        notes: "Single-arm dumbbell row — elbow drives back toward hip, full scapular retraction at top. Structural balance complement to pressing primary. Chest supported or free-standing",
      },
      {
        name: "Cable Row",
        classification: "Secondary",
        sets: 3,
        reps: "10–12 reps",
        rest: "75s",
        notes: "Seated or half-kneeling cable row — retract shoulder blade, elbow drives back. Complement to press-dominant primary. Controlled eccentric return",
      },
    ],
    unilateral: [
      {
        name: "Single-Arm Dumbbell Press",
        classification: "Unilateral",
        sets: 3,
        reps: "10 reps per arm",
        rest: "60s",
        notes: "Single-arm overhead or bench press — unilateral stability challenge, expose asymmetries. Shoulder stability and trunk anti-lateral-flexion demand",
      },
    ],
    trunk: [
      {
        name: "Dead Bug",
        classification: "Trunk",
        sets: 3,
        reps: "6 reps per side",
        rest: "60s",
        notes: "Anti-extension — lower back pressed into floor throughout. Opposite arm/leg slow lower. Breathing integrated — exhale on effort. Structural trunk close",
      },
      {
        name: "Pallof Press",
        classification: "Trunk",
        sets: 3,
        reps: "10 reps per side",
        rest: "60s",
        notes: "Anti-rotation — press cable or band straight out, resist rotational pull, return under control. Tall posture. Trunk close before finishing upper work",
      },
    ],
    finisher: [
      {
        name: "Face Pull",
        classification: "Accessory",
        sets: 3,
        reps: "15 reps",
        rest: "45s",
        notes: "Cable face pull — pull to forehead height, externally rotate at end range, hold 1s. Posterior rotator cuff and mid-back structural care. Non-negotiable for pressing athletes",
      },
      {
        name: "Band External Rotation",
        classification: "Accessory",
        sets: 3,
        reps: "15 reps per side",
        rest: "45s",
        notes: "Elbow at 90°, rotate out against light band resistance. Shoulder structural integrity. Light load, full range, deliberate. Structural close for pressing sessions",
      },
    ],
  },

  // ── Full-body sessions ─────────────────────────────────────────────────────
  full_body: {
    prep: [
      {
        name: "World's Greatest Stretch",
        classification: "Prep",
        sets: 1,
        reps: "5 reps per side",
        rest: "N/A",
        notes: "Full-body prep — hip flexor + thoracic + ankle mobility in one sequence. Slow and deliberate through each position. Joint prep, not a strength exercise",
      },
      {
        name: "Hip CARs + Shoulder CARs",
        classification: "Prep",
        sets: 1,
        reps: "5 each direction per joint",
        rest: "N/A",
        notes: "Controlled articular rotations — full range at hip and shoulder. Slow, deliberate, no momentum. Neural activation prep for full-body session",
      },
    ],
    power: [
      {
        name: "Medicine Ball Slam",
        classification: "Power",
        sets: 3,
        reps: "5 reps",
        rest: "90s",
        notes: "Full-body power expression — full extension overhead, forceful slam with maximum intent. Full rest between sets. NOT conditioning — reset before each rep",
      },
      {
        name: "Box Jump",
        classification: "Power",
        sets: 3,
        reps: "4 reps",
        rest: "90s",
        notes: "Explosive triple extension — land softly, step down, reset. Structural lower-body power complement for full-body session",
      },
    ],
    secondary: [
      {
        name: "Dumbbell Row",
        classification: "Secondary",
        sets: 3,
        reps: "10 reps per side",
        rest: "75s",
        notes: "Upper-body structural complement — horizontal pull pattern. Balance the session's lower compound with upper posterior chain work",
      },
      {
        name: "Romanian Deadlift",
        classification: "Secondary",
        sets: 3,
        reps: "8–10 reps",
        rest: "90s",
        notes: "Posterior chain structural complement — hip hinge balance. Flat back, feel hamstring tension. Complements the pressing or squat primary pattern",
      },
    ],
    unilateral: [
      {
        name: "Reverse Lunge",
        classification: "Unilateral",
        sets: 3,
        reps: "8 reps per leg",
        rest: "75s",
        notes: "Single-leg positional control — front shin vertical, rear knee toward floor. Drive through front heel. Asymmetry exposure and hip stability",
      },
      {
        name: "Single-Leg RDL",
        classification: "Unilateral",
        sets: 3,
        reps: "8 reps per leg",
        rest: "75s",
        notes: "Single-leg hinge — maintain level hips, push hips back on descent, neutral spine throughout. Balance and posterior chain unilateral loading",
      },
    ],
    trunk: [
      {
        name: "Pallof Press",
        classification: "Trunk",
        sets: 3,
        reps: "10 reps per side",
        rest: "60s",
        notes: "Anti-rotation close — resist rotational pull through standing or half-kneeling position. Trunk integrity structural finish",
      },
      {
        name: "Dead Bug",
        classification: "Trunk",
        sets: 3,
        reps: "6 reps per side",
        rest: "60s",
        notes: "Anti-extension — lower back pressed into floor. Opposite arm/leg lower slowly. Breathing integrated. Structural trunk finish",
      },
    ],
    finisher: [
      {
        name: "Suitcase Carry",
        classification: "Carry",
        sets: 3,
        reps: "20m per side",
        rest: "60s",
        notes: "Loaded carry — resist lateral lean, tall posture, shoulder packed. Anti-lateral-flexion functional finish. Moderate load, deliberate pace",
      },
      {
        name: "Copenhagen Plank",
        classification: "Accessory",
        sets: 3,
        reps: "20s per side",
        rest: "45s",
        notes: "Lateral hip and adductor structural integrity — top leg on bench, bottom leg can be supported or free. Structural resilience finish",
      },
    ],
  },

  // ── Power / neural potentiation sessions ──────────────────────────────────
  power_neural: {
    prep: [
      {
        name: "Ankle Stiffness Prep",
        classification: "Prep",
        sets: 2,
        reps: "12 contacts",
        rest: "45s",
        notes: "Bilateral pogo hops at submaximal intent — prep Achilles and ankle complex for explosive loading. Quick contact time, stiff ankle, minimal knee bend. NOT conditioning",
      },
      {
        name: "Hip CARs + Ankle Mobility",
        classification: "Prep",
        sets: 1,
        reps: "5 each direction",
        rest: "N/A",
        notes: "Joint prep for power session — controlled articular rotations at hip and ankle. Deliberate and slow. Neural readiness before explosive work",
      },
    ],
    power: [
      {
        name: "Depth Jump",
        classification: "Plyometric",
        sets: 3,
        reps: "4 reps",
        rest: "2 min",
        notes: "Step off box (30–45 cm), land and immediately jump — minimize ground contact time. Elastic reactive output. Full rest between sets — this is neural work, not conditioning",
      },
      {
        name: "Countermovement Jump",
        classification: "Power",
        sets: 3,
        reps: "5 reps",
        rest: "2 min",
        notes: "Countermovement vertical jump — maximum height intent, land soft and absorb. Reset between reps. This is not conditioning — full rest between sets",
      },
    ],
    secondary: [
      {
        name: "Trap Bar Deadlift",
        classification: "Secondary",
        sets: 3,
        reps: "5 reps",
        rest: "2 min",
        notes: "Speed-strength secondary — explosive intent on every concentric. Moderate load (65–75%). Potentiates the elastic/power work. NOT grinding strength — bar speed is the goal",
      },
      {
        name: "Goblet Squat",
        classification: "Secondary",
        sets: 3,
        reps: "6 reps",
        rest: "90s",
        notes: "Pattern reinforcement secondary — moderate load, controlled tempo, full depth. Complement to the explosive primary block. Quality movement, not heavy loading",
      },
    ],
    unilateral: [
      {
        name: "Bulgarian Split Squat",
        classification: "Unilateral",
        sets: 3,
        reps: "6 reps per leg",
        rest: "90s",
        notes: "Unilateral lower complement to power session — moderate load, eccentric control, explosive concentric. Single-leg force production and stability",
      },
    ],
    trunk: [
      {
        name: "Dead Bug",
        classification: "Trunk",
        sets: 3,
        reps: "6 reps per side",
        rest: "60s",
        notes: "Anti-extension trunk close — lower back pressed into floor, slow controlled movement. Structural trunk finish after power work. Breathing integrated",
      },
      {
        name: "Pallof Press",
        classification: "Trunk",
        sets: 3,
        reps: "10 reps per side",
        rest: "60s",
        notes: "Anti-rotation trunk — resist rotation under cable or band load. Tall posture. Structural close after explosive session",
      },
    ],
    finisher: [
      {
        name: "Pogo Hops",
        classification: "Accessory",
        sets: 3,
        reps: "10 contacts",
        rest: "75s",
        notes: "Elastic stiffness reinforcement — bilateral stiff-ankle hops, fast contact time, minimal knee bend. Structural elastic close. Stop if contact time deteriorates",
      },
    ],
  },

  // ── Deload sessions ────────────────────────────────────────────────────────
  deload: {
    prep: [
      {
        name: "Light Mobility Flow",
        classification: "Prep",
        sets: 1,
        reps: "8 min",
        rest: "N/A",
        notes: "Hip 90/90 transitions × 5, thoracic rotation × 6, ankle circles × 10, cat-cow × 8. Parasympathetic quality movement — do NOT push range of motion or fatigue tissue",
      },
    ],
    secondary: [
      {
        name: "Goblet Squat",
        classification: "Secondary",
        sets: 3,
        reps: "8 reps",
        rest: "60s",
        notes: "Deload week — 50–55% of normal load. Quality movement, no grinding. Bar speed easy. Movement reinforcement only — NOT a strength stimulus",
      },
      {
        name: "Light Cable Row",
        classification: "Secondary",
        sets: 3,
        reps: "12 reps",
        rest: "60s",
        notes: "Deload week — very light load, scapular quality. Tissue quality and scapular positioning. Not strength work — move well and flush fatigue",
      },
    ],
    unilateral: [
      {
        name: "Bodyweight Reverse Lunge",
        classification: "Unilateral",
        sets: 3,
        reps: "8 reps per leg",
        rest: "45s",
        notes: "Deload — bodyweight only. Positional quality and joint health. No loading. Move well through full range — tissue care only",
      },
    ],
    trunk: [
      {
        name: "Dead Bug",
        classification: "Trunk",
        sets: 2,
        reps: "6 reps per side",
        rest: "45s",
        notes: "Deload trunk — lower back pressed into floor, slow movement. Light parasympathetic work. Breathing-integrated. Brief and restorative — not a CNS challenge",
      },
      {
        name: "Prone Plank",
        classification: "Trunk",
        sets: 2,
        reps: "20s",
        rest: "45s",
        notes: "Deload trunk — light positional tension. Not a CNS-demanding hold. Quality trunk bracing in a simple position. Restorative only",
      },
    ],
    finisher: [
      {
        name: "Diaphragmatic Breathing",
        classification: "Accessory",
        sets: 3,
        reps: "5 breaths per side",
        rest: "30s",
        notes: "90/90 breathing — parasympathetic close. Exhale fully, let thorax relax. CNS recovery and tissue quality. Deload structural finish",
      },
    ],
  },

  // ── Default / unclassified sessions ───────────────────────────────────────
  default: {
    prep: [
      {
        name: "Dynamic Warm-Up",
        classification: "Prep",
        sets: 1,
        reps: "8–10 min",
        rest: "N/A",
        notes: "Leg swings × 10, inchworm + T-spine rotation × 5, hip circles × 10, arm circles × 10. Full-body activation before loading",
      },
    ],
    power: [
      {
        name: "Medicine Ball Slam",
        classification: "Power",
        sets: 3,
        reps: "5 reps",
        rest: "90s",
        notes: "Full-body power — full extension overhead, forceful slam. Maximum intent every rep. Full rest. NOT conditioning",
      },
    ],
    secondary: [
      {
        name: "Romanian Deadlift",
        classification: "Secondary",
        sets: 3,
        reps: "8–10 reps",
        rest: "90s",
        notes: "Hip hinge structural complement — flat back, hamstring load. Complement to the primary compound",
      },
    ],
    unilateral: [
      {
        name: "Reverse Lunge",
        classification: "Unilateral",
        sets: 3,
        reps: "8 reps per leg",
        rest: "75s",
        notes: "Single-leg positional control — front shin vertical, drive through heel to stand. Asymmetry exposure and hip stability",
      },
    ],
    trunk: [
      {
        name: "Dead Bug",
        classification: "Trunk",
        sets: 3,
        reps: "6 reps per side",
        rest: "60s",
        notes: "Anti-extension trunk close — lower back into floor, slow opposite arm/leg. Breathing integrated",
      },
    ],
    finisher: [
      {
        name: "Farmers Carry",
        classification: "Carry",
        sets: 3,
        reps: "20m",
        rest: "60s",
        notes: "Loaded carry structural close — tall posture, shoulder packed, resist trunk lean. Grip and lateral stability finish",
      },
    ],
  },
};

// ─── Slot Fill Order ──────────────────────────────────────────────────────────
// Deload sessions skip power — they don't need explosive potentiation.
const FULL_SLOT_ORDER = ["prep", "power", "secondary", "unilateral", "trunk", "finisher"] as const;
const DELOAD_SLOT_ORDER = ["prep", "secondary", "unilateral", "trunk", "finisher"] as const;

// ─── Expander ─────────────────────────────────────────────────────────────────

/**
 * Expands a strength session that has fewer exercises than the required minimum.
 * Adds missing exercises from the approved augmentation bank by slot type.
 * Returns the expanded day and a full audit trail.
 */
export function expandStrengthSessionIfTooThin(
  day: { name?: string; exercises?: StrengthExerciseTemplate[] },
  dayIndex: number,
): { expanded: typeof day; audit: StrengthSessionDepthAudit } {
  const sessionName = day.name ?? "";
  const sessionType = classifyStrengthSession(sessionName);
  const { minimum } = getSessionMinimum(sessionName);
  const exercises = day.exercises ?? [];
  const beforeCount = exercises.length;

  const audit: StrengthSessionDepthAudit = {
    dayIndex,
    sessionName,
    sessionType,
    exercisesBeforeExpansion: beforeCount,
    minimumRequired: minimum,
    wasExpanded: false,
    exercisesAdded: [],
    slotsFilledBy: [],
    exercisesAfterExpansion: beforeCount,
  };

  if (beforeCount >= minimum) {
    return { expanded: day, audit };
  }

  const bank = STRENGTH_AUGMENTATION_BANKS[sessionType] ?? STRENGTH_AUGMENTATION_BANKS.default;
  const existingNames = new Set(exercises.map((e) => e.name.toLowerCase()));
  const expanded = { ...day, exercises: [...exercises] };

  const slotOrder = sessionType === "deload" ? DELOAD_SLOT_ORDER : FULL_SLOT_ORDER;
  let filled = expanded.exercises.length;

  for (const slot of slotOrder) {
    if (filled >= minimum) break;
    const candidates = bank[slot] ?? STRENGTH_AUGMENTATION_BANKS.default[slot] ?? [];
    for (const candidate of candidates) {
      if (filled >= minimum) break;
      if (!existingNames.has(candidate.name.toLowerCase())) {
        expanded.exercises.push({ ...candidate });
        existingNames.add(candidate.name.toLowerCase());
        audit.exercisesAdded.push(candidate.name);
        audit.slotsFilledBy.push(slot);
        filled++;
      }
    }
  }

  audit.wasExpanded = audit.exercisesAdded.length > 0;
  audit.exercisesAfterExpansion = expanded.exercises.length;
  return { expanded, audit };
}

// ─── Depth Scorer ─────────────────────────────────────────────────────────────

const PREP_TERMS = /prep|warm|activation|mobility|cars|car\b|flow|dynamic/i;
const PRIMARY_TERMS = /squat|deadlift|press|bench|row|pull.up|chin.up|front.squat|back.squat|overhead.press|trap.bar/i;
const SECONDARY_TERMS = /rdl|romanian|secondary|supplemental|hip.thrust|goblet|cable.row|dumbbell.row|bent.over/i;
const UNILATERAL_TERMS = /lunge|split.squat|step.up|single.leg|unilateral|rfess|rear.foot/i;
const TRUNK_TERMS = /pallof|dead.bug|plank|ab.wheel|anti.rotation|anti.extension|suitcase.carry|hollow/i;

/**
 * Scores the structural completeness of a strength session.
 * Used for post-expansion audit logging.
 */
export function scoreStrengthSessionDepth(
  session: { name?: string; exercises?: Array<{ name: string; classification?: string; notes?: string }> },
): StrengthSessionDepthScore {
  const sessionName = session.name ?? "";
  const sessionType = classifyStrengthSession(sessionName);
  const exercises = session.exercises ?? [];
  const { minimum } = getSessionMinimum(sessionName);

  const allText = exercises.map((e) => `${e.name} ${e.classification ?? ""} ${e.notes ?? ""}`).join(" ");
  const allNames = exercises.map((e) => e.name.toLowerCase()).join(" ");

  const hasPrepWork = PREP_TERMS.test(allText) || exercises.some((e) => (e.classification ?? "").toLowerCase() === "prep");
  const hasPrimaryCompound = PRIMARY_TERMS.test(allNames) || exercises.some((e) => (e.classification ?? "").toLowerCase() === "primary");
  const hasSecondaryWork = SECONDARY_TERMS.test(allNames) || exercises.some((e) => ["secondary", "supplemental"].includes((e.classification ?? "").toLowerCase()));
  const hasUnilateral = UNILATERAL_TERMS.test(allNames) || exercises.some((e) => (e.classification ?? "").toLowerCase() === "unilateral");
  const hasTrunk = TRUNK_TERMS.test(allNames) || exercises.some((e) => ["trunk", "carry"].includes((e.classification ?? "").toLowerCase()));

  const exerciseCount = exercises.length;
  const minimumMet = exerciseCount >= minimum;

  // Score 0–5: one point per structural element present
  let score = 0;
  if (hasPrepWork) score++;
  if (hasPrimaryCompound) score++;
  if (hasSecondaryWork) score++;
  if (hasUnilateral || sessionType === "upper") score++; // upper sessions don't need unilateral
  if (hasTrunk) score++;

  const passed = minimumMet && score >= 3;

  return {
    sessionName,
    sessionType,
    exerciseCount,
    minimumRequired: minimum,
    minimumMet,
    hasPrepWork,
    hasPrimaryCompound,
    hasSecondaryWork,
    hasUnilateral,
    hasTrunk,
    score,
    passed,
  };
}
