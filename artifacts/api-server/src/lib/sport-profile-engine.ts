/**
 * TrainChat Sport-Specific Architecture Engine
 *
 * Phase 3 Intelligence Upgrade — Real sport-shaped programming.
 *
 * Replaces "generic athletic programming with sport label" with true
 * structural differentiation: each sport produces different session
 * identities, exercise emphasis, conditioning logic, and weekly architecture.
 *
 * Supported sports: football, basketball, soccer, baseball, general_athlete
 * Planned: rugby, lacrosse, track, hockey (has own overlay)
 */

// ─── Sport Profile Types ──────────────────────────────────────────────────────

export type SportKey =
  | "football"
  | "basketball"
  | "soccer"
  | "baseball"
  | "general_athlete"
  | "rugby"
  | "lacrosse"
  | "hockey"
  | "track"
  | "volleyball";

export type SeasonContext = "off_season" | "pre_season" | "in_season" | "post_season" | null;

export type PlayerPosition =
  | "lineman"         // football
  | "skill"           // football (WR, DB, RB, QB)
  | "guard"           // basketball
  | "forward_wing"    // basketball / soccer
  | "big_post"        // basketball
  | "goalkeeper"      // soccer / hockey
  | "pitcher"         // baseball
  | "hitter_field"    // baseball
  | "midfielder"      // soccer / lacrosse
  | "defender"        // soccer / hockey / lacrosse
  | null;

export interface PhysicalQuality {
  quality: string;
  priority: "primary" | "secondary" | "tertiary";
  description: string;
}

export interface SportConditioningProfile {
  primaryEnergySystem: string;
  secondaryEnergySystem: string;
  weeklyVolume: string;
  sessionFormat: string;
  antiPattern: string;
  sportNote: string;
}

export interface SportSessionArchetype {
  name: string;
  intent: string;
  primaryFocus: string[];
  conditioningRole?: string;
  recoveryPriority: "high" | "moderate" | "low";
}

export interface SportExerciseEmphasis {
  mustInclude: string[];     // Exercise types / patterns that must appear
  preferred: string[];       // Strongly preferred patterns
  reduced: string[];         // Patterns to reduce or de-emphasize
  eliminated: string[];      // Patterns to eliminate or use sparingly
  tissueConsiderations: string[];
}

export interface SeasonModulation {
  volumeModifier: number;    // 0.5–1.0 multiplier on session volume
  intensityModifier: number; // 0.8–1.0 multiplier on loading
  conditioningReduction: number; // 0.3–1.0 — how much to reduce conditioning
  priorityShift: string;
  mandatoryAdjustments: string[];
}

export interface SportProfile {
  key: SportKey;
  displayName: string;
  tagline: string;
  physicalQualities: PhysicalQuality[];
  conditioning: SportConditioningProfile;
  sessionArchetypes: SportSessionArchetype[];
  exerciseEmphasis: SportExerciseEmphasis;
  weeklyArchitectureGuidance: {
    threeDayShape: string;
    fourDayShape: string;
  };
  seasonModulation: Record<NonNullable<SeasonContext>, SeasonModulation>;
  positionOverlays: Partial<Record<NonNullable<PlayerPosition>, string>>;
  validationRules: string[];
  architectureDistinctions: string; // What makes this sport's program uniquely different
}

// ─── Sport Profiles ───────────────────────────────────────────────────────────

