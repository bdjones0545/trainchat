/**
 * TrainChat Sport Demand Profile Registry
 *
 * Phase 3 Intelligence Upgrade — Quantitative sport-fit scoring.
 *
 * Each sport is represented by its MOVEMENT AND PERFORMANCE DEMANDS,
 * not just a name. This powers:
 *   - Exercise-to-sport fit scoring (scoreSportFit.ts)
 *   - Candidate ranking boosts and penalties
 *   - Agent reasoning and explainability hooks
 *
 * Works alongside sport-profile-engine.ts (which handles AI prompt injection
 * and session architecture). This file handles numerical demand scoring.
 *
 * DemandScore scale:
 *   0 = not relevant
 *   1 = low demand (present, not central)
 *   2 = moderate demand (important but not defining)
 *   3 = high demand (primary/defining quality for this sport)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type DemandScore = 0 | 1 | 2 | 3;

export type SportDemandCategory =
  | "field"
  | "court"
  | "bat_and_ball"
  | "precision"
  | "combat"
  | "other";

export interface SportDemandProfile {
  id: string;
  displayName: string;
  category: SportDemandCategory;
  /**
   * Optional: positions or roles within this sport.
   * Role-based subprofiles (e.g. cricket_bowler) override the base sport profile.
   */
  positions?: string[];
  /**
   * Numerical demand across key athletic qualities.
   * Used to score how well an exercise matches sport demands.
   */
  demandProfile: {
    acceleration: DemandScore;
    maxVelocity: DemandScore;
    lateralMovement: DemandScore;
    changeOfDirection: DemandScore;
    deceleration: DemandScore;
    elasticReactivity: DemandScore;
    rotation: DemandScore;
    antiRotation: DemandScore;
    overheadDemand: DemandScore;
    unilateralControl: DemandScore;
    gripForearmDemand: DemandScore;
    aerobicDemand: DemandScore;
    repeatSprintDemand: DemandScore;
  };
  /**
   * Tissues most at risk in this sport (for injury-prevention weighting).
   */
  injuryBias: {
    ankleFoot: DemandScore;
    knee: DemandScore;
    hamstring: DemandScore;
    groinHip: DemandScore;
    shoulderElbow: DemandScore;
    lowBack: DemandScore;
    wristHand: DemandScore;
  };
  /**
   * Programming bias — what to surface more or less for this sport.
   * Uses movementQuality tags from exerciseExtendedMeta.
   */
  programmingBias: {
    prioritizeQualities: string[];
    deEmphasizeQualities: string[];
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const SPORT_DEMAND_PROFILES: Record<string, SportDemandProfile> = {

  // ── PICKLEBALL ─────────────────────────────────────────────────────────────
  pickleball: {
    id: "pickleball",
    displayName: "Pickleball",
    category: "court",
    positions: ["singles", "doubles"],
    demandProfile: {
      acceleration:       2, // Short dashes to the kitchen line
      maxVelocity:        0, // No true top-speed sprinting; court is too small
      lateralMovement:    3, // Constant lateral shuffle along the kitchen
      changeOfDirection:  3, // Continuous multidirectional court coverage
      deceleration:       3, // Rapid stops and resets on a small surface
      elasticReactivity:  3, // Split-step — reactive to every opponent shot
      rotation:           2, // Forehand/backhand drives and overhead smash
      antiRotation:       3, // Dink stability, trunk control at net
      overheadDemand:     2, // Overhead smash and lob return
      unilateralControl:  2, // Lunge positions to reach wide balls
      gripForearmDemand:  3, // Paddle control; lateral epicondylitis is common
      aerobicDemand:      2, // Extended rally sequences
      repeatSprintDemand: 2, // Point-to-point burst-recovery pattern
    },
    injuryBias: {
      ankleFoot:     2, // Lateral court movement
      knee:          2, // Lunge/decel demands
      hamstring:     1,
      groinHip:      2, // Wide lateral lunges
      shoulderElbow: 3, // Paddle elbow (lateral epicondylitis) + shoulder
      lowBack:       2, // Forward flexion at net, rotational shots
      wristHand:     3, // Paddle impact and wrist snap
    },
    programmingBias: {
      prioritizeQualities: [
        "lateral_decel",
        "cod",
        "elastic_stiffness",
        "anti_rotation",
        "reactive_footwork",
        "grip_endurance",
        "overhead_stability",
        "unilateral_balance",
      ],
      deEmphasizeQualities: [
        "max_velocity",
        "trunk_stiffness", // Already captured by anti_rotation
      ],
    },
  },

  // ── CRICKET (base profile — applies when no role is specified) ──────────────
  cricket: {
    id: "cricket",
    displayName: "Cricket",
    category: "bat_and_ball",
    positions: ["bowler", "batter", "wicketkeeper", "all_rounder"],
    demandProfile: {
      acceleration:       2,
      maxVelocity:        1,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       2,
      elasticReactivity:  2,
      rotation:           2,
      antiRotation:       2,
      overheadDemand:     2, // Fielding throws
      unilateralControl:  2,
      gripForearmDemand:  2,
      aerobicDemand:      2, // Long match duration
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          2,
      hamstring:     2,
      groinHip:      2,
      shoulderElbow: 2,
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: ["rotation_power", "unilateral_balance", "overhead_stability"],
      deEmphasizeQualities: ["max_velocity"],
    },
  },

  // ── CRICKET BOWLER ─────────────────────────────────────────────────────────
  cricket_bowler: {
    id: "cricket_bowler",
    displayName: "Cricket — Bowler",
    category: "bat_and_ball",
    demandProfile: {
      acceleration:       2, // Run-up approach
      maxVelocity:        2, // Fast bowlers need run-up speed
      lateralMovement:    1,
      changeOfDirection:  1,
      deceleration:       3, // Plant and deliver — massive decel at crease
      elasticReactivity:  2,
      rotation:           3, // Bowling action — high trunk rotation
      antiRotation:       3, // Bracing through the delivery stride
      overheadDemand:     3, // High overhead arm action on every delivery
      unilateralControl:  3, // Delivery stride — extreme unilateral demand
      gripForearmDemand:  2, // Seam/swing grip
      aerobicDemand:      2,
      repeatSprintDemand: 3, // Repeated bowling spells throughout a match
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          2,
      hamstring:     3, // Run-up + landing forces
      groinHip:      2,
      shoulderElbow: 3, // Bowling arm — very high overhead load
      lowBack:       3, // Lumbar stress fractures are common in fast bowlers
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: [
        "rotation_power",
        "anti_rotation",
        "trunk_stiffness",
        "overhead_stability",
        "unilateral_balance",
        "deceleration",
      ],
      deEmphasizeQualities: ["max_velocity", "lateral_decel"],
    },
  },

  // ── CRICKET BATTER ─────────────────────────────────────────────────────────
  cricket_batter: {
    id: "cricket_batter",
    displayName: "Cricket — Batter",
    category: "bat_and_ball",
    demandProfile: {
      acceleration:       2, // Running between wickets
      maxVelocity:        1,
      lateralMovement:    1,
      changeOfDirection:  2, // Run-out evasion, turning for runs
      deceleration:       2,
      elasticReactivity:  2, // Reactive to ball delivery
      rotation:           3, // Batting stroke — hip-shoulder separation
      antiRotation:       2, // Stabilizing through impact
      overheadDemand:     1,
      unilateralControl:  2, // Batting stance and footwork
      gripForearmDemand:  3, // Bat control through impact
      aerobicDemand:      1, // Sustained time at crease, not aerobic sport
      repeatSprintDemand: 1,
    },
    injuryBias: {
      ankleFoot:     1,
      knee:          1,
      hamstring:     2,
      groinHip:      2,
      shoulderElbow: 2,
      lowBack:       2, // Rotational batting load
      wristHand:     3, // Bat impact and grip
    },
    programmingBias: {
      prioritizeQualities: [
        "rotation_power",
        "grip_endurance",
        "anti_rotation",
        "unilateral_balance",
      ],
      deEmphasizeQualities: ["overhead_stability", "max_velocity"],
    },
  },

  // ── CRICKET WICKETKEEPER ───────────────────────────────────────────────────
  cricket_wicketkeeper: {
    id: "cricket_wicketkeeper",
    displayName: "Cricket — Wicketkeeper",
    category: "bat_and_ball",
    demandProfile: {
      acceleration:       2,
      maxVelocity:        1,
      lateralMovement:    2,
      changeOfDirection:  2, // Lateral dives
      deceleration:       2,
      elasticReactivity:  3, // Reactive catching and diving
      rotation:           1,
      antiRotation:       2,
      overheadDemand:     1,
      unilateralControl:  3, // Single-leg lateral dives
      gripForearmDemand:  3, // Keeping gloves, takes
      aerobicDemand:      2,
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          3, // Deep squat position maintained for long periods
      hamstring:     1,
      groinHip:      2,
      shoulderElbow: 2,
      lowBack:       2, // Deep squat stance for entire innings
      wristHand:     3, // Ball impact through gloves
    },
    programmingBias: {
      prioritizeQualities: [
        "reactive_footwork",
        "elastic_stiffness",
        "unilateral_balance",
        "grip_endurance",
        "lateral_decel",
      ],
      deEmphasizeQualities: ["max_velocity", "rotation_power"],
    },
  },

  // ── FLAG FOOTBALL ──────────────────────────────────────────────────────────
  flag_football: {
    id: "flag_football",
    displayName: "Flag Football",
    category: "field",
    positions: ["quarterback", "receiver", "rusher", "defender"],
    demandProfile: {
      acceleration:       3, // Route running, pursuit, first step off the line
      maxVelocity:        3, // Wide open-field speed — separating on routes
      lateralMovement:    3, // Route breaks, defensive shuffles, jukes
      changeOfDirection:  3, // Sharp cuts, double moves, route breaks
      deceleration:       3, // Route breaks, stopping and restarting
      elasticReactivity:  3, // Reactive cuts and defensive responses
      rotation:           1, // Minimal — no contact throwing requirement
      antiRotation:       2, // Core stability for decel and COD
      overheadDemand:     1, // Catching
      unilateralControl:  3, // Cutting, breaking, single-leg planting
      gripForearmDemand:  1, // Flag pulling
      aerobicDemand:      2, // Repeated play-to-play effort
      repeatSprintDemand: 3, // High-intensity efforts each play
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          3, // Cutting and change-of-direction without contact protection
      hamstring:     3, // High-speed sprinting demands
      groinHip:      2,
      shoulderElbow: 1,
      lowBack:       1,
      wristHand:     1,
    },
    programmingBias: {
      prioritizeQualities: [
        "acceleration",
        "max_velocity",
        "cod",
        "lateral_decel",
        "elastic_stiffness",
        "reactive_footwork",
        "unilateral_balance",
      ],
      deEmphasizeQualities: ["grip_endurance", "overhead_stability", "rotation_power"],
    },
  },

  // ── BOWLING (10-pin) ───────────────────────────────────────────────────────
  bowling: {
    id: "bowling",
    displayName: "Bowling (10-Pin)",
    category: "precision",
    demandProfile: {
      acceleration:       1, // Approach — not explosive
      maxVelocity:        0,
      lateralMovement:    0,
      changeOfDirection:  0,
      deceleration:       2, // Controlled slide at the foul line
      elasticReactivity:  0,
      rotation:           3, // Ball release — wrist and forearm rotation
      antiRotation:       2, // Trunk stability through approach
      overheadDemand:     2, // Backswing arc
      unilateralControl:  3, // Single-arm delivery + single-leg slide finish
      gripForearmDemand:  3, // Ball grip, wrist snap, repetitive asymmetry
      aerobicDemand:      1,
      repeatSprintDemand: 0,
    },
    injuryBias: {
      ankleFoot:     2, // Slide foot mechanics
      knee:          1,
      hamstring:     1,
      groinHip:      2, // Slide mechanics and hip hinge
      shoulderElbow: 2, // Delivery arm — repetitive overhead swing
      lowBack:       3, // Repetitive rotation + asymmetrical loading
      wristHand:     3, // Wrist snap, grip — most common bowling injury
    },
    programmingBias: {
      prioritizeQualities: [
        "rotation_power",
        "anti_rotation",
        "unilateral_balance",
        "grip_endurance",
        "trunk_stiffness",
      ],
      deEmphasizeQualities: ["max_velocity", "acceleration", "lateral_decel", "elastic_stiffness"],
    },
  },

  // ── PADEL ──────────────────────────────────────────────────────────────────
  padel: {
    id: "padel",
    displayName: "Padel",
    category: "court",
    positions: ["singles", "doubles"],
    demandProfile: {
      acceleration:       2,
      maxVelocity:        1,
      lateralMovement:    3, // Wall-play and court coverage
      changeOfDirection:  3,
      deceleration:       3,
      elasticReactivity:  3, // Wall shots require reactive absorption and return
      rotation:           3, // Padel-specific stroke mechanics
      antiRotation:       2,
      overheadDemand:     2, // Smash at the back wall
      unilateralControl:  2,
      gripForearmDemand:  3, // Solid padel grip, wrist
      aerobicDemand:      2,
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          2,
      hamstring:     1,
      groinHip:      2,
      shoulderElbow: 3, // Similar overuse profile to pickleball
      lowBack:       2,
      wristHand:     3,
    },
    programmingBias: {
      prioritizeQualities: [
        "lateral_decel",
        "cod",
        "elastic_stiffness",
        "rotation_power",
        "anti_rotation",
        "reactive_footwork",
        "grip_endurance",
      ],
      deEmphasizeQualities: ["max_velocity"],
    },
  },

  // ── BADMINTON ──────────────────────────────────────────────────────────────
  badminton: {
    id: "badminton",
    displayName: "Badminton",
    category: "court",
    demandProfile: {
      acceleration:       3, // Short explosive court dashes
      maxVelocity:        1,
      lateralMovement:    3,
      changeOfDirection:  3,
      deceleration:       3,
      elasticReactivity:  3, // Split-step and reactive court movement
      rotation:           2,
      antiRotation:       2,
      overheadDemand:     3, // Smash, overhead clear — defining shot type
      unilateralControl:  3, // Lunge patterns to all four corners
      gripForearmDemand:  2,
      aerobicDemand:      3, // Highest aerobic demand of all racket sports
      repeatSprintDemand: 3, // Continuous high-intensity rally demands
    },
    injuryBias: {
      ankleFoot:     3, // Frequent lateral ankle sprains
      knee:          2,
      hamstring:     1,
      groinHip:      3, // Lunge mechanics to corners
      shoulderElbow: 3, // Overhead smash — rotator cuff and elbow
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: [
        "overhead_stability",
        "lateral_decel",
        "cod",
        "elastic_stiffness",
        "reactive_footwork",
        "unilateral_balance",
        "acceleration",
      ],
      deEmphasizeQualities: ["max_velocity", "grip_endurance"],
    },
  },

  // ── SQUASH ─────────────────────────────────────────────────────────────────
  squash: {
    id: "squash",
    displayName: "Squash",
    category: "court",
    demandProfile: {
      acceleration:       3, // Explosive court dashes to all four corners
      maxVelocity:        1,
      lateralMovement:    3,
      changeOfDirection:  3,
      deceleration:       3,
      elasticReactivity:  3,
      rotation:           2,
      antiRotation:       2,
      overheadDemand:     2,
      unilateralControl:  3, // Lunge to the ball
      gripForearmDemand:  2,
      aerobicDemand:      3, // Very high — long points at sustained intensity
      repeatSprintDemand: 3,
    },
    injuryBias: {
      ankleFoot:     3,
      knee:          2,
      hamstring:     2,
      groinHip:      3, // Extreme lunge positions
      shoulderElbow: 2,
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: [
        "lateral_decel",
        "cod",
        "elastic_stiffness",
        "reactive_footwork",
        "acceleration",
        "unilateral_balance",
      ],
      deEmphasizeQualities: ["max_velocity", "rotation_power"],
    },
  },

  // ── LACROSSE (extended demand profile) ─────────────────────────────────────
  lacrosse: {
    id: "lacrosse",
    displayName: "Lacrosse",
    category: "field",
    positions: ["attack", "midfield", "defense", "goalkeeper"],
    demandProfile: {
      acceleration:       3,
      maxVelocity:        2,
      lateralMovement:    2,
      changeOfDirection:  3,
      deceleration:       2,
      elasticReactivity:  2,
      rotation:           3, // Shooting and passing mechanics
      antiRotation:       2,
      overheadDemand:     2, // Cradling and overhead throws
      unilateralControl:  2,
      gripForearmDemand:  2, // Stick handling
      aerobicDemand:      3, // High-volume running sport
      repeatSprintDemand: 3,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          2,
      hamstring:     3,
      groinHip:      2,
      shoulderElbow: 2,
      lowBack:       1,
      wristHand:     1,
    },
    programmingBias: {
      prioritizeQualities: ["acceleration", "cod", "rotation_power", "unilateral_balance"],
      deEmphasizeQualities: ["grip_endurance", "overhead_stability"],
    },
  },

  // ── RUGBY (extended demand profile) ───────────────────────────────────────
  rugby: {
    id: "rugby",
    displayName: "Rugby",
    category: "field",
    positions: ["forward", "back", "scrum_half", "fly_half"],
    demandProfile: {
      acceleration:       3,
      maxVelocity:        2,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       2,
      elasticReactivity:  2,
      rotation:           2,
      antiRotation:       3, // Tackle and scrum resistance
      overheadDemand:     1,
      unilateralControl:  2,
      gripForearmDemand:  3, // Tackle, carry, ruck — grip
      aerobicDemand:      3,
      repeatSprintDemand: 3,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          3,
      hamstring:     3,
      groinHip:      2,
      shoulderElbow: 3, // Tackle and contact
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: [
        "acceleration",
        "anti_rotation",
        "trunk_stiffness",
        "grip_endurance",
        "unilateral_balance",
      ],
      deEmphasizeQualities: ["overhead_stability"],
    },
  },

  // ── VOLLEYBALL (base) ──────────────────────────────────────────────────────
  volleyball: {
    id: "volleyball",
    displayName: "Volleyball",
    category: "court",
    positions: ["setter", "outside_hitter", "middle_blocker", "libero", "opposite"],
    demandProfile: {
      acceleration:       2,
      maxVelocity:        1,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       2,
      elasticReactivity:  3, // Reactive jump timing
      rotation:           1,
      antiRotation:       2,
      overheadDemand:     3, // Spike, block, serve — defining actions
      unilateralControl:  2,
      gripForearmDemand:  2, // Setting and passing
      aerobicDemand:      2,
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     3, // Landing on opponent's foot — #1 volleyball injury
      knee:          3, // Patellar tendinopathy from repeated jumping
      hamstring:     1,
      groinHip:      1,
      shoulderElbow: 3, // Spike mechanics — rotator cuff
      lowBack:       2,
      wristHand:     2, // Setting, passing impact
    },
    programmingBias: {
      prioritizeQualities: [
        "overhead_stability",
        "elastic_stiffness",
        "reactive_footwork",
        "lateral_decel",
        "unilateral_balance",
      ],
      deEmphasizeQualities: ["max_velocity", "rotation_power"],
    },
  },

  // ── VOLLEYBALL SETTER ──────────────────────────────────────────────────────
  volleyball_setter: {
    id: "volleyball_setter",
    displayName: "Volleyball — Setter",
    category: "court",
    demandProfile: {
      acceleration:       2,
      maxVelocity:        1,
      lateralMovement:    3, // Run to every set location
      changeOfDirection:  3,
      deceleration:       2,
      elasticReactivity:  2,
      rotation:           1,
      antiRotation:       2,
      overheadDemand:     3, // Setting — primary skill is overhead
      unilateralControl:  2,
      gripForearmDemand:  3, // Setting finger strength and wrist
      aerobicDemand:      2,
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          2,
      hamstring:     1,
      groinHip:      1,
      shoulderElbow: 2,
      lowBack:       1,
      wristHand:     3, // Setter's wrist and finger injuries
    },
    programmingBias: {
      prioritizeQualities: ["overhead_stability", "cod", "lateral_decel", "grip_endurance"],
      deEmphasizeQualities: ["max_velocity", "rotation_power", "trunk_stiffness"],
    },
  },

  // ── VOLLEYBALL HITTER ──────────────────────────────────────────────────────
  volleyball_hitter: {
    id: "volleyball_hitter",
    displayName: "Volleyball — Outside/Opposite Hitter",
    category: "court",
    demandProfile: {
      acceleration:       2,
      maxVelocity:        1,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       3, // Jump landings repeated throughout match
      elasticReactivity:  3, // Jump timing and reactive block jumps
      rotation:           2, // Arm swing rotation
      antiRotation:       2,
      overheadDemand:     3, // Spike mechanics — primary action
      unilateralControl:  2,
      gripForearmDemand:  1,
      aerobicDemand:      2,
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     3,
      knee:          3, // Jumper's knee from repeated spike jumps
      hamstring:     1,
      groinHip:      1,
      shoulderElbow: 3, // Spike arm — rotator cuff overuse
      lowBack:       2,
      wristHand:     1,
    },
    programmingBias: {
      prioritizeQualities: [
        "overhead_stability",
        "elastic_stiffness",
        "lateral_decel",
        "unilateral_balance",
        "acceleration",
      ],
      deEmphasizeQualities: ["max_velocity", "grip_endurance"],
    },
  },

  // ── VOLLEYBALL LIBERO ──────────────────────────────────────────────────────
  volleyball_libero: {
    id: "volleyball_libero",
    displayName: "Volleyball — Libero",
    category: "court",
    demandProfile: {
      acceleration:       3, // Fastest on the court — emergency digs
      maxVelocity:        1,
      lateralMovement:    3,
      changeOfDirection:  3,
      deceleration:       3,
      elasticReactivity:  3, // React to opponent's spike in a fraction of a second
      rotation:           0,
      antiRotation:       2,
      overheadDemand:     1,
      unilateralControl:  3, // Diving, sprawling
      gripForearmDemand:  2, // Passing platform
      aerobicDemand:      2,
      repeatSprintDemand: 3,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          2,
      hamstring:     2,
      groinHip:      3, // Sprawl and dive positions
      shoulderElbow: 1,
      lowBack:       2, // Floor work
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: [
        "reactive_footwork",
        "lateral_decel",
        "cod",
        "elastic_stiffness",
        "unilateral_balance",
        "acceleration",
      ],
      deEmphasizeQualities: ["overhead_stability", "rotation_power", "grip_endurance"],
    },
  },

  // ── BASEBALL (extended demand profile) ─────────────────────────────────────
  baseball: {
    id: "baseball",
    displayName: "Baseball",
    category: "bat_and_ball",
    positions: ["pitcher", "catcher", "infielder", "outfielder"],
    demandProfile: {
      acceleration:       3, // Base running, fielding
      maxVelocity:        2,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       2,
      elasticReactivity:  2,
      rotation:           3, // Batting swing, throwing
      antiRotation:       2,
      overheadDemand:     2, // Throwing mechanics
      unilateralControl:  2,
      gripForearmDemand:  3, // Bat grip, ball grip
      aerobicDemand:      1, // Alactic dominant — no sustained aerobic demand
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     1,
      knee:          2,
      hamstring:     3, // Base running sprints
      groinHip:      2,
      shoulderElbow: 3, // Throwing mechanics
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: ["rotation_power", "acceleration", "overhead_stability", "grip_endurance"],
      deEmphasizeQualities: ["lateral_decel", "aerobic_base"],
    },
  },

  // ── BASEBALL PITCHER ───────────────────────────────────────────────────────
  baseball_pitcher: {
    id: "baseball_pitcher",
    displayName: "Baseball — Pitcher",
    category: "bat_and_ball",
    demandProfile: {
      acceleration:       1,
      maxVelocity:        0,
      lateralMovement:    1,
      changeOfDirection:  1,
      deceleration:       3, // Arm deceleration after release — injury vector
      elasticReactivity:  2, // Leg drive and energy transfer
      rotation:           3, // Pitching mechanics — hip-shoulder separation
      antiRotation:       3, // Stabilizing the trunk through release
      overheadDemand:     3, // Every pitch is an overhead motion
      unilateralControl:  3, // Stride leg — extreme unilateral lower body demand
      gripForearmDemand:  3, // Grip pressure affects ball movement
      aerobicDemand:      1,
      repeatSprintDemand: 1,
    },
    injuryBias: {
      ankleFoot:     1,
      knee:          1,
      hamstring:     1,
      groinHip:      1,
      shoulderElbow: 3, // Tommy John, labral tears — #1 pitcher injury
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: [
        "rotation_power",
        "anti_rotation",
        "overhead_stability",
        "trunk_stiffness",
        "unilateral_balance",
        "grip_endurance",
      ],
      deEmphasizeQualities: ["max_velocity", "lateral_decel", "acceleration"],
    },
  },

  // ── BASEBALL POSITION PLAYER ───────────────────────────────────────────────
  baseball_position_player: {
    id: "baseball_position_player",
    displayName: "Baseball — Position Player",
    category: "bat_and_ball",
    demandProfile: {
      acceleration:       3, // Base running, fielding sprints
      maxVelocity:        2,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       2,
      elasticReactivity:  2,
      rotation:           3, // Batting swing
      antiRotation:       2,
      overheadDemand:     2, // Throwing mechanics
      unilateralControl:  2,
      gripForearmDemand:  3, // Bat control
      aerobicDemand:      1,
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     1,
      knee:          2,
      hamstring:     3, // Explosive base running
      groinHip:      2,
      shoulderElbow: 2,
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: ["rotation_power", "acceleration", "grip_endurance"],
      deEmphasizeQualities: ["overhead_stability"],
    },
  },

  // ── SOFTBALL ───────────────────────────────────────────────────────────────
  softball: {
    id: "softball",
    displayName: "Softball",
    category: "bat_and_ball",
    positions: ["pitcher", "catcher", "infielder", "outfielder"],
    demandProfile: {
      acceleration:       3,
      maxVelocity:        2,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       2,
      elasticReactivity:  1,
      rotation:           3, // Batting swing
      antiRotation:       2,
      overheadDemand:     1, // Underhand pitching — different from baseball
      unilateralControl:  2,
      gripForearmDemand:  3,
      aerobicDemand:      1,
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          2,
      hamstring:     3,
      groinHip:      2,
      shoulderElbow: 2,
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: ["rotation_power", "acceleration", "grip_endurance"],
      deEmphasizeQualities: ["overhead_stability", "max_velocity"],
    },
  },

  // ── WRESTLING ──────────────────────────────────────────────────────────────
  wrestling: {
    id: "wrestling",
    displayName: "Wrestling",
    category: "combat",
    demandProfile: {
      acceleration:       2, // Penetration shots
      maxVelocity:        0,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       2,
      elasticReactivity:  2, // Reactive to opponent movements
      rotation:           3, // Throws, sweeps, and scrambles
      antiRotation:       3, // Resisting takedowns
      overheadDemand:     2, // Overhead throws
      unilateralControl:  3, // Level changes, penetration, and finishes
      gripForearmDemand:  3, // Clinch, tie-ups — grip is critical
      aerobicDemand:      2,
      repeatSprintDemand: 3, // Match duration at high intensity
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          3, // Takedown positions
      hamstring:     2,
      groinHip:      3, // Scramble positions
      shoulderElbow: 3, // Joint locks and wrestling positions
      lowBack:       2,
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: [
        "rotation_power",
        "anti_rotation",
        "trunk_stiffness",
        "grip_endurance",
        "unilateral_balance",
        "acceleration",
      ],
      deEmphasizeQualities: ["max_velocity", "overhead_stability"],
    },
  },

  // ── BOXING ─────────────────────────────────────────────────────────────────
  boxing: {
    id: "boxing",
    displayName: "Boxing",
    category: "combat",
    demandProfile: {
      acceleration:       2, // Combination bursts and foot movement
      maxVelocity:        0,
      lateralMovement:    3, // Lateral footwork — slipping, rolling
      changeOfDirection:  3, // Defensive movement patterns
      deceleration:       1,
      elasticReactivity:  2, // Punch reaction speed
      rotation:           3, // Rotational punch power — full kinetic chain
      antiRotation:       3, // Receiving punches — bracing and resistance
      overheadDemand:     2, // Jabs, hooks, uppercuts
      unilateralControl:  2, // Stance mechanics
      gripForearmDemand:  3, // Punching force and hand hardening
      aerobicDemand:      3, // Round endurance
      repeatSprintDemand: 3, // 3-minute rounds at sustained intensity
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          1,
      hamstring:     1,
      groinHip:      1,
      shoulderElbow: 3, // Rotator cuff, elbow from punching
      lowBack:       2, // Rotational loading
      wristHand:     3, // Impact, especially bare-knuckle or with wraps
    },
    programmingBias: {
      prioritizeQualities: [
        "rotation_power",
        "anti_rotation",
        "lateral_decel",
        "reactive_footwork",
        "trunk_stiffness",
        "grip_endurance",
      ],
      deEmphasizeQualities: ["max_velocity", "overhead_stability", "unilateral_balance"],
    },
  },

  // ── MMA ────────────────────────────────────────────────────────────────────
  mma: {
    id: "mma",
    displayName: "Mixed Martial Arts (MMA)",
    category: "combat",
    demandProfile: {
      acceleration:       2, // Takedown and striking combinations
      maxVelocity:        0,
      lateralMovement:    2,
      changeOfDirection:  3, // Scrambles, positional transitions
      deceleration:       2,
      elasticReactivity:  2,
      rotation:           3, // Striking and grappling rotation
      antiRotation:       3, // Position defense
      overheadDemand:     2,
      unilateralControl:  3, // Stand-up, positional scrambles
      gripForearmDemand:  3, // Clinch, ground control, submissions
      aerobicDemand:      3, // Sustained 3–5 round output
      repeatSprintDemand: 3,
    },
    injuryBias: {
      ankleFoot:     2,
      knee:          2,
      hamstring:     2,
      groinHip:      3, // Grappling positions
      shoulderElbow: 3, // Joint locks, striking
      lowBack:       2,
      wristHand:     3,
    },
    programmingBias: {
      prioritizeQualities: [
        "rotation_power",
        "anti_rotation",
        "trunk_stiffness",
        "grip_endurance",
        "unilateral_balance",
        "cod",
      ],
      deEmphasizeQualities: ["max_velocity", "overhead_stability"],
    },
  },

  // ── GOLF (demand profile — extends existing sport-profile-engine entry) ─────
  golf: {
    id: "golf",
    displayName: "Golf",
    category: "precision",
    demandProfile: {
      acceleration:       0,
      maxVelocity:        0,
      lateralMovement:    0,
      changeOfDirection:  0,
      deceleration:       1,
      elasticReactivity:  1, // SSC in the backswing-to-downswing transition
      rotation:           3, // The golf swing is a rotational power expression
      antiRotation:       3, // Lead-side stability through impact
      overheadDemand:     1,
      unilateralControl:  2, // Single-leg balance through impact
      gripForearmDemand:  2, // Club control and wrist position
      aerobicDemand:      1, // Walking 18 holes
      repeatSprintDemand: 0,
    },
    injuryBias: {
      ankleFoot:     0,
      knee:          2, // Lead knee collapse through impact
      hamstring:     0,
      groinHip:      2, // Hip rotation restriction
      shoulderElbow: 1,
      lowBack:       3, // Most common golf injury — rotational spine loading
      wristHand:     2,
    },
    programmingBias: {
      prioritizeQualities: [
        "rotation_power",
        "anti_rotation",
        "trunk_stiffness",
        "unilateral_balance",
        "elastic_stiffness",
      ],
      deEmphasizeQualities: ["max_velocity", "acceleration", "lateral_decel", "reactive_footwork"],
    },
  },

  // ── GENERAL ATHLETE (fallback / non-sport-specific) ────────────────────────
  general_athlete: {
    id: "general_athlete",
    displayName: "General Athlete",
    category: "other",
    demandProfile: {
      acceleration:       2,
      maxVelocity:        1,
      lateralMovement:    2,
      changeOfDirection:  2,
      deceleration:       2,
      elasticReactivity:  2,
      rotation:           1,
      antiRotation:       2,
      overheadDemand:     1,
      unilateralControl:  2,
      gripForearmDemand:  1,
      aerobicDemand:      2,
      repeatSprintDemand: 2,
    },
    injuryBias: {
      ankleFoot:     1,
      knee:          2,
      hamstring:     2,
      groinHip:      1,
      shoulderElbow: 1,
      lowBack:       2,
      wristHand:     1,
    },
    programmingBias: {
      prioritizeQualities: ["unilateral_balance", "anti_rotation", "trunk_stiffness"],
      deEmphasizeQualities: [],
    },
  },
};

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

/**
 * Returns the demand profile for a given sport/role ID.
 * Role-based IDs (e.g. "cricket_bowler") override the base sport profile.
 * Gracefully falls back to null if the sport is unknown.
 */
export function getSportDemandProfile(sportId: string | null | undefined): SportDemandProfile | null {
  if (!sportId) return null;
  const key = sportId.toLowerCase().trim().replace(/\s+/g, "_");
  return SPORT_DEMAND_PROFILES[key] ?? null;
}

/**
 * Returns the demand profile for a sport, with an optional role override.
 * E.g. getSportDemandProfileWithRole("cricket", "bowler") → cricket_bowler profile
 */
export function getSportDemandProfileWithRole(
  sportId: string | null | undefined,
  role?: string | null
): SportDemandProfile | null {
  if (role) {
    const roleKey = `${sportId?.toLowerCase().trim()}_${role.toLowerCase().trim()}`;
    const roleProfile = SPORT_DEMAND_PROFILES[roleKey];
    if (roleProfile) return roleProfile;
  }
  return getSportDemandProfile(sportId);
}

/**
 * Returns all available sport IDs in the demand profile registry.
 */
export function getAllSportIds(): string[] {
  return Object.keys(SPORT_DEMAND_PROFILES);
}
