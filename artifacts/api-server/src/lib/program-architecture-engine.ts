// ─── Program Architecture Engine ─────────────────────────────────────────────
//
// Implements CNS-driven, movement-based program architecture per the spec:
//   1. Define weekly architecture
//   2. Define session intent
//   3. Allocate movement patterns
//   4. Sequence CNS flow
//   5. Select exercises (delegated to AI — engine provides the blueprint)
//
// The engine generates a structured "Architecture Brief" that is injected
// into the AI system prompt, ensuring every generated program follows elite
// strength & conditioning principles.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

export type NeuralDemand = "high" | "moderate" | "low";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "unilateral_lower"
  | "upper_push"
  | "upper_pull"
  | "trunk"
  | "power"
  | "lateral"
  | "rotational"
  | "locomotion";

export interface CNSBlock {
  role: "prep" | "power" | "primary" | "secondary" | "unilateral" | "trunk" | "finisher";
  description: string;
}

export interface SessionArchitecture {
  dayNumber: number;
  identity: string;
  intent: string;
  neuralDemand: NeuralDemand;
  primaryPattern: MovementPattern;
  emphasizedPatterns: MovementPattern[];
  cnsFlow: CNSBlock[];
  sportNotes?: string;
}

export interface MovementAllocation {
  squat: number;
  hinge: number;
  unilateral_lower: number;
  upper_push: number;
  upper_pull: number;
  trunk: number;
  power: number;
  lateral?: number;
  rotational?: number;
}

export interface WeeklyArchitecture {
  daysPerWeek: number;
  sport: string | null;
  goal: string | null;
  sessions: SessionArchitecture[];
  movementAllocation: MovementAllocation;
  weeklyRhythm: string;
  recoveryNotes: string;
}

// ─── Standard CNS flow ───────────────────────────────────────────────────────

function buildCNSFlow(patterns: MovementPattern[], neuralDemand: NeuralDemand): CNSBlock[] {
  const blocks: CNSBlock[] = [];

  blocks.push({
    role: "prep",
    description: patterns.includes("squat") || patterns.includes("unilateral_lower") || patterns.includes("hinge")
      ? "Lower-body neural prep: hip CARs, glute activation, ankle stiffness series"
      : patterns.includes("upper_push") || patterns.includes("upper_pull")
        ? "Upper-body neural prep: scapular positioning, wall slides, thoracic mobility, shoulder activation"
        : "Full-body dynamic prep: leg swings, inchworm + reach, hip circles, trunk brace activation",
  });

  if (neuralDemand !== "low") {
    blocks.push({
      role: "power",
      description: patterns.includes("lateral") || patterns.includes("rotational")
        ? "Lateral/rotational power: lateral bound, med ball rotational throw, or reactive sprint mechanic drill"
        : patterns.includes("squat") || patterns.includes("unilateral_lower")
          ? "Vertical/horizontal power: broad jump, box jump, or vertical jump (3–5 sets × 3–5 reps)"
          : "Med ball power: chest throw, overhead slam, or push press (3–4 sets × 3–5 reps)",
    });
  }

  blocks.push({
    role: "primary",
    description: patterns.includes("squat")
      ? "Primary squat pattern: bilateral squat variation — back squat, front squat, or trap bar squat"
      : patterns.includes("hinge")
        ? "Primary hinge pattern: deadlift or Romanian deadlift variation"
        : patterns.includes("upper_push")
          ? "Primary press: bench press, overhead press, or incline press"
          : patterns.includes("upper_pull")
            ? "Primary pull: weighted pull-up or barbell row"
            : "Primary compound movement matching session identity",
  });

  blocks.push({
    role: "secondary",
    description: patterns.includes("squat")
      ? "Secondary pattern: hinge complement (RDL) + posterior chain support"
      : patterns.includes("hinge")
        ? "Secondary pattern: squat complement (goblet or split squat) + trunk"
        : patterns.includes("upper_push")
          ? "Structural balance: horizontal or vertical pull to complement press"
          : "Secondary compound: supports and balances the primary pattern",
  });

  if (patterns.includes("unilateral_lower") || patterns.includes("squat") || patterns.includes("hinge")) {
    blocks.push({
      role: "unilateral",
      description: "Unilateral lower-body: RFESS, lateral step-up, single-leg RDL, or lateral lunge for positional control and asymmetry exposure",
    });
  }

  blocks.push({
    role: "trunk",
    description: patterns.includes("rotational")
      ? "Rotational trunk: Pallof press, half-kneeling cable chop, or landmine rotation"
      : patterns.includes("lateral")
        ? "Lateral stability trunk: Copenhagen plank, side plank with hip abduction, or suitcase carry"
        : "Trunk integrity: anti-extension (ab wheel, dead bug) + anti-rotation (Pallof press) paired",
  });

  if (neuralDemand === "low") {
    blocks.push({
      role: "finisher",
      description: "Tissue quality finisher: Nordic curl, Copenhagen adduction, or face pull for structural resilience (only if session density allows)",
    });
  }

  return blocks;
}

// ─── Weekly architecture templates by day count ──────────────────────────────

