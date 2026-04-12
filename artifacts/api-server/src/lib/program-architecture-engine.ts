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
): WeeklyArchitecture {
  const days = Math.max(2, Math.min(6, daysPerWeek));
  const sessions = buildSessionsForDayCount(days, sport, goal);
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
): string | null {
  if (!daysPerWeek || daysPerWeek < 2) return null;

  const arch = computeWeeklyArchitecture(daysPerWeek, sport, goal);
  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;

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
${hockeyOverlay}
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
- [ ] Exercise intents are performance cues, not muscle labels
${isHockey ? "- [ ] Lateral and rotational patterns present in ≥3 sessions\n- [ ] Copenhagen plank or adductor work in every lower-body day\n- [ ] Pallof press in ≥2 sessions" : ""}`;
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

  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;
  if (isHockey) {
    const allExNames = days.flatMap((d) => d.exercises.map((e) => e.name.toLowerCase()));
    const hasLateral = allExNames.some((n) => n.includes("lateral") || n.includes("bound") || n.includes("lunge"));
    const hasRotational = allExNames.some((n) => n.includes("rotational") || n.includes("pallof") || n.includes("chop") || n.includes("landmine"));
    if (!hasLateral) {
      warnings.push("Hockey program missing lateral force production patterns (lateral bound, lateral step-up, lateral lunge).");
    }
    if (!hasRotational) {
      warnings.push("Hockey program missing rotational trunk work (Pallof press, cable chop, landmine rotation).");
    }
  }

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
  const sports = [
    "hockey", "soccer", "football", "basketball", "baseball", "softball",
    "tennis", "volleyball", "rugby", "lacrosse", "track", "sprinting",
    "swimming", "wrestling", "mma", "boxing", "martial arts",
  ];
  for (const s of sports) {
    if (text.includes(s)) return s;
  }
  return null;
}