export const SPORT_PROFILES: Record<SportKey, SportProfile> = {

  // ── FOOTBALL ────────────────────────────────────────────────────────────────
  football: {
    key: "football",
    displayName: "American Football",
    tagline: "Acceleration, force production, collision resilience, and repeat explosive power",
    physicalQualities: [
      { quality: "Acceleration / First-step power", priority: "primary", description: "0–15m sprint force application is the most used speed quality in football — every play is an acceleration" },
      { quality: "Lower-body force production", priority: "primary", description: "Bilateral strength (squat, trap bar DL) is the foundation — collision resilience demands maximal lower body strength" },
      { quality: "Collision resilience", priority: "primary", description: "The ability to absorb and apply force in contact — trunk stiffness, structural strength, and tissue robustness" },
      { quality: "Power / Explosiveness", priority: "secondary", description: "Contrast training, jumps, med ball — rate of force development for explosive play execution" },
      { quality: "Repeat explosive capacity", priority: "secondary", description: "Short explosive effort, brief rest, repeat — mirrors the work:rest ratio of actual football plays" },
      { quality: "Upper strength balance", priority: "secondary", description: "Pressing and pulling strength for contact — NOT hypertrophy-focused" },
    ],
    conditioning: {
      primaryEnergySystem: "Anaerobic (alactic) — short explosive bursts, full recovery",
      secondaryEnergySystem: "Anaerobic glycolytic — repeat effort capacity across a game",
      weeklyVolume: "1–2 dedicated conditioning sessions max. Short, explosive, not endurance-dominant.",
      sessionFormat: "Repeat sprint ability: 6–12 × 10–30m at 100% with 90 sec+ recovery | OR: position-specific repeat effort (sled, hill, shuttle) with full recovery",
      antiPattern: "NEVER program soccer-style aerobic volume, long-duration cardio, or Zone 2 steady-state for football athletes. Football is not an aerobic endurance sport.",
      sportNote: "Football conditioning is about anaerobic capacity and repeat explosive power — not cardiovascular endurance. A football player's worst conditioning is long slow distance.",
    },
    sessionArchetypes: [
      { name: "Acceleration + Lower Force Production", intent: "Sprint mechanics (0–20m) + heavy bilateral lower-body strength — the two most critical football physical qualities in one session", primaryFocus: ["locomotion", "squat", "hinge", "trunk"], recoveryPriority: "high" },
      { name: "Upper Structural Strength", intent: "Horizontal and vertical pressing + pulling balance — collision-ready upper body development, NOT bodybuilding volume", primaryFocus: ["upper_push", "upper_pull", "trunk", "rotational"], recoveryPriority: "moderate" },
      { name: "Power Development — Jumps + Med Ball + Contrast", intent: "Force-velocity development: contrast pairs, plyometrics, med ball — rate of force development for play initiation", primaryFocus: ["power", "squat", "hinge", "rotational"], recoveryPriority: "high" },
      { name: "Repeat Effort Conditioning + Tissue Support", intent: "Anaerobic capacity — short sprint or sled repeats with full recovery; posterior chain tissue maintenance; NOT aerobic work", primaryFocus: ["locomotion", "hinge", "unilateral_lower"], conditioningRole: "Anaerobic capacity / repeat explosive effort", recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: [
        "Heavy bilateral lower (back squat, trap bar DL, hex bar DL)",
        "Acceleration sprint work (10–20m with full recovery)",
        "Trunk bracing and anti-rotation (Pallof press, loaded carry)",
        "Upper press + pull balance (bench/row pairing)",
        "Posterior chain compound (Romanian DL, hip thrust, hip extension)",
      ],
      preferred: [
        "Sled push (heavy and light)",
        "Box jump and broad jump",
        "Med ball slam and scoop toss",
        "Power clean or hang clean",
        "Nordic hamstring curl for posterior chain resilience",
        "Loaded carry complex (farmer, cross-body, overhead)",
        "Unilateral lower (RFESS, Bulgarian split squat)",
      ],
      reduced: [
        "High-rep isolation work without athletic purpose",
        "Long aerobic conditioning sessions",
        "Pure hypertrophy accessory volume without transfer value",
      ],
      eliminated: [
        "Long-duration steady-state cardio (20+ min Zone 2) as the conditioning prescription",
        "Circuit training with short rest marketed as 'conditioning'",
        "Isolated machine-based exercises without structural or sprint-transfer purpose",
      ],
      tissueConsiderations: [
        "Hamstring resilience — Nordic curls, single-leg RDL mandatory in every lower session",
        "Posterior chain — hip thrust, RDL, glute-ham raise for sprint mechanics",
        "Trunk integrity — loaded carries, Pallof press for collision readiness",
        "Knee tendon tolerance — avoid excessive knee-dominant volume without posterior chain balance",
        "Cervical / neck resilience — neck work appropriate for contact athletes if requested",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Acceleration + Lower Strength | Day 2: Upper Structural | Day 3: Power + Jumps + Repeat Effort",
      fourDayShape: "Day 1: Acceleration + Lower Strength | Day 2: Upper Structural | Day 3: Power + Jumps + Med Ball | Day 4: Repeat Effort Conditioning + Posterior Chain",
    },
    seasonModulation: {
      off_season: {
        volumeModifier: 1.0,
        intensityModifier: 1.0,
        conditioningReduction: 1.0,
        priorityShift: "Build: max strength, acceleration, and power. Tolerate more volume. All qualities trained aggressively.",
        mandatoryAdjustments: ["Full sprint work", "Heavy compound lifting", "Aggressive power development", "Conditioning volume at full prescription"],
      },
      pre_season: {
        volumeModifier: 0.85,
        intensityModifier: 0.95,
        conditioningReduction: 0.8,
        priorityShift: "Sharpen: maintain strength, increase sprint quality, transition to more sport-specific conditioning",
        mandatoryAdjustments: ["Reduce accessory volume", "Maintain big compound lifts", "Increase acceleration quality", "Transition conditioning to position-specific"],
      },
      in_season: {
        volumeModifier: 0.6,
        intensityModifier: 0.9,
        conditioningReduction: 0.3,
        priorityShift: "MAINTENANCE: Protect freshness, preserve strength and power. Minimal conditioning outside games. Games ARE the conditioning.",
        mandatoryAdjustments: ["Reduce total sets by 40%", "Maintain primary compound lifts at 85%+ intensity", "NO extra sprint conditioning — games provide it", "Session frequency: 2× per week max in-season", "No max effort lifting day before game day"],
      },
      post_season: {
        volumeModifier: 0.5,
        intensityModifier: 0.7,
        conditioningReduction: 0.4,
        priorityShift: "Recovery and restoration — structural maintenance only. No aggressive loading.",
        mandatoryAdjustments: ["General movement and tissue maintenance", "No sprint work", "Submaximal loading only", "Recovery priority over adaptation"],
      },
    },
    positionOverlays: {
      lineman: "Lineman overlay: INCREASE bilateral force production, loaded carries, collision trunk work, and upper structural strength. REDUCE acceleration sprint distance (10m focus only). Add neck/shoulder resilience work. Emphasize raw strength > speed.",
      skill: "Skill position overlay: INCREASE acceleration (10–20m sprint work), COD mechanics, and reactive plyometrics. Reduce heavy bilateral loading relative to lineman. Add first-step quickness drills and backpedal/break mechanics.",
    },
    validationRules: [
      "Football program MUST include acceleration sprint work (10–20m)",
      "Football program MUST include heavy bilateral lower (squat or trap bar DL at 80%+ 1RM)",
      "Football conditioning MUST be anaerobic — not long-duration aerobic",
      "Football program should NOT look like a soccer or endurance program",
      "Trunk bracing (Pallof press or loaded carry) must appear in ≥2 sessions",
      "Upper push:pull ratio must be balanced — not press-dominant",
    ],
    architectureDistinctions: "Football is force + acceleration — short explosive efforts with full recovery. The gym sessions are heavy and powerful. Conditioning is anaerobic, not aerobic. This program should look NOTHING like a soccer or endurance program.",
  },

  // ── BASKETBALL ──────────────────────────────────────────────────────────────
  basketball: {
    key: "basketball",
    displayName: "Basketball",
    tagline: "Vertical power, reactive deceleration, elastic speed, and repeat-power conditioning",
    physicalQualities: [
      { quality: "Vertical power / Jump height", priority: "primary", description: "Box jumps, depth jumps, reactive plyometrics — vertical force production is the primary athletic currency" },
      { quality: "Reactive deceleration and landing", priority: "primary", description: "Landing mechanics, decel control, single-leg absorption — injury prevention AND performance quality" },
      { quality: "Change of direction / Lateral quickness", priority: "primary", description: "First step laterally, cut and drive, 5-10-5 pattern — basketball is a multi-directional reactive sport" },
      { quality: "Elastic / reactive power", priority: "secondary", description: "Stretch-shortening cycle efficiency — depth jumps, lateral bounds, reactive agility" },
      { quality: "Single-leg strength", priority: "secondary", description: "Single-leg squat patterns, step-up, RFESS — all basketball actions are single-leg" },
      { quality: "Upper structural balance", priority: "secondary", description: "Shoulder joint health, pushing/pulling balance — injury prevention emphasis" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic + glycolytic — short explosive bursts, incomplete recovery, repeat power",
      secondaryEnergySystem: "Aerobic support (minimal) — moderate aerobic base for game endurance only",
      weeklyVolume: "1–2 conditioning sessions. Focus: repeat power efforts, NOT long aerobic sessions.",
      sessionFormat: "Repeat power intervals: 6–10 × 15-30 sec all-out effort with 90 sec rest | OR: Line drill complex (baseline to half, half to three-quarter, full court) × 6–8 with full rest",
      antiPattern: "NEVER prescribe long steady-state aerobic conditioning for basketball. Basketball is NOT a distance sport. Basketball conditioning is EXPLOSIVE, repeated, not continuous.",
      sportNote: "Basketball conditioning must mirror game demands: short explosive bursts, reactive transitions, incomplete rest — NOT endurance runs.",
    },
    sessionArchetypes: [
      { name: "Reactive Plyometric + Lower Strength", intent: "Vertical and horizontal power expression via reactive jumps + bilateral lower strength; the highest CNS session of the week", primaryFocus: ["power", "squat", "unilateral_lower", "trunk"], recoveryPriority: "high" },
      { name: "Upper Structural + Trunk", intent: "Press/pull structural balance for shoulder health; anti-rotation and rotational trunk work for jump landing stability", primaryFocus: ["upper_push", "upper_pull", "trunk", "rotational"], recoveryPriority: "moderate" },
      { name: "Deceleration / Landing / Elastic Power", intent: "Deceleration mechanics, landing patterns, depth jump SSC, lateral bound — reactive and elastic qualities distinct from pure strength", primaryFocus: ["power", "unilateral_lower", "lateral", "trunk"], recoveryPriority: "moderate" },
      { name: "Repeat Power Conditioning + Mobility Support", intent: "Basketball-specific conditioning: repeat explosive efforts, lateral movement, transition sprints — NOT long aerobic work", primaryFocus: ["locomotion", "lateral", "trunk"], conditioningRole: "Alactic/glycolytic repeat power — NOT aerobic endurance", recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: [
        "Reactive plyometrics (box jump, depth jump, lateral bound)",
        "Single-leg strength (RFESS, step-up, pistol or assisted)",
        "Deceleration and landing mechanics training",
        "Vertical jump work (squat jump, countermovement jump)",
        "Nordic hamstring curl or equivalent (tendon resilience)",
      ],
      preferred: [
        "Trap bar deadlift (joint-friendly bilateral posterior chain)",
        "Broad jump and lateral bound",
        "Copenhagen plank (adductor and groin resilience)",
        "Hip thrust (posterior chain force production without spinal load)",
        "Band work for knee and hip stability (clamshell, banded walk)",
        "Rotational med ball work (rotational throw, chest pass throw)",
        "Shoulder-care-conscious pressing (dumbbell press over barbell where appropriate)",
      ],
      reduced: [
        "Heavy barbell back squat (prefer trap bar or goblet for joint tolerance)",
        "Heavy barbell Romanian DL (prefer trap bar or single-leg for position health)",
        "Long-duration aerobic conditioning",
        "High-rep isolation chest/arm work without sport transfer",
      ],
      eliminated: [
        "Long-duration steady-state cardio as primary conditioning",
        "Olympic lifting without technical proficiency — injury risk in basketball athletes",
        "Heavy barbell back squat without thorough landing mechanics first — load the pattern safely",
      ],
      tissueConsiderations: [
        "Knee tendon (patellar) — trap bar over barbell squat, no excessive high-rep knee-dominant volume",
        "Ankle stability — single-leg balance work, calf strengthening",
        "Shoulder health — balanced push:pull, rotator cuff prep, avoid heavy internal rotation dominance",
        "Hamstring / adductor — Copenhagen plank and Nordic curls mandatory",
        "Landing mechanics — decel training is INJURY PREVENTION, not just performance",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Reactive Plyometric + Lower Strength | Day 2: Upper + Trunk | Day 3: Decel/Landing/Elastic Power + Conditioning",
      fourDayShape: "Day 1: Reactive Plyometric + Lower Strength | Day 2: Upper + Trunk | Day 3: Decel / Landing / Elastic | Day 4: Repeat Power Conditioning + Mobility",
    },
    seasonModulation: {
      off_season: {
        volumeModifier: 1.0,
        intensityModifier: 1.0,
        conditioningReduction: 1.0,
        priorityShift: "Build vertical power, deceleration capacity, and single-leg strength. Full volume and conditioning.",
        mandatoryAdjustments: ["Full plyometric volume", "Progressive depth jump introduction", "Conditioning at full prescription", "Maximal loading on primary lifts"],
      },
      pre_season: {
        volumeModifier: 0.8,
        intensityModifier: 0.9,
        conditioningReduction: 0.75,
        priorityShift: "Sharpen reactive quality and conditioning specificity. Reduce strength volume, increase reactive emphasis.",
        mandatoryAdjustments: ["Increase reactive agility work", "Reduce absolute heavy loading by 20%", "Shift conditioning to court-based repeat efforts"],
      },
      in_season: {
        volumeModifier: 0.55,
        intensityModifier: 0.85,
        conditioningReduction: 0.25,
        priorityShift: "MAINTENANCE: Protect vertical power and tendon health. Game demands provide conditioning. 2× per week max.",
        mandatoryAdjustments: ["2× lifting sessions per week maximum", "Maintain jump training at 40% normal volume — jumping must stay fresh", "NO extra conditioning — games provide it", "Prioritize tissue maintenance (Nordic, Copenhagen plank)"],
      },
      post_season: {
        volumeModifier: 0.5,
        intensityModifier: 0.7,
        conditioningReduction: 0.2,
        priorityShift: "Active recovery and tissue restoration. Light movement, decel quality maintenance, no aggressive loading.",
        mandatoryAdjustments: ["No depth jumps or heavy plyometrics", "Submaximal strength only", "Focus on mobility and tissue quality"],
      },
    },
    positionOverlays: {
      guard: "Guard overlay: INCREASE lateral quickness, COD mechanics, and reactive agility. Add first-step drills and defensive shuffle patterns. Reduce emphasis on heavy bilateral strength — prioritize reactive power.",
      big_post: "Big/Post overlay: INCREASE vertical power, landing mechanics, and bilateral lower strength. Add contact resilience work. Emphasize box-out position strength (high hinge and single-leg stability). Add shoulder injury prevention work.",
    },
    validationRules: [
      "Basketball program MUST include reactive plyometrics (box jump, depth jump, or lateral bound)",
      "Basketball program MUST include deceleration and landing mechanics training",
      "Basketball conditioning MUST be repeat power efforts — NOT long aerobic",
      "Basketball program must include single-leg strength work in every lower session",
      "Shoulder health work (push:pull balance) must be present every upper session",
      "Basketball program should NOT look like a football or endurance program",
    ],
    architectureDistinctions: "Basketball is reactive power and deceleration — vertical, lateral, and elastic. The program must include landing mechanics and single-leg training that other sports don't emphasize as heavily. Conditioning is explosive, not aerobic.",
  },

  // ── SOCCER ──────────────────────────────────────────────────────────────────
  soccer: {
    key: "soccer",
    displayName: "Soccer (Association Football)",
    tagline: "Repeat sprint ability, aerobic base, speed endurance, and lower-body resilience",
    physicalQualities: [
      { quality: "Repeat sprint ability", priority: "primary", description: "The ability to produce near-maximum sprint effort repeatedly with incomplete recovery — the most sport-defining quality" },
      { quality: "Aerobic base / Aerobic power", priority: "primary", description: "Soccer covers 10–13km per game — aerobic capacity underpins every other quality" },
      { quality: "Acceleration and first-step speed", priority: "primary", description: "Short explosive sprints (5–20m) for attacking and defensive transitions" },
      { quality: "Lower-body tissue resilience", priority: "secondary", description: "Hamstring, adductor, calf, and posterior chain health — most soccer injuries are soft tissue" },
      { quality: "Change of direction efficiency", priority: "secondary", description: "Multi-directional movement quality — cutting, tracking, closing, and defensive transitions" },
      { quality: "Single-leg strength", priority: "secondary", description: "All soccer contact and movement is single-leg — unilateral strength is foundational" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic + Repeat sprint ability — high aerobic base required; repeat sprint ability is the most sport-specific quality",
      secondaryEnergySystem: "Speed endurance — the ability to maintain sprint quality through a 90-minute game",
      weeklyVolume: "1–2 dedicated conditioning sessions. Aerobic AND sprint conditioning — both required, not interchangeable.",
      sessionFormat: "Aerobic: 20–30 min steady-state run at 65–75% max HR | RSA: 3–4 sets × 4–6 × 20–30m sprint with 20 sec intra-set rest and 3 min between sets",
      antiPattern: "NEVER replace sprint conditioning with gym circuits. Soccer conditioning includes both aerobic volume AND sprint quality. Replacing either with generic lifting circuits fails the athlete.",
      sportNote: "Soccer is the highest-aerobic-demand team sport. Both aerobic base and repeat sprint ability are required — they are not interchangeable and both must be trained.",
    },
    sessionArchetypes: [
      { name: "Acceleration + Hamstring Resilience", intent: "Sprint mechanics (0–20m) + Nordic curls, single-leg RDL, and posterior chain tissue work — addresses the two most common soccer injury vectors", primaryFocus: ["locomotion", "hinge", "unilateral_lower", "trunk"], recoveryPriority: "high" },
      { name: "Aerobic / Tempo + Lower Tissue Support", intent: "Dedicated aerobic base or tempo running + adductor/calf tissue maintenance — aerobic capacity underpins all sprint quality", primaryFocus: ["locomotion", "unilateral_lower"], conditioningRole: "Aerobic base or lactate threshold — sustained running, NOT intervals", recoveryPriority: "low" },
      { name: "Upper Structural + Trunk + Single-Leg Support", intent: "Upper strength balance for structural integrity; trunk control for contact and COD; single-leg strength support", primaryFocus: ["upper_push", "upper_pull", "trunk", "unilateral_lower"], recoveryPriority: "moderate" },
      { name: "Repeat Sprint Conditioning + Lower Tissue", intent: "RSA conditioning: multiple sprint sets with incomplete recovery — the most soccer-specific conditioning session", primaryFocus: ["locomotion", "hinge", "lateral"], conditioningRole: "Repeat Sprint Ability — sport-specific interval structure", recoveryPriority: "high" },
    ],
    exerciseEmphasis: {
      mustInclude: [
        "Nordic hamstring curl (mandatory for every lower-body session)",
        "Copenhagen plank / adductor loading (mandatory — adductors are highest injury risk)",
        "Single-leg RDL (posterior chain + balance + hamstring resilience)",
        "Sprint conditioning (BOTH aerobic and repeat sprint ability)",
        "Single-leg squat or RFESS",
      ],
      preferred: [
        "Trap bar deadlift (joint-friendly bilateral posterior chain)",
        "Calf raise and ankle strengthening",
        "Lateral lunge (adductor loading under dynamic conditions)",
        "Sled push (acceleration force production)",
        "Hip thrust (glute and hip extension for sprint propulsion)",
        "Rotational trunk (for COD and upper-body contact resilience)",
        "Face pull and shoulder care work",
      ],
      reduced: [
        "Heavy bilateral back squat without adequate posterior chain balance",
        "High-rep upper-body volume without sport purpose",
        "Machine isolation work without resilience or transfer value",
        "Conditioning sessions that are 'circuit training' rather than real energy system work",
      ],
      eliminated: [
        "Anaerobic-only conditioning without aerobic base component — soccer requires both",
        "Conditioning sessions that ignore repeat sprint ability",
        "Neglecting hamstring and adductor tissue work — these are the highest injury risk",
      ],
      tissueConsiderations: [
        "Hamstrings — Nordic curl is mandatory, not optional. Most common soccer injury.",
        "Adductors / groin — Copenhagen plank + lateral lunge every lower session",
        "Calves / Achilles — calf raise and ankle loading for tissue tolerance",
        "Knee tendon — manage high-rep knee-dominant volume carefully",
        "Hip flexor — hip flexor stretch + eccentric loading for injury prevention",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Acceleration + Hamstring Resilience | Day 2: Upper + Trunk + Single-Leg | Day 3: Repeat Sprint Conditioning + Lower Tissue",
      fourDayShape: "Day 1: Acceleration + Hamstring Resilience | Day 2: Aerobic/Tempo + Lower Tissue | Day 3: Upper + Trunk + Single-Leg | Day 4: Repeat Sprint Conditioning",
    },
    seasonModulation: {
      off_season: {
        volumeModifier: 1.0,
        intensityModifier: 1.0,
        conditioningReduction: 1.0,
        priorityShift: "Build aerobic base, repeat sprint capacity, and lower-body resilience. Full volume. Aggressive tissue loading.",
        mandatoryAdjustments: ["Full aerobic conditioning volume", "Full RSA conditioning", "Progressive Nordic curl loading", "Maximum Copenhagen plank frequency"],
      },
      pre_season: {
        volumeModifier: 0.8,
        intensityModifier: 0.9,
        conditioningReduction: 0.85,
        priorityShift: "Match fitness — shift from base building to sport-specific conditioning. Begin position-specific work.",
        mandatoryAdjustments: ["Transition aerobic sessions to RSA-emphasis", "Reduce gym volume", "Increase sprint quality and COD drills"],
      },
      in_season: {
        volumeModifier: 0.55,
        intensityModifier: 0.85,
        conditioningReduction: 0.3,
        priorityShift: "MAINTENANCE: Games provide conditioning. Protect hamstrings and adductors. Maintain lower-body resilience with reduced volume.",
        mandatoryAdjustments: ["2× gym sessions per week max", "Nordic curl maintained at 50% off-season volume — never skip", "Copenhagen plank maintained — highest injury prevention ROI", "NO extra running conditioning when game schedule is heavy"],
      },
      post_season: {
        volumeModifier: 0.45,
        intensityModifier: 0.65,
        conditioningReduction: 0.2,
        priorityShift: "Active recovery. Tissue restoration. Light movement only.",
        mandatoryAdjustments: ["Gentle aerobic flushing (jog, swim, bike — low impact)", "Tissue maintenance only", "No sprint work", "Passive stretching and recovery priority"],
      },
    },
    positionOverlays: {
      forward_wing: "Forward/Winger overlay: INCREASE acceleration (0–20m) and max velocity (20–60m). Wingers sprint further and faster. Add one additional sprint quality session per week. Adductor and hamstring work mandatory.",
      midfielder: "Midfielder overlay: INCREASE aerobic capacity and repeat sprint ability. Midfielders cover the most ground — aerobic base is the priority. Volume-tolerant conditioning. Balance bilateral and unilateral strength.",
      defender: "Defender overlay: INCREASE bilateral strength, COD mechanics, and aerial power. Defenders need strength for contact and heading. Add lateral deceleration mechanics. Nordic curl and Copenhagen mandatory.",
      goalkeeper: "Goalkeeper overlay: INCREASE reactive plyometrics (vertical jump, lateral dive), upper-body pressing and pulling, and COD/reactive agility. Reduce long aerobic sessions — keepers have different demands. Add shoulder health work.",
    },
    validationRules: [
      "Soccer program MUST include Nordic hamstring curl — every lower session",
      "Soccer program MUST include Copenhagen plank or adductor loading — every lower session",
      "Soccer program MUST include both aerobic conditioning AND repeat sprint conditioning",
      "Soccer conditioning must NOT be replaced with gym circuits or short-rest lifting",
      "Soccer program MUST include single-leg strength in every lower session",
      "Soccer program should NOT look like a football or basketball program structurally",
    ],
    architectureDistinctions: "Soccer has the highest aerobic demand of any team sport and the highest soft-tissue injury rate. The program must include BOTH real aerobic conditioning and repeat sprint work, AND mandatory tissue protection (Nordic, Copenhagen). This looks nothing like football.",
  },

  // ── BASEBALL ────────────────────────────────────────────────────────────────
  baseball: {
    key: "baseball",
    displayName: "Baseball / Softball",
    tagline: "Rotational power, short acceleration, arm-care-conscious upper body, and tissue support",
    physicalQualities: [
      { quality: "Rotational power", priority: "primary", description: "Hip-driven rotational force — the foundation of hitting, throwing, and pitching. Med ball rotational throws are as important as any lift." },
      { quality: "Short acceleration", priority: "primary", description: "0–30m sprint for baserunning and fielding. Baseball acceleration is short — max velocity rarely matters." },
      { quality: "Arm-care-conscious upper strength", priority: "primary", description: "Upper strength must be built around shoulder health — face pull, external rotation, scapular balance required" },
      { quality: "Trunk stiffness and anti-rotation", priority: "secondary", description: "The rotational power chain requires a stiff middle — anti-rotation trunk work converts hip rotation into power" },
      { quality: "Unilateral lower body", priority: "secondary", description: "Single-leg strength for fielding stance, stride position, and landing mechanics" },
      { quality: "Scapular and shoulder control", priority: "secondary", description: "Overhead throwing health — scapular upward rotation, retraction, and rotator cuff integrity" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic — short burst, full recovery. Baseball is the lowest aerobic demand of major team sports.",
      secondaryEnergySystem: "General work capacity — enough aerobic base to sustain effort across a 9-inning game",
      weeklyVolume: "1 dedicated conditioning session max. Short burst work, NOT soccer-style volume. Preserve power freshness above all else.",
      sessionFormat: "Short sprint repeats: 8–12 × 20–30m at 100% with 90 sec recovery | OR: general work capacity (assault bike, sled intervals) — 15 min total, low intensity",
      antiPattern: "NEVER prescribe high-volume running or soccer-style conditioning for baseball athletes. Baseball conditioning destroys power freshness. Short, sharp, done.",
      sportNote: "Baseball is a power-preservation sport. The conditioning goal is work capacity maintenance, NOT cardiovascular development. More conditioning = less explosive power.",
    },
    sessionArchetypes: [
      { name: "Rotational Power + Lower Strength", intent: "Med ball rotational throws + trap bar DL or squat — rotational force production foundation with bilateral lower strength support", primaryFocus: ["rotational", "hinge", "squat", "power", "trunk"], recoveryPriority: "high" },
      { name: "Arm-Care Upper + Shoulder Balance", intent: "Pressing and pulling balance with scapular health priority — NOT bodybuilding volume. Face pull, external rotation, and rotator cuff work mandatory.", primaryFocus: ["upper_pull", "upper_push", "trunk", "rotational"], recoveryPriority: "moderate" },
      { name: "Acceleration + Med Ball + Unilateral", intent: "Short sprint acceleration (0–30m) + med ball power expression + single-leg strength — the sport-transfer session", primaryFocus: ["locomotion", "power", "rotational", "unilateral_lower"], recoveryPriority: "high" },
      { name: "Trunk / Scapular / Tissue Support", intent: "Anti-rotation trunk integrity, scapular control work, unilateral posterior chain tissue support — injury prevention and power transfer session", primaryFocus: ["trunk", "upper_pull", "unilateral_lower"], recoveryPriority: "low" },
    ],
    exerciseEmphasis: {
      mustInclude: [
        "Medicine ball rotational throw (every power session — this IS baseball training)",
        "Trap bar deadlift or hex bar DL (safe bilateral posterior chain)",
        "Face pull and band external rotation (every upper session — arm care)",
        "Anti-rotation trunk (Pallof press, half-kneeling cable chop)",
        "Short sprint acceleration (20–30m with full recovery)",
      ],
      preferred: [
        "Landmine press (arm-care-conscious pressing variation)",
        "Single-leg RDL (unilateral posterior chain for throwing stance resilience)",
        "Hip thrust (glute development for hip rotation power)",
        "Rotational lunge with med ball",
        "Band pull-apart (scapular health)",
        "Copenhagen plank (hip resilience for fielding positions)",
        "Med ball slam and overhead toss (power expression)",
      ],
      reduced: [
        "Heavy overhead barbell pressing without arm-care balance",
        "High-rep internal rotation-dominant pressing (internal rotation overuse for pitchers)",
        "Long aerobic conditioning runs",
        "High-rep quad-dominant bilateral squat without rotational transfer",
      ],
      eliminated: [
        "High-volume overhead pressing without face pull and external rotation balance — arm care risk",
        "Soccer-style conditioning — destroys power freshness",
        "Heavy barbell behind-neck pressing or internal rotation-dominant isolation for pitchers",
      ],
      tissueConsiderations: [
        "Rotator cuff — face pull and band external rotation in EVERY upper session. Non-negotiable.",
        "Elbow (UCL) — avoid heavy internal rotation dominant loading, especially for pitchers",
        "Scapular health — serratus anterior, lower trapezius, and rhomboid work",
        "Hamstrings — sprint resilience, Nordic or single-leg RDL in lower sessions",
        "Hip rotation — hip flexor and rotational mobility for swing and throw mechanics",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Rotational Power + Lower Strength | Day 2: Arm-Care Upper + Shoulder Balance | Day 3: Acceleration + Med Ball + Unilateral",
      fourDayShape: "Day 1: Rotational Power + Lower Strength | Day 2: Arm-Care Upper + Shoulder Balance | Day 3: Acceleration + Med Ball + Unilateral | Day 4: Trunk / Scapular / Tissue Support",
    },
    seasonModulation: {
      off_season: {
        volumeModifier: 1.0,
        intensityModifier: 1.0,
        conditioningReduction: 1.0,
        priorityShift: "Build rotational power, lower strength, and arm structure. Full development phase.",
        mandatoryAdjustments: ["Full med ball rotational volume", "Progressive arm-care loading", "Maximum rotational power development", "Short sprint work at full prescription"],
      },
      pre_season: {
        volumeModifier: 0.8,
        intensityModifier: 0.9,
        conditioningReduction: 0.7,
        priorityShift: "Sharpen rotational power and short acceleration. Reduce absolute strength volume. Prioritize arm readiness.",
        mandatoryAdjustments: ["Maintain rotational med ball work", "Reduce heavy pressing — arm freshness", "Increase acceleration sprint quality", "ARM CARE maintained at full pre-season volume"],
      },
      in_season: {
        volumeModifier: 0.5,
        intensityModifier: 0.8,
        conditioningReduction: 0.2,
        priorityShift: "MAINTENANCE: Preserve rotational power and arm health. 2× gym sessions max. Game demands ARE the primary stress.",
        mandatoryAdjustments: ["2× sessions per week maximum", "NO extra conditioning — game schedule provides it", "Maintain arm-care work every session — face pull + external rotation", "Reduce big compound loading by 40%", "Pitchers: no heavy pressing 2 days before or after pitching"],
      },
      post_season: {
        volumeModifier: 0.4,
        intensityModifier: 0.6,
        conditioningReduction: 0.1,
        priorityShift: "Arm recovery and structural restoration. No throwing, no pitching-specific loading.",
        mandatoryAdjustments: ["Arm complete rest if pitcher", "Submaximal loading only", "Mobility and tissue restoration focus"],
      },
    },
    positionOverlays: {
      pitcher: "Pitcher overlay: CRITICAL — arm care is the highest priority. Eliminate heavy internal rotation dominant pressing. Maintain face pull and external rotation every upper session. NO heavy overhead pressing within 2 days of pitching. Add scapular upward rotation work (Y, T, W exercises). Rotational power emphasis for velocity.",
      hitter_field: "Hitter/Field player overlay: INCREASE rotational power (med ball rotational throw is primary exercise). Add hip rotation mobility and load. Bilateral lower strength for transfer. COD mechanics for fielding. Arm care still required — but less critical than pitchers.",
    },
    validationRules: [
      "Baseball program MUST include med ball rotational throws — every power session",
      "Baseball program MUST include face pull or external rotation work — every upper session",
      "Baseball conditioning MUST be short burst — NOT soccer-style aerobic volume",
      "Baseball program MUST include anti-rotation trunk work",
      "Upper pressing volume must be balanced with scapular pulling — no press-dominant bias",
      "Baseball program should NOT look like a soccer or endurance program structurally",
    ],
    architectureDistinctions: "Baseball is rotational power and arm care — not aerobic endurance, not hypertrophy, not generic strength. The med ball rotational throw is as important as the squat. The face pull is as important as the bench press. Conditioning is brief by design to preserve power freshness.",
  },

  // ── GENERAL ATHLETE ──────────────────────────────────────────────────────────
  general_athlete: {
    key: "general_athlete",
    displayName: "General Athletic Performance",
    tagline: "Balanced multi-quality athletic development — strength, power, speed, and conditioning",
    physicalQualities: [
      { quality: "Strength foundation", priority: "primary", description: "Compound bilateral and unilateral strength across all movement patterns" },
      { quality: "Power / Explosiveness", priority: "primary", description: "Force-velocity development across the spectrum — jumps, med ball, Olympic variations" },
      { quality: "Speed and acceleration", priority: "secondary", description: "Linear and lateral acceleration for general athletic demand" },
      { quality: "Conditioning capacity", priority: "secondary", description: "Work capacity appropriate to the athlete's goal — not sport-specific overemphasis" },
      { quality: "Tissue resilience", priority: "secondary", description: "General posterior chain, trunk, and joint resilience without sport-specific bias" },
    ],
    conditioning: {
      primaryEnergySystem: "Goal-dependent — use conditioning engine defaults",
      secondaryEnergySystem: "General work capacity",
      weeklyVolume: "1–2 conditioning sessions per goal",
      sessionFormat: "Determined by conditioning engine based on goal — aerobic / anaerobic / RSA as appropriate",
      antiPattern: "Do not apply sport-specific conditioning to a general athlete who has no sport context",
      sportNote: "General athletic performance programs should use the conditioning engine default — not sport-specific conditioning protocols",
    },
    sessionArchetypes: [
      { name: "Lower Force Production + Power", intent: "Bilateral lower strength + vertical/horizontal power — the foundational athletic session", primaryFocus: ["squat", "power", "unilateral_lower", "trunk"], recoveryPriority: "high" },
      { name: "Upper Structural Strength", intent: "Press/pull balance, structural shoulder integrity, upper trunk integrity", primaryFocus: ["upper_push", "upper_pull", "trunk"], recoveryPriority: "moderate" },
      { name: "Posterior Chain + Elastic Power", intent: "Hinge-dominant posterior chain + reactive plyometrics + single-leg stability", primaryFocus: ["hinge", "power", "unilateral_lower", "lateral"], recoveryPriority: "moderate" },
      { name: "Full Body Integration + Conditioning", intent: "Multi-pattern integration session + conditioning if goal requires", primaryFocus: ["power", "squat", "upper_push", "trunk"], conditioningRole: "Goal-dependent", recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: [
        "Heavy bilateral compound lower (squat or DL variation)",
        "Unilateral lower in every lower session",
        "Press + pull in every upper session",
        "Trunk work in every session",
        "Power/explosive exercise in every session",
      ],
      preferred: [
        "Contrast pairs for power development",
        "Nordic curl or RDL for posterior chain resilience",
        "Pallof press for trunk integrity",
        "Sprint acceleration work when days allow",
      ],
      reduced: [],
      eliminated: [
        "Hypertrophy-only isolation work when goal is athletic performance",
      ],
      tissueConsiderations: [
        "General posterior chain maintenance",
        "Trunk integrity — loaded carries and Pallof press",
        "Single-leg stability",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Lower Force Production + Power | Day 2: Upper Structural | Day 3: Posterior Chain + Elastic Power",
      fourDayShape: "Day 1: Lower Force Production | Day 2: Upper Structural | Day 3: Posterior Chain + Unilateral | Day 4: Full Body Integration",
    },
    seasonModulation: {
      off_season: {
        volumeModifier: 1.0,
        intensityModifier: 1.0,
        conditioningReduction: 1.0,
        priorityShift: "Full development — build all qualities",
        mandatoryAdjustments: [],
      },
      pre_season: {
        volumeModifier: 0.85,
        intensityModifier: 0.95,
        conditioningReduction: 0.8,
        priorityShift: "Sharpen qualities toward competition — reduce volume, maintain intensity",
        mandatoryAdjustments: ["Reduce accessory volume by 20%"],
      },
      in_season: {
        volumeModifier: 0.6,
        intensityModifier: 0.85,
        conditioningReduction: 0.4,
        priorityShift: "Maintenance — preserve qualities built, reduce volume",
        mandatoryAdjustments: ["2× sessions per week", "Reduce volume by 40%"],
      },
      post_season: {
        volumeModifier: 0.5,
        intensityModifier: 0.7,
        conditioningReduction: 0.3,
        priorityShift: "Recovery — active restoration and tissue maintenance",
        mandatoryAdjustments: ["No max effort work", "Submaximal loading only"],
      },
    },
    positionOverlays: {},
    validationRules: [
      "General athlete program must include power/explosive work in every session",
      "Must include both upper and lower compound movements across the week",
      "Must include trunk work in every session",
    ],
    architectureDistinctions: "General athletic performance — balanced development without sport-specific overemphasis. Conditioning, power, strength, and speed in proportion to the athlete's stated goal.",
  },

  // ── RUGBY ────────────────────────────────────────────────────────────────────
  rugby: {
    key: "rugby",
    displayName: "Rugby",
    tagline: "Collision resilience, repeat sprint ability, lower-body power, and aerobic capacity",
    physicalQualities: [
      { quality: "Collision resilience / Body armoring", priority: "primary", description: "Structural robustness for repeated contact — trunk bracing, structural strength, neck resilience" },
      { quality: "Repeat sprint ability", priority: "primary", description: "Like soccer but with contact — repeat explosive efforts after physical contact" },
      { quality: "Lower-body force production", priority: "primary", description: "Bilateral strength for scrummaging, tackling, and drive mechanics" },
      { quality: "Aerobic base", priority: "secondary", description: "80-minute game demands sustained aerobic output at moderate-to-high intensity" },
      { quality: "Upper structural strength", priority: "secondary", description: "Pressing and pulling for contact — tackle mechanics and ball-carrying" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic + RSA — like soccer but with contact fatigue component",
      secondaryEnergySystem: "Anaerobic glycolytic — short bursts after contact",
      weeklyVolume: "1–2 conditioning sessions — both aerobic base and RSA required",
      sessionFormat: "RSA: 3–4 × 5 × 20-30m with 20-sec intra-set rest | Aerobic: 20 min at 65–75% HR",
      antiPattern: "Do not program pure football-style anaerobic conditioning — rugby requires aerobic base too",
      sportNote: "Rugby sits between football (contact/power) and soccer (aerobic/RSA) — both energy systems must be trained",
    },
    sessionArchetypes: [
      { name: "Lower Force + Collision Prep", intent: "Bilateral lower strength + trunk bracing for contact resilience", primaryFocus: ["squat", "hinge", "trunk", "power"], recoveryPriority: "high" },
      { name: "Upper Structural + Contact Resilience", intent: "Press/pull balance + neck and shoulder structural strength for contact", primaryFocus: ["upper_push", "upper_pull", "trunk"], recoveryPriority: "moderate" },
      { name: "Acceleration + Power + RSA", intent: "Sprint acceleration + power development + RSA conditioning", primaryFocus: ["locomotion", "power", "unilateral_lower"], conditioningRole: "RSA — repeat sprint ability", recoveryPriority: "high" },
      { name: "Aerobic Base + Tissue Support", intent: "Aerobic conditioning + posterior chain tissue maintenance", primaryFocus: ["locomotion", "unilateral_lower"], conditioningRole: "Aerobic base", recoveryPriority: "low" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Heavy bilateral lower (squat, trap bar DL)", "Nordic hamstring curl", "Trunk bracing (loaded carry, Pallof press)", "Upper press + pull balance"],
      preferred: ["Sled push and carry", "Power clean", "Single-leg RDL", "Box jump", "Copenhagen plank"],
      reduced: ["High-rep isolation work without sport transfer"],
      eliminated: ["Pure aerobic-only conditioning without RSA component"],
      tissueConsiderations: ["Hamstrings — Nordic mandatory", "Neck and cervical spine — specific preparation for contact athletes", "Shoulder resilience — face pull and external rotation"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Lower Force + Collision Prep | Day 2: Upper Structural | Day 3: Acceleration + RSA",
      fourDayShape: "Day 1: Lower Force + Collision Prep | Day 2: Upper Structural | Day 3: Acceleration + Power | Day 4: Aerobic + Tissue",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Full development", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen conditioning specificity", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.55, intensityModifier: 0.85, conditioningReduction: 0.3, priorityShift: "Maintenance — games provide conditioning", mandatoryAdjustments: ["2× sessions max", "Maintain hamstring resilience work"] },
      post_season: { volumeModifier: 0.45, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Recovery and restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: [
      "Rugby must include both aerobic AND RSA conditioning",
      "Trunk bracing and collision prep must be present",
      "Nordic curl mandatory in lower sessions",
    ],
    architectureDistinctions: "Rugby combines football's contact demands with soccer's aerobic requirements — it needs both collision preparation and real aerobic/RSA conditioning.",
  },

  // ── LACROSSE ─────────────────────────────────────────────────────────────────
  lacrosse: {
    key: "lacrosse",
    displayName: "Lacrosse",
    tagline: "Acceleration, COD, rotational power, and repeat sprint ability",
    physicalQualities: [
      { quality: "Acceleration and COD", priority: "primary", description: "Multi-directional explosive speed — lacrosse is a fast-transition sport" },
      { quality: "Rotational power", priority: "primary", description: "Throwing and shooting require hip-driven rotational force" },
      { quality: "Repeat sprint ability", priority: "secondary", description: "Similar to soccer — repeat explosive efforts across a game" },
      { quality: "Upper structural strength", priority: "secondary", description: "Checking resilience and throwing mechanics" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic + glycolytic — mixed demands like basketball",
      secondaryEnergySystem: "Aerobic base for sustained field play",
      weeklyVolume: "1–2 conditioning sessions",
      sessionFormat: "RSA: 3–4 × 4–6 × 20–30m sprints | COD drills as conditioning",
      antiPattern: "Do not prescribe soccer-level aerobic volume without RSA component",
      sportNote: "Lacrosse resembles soccer in field demands but includes rotational power like baseball",
    },
    sessionArchetypes: [
      { name: "Acceleration + Rotational Power", intent: "Sprint mechanics + med ball rotational throws + lower strength", primaryFocus: ["locomotion", "rotational", "power", "squat"], recoveryPriority: "high" },
      { name: "Upper Structural + Rotational", intent: "Press/pull balance + rotational trunk for throwing mechanics", primaryFocus: ["upper_push", "upper_pull", "rotational", "trunk"], recoveryPriority: "moderate" },
      { name: "COD + RSA", intent: "Change of direction mechanics + repeat sprint conditioning", primaryFocus: ["locomotion", "lateral", "power"], conditioningRole: "RSA + COD conditioning", recoveryPriority: "high" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Med ball rotational throws", "Acceleration sprints", "Nordic hamstring curl", "Pallof press anti-rotation"],
      preferred: ["Lateral bound", "Single-leg RDL", "Sled push", "Hip thrust", "Copenhagen plank"],
      reduced: ["Heavy bilateral isolation without transfer"],
      eliminated: ["Pure aerobic-only conditioning"],
      tissueConsiderations: ["Hamstrings", "Shoulder for throwing", "Hip rotation and adductors"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Acceleration + Rotational Power + Lower | Day 2: Upper + Rotational | Day 3: COD + RSA",
      fourDayShape: "Day 1: Acceleration + Lower | Day 2: Upper + Rotational | Day 3: Rotational Power + Unilateral | Day 4: COD + RSA Conditioning",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Full development", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.55, intensityModifier: 0.85, conditioningReduction: 0.3, priorityShift: "Maintenance", mandatoryAdjustments: ["2× sessions max"] },
      post_season: { volumeModifier: 0.45, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Recovery", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Must include rotational power", "Must include sprint and COD conditioning", "Nordic curl required"],
    architectureDistinctions: "Lacrosse is like soccer + baseball — field sprint demands plus rotational power for throws and shots.",
  },

  // ── HOCKEY (standalone, extends existing hockey overlay) ──────────────────────
  hockey: {
    key: "hockey",
    displayName: "Ice Hockey",
    tagline: "Lateral power, edge mechanics, rotational trunk, and repeat sprint ability on ice",
    physicalQualities: [
      { quality: "Lateral force production", priority: "primary", description: "Edge mechanics and lateral power — all skating is lateral force, not linear sprint" },
      { quality: "Rotational trunk strength", priority: "primary", description: "Shooting, board battles, and stick-checking — all require rotational force" },
      { quality: "Acceleration / Deceleration on ice", priority: "primary", description: "First-step explosion and immediate deceleration — like basketball but on skates" },
      { quality: "Repeat sprint ability", priority: "secondary", description: "Shift-based explosive efforts — 45 sec on ice at maximum, full recovery, repeat" },
      { quality: "Single-leg stability", priority: "secondary", description: "Every skating stride is a single-leg push — RFESS, lateral step-up, single-leg RDL" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic + glycolytic — shift-based explosive efforts",
      secondaryEnergySystem: "Aerobic base for game-long recovery between shifts",
      weeklyVolume: "1–2 conditioning sessions",
      sessionFormat: "RSA: 4–6 × 30–45 sec all-out effort (bike or sled) with 2–3 min rest | Aerobic: 20 min steady-state for recovery between shifts",
      antiPattern: "Do not prescribe soccer-style long aerobic runs — hockey shifts are short explosive efforts",
      sportNote: "Hockey conditioning mirrors the shift-based demand: short explosive efforts with full rest between shifts",
    },
    sessionArchetypes: [
      { name: "Lower Force + Lateral Power", intent: "Squat strength + lateral bound + RFESS — edge mechanics and bilateral force foundation", primaryFocus: ["squat", "power", "unilateral_lower", "lateral", "trunk"], recoveryPriority: "high" },
      { name: "Upper + Rotational Trunk", intent: "Press/pull balance + rotational med ball + Pallof press — shot mechanics and board battle strength", primaryFocus: ["upper_push", "upper_pull", "rotational", "trunk"], recoveryPriority: "moderate" },
      { name: "Posterior Chain + Elastic Power + Lateral", intent: "Hinge + single-leg RDL + lateral lunge + Copenhagen plank — skating-specific posterior chain and adductor resilience", primaryFocus: ["hinge", "unilateral_lower", "lateral", "power"], recoveryPriority: "moderate" },
      { name: "Full Body Integration + Repeat Sprint", intent: "Power expression + sled/shuttle repeat effort conditioning — mirrors shift demands", primaryFocus: ["power", "squat", "lateral", "trunk"], conditioningRole: "RSA — shift-based explosive repeats", recoveryPriority: "high" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Lateral bound (every session)", "RFESS or lateral step-up (single-leg)", "Pallof press (anti-rotation)", "Rotational med ball throw", "Copenhagen plank (adductor resilience)"],
      preferred: ["Lateral lunge", "Single-leg RDL", "Sled push (lateral and forward)", "Face pull and shoulder care", "Snap-down drill for deceleration"],
      reduced: ["Bilateral-only lower body without lateral component", "Pure hypertrophy volume without skating transfer"],
      eliminated: ["Soccer-style long aerobic conditioning"],
      tissueConsiderations: ["Adductors (groin) — Copenhagen plank and lateral lunge mandatory", "Hip flexor — hip flexor eccentrics for skating position", "Shoulder — face pull and external rotation for puck handling", "Spine — rotational load management for slapshot mechanics"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Lower + Lateral Power | Day 2: Upper + Rotational | Day 3: Posterior + Elastic + Lateral",
      fourDayShape: "Day 1: Lower + Lateral | Day 2: Upper + Rotational | Day 3: Posterior + Unilateral | Day 4: Full Body + RSA",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build lateral power, rotational strength, and repeat sprint capacity", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Skate-specific integration — reduce gym volume, increase on-ice time", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.55, intensityModifier: 0.85, conditioningReduction: 0.3, priorityShift: "Maintenance — game schedule provides conditioning", mandatoryAdjustments: ["2× sessions max", "Maintain Copenhagen plank", "Reduce heavy bilateral loading on game-day -1"] },
      post_season: { volumeModifier: 0.45, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Recovery — hip and adductor restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {
      goalkeeper: "Goalie overlay: INCREASE lateral reactive movement (lateral bound, lateral shuffle), hip mobility, and single-leg stability. ADD T-push-up and rotational stability for save mechanics. Reduce heavy lower compound loading.",
    },
    validationRules: ["Must include lateral bound or lateral step-up", "Must include Pallof press (anti-rotation)", "Must include Copenhagen plank or adductor work", "Rotational med ball mandatory"],
    architectureDistinctions: "Hockey is lateral power and rotational force — the gym must train lateral mechanics and rotational strength, not just linear force.",
  },

  // ── TRACK ────────────────────────────────────────────────────────────────────
  track: {
    key: "track",
    displayName: "Track & Field (Sprint Focus)",
    tagline: "Maximum sprint velocity, acceleration mechanics, and force-velocity development",
    physicalQualities: [
      { quality: "Maximum velocity", priority: "primary", description: "Top-end sprint speed — the primary track quality for sprinters" },
      { quality: "Acceleration mechanics", priority: "primary", description: "0–30m drive phase — force application, first-step power" },
      { quality: "Force-velocity (strength-speed)", priority: "secondary", description: "Gym work that translates to sprint force application" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic — 100m sprint is fully alactic; 200m is alactic + glycolytic",
      secondaryEnergySystem: "Speed endurance (400m / longer sprints)",
      weeklyVolume: "Sprint sessions ARE the conditioning — gym work is secondary",
      sessionFormat: "Sprint sessions primary, gym work supplementary",
      antiPattern: "Never treat sprint work as conditioning — sprints are quality work, not volume work",
      sportNote: "Track sprinters: sprint sessions are the primary training stimulus. Gym work serves sprint mechanics.",
    },
    sessionArchetypes: [
      { name: "Acceleration Development + Strength", intent: "Sprint mechanics + heavy bilateral lower for force application", primaryFocus: ["locomotion", "squat", "hinge"], recoveryPriority: "high" },
      { name: "Max Velocity + Speed-Strength", intent: "Fly sprints + Olympic lifting or trap bar jump", primaryFocus: ["locomotion", "power"], recoveryPriority: "high" },
      { name: "Strength Support", intent: "Bilateral and unilateral lower strength + trunk — supports sprint mechanics", primaryFocus: ["squat", "hinge", "unilateral_lower", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Sprint acceleration work (10–30m)", "Max velocity fly sprints", "Nordic hamstring curl", "Heavy trap bar DL or squat"],
      preferred: ["Power clean or hang clean", "Hip thrust", "Pallof press", "Single-leg RDL"],
      reduced: ["High-rep conditioning work after sprints"],
      eliminated: ["Long aerobic conditioning sessions — destroys sprint quality"],
      tissueConsiderations: ["Hamstrings — Nordic mandatory", "Hip flexor — eccentric loading", "Calf and Achilles — calf strengthening"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Acceleration + Lower Strength | Day 2: Strength Support | Day 3: Max Velocity + Speed-Strength",
      fourDayShape: "Day 1: Acceleration | Day 2: Lower Strength | Day 3: Max Velocity | Day 4: Speed-Strength + Accessory",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build strength and acceleration base", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.95, conditioningReduction: 0.85, priorityShift: "Sharpen sprint quality", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.9, conditioningReduction: 0.3, priorityShift: "Maintain and sharpen — competitions are the primary stimulus", mandatoryAdjustments: ["No sprint work day before competition"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Recovery", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Sprint work must appear before gym work", "Nordic curl mandatory"],
    architectureDistinctions: "Track sprinters: gym work serves sprint mechanics. Sprint sessions come first in every session.",
  },

  // ── VOLLEYBALL ────────────────────────────────────────────────────────────────
  volleyball: {
    key: "volleyball",
    displayName: "Volleyball",
    tagline: "Vertical power, reactive landing, shoulder health, and jump endurance",
    physicalQualities: [
      { quality: "Vertical jump power", priority: "primary", description: "Box jumps, depth jumps, countermovement jumps — volleyball is vertical" },
      { quality: "Shoulder health and arm care", priority: "primary", description: "Spiking and serving loads — rotator cuff, scapular balance" },
      { quality: "Reactive landing", priority: "secondary", description: "Jump landing mechanics — injury prevention and elastic return" },
      { quality: "Jump endurance", priority: "secondary", description: "Repeat jumping across sets — alactic + short aerobic support" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic — explosive jumps with brief rest between rallies",
      secondaryEnergySystem: "Aerobic base for game-long endurance",
      weeklyVolume: "1 conditioning session — jump endurance circuit or repeat effort",
      sessionFormat: "Jump endurance: 4 × 10 box jumps + 10 lateral bounds with 90 sec rest | OR repeat effort: 4 × 20 sec all-out with 90 sec rest",
      antiPattern: "No heavy plyometric volume without arm and shoulder care balance",
      sportNote: "Volleyball is vertical power + shoulder health — both must be trained in balance",
    },
    sessionArchetypes: [
      { name: "Vertical Power + Lower Strength", intent: "Box jump + depth jump + bilateral lower strength", primaryFocus: ["power", "squat", "unilateral_lower", "trunk"], recoveryPriority: "high" },
      { name: "Shoulder Health + Upper Structural", intent: "Arm care, scapular balance, pressing with external rotation balance", primaryFocus: ["upper_push", "upper_pull", "trunk"], recoveryPriority: "moderate" },
      { name: "Reactive Landing + Lower Resilience", intent: "Landing mechanics + single-leg strength + tendon resilience", primaryFocus: ["power", "unilateral_lower", "lateral"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Box jump and reactive jump training", "Face pull (every upper session)", "Single-leg lower", "Nordic hamstring curl"],
      preferred: ["Copenhagen plank", "Trap bar DL", "Y/T/W scapular exercises", "Band external rotation"],
      reduced: ["Heavy overhead pressing without arm care balance"],
      eliminated: ["Neglecting shoulder care work — spikers have very high shoulder overuse risk"],
      tissueConsiderations: ["Rotator cuff — mandatory care", "Knee (patellar) tendon — manage jump volume", "Ankle — single-leg stability"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Vertical Power + Lower | Day 2: Shoulder Health + Upper | Day 3: Reactive Landing + Lower Resilience",
      fourDayShape: "Day 1: Vertical Power + Lower | Day 2: Shoulder + Upper | Day 3: Reactive + Single-leg | Day 4: Jump Endurance + Trunk",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build vertical power and shoulder structure", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.75, priorityShift: "Sharpen jump quality and arm readiness", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.55, intensityModifier: 0.85, conditioningReduction: 0.25, priorityShift: "Maintenance — arm care non-negotiable in-season", mandatoryAdjustments: ["2× sessions max", "Face pull every session", "Reduce jump volume 40%"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.15, priorityShift: "Shoulder restoration and recovery", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Vertical jump training mandatory", "Face pull mandatory every upper session", "Shoulder care present every upper session"],
    architectureDistinctions: "Volleyball combines basketball's vertical demands with baseball's arm care requirements — both must be addressed in every program.",
  },
};

// ─── Sport Normalization ──────────────────────────────────────────────────────

export function mapSportToProfile(sport: string | null): SportProfile | null {
  if (!sport) return null;
  const s = sport.toLowerCase().trim();

  if (s.includes("football") && !s.includes("soccer")) return SPORT_PROFILES.football;
  if (s.includes("basketball")) return SPORT_PROFILES.basketball;
  if (s.includes("soccer") || (s.includes("football") && s.includes("soccer"))) return SPORT_PROFILES.soccer;
  if (s.includes("baseball") || s.includes("softball")) return SPORT_PROFILES.baseball;
  if (s.includes("hockey")) return SPORT_PROFILES.hockey;
  if (s.includes("rugby")) return SPORT_PROFILES.rugby;
  if (s.includes("lacrosse")) return SPORT_PROFILES.lacrosse;
  if (s.includes("track") || s.includes("sprint")) return SPORT_PROFILES.track;
  if (s.includes("volleyball")) return SPORT_PROFILES.volleyball;

  // Keyword-based detection for non-standard sport names
  if (/\b(lineman|linebacker|defensive|quarterback|wide receiver|running back|corner|safety)\b/.test(s)) return SPORT_PROFILES.football;
  if (/\b(point guard|shooting guard|power forward|center)\b/.test(s)) return SPORT_PROFILES.basketball;
  if (/\b(striker|winger|midfielder|goalkeeper|fullback)\b/.test(s)) return SPORT_PROFILES.soccer;
  if (/\b(pitcher|catcher|shortstop|outfield|infield)\b/.test(s)) return SPORT_PROFILES.baseball;

  return null;
}

// ─── Position Normalization ───────────────────────────────────────────────────

export function detectPosition(request: string, sport: SportKey | null): PlayerPosition {
  const r = request.toLowerCase();

  if (sport === "football") {
    if (/lineman|guard|tackle|center|offensive line|defensive line|nose tackle/.test(r)) return "lineman";
    if (/wide receiver|running back|quarterback|corner|safety|tight end|linebacker|db|wr|rb|qb/.test(r)) return "skill";
  }
  if (sport === "basketball") {
    if (/point guard|shooting guard|pg|sg|guard/.test(r)) return "guard";
    if (/forward|wing|small forward|power forward|sf|pf/.test(r)) return "forward_wing";
    if (/center|big|post/.test(r)) return "big_post";
  }
  if (sport === "soccer") {
    if (/goalkeeper|keeper|goalie/.test(r)) return "goalkeeper";
    if (/striker|forward|winger|cf|lw|rw/.test(r)) return "forward_wing";
    if (/midfielder|cm|cdm|cam|box.to.box/.test(r)) return "midfielder";
    if (/defender|cb|lb|rb|fullback/.test(r)) return "defender";
  }
  if (sport === "baseball" || sport === "lacrosse") {
    if (/pitcher|p$|starting pitcher|closer|reliever/.test(r)) return "pitcher";
    if (/hitter|batter|fielder|outfield|infield|catcher|shortstop/.test(r)) return "hitter_field";
  }

  return null;
}

// ─── Season Detection ─────────────────────────────────────────────────────────

export function detectSeasonContext(request: string, profileSeason: SeasonContext): SeasonContext {
  if (profileSeason) return profileSeason;
  const r = request.toLowerCase();
  if (/in.season|during.season|game.week|competition/.test(r)) return "in_season";
  if (/off.season|offseason/.test(r)) return "off_season";
  if (/pre.season|preseason|training.camp/.test(r)) return "pre_season";
  if (/post.season|postseason|after.season|recovery/.test(r)) return "post_season";
  return null;
}

// ─── Sport Context Builder (AI Prompt Injection) ──────────────────────────────

export function buildSportContext(
  sport: string | null,
  goal: string,
  request: string,
  season: SeasonContext,
  equipment: string,
  daysPerWeek: number,
): string {
  const profile = mapSportToProfile(sport);
  if (!profile) return "";

  const position = detectPosition(request + " " + goal, profile.key);
  const seasonCtx = detectSeasonContext(request, season);
  const seasonData = seasonCtx ? profile.seasonModulation[seasonCtx] : null;

  const qualities = profile.physicalQualities.map(q =>
    `  [${q.priority.toUpperCase()}] ${q.quality}: ${q.description}`
  ).join("\n");

  const archetypes = profile.sessionArchetypes.map((a, i) =>
    `  Session ${i + 1}: ${a.name}\n  → ${a.intent}${a.conditioningRole ? `\n  → Conditioning: ${a.conditioningRole}` : ""}`
  ).join("\n\n");

  const emphasisMust = profile.exerciseEmphasis.mustInclude.map(e => `  ✓ ${e}`).join("\n");
  const emphasisPreferred = profile.exerciseEmphasis.preferred.map(e => `  → ${e}`).join("\n");
  const emphasisEliminated = profile.exerciseEmphasis.eliminated.map(e => `  ✗ ${e}`).join("\n");
  const tissueNotes = profile.exerciseEmphasis.tissueConsiderations.map(t => `  ! ${t}`).join("\n");

  const validationLines = profile.validationRules.map(r => `  - [ ] ${r}`).join("\n");

  const positionText = position && profile.positionOverlays[position]
    ? `\n### POSITION OVERLAY: ${position.toUpperCase()}\n${profile.positionOverlays[position]}`
    : "";

  const seasonText = seasonData ? `
### SEASON MODULATION: ${seasonCtx?.replace("_", " ").toUpperCase()}
Volume: ${Math.round(seasonData.volumeModifier * 100)}% of normal | Intensity: ${Math.round(seasonData.intensityModifier * 100)}%
Conditioning: ${Math.round(seasonData.conditioningReduction * 100)}% of off-season prescription
Priority shift: ${seasonData.priorityShift}
Mandatory adjustments:
${seasonData.mandatoryAdjustments.map(a => `  - ${a}`).join("\n")}
` : "";

  const weeklyShape = daysPerWeek <= 3
    ? profile.weeklyArchitectureGuidance.threeDayShape
    : profile.weeklyArchitectureGuidance.fourDayShape;

  return `
## SPORT-SPECIFIC ARCHITECTURE — ${profile.displayName.toUpperCase()} — MANDATORY

This program is for a ${profile.displayName} athlete. Generic athletic programming is NOT acceptable.
The program MUST reflect real ${profile.displayName} architecture, exercise emphasis, and conditioning demands.

"${profile.tagline}"

What makes this sport's programming distinct:
${profile.architectureDistinctions}

### PHYSICAL QUALITY PRIORITIES
${qualities}

### CONDITIONING REQUIREMENTS
Primary energy system: ${profile.conditioning.primaryEnergySystem}
Secondary energy system: ${profile.conditioning.secondaryEnergySystem}
Weekly conditioning volume: ${profile.conditioning.weeklyVolume}
Session format: ${profile.conditioning.sessionFormat}
ANTI-PATTERN: ${profile.conditioning.antiPattern}
Sport note: ${profile.conditioning.sportNote}

### SESSION ARCHETYPES FOR THIS SPORT
These are the session identities that must shape the weekly program:
${archetypes}

### WEEKLY ARCHITECTURE GUIDANCE (${daysPerWeek} days)
${weeklyShape}

### EXERCISE EMPHASIS
MUST INCLUDE (mandatory in this sport's program):
${emphasisMust}

PREFERRED (strongly recommended):
${emphasisPreferred}

ELIMINATED (do not include without clinical justification):
${emphasisEliminated}

TISSUE CONSIDERATIONS (injury prevention priorities):
${tissueNotes}
${positionText}${seasonText}
### SPORT-SPECIFIC VALIDATION CHECKLIST
Before outputting this program, verify:
${validationLines}

### LANGUAGE REQUIREMENT
When describing this program, name the sport-specific rationale explicitly:
- NOT: "Added explosive work" → YES: "Built around ${profile.displayName}'s ${profile.physicalQualities[0]?.quality} demands"
- NOT: "Conditioning finisher" → YES: "${profile.conditioning.sessionFormat.split("|")[0]?.trim() ?? "Sport-specific conditioning format"}"
- The program description must reference what makes ${profile.displayName} programming distinct from other sports
`.trim();
}

// ─── Validation Rule Retrieval ────────────────────────────────────────────────

export function getSportValidationRules(sport: string | null): string[] {
  const profile = mapSportToProfile(sport);
  return profile?.validationRules ?? [];
}

// ─── Season-Aware Volume Guidance ─────────────────────────────────────────────

export function getSeasonModulation(sport: string | null, season: SeasonContext): SeasonModulation | null {
  const profile = mapSportToProfile(sport);
  if (!profile || !season) return null;
  return profile.seasonModulation[season] ?? null;
}