function buildSessionsForDayCount(
  daysPerWeek: number,
  sport: string | null,
  goal: string | null,
  variationSeed?: number,
): SessionArchitecture[] {
  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;
  const isAthletic = isHockey
    || sport?.toLowerCase().includes("soccer")
    || sport?.toLowerCase().includes("football")
    || sport?.toLowerCase().includes("basketball")
    || sport?.toLowerCase().includes("rugby")
    || sport?.toLowerCase().includes("lacrosse")
    || sport?.toLowerCase().includes("track")
    || sport?.toLowerCase().includes("sprint")
    || false;

  const isHypertrophy = goal?.toLowerCase().includes("hypertrophy")
    || goal?.toLowerCase().includes("muscle")
    || goal?.toLowerCase().includes("size")
    || false;

  // Conditioning/endurance goal: programs structured around energy system development
  // with dedicated conditioning sessions rather than only lifting days
  const isConditioning = !!(
    goal?.toLowerCase().includes("conditioning") ||
    goal?.toLowerCase().includes("endurance") ||
    goal?.toLowerCase().includes("cardio") ||
    goal?.toLowerCase().includes("aerobic") ||
    goal?.toLowerCase().includes("work capacity") ||
    goal?.toLowerCase().includes("stamina")
  );

  // Individual sport-specific architectures are handled below
  // (football, basketball, soccer, baseball each have dedicated 3-day and 4-day blocks)

  // For conditioning-dominant goals, use conditioning-specific session architectures
  if (isConditioning && !isAthletic) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Strength Support + Aerobic Base",
          intent: "Compound lower-body strength as the structural foundation; aerobic base conditioning finisher to develop cardiac output",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "hinge", "trunk", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Dynamic lower prep: hip mobility, glute activation, ankle stiffness" },
            { role: "primary", description: "Compound squat pattern — bilateral force production foundation" },
            { role: "secondary", description: "Hinge pattern — posterior chain structural support" },
            { role: "unilateral", description: "Unilateral lower — single-leg stability and asymmetry correction" },
            { role: "trunk", description: "Anti-extension trunk work: dead bug or ab wheel" },
            { role: "finisher", description: "AEROBIC BASE CONDITIONING: 20–30 min steady-state run, row, or bike at 60–70% max HR. This is a dedicated energy system session, not a circuit." },
          ],
        },
        {
          dayNumber: 2,
          identity: "Dedicated Conditioning — Energy System Development",
          intent: "Standalone conditioning session targeting the primary energy system — real intervals, real work:rest ratios. This day is conditioning-first, not strength.",
          neuralDemand: "moderate",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Dynamic warm-up: jog, dynamic drills, build-up strides or jump rope warm-up" },
            { role: "primary", description: "PRIMARY CONDITIONING BLOCK: Structured intervals per the conditioning engine — lactate threshold or VO2max work. Not a circuit. Real work:rest prescribed." },
            { role: "secondary", description: "SECONDARY CONDITIONING: A second energy system block if time allows — e.g., aerobic base cool-down or tempo work" },
            { role: "trunk", description: "Trunk stability cooldown: 2–3 sets anti-rotation or anti-extension (minimal fatigue)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Upper Strength + Repeat Effort Conditioning",
          intent: "Upper body structural strength support; sprint or repeat-effort conditioning finisher to develop anaerobic capacity",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Upper-body neural prep: scapular activation, wall slides, thoracic mobility" },
            { role: "primary", description: "Upper push compound — horizontal or vertical press strength" },
            { role: "secondary", description: "Upper pull complement — row or chin-up for structural balance" },
            { role: "trunk", description: "Anti-rotation trunk: Pallof press or dead bug" },
            { role: "finisher", description: "CONDITIONING FINISHER: Anaerobic capacity or repeat sprint work — 6–10 × 20-sec all-out efforts with adequate rest. Named energy system, not 'circuits'." },
          ],
        },
      ];
    }

    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Lower Strength + Aerobic Foundation",
          intent: "Build structural lower-body strength as the conditioning support base; aerobic conditioning to close the session",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "hinge", "unilateral_lower", "trunk", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Lower-body dynamic prep: hip mobility, glute activation" },
            { role: "primary", description: "Squat-pattern bilateral strength" },
            { role: "secondary", description: "Hinge-pattern posterior chain" },
            { role: "unilateral", description: "Unilateral lower stability" },
            { role: "trunk", description: "Anti-extension trunk" },
            { role: "finisher", description: "AEROBIC BASE: 20 min steady-state run or row at 60–70% max HR" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Dedicated Conditioning — Lactate Threshold",
          intent: "Standalone lactate threshold session — structured intervals at 85–92% max HR. No lifting this day. Real conditioning work.",
          neuralDemand: "moderate",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion"],
          cnsFlow: [
            { role: "prep", description: "5 min easy jog or row warm-up" },
            { role: "primary", description: "LACTATE THRESHOLD INTERVALS: 3–5 × 4–6 min at 85–92% max HR with equal rest. Run, row, or bike. This is a real conditioning session." },
            { role: "finisher", description: "5 min easy cool-down" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Upper Structural Strength",
          intent: "Upper-body compound strength to maintain structural balance in a conditioning-dominant program",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Upper-body scapular and shoulder prep" },
            { role: "primary", description: "Horizontal press compound" },
            { role: "secondary", description: "Horizontal pull complement" },
            { role: "trunk", description: "Anti-rotation trunk integrity" },
          ],
        },
        {
          dayNumber: 4,
          identity: "Dedicated Conditioning — Anaerobic Capacity / RSA",
          intent: "High-intensity conditioning session targeting anaerobic capacity or repeat sprint ability — the most sport-specific conditioning day",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power"],
          cnsFlow: [
            { role: "prep", description: "8 min dynamic warm-up: jog + A-skips + high knees + 2 × build-up strides" },
            { role: "primary", description: "ANAEROBIC CAPACITY / RSA: 6–12 × 10–30 sec all-out sprints or bike efforts with 3–5× work:rest ratio. Full speed on every rep. Named energy system target." },
            { role: "finisher", description: "5 min walk cool-down" },
          ],
        },
      ];
    }
  }

  // ─── Power goal: contrast/complex/PAP session architecture ─────────────────
  // Power development requires: sprint/power FIRST, strength support SECOND, NO conditioning finishers
  const isPower = !!(
    goal?.toLowerCase().includes("power") ||
    goal?.toLowerCase().includes("explosive")
  );

  if (isPower) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Power Development — Lower Contrast Training",
          intent: "Lower-body contrast pairs: heavy compound lift paired with explosive jump/bound — exploits post-activation potentiation for maximum rate of force development",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "CNS activation prep: 8 min — dynamic lower prep → A-skip × 2 × 20m → broad jumps × 3 (sub-max) → build-up stride × 1" },
            { role: "power", description: "CONTRAST PAIR A: Heavy Squat/Trap Bar DL (4 × 2-3 @ 85-90%) → Box Jump or Broad Jump (4 × 3-5 BW) with 3-5 min between primary and explosive. This is a PAP pair, not separate exercises." },
            { role: "primary", description: "CONTRAST PAIR B: Heavy Hip Hinge variant (3 × 3-5) → Med Ball Overhead Scoop Toss (3 × 5) — second contrast pair targeting posterior chain power expression" },
            { role: "trunk", description: "Structural trunk: Pallof press anti-rotation + dead bug (2-3 sets each, low fatigue)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Speed-Strength — Olympic/Loaded Jump + Sprint",
          intent: "Speed-strength zone: moderate load at maximum velocity intent — bridges gym to track. Gym work supports sprint mechanics.",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "locomotion", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint/movement prep: 10 min — jog → dynamic drill series → 3 × 20m build-up strides at 70%, 85%, 95%" },
            { role: "power", description: "SPRINT BLOCK: Acceleration development — 5 × 10m + 4 × 20m sprints with 2 min full recovery. Every rep is 100% — if speed drops, rest longer." },
            { role: "primary", description: "SPEED-STRENGTH LIFT: Hang Power Clean or Trap Bar Jump (3-4 × 2-4 @ moderate load) — gym work that directly supports sprint force application. Maximum velocity intent every rep." },
            { role: "secondary", description: "Strength support: single-leg RDL or step-up (2-3 × 6-8) — posterior chain and unilateral stability" },
            { role: "trunk", description: "Anti-rotation trunk: Pallof press (2 × 10 each side)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Upper Power + Strength Support",
          intent: "Upper-body power expression + lower-body strength support; integrates rotational power for full athletic transfer",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "power", "trunk", "rotational"],
          cnsFlow: [
            { role: "prep", description: "Upper-body power prep: band pull-aparts, wall slides, med ball chest throw (2 × 5 sub-max)" },
            { role: "power", description: "UPPER POWER PAIR: Weighted push-up or explosive push-up (3 × 5) paired with med ball rotational throw (3 × 5 each side) — rotational and horizontal power expression" },
            { role: "primary", description: "Upper push compound: bench press or overhead press (4 × 3-5 @ 80-85%) — strength support for upper power output" },
            { role: "secondary", description: "Upper pull: row or chin-up variation (3 × 5-8) — structural balance" },
            { role: "trunk", description: "Rotational trunk: landmine rotation or cable chop (2 × 8 each side)" },
          ],
        },
      ];
    }

    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Power Development — Lower Contrast (PAP)",
          intent: "Heavy lower-body compound paired with maximal jump or sprint — PAP protocol: 4-8 min between primary and explosive to peak potentiation",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "trunk"],
          cnsFlow: [
            { role: "prep", description: "CNS activation: dynamic lower prep → 2 × broad jump sub-max → 1 × 30m build-up stride at 90%" },
            { role: "power", description: "PAP PAIR A: Back Squat (4 × 2-3 @ 85-93%) → 4-8 min rest → Vertical Jump max effort (3 reps). Time the jump at PAP peak (4-6 min post-lift)." },
            { role: "primary", description: "PAP PAIR B: Trap Bar Deadlift (3 × 2-3 @ 85%) → 4-5 min rest → Sprint Acceleration 20m (2 reps at 100%)" },
            { role: "trunk", description: "Structural trunk only: Pallof press + anti-extension plank (minimal fatigue — protect CNS for next session)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Sprint — Acceleration Development",
          intent: "Pure speed session: acceleration mechanics, 0-20m. Gym work comes AFTER sprint work — not before.",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Sprint warm-up: 10 min jog → A-skip 2 × 20m → B-skip 2 × 20m → high knees 2 × 20m → 3 × 30m build-ups at 70%, 85%, 95%" },
            { role: "power", description: "ACCELERATION BLOCK: 5-6 × 10m (standing start) + 4-5 × 20m acceleration with 2 min rest between every rep. Every rep is 100% — not conditioning, not intervals. Full recovery." },
            { role: "primary", description: "STRENGTH SUPPORT (post-sprint only): Trap Bar Deadlift or Hip Thrust (3 × 4-6) — posterior chain that supports sprint mechanics. Moderate load, not maximal." },
            { role: "secondary", description: "Unilateral strength: single-leg RDL (3 × 6 each side) — hamstring resilience for sprint demand" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Complex Training — Lower Power",
          intent: "Biomechanically linked heavy-explosive pairs: brief rest between primary and explosive distinguishes complex from contrast training",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Movement prep: hip hinge activation, hamstring mobility, Nordic lowering prep (2 × 4)" },
            { role: "power", description: "COMPLEX A: Front Squat or Hack Squat (4 × 3 @ 75-80%) → 45 sec rest → Depth Jump (4 × 3) — biomechanically linked squat-to-jump complex" },
            { role: "primary", description: "COMPLEX B: Hang Power Clean (4 × 3 @ 70-75%) → 45 sec rest → Med Ball Overhead Scoop Toss (4 × 5) — Olympic lift to triple extension power expression" },
            { role: "secondary", description: "Strength support: Nordic hamstring curl or RDL (2-3 × 6) — posterior chain resilience" },
            { role: "trunk", description: "Rotational trunk: landmine press + cable chop (2 × 8 each side)" },
          ],
        },
        {
          dayNumber: 4,
          identity: "Upper Power + Plyometric Integration",
          intent: "Upper-body power expression + plyometric block for vertical/horizontal force development; week-closing athletic transfer",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "power", "trunk", "rotational"],
          cnsFlow: [
            { role: "prep", description: "Upper power warm-up: band pull-aparts, explosive push-up (2 × 3 max intent), med ball chest throw (2 × 4)" },
            { role: "power", description: "PLYOMETRIC BLOCK: Box Jump (4 × 4) → Broad Jump (4 × 4) → Lateral Bound (3 × 4 each side) — 45-90 sec between exercises. Total foot contacts: 40-60. Power, not conditioning." },
            { role: "primary", description: "Upper push: Bench Press or Weighted Push-Up (4 × 3-5 @ 80-85%)" },
            { role: "secondary", description: "Upper pull: Weighted Pull-Up or Cable Row (3 × 5-8)" },
            { role: "trunk", description: "Anti-rotation + rotational trunk: Pallof press + medicine ball rotational throw finisher (2 × 5 each)" },
          ],
        },
      ];
    }
  }

  // ─── Speed goal: sprint-first architecture ───────────────────────────────────
  // Speed sessions: sprint work ALWAYS before gym work. No conditioning finishers.
  const isSpeed = !!(
    goal?.toLowerCase().includes("speed") ||
    goal?.toLowerCase().includes("sprint") ||
    goal?.toLowerCase().includes("acceleration")
  );

  if (isSpeed) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration Development + Strength Support",
          intent: "Sprint mechanics first — 0-20m acceleration focus. Gym strength work comes AFTER sprint work and supports sprint mechanics only.",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "hinge", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Sprint warm-up: 10 min jog → A-skip × 2 × 20m → B-skip × 2 × 20m → high knees × 2 → 3 × build-up strides at 70%, 85%, 95%" },
            { role: "power", description: "ACCELERATION BLOCK: 5 × 10m (3-point start or standing) + 4 × 20m acceleration. 90 sec minimum between 10m reps, 2 min between 20m reps. 100% intent every rep." },
            { role: "primary", description: "STRENGTH SUPPORT (post-sprint): Heavy hinge — Trap Bar Deadlift or Romanian DL (4 × 3-5) — hip extension strength that powers acceleration. NOT a speed exercise." },
            { role: "secondary", description: "Unilateral: single-leg RDL or step-up (3 × 6 each side) — single-leg posterior chain resilience" },
            { role: "trunk", description: "Anti-rotation trunk: Pallof press (2-3 × 10 each side)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Strength + Speed-Strength",
          intent: "Strength support day: heavier lifting and speed-strength work in the gym — prepares the system for next speed session",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "General prep: hip mobility, thoracic rotation, glute activation" },
            { role: "power", description: "SPEED-STRENGTH BLOCK: Hang Power Clean (4 × 3 @ 65-75%) or Trap Bar Jump (4 × 4 @ 20-30% load) — gym explosive work that bridges strength to sprint speed" },
            { role: "primary", description: "Squat compound: Back Squat or Front Squat (4 × 4-6 @ 75-82%) — lower-body force production foundation" },
            { role: "secondary", description: "Upper structural: Bench Press + Row (3 × 5-8 each) — maintains structural balance in a lower-dominant program" },
            { role: "trunk", description: "Trunk: dead bug or RKC plank (2-3 × 30-45 sec)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Max Velocity Development + Speed-Strength",
          intent: "Top-end speed: fly sprints after full warm-up. Gym work is supplementary to the sprint stimulus.",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Max velocity prep: 12 min — jog → drill series (A/B/C skip) → 4 × build-ups at 70%, 80%, 90%, 95%. Do NOT sprint at max before this." },
            { role: "power", description: "MAX VELOCITY BLOCK: 3-4 × (20m build + 20m fly) at absolute maximum. 4-5 min full rest between every rep. Max velocity budget: 80-100m at true top speed." },
            { role: "primary", description: "STRENGTH SUPPORT (post-sprint): Hip Thrust or Nordic Hamstring Curl (3 × 5-8) — posterior chain specific to sprint propulsion and injury resilience" },
            { role: "trunk", description: "Structural trunk: anti-extension + anti-rotation (2 sets each, low CNS cost)" },
          ],
        },
      ];
    }

    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration — 0-20m Sprint Mechanics",
          intent: "First-step power and acceleration mechanics: standing starts, 3-point starts, 10m and 20m reps with full recovery",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "hinge"],
          cnsFlow: [
            { role: "prep", description: "Sprint activation: 10 min warm-up → A-skip × 3 × 20m → broad jump × 3 sub-max → 3 × build-up strides" },
            { role: "power", description: "ACCELERATION: 6 × 10m (standing/3-point start) + 5 × 20m acceleration. 90 sec between 10m, 2 min between 20m. Every rep: 100%." },
            { role: "primary", description: "HINGE STRENGTH (post-sprint): Trap Bar Deadlift (4 × 3-5 @ 80-85%) — hip extension force application" },
            { role: "secondary", description: "Single-leg posterior chain: single-leg RDL (3 × 6 each side)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Strength — Lower + Speed-Strength",
          intent: "Strength training day — heavier compound loading with speed-strength component. No sprinting.",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "upper_push", "trunk"],
          cnsFlow: [
            { role: "prep", description: "General lower prep: hip mobility, glute activation, core activation sequence" },
            { role: "power", description: "SPEED-STRENGTH: Hang Power Clean or Trap Bar Jump (4 × 3 @ moderate load, maximum velocity intent) — bridges strength to sprint speed" },
            { role: "primary", description: "Squat: Back Squat (4 × 3-5 @ 80-87%) — strength foundation" },
            { role: "secondary", description: "Upper push + pull: Bench Press + Weighted Pull-Up (3 × 4-6 each) — structural balance" },
            { role: "trunk", description: "Trunk: Pallof press + dead bug (2 × each)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Max Velocity — Fly Sprints",
          intent: "Top-end speed: maximum velocity fly sprints with complete recovery. Not conditioning. Not intervals. One quality rep at a time.",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power"],
          cnsFlow: [
            { role: "prep", description: "Max velocity warm-up: 12 min — jog → A/B/C skip drill series × 2 → 4 × build-up strides at 70%, 80%, 90%, 95%" },
            { role: "power", description: "MAX VELOCITY: 4-5 × (20m build + 20m fly) at 100%. 4-5 min full recovery between each rep. True max-speed volume: 100-120m." },
            { role: "primary", description: "STRENGTH (post-sprint only): Hip Thrust (3 × 6-8) + Nordic Curl (2 × 4-6) — sprint-specific posterior chain protection" },
          ],
        },
        {
          dayNumber: 4,
          identity: "COD Speed + Upper Structural",
          intent: "Change of direction and reactive speed; upper-body structural strength for balance in lower-dominant speed program",
          neuralDemand: "moderate",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "lateral", "upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "COD prep: jog → lateral shuffle × 2 × 20m → backpedal × 2 → 5-10-5 drill at 60% × 2 → build-up strides × 2" },
            { role: "power", description: "COD BLOCK: 5-10-5 yard shuttle (5 reps) + T-drill (5 reps) with 90 sec recovery — deceleration mechanics and plant-and-drive" },
            { role: "primary", description: "Upper push: Bench Press or Overhead Press (3-4 × 5-8) — upper structural maintenance" },
            { role: "secondary", description: "Upper pull: Row or Chin-Up (3 × 5-8) — structural balance" },
            { role: "trunk", description: "Rotational + anti-rotation trunk: landmine rotation + Pallof press (2 × 8 each)" },
          ],
        },
      ];
    }
  }

  // ─── FOOTBALL — Acceleration + Force + Power + Repeat Effort ───────────────
  const isFootball = !!(sport && /\bfootball\b/i.test(sport) && !/soccer/.test(sport.toLowerCase()));
  if (isFootball) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration + Lower Force Production",
          intent: "Sprint mechanics (0–20m) + bilateral lower-body strength — the two defining football physical qualities",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["locomotion", "squat", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint activation: 10 min — A-skip × 2 × 20m → broad jump × 3 sub-max → build-up strides × 3 at 70%, 85%, 95%" },
            { role: "power", description: "ACCELERATION: 5 × 10m + 4 × 20m with 90 sec between 10m and 2 min between 20m. 100% effort every rep. Standing or 3-point start." },
            { role: "primary", description: "LOWER FORCE: Heavy bilateral compound — Back Squat or Trap Bar Deadlift (4 × 3-5 @ 80-87%). The strength foundation for collision and acceleration." },
            { role: "secondary", description: "Posterior chain support: Romanian DL or Hip Thrust (3 × 5-8) — hamstring and glute resilience for sprint demand" },
            { role: "trunk", description: "Collision trunk: Pallof press (3 × 10 each side) + Farmer Carry (3 × 30m) — trunk bracing for contact" },
          ],
          sportNotes: "Football: Acceleration + heavy lower on the same day — force application in the gym mirrors force application on the field",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Strength",
          intent: "Horizontal press and pull balance for collision-ready upper body — NOT bodybuilding volume",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "rotational"],
          cnsFlow: [
            { role: "prep", description: "Upper prep: scapular activation, band pull-apart × 3 × 15, wall slide × 2 × 10" },
            { role: "power", description: "EXPLOSIVE PUSH: Med ball chest throw (4 × 5) or explosive push-up (4 × 4) — upper power for shedding blocks and contact" },
            { role: "primary", description: "Horizontal press: Bench Press or Dumbbell Press (4 × 4-6 @ 80%) — collision-ready chest and shoulder development" },
            { role: "secondary", description: "Horizontal pull: Bent-Over Row or Cable Row (4 × 5-8) — scapular stability and shoulder health balance" },
            { role: "trunk", description: "Rotational trunk: Landmine Rotation (3 × 8 each) + Pallof Press (2 × 10 each side)" },
          ],
          sportNotes: "Football upper: balanced press/pull — contact athletes cannot have press-dominant upper body imbalance",
        },
        {
          dayNumber: 3,
          identity: "Power Development + Repeat Effort",
          intent: "Contrast training and plyometrics for rate of force development; anaerobic repeat effort conditioning — football-specific",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "hinge", "trunk", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Power activation: dynamic lower prep → box jump (2 × 3 sub-max)" },
            { role: "power", description: "CONTRAST PAIR: Trap Bar DL or Hex Bar DL (4 × 2-3 @ 85-90%) → Box Jump or Broad Jump (4 × 4) with 4 min between primary and jump — PAP potentiation" },
            { role: "primary", description: "SECOND POWER PAIR: Heavy Sled Push (4 × 20m) → Med Ball Overhead Scoop Toss (4 × 5) — force application transfer" },
            { role: "secondary", description: "Nordic Hamstring Curl (3 × 4-6) — mandatory for sprint resilience" },
            { role: "trunk", description: "CONDITIONING FINISHER: REPEAT EFFORT — 6–8 × 20m sprints at 100% with 90 sec rest. ANAEROBIC CAPACITY, not endurance. 2 min between sets of 3." },
          ],
          sportNotes: "Football power day: contrast pairs for RFD + anaerobic repeat effort conditioning — NOT aerobic endurance conditioning",
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration + Lower Force Production",
          intent: "Sprint mechanics + heavy bilateral lower strength — the foundation football session",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["locomotion", "squat", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint prep: 10 min — A-skip + B-skip + build-up strides × 3" },
            { role: "power", description: "ACCELERATION: 6 × 10m + 5 × 20m with full recovery. 3-point or standing start. 100% every rep." },
            { role: "primary", description: "Back Squat or Trap Bar DL (4 × 3-5 @ 82-88%) — lower force production foundation" },
            { role: "secondary", description: "Romanian DL or Nordic Hamstring Curl (3 × 5-8) — posterior chain resilience" },
            { role: "trunk", description: "Pallof Press (3 × 10 each) + Loaded Carry (3 × 30m)" },
          ],
          sportNotes: "Football Day 1: Sprint before lifting — always. Acceleration mechanics are the highest priority.",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Strength",
          intent: "Bilateral upper pressing + pulling balance — structural strength for collision sport demands",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Upper activation: scapular prep, band pull-apart, face pull warm-up" },
            { role: "power", description: "Med Ball Chest Throw (4 × 5) — explosive horizontal power for contact" },
            { role: "primary", description: "Bench Press (4 × 4-6 @ 80%) + Incline Dumbbell Press (3 × 6-8) — collision upper strength" },
            { role: "secondary", description: "Barbell Row + Face Pull (4 × 6-8 each) — scapular balance and shoulder health" },
            { role: "trunk", description: "Landmine Rotation (3 × 8 each side) — rotational trunk for contact sport demands" },
          ],
          sportNotes: "Football upper: equal pressing and pulling volume — contact sport demands balanced shoulder health",
        },
        {
          dayNumber: 3,
          identity: "Power Development — Contrast + Plyometric",
          intent: "Rate of force development via contrast pairs and plyometrics — explosive performance for play initiation",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "CNS prep: broad jump × 3 sub-max → A-skip × 20m → build-up stride × 1" },
            { role: "power", description: "CONTRAST PAIR A: Front Squat (4 × 3 @ 80%) → Box Jump (4 × 4 BW) with 4 min PAP window" },
            { role: "primary", description: "CONTRAST PAIR B: Power Clean or Hang Clean (4 × 3 @ 70-75%) → Med Ball Overhead Scoop Toss (4 × 5)" },
            { role: "secondary", description: "Unilateral power: Split Squat jump or Step-Up (2 × 5 each side) — single-leg force application" },
            { role: "trunk", description: "Anti-rotation: Pallof Press + Dead Bug (2-3 sets each)" },
          ],
          sportNotes: "Football power: contrast pairs develop the RFD needed for explosive play — acceleration off the line mirrors PAP mechanics",
        },
        {
          dayNumber: 4,
          identity: "Repeat Effort Conditioning + Posterior Chain Tissue",
          intent: "Anaerobic capacity conditioning (football-specific) + posterior chain tissue support — resilience and conditioning",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["locomotion", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Movement prep: jog + dynamic drill series + deceleration mechanic drill" },
            { role: "power", description: "FOOTBALL CONDITIONING: REPEAT SPRINT ABILITY — 3 sets × 5 × 20m sprints with 20 sec intra-set rest and 3 min between sets. 100% sprint effort. NOT endurance conditioning." },
            { role: "primary", description: "Posterior chain tissue: Romanian DL (3 × 8-10) + Hip Thrust (3 × 10) — hamstring and glute maintenance for sprint demand" },
            { role: "secondary", description: "Nordic Hamstring Curl (3 × 5-8) — mandatory hamstring resilience. Non-negotiable for sprint athletes." },
            { role: "trunk", description: "Loaded Carry complex: Farmer carry + Cross-body carry (3 × 30m each) — trunk integrity under fatigue" },
          ],
          sportNotes: "Football conditioning: SHORT sprints with FULL rest — NOT soccer-style long aerobic work. Football repeat effort is anaerobic.",
        },
      ];
    }
  }

  // ─── BASKETBALL — Reactive Power + Decel + Upper Balance + Repeat Power ─────
  const isBasketball = !!(sport && /basketball/i.test(sport));
  if (isBasketball) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Reactive Plyometric + Lower Strength",
          intent: "Vertical and horizontal power via reactive jumps; bilateral lower strength as the force foundation — highest CNS session of the week",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "CNS jump prep: 2 × box step-up → 3 × sub-max countermovement jump → lateral shuffle × 2" },
            { role: "power", description: "REACTIVE PLYOMETRIC BLOCK: Box Jump (4 × 4) → Broad Jump (4 × 4) — maximum height/distance intent every rep. 90 sec between exercises." },
            { role: "primary", description: "Trap Bar Deadlift or Goblet Squat (4 × 4-6) — joint-friendly bilateral lower strength for vertical power foundation" },
            { role: "secondary", description: "RFESS or Single-Leg Squat (3 × 6 each side) — single-leg basketball-specific loading" },
            { role: "trunk", description: "Anti-extension + anti-rotation: Dead Bug (3 × 8) + Pallof Press (3 × 10 each)" },
          ],
          sportNotes: "Basketball Day 1: Jumps first — explosive quality must be fresh. Trap bar DL over barbell squat for joint-friendly bilateral loading.",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural + Trunk",
          intent: "Press/pull balance for shoulder health; rotational and anti-rotation trunk for contact and landing stability",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "rotational"],
          cnsFlow: [
            { role: "prep", description: "Upper activation: band pull-apart × 3, wall slide × 2, thoracic extension" },
            { role: "power", description: "Med Ball Rotational Throw (3 × 5 each) or Chest Throw — upper rotational power for contact and outlet passes" },
            { role: "primary", description: "Dumbbell Press (4 × 6-8) — shoulder-health-conscious horizontal press" },
            { role: "secondary", description: "Chin-Up or Cable Row (4 × 6-8) — matching pull volume for shoulder joint health" },
            { role: "trunk", description: "Rotational trunk: Cable Chop (3 × 8 each) + Copenhagen Plank (3 × 20-30 sec each) — adductor and groin resilience" },
          ],
          sportNotes: "Basketball upper: shoulder health priority — dumbbell over barbell for joint tolerance; face pull in warm-up; balanced push:pull",
        },
        {
          dayNumber: 3,
          identity: "Deceleration + Landing Mechanics + Repeat Power Conditioning",
          intent: "Landing mechanics and reactive deceleration — distinct from pure strength; basketball conditioning: repeat power efforts, NOT aerobic endurance",
          neuralDemand: "moderate",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "unilateral_lower", "lateral", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Movement prep: lateral shuffle × 2 × 20m → backpedal → decel pattern × 2" },
            { role: "power", description: "DECELERATION + ELASTIC: Depth Jump (3 × 4) — land and IMMEDIATELY jump. Contact time is the metric. Then Lateral Bound (3 × 4 each side)" },
            { role: "primary", description: "Nordic Hamstring Curl (3 × 5-8) + Single-Leg RDL (3 × 8 each) — tendon resilience and hamstring load tolerance" },
            { role: "trunk", description: "CONDITIONING: REPEAT POWER — 6–8 × court sprint (baseline to half and back) at 100% with 60 sec rest. NOT endurance — explosive court transitions." },
          ],
          sportNotes: "Basketball: deceleration and landing mechanics are as important as acceleration — this session trains the qualities that prevent patellar tendon and ACL injuries",
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Reactive Plyometric + Lower Strength",
          intent: "Vertical power first — jumps before lifting. Bilateral lower strength as the power foundation.",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Jump prep: 3 × sub-max CMJ → 2 × broad jump" },
            { role: "power", description: "BOX JUMP (4 × 4) → BROAD JUMP (4 × 4). Maximum height/distance. 90 sec between each exercise. Step down from box every time." },
            { role: "primary", description: "Trap Bar Deadlift (4 × 4-6 @ 75-82%) — foundational lower strength" },
            { role: "secondary", description: "RFESS (3 × 6 each side) — single-leg stability and asymmetry management" },
            { role: "trunk", description: "Copenhagen Plank (3 × 20-30 sec each side) + Dead Bug (3 × 8)" },
          ],
          sportNotes: "Basketball: Box jump before the heavy lift — CNS must be fresh for reactive power expression",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural + Shoulder Health",
          intent: "Balanced pressing and pulling for shoulder joint longevity — NOT hypertrophy focus",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Shoulder prep: band pull-apart × 20 + face pull × 15 + wall slide × 10" },
            { role: "primary", description: "Dumbbell Press (4 × 6-8) + Landmine Press (3 × 8 each) — joint-friendly pressing patterns" },
            { role: "secondary", description: "Weighted Chin-Up (4 × 5-8) + Face Pull (3 × 15) — pull volume equals press volume for shoulder health" },
            { role: "trunk", description: "Rotational + anti-rotation: Pallof Press (3 × 10 each) + Cable Chop (3 × 8 each)" },
          ],
          sportNotes: "Basketball upper: equal push:pull volume — shoulder health determines career longevity",
        },
        {
          dayNumber: 3,
          identity: "Deceleration + Landing + Elastic Power",
          intent: "Landing mechanics, stretch-shortening cycle at full intensity, single-leg resilience — distinct from Day 1 plyometric emphasis",
          neuralDemand: "moderate",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "unilateral_lower", "lateral", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Decel prep: snap-down drill × 3 → lateral shuffle → backpedal break mechanic × 3" },
            { role: "power", description: "DEPTH JUMP (3 × 4) — step off, land, IMMEDIATELY jump. Develops elastic SSC. LATERAL BOUND (3 × 4 each) — reactive lateral power for defensive movements." },
            { role: "primary", description: "Nordic Hamstring Curl (3 × 5-6) — tendon resilience mandatory for basketball athletes" },
            { role: "secondary", description: "Single-Leg Squat or Pistol Squat (3 × 5-8 each side) — unilateral vertical force" },
            { role: "trunk", description: "Anti-rotation: Half-Kneeling Pallof + Copenhagen Plank (2-3 sets each)" },
          ],
          sportNotes: "Basketball deceleration day: teaches the landing mechanics and deceleration capacity that prevent patellar tendon and ACL injuries",
        },
        {
          dayNumber: 4,
          identity: "Repeat Power Conditioning + Mobility Support",
          intent: "Basketball-specific conditioning: repeat explosive efforts, NOT long aerobic work; mobility and tissue maintenance",
          neuralDemand: "moderate",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "lateral", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Court prep: jog → lateral shuffle × 2 → 3-cone drill at 60% × 2" },
            { role: "power", description: "BASKETBALL CONDITIONING: 8 × court sprint (full court and back) at 100% with 45-60 sec rest. EXPLOSIVE — not a jog. Add line drill complex if court available." },
            { role: "secondary", description: "Hip Thrust (3 × 10) + Calf Raise (3 × 15) — posterior chain and ankle tendon maintenance for jump athletes" },
            { role: "trunk", description: "Mobility: hip flexor stretch, ankle mobility, thoracic rotation + light core maintenance" },
          ],
          sportNotes: "Basketball conditioning: short explosive court efforts with full rest — mirrors game demands. NOT aerobic endurance.",
        },
      ];
    }
  }

  // ─── SOCCER — Aerobic + RSA + Hamstring Resilience + Tissue Protection ──────
  const isSoccer = !!(sport && /soccer|association football/i.test(sport));
  if (isSoccer) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration + Hamstring Resilience",
          intent: "Sprint mechanics (0–20m) + Nordic curl and single-leg posterior chain — addresses the two most common soccer injury vectors in one session",
          neuralDemand: "high",
          primaryPattern: "hinge",
          emphasizedPatterns: ["locomotion", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint warm-up: 10 min jog → A-skip × 2 × 20m → high knees × 2 × 20m → build-up strides × 3 at 70%, 85%, 95%" },
            { role: "power", description: "ACCELERATION: 5 × 10m + 4 × 20m with 90 sec between 10m, 2 min between 20m. 100% effort." },
            { role: "primary", description: "HAMSTRING RESILIENCE: Nordic Hamstring Curl (3 × 5-8) — MANDATORY for soccer. Non-negotiable tissue protection." },
            { role: "secondary", description: "Single-Leg RDL (3 × 8-10 each side) + Hip Thrust (3 × 10) — posterior chain tissue loading for sprint resilience" },
            { role: "trunk", description: "ADDUCTOR: Copenhagen Plank (3 × 20-30 sec each side) — mandatory. Adductor injuries are the second-highest soccer injury type." },
          ],
          sportNotes: "Soccer Day 1: Nordic curl and Copenhagen plank are mandatory — these are the highest-ROI injury prevention tools for soccer athletes",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural + Trunk + Single-Leg Support",
          intent: "Upper strength balance + rotational trunk + unilateral lower support — structural maintenance in a lower-dominant sport",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "General activation: hip mobility, thoracic rotation, shoulder prep" },
            { role: "primary", description: "Upper push + pull: Bench Press or Dumbbell Press (3 × 6-8) + Bent Row (3 × 6-8) — structural balance for aerial duels and contact" },
            { role: "secondary", description: "Vertical pull: Chin-Up or Lat Pulldown (3 × 8-10) + Face Pull (3 × 15) — scapular health" },
            { role: "trunk", description: "Rotational trunk: Pallof Press (3 × 10 each) + Lateral Lunge (3 × 8 each side) — adductor and COD support" },
          ],
          sportNotes: "Soccer upper: relatively low volume — focus on structural balance for aerial duels and shoulder health",
        },
        {
          dayNumber: 3,
          identity: "Repeat Sprint Conditioning + Lower Tissue",
          intent: "RSA conditioning: the most sport-specific soccer session — sprint repeats with incomplete recovery + calf and adductor tissue maintenance",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "hinge", "lateral"],
          cnsFlow: [
            { role: "prep", description: "RSA warm-up: 5 min jog → dynamic drill series → 3 × 30m build-up strides" },
            { role: "power", description: "REPEAT SPRINT ABILITY: 3 sets × 5 × 20-30m sprints with 20 sec intra-set rest and 3 min between sets. This is NOT conditioning circuits. Real sprint effort, real work:rest." },
            { role: "secondary", description: "AEROBIC SUPPORT: 15 min run at 65-70% max HR following RSA work — aerobic base underpins sprint recovery" },
            { role: "trunk", description: "Lower tissue maintenance: Calf Raise (3 × 15) + Copenhagen Plank (2 × 30 sec each) — mandatory every session" },
          ],
          sportNotes: "Soccer RSA day: real sprint intervals with real rest — NOT circuits. Soccer repeat sprint ability is the most sport-defining quality.",
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration + Hamstring Resilience",
          intent: "Sprint mechanics + Nordic curl + posterior chain tissue — the most important soccer injury prevention session",
          neuralDemand: "high",
          primaryPattern: "hinge",
          emphasizedPatterns: ["locomotion", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint prep: 10 min warm-up → A-skip + high knees → build-up strides × 3" },
            { role: "power", description: "ACCELERATION: 5 × 10m + 5 × 20m with full rest. Every rep 100%." },
            { role: "primary", description: "Nordic Hamstring Curl (4 × 5-8) — mandatory every lower session in soccer. Most common soccer injury prevention." },
            { role: "secondary", description: "Single-Leg RDL (3 × 8 each side) + Hip Thrust (3 × 10) — posterior chain resilience" },
            { role: "trunk", description: "Copenhagen Plank (3 × 25 sec each side) — mandatory. Adductor resilience." },
          ],
          sportNotes: "Soccer: Nordic curl + Copenhagen plank are mandatory in EVERY lower session — not optional, not substitutable",
        },
        {
          dayNumber: 2,
          identity: "Aerobic Base / Tempo + Lower Tissue Support",
          intent: "Dedicated aerobic conditioning + adductor/calf tissue maintenance — soccer aerobic base is non-negotiable",
          neuralDemand: "low",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Easy warm-up: 5 min jog + dynamic stretching + calf activation" },
            { role: "primary", description: "AEROBIC BASE: 25-35 min steady-state run at 65-73% max HR OR 4 × 6 min at 80-85% HR (lactate threshold) with 3 min rest. Soccer demands aerobic capacity for 90 minutes." },
            { role: "secondary", description: "Calf Raise (3 × 15) + Tibialis Raise (2 × 15) — calf and ankle tissue maintenance for running volume" },
            { role: "trunk", description: "Copenhagen Plank (2 × 20 sec each side) + Lateral Lunge (2 × 8 each side) — adductor maintenance session" },
          ],
          sportNotes: "Soccer aerobic day: real running conditioning. 10-13km per game demands this foundation. No lifting today — full aerobic development.",
        },
        {
          dayNumber: 3,
          identity: "Upper Structural + Trunk + Single-Leg",
          intent: "Upper strength balance + lower unilateral strength support + trunk — structural maintenance week",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "General prep: hip flexor stretch, thoracic rotation, shoulder warm-up" },
            { role: "primary", description: "Dumbbell Press (3 × 8) + Bent Row (3 × 8) — balanced upper structural strength" },
            { role: "secondary", description: "Chin-Up (3 × 8) + Lateral Lunge (3 × 8 each side) — upper pull + adductor strength" },
            { role: "trunk", description: "Pallof Press (3 × 10 each) + Single-Leg Squat (3 × 8 each side) — anti-rotation trunk + single-leg strength" },
          ],
          sportNotes: "Soccer upper day: moderate volume — structural balance for heading duels and collision resilience without fatiguing the lower body",
        },
        {
          dayNumber: 4,
          identity: "Repeat Sprint Conditioning + Lower Tissue",
          intent: "RSA: the most sport-specific soccer conditioning — sprint repeats with partial rest + posterior chain/adductor tissue protection",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "hinge", "lateral"],
          cnsFlow: [
            { role: "prep", description: "RSA prep: 5 min jog → dynamic drill → 3 × build-up strides" },
            { role: "power", description: "REPEAT SPRINT ABILITY: 4 sets × 4 × 20-30m sprint with 20 sec between reps and 3 min between sets. 100% sprint effort. Full rest between sets." },
            { role: "secondary", description: "Nordic Hamstring Curl (3 × 5-8) — maintained even on conditioning days — hamstring protection is highest priority" },
            { role: "trunk", description: "Copenhagen Plank (2 × 25 sec each) + Calf Raise (3 × 15) — tissue maintenance after sprint load" },
          ],
          sportNotes: "Soccer RSA day: sprint intervals with partial recovery — the most sport-specific quality for soccer performance and game endurance",
        },
      ];
    }
  }

  // ─── BASEBALL — Rotational Power + Arm Care + Short Acceleration ─────────────
  const isBaseball = !!(sport && /baseball|softball/i.test(sport));
  if (isBaseball) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Rotational Power + Lower Strength",
          intent: "Med ball rotational throws + trap bar DL — the two most important physical qualities for baseball athletes",
          neuralDemand: "high",
          primaryPattern: "rotational",
          emphasizedPatterns: ["rotational", "hinge", "squat", "power", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Rotational prep: hip rotation mobility → band hip flexor → rotational med ball throw × 3 sub-max" },
            { role: "power", description: "ROTATIONAL POWER: Med Ball Rotational Throw (4 × 6 each side) at maximum effort — hip-driven rotation. Then Med Ball Overhead Scoop Toss (4 × 5) for posterior chain power." },
            { role: "primary", description: "LOWER STRENGTH: Trap Bar Deadlift (4 × 4-6 @ 78-85%) — bilateral posterior chain without high lumbar stress" },
            { role: "secondary", description: "Single-Leg RDL (3 × 8 each side) — unilateral posterior chain for throwing stride and fielding stance resilience" },
            { role: "trunk", description: "ANTI-ROTATION: Pallof Press (3 × 10 each side) + Landmine Rotation (3 × 8 each) — trunk stiffness converts hip rotation to power" },
          ],
          sportNotes: "Baseball: med ball rotational throw is as important as any barbell exercise. This session is the foundation of batting and throwing power.",
        },
        {
          dayNumber: 2,
          identity: "Arm-Care Upper + Shoulder Balance",
          intent: "Pressing and pulling balance with mandatory shoulder care — arm-care-conscious upper development for throwing sport athletes",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "ARM CARE PREP: Band pull-apart × 20 + Face Pull × 15 + External rotation drill × 10 each side — MANDATORY every upper session" },
            { role: "primary", description: "PULL-DOMINANT UPPER: Weighted Chin-Up or Cable Row (4 × 6-8) — scapular strength and shoulder health first" },
            { role: "secondary", description: "PRESS BALANCED: Landmine Press (3 × 8 each side) or Dumbbell Press (3 × 8) — arm-care-conscious press. NOT heavy barbell overhead for pitchers." },
            { role: "trunk", description: "SCAPULAR + ROTATOR: Y/T/W Band Work (2 × 10 each) + Face Pull (3 × 15) — scapular upward rotation and retraction for throwing health" },
          ],
          sportNotes: "Baseball upper: arm care is the HIGHEST priority. Face pull and external rotation are mandatory. Pull volume ≥ push volume. Never press-dominant for pitchers.",
        },
        {
          dayNumber: 3,
          identity: "Acceleration + Med Ball + Unilateral",
          intent: "Short sprint acceleration (0–30m) + med ball power + single-leg strength — sport-transfer session",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "rotational", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Sprint + power prep: jog → build-up strides × 3 → sub-max broad jump × 2" },
            { role: "power", description: "ACCELERATION: 5 × 20m + 4 × 30m sprints with full rest — baserunning and fielding sprint mechanics. Short, not distance." },
            { role: "primary", description: "ROTATIONAL POWER: Med Ball Rotational Throw (4 × 5 each side) + Med Ball Slam (3 × 5) — power expression without barbell loading" },
            { role: "secondary", description: "RFESS (3 × 8 each side) + Calf Raise (3 × 15) — unilateral lower for fielding stance and baserunning" },
            { role: "trunk", description: "CONDITIONING: 8–10 × 20-30m sprints at 100% with 90 sec rest — baseball work capacity. SHORT. Not aerobic endurance." },
          ],
          sportNotes: "Baseball: short sprint acceleration (not distance running). Med ball rotational throws are the conditioning of baseball — they build the rotational power that defines the sport.",
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Rotational Power + Lower Strength",
          intent: "Hip-driven rotational power via med ball + bilateral lower strength — the foundation of hitting and throwing",
          neuralDemand: "high",
          primaryPattern: "rotational",
          emphasizedPatterns: ["rotational", "hinge", "squat", "power", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Rotational activation: hip rotation drills → sub-max med ball throw × 3" },
            { role: "power", description: "ROTATIONAL POWER: Med Ball Rotational Throw (5 × 5 each side) at max effort → Med Ball Overhead Scoop Toss (4 × 5)" },
            { role: "primary", description: "Trap Bar Deadlift (4 × 4-6 @ 80-85%) — bilateral posterior chain foundation" },
            { role: "secondary", description: "Single-Leg RDL (3 × 8 each side) — unilateral posterior chain resilience" },
            { role: "trunk", description: "Pallof Press (3 × 10 each) + Landmine Rotation (3 × 8 each) — anti-rotation and rotational trunk" },
          ],
          sportNotes: "Baseball Day 1: Rotational power is the highest priority — med ball work comes first",
        },
        {
          dayNumber: 2,
          identity: "Arm-Care Upper + Shoulder Balance",
          intent: "Pull-dominant upper strength + mandatory rotator cuff and scapular care — throwing sport demands this every session",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "upper_push", "trunk"],
          cnsFlow: [
            { role: "prep", description: "ARM CARE: Band pull-apart × 20 + Face Pull × 15 + External Rotation × 10 each — mandatory before any loading" },
            { role: "primary", description: "Weighted Chin-Up (4 × 5-8) + Barbell Row (4 × 6-8) — pull strength foundation" },
            { role: "secondary", description: "Landmine Press (3 × 8 each) or Dumbbell Press (3 × 8) — press with arm-care constraint" },
            { role: "trunk", description: "Y/T/W scapular (2 × 10 each) + Face Pull (3 × 15) + External Rotation Stretch" },
          ],
          sportNotes: "Baseball arm care: face pull and external rotation every single upper session. This is non-negotiable for shoulder longevity.",
        },
        {
          dayNumber: 3,
          identity: "Acceleration + Med Ball Power",
          intent: "Short sprint acceleration + additional rotational med ball work — sport-specific power transfer session",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "rotational", "power", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Sprint + power prep: jog → build-up strides × 3 → sub-max broad jump × 2" },
            { role: "power", description: "ACCELERATION: 6 × 20m + 5 × 30m with full rest — 100% effort, baserunning mechanics" },
            { role: "primary", description: "Med Ball Power Circuit: Rotational Throw (4 × 5 each) + Med Ball Slam (3 × 5) + Chest Throw (3 × 5) — multi-plane power expression" },
            { role: "secondary", description: "RFESS (3 × 8 each) + Step-Up (2 × 10 each) — fielding stance and baserunning single-leg strength" },
          ],
          sportNotes: "Baseball acceleration: 0-30m only. Baserunners never need max velocity — acceleration is the only sprint quality that matters.",
        },
        {
          dayNumber: 4,
          identity: "Trunk / Scapular / Tissue Support",
          intent: "Anti-rotation trunk integrity, scapular control, unilateral resilience — injury prevention and power transfer architecture",
          neuralDemand: "low",
          primaryPattern: "trunk",
          emphasizedPatterns: ["trunk", "upper_pull", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Mobility: hip rotation, thoracic rotation, shoulder flexion + extension" },
            { role: "primary", description: "SCAPULAR WORK: Y/T/W (3 × 10 each) + Serratus Press (3 × 12) + Band External Rotation (3 × 15 each) — throwing health maintenance" },
            { role: "secondary", description: "TRUNK: Pallof Press (4 × 10 each side) + Half-Kneeling Cable Chop (3 × 8 each) + Dead Bug (3 × 8) — stiffness for rotation power transfer" },
            { role: "trunk", description: "CONDITIONING: 8-10 × 20m sprints with 90 sec rest OR Assault Bike 4 × 30 sec at max with 2 min rest — brief work capacity, NOT aerobic endurance" },
          ],
          sportNotes: "Baseball tissue day: shoulder health maintenance + trunk integrity. This session prevents the injuries that end baseball careers.",
        },
      ];
    }
  }

  // ─── Generic isSportConditioning fallback (rugby, lacrosse, other field sports)
  const isSportConditioning = !!(sport && (
    sport.toLowerCase().includes("rugby") ||
    sport.toLowerCase().includes("lacrosse") ||
    sport.toLowerCase().includes("volleyball")
  ));

  if (isSportConditioning && daysPerWeek >= 4) {
    const strengthDays = buildSessionsForDayCount(daysPerWeek - 1, sport, "athletic_performance");
    return [
      ...strengthDays.slice(0, daysPerWeek - 1),
      {
        dayNumber: daysPerWeek,
        identity: "Sport-Specific Conditioning — RSA + Energy Systems",
        intent: "Standalone sport conditioning session: repeat sprint ability + energy system development specific to the sport's demands. Real intervals, real work:rest.",
        neuralDemand: "high",
        primaryPattern: "locomotion",
        emphasizedPatterns: ["locomotion", "power", "lateral"],
        cnsFlow: [
          { role: "prep", description: "8 min dynamic prep: jog + dynamic drills + 2 × 20m build-up strides" },
          { role: "primary", description: "REPEAT SPRINT ABILITY: 2–4 sets × 4–6 sprints @ 20–30m with 20 sec intra-set rest and 2–3 min between sets. Full sprint speed every rep." },
          { role: "secondary", description: "SECONDARY ENERGY SYSTEM: Aerobic base or lactate threshold work — 15–20 min at appropriate intensity to complement RSA" },
          { role: "trunk", description: "Movement quality and recovery work" },
        ],
        sportNotes: `Sport-specific conditioning block — mirrors the repeat sprint and aerobic demands of ${sport} competition`,
      },
    ];
  }

  if (daysPerWeek === 2) {
    return [
      {
        dayNumber: 1,
        identity: "Lower Force Production + Upper Push",
        intent: "Build bilateral lower-body force via squat dominance + horizontal upper pressing strength",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "upper_push", "power", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "upper_push", "power", "trunk"], "high"),
        sportNotes: isHockey ? "Bias lateral drive mechanics off squat; include hip flexor control" : undefined,
      },
      {
        dayNumber: 2,
        identity: "Posterior Chain + Upper Pull + Integration",
        intent: "Develop posterior chain capacity via hinge, balance the pressing week with horizontal pull, integrate unilateral control",
        neuralDemand: "moderate",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "upper_pull", "unilateral_lower", "trunk", "rotational"],
        cnsFlow: buildCNSFlow(["hinge", "upper_pull", "unilateral_lower", "rotational"], "moderate"),
        sportNotes: isHockey ? "Rotational trunk work essential; single-leg RDL for edge mechanics" : undefined,
      },
    ];
  }

  if (daysPerWeek === 3) {
    // Variant B: Hinge-first / posterior-chain-emphasis 3-day split
    if ((variationSeed ?? 0) % 2 === 1) {
      return [
        {
          dayNumber: 1,
          identity: "Hinge-Dominant Lower + Posterior Chain Power",
          intent: "Deadlift-pattern force production as the weekly base; posterior chain capacity and reactive power expression",
          neuralDemand: "high",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "power", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "power", "unilateral_lower", "trunk"], "high"),
          sportNotes: isHockey ? "RDL + single-leg RDL for edge mechanics; reactive bound after hinge warm-up" : undefined,
        },
        {
          dayNumber: 2,
          identity: "Horizontal Push + Shoulder Structural Health",
          intent: "Bench press or dumbbell press as the force baseline; overhead pressing for shoulder resilience; upper trunk anti-extension",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "trunk"], "moderate"),
          sportNotes: isHockey ? "Landmine press for rotational load transfer; face pull between sets" : undefined,
        },
        {
          dayNumber: 3,
          identity: "Squat + Upper Pull Integration",
          intent: "Bilateral squat strength as the lower anchor; vertical and horizontal pull for structural balance; unilateral coordination",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "upper_pull", "unilateral_lower", "rotational", "trunk"],
          cnsFlow: buildCNSFlow(["squat", "upper_pull", "unilateral_lower", "rotational"], "high"),
          sportNotes: isHockey ? "Lateral squat variant; weighted chin-up; Copenhagen plank for groin health" : undefined,
        },
      ];
    }
    return [
      {
        dayNumber: 1,
        identity: "Lower Force Production + Power",
        intent: "Bilateral force production via squat strength + vertical/horizontal power output; trunk stiffness under load",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high"),
        sportNotes: isHockey ? "Lateral bound before squats; RFESS for single-leg transfer; Pallof press for anti-rotation" : undefined,
      },
      {
        dayNumber: 2,
        identity: "Upper Strength + Structural Balance",
        intent: "Horizontal press and pull strength; scapular and shoulder integrity; upper trunk support",
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
        cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "trunk"], "moderate"),
        sportNotes: isHockey ? "Bias overhead pressing; rotational med ball work; face pull for shoulder cuff" : undefined,
      },
      {
        dayNumber: 3,
        identity: "Full Body Power + Posterior Chain Integration",
        intent: "Full-body integration of force production with posterior chain and unilateral work; reactive and elastic power",
        neuralDemand: "high",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "power", "unilateral_lower", "lateral", "trunk", "rotational"],
        cnsFlow: buildCNSFlow(["hinge", "power", "unilateral_lower", "lateral", "rotational"], "high"),
        sportNotes: isHockey ? "Reactive lateral bounds; single-leg RDL; lateral lunge; Copenhagen plank" : undefined,
      },
    ];
  }

  if (daysPerWeek === 4) {
    if (isHockey) {
      return [
        {
          dayNumber: 1,
          identity: "Lower Force Production + Acceleration Mechanics",
          intent: "Bilateral squat strength as the force production base; single-leg positional control; trunk stiffness for edge and change-of-direction",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk", "lateral"],
          cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "lateral", "trunk"], "high"),
          sportNotes: "Lateral bound before squats; RFESS or lateral step-up for edge transfer; Pallof press anti-rotation for body contact stability",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Strength + Rotational Power",
          intent: "Press and pull balance for structural integrity; rotational power and trunk anti-rotation as hockey-specific overlay",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "rotational", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "rotational", "trunk"], "moderate"),
          sportNotes: "Med ball rotational throw before pressing; landmine press as sport-specific horizontal force; face pull / band external rotation for cuff tolerance",
        },
        {
          dayNumber: 3,
          identity: "Posterior Chain + Unilateral Control + Elastic Power",
          intent: "Hinge-dominant posterior chain development; single-leg stability under fatigue; reactive power expression",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "power", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "power", "lateral", "trunk"], "moderate"),
          sportNotes: "Single-leg RDL for posterior chain + balance; lateral lunge for adductor resilience; Copenhagen plank; snap-down drill for deceleration mechanics",
        },
        {
          dayNumber: 4,
          identity: "Full Body Integration + Power Expression",
          intent: "Full-system integration — power output + compound strength + unilateral coordination + trunk under fatigue; athletic transfer session",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "lateral", "rotational", "trunk", "unilateral_lower"],
          cnsFlow: buildCNSFlow(["power", "squat", "lateral", "rotational", "trunk"], "high"),
          sportNotes: "Broad jump + lateral bound pairing; sled push or acceleration drill; rotational med ball; carry complex for trunk under locomotion",
        },
      ];
    }

    // Variant B: Upper/Lower split emphasis — pull-dominant Day 2, power-focused Day 3
    if ((variationSeed ?? 0) % 2 === 1) {
      return [
        {
          dayNumber: 1,
          identity: "Lower Hypertrophy + Power",
          intent: "Volume-biased squat-pattern training; higher rep ranges build structural capacity; power primer to open",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high"),
        },
        {
          dayNumber: 2,
          identity: "Pull + Shoulder Structural Integrity",
          intent: "Pull-dominant upper session; scapular integrity before any pressing; vertical and horizontal pull compound work",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "upper_push", "trunk"],
          cnsFlow: buildCNSFlow(["upper_pull", "upper_push", "trunk"], "moderate"),
        },
        {
          dayNumber: 3,
          identity: "Hinge Power + Single-Leg Resilience",
          intent: "Deadlift-pattern peak output; posterior chain and hamstring volume; unilateral control and reactive power",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "power", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "power", "lateral", "trunk"], "moderate"),
        },
        {
          dayNumber: 4,
          identity: "Push Strength + Full Body Integration",
          intent: "Press-dominant upper strength; horizontal and vertical press volume; full-body finisher for integration",
          neuralDemand: "high",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "power", "squat", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "power", "squat", "trunk"], "high"),
        },
      ];
    }
    return [
      {
        dayNumber: 1,
        identity: "Lower Force Production",
        intent: "Bilateral squat strength + posterior chain support + unilateral control; high neural output session",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high"),
      },
      {
        dayNumber: 2,
        identity: "Upper Structural Strength",
        intent: "Horizontal press + pull balance; structural shoulder integrity; upper trunk support",
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
        cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "trunk"], "moderate"),
      },
      {
        dayNumber: 3,
        identity: "Posterior Chain + Unilateral + Elastic Power",
        intent: "Hinge-dominant posterior chain; single-leg stability and asymmetry control; reactive power",
        neuralDemand: "moderate",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "unilateral_lower", "power", "lateral", "trunk"],
        cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "power", "lateral", "trunk"], "moderate"),
      },
      {
        dayNumber: 4,
        identity: "Full Body Integration + Power Expression",
        intent: "Full-system power + compound strength + unilateral coordination; week-closing integration session",
        neuralDemand: "high",
        primaryPattern: "power",
        emphasizedPatterns: ["power", "squat", "hinge", "unilateral_lower", "trunk", "rotational"],
        cnsFlow: buildCNSFlow(["power", "squat", "unilateral_lower", "rotational", "trunk"], "high"),
      },
    ];
  }

  if (daysPerWeek === 5) {
    // Variant B: Push/Pull/Legs emphasis — dedicated push and pull days
    if ((variationSeed ?? 0) % 2 === 1) {
      return [
        {
          dayNumber: 1,
          identity: "Squat-Dominant Lower + Power",
          intent: "Squat-first lower session; vertical force production base; power primer before main lift",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high"),
          sportNotes: isHockey ? "Lateral drive bias from squat; lateral bound" : undefined,
        },
        {
          dayNumber: 2,
          identity: "Push: Chest + Shoulders + Triceps",
          intent: "Press-dominant upper strength; horizontal bench and overhead pressing as primary movers; anterior delt and tricep volume",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "trunk"], "moderate"),
          sportNotes: isHockey ? "Landmine press; rotational med ball work; face pull between sets" : undefined,
        },
        {
          dayNumber: 3,
          identity: "Pull: Back + Biceps + Posterior Chain",
          intent: "Pull-dominant upper session; vertical and horizontal pull compound work; posterior chain volume finisher",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "hinge", "trunk"],
          cnsFlow: buildCNSFlow(["upper_pull", "hinge", "trunk"], "moderate"),
          sportNotes: isHockey ? "Bent-over row; weighted chin-up; rotational trunk work" : undefined,
        },
        {
          dayNumber: 4,
          identity: "Hinge-Dominant Lower + Unilateral Resilience",
          intent: "Deadlift-pattern peak force; posterior chain and hamstring depth; single-leg stability and asymmetry work",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "lateral", "trunk"], "moderate"),
          sportNotes: isHockey ? "Single-leg RDL; lateral lunge; Copenhagen plank" : undefined,
        },
        {
          dayNumber: 5,
          identity: "Full Body Power + Integration",
          intent: "Week-closing power expression; full-body integration; explosive compound movements",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "hinge", "rotational", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["power", "squat", "lateral", "rotational", "trunk"], "high"),
          sportNotes: isHockey ? "Broad jump + lateral bound complex; sled push; rotational med ball; carry" : undefined,
        },
      ];
    }
    return [
      {
        dayNumber: 1,
        identity: "Lower Force Production",
        intent: "Squat-dominant bilateral strength; power output; unilateral stability",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high"),
        sportNotes: isHockey ? "Lateral drive bias from squat; lateral bound" : undefined,
      },
      {
        dayNumber: 2,
        identity: "Upper Push Strength",
        intent: "Horizontal and vertical pressing strength; shoulder integrity; upper trunk stiffness",
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "trunk"],
        cnsFlow: buildCNSFlow(["upper_push", "trunk"], "moderate"),
        sportNotes: isHockey ? "Rotational med ball press; landmine press; face pull" : undefined,
      },
      {
        dayNumber: 3,
        identity: "Posterior Chain + Unilateral",
        intent: "Hinge-dominant posterior chain; single-leg stability; elastic and reactive power",
        neuralDemand: "moderate",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "unilateral_lower", "lateral", "trunk"],
        cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "lateral", "trunk"], "moderate"),
        sportNotes: isHockey ? "Single-leg RDL; lateral lunge; Copenhagen plank" : undefined,
      },
      {
        dayNumber: 4,
        identity: "Upper Pull Strength + Structural Balance",
        intent: "Vertical and horizontal pull dominance; scapular integrity; pressing complement",
        neuralDemand: "moderate",
        primaryPattern: "upper_pull",
        emphasizedPatterns: ["upper_pull", "upper_push", "trunk"],
        cnsFlow: buildCNSFlow(["upper_pull", "upper_push", "trunk"], "moderate"),
        sportNotes: isHockey ? "Bent-over row; weighted chin-up; rotational trunk" : undefined,
      },
      {
        dayNumber: 5,
        identity: "Full Body Power + Integration",
        intent: "Week-closing power expression; full-body integration; sport transfer",
        neuralDemand: "high",
        primaryPattern: "power",
        emphasizedPatterns: ["power", "squat", "hinge", "rotational", "lateral", "trunk"],
        cnsFlow: buildCNSFlow(["power", "squat", "lateral", "rotational", "trunk"], "high"),
        sportNotes: isHockey ? "Broad jump + lateral bound complex; sled push; rotational med ball; carry" : undefined,
      },
    ];
  }

  if (daysPerWeek === 6) {
    return [
      {
        dayNumber: 1,
        identity: "Lower Power + Force Production",
        intent: "High CNS squat + vertical power output; week opener",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "power", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "power", "trunk"], "high"),
        sportNotes: isHockey ? "Lateral bound before squats; Pallof press" : undefined,
      },
      {
        dayNumber: 2,
        identity: "Upper Push Strength",
        intent: "Horizontal and vertical pressing; shoulder and trunk integrity",
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "trunk"],
        cnsFlow: buildCNSFlow(["upper_push", "trunk"], "moderate"),
      },
      {
        dayNumber: 3,
        identity: "Posterior Chain + Hinge",
        intent: "Hinge-dominant; posterior chain volume; unilateral stability",
        neuralDemand: "moderate",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "unilateral_lower", "trunk"],
        cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "trunk"], "moderate"),
        sportNotes: isHockey ? "Single-leg RDL; lateral lunge; Copenhagen plank" : undefined,
      },
      {
        dayNumber: 4,
        identity: "Upper Pull Strength",
        intent: "Vertical and horizontal pull; structural balance from Days 2–3",
        neuralDemand: "moderate",
        primaryPattern: "upper_pull",
        emphasizedPatterns: ["upper_pull", "trunk"],
        cnsFlow: buildCNSFlow(["upper_pull", "trunk"], "moderate"),
        sportNotes: isHockey ? "Rotational med ball; face pull; band external rotation" : undefined,
      },
      {
        dayNumber: 5,
        identity: "Full Body Power + Unilateral Integration",
        intent: "Reactive power; full-body compound integration; sport transfer specificity",
        neuralDemand: "high",
        primaryPattern: "power",
        emphasizedPatterns: ["power", "unilateral_lower", "lateral", "rotational", "trunk"],
        cnsFlow: buildCNSFlow(["power", "unilateral_lower", "lateral", "rotational", "trunk"], "high"),
        sportNotes: isHockey ? "Broad jump + lateral bound; lateral step-up; rotational med ball" : undefined,
      },
      {
        dayNumber: 6,
        identity: "Athlete Finisher + Conditioning",
        intent: "Lower-intensity integration; conditioning and trunk emphasis; structural resilience",
        neuralDemand: "low",
        primaryPattern: "trunk",
        emphasizedPatterns: ["trunk", "lateral", "rotational", "locomotion"],
        cnsFlow: buildCNSFlow(["trunk", "lateral", "rotational"], "low"),
        sportNotes: isHockey ? "Sled push; lateral band work; carry complex; hip flexor + adductor care" : undefined,
      },
    ];
  }

  return buildSessionsForDayCount(4, sport, goal);
}

