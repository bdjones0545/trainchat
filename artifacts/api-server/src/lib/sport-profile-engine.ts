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
  | "volleyball"
  | "tennis"
  | "combat_sports"
  | "swimming"
  | "golf"
  | "rowing"
  | "cycling"
  // ── New sports (Phase 1 expansion) ──────────────────────────────────────
  | "pickleball"
  | "padel"
  | "badminton"
  | "squash"
  | "bowling"
  | "flag_football"
  | "softball"
  | "wrestling"
  | "boxing"
  | "mma"
  | "cricket"
  | "cricket_bowler"
  | "cricket_batter"
  | "cricket_wicketkeeper";

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

  // ── TENNIS ────────────────────────────────────────────────────────────────────
  tennis: {
    key: "tennis",
    displayName: "Tennis / Racket Sports",
    tagline: "Rotational power, deceleration, wrist/elbow tolerance, and reactive multi-directional speed",
    physicalQualities: [
      { quality: "Rotational power", priority: "primary", description: "Ground stroke and serve mechanics originate from the hips — rotational force is the primary athletic currency" },
      { quality: "Multi-directional reactive speed", priority: "primary", description: "Court coverage — lateral, diagonal, and forward/back sprint with immediate deceleration" },
      { quality: "Deceleration and split-step mechanics", priority: "primary", description: "The split-step and first-step explosion: reactive preparation before every shot" },
      { quality: "Shoulder and elbow structural health", priority: "secondary", description: "Serving and rallying create high repetitive stress — rotator cuff and medial elbow care is non-negotiable" },
      { quality: "Single-leg stability", priority: "secondary", description: "Open-stance forehand, serve stance, lateral lunge — tennis is played on one leg repeatedly" },
      { quality: "Grip and forearm strength", priority: "tertiary", description: "Racket control and wrist stability — forearm resilience supports longevity" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic + glycolytic — points are short explosive bursts; sets and matches extend into glycolytic and aerobic support",
      secondaryEnergySystem: "Aerobic base for match endurance and recovery between points",
      weeklyVolume: "1–2 conditioning sessions — court conditioning preferred over gym-based",
      sessionFormat: "Repeat sprint: 4–6 × 10–15m multi-directional at 90–100% with 45–90 sec rest | OR: split-step + first-step reactive drill complex",
      antiPattern: "Do not prescribe heavy aerobic volume without sport-specific movement patterns. Tennis conditioning must include reactive and directional components.",
      sportNote: "Tennis conditioning should mirror court demands: short burst, reactive, directional — not long-distance running.",
    },
    sessionArchetypes: [
      { name: "Rotational Power + Lower Strength", intent: "Med ball rotational throws + hip-driven lower strength — the foundation of every ground stroke and serve", primaryFocus: ["rotational", "power", "squat", "hinge"], recoveryPriority: "high" },
      { name: "Shoulder Health + Upper Structural", intent: "Rotator cuff care, scapular stability, press/pull balance — protect the most vulnerable joint in tennis", primaryFocus: ["upper_push", "upper_pull", "trunk", "rotational"], recoveryPriority: "moderate" },
      { name: "Deceleration + Reactive Speed + Unilateral", intent: "COD mechanics, split-step reactive work, single-leg stability — court movement quality", primaryFocus: ["lateral", "power", "unilateral_lower", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Med ball rotational throws (every lower or full-body session)", "Split-step + first-step reactive drill", "Rotator cuff care (external rotation, face pull)", "Pallof press anti-rotation", "Copenhagen plank"],
      preferred: ["Lateral lunge and lateral step-up", "Single-leg RDL", "Hip thrust", "Band external rotation and face pull", "Lateral bound", "Wrist and forearm rolling (if wrist stress is present)"],
      reduced: ["Heavy bilateral barbell work without rotational transfer emphasis", "High-rep overhead pressing without arm care balance"],
      eliminated: ["Long aerobic runs as primary conditioning", "Neglecting shoulder and elbow care work — injury risk is too high"],
      tissueConsiderations: [
        "Medial elbow (golfer's elbow in servers) — forearm eccentric loading, wrist flexor care",
        "Rotator cuff — external rotation work mandatory every upper session",
        "Knee (patellar) — manage jump and sprint volume",
        "Adductor / groin — wide lateral lunges and Copenhagen plank",
        "Lumbar spine — rotational load management, anti-extension for serve hyperextension",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Rotational Power + Lower Strength | Day 2: Shoulder Health + Upper | Day 3: Deceleration + Reactive + Unilateral",
      fourDayShape: "Day 1: Rotational Power + Lower | Day 2: Shoulder + Upper | Day 3: Decel + Reactive | Day 4: Full Body Integration + Trunk",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build rotational power, deceleration quality, and structural durability", mandatoryAdjustments: ["Full rotational work", "Full conditioning volume", "Progressive shoulder loading"] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen reactive speed and serve mechanics", mandatoryAdjustments: ["Increase court-specific conditioning", "Reduce absolute strength volume"] },
      in_season: { volumeModifier: 0.55, intensityModifier: 0.85, conditioningReduction: 0.3, priorityShift: "Maintenance — shoulder care is non-negotiable during match play", mandatoryAdjustments: ["2× sessions max", "Face pull and external rotation every session", "No heavy pressing the day before match"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Shoulder and elbow restoration", mandatoryAdjustments: ["No heavy rotational loading", "Focus on tissue recovery and mobility"] },
    },
    positionOverlays: {},
    validationRules: ["Med ball rotational throw mandatory", "Face pull or external rotation every upper session", "Pallof press mandatory", "No heavy aerobic-only conditioning"],
    architectureDistinctions: "Tennis is rotational power + shoulder durability + reactive multi-directional speed. Programs must address all three — neglecting any one creates either injury or performance gaps.",
  },

  // ── COMBAT SPORTS ─────────────────────────────────────────────────────────────
  combat_sports: {
    key: "combat_sports",
    displayName: "Combat Sports / MMA",
    tagline: "Functional strength, isometric tolerance, grappling-specific trunk, and sport-specific conditioning",
    physicalQualities: [
      { quality: "Functional strength under fatigue", priority: "primary", description: "The ability to produce force in compromised, non-standard positions — wrestling, clinch work, submission escapes" },
      { quality: "Isometric and grip strength", priority: "primary", description: "Holding positions, controlling the clinch, escaping submissions — isometric force tolerance is critical" },
      { quality: "Rotational and anti-rotation trunk strength", priority: "primary", description: "Punch generation, hip escape, guard pass — the trunk transfers force in every direction" },
      { quality: "Explosive power (striking and takedowns)", priority: "secondary", description: "First-step takedown explosion, punch power — alactic power for decisive moments" },
      { quality: "Aerobic + glycolytic conditioning capacity", priority: "secondary", description: "MMA rounds are 5 minutes of mixed-intensity effort — aerobic base matters more than in team sports" },
      { quality: "Structural resilience", priority: "secondary", description: "Neck, shoulder, hip, and knee durability for contact and ground work" },
    ],
    conditioning: {
      primaryEnergySystem: "Mixed: alactic (explosive attacks), glycolytic (scrambles), aerobic (round-length pacing)",
      secondaryEnergySystem: "Aerobic base matters — fighters gas out when aerobic capacity is insufficient",
      weeklyVolume: "2–3 conditioning sessions integrated with sparring/drilling schedule",
      sessionFormat: "Rounds-based: 4–6 × 5 min with 1 min rest (mirror fight rounds) | OR: Energy system work: 30 sec on / 30 sec off × 10–15 rounds on bag or partner",
      antiPattern: "Do not program conditioning as if this is a sprint sport — fighters need both power AND aerobic capacity. Don't neglect aerobic base.",
      sportNote: "Combat sports conditioning must develop all three energy systems — fighters who only train power gas out; fighters who only do cardio lose explosive capacity.",
    },
    sessionArchetypes: [
      { name: "Strength + Power Foundation", intent: "Loaded carries, compound pulls, explosive work — functional strength for takedowns, clinch, and positional dominance", primaryFocus: ["hinge", "squat", "power", "trunk"], recoveryPriority: "high" },
      { name: "Upper Structural + Rotational Trunk", intent: "Pull-dominant upper body, rotational trunk for punch mechanics, anti-rotation for grappling positions", primaryFocus: ["upper_pull", "upper_push", "rotational", "trunk"], recoveryPriority: "moderate" },
      { name: "Grip + Isometric + Conditioning", intent: "Grip strength, isometric trunk holds, kettlebell work, and energy system conditioning for round-length output", primaryFocus: ["trunk", "hinge", "power"], conditioningRole: "Mixed energy system — rounds-based conditioning", recoveryPriority: "high" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Farmer carry and cross-body carry (grip + trunk)", "Pallof press (anti-rotation for grappling)", "RKC plank or hollow body hold", "Pull-up or weighted pull-up", "Trap bar or conventional deadlift"],
      preferred: ["Kettlebell swing", "Sled push and drag (grappling transfer)", "Single-leg RDL", "Band face pull (shoulder care)", "Copenhagen plank", "Rotational med ball throws (punch power)", "Single-arm work (mirrors asymmetric fight positions)"],
      reduced: ["Pure isolation work without functional transfer", "Heavy overhead pressing without rotator cuff balance"],
      eliminated: ["Bodybuilding-style pump training without functional application", "Neglecting conditioning — fighters need energy system work, not just gym strength"],
      tissueConsiderations: [
        "Neck — neck strengthening if in contact sport (appropriate for fighter populations)",
        "Shoulder — high volume of clinch and ground work creates rotator cuff stress",
        "Wrist and grip — grip endurance work mandatory",
        "Knee (BJJ/wrestling) — kneeling position stress, single-leg stability work",
        "Hip flexor — guard work creates chronic hip flexion load",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Strength + Power | Day 2: Upper + Rotational Trunk | Day 3: Grip + Isometric + Conditioning",
      fourDayShape: "Day 1: Strength + Power | Day 2: Upper + Rotational | Day 3: Lower + Explosive | Day 4: Conditioning + Grip + Trunk",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build strength base, improve conditioning capacity, increase volume tolerance", mandatoryAdjustments: ["Full conditioning prescription", "Heavy compound loading", "Energy system development"] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.85, priorityShift: "Camp preparation — conditioning quality increases, strength maintained", mandatoryAdjustments: ["Integrate with fight camp sparring schedule", "Reduce absolute loading — maintain intensity"] },
      in_season: { volumeModifier: 0.55, intensityModifier: 0.85, conditioningReduction: 0.4, priorityShift: "Fight week — taper everything. Sparring IS the conditioning.", mandatoryAdjustments: ["Reduce to 2 sessions max", "No heavy lower body day before weigh-ins", "Maintain grip and trunk work"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.3, priorityShift: "Recovery — tissue restoration, rehydration, structural health", mandatoryAdjustments: ["No sparring", "Light movement only", "Shoulder and hip restoration priority"] },
    },
    positionOverlays: {},
    validationRules: ["Farmer carry or loaded carry mandatory", "Pallof press mandatory (anti-rotation for grappling)", "Pull-dominant upper body", "Conditioning component required (energy system work)", "Grip work present"],
    architectureDistinctions: "Combat sports demand functional strength in non-standard positions, isometric resilience for grappling, rotational power for striking, and real conditioning across all three energy systems. Programs must address all of these — not just gym strength.",
  },

  // ── SWIMMING ─────────────────────────────────────────────────────────────────
  swimming: {
    key: "swimming",
    displayName: "Swimming",
    tagline: "Shoulder structural integrity, rotational power, trunk stiffness, and pulling strength",
    physicalQualities: [
      { quality: "Shoulder structural health and range of motion", priority: "primary", description: "High-volume shoulder rotation in water creates overuse risk — structural balance and scapular control are critical" },
      { quality: "Pulling strength and lat development", priority: "primary", description: "The catch and pull phase is the primary propulsion — vertical pulling strength directly transfers" },
      { quality: "Trunk stiffness and streamline position", priority: "primary", description: "The streamline is an anti-extension and anti-rotation position — trunk stiffness improves efficiency" },
      { quality: "Hip and ankle flexibility for kick mechanics", priority: "secondary", description: "Ankle plantar flexion and hip rotation range of motion — flutter and dolphin kick efficiency" },
      { quality: "Rotational power (freestyle and butterfly)", priority: "secondary", description: "Body rotation drives pull mechanics — rotational trunk training has direct stroke transfer" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic dominant (distance) — alactic for sprinters (50m, 100m)",
      secondaryEnergySystem: "Glycolytic for middle-distance (200m–400m)",
      weeklyVolume: "Gym conditioning is minimal — pool sessions provide primary cardiovascular training",
      sessionFormat: "Gym work serves the pool, not the other way around. No additional cardio unless specified by coach.",
      antiPattern: "Do NOT program heavy shoulder pressing without extensive rotator cuff care balance. Do NOT treat gym work as the primary training stimulus — the pool is.",
      sportNote: "Swimmers train very high pool volume. Gym work must be complementary and targeted — not adding to an already high training load.",
    },
    sessionArchetypes: [
      { name: "Pulling Strength + Shoulder Health", intent: "Vertical pulling (pull-up, lat pull-down) + rotator cuff care — build the pull pattern that drives freestyle and butterfly", primaryFocus: ["upper_pull", "upper_push", "trunk"], recoveryPriority: "moderate" },
      { name: "Trunk + Hip Flexibility + Rotational Power", intent: "Anti-extension and anti-rotation trunk work + rotational power + hip and ankle mobility — streamline position and rotation efficiency", primaryFocus: ["trunk", "rotational", "hinge", "lateral"], recoveryPriority: "moderate" },
      { name: "Lower Body Strength + Kick Support", intent: "Lower body strength for turns and starts + hip/ankle mobility for kick mechanics", primaryFocus: ["squat", "hinge", "unilateral_lower"], recoveryPriority: "low" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Pull-up or lat pull-down (vertical pull)", "Face pull and band external rotation (every session)", "Dead bug or hollow body hold (streamline trunk)", "Shoulder scapular positioning work (wall slides, Y/T/W)"],
      preferred: ["Rotational med ball throw", "Hip thrust (turn mechanics)", "Pallof press", "Band pull-apart", "Ankle mobility drills", "Hip flexor eccentric loading"],
      reduced: ["Heavy overhead barbell pressing — high shoulder stress without structural benefit", "Excessive knee-dominant loading without hip and posterior chain balance"],
      eliminated: ["Neglecting rotator cuff care — shoulder injury risk in swimmers is the highest of any overhead sport", "Additional aerobic conditioning in the gym — pool training already provides this"],
      tissueConsiderations: [
        "Rotator cuff — swimmer's shoulder is a real syndrome; external rotation and scapular care is mandatory",
        "Bicep tendon (long head) — high pulling volume creates stress; eccentric care",
        "Knee (breaststroke) — medial knee stress in breaststroke kick; single-leg stability",
        "Lumbar spine — butterfly and hyperlordotic position in streamline; anti-extension mandatory",
        "Ankle — ankle plantar flexion flexibility directly impacts kick efficiency",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Pulling Strength + Shoulder Health | Day 2: Trunk + Rotational Power + Hip Mobility | Day 3: Lower Body + Kick Support",
      fourDayShape: "Day 1: Pulling + Shoulder | Day 2: Trunk + Rotational | Day 3: Lower + Hip Mobility | Day 4: Integrated Full Body + Arm Care",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build pulling strength, shoulder structure, and trunk stiffness", mandatoryAdjustments: ["Progressive pulling volume", "Full shoulder care program"] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen specificity — pulling strength peaks, shoulder care maintained", mandatoryAdjustments: ["Reduce lower body volume", "Emphasize shoulder care as pool volume increases"] },
      in_season: { volumeModifier: 0.55, intensityModifier: 0.8, conditioningReduction: 0.2, priorityShift: "Maintenance — pool training is maximal; gym work is supportive only", mandatoryAdjustments: ["2× gym sessions max", "Face pull every session", "No heavy pressing — pool load is already high"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.15, priorityShift: "Shoulder restoration — rest the overused joint complex", mandatoryAdjustments: ["Rotator cuff restoration focus", "No heavy pulling for first 2 weeks"] },
    },
    positionOverlays: {},
    validationRules: ["Face pull or external rotation mandatory every session", "Vertical pull (pull-up or lat pull-down) mandatory", "Dead bug or hollow body hold mandatory", "No additional cardiovascular conditioning in gym"],
    architectureDistinctions: "Swimmers have the highest shoulder overuse risk of any sport. The gym program must protect the shoulder first and build pull strength second. Gym work is supplementary — never additive to an already high pool training load.",
  },

  // ── GOLF ──────────────────────────────────────────────────────────────────────
  golf: {
    key: "golf",
    displayName: "Golf",
    tagline: "Rotational power, anti-rotation stability, hip mobility, and structural balance for 18+ holes",
    physicalQualities: [
      { quality: "Rotational power and speed", priority: "primary", description: "The golf swing is a rotational power expression — hip drive, X-factor stretch, and separation generate clubhead speed" },
      { quality: "Anti-rotation and lead-side stability", priority: "primary", description: "The ability to resist and control rotation through impact — trunk anti-rotation is what protects the lower back and generates power transfer" },
      { quality: "Hip mobility and thoracic rotation", priority: "primary", description: "Full backswing requires thoracic rotation and hip internal/external range of motion — restriction here directly limits swing mechanics" },
      { quality: "Lower body stability and balance", priority: "secondary", description: "Weight transfer, single-leg control through impact — lower body is the foundation, not just the driver" },
      { quality: "Lumbar spine health", priority: "secondary", description: "The golf swing repeatedly loads the lumbar spine in rotation and lateral flexion — posterior chain strength protects the lower back" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic — 18 holes is 4–5 hours of low-intensity activity with brief explosions",
      secondaryEnergySystem: "Minimal glycolytic demand — golf is largely skill and power expression, not metabolic endurance",
      weeklyVolume: "Minimal dedicated conditioning — walking the course provides cardiovascular work",
      sessionFormat: "Walking tolerance, hip mobility circuit, and rotational warm-up are more valuable than traditional conditioning for golf performance",
      antiPattern: "Do NOT program heavy aerobic conditioning. Do NOT program heavy hip extension loading that tightens the hip flexors and restricts the backswing.",
      sportNote: "Golf fitness is about mobility + stability + rotational power. Conditioning is secondary unless the player is physically deconditioned.",
    },
    sessionArchetypes: [
      { name: "Rotational Power + Hip Drive", intent: "Med ball rotational throws + hip thrust + anti-rotation Pallof press — the swing power sequence", primaryFocus: ["rotational", "power", "hinge", "trunk"], recoveryPriority: "moderate" },
      { name: "Hip and Thoracic Mobility + Structural Balance", intent: "Hip flexor, thoracic rotation, ankle — mobility restrictions that limit backswing and rotation", primaryFocus: ["lateral", "trunk", "hinge", "upper_pull"], recoveryPriority: "low" },
      { name: "Lower Body Strength + Balance", intent: "Single-leg strength and balance — weight transfer and follow-through stability", primaryFocus: ["squat", "unilateral_lower", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Med ball rotational throws (every session)", "Pallof press anti-rotation", "Hip thrust", "Single-leg work", "Thoracic rotation mobility work"],
      preferred: ["90/90 hip mobility", "Hip flexor stretch and eccentric loading", "Cable woodchop and reverse woodchop", "Lateral lunge", "Band pull-apart", "Face pull", "Glute bridge"],
      reduced: ["Heavy overhead pressing — shoulder restriction affects backswing", "High-volume hip flexor loading (squats, RDLs in excess) without mobility counterbalance"],
      eliminated: ["Long aerobic conditioning sessions", "Exercises that increase spinal compression without improving rotational mechanics"],
      tissueConsiderations: [
        "Lumbar spine — the most common golf injury; posterior chain strengthening and anti-rotation mandatory",
        "Lead knee (lateral collapse through impact) — single-leg stability work",
        "Lead wrist (impact shock) — wrist and forearm tolerance",
        "Hip (limited IR/ER) — hip mobility is a primary performance and injury limiter",
        "Thoracic spine — thoracic rotation restriction limits backswing; mobilization mandatory",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Rotational Power + Hip Drive | Day 2: Mobility + Structural Balance | Day 3: Lower Strength + Balance",
      fourDayShape: "Day 1: Rotational Power + Lower | Day 2: Upper + Anti-Rotation | Day 3: Mobility + Hip Drive | Day 4: Lower Balance + Trunk",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build rotational power, hip mobility, and structural balance — the three pillars of golf fitness", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.9, priorityShift: "Sharpen rotation quality and mobility — reduce loading that creates tightness near the swing", mandatoryAdjustments: ["Reduce heavy hip flexor loading", "Increase mobility volume"] },
      in_season: { volumeModifier: 0.55, intensityModifier: 0.8, conditioningReduction: 0.3, priorityShift: "Maintenance — protect mobility and keep rotational power sharp", mandatoryAdjustments: ["2× sessions max around tournament schedule", "Mobility circuit before every session", "No heavy loading within 48h of tournament round"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Lumbar and hip restoration", mandatoryAdjustments: ["Focus on tissue recovery", "Mobility emphasis"] },
    },
    positionOverlays: {},
    validationRules: ["Med ball rotational throw mandatory", "Pallof press mandatory", "Hip mobility work present every session", "Lumbar spine health accounted for in exercise selection"],
    architectureDistinctions: "Golf fitness is not a strength sport — it is a mobility + stability + rotational power sport. Programs that look like powerlifting blocks will restrict the swing. Every exercise must either produce rotational power, protect the spine, or improve the ranges of motion required by the swing.",
  },

  // ── ROWING ────────────────────────────────────────────────────────────────────
  rowing: {
    key: "rowing",
    displayName: "Rowing",
    tagline: "Posterior chain strength, pulling endurance, aerobic capacity, and hip drive for the rowing stroke",
    physicalQualities: [
      { quality: "Hip drive and posterior chain strength", priority: "primary", description: "The drive phase of the rowing stroke is a hip extension — deadlift and hip hinge patterns directly transfer" },
      { quality: "Pulling strength and endurance", priority: "primary", description: "The catch-to-finish arm pull — vertical and horizontal pull strength in a fatigued state" },
      { quality: "Aerobic capacity", priority: "primary", description: "Rowing races are aerobic (2,000m is ~6–8 min) — the aerobic system is the primary energy system" },
      { quality: "Trunk stiffness and force transfer", priority: "secondary", description: "The trunk transfers leg drive to the handle — anti-flexion and anti-extension under load is essential" },
      { quality: "Leg drive and quad strength", priority: "secondary", description: "The catch position loads the legs in a compressed squat — leg press and squat patterns develop this" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic dominant — 2,000m race is ~6–8 minutes at near-maximal aerobic intensity",
      secondaryEnergySystem: "Glycolytic (1,000m sprint) and alactic (racing start)",
      weeklyVolume: "2–3 conditioning sessions complementing on-water training",
      sessionFormat: "Ergo intervals: 6 × 500m with 3 min rest | OR: 4 × 8 min at threshold with 4 min rest | OR: 20–30 min steady-state aerobic",
      antiPattern: "Do NOT skip aerobic conditioning — rowing is an aerobic sport. Gym strength without aerobic capacity does not transfer to rowing performance.",
      sportNote: "Rowing is one of the most aerobically demanding sports — both aerobic capacity AND posterior chain strength must be developed.",
    },
    sessionArchetypes: [
      { name: "Hip Drive + Posterior Chain Strength", intent: "Deadlift / RDL / hip thrust — the foundational strength of the drive phase", primaryFocus: ["hinge", "squat", "trunk"], recoveryPriority: "high" },
      { name: "Pulling Strength + Upper Structural", intent: "Pull-up, bent-over row, face pull — the pull phase under accumulating fatigue", primaryFocus: ["upper_pull", "upper_push", "trunk"], recoveryPriority: "moderate" },
      { name: "Ergo Conditioning + Core Endurance", intent: "Aerobic energy system work + trunk endurance under fatigue — mirror race demands", primaryFocus: ["trunk", "hinge"], conditioningRole: "Aerobic — ergo intervals or steady-state", recoveryPriority: "high" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Conventional or trap bar deadlift", "Pull-up or weighted pull-up", "Bent-over row", "Hip thrust or glute bridge", "Dead bug or RKC plank (trunk transfer)"],
      preferred: ["RDL", "Single-arm row", "Face pull", "Lat pull-down", "Goblet squat or leg press", "Pallof press", "Good morning"],
      reduced: ["Heavy pressing without pulling balance — rowers are already pull-dominant from training", "High-rep plyometrics without recovery consideration"],
      eliminated: ["Pure hypertrophy-driven programs without aerobic integration", "Neglecting aerobic conditioning — the ergo is the primary tool"],
      tissueConsiderations: [
        "Lumbar spine — repeated flexion under load; anti-flexion trunk work is protective",
        "Rib stress fractures — common in high-volume rowers; manage trunk compression loading",
        "Knee — compressed catch position; quad strength and knee tolerance",
        "Shoulder — high pulling volume; rotator cuff and scapular care",
        "Wrist and forearm — handle grip under fatigue",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Hip Drive + Posterior Chain | Day 2: Pulling + Upper | Day 3: Ergo Conditioning + Core",
      fourDayShape: "Day 1: Hip Drive + Posterior Chain | Day 2: Pulling + Upper | Day 3: Ergo Conditioning | Day 4: Full Body Integration + Trunk",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build posterior chain strength and aerobic base — the two pillars of rowing performance", mandatoryAdjustments: ["Full ergo conditioning volume", "Progressive deadlift loading", "Pull-up volume"] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.85, priorityShift: "Race-specific conditioning emphasis — ergo intervals replace steady-state, gym maintained", mandatoryAdjustments: ["Reduce gym volume 20%", "Increase ergo interval intensity"] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.85, conditioningReduction: 0.4, priorityShift: "On-water training is primary — gym work is supportive", mandatoryAdjustments: ["2× gym sessions max", "Face pull mandatory for shoulder care", "No heavy deadlift day before race"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.3, priorityShift: "Rest and lumbar restoration", mandatoryAdjustments: ["Unload the spine", "Light aerobic only", "Shoulder and hip mobility focus"] },
    },
    positionOverlays: {},
    validationRules: ["Deadlift or RDL mandatory", "Pull-up or vertical pull mandatory", "Aerobic conditioning component required", "Anti-flexion trunk work present"],
    architectureDistinctions: "Rowing demands posterior chain strength AND aerobic capacity together — it is one of the most complete athletic demands. The gym must develop both, and ergo conditioning must be part of the program.",
  },

  // ── PICKLEBALL ────────────────────────────────────────────────────────────────
  pickleball: {
    key: "pickleball",
    displayName: "Pickleball",
    tagline: "Lateral deceleration, reactive split-step, anti-rotation stability, and paddle-elbow resilience",
    physicalQualities: [
      { quality: "Lateral deceleration and court coverage", priority: "primary", description: "The kitchen line demands constant lateral shuffle and rapid stop-start — deceleration is the defining physical demand" },
      { quality: "Reactive split-step and elastic reactivity", priority: "primary", description: "Every opponent shot requires a reactive split-step — SSC efficiency determines court coverage quality" },
      { quality: "Anti-rotation trunk stability", priority: "primary", description: "Dink stability and paddle control at the net demand a stiff, controlled trunk — trunk bracing prevents unnecessary body rotation" },
      { quality: "Shoulder and elbow resilience", priority: "secondary", description: "Lateral epicondylitis ('pickleball elbow') and rotator cuff overuse are the most common pickleball injuries — shoulder care is mandatory" },
      { quality: "Change of direction and acceleration", priority: "secondary", description: "Short explosive court dashes from the baseline to the kitchen and back — repeat COD effort" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic + repeat burst — short point exchanges with near-full recovery",
      secondaryEnergySystem: "Aerobic base for game-length endurance (2–3 hr recreational sessions)",
      weeklyVolume: "1–2 conditioning sessions. Lateral agility, reactive footwork, not long aerobic runs.",
      sessionFormat: "Lateral shuffle intervals: 6–10 × 10m lateral with decel stop, 60s rest | OR: split-step reactive drills × 8–12 reps",
      antiPattern: "NEVER program heavy long-duration aerobic conditioning as the primary prescription. Pickleball is short-burst reactive, not endurance. Heavy bilateral lifting without lateral work misses the primary physical demand.",
      sportNote: "Pickleball athletes need lateral deceleration, reactive stiffness, and shoulder/elbow resilience above all else. The sport is played at a low top speed but with constant direction changes on a small court.",
    },
    sessionArchetypes: [
      { name: "Lateral Decel + Reactive Footwork", intent: "Lateral bounds, split-step drills, Cossack squat — the primary movement demands of pickleball", primaryFocus: ["lateral", "power", "unilateral_lower"], recoveryPriority: "moderate" },
      { name: "Anti-Rotation + Shoulder Resilience", intent: "Pallof press, face pull, external rotation — trunk stability for dink control and elbow/shoulder injury prevention", primaryFocus: ["trunk", "upper_pull", "upper_push"], recoveryPriority: "low" },
      { name: "Unilateral Lower + COD Support", intent: "Single-leg strength, lateral lunge, step-up — unilateral lower body for wide-ball lunges and court coverage", primaryFocus: ["unilateral_lower", "power", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: [
        "Lateral bound or lateral box jump",
        "Pallof press (anti-rotation)",
        "Face pull or external rotation (shoulder/elbow care)",
        "Lateral lunge or Cossack squat",
        "Single-leg lower body (RFESS, step-up)",
      ],
      preferred: [
        "Single-leg pogo or ankle hops (reactive stiffness)",
        "Copenhagen plank (adductor/groin resilience)",
        "Cable woodchop (rotational control)",
        "Nordic hamstring curl",
        "Wrist and forearm loading (reverse curl, farmer's carry)",
        "Reactive agility drill (split-step pattern)",
      ],
      reduced: [
        "Heavy bilateral back squat without lateral work balance",
        "Long aerobic conditioning runs",
        "High-volume overhead pressing without shoulder care balance",
      ],
      eliminated: [
        "Long steady-state cardio as primary conditioning",
        "Programs with no lateral movement training — court coverage is everything",
      ],
      tissueConsiderations: [
        "Lateral epicondyle (elbow) — face pull and external rotation every session",
        "Rotator cuff — overhead patterns with care; band work protective",
        "Wrist/forearm — forearm flexor/extensor balance for paddle control",
        "Ankle — lateral decel demands ankle stiffness training",
        "Knee — lunging patterns require VMO strength and tracking",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Lateral Decel + Reactive Footwork | Day 2: Anti-Rotation + Shoulder Resilience | Day 3: Unilateral Lower + COD",
      fourDayShape: "Day 1: Lateral Reactive + Lower | Day 2: Shoulder + Trunk | Day 3: Unilateral Strength | Day 4: Conditioning + Mobility",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build lateral strength, reactive stiffness, and shoulder resilience", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen reactive quality and shoulder care", mandatoryAdjustments: ["Increase agility volume", "Elbow/shoulder care every session"] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.3, priorityShift: "Maintenance — games provide primary training stimulus", mandatoryAdjustments: ["2× sessions max", "Face pull and external rotation every session", "No heavy overhead pressing day of play"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Elbow and shoulder restoration", mandatoryAdjustments: ["Focus on tissue recovery", "Eccentric forearm loading"] },
    },
    positionOverlays: {},
    validationRules: [
      "Lateral movement training mandatory (lateral bound, lateral lunge, or COD drill)",
      "Shoulder/elbow care (face pull, external rotation) every session",
      "Anti-rotation work (Pallof press) present every session",
      "No long aerobic conditioning as primary prescription",
    ],
    architectureDistinctions: "Pickleball is a lateral-reactive sport played on a small court. Acceleration tops out at ~10m. The defining demands are deceleration, reactive split-step, and anti-rotation dink stability — not straight-line speed or aerobic endurance. Elbow and shoulder injury prevention is mandatory.",
  },

  // ── PADEL ─────────────────────────────────────────────────────────────────────
  padel: {
    key: "padel",
    displayName: "Padel",
    tagline: "Lateral-reactive court coverage, rotational shot power, wall-reaction stiffness, and elbow/shoulder resilience",
    physicalQualities: [
      { quality: "Lateral deceleration and court coverage", priority: "primary", description: "Padel's enclosed court demands constant lateral shuttle and rapid decel — players must also react off walls" },
      { quality: "Rotational shot power", priority: "primary", description: "Padel shots require hip-shoulder rotation through impact — rotational power directly increases shot velocity" },
      { quality: "Wall-reaction elastic stiffness", priority: "primary", description: "Reacting to balls off the glass walls is a unique padel demand — SSC stiffness and reactive ability are essential" },
      { quality: "Elbow and shoulder resilience", priority: "secondary", description: "Similar overuse profile to pickleball — lateral epicondylitis and rotator cuff are primary injury risks" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic + repeat burst — similar to pickleball but with longer point sequences",
      secondaryEnergySystem: "Aerobic support for 1–2 hr match duration",
      weeklyVolume: "1–2 conditioning sessions. Lateral reactive drills and repeat sprint ability.",
      sessionFormat: "Lateral shuttle intervals + split-step reactive drills × 8–12 with 60s rest",
      antiPattern: "Do not substitute lateral agility with bilateral strength-only sessions. Wall-reaction and lateral movement must be trained.",
      sportNote: "Padel combines racket sport demands with wall-play reactions. Both lateral COD and rotational power need development.",
    },
    sessionArchetypes: [
      { name: "Lateral Reactive + Rotational Power", intent: "Court movement + med ball rotational work — the two primary padel performance demands", primaryFocus: ["lateral", "rotational", "power"], recoveryPriority: "moderate" },
      { name: "Shoulder Resilience + Anti-Rotation", intent: "External rotation, face pull, Pallof press — elbow/shoulder care and trunk control", primaryFocus: ["trunk", "upper_pull"], recoveryPriority: "low" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Lateral bound or lateral box jump", "Med ball rotational throw", "Face pull or external rotation", "Pallof press"],
      preferred: ["Copenhagen plank", "Single-leg pogo", "Cable woodchop", "Lateral lunge", "Wrist/forearm loading"],
      reduced: ["Long aerobic conditioning", "Heavy bilateral work without lateral balance"],
      eliminated: ["Programs with no lateral movement or rotational development"],
      tissueConsiderations: ["Lateral elbow — external rotation and face pull mandatory", "Rotator cuff — shoulder care every session", "Ankle — lateral decel demands stiffness training"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Lateral Reactive + Lower | Day 2: Rotational Power + Trunk | Day 3: Shoulder + Unilateral",
      fourDayShape: "Day 1: Lateral + Lower | Day 2: Rotational Power | Day 3: Shoulder Resilience | Day 4: COD + Conditioning",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build rotational power, lateral strength, and shoulder resilience", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen reactive agility and shot power", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.3, priorityShift: "Maintenance and shoulder protection", mandatoryAdjustments: ["Face pull every session", "2× sessions max"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Shoulder and elbow restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Lateral movement training mandatory", "Shoulder/elbow care every session", "Rotational power present"],
    architectureDistinctions: "Padel is played in an enclosed glass court — wall reactions create unique reactive demands beyond typical racket sports. Rotational power for shot-making and lateral deceleration for court coverage are equally important.",
  },

  // ── BADMINTON ─────────────────────────────────────────────────────────────────
  badminton: {
    key: "badminton",
    displayName: "Badminton",
    tagline: "Overhead smash power, extreme lunge mechanics, reactive split-step, and high aerobic demand",
    physicalQualities: [
      { quality: "Overhead smash and arm speed", priority: "primary", description: "The smash is badminton's signature — rotator cuff strength, wrist speed, and shoulder endurance define performance" },
      { quality: "Lunge mechanics (four-corner coverage)", priority: "primary", description: "Badminton requires deep lunges to all four court corners — unilateral lower body strength and hip flexibility are critical" },
      { quality: "Reactive split-step and elastic stiffness", priority: "primary", description: "The shuttle travels faster than any other racket sport object — reactive stiffness and split-step timing are survival skills" },
      { quality: "High aerobic capacity", priority: "secondary", description: "Badminton is the most aerobically demanding racket sport — sustained 45-minute sets at high intensity" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic + repeat sprint — high aerobic base with explosive burst pattern",
      secondaryEnergySystem: "Alactic — split-step and explosive court coverage",
      weeklyVolume: "2 conditioning sessions. Mix of aerobic base and reactive sprint work.",
      sessionFormat: "6–8 × 20m shuttle sprints with 60s rest + aerobic base running 20 min at 65–70% max HR",
      antiPattern: "Do not neglect aerobic conditioning — badminton is uniquely aerobic for a racket sport. Do not skip overhead shoulder care.",
      sportNote: "Badminton players need both a high aerobic engine AND explosive reactive qualities. Heavy overhead smash volume creates significant rotator cuff load.",
    },
    sessionArchetypes: [
      { name: "Overhead Strength + Shoulder Care", intent: "Landmine press, external rotation, face pull — overhead power and rotator cuff protection", primaryFocus: ["upper_push", "upper_pull", "trunk"], recoveryPriority: "moderate" },
      { name: "Lunge Strength + Reactive Footwork", intent: "Lateral lunge, split-step drills, single-leg lower — four-corner coverage and lunge deceleration", primaryFocus: ["unilateral_lower", "lateral", "power"], recoveryPriority: "high" },
      { name: "Aerobic Conditioning + Trunk", intent: "Aerobic intervals + anti-rotation work — match endurance and trunk control", primaryFocus: ["trunk", "locomotion"], conditioningRole: "Aerobic + repeat sprint", recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Lateral lunge or Cossack squat (four-corner lunge)", "Face pull and external rotation (rotator cuff)", "Single-leg lower (RFESS, step-up)", "Lateral bound or reactive footwork drills"],
      preferred: ["Landmine press (shoulder-joint-friendly overhead)", "Copenhagen plank (groin for extreme lunge positions)", "Nordic hamstring curl", "Pallof press", "Single-leg pogo"],
      reduced: ["Heavy barbell overhead press — shoulder joint risk without functional transfer", "Long bilateral slow lifting sessions without reactive work"],
      eliminated: ["Neglecting aerobic conditioning", "Neglecting rotator cuff care — smash volume creates overuse"],
      tissueConsiderations: ["Rotator cuff — mandatory care every session", "Groin/adductor — extreme lunge positions; Copenhagen plank essential", "Ankle — lateral court movement; stiffness training required", "Shoulder — highest overhead demand of common racket sports"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Lunge + Reactive Lower | Day 2: Overhead + Shoulder Care | Day 3: Aerobic Conditioning + Trunk",
      fourDayShape: "Day 1: Lunge + Lower | Day 2: Overhead + Shoulder | Day 3: Aerobic Conditioning | Day 4: Reactive Footwork + Trunk",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build aerobic base, lunge strength, and overhead resilience", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen reactive quality and aerobic sharpness", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.3, priorityShift: "Maintenance — protect shoulder and groin", mandatoryAdjustments: ["Face pull every session", "Copenhagen plank every session"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Shoulder restoration and groin recovery", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Lunge mechanics training mandatory", "Rotator cuff care every session", "Aerobic conditioning present", "Lateral reactive work present"],
    architectureDistinctions: "Badminton demands the highest aerobic output of any racket sport AND the highest overhead load. Lunge depth and four-corner coverage are physically unique. No other racket sport combines this aerobic demand with such extreme lunge positions.",
  },

  // ── SQUASH ────────────────────────────────────────────────────────────────────
  squash: {
    key: "squash",
    displayName: "Squash",
    tagline: "Extreme aerobic capacity, lunge mechanics, lateral deceleration, and repeat sprint ability",
    physicalQualities: [
      { quality: "Aerobic capacity (extremely high)", priority: "primary", description: "Squash generates higher heart rates than almost any other sport — the aerobic engine must be extensively developed" },
      { quality: "Lunge mechanics and groin strength", priority: "primary", description: "Extreme lunge positions to all four corners — groin, hip, and quad strength directly limit performance and injury risk" },
      { quality: "Lateral deceleration and COD", priority: "primary", description: "Constant direction changes in a small enclosed space — deceleration quality determines court coverage efficiency" },
      { quality: "Repeat sprint ability", priority: "secondary", description: "High-intensity point after high-intensity point with incomplete recovery — repeat sprint capacity is directly trained" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic — very high VO2max demand; squash sustains near-maximal heart rate",
      secondaryEnergySystem: "Glycolytic repeat sprint — intense point exchanges",
      weeklyVolume: "2 dedicated conditioning sessions. Aerobic base and repeat sprint work both required.",
      sessionFormat: "Aerobic: 25–35 min at 70–80% max HR | RSA: 8–12 × 20–30m with 30s rest",
      antiPattern: "Do not neglect aerobic conditioning — squash is among the highest aerobic demand sports. Skipping aerobic base limits performance.",
      sportNote: "Squash is more aerobically demanding than soccer or basketball. Both a high aerobic base AND explosive repeat sprint capacity must be developed.",
    },
    sessionArchetypes: [
      { name: "Lunge Strength + Lateral Lower", intent: "Cossack squat, lateral lunge, Copenhagen plank — the extreme groin and hip demands of squash lunge mechanics", primaryFocus: ["unilateral_lower", "lateral", "trunk"], recoveryPriority: "high" },
      { name: "Aerobic Conditioning + Trunk", intent: "Aerobic base work + anti-rotation trunk — match endurance and control", primaryFocus: ["trunk", "locomotion"], conditioningRole: "Aerobic — sustained intensity", recoveryPriority: "moderate" },
      { name: "Upper Structural + Shoulder Care", intent: "Pulling strength, face pull, structural balance — overhead and shoulder maintenance", primaryFocus: ["upper_pull", "upper_push", "trunk"], recoveryPriority: "low" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Cossack squat or lateral lunge", "Copenhagen plank", "Aerobic conditioning", "Lateral bound or reactive drill"],
      preferred: ["RFESS", "Nordic hamstring curl", "Face pull", "Pallof press", "Single-leg RDL"],
      reduced: ["Heavy bilateral without lateral balance", "Anaerobic-only conditioning"],
      eliminated: ["Neglecting aerobic conditioning — squash is an aerobic sport"],
      tissueConsiderations: ["Groin/adductor — extreme lunge positions; Copenhagen plank mandatory", "Ankle — lateral decel demands", "Knee — deep lunge mechanics; VMO and glute strength essential"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Lunge + Lateral Lower | Day 2: Aerobic Conditioning + Trunk | Day 3: Upper + Shoulder Care",
      fourDayShape: "Day 1: Lunge + Lower | Day 2: Aerobic Conditioning | Day 3: Upper + Trunk | Day 4: Reactive COD + Mobility",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build aerobic base, lunge capacity, and COD quality", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.85, priorityShift: "Sharpen aerobic intensity and reactive quality", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.35, priorityShift: "Maintenance — protect groin and shoulder", mandatoryAdjustments: ["Copenhagen plank every session", "2× sessions max"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Groin and lower limb restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Aerobic conditioning mandatory", "Lunge mechanics training present", "Copenhagen plank present", "Lateral reactive work present"],
    architectureDistinctions: "Squash is one of the most aerobically demanding sports in existence. The combination of extreme lunge depths, constant direction changes, and sustained near-maximal intensity creates a uniquely demanding training environment.",
  },

  // ── BOWLING ───────────────────────────────────────────────────────────────────
  bowling: {
    key: "bowling",
    displayName: "Bowling (10-Pin)",
    tagline: "Rotational power, anti-rotation stability, unilateral asymmetry resilience, and forearm/wrist control",
    physicalQualities: [
      { quality: "Rotational power and wrist control", priority: "primary", description: "Ball release is a rotational power expression through wrist snap — forearm and wrist control directly determines hook and speed" },
      { quality: "Anti-rotation trunk stability", priority: "primary", description: "A stable, controlled trunk through the approach prevents back injury and improves consistency" },
      { quality: "Unilateral asymmetry resilience", priority: "primary", description: "Every delivery is a single-arm, single-side motion — repeated asymmetrical loading requires counterbalancing and tissue tolerance" },
      { quality: "Hip hinge mechanics and approach deceleration", priority: "secondary", description: "The slide delivery requires hip hinge, lateral lunge, and controlled deceleration to the foul line" },
    ],
    conditioning: {
      primaryEnergySystem: "Minimal aerobic demand — bowling is a skill and power expression sport",
      secondaryEnergySystem: "None significant",
      weeklyVolume: "No dedicated conditioning required. Focus is structural balance, rotation, and asymmetry correction.",
      sessionFormat: "Mobility circuit and rotational power development are more valuable than traditional conditioning",
      antiPattern: "Do NOT program aggressive aerobic conditioning for bowling. Do NOT overload the delivery arm without counterbalancing the non-delivery side.",
      sportNote: "Bowling fitness is about rotational power, trunk stability, forearm/wrist tolerance, and correcting the asymmetrical loading that repeated deliveries create.",
    },
    sessionArchetypes: [
      { name: "Rotational Power + Anti-Rotation", intent: "Med ball rotational throw, landmine rotation, Pallof press — the core bowling performance and protection demands", primaryFocus: ["rotational", "trunk", "power"], recoveryPriority: "moderate" },
      { name: "Unilateral Lower + Hip Hinge", intent: "Single-leg work, hip hinge, slide mechanics — approach deceleration and asymmetry correction", primaryFocus: ["unilateral_lower", "hinge", "trunk"], recoveryPriority: "moderate" },
      { name: "Forearm + Shoulder Balance + Structural", intent: "Forearm loading, pulling strength, structural balance — protect the delivery arm and correct overdevelopment", primaryFocus: ["upper_pull", "upper_push"], recoveryPriority: "low" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Pallof press (anti-rotation)", "Med ball rotational throw or landmine rotation", "Single-leg lower body work", "Forearm and wrist loading (farmer's carry, wrist flexor/extensor work)"],
      preferred: ["RDL (hip hinge for approach)", "Single-arm row (counterbalance delivery arm)", "Cable woodchop", "Lateral lunge (slide mechanics)", "Posterior chain work"],
      reduced: ["Heavy bilateral pressing without pulling balance", "High-volume delivery-arm isolation loading"],
      eliminated: ["Neglecting non-delivery side — asymmetry accumulates over a season"],
      tissueConsiderations: ["Wrist/forearm — most common bowling injury; eccentric loading and tolerance work", "Low back — repetitive rotation; anti-rotation mandatory", "Hip/groin — slide mechanics; single-leg and lateral work", "Delivery shoulder — rotator cuff care for repeated swing"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Rotational Power + Anti-Rotation | Day 2: Unilateral Lower + Hip Hinge | Day 3: Forearm + Structural Balance",
      fourDayShape: "Day 1: Rotation + Trunk | Day 2: Unilateral + Hinge | Day 3: Structural + Forearm | Day 4: Mobility + Asymmetry Correction",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build rotational power, asymmetry resilience, and forearm tolerance", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.9, priorityShift: "Sharpen wrist/forearm conditioning and rotation quality", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.5, priorityShift: "Maintenance — protect wrist and low back", mandatoryAdjustments: ["Pallof press every session", "No heavy wrist loading day of competition"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.4, priorityShift: "Wrist, low back, and asymmetry restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Anti-rotation (Pallof press) mandatory every session", "Rotational power work present", "Forearm/wrist loading included", "Unilateral asymmetry correction included"],
    architectureDistinctions: "Bowling is a precision sport with a completely unique asymmetrical loading pattern. Every delivery loads one side of the body repeatedly. The gym program must counterbalance this asymmetry, develop rotational power for delivery, and protect the wrist, forearm, and low back.",
  },

  // ── FLAG FOOTBALL ─────────────────────────────────────────────────────────────
  flag_football: {
    key: "flag_football",
    displayName: "Flag Football",
    tagline: "Linear speed, change of direction, reactive cutting, and hamstring resilience",
    physicalQualities: [
      { quality: "Linear acceleration and top speed", priority: "primary", description: "Route running and open-field pursuit demand both first-step acceleration and true top-speed development — no collision protection means speed wins" },
      { quality: "Change of direction and cutting mechanics", priority: "primary", description: "Route breaks, defensive juke moves, and flag-pulling pursuit — COD quality separates flag football athletes" },
      { quality: "Reactive deceleration and elastic stiffness", priority: "primary", description: "Sharp route breaks require controlled deceleration — elastic stiffness and single-leg decel are the foundation" },
      { quality: "Hamstring resilience", priority: "secondary", description: "High-speed running without collision protection creates hamstring strain risk — posterior chain resilience is mandatory" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic — short explosive route or pursuit, then rest between plays",
      secondaryEnergySystem: "Repeat sprint ability — high output play after play across a game",
      weeklyVolume: "1–2 sprint conditioning sessions. Short explosive repeats with full recovery — mirror game demands.",
      sessionFormat: "Sprint repeats: 8–12 × 20–30m at 95–100% with 90s rest | OR: COD shuttle × 6–10 with full recovery",
      antiPattern: "NEVER substitute sprint conditioning with long aerobic runs. Flag football is alactic — short explosive bursts with full recovery. Aerobic endurance does not directly transfer.",
      sportNote: "Flag football without collision demands means speed and agility carry even more weight. Speed and COD are the primary physical performance differentiators.",
    },
    sessionArchetypes: [
      { name: "Acceleration + Lower Strength", intent: "Sprint mechanics (10–30m) + unilateral lower strength — first-step and route-running speed", primaryFocus: ["locomotion", "unilateral_lower", "hinge"], recoveryPriority: "high" },
      { name: "COD + Reactive Agility", intent: "Reactive cut drills, lateral bounds, 5-10-5 — route break mechanics and defensive COD", primaryFocus: ["lateral", "power", "trunk"], recoveryPriority: "moderate" },
      { name: "Hamstring + Posterior Chain Resilience", intent: "Nordic curls, single-leg RDL, glute work — prevent the most common flag football injury", primaryFocus: ["hinge", "unilateral_lower", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Sprint work (10–30m)", "Nordic hamstring curl", "Lateral bound or COD drill", "Unilateral lower (RFESS, split squat)", "Reactive agility drill"],
      preferred: ["Sled push (acceleration mechanics)", "Broad jump", "Depth jump", "Single-leg RDL", "Copenhagen plank"],
      reduced: ["Heavy bilateral slow loading without sprint/COD balance", "Long aerobic conditioning"],
      eliminated: ["Long steady-state cardio as conditioning prescription", "Programs with no sprint or COD training"],
      tissueConsiderations: ["Hamstring — #1 flag football injury; Nordic curls mandatory", "Knee — COD demands; VMO and glute strength", "Ankle — deceleration and cut demands"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Acceleration + Lower Strength | Day 2: COD + Reactive Agility | Day 3: Hamstring + Posterior Chain",
      fourDayShape: "Day 1: Acceleration + Sprint | Day 2: Lower Strength | Day 3: COD + Reactive | Day 4: Posterior Chain + Conditioning",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build speed, COD capacity, and hamstring resilience", mandatoryAdjustments: ["Full sprint volume", "Nordic progression"] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.95, conditioningReduction: 0.8, priorityShift: "Sharpen cutting mechanics and sprint quality", mandatoryAdjustments: ["Increase agility volume"] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.85, conditioningReduction: 0.25, priorityShift: "Maintain speed and freshness — games provide conditioning", mandatoryAdjustments: ["Nordic curls every session", "No sprint work day before game"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Hamstring and lower limb restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {
      skill: "Receiver/DB overlay: MAXIMIZE acceleration (10–30m sprint), COD, and reactive agility. Add backpedal and break mechanics. Reduce heavy bilateral loading relative to skill demands.",
    },
    validationRules: ["Sprint work (10–30m) mandatory", "Nordic hamstring curl mandatory", "COD or reactive agility work present", "No long aerobic conditioning as primary prescription"],
    architectureDistinctions: "Flag football is pure speed and agility — no collision means the physical game is won by acceleration, cutting mechanics, and separation. The hamstring is at high risk without contact protection. This program must look like a speed-and-agility program, NOT a strength sport program.",
  },

  // ── SOFTBALL ──────────────────────────────────────────────────────────────────
  softball: {
    key: "softball",
    displayName: "Softball",
    tagline: "Rotational bat power, acceleration, lower-body resilience, and throwing arm care",
    physicalQualities: [
      { quality: "Rotational bat power", priority: "primary", description: "The batting swing is the primary power expression — hip-shoulder separation and rotational speed through impact" },
      { quality: "Acceleration and base-running speed", priority: "primary", description: "Short explosive base-running sprints — acceleration quality is the primary speed demand" },
      { quality: "Throwing arm resilience", priority: "secondary", description: "Underhand pitching creates different shoulder demands than baseball, but throwing arm care is still essential for all positions" },
      { quality: "Posterior chain strength and hamstring resilience", priority: "secondary", description: "Base-running sprints create hamstring injury risk — posterior chain resilience is protective" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic — short explosive base runs and play-to-play explosive efforts",
      secondaryEnergySystem: "Minimal aerobic demand",
      weeklyVolume: "1 sprint conditioning session. Short explosive repeats — base-running simulation.",
      sessionFormat: "Sprint repeats: 8–10 × 20–30m with full recovery",
      antiPattern: "Do not program aerobic endurance conditioning for softball. The sport is alactic — short explosive play with full recovery.",
      sportNote: "Softball fitness centers on rotational power for batting and explosive acceleration for base running. Underhand pitching biomechanics create different arm demands than baseball.",
    },
    sessionArchetypes: [
      { name: "Rotational Power + Lower Strength", intent: "Med ball rotational throw + bilateral/unilateral lower strength — bat power and base-running foundation", primaryFocus: ["rotational", "squat", "hinge"], recoveryPriority: "high" },
      { name: "Acceleration + Posterior Chain", intent: "Sprint work + Nordic curls + single-leg RDL — base-running speed and hamstring resilience", primaryFocus: ["locomotion", "hinge", "unilateral_lower"], recoveryPriority: "high" },
      { name: "Upper Structural + Arm Care", intent: "Pulling strength balance + shoulder care — protect the throwing arm from overuse", primaryFocus: ["upper_pull", "upper_push", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Med ball rotational throw", "Sprint work (20–30m)", "Nordic hamstring curl", "Pallof press"],
      preferred: ["Hip thrust", "Reverse lunge", "Single-leg RDL", "Face pull", "Band pull-apart", "Cable woodchop"],
      reduced: ["Long aerobic conditioning", "Heavy bilateral loading without rotational balance"],
      eliminated: ["Long steady-state cardio", "Programs with no rotational development"],
      tissueConsiderations: ["Hamstring — base running sprint risk; Nordic curls mandatory", "Shoulder — throwing arm; face pull and external rotation", "Low back — rotational batting load"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Rotational Power + Lower | Day 2: Acceleration + Posterior Chain | Day 3: Upper + Arm Care",
      fourDayShape: "Day 1: Rotation + Lower | Day 2: Acceleration + Posterior Chain | Day 3: Upper Structural | Day 4: Trunk + Conditioning",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build rotational power, acceleration, and structural balance", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen bat power and base-running speed", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.3, priorityShift: "Maintenance — protect arm and posterior chain", mandatoryAdjustments: ["Face pull every session", "Nordic curls maintained"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Shoulder and posterior chain restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {
      pitcher: "Pitcher overlay: De-emphasize heavy overhead pressing. Emphasize rotational control, scapular health, and eccentric arm deceleration. Underhand mechanics stress the elbow flexor chain differently than baseball — prioritize forearm and wrist care.",
    },
    validationRules: ["Rotational power present (med ball or cable rotation)", "Sprint work present", "Nordic hamstring curl included", "Shoulder care (face pull) present"],
    architectureDistinctions: "Softball shares baseball's bat-power and sprint demands but uses underhand pitching, creating different shoulder biomechanics. Rotational bat power and acceleration are the primary performance demands. The program should look like an athletic development program for a rotational power + speed sport.",
  },

  // ── WRESTLING ─────────────────────────────────────────────────────────────────
  wrestling: {
    key: "wrestling",
    displayName: "Wrestling",
    tagline: "Anti-rotation strength, grip and clinch power, explosive level change, and match-duration conditioning",
    physicalQualities: [
      { quality: "Anti-rotation and trunk stiffness", priority: "primary", description: "Resisting takedowns and maintaining position requires extreme anti-rotation strength — the trunk must resist rotation under maximal applied force" },
      { quality: "Grip, clinch, and upper body pulling", priority: "primary", description: "Tie-up strength, grip endurance, and pulling power determine who controls the match — grip training is non-negotiable" },
      { quality: "Explosive level change and penetration", priority: "primary", description: "The penetration shot — explosive single-leg level change — is the most important offensive skill. Lower body explosiveness and single-leg control are critical" },
      { quality: "Rotational power for throws and sweeps", priority: "secondary", description: "Throws, trips, and scrambles require rotational power — hip rotation and trunk loading for offensive finishing" },
      { quality: "Repeat-effort conditioning", priority: "secondary", description: "Match-length at near-maximal effort — repeat-effort capacity must be developed specifically" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic + glycolytic — explosive efforts with incomplete recovery across a 6-minute match",
      secondaryEnergySystem: "Aerobic support for tournament day (multiple matches)",
      weeklyVolume: "1–2 conditioning sessions. Specific wrestling conditioning (grip, repeat explosive effort) preferred over generic cardio.",
      sessionFormat: "Repeat explosive circuit: takedown drill series × 6–10 min | OR: grip endurance + resist/hold drill | Aerobic base: 20 min steady-state 2x/week",
      antiPattern: "Do not neglect grip training — wrestlers who cannot maintain grip control lose matches regardless of other attributes.",
      sportNote: "Wrestling demands a unique combination of upper-body pulling, anti-rotation trunk strength, and explosive lower-body level change. All three must be developed simultaneously.",
    },
    sessionArchetypes: [
      { name: "Anti-Rotation + Trunk Stiffness", intent: "Loaded carries, Pallof press, landmine anti-rotation — resisting external rotation force under load", primaryFocus: ["trunk", "rotational", "upper_pull"], recoveryPriority: "moderate" },
      { name: "Explosive Lower + Level Change", intent: "Split squat, single-leg lower, broad jump — penetration shot power and level-change explosiveness", primaryFocus: ["unilateral_lower", "power", "squat"], recoveryPriority: "high" },
      { name: "Grip + Upper Pulling + Rotational", intent: "Rows, farmer's carry, rotational med ball — clinch strength, grip endurance, and throw power", primaryFocus: ["upper_pull", "rotational", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Loaded carries (farmer's carry, suitcase carry)", "Pallof press", "Single-leg lower body", "Horizontal pulling (rows)", "Med ball rotational throw"],
      preferred: ["Power clean or hang clean", "Broad jump", "Split jump", "Reverse lunge", "Copenhagen plank (groin for scrambles)", "Face-down grip holds"],
      reduced: ["Heavy bilateral pressing without pulling balance — wrestlers are pull-dominant sports", "Isolation work without functional carry-over"],
      eliminated: ["Programs with no grip training", "Neglecting anti-rotation work — match positioning depends on it"],
      tissueConsiderations: ["Shoulder — joint lock exposure; external rotation care", "Knee — penetration shot position", "Groin/hip — scramble positions; Copenhagen plank mandatory", "Neck — contact sport; neck strengthening appropriate"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Anti-Rotation + Trunk | Day 2: Explosive Lower + Level Change | Day 3: Grip + Pulling + Rotational",
      fourDayShape: "Day 1: Trunk + Anti-Rotation | Day 2: Lower Explosiveness | Day 3: Grip + Upper Pull | Day 4: Rotational + Conditioning",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build grip strength, anti-rotation, and lower body explosiveness", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen match conditioning and grip endurance", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.85, conditioningReduction: 0.3, priorityShift: "Maintenance — protect shoulders and knees", mandatoryAdjustments: ["2× sessions max", "External rotation care every session"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Shoulder and groin restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Grip training (carry or grip-specific) mandatory", "Anti-rotation (Pallof press) mandatory", "Explosive lower body present", "Pulling strength > pressing strength"],
    architectureDistinctions: "Wrestling is the most grip-intensive and anti-rotation-demanding of all sports. The program must develop the ability to resist rotation under maximal applied force, explosive single-leg level change, and grip endurance that lasts a full match.",
  },

  // ── BOXING ────────────────────────────────────────────────────────────────────
  boxing: {
    key: "boxing",
    displayName: "Boxing",
    tagline: "Rotational punch power, lateral footwork, trunk stiffness for punch resistance, and round conditioning",
    physicalQualities: [
      { quality: "Rotational punch power", priority: "primary", description: "Punching force comes from ground force through hip rotation — rotational power from hips through trunk directly increases knockout ability" },
      { quality: "Trunk stiffness for punch receipt", priority: "primary", description: "The ability to absorb and brace against incoming punches — anti-rotation and trunk stiffness are protective" },
      { quality: "Lateral footwork and defensive movement", priority: "primary", description: "Slipping, rolling, and laterally evading punches — footwork agility is as important as punching for defensive boxing" },
      { quality: "Round conditioning and repeat-effort capacity", priority: "secondary", description: "3-minute rounds at near-maximum effort — repeat sprint and aerobic capacity must be developed to last rounds" },
    ],
    conditioning: {
      primaryEnergySystem: "Glycolytic + alactic — 3-minute rounds at high intensity with 1-minute rest",
      secondaryEnergySystem: "Aerobic base for multi-round endurance",
      weeklyVolume: "2 conditioning sessions. Round-specific intervals + aerobic base.",
      sessionFormat: "3 min work / 1 min rest × 8–12 rounds shadow boxing or bag work | Aerobic base: 20–30 min steady-state",
      antiPattern: "Do NOT neglect trunk stiffness training — a weak trunk gets hurt by punches. Do not prioritize upper body isolation over rotational power development.",
      sportNote: "Boxing power comes from the ground up — legs → hips → trunk → arms. The gym program must develop this kinetic chain, not just arm-specific strength.",
    },
    sessionArchetypes: [
      { name: "Rotational Power + Trunk Bracing", intent: "Med ball rotation, Pallof press, rotational cable work — punch power generation and receipt", primaryFocus: ["rotational", "trunk", "power"], recoveryPriority: "high" },
      { name: "Footwork + Lateral Conditioning", intent: "Lateral agility, shuffle drills, COD — defensive footwork movement patterns", primaryFocus: ["lateral", "locomotion", "trunk"], recoveryPriority: "moderate" },
      { name: "Upper Structural + Shoulder Resilience", intent: "Pulling strength, face pull, external rotation — balance the heavy punching volume from training", primaryFocus: ["upper_pull", "upper_push", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Med ball rotational throw", "Pallof press", "Lateral footwork agility drill", "Upper body pull (row)"],
      preferred: ["KB swing", "Landmine rotation", "Sled push (footwork base)", "Face pull", "Copenhagen plank", "Broad jump"],
      reduced: ["Heavy bilateral pressing without rotational balance", "Isolation arm work without kinetic chain development"],
      eliminated: ["Programs with no rotational power development", "Neglecting trunk stiffness — defensive exposure"],
      tissueConsiderations: ["Shoulder — punching volume; external rotation care mandatory", "Wrist/hand — impact forces; wrist strength and wrapping", "Low back — rotational loading; anti-rotation protective"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Rotational Power + Trunk | Day 2: Footwork + Lateral | Day 3: Upper Structural + Conditioning",
      fourDayShape: "Day 1: Rotation + Trunk | Day 2: Lower + Footwork | Day 3: Upper + Shoulder Care | Day 4: Conditioning + Trunk",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build rotational power, trunk stiffness, and aerobic base", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen round conditioning and footwork quality", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.85, conditioningReduction: 0.3, priorityShift: "Maintenance — protect shoulders and wrists around camp", mandatoryAdjustments: ["Face pull every session", "No heavy pressing day before sparring"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Shoulder and wrist restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Rotational power (med ball or cable) mandatory", "Trunk anti-rotation (Pallof press) mandatory", "Shoulder care present", "Conditioning component present"],
    architectureDistinctions: "Boxing power is rotational — it comes from the ground through the hips, not the arms. The gym program must develop the full kinetic chain for punch power, AND trunk stiffness for defensive durability. Footwork agility is equally important to punching.",
  },

  // ── MMA ───────────────────────────────────────────────────────────────────────
  mma: {
    key: "mma",
    displayName: "Mixed Martial Arts (MMA)",
    tagline: "Rotational power, anti-rotation, grip endurance, explosive grappling, and multi-round conditioning",
    physicalQualities: [
      { quality: "Anti-rotation and trunk stiffness", priority: "primary", description: "Defending takedowns, maintaining position, and absorbing strikes — trunk stiffness is the universal athletic currency of MMA" },
      { quality: "Rotational power for striking and throwing", priority: "primary", description: "Punches, kicks, and takedowns all require hip rotation — rotational power generation is the foundation of offensive output" },
      { quality: "Grip, clinch, and grappling strength", priority: "primary", description: "Clinch control, takedown finishing, and submission defense all require grip and upper-body pulling strength" },
      { quality: "Single-leg control and explosive lower body", priority: "secondary", description: "Takedown shooting, sprawl defense, and positional scrambles — unilateral lower body explosiveness is essential" },
      { quality: "Multi-round conditioning", priority: "secondary", description: "3–5 rounds at near-maximal effort — the energy system demand is extreme" },
    ],
    conditioning: {
      primaryEnergySystem: "Glycolytic + alactic — high-intensity efforts with incomplete recovery across 3–5 rounds",
      secondaryEnergySystem: "Aerobic base for recovery between and within rounds",
      weeklyVolume: "2 conditioning sessions. Sport-specific conditioning (grappling, striking) preferred.",
      sessionFormat: "5-minute round circuit × 5 rounds at maximum effort with 1-minute rest | Aerobic base: 20 min steady-state",
      antiPattern: "Do not program exclusively striking or grappling conditioning — MMA requires both. Do not neglect grip training.",
      sportNote: "MMA is the most physically demanding combat sport. All physical qualities — power, strength, grip, conditioning — must be developed together.",
    },
    sessionArchetypes: [
      { name: "Anti-Rotation + Grip + Pulling", intent: "Suitcase carry, farmer's carry, rows, Pallof press — position resistance, grip endurance, and pulling power", primaryFocus: ["trunk", "upper_pull", "rotational"], recoveryPriority: "moderate" },
      { name: "Rotational Power + Explosive Lower", intent: "Med ball rotation, power clean, split jump — striking power and takedown explosiveness", primaryFocus: ["rotational", "power", "unilateral_lower"], recoveryPriority: "high" },
      { name: "Conditioning + Structural Balance", intent: "Round-specific interval conditioning + structural balance work — match endurance and tissue resilience", primaryFocus: ["trunk", "locomotion", "upper_pull"], conditioningRole: "Glycolytic / repeat sprint — round-specific", recoveryPriority: "high" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Loaded carries (farmer's, suitcase)", "Pallof press", "Med ball rotational throw", "Horizontal pull (rows)", "Single-leg lower"],
      preferred: ["Power clean or hang clean", "Split jump", "Copenhagen plank", "Face pull", "Broad jump", "Kettlebell swing"],
      reduced: ["Heavy bilateral pressing dominance without pulling balance", "Isolation without functional transfer"],
      eliminated: ["Programs missing grip training", "Neglecting anti-rotation work"],
      tissueConsiderations: ["Shoulder — joint locks; external rotation mandatory", "Groin/hip — grappling positions; Copenhagen plank essential", "Wrist/hand — grappling and striking", "Knee — takedown positions"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Anti-Rotation + Grip + Pull | Day 2: Rotational Power + Explosive Lower | Day 3: Conditioning + Structural",
      fourDayShape: "Day 1: Trunk + Anti-Rotation | Day 2: Power + Lower | Day 3: Grip + Pull | Day 4: Conditioning + Balance",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build all physical qualities — power, grip, conditioning, trunk", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen conditioning and match-specific qualities", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.85, conditioningReduction: 0.3, priorityShift: "Camp maintenance — protect from overuse, keep power sharp", mandatoryAdjustments: ["2× sessions max", "External rotation every session", "Copenhagen plank maintained"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Full body restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Grip training mandatory", "Anti-rotation mandatory", "Rotational power present", "Conditioning component present", "Upper pull > upper press"],
    architectureDistinctions: "MMA is the most complete physical sport — requiring strength, power, grip, anti-rotation, and conditioning all at high levels. No single quality can be sacrificed. The program must develop the full kinetic chain for striking AND the grappling demands simultaneously.",
  },

  // ── CRICKET ───────────────────────────────────────────────────────────────────
  cricket: {
    key: "cricket",
    displayName: "Cricket",
    tagline: "Rotational batting power, bowling-specific unilateral mechanics, overhead resilience, and match-duration aerobic capacity",
    physicalQualities: [
      { quality: "Rotational power (batting) and arm speed (bowling/throwing)", priority: "primary", description: "Both batting and throwing require explosive hip-to-shoulder rotation — developing both directions of rotational power" },
      { quality: "Overhead resilience and arm care", priority: "primary", description: "Bowling and throwing create substantial overhead load — rotator cuff and scapular health are protective" },
      { quality: "Unilateral lower body control", priority: "secondary", description: "Bowling delivery stride, batting footwork, and fielding involve extreme unilateral demands" },
      { quality: "Match-duration aerobic capacity", priority: "secondary", description: "Test and limited-overs cricket can last hours — aerobic base supports sustained performance and recovery between spells" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic (explosive bowling spells, batting, fielding) + aerobic base (long match duration)",
      secondaryEnergySystem: "Repeat sprint (between-wicket running)",
      weeklyVolume: "1–2 conditioning sessions. Sprint conditioning and aerobic base both relevant.",
      sessionFormat: "Sprint repeats: 6–8 × 20–30m | Aerobic base: 20 min at 65% max HR",
      antiPattern: "Do not neglect overhead resilience — both fast bowlers and fielders accumulate massive overhead loading across a match or season.",
      sportNote: "Cricket is unique in having specialist roles (bowler/batter) with very different physical demands. Role-specific programming is highly recommended.",
    },
    sessionArchetypes: [
      { name: "Rotational Power + Overhead Care", intent: "Med ball rotational throw, landmine rotation, face pull — batting power and throwing arm resilience", primaryFocus: ["rotational", "trunk", "upper_pull"], recoveryPriority: "moderate" },
      { name: "Unilateral Lower + Hip Hinge", intent: "RFESS, single-leg RDL, step-up — delivery stride strength and fielding agility", primaryFocus: ["unilateral_lower", "hinge", "trunk"], recoveryPriority: "high" },
      { name: "Upper Structural + Trunk", intent: "Pulling strength, anti-rotation, trunk endurance — structural balance for match duration", primaryFocus: ["upper_pull", "upper_push", "trunk"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Med ball rotational throw", "Face pull and external rotation", "Single-leg lower body", "Anti-rotation (Pallof press)"],
      preferred: ["Landmine rotation", "RFESS", "Nordic hamstring curl", "Single-leg RDL", "Pull-up or lat pull-down"],
      reduced: ["Heavy bilateral loading without rotational balance", "Long aerobic conditioning without sprint component"],
      eliminated: ["Neglecting shoulder care — arm-intensive sport with high overuse risk"],
      tissueConsiderations: ["Shoulder — very high overhead load; external rotation mandatory", "Low back (bowlers) — lumbar stress fracture risk; anti-extension mandatory", "Hamstring — between-wicket running", "Wrist/forearm (batters) — bat impact"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Rotational Power + Overhead Care | Day 2: Unilateral Lower + Hinge | Day 3: Upper Structural + Trunk",
      fourDayShape: "Day 1: Rotation + Overhead | Day 2: Lower + Hinge | Day 3: Upper + Trunk | Day 4: Sprint Conditioning + Mobility",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build rotational power, structural balance, and aerobic base", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen bowling-specific conditioning and batting power", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.35, priorityShift: "Maintenance — protect shoulder and low back", mandatoryAdjustments: ["Face pull every session", "No heavy overhead pressing match day"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Shoulder, lumbar, and full body restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {
      pitcher: "Fast Bowler overlay: MAXIMIZE trunk stiffness, anti-rotation, overhead eccentric loading, unilateral delivery stride. Add lumbar stress fracture prevention (anti-extension). HIGH priority on shoulder/elbow eccentric work. Reduce heavy bilateral lifting in-season.",
      hitter_field: "Batter/Fielder overlay: MAXIMIZE rotational bat power (hip-shoulder separation), acceleration for between-wicket running, and overhead throwing arm resilience. Add lateral lunging for fielding. Reduce unilateral lower-body loading volume.",
    },
    validationRules: ["Rotational power present", "Overhead care (face pull, external rotation) mandatory", "Unilateral lower body present", "Anti-rotation present"],
    architectureDistinctions: "Cricket is unique in having specialist roles with dramatically different physical demands. A fast bowler's program should look nothing like a batter's. Both share rotational power and arm-care needs, but the bowler demands extreme unilateral loading and lumbar protection while the batter demands bat-specific rotational speed.",
  },

  // ── CRICKET BOWLER ────────────────────────────────────────────────────────────
  cricket_bowler: {
    key: "cricket_bowler",
    displayName: "Cricket — Fast Bowler",
    tagline: "Trunk rotation power, anti-rotation delivery brace, overhead eccentric resilience, and lumbar spine protection",
    physicalQualities: [
      { quality: "Trunk rotation and delivery power", priority: "primary", description: "Fast bowling is a full-body rotational power expression — run-up momentum converts to shoulder and arm speed through trunk rotation" },
      { quality: "Overhead eccentric control and arm deceleration", priority: "primary", description: "The bowling arm undergoes massive deceleration forces after release — eccentric rotator cuff strength is injury prevention" },
      { quality: "Lumbar spine protection", priority: "primary", description: "Stress fractures of the lumbar spine are the most common and career-ending injury in fast bowling — anti-extension is critical" },
      { quality: "Unilateral delivery stride mechanics", priority: "secondary", description: "The front-foot landing is a massive unilateral bracing event — the front leg takes extraordinary force on every delivery" },
      { quality: "Repeat bowling spell conditioning", priority: "secondary", description: "Multiple long bowling spells across a day's play — repeat explosive capacity must be developed" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic (delivery) + aerobic base (bowling spells across a day)",
      secondaryEnergySystem: "Repeat sprint (run-up × many deliveries across multiple spells)",
      weeklyVolume: "1 conditioning session. Aerobic base for spell recovery.",
      sessionFormat: "Aerobic base: 20–25 min | Sprint repeats simulating run-up: 8 × 20m with full recovery",
      antiPattern: "Do not neglect lumbar spine care — back stress fractures end careers. Do not prescribe heavy overhead barbell pressing — arm deceleration load is already extreme.",
      sportNote: "The fast bowler is arguably the most physically stressed athlete in team sports — dozens of maximal-effort deliveries per match, with repetitive extreme forces on the lumbar spine and bowling arm.",
    },
    sessionArchetypes: [
      { name: "Trunk Rotation + Anti-Extension", intent: "Landmine rotation, Pallof press, dead bug — delivery power and lumbar spine protection", primaryFocus: ["rotational", "trunk", "power"], recoveryPriority: "moderate" },
      { name: "Overhead Eccentric + Shoulder Care", intent: "External rotation, face pull, eccentric overhead loading — protect the bowling arm from deceleration injury", primaryFocus: ["upper_pull", "upper_push"], recoveryPriority: "low" },
      { name: "Unilateral Delivery Stride Strength", intent: "RFESS, single-leg RDL, step-up — front-foot landing force and delivery stride mechanics", primaryFocus: ["unilateral_lower", "hinge", "trunk"], recoveryPriority: "high" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Dead bug (anti-extension, lumbar protection)", "External rotation and face pull (every session)", "RFESS or single-leg lower", "Landmine rotation (delivery power)", "Pallof press"],
      preferred: ["Single-leg RDL", "Nordic hamstring curl (run-up resilience)", "Copenhagen plank", "Prone Y-T-W", "Hip thrust"],
      reduced: ["Heavy barbell overhead press — arm decel load is already high", "Heavy bilateral squat in-season — delivery stride load is sufficient"],
      eliminated: ["Neglecting lumbar spine care — stress fracture is the most common bowling injury", "Neglecting eccentric shoulder work"],
      tissueConsiderations: ["Lumbar spine — #1 priority; anti-extension mandatory every session", "Bowling shoulder/elbow — eccentric rotator cuff work mandatory", "Hamstring — run-up load; Nordic curls", "Front-foot knee — delivery stride landing forces"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Trunk Rotation + Anti-Extension | Day 2: Overhead Eccentric + Shoulder | Day 3: Unilateral Delivery Stride",
      fourDayShape: "Day 1: Trunk + Anti-Extension | Day 2: Shoulder Eccentric | Day 3: Unilateral Lower | Day 4: Conditioning + Mobility",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build trunk rotation power, lumbar resilience, and shoulder eccentric strength", mandatoryAdjustments: ["Full anti-extension program", "Progressive eccentric shoulder loading"] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen delivery mechanics and shoulder resilience as bowling load increases", mandatoryAdjustments: ["Increase shoulder eccentric work as bowling volume rises"] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.3, priorityShift: "Maintain — protect lumbar and shoulder from overuse", mandatoryAdjustments: ["Dead bug every session", "Face pull and external rotation every session", "2× gym sessions max", "No heavy overhead pressing"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Lumbar and shoulder restoration — this is when injuries develop from accumulated load", mandatoryAdjustments: ["No heavy axial loading", "Eccentric shoulder restoration", "Lumbar mobility focus"] },
    },
    positionOverlays: {},
    validationRules: ["Dead bug or anti-extension mandatory every session", "External rotation and face pull mandatory every session", "Single-leg lower present", "No heavy overhead barbell pressing", "Lumbar protection accounted for"],
    architectureDistinctions: "The fast cricket bowler has the most distinctive and injury-specific training requirements of any cricket role. The lumbar spine and bowling shoulder demand specialized protection that must be present every session. Trunk rotation power for delivery and eccentric arm deceleration strength are the two defining development qualities.",
  },

  // ── CRICKET BATTER ────────────────────────────────────────────────────────────
  cricket_batter: {
    key: "cricket_batter",
    displayName: "Cricket — Batter",
    tagline: "Rotational bat power, hip-shoulder separation, bat-grip endurance, and between-wicket sprint resilience",
    physicalQualities: [
      { quality: "Rotational bat power and hip-shoulder separation", priority: "primary", description: "The batting stroke is a hip-shoulder separation rotational power expression — identical physical demands to baseball batting" },
      { quality: "Bat-grip and forearm endurance", priority: "primary", description: "Grip control through impact and sustained innings play — forearm endurance prevents premature fatigue" },
      { quality: "Between-wicket sprint resilience", priority: "secondary", description: "Running between wickets is explosive acceleration — posterior chain strength and hamstring resilience are protective" },
      { quality: "Lateral footwork and stance mechanics", priority: "secondary", description: "Pre-delivery movement and attack footwork require lateral agility and single-leg stability" },
    ],
    conditioning: {
      primaryEnergySystem: "Alactic (between-wicket running) with extended low-intensity time at crease",
      secondaryEnergySystem: "Aerobic base for long innings concentration",
      weeklyVolume: "1 conditioning session. Sprint conditioning for between-wicket resilience.",
      sessionFormat: "Sprint repeats: 8–10 × 20–30m with full recovery — simulating between-wicket running demands",
      antiPattern: "Do not neglect rotational power — the batting stroke is the primary performance expression. Do not overload overhead pressing without shoulder care balance.",
      sportNote: "Cricket batting is primarily a rotational power sport with brief explosive sprint demands. The gym should develop bat power and sprint resilience.",
    },
    sessionArchetypes: [
      { name: "Rotational Power + Grip Endurance", intent: "Med ball rotational throw, cable woodchop, farmer's carry — bat power and forearm endurance", primaryFocus: ["rotational", "trunk", "upper_pull"], recoveryPriority: "moderate" },
      { name: "Sprint + Posterior Chain", intent: "Sprint repeats, Nordic curls, single-leg RDL — between-wicket running quality and hamstring protection", primaryFocus: ["locomotion", "hinge", "unilateral_lower"], recoveryPriority: "high" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Med ball rotational throw", "Sprint work (20–30m)", "Nordic hamstring curl", "Farmer's carry (grip endurance)"],
      preferred: ["Cable woodchop", "Reverse lunge (lateral footwork)", "Hip thrust", "Face pull", "RFESS"],
      reduced: ["Heavy overhead pressing without shoulder care", "Long aerobic conditioning without sprint component"],
      eliminated: ["Programs with no rotational development"],
      tissueConsiderations: ["Wrist/forearm — bat impact grip; eccentric loading", "Hamstring — sprint risk; Nordic curls", "Low back — rotational batting load"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Rotational Power + Grip | Day 2: Sprint + Posterior Chain | Day 3: Upper + Trunk",
      fourDayShape: "Day 1: Rotation + Grip | Day 2: Sprint + Lower | Day 3: Upper + Shoulder | Day 4: Trunk + Mobility",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build rotational power, grip strength, and sprint resilience", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen bat power and sprint quality", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.3, priorityShift: "Maintenance — protect wrist and hamstring", mandatoryAdjustments: ["Nordic curls maintained", "2× sessions max"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Wrist and lower limb restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Rotational power mandatory", "Sprint work present", "Nordic hamstring curl present", "Grip training (farmer's carry or specific) present"],
    architectureDistinctions: "Cricket batting is primarily a rotational power sport. The gym program should resemble a baseball batter's program — med ball rotation, grip strength, sprint resilience, and anti-rotation control. A bowler's program looks entirely different.",
  },

  // ── CRICKET WICKETKEEPER ──────────────────────────────────────────────────────
  cricket_wicketkeeper: {
    key: "cricket_wicketkeeper",
    displayName: "Cricket — Wicketkeeper",
    tagline: "Reactive catching mechanics, deep-squat endurance, lateral dive strength, and grip resilience",
    physicalQualities: [
      { quality: "Reactive catching and dive mechanics", priority: "primary", description: "The keeper must react to deflections and diving chances in a fraction of a second — reactive elasticity and lateral dive control define performance" },
      { quality: "Deep squat endurance and knee resilience", priority: "primary", description: "The keeping stance is a deep squat maintained for entire innings — knee tolerance and postural endurance are non-negotiable" },
      { quality: "Lateral dive and single-leg landing control", priority: "primary", description: "Diving catches require extreme unilateral lateral loading — hip, groin, and lateral chain strength are protective" },
      { quality: "Grip and hand resilience", priority: "secondary", description: "Takes through gloves create repetitive impact loads on wrists and hands — grip tolerance training is protective" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic base for innings-length endurance",
      secondaryEnergySystem: "Alactic reactive bursts (diving, sprinting for run-outs)",
      weeklyVolume: "1 conditioning session. Aerobic base for sustained performance.",
      sessionFormat: "Aerobic base: 20 min at 65% max HR | Reactive agility drills: 6–10 × lateral reactive movements",
      antiPattern: "Do not neglect knee and deep squat endurance — the keeping position creates sustained knee stress unlike any other sport.",
      sportNote: "The wicketkeeper is the most position-specific role in cricket with unique physical demands. Deep-squat tolerance and reactive dive mechanics must be specifically trained.",
    },
    sessionArchetypes: [
      { name: "Deep Squat Tolerance + Knee Resilience", intent: "Goblet squat, squat endurance, VMO and glute work — keeping stance endurance", primaryFocus: ["squat", "unilateral_lower", "trunk"], recoveryPriority: "moderate" },
      { name: "Lateral Dive + Reactive Catching", intent: "Lateral bound, single-leg landing, reactive agility — dive catch mechanics", primaryFocus: ["lateral", "power", "unilateral_lower"], recoveryPriority: "moderate" },
      { name: "Grip + Upper + Trunk", intent: "Grip loading, pulling strength, anti-rotation — hand resilience and general structural balance", primaryFocus: ["upper_pull", "trunk"], recoveryPriority: "low" },
    ],
    exerciseEmphasis: {
      mustInclude: ["Goblet squat or deep squat variant (keeping stance)", "Lateral bound or reactive lateral drill", "Copenhagen plank (groin for diving)", "Single-leg lower"],
      preferred: ["Step-down (eccentric knee loading)", "Face pull", "Farmer's carry (grip)", "Pallof press", "Single-leg RDL"],
      reduced: ["Heavy spinal loading without knee tolerance balance", "Neglecting lateral movements"],
      eliminated: ["Programs with no lateral or reactive movement training"],
      tissueConsiderations: ["Knee — deep squat endurance position; VMO and glute essential", "Groin/hip — lateral diving; Copenhagen plank mandatory", "Wrist/hand — ball impact through gloves", "Low back — sustained flexion in keeping stance"],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Deep Squat + Knee Resilience | Day 2: Lateral Dive + Reactive | Day 3: Grip + Upper + Trunk",
      fourDayShape: "Day 1: Squat + Knee | Day 2: Lateral Reactive | Day 3: Grip + Upper | Day 4: Mobility + Lower Balance",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build knee tolerance, lateral dive strength, and grip resilience", mandatoryAdjustments: [] },
      pre_season: { volumeModifier: 0.85, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen reactive catching mechanics and squat endurance", mandatoryAdjustments: [] },
      in_season: { volumeModifier: 0.6, intensityModifier: 0.8, conditioningReduction: 0.3, priorityShift: "Maintain knee resilience and lateral strength", mandatoryAdjustments: ["Copenhagen plank every session", "Knee VMO work maintained"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.2, priorityShift: "Knee and wrist restoration", mandatoryAdjustments: [] },
    },
    positionOverlays: {},
    validationRules: ["Deep squat training present", "Lateral reactive movement present", "Copenhagen plank present", "Grip training present"],
    architectureDistinctions: "The wicketkeeper has the most distinctive positional demands in cricket. Deep-squat endurance, lateral dive strength, and reactive catching mechanics cannot be adequately developed by generic cricket programming. The program should look nothing like a bowler's program.",
  },

  // ── CYCLING ───────────────────────────────────────────────────────────────────
  cycling: {
    key: "cycling",
    displayName: "Cycling",
    tagline: "Quad and posterior chain strength, single-leg power, aerobic capacity, and positional resilience",
    physicalQualities: [
      { quality: "Single-leg pushing force", priority: "primary", description: "Every pedal stroke is a single-leg push — unilateral lower body strength directly transfers to power output" },
      { quality: "Quad and posterior chain strength balance", priority: "primary", description: "Cycling overloads quads and underloads hamstrings, glutes, and upper back — imbalance creates injury and limits power" },
      { quality: "Aerobic capacity", priority: "primary", description: "Cycling is aerobic — endurance performance depends on VO2max, lactate threshold, and aerobic efficiency" },
      { quality: "Positional resilience (hip flexors, neck, upper back)", priority: "secondary", description: "Prolonged riding position shortens hip flexors, loads the neck, and rounds the upper back — these must be counterbalanced" },
      { quality: "Core stability under sustained load", priority: "secondary", description: "Trunk stiffness transfers leg power through the bike — a soft trunk loses watts on every pedal stroke" },
    ],
    conditioning: {
      primaryEnergySystem: "Aerobic — road cycling and endurance events are primarily aerobic",
      secondaryEnergySystem: "Alactic and glycolytic (sprints, climbs, race attacks)",
      weeklyVolume: "Gym conditioning is minimal — bike sessions provide primary aerobic training",
      sessionFormat: "Gym work serves the bike, not the other way around. No additional aerobic conditioning in gym unless athlete is very deconditioned.",
      antiPattern: "Do NOT program gym cardio for cyclists who already ride 10+ hours per week. Do NOT program exclusively quad-dominant lower body — cycling already overdevelops quads.",
      sportNote: "Cyclists are already in high aerobic training volume. Gym work must counterbalance cycling imbalances (hip flexor tightness, quad dominance, upper back rounding) and build single-leg force production.",
    },
    sessionArchetypes: [
      { name: "Single-Leg Strength + Posterior Chain", intent: "RFESS, single-leg RDL, hip thrust — counterbalance quad dominance and build the posterior chain that cycling neglects", primaryFocus: ["unilateral_lower", "hinge", "squat"], recoveryPriority: "high" },
      { name: "Upper Back + Postural Resilience", intent: "Row, face pull, thoracic extension — reverse the forward-flexed cycling position and rebuild upper structural balance", primaryFocus: ["upper_pull", "upper_push", "trunk"], recoveryPriority: "low" },
      { name: "Core + Hip Mobility + Power", intent: "Anti-extension trunk, hip flexor eccentric loading, lateral bounds — positional resilience and torque transfer through the pelvis", primaryFocus: ["trunk", "lateral", "power", "hinge"], recoveryPriority: "moderate" },
    ],
    exerciseEmphasis: {
      mustInclude: ["RFESS or Bulgarian split squat (single-leg quad and glute)", "Hip thrust or single-leg RDL (posterior chain counterbalance)", "Bent-over row or TRX row (reverse upper back rounding)", "Dead bug or hollow body (trunk for power transfer)", "Hip flexor eccentric loading (counterbalance shortened hip flexors)"],
      preferred: ["Face pull", "Pallof press", "Copenhagen plank (adductor for saddle position)", "Step-up with control", "Band pull-apart", "Thoracic extension over foam roller"],
      reduced: ["Quad-dominant bilateral exercises (leg press, leg extension) as primary work — cycling already overdevelops these", "Heavy aerobic conditioning in gym on top of riding volume"],
      eliminated: ["Additional long aerobic sessions in the gym — riders already have sufficient cardiovascular load", "Pure quad-dominant programs that worsen the cycling imbalance"],
      tissueConsiderations: [
        "Hip flexor — chronic shortening from riding position; eccentric loading and stretching mandatory",
        "Knee (IT band and patellar tracking) — single-leg strength and lateral stability",
        "Lower back — sustained flexion; posterior chain and anti-extension trunk work protective",
        "Neck and upper traps — forward riding position creates chronic upper trap loading",
        "Saddle pressure issues — Copenhagen plank and adductor strengthening",
      ],
    },
    weeklyArchitectureGuidance: {
      threeDayShape: "Day 1: Single-Leg + Posterior Chain | Day 2: Upper Back + Postural | Day 3: Core + Hip Mobility + Power",
      fourDayShape: "Day 1: Single-Leg + Posterior | Day 2: Upper + Postural | Day 3: Core + Power | Day 4: Full Body Balance + Trunk",
    },
    seasonModulation: {
      off_season: { volumeModifier: 1.0, intensityModifier: 1.0, conditioningReduction: 1.0, priorityShift: "Build posterior chain strength, single-leg power, and structural imbalance correction", mandatoryAdjustments: ["Full posterior chain development", "Hip flexor eccentric program", "Upper back structural work"] },
      pre_season: { volumeModifier: 0.8, intensityModifier: 0.9, conditioningReduction: 0.8, priorityShift: "Sharpen single-leg power — transition from bilateral to fully unilateral emphasis", mandatoryAdjustments: ["Increase single-leg work", "Reduce heavy bilateral volume", "Maintain postural work"] },
      in_season: { volumeModifier: 0.5, intensityModifier: 0.8, conditioningReduction: 0.2, priorityShift: "Maintenance — bike training load is at peak; gym is minimal and specific", mandatoryAdjustments: ["2× sessions max", "Face pull every session", "No heavy lower body day before key rides or races"] },
      post_season: { volumeModifier: 0.4, intensityModifier: 0.65, conditioningReduction: 0.15, priorityShift: "Structural restoration — hip flexor recovery, upper back restoration", mandatoryAdjustments: ["Hip mobility priority", "Deload lower body", "Shoulder and upper back restoration"] },
    },
    positionOverlays: {},
    validationRules: ["RFESS or single-leg lower body mandatory", "Hip thrust or posterior chain mandatory", "Row or upper back pulling work mandatory", "Hip flexor care present", "No additional gym cardio"],
    architectureDistinctions: "Cyclists already have extreme aerobic volume and quad-dominant training. Gym work must counterbalance — posterior chain, single-leg strength, upper back, and hip mobility. Adding more quad work or aerobic conditioning in the gym makes imbalances worse, not better.",
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
  if (s.includes("track") || s.includes("sprint") || s.includes("sprinting")) return SPORT_PROFILES.track;
  if (s.includes("volleyball")) return SPORT_PROFILES.volleyball;
  // ── New sport-specific mappings (supersede generic catch-alls below) ──────
  if (s.includes("pickleball")) return SPORT_PROFILES.pickleball;
  if (s.includes("padel")) return SPORT_PROFILES.padel;
  if (s.includes("badminton")) return SPORT_PROFILES.badminton;
  if (s.includes("squash")) return SPORT_PROFILES.squash;
  if (s.includes("bowling")) return SPORT_PROFILES.bowling;
  if (s.includes("flag football") || s.includes("flag_football")) return SPORT_PROFILES.flag_football;
  if (s.includes("softball")) return SPORT_PROFILES.softball;
  if (s.includes("wrestling") || s.includes("grappling")) return SPORT_PROFILES.wrestling;
  if (s.includes("boxing") || s.includes("muay thai") || s.includes("kickboxing")) return SPORT_PROFILES.boxing;
  if (s.includes("mma") || s.includes("mixed martial arts")) return SPORT_PROFILES.mma;
  // Cricket role-based subprofiles (check before base cricket)
  if (s.includes("cricket") && (s.includes("bowler") || s.includes("fast bowl") || s.includes("spin bowl"))) return SPORT_PROFILES.cricket_bowler;
  if (s.includes("cricket") && (s.includes("batter") || s.includes("batsman") || s.includes("batting"))) return SPORT_PROFILES.cricket_batter;
  if (s.includes("cricket") && (s.includes("keeper") || s.includes("wicketkeeper"))) return SPORT_PROFILES.cricket_wicketkeeper;
  if (s.includes("cricket")) return SPORT_PROFILES.cricket;
  // Jiu-jitsu, judo → wrestling (grappling-first sports)
  if (s.includes("jiu-jitsu") || s.includes("jiu jitsu") || s.includes("bjj") || s.includes("judo")) return SPORT_PROFILES.wrestling;
  if (s.includes("tennis") || s.includes("racket") || s.includes("racquet")) return SPORT_PROFILES.tennis;
  if (s.includes("combat") || s.includes("martial arts")) return SPORT_PROFILES.combat_sports;
  if (s.includes("swim") || s.includes("swimming") || s.includes("pool")) return SPORT_PROFILES.swimming;
  if (s.includes("golf") || s.includes("golfer")) return SPORT_PROFILES.golf;
  if (s.includes("rowing") || s.includes("crew") || s.includes("sculling") || s.includes("ergo") || s.includes("ergometer")) return SPORT_PROFILES.rowing;
  if (s.includes("cycling") || s.includes("cyclist") || s.includes("biking") || s.includes("triathlon") || s.includes("triathlete") || s.includes("road bike") || s.includes("mountain bike")) return SPORT_PROFILES.cycling;

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
  if (sport === "softball") {
    if (/pitcher/.test(r)) return "pitcher";
    if (/catcher|fielder|infield|outfield/.test(r)) return "hitter_field";
  }
  if (sport === "volleyball") {
    if (/setter/.test(r)) return "setter";
    if (/libero/.test(r)) return "libero";
    if (/hitter|outside|opposite|middle blocker/.test(r)) return "hitter";
  }
  if (sport === "cricket") {
    if (/bowler|fast bowl|spin bowl/.test(r)) return "pitcher";   // maps to pitcher position overlay
    if (/batter|batsman/.test(r)) return "hitter_field";
    if (/keeper|wicketkeeper/.test(r)) return null; // keeper is its own profile
  }
  if (sport === "cricket_bowler") return "pitcher";
  if (sport === "cricket_batter") return "hitter_field";

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