// ─── Movement allocation computation ─────────────────────────────────────────

function computeMovementAllocation(sessions: SessionArchitecture[], sport: string | null): MovementAllocation {
  const alloc: MovementAllocation = {
    squat: 0,
    hinge: 0,
    unilateral_lower: 0,
    upper_push: 0,
    upper_pull: 0,
    trunk: sessions.length,
    power: 0,
  };

  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;
  const isAthletic = !!sport;

  for (const s of sessions) {
    for (const p of s.emphasizedPatterns) {
      if (p === "squat") alloc.squat++;
      else if (p === "hinge") alloc.hinge++;
      else if (p === "unilateral_lower") alloc.unilateral_lower++;
      else if (p === "upper_push") alloc.upper_push++;
      else if (p === "upper_pull") alloc.upper_pull++;
      else if (p === "power") alloc.power++;
      else if (p === "lateral") alloc.lateral = (alloc.lateral ?? 0) + 1;
      else if (p === "rotational") alloc.rotational = (alloc.rotational ?? 0) + 1;
    }
  }

  return alloc;
}

// ─── Main: compute weekly architecture ───────────────────────────────────────

export function computeWeeklyArchitecture(
  daysPerWeek: number,
  sport: string | null,
  goal: string | null,
  variationSeed?: number,
): WeeklyArchitecture {
  const days = Math.max(2, Math.min(6, daysPerWeek));
  const sessions = buildSessionsForDayCount(days, sport, goal, variationSeed);
  const movementAllocation = computeMovementAllocation(sessions, sport);

  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;

  const weeklyRhythm = sessions
    .map((s) => `Day ${s.dayNumber} (${s.neuralDemand.toUpperCase()} CNS): ${s.identity}`)
    .join(" → ");

  const recoveryNotes = isHockey
    ? [
        "High-CNS days are separated by at least one moderate/low day.",
        "Lateral and rotational stress distributed across ≥2 sessions to avoid adductor overload.",
        "Squat and hinge patterns are never on back-to-back days.",
        "No bilateral lower-body high-CNS days run consecutively.",
        "Hockey-specific tissue care: adductor, hip flexor, groin work embedded in unilateral days.",
      ].join(" ")
    : [
        "High-CNS days alternate with moderate/low-demand days.",
        "Squat and hinge are separated — no same-pattern consecutive days.",
        "Upper push and pull are balanced across the week.",
        "Every session has trunk work regardless of focus.",
      ].join(" ");

  return { daysPerWeek: days, sport, goal, sessions, movementAllocation, weeklyRhythm, recoveryNotes };
}

// ─── Build Architecture Brief (AI prompt injection) ──────────────────────────

export function buildArchitectureBrief(
  daysPerWeek: number | null,
  sport: string | null,
  goal: string | null,
  userRequest: string,
  variationSeed?: number,
): string | null {
  if (!daysPerWeek || daysPerWeek < 2) return null;

  const arch = computeWeeklyArchitecture(daysPerWeek, sport, goal, variationSeed);
  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;
  const isFootball = !!(sport && /\bfootball\b/i.test(sport) && !/soccer/.test(sport.toLowerCase()));
  const isBasketball = !!(sport && /basketball/i.test(sport));
  const isSoccer = !!(sport && /soccer|association football/i.test(sport));
  const isBaseball = !!(sport && /baseball|softball/i.test(sport));
  const hasSportProfile = isFootball || isBasketball || isSoccer || isBaseball || isHockey;
  const isConditioningGoal = !!(
    goal?.toLowerCase().includes("conditioning") ||
    goal?.toLowerCase().includes("endurance") ||
    goal?.toLowerCase().includes("cardio") ||
    goal?.toLowerCase().includes("aerobic") ||
    goal?.toLowerCase().includes("work capacity")
  );

  const sessionLines = arch.sessions.map((s) => {
    const flowRoles = s.cnsFlow.map((b) => `[${b.role.toUpperCase()}] ${b.description}`).join("\n    ");
    const sportLine = s.sportNotes ? `\n  SPORT OVERLAY: ${s.sportNotes}` : "";
    return [
      `  DAY ${s.dayNumber} — ${s.identity}`,
      `  Neural demand: ${s.neuralDemand.toUpperCase()} | Primary pattern: ${s.primaryPattern.replace("_", " ")}`,
      `  Intent: ${s.intent}`,
      `  CNS Flow (enforce this sequence):`,
      `    ${flowRoles}`,
      sportLine,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const allocLines = Object.entries(arch.movementAllocation)
    .filter(([, v]) => v && v > 0)
    .map(([k, v]) => `  ${k.replace("_", " ")}: ${v} session${v === 1 ? "" : "s"} per week`)
    .join("\n");

  const conditioningOverlay = isConditioningGoal ? `
## CONDITIONING PROGRAM ARCHITECTURE — MANDATORY RULES
This program includes dedicated conditioning sessions. Enforce these rules:

- **Conditioning sessions are NOT circuits.** A conditioning session must include named energy system work (aerobic base / lactate threshold / VO2max / anaerobic capacity / repeat sprint ability).
- **Every conditioning session must specify:** modality (run/row/bike/sprint/sled), work duration, rest duration, number of intervals, and intensity zone.
- **Dedicated conditioning days** (days with identity "Conditioning") must be structured intervals — NOT a random mix of exercises.
- **Strength sessions that include conditioning finishers** must place the conditioning block LAST, after all lifting.
- **Do NOT call lifting circuits "conditioning"** — conditioning is energy system work, not resistance training with short rest.
- **Progression must be specified:** State Week 1 → Week 3 → Week 5 targets for every conditioning session.
- **Language must name the energy system:** Instead of "cardio finisher", write "Aerobic Base: 20 min run at 60–70% max HR" or "Lactate Threshold: 4 × 5 min at 85–92% HR with 5 min rest".
` : "";

  const hockeyOverlay = isHockey ? `
## HOCKEY-SPECIFIC OVERLAY — MANDATORY
The athlete plays hockey. Every session must reflect these performance priorities:
- **Lateral force production** — lateral bounds, lateral step-ups, lateral lunge with control
- **Rotational trunk strength** — med ball rotational throw, Pallof press, half-kneeling cable chop, landmine rotation
- **Acceleration/deceleration patterns** — broad jump, snap-down drill, sled push, sprint-mechanic RDL
- **Single-leg stability** — RFESS, single-leg RDL, lateral lunge, Copenhagen plank in every lower session
- **Anti-rotation strength** — Pallof press must appear in ≥2 sessions/week
- **Edge mechanics transfer** — frame exercises as building "push-off power" and "edge control"
- **Adductor/groin resilience** — Copenhagen plank and adductor loading required in unilateral days
REDUCE or ELIMINATE:
- Bilateral-only lower body isolation without sport purpose
- Pure hypertrophy accessory work without athletic transfer
- High-volume quad-dominant loading without corresponding posterior chain balance
` : "";

  const footballOverlay = isFootball ? `
## FOOTBALL-SPECIFIC OVERLAY — MANDATORY
This program is for an American football athlete. Structural rules:
- **Acceleration work COMES FIRST** in every lower/full-body session — sprint before lifting
- **Conditioning is ANAEROBIC ONLY** — short sprint repeats (10–30m), full rest between efforts. NO long aerobic conditioning.
- **Heavy bilateral lower is the strength foundation** — back squat or trap bar DL at 80%+ 1RM
- **Trunk bracing for collision** — loaded carry and Pallof press in every session
- **Upper press:pull must be balanced** — contact sport demands shoulder integrity
- **Med ball and contrast pairs** develop rate of force development — use in power sessions
ELIMINATE from this football program:
- Long-duration steady-state cardio
- Soccer-style aerobic conditioning
- Pure hypertrophy isolation work without collision-transfer purpose
` : "";

  const basketballOverlay = isBasketball ? `
## BASKETBALL-SPECIFIC OVERLAY — MANDATORY
This program is for a basketball athlete. Structural rules:
- **Reactive plyometrics COME FIRST** in every lower session — jumps before lifting when CNS is fresh
- **Deceleration and landing mechanics** are required — not optional, not substitutable by conditioning
- **Single-leg strength in every lower session** — all basketball actions are single-leg
- **Conditioning is EXPLOSIVE, NOT AEROBIC** — court sprints, line drills, repeat explosive efforts with full rest
- **Trap bar over barbell squat** — joint-friendly bilateral loading for tendon-sensitive athletes
- **Shoulder health is non-negotiable** — push:pull balanced, face pull in warm-up, dumbbell over barbell where appropriate
- **Copenhagen plank** — adductor and groin resilience in every lower session
ELIMINATE from this basketball program:
- Long-duration aerobic conditioning
- Heavy barbell back squat without adequate deceleration and landing mechanics first
- Pure isolated chest/arm hypertrophy without athletic transfer
` : "";

  const soccerOverlay = isSoccer ? `
## SOCCER-SPECIFIC OVERLAY — MANDATORY
This program is for a soccer athlete. Structural rules:
- **Nordic hamstring curl is MANDATORY** in every lower session — most common soccer injury vector. Non-negotiable.
- **Copenhagen plank is MANDATORY** in every lower session — adductor injuries are the second-highest soccer injury type
- **BOTH aerobic conditioning AND repeat sprint ability** are required — they are not interchangeable
- **Single-leg strength in every lower session** — all soccer movement is single-leg
- **Calf and ankle loading** are included — high running volume demands calf tissue resilience
- **Conditioning sessions must include real intervals** — named energy system work with work:rest ratios
ELIMINATE from this soccer program:
- Conditioning sessions that replace real sprint work with circuits
- Programs that ignore hamstring/adductor tissue loading
- Football-style anaerobic-only conditioning without aerobic base component
` : "";

  const baseballOverlay = isBaseball ? `
## BASEBALL-SPECIFIC OVERLAY — MANDATORY
This program is for a baseball athlete. Structural rules:
- **Med ball rotational throws are required** in every power session — rotational power IS baseball training
- **Face pull and band external rotation EVERY upper session** — arm care is non-negotiable for throwing sport athletes
- **Pull volume ≥ push volume** — scapular health demands more pulling than pressing
- **Conditioning is SHORT** — sprint repeats (20–30m) with full recovery only. NO soccer-style aerobic volume.
- **Conditioning preserves power freshness** — never sacrifice rotational power quality for conditioning volume
- **Trap bar over barbell** — safer bilateral loading pattern for rotational athletes
- **Anti-rotation trunk** (Pallof press) is required — stiff trunk converts hip rotation to power
ELIMINATE from this baseball program:
- High-volume internal rotation dominant pressing without arm-care balance
- Soccer-style long-duration conditioning
- Generic bodybuilding shoulder volume without rotator cuff and scapular control work
` : "";

  const sportOverlayBlock = hasSportProfile
    ? `${footballOverlay}${basketballOverlay}${soccerOverlay}${baseballOverlay}${hockeyOverlay}`
    : hockeyOverlay;

  const sportValidationLines = (() => {
    if (isFootball) return "\n- [ ] Acceleration sprint work present (10–20m)\n- [ ] Conditioning is anaerobic only — NO long aerobic sessions\n- [ ] Heavy bilateral lower present (80%+ 1RM)\n- [ ] Trunk bracing (Pallof press or loaded carry) in ≥2 sessions\n- [ ] Upper press:pull balanced";
    if (isBasketball) return "\n- [ ] Reactive plyometrics before lifting in lower sessions\n- [ ] Deceleration and landing mechanics session included\n- [ ] Single-leg strength in every lower session\n- [ ] Conditioning is explosive court efforts — NOT aerobic endurance\n- [ ] Push:pull balanced in upper sessions";
    if (isSoccer) return "\n- [ ] Nordic hamstring curl in EVERY lower session\n- [ ] Copenhagen plank in EVERY lower session\n- [ ] BOTH aerobic conditioning AND RSA conditioning included\n- [ ] Single-leg strength in every lower session\n- [ ] Calf or ankle loading present";
    if (isBaseball) return "\n- [ ] Med ball rotational throw in every power session\n- [ ] Face pull or external rotation in every upper session\n- [ ] Pull volume ≥ push volume\n- [ ] Conditioning is short sprint work ONLY — no aerobic endurance volume\n- [ ] Anti-rotation trunk (Pallof press) included";
    if (isHockey) return "\n- [ ] Lateral and rotational patterns present in ≥3 sessions\n- [ ] Copenhagen plank or adductor work in every lower-body day\n- [ ] Pallof press in ≥2 sessions";
    return "";
  })();

  return `## PROGRAM ARCHITECTURE BRIEF — MANDATORY STRUCTURE
The following architecture MUST be used as the blueprint for this program.
DO NOT begin exercise selection until this structure is established.

### REQUESTED BUILD
User request: "${userRequest.slice(0, 120)}"
Days/week: ${arch.daysPerWeek} | Sport: ${arch.sport ?? "General"} | Goal: ${arch.goal ?? "Athletic performance"}

### WEEKLY RHYTHM
${arch.weeklyRhythm}

### SESSION-BY-SESSION ARCHITECTURE
${sessionLines}

### MOVEMENT ALLOCATION ACROSS THE WEEK
${allocLines}

### RECOVERY & SPACING RULES (HARD CONSTRAINTS)
${arch.recoveryNotes}
- No same primary pattern on consecutive days
- No back-to-back high-CNS sessions
- Push:pull ratio must be balanced across the week
- Every session MUST include trunk work (not optional)
- Power/explosive work always comes first when CNS is fresh (after prep only)
${conditioningOverlay}${sportOverlayBlock}
### EXERCISE SELECTION MANDATE
Only AFTER the above architecture is locked, select exercises that:
1. Match the session's primary and secondary patterns
2. Follow the CNS flow sequence (prep → power → primary → secondary → unilateral → trunk)
3. Use the coaching cue standard: POSITION + INTENT + TRANSFER (not muscle cues)
4. Vary exercises across sessions — no repeated primary lifts
5. Minimum 5 meaningful exercises per session (6–8 optimal for full sessions)

### VALIDATION CHECKLIST (apply before outputting JSON)
- [ ] Every session has a clear identity that answers "why does this day exist?"
- [ ] No consecutive high-CNS sessions
- [ ] Squat and hinge not on back-to-back days
- [ ] Push and pull balanced across the week
- [ ] Every session has trunk work
- [ ] Every session has power/explosive work (unless injury contraindicates)
- [ ] Every session has at least one unilateral lower-body movement (lower/full-body days)
- [ ] No repeated primary lifts across sessions
- [ ] Exercise intents are performance cues, not muscle labels${sportValidationLines}${isConditioningGoal ? "\n- [ ] Dedicated conditioning sessions include named energy system (aerobic base / lactate threshold / VO2max / anaerobic capacity / RSA)\n- [ ] Every conditioning exercise has work duration, rest duration, and interval count\n- [ ] Conditioning sessions do NOT default to circuits — real intervals required\n- [ ] Progression is stated: Week 1 → Week 3 → Week 5" : ""}`;
}

// ─── Post-generation Validation ───────────────────────────────────────────────

export interface ArchitectureValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export function validateProgramArchitecture(
  days: Array<{ name: string; exercises: Array<{ name: string; classification?: string; intent?: string }> }>,
  sport: string | null,
): ArchitectureValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const ex = day.exercises ?? [];

    if (ex.length < 5) {
      issues.push(`Day ${i + 1} (${day.name}) has only ${ex.length} exercises — minimum is 5.`);
    }

    const hasTrunk = ex.some((e) => {
      const c = (e.classification ?? "").toLowerCase();
      const n = (e.name ?? "").toLowerCase();
      return c.includes("trunk") || c.includes("core") || n.includes("plank") || n.includes("pallof")
        || n.includes("carry") || n.includes("rollout") || n.includes("dead bug") || n.includes("hollow");
    });
    if (!hasTrunk && !day.name.toLowerCase().includes("upper")) {
      warnings.push(`Day ${i + 1} (${day.name}) is missing trunk/core work.`);
    }

    const hasPower = ex.some((e) => {
      const c = (e.classification ?? "").toLowerCase();
      const n = (e.name ?? "").toLowerCase();
      return c.includes("power") || c.includes("explosive") || c.includes("prep")
        || n.includes("jump") || n.includes("bound") || n.includes("throw") || n.includes("clean")
        || n.includes("snatch") || n.includes("slam");
    });
    if (!hasPower) {
      warnings.push(`Day ${i + 1} (${day.name}) is missing power/explosive work.`);
    }

    const missingIntent = ex.filter((e) => !e.intent || e.intent.trim().length < 15);
    if (missingIntent.length > 2) {
      warnings.push(`Day ${i + 1}: ${missingIntent.length} exercises are missing meaningful intent cues.`);
    }
  }

  const allPrimaryLifts = days.flatMap((d) =>
    d.exercises
      .filter((e) => (e.classification ?? "").toLowerCase().includes("primary"))
      .map((e) => e.name.toLowerCase()),
  );
  const duplicatePrimaries = allPrimaryLifts.filter((name, i) => allPrimaryLifts.indexOf(name) !== i);
  if (duplicatePrimaries.length > 0) {
    issues.push(`Duplicate primary lifts detected across sessions: ${[...new Set(duplicatePrimaries)].join(", ")}`);
  }

  const sportLower = (sport ?? "").toLowerCase();
  const allExNames = days.flatMap((d) => d.exercises.map((e) => e.name.toLowerCase()));
  const allExClasses = days.flatMap((d) => d.exercises.map((e) => (e.classification ?? "").toLowerCase()));

  // Hockey validation
  const isHockey = sportLower.includes("hockey");
  if (isHockey) {
    const hasLateral = allExNames.some((n) => n.includes("lateral") || n.includes("bound") || n.includes("lunge"));
    const hasRotational = allExNames.some((n) => n.includes("rotational") || n.includes("pallof") || n.includes("chop") || n.includes("landmine"));
    if (!hasLateral) warnings.push("Hockey program missing lateral force production patterns (lateral bound, lateral step-up, lateral lunge).");
    if (!hasRotational) warnings.push("Hockey program missing rotational trunk work (Pallof press, cable chop, landmine rotation).");
  }

  // Football validation
  const isFootball = /\bfootball\b/.test(sportLower) && !sportLower.includes("soccer");
  if (isFootball) {
    const hasSprintOrAcceleration = allExNames.some((n) => n.includes("sprint") || n.includes("acceleration") || n.includes("sled") || n.includes("broad jump"));
    const hasTrunkBracing = allExNames.some((n) => n.includes("pallof") || n.includes("carry") || n.includes("farmer"));
    const hasHeavyLower = allExNames.some((n) => n.includes("squat") || n.includes("deadlift") || n.includes("trap bar") || n.includes("hex bar"));
    if (!hasSprintOrAcceleration) warnings.push("Football program missing acceleration/sprint work — should include 10–30m sprint or sled work.");
    if (!hasTrunkBracing) warnings.push("Football program missing trunk bracing for collision (Pallof press or loaded carry).");
    if (!hasHeavyLower) warnings.push("Football program missing heavy bilateral lower strength (squat or DL variation).");
  }

  // Basketball validation
  const isBasketball = sportLower.includes("basketball");
  if (isBasketball) {
    const hasReactivePlyo = allExNames.some((n) => n.includes("jump") || n.includes("depth") || n.includes("bound") || n.includes("reactive"));
    const hasDecelOrLanding = allExNames.some((n) => n.includes("decel") || n.includes("landing") || n.includes("snap-down") || n.includes("depth jump"));
    const hasSingleLeg = allExNames.some((n) => n.includes("single-leg") || n.includes("rfess") || n.includes("step-up") || n.includes("pistol"));
    if (!hasReactivePlyo) warnings.push("Basketball program missing reactive plyometrics (box jump, depth jump, lateral bound).");
    if (!hasDecelOrLanding) warnings.push("Basketball program missing deceleration/landing mechanics training.");
    if (!hasSingleLeg) warnings.push("Basketball program missing single-leg strength work.");
  }

  // Soccer validation
  const isSoccer = sportLower.includes("soccer") || sportLower.includes("association football");
  if (isSoccer) {
    const hasNordic = allExNames.some((n) => n.includes("nordic") || n.includes("hamstring curl") || n.includes("glute-ham"));
    const hasCopenhagen = allExNames.some((n) => n.includes("copenhagen") || n.includes("adductor") || n.includes("lateral lunge"));
    const hasSingleLeg = allExNames.some((n) => n.includes("single-leg") || n.includes("rfess") || n.includes("rdl") || n.includes("step-up"));
    if (!hasNordic) issues.push("Soccer program MISSING Nordic hamstring curl or equivalent — this is mandatory for soccer athlete injury prevention.");
    if (!hasCopenhagen) warnings.push("Soccer program missing Copenhagen plank or adductor loading — adductor injuries are the second-most common soccer injury.");
    if (!hasSingleLeg) warnings.push("Soccer program missing single-leg strength work — all soccer actions are single-leg.");
  }

  // Baseball validation
  const isBaseball = sportLower.includes("baseball") || sportLower.includes("softball");
  if (isBaseball) {
    const hasRotationalMedBall = allExNames.some((n) => n.includes("rotational") || n.includes("med ball") || n.includes("medicine ball") || n.includes("scoop toss"));
    const hasFacePull = allExNames.some((n) => n.includes("face pull") || n.includes("external rotation") || n.includes("band pull"));
    const hasPallof = allExNames.some((n) => n.includes("pallof") || n.includes("chop") || n.includes("anti-rotation"));
    if (!hasRotationalMedBall) issues.push("Baseball program MISSING med ball rotational throws — rotational power is the primary physical quality in baseball.");
    if (!hasFacePull) warnings.push("Baseball program missing face pull or external rotation work — arm care is mandatory for throwing sport athletes.");
    if (!hasPallof) warnings.push("Baseball program missing anti-rotation trunk work (Pallof press) — stiff trunk is required for rotational power transfer.");
  }

  // allExClasses used for future classification-based validation
  void allExClasses;

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

// ─── Sport extraction helper ──────────────────────────────────────────────────

export function extractSportFromRequest(userRequest: string, sportFocus: string | null): string | null {
  if (sportFocus) return sportFocus;
  const text = userRequest.toLowerCase();

  // Position-based detection (before generic sport keywords)
  if (/lineman|linebacker|tight end|wide receiver|running back|quarterback|cornerback|safety|defensive end/.test(text)) return "football";
  if (/point guard|shooting guard|power forward|small forward|center.+basketball|basketball.+center/.test(text)) return "basketball";
  if (/striker|winger.+soccer|soccer.+midfielder|goalkeeper.+soccer/.test(text)) return "soccer";
  if (/pitcher|baseball.+catcher|shortstop|outfield.+baseball/.test(text)) return "baseball";

  // Direct sport name detection
  const sports = [
    "hockey", "soccer", "football", "basketball", "baseball", "softball",
    "tennis", "volleyball", "rugby", "lacrosse", "track and field", "track",
    "sprinting", "swimming", "wrestling", "mma", "boxing", "martial arts",
    "cricket", "golf",
  ];
  for (const s of sports) {
    if (text.includes(s)) return s;
  }

  // Phrase-based detection
  if (/i play.*(football|grid iron)/.test(text)) return "football";
  if (/i play.*(ball|basketball|hoops)/.test(text)) return "basketball";
  if (/i play.*(soccer|futbol)/.test(text)) return "soccer";
  if (/i play.*(baseball|softball)/.test(text)) return "baseball";

  return null;
}
