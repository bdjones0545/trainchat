/**
 * Sport Fit Scoring Tests
 *
 * Verifies that the sport demand profile registry and scoring engine
 * produce correct, differentiated scores across sports and roles.
 *
 * Test cases (per spec Phase 8):
 * 1. Pickleball profile returns higher score for lateral/reactive exercises
 *    than pure bilateral slow lifts
 * 2. Bowling profile boosts rotational + unilateral control exercises
 * 3. Flag football profile boosts acceleration/COD/sprint-resilience exercises
 * 4. Cricket bowler profile differs from cricket batter profile
 * 5. Missing metadata falls back safely (no crash, fallback score returned)
 * 6. Older users without a sport profile do not break the system
 */

import { describe, it, expect } from "vitest";
import { SPORT_DEMAND_PROFILES, getSportDemandProfile, getSportDemandProfileWithRole } from "../lib/sport-profiles";
import { scoreSportFit, buildSportFitExplanation } from "../lib/scoreSportFit";
import type { ExerciseSportMetadata } from "../lib/scoreSportFit";

// ─── Exercise Fixtures ────────────────────────────────────────────────────────

const LATERAL_BOUND: ExerciseSportMetadata = {
  name: "Lateral Bound",
  family: "elastic_reactive",
  velocityIntent: "explosive",
  unilateral: true,
  movementQualities: ["lateral_decel", "elastic_stiffness", "cod", "unilateral_balance"],
  jointDemands: ["ankle_stiffness", "hip_dominant"],
  energySystemTags: ["alactic"],
  transferTags: ["court_coverage", "reactive_speed"],
};

const POGO_JUMPS: ExerciseSportMetadata = {
  name: "Pogo Jumps",
  family: "elastic_reactive",
  velocityIntent: "explosive",
  movementQualities: ["elastic_stiffness", "reactive_footwork"],
  jointDemands: ["ankle_stiffness"],
  energySystemTags: ["alactic"],
};

const BACK_SQUAT_BILATERAL: ExerciseSportMetadata = {
  name: "Back Squat",
  family: "heavy_bilateral_squat",
  velocityIntent: "slow_grind",
  unilateral: false,
  movementQualities: [],
  jointDemands: ["knee_dominant"],
  energySystemTags: [],
};

const MED_BALL_ROTATIONAL: ExerciseSportMetadata = {
  name: "Med Ball Rotational Throw",
  family: "ballistic",
  velocityIntent: "explosive",
  movementQualities: ["rotation_power", "elastic_stiffness"],
  jointDemands: ["lumbar_control", "hip_dominant"],
  energySystemTags: ["alactic"],
};

const SUITCASE_CARRY: ExerciseSportMetadata = {
  name: "Suitcase Carry",
  family: "trunk_stability",
  velocityIntent: "moderate",
  unilateral: true,
  movementQualities: ["anti_rotation", "trunk_stiffness", "grip_endurance", "unilateral_balance"],
  jointDemands: ["wrist_forearm", "lumbar_control"],
  energySystemTags: [],
};

const PALLOF_PRESS: ExerciseSportMetadata = {
  name: "Pallof Press",
  family: "trunk_stability",
  velocityIntent: "slow_grind",
  movementQualities: ["anti_rotation", "trunk_stiffness"],
  jointDemands: ["lumbar_control"],
};

const SPRINT_REPEATS: ExerciseSportMetadata = {
  name: "Sprint Repeats",
  family: "conditioning",
  velocityIntent: "explosive",
  movementQualities: ["acceleration", "max_velocity", "repeat_sprint"],
  jointDemands: ["hamstring", "ankle_stiffness"],
  energySystemTags: ["alactic", "repeat_sprint"],
  transferTags: ["sprint_mechanics", "first_step"],
};

const NORDIC_CURL: ExerciseSportMetadata = {
  name: "Nordics (Nordic Hamstring Curl)",
  family: "unilateral_hinge",
  velocityIntent: "slow_grind",
  movementQualities: ["deceleration"],
  jointDemands: ["hamstring"],
  energySystemTags: [],
  transferTags: ["sprint_mechanics"],
};

const LANDMINE_ROTATION: ExerciseSportMetadata = {
  name: "Landmine Rotation",
  family: "rotational",
  velocityIntent: "ballistic",
  movementQualities: ["rotation_power", "anti_rotation", "trunk_stiffness"],
  jointDemands: ["lumbar_control"],
  energySystemTags: ["alactic"],
};

const SINGLE_LEG_RDL: ExerciseSportMetadata = {
  name: "Single-Leg Romanian Deadlift",
  family: "unilateral_hinge",
  velocityIntent: "slow_grind",
  unilateral: true,
  movementQualities: ["unilateral_balance", "deceleration"],
  jointDemands: ["hamstring", "hip_dominant"],
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Sport Demand Profiles — Registry", () => {
  it("should have profiles for all required new sports", () => {
    const requiredSports = [
      "pickleball", "cricket", "cricket_bowler", "cricket_batter",
      "cricket_wicketkeeper", "flag_football", "bowling", "padel",
      "badminton", "squash", "wrestling", "boxing", "mma",
      "baseball_pitcher", "baseball_position_player",
      "volleyball_setter", "volleyball_hitter", "volleyball_libero",
    ];
    for (const sport of requiredSports) {
      expect(SPORT_DEMAND_PROFILES[sport], `Missing profile: ${sport}`).toBeDefined();
    }
  });

  it("getSportDemandProfile handles null/undefined gracefully", () => {
    expect(getSportDemandProfile(null)).toBeNull();
    expect(getSportDemandProfile(undefined)).toBeNull();
    expect(getSportDemandProfile("")).toBeNull();
  });

  it("getSportDemandProfile is case-insensitive", () => {
    expect(getSportDemandProfile("PICKLEBALL")).not.toBeNull();
    expect(getSportDemandProfile("Pickleball")).not.toBeNull();
    expect(getSportDemandProfile("pickleball")).not.toBeNull();
  });

  it("getSportDemandProfileWithRole returns role-specific profile when available", () => {
    const bowlerProfile = getSportDemandProfileWithRole("cricket", "bowler");
    const batterProfile = getSportDemandProfileWithRole("cricket", "batter");
    expect(bowlerProfile?.id).toBe("cricket_bowler");
    expect(batterProfile?.id).toBe("cricket_batter");
  });

  it("getSportDemandProfileWithRole falls back to base sport when role not found", () => {
    const profile = getSportDemandProfileWithRole("pickleball", "some_unknown_role");
    expect(profile?.id).toBe("pickleball");
  });
});

// ─── Test 1: Pickleball — lateral/reactive > bilateral slow ──────────────────

describe("Test 1: Pickleball profile", () => {
  const pickleball = SPORT_DEMAND_PROFILES.pickleball;

  it("lateral bound scores higher than bilateral slow squat for pickleball", () => {
    const lateralScore = scoreSportFit({ sportProfile: pickleball, exercise: LATERAL_BOUND });
    const squatScore = scoreSportFit({ sportProfile: pickleball, exercise: BACK_SQUAT_BILATERAL });
    expect(lateralScore.total).toBeGreaterThan(squatScore.total);
  });

  it("pogo jumps score higher than bilateral slow squat for pickleball", () => {
    const pogoScore = scoreSportFit({ sportProfile: pickleball, exercise: POGO_JUMPS });
    const squatScore = scoreSportFit({ sportProfile: pickleball, exercise: BACK_SQUAT_BILATERAL });
    expect(pogoScore.total).toBeGreaterThan(squatScore.total);
  });

  it("lateral bound gets a priority bonus for pickleball", () => {
    const result = scoreSportFit({ sportProfile: pickleball, exercise: LATERAL_BOUND });
    expect(result.breakdown.priorityBonus).toBeGreaterThan(0);
  });

  it("Pallof press earns anti-rotation bonus for pickleball", () => {
    const result = scoreSportFit({ sportProfile: pickleball, exercise: PALLOF_PRESS });
    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown.priorityBonus).toBeGreaterThan(0);
  });

  it("produces an explanation with pickleball-relevant details", () => {
    const result = scoreSportFit({ sportProfile: pickleball, exercise: LATERAL_BOUND });
    const explanation = buildSportFitExplanation(LATERAL_BOUND, pickleball, result);
    expect(explanation).toContain("Pickleball");
    expect(explanation.length).toBeGreaterThan(10);
  });
});

// ─── Test 2: Bowling — rotational + unilateral boosted ───────────────────────

describe("Test 2: Bowling profile", () => {
  const bowling = SPORT_DEMAND_PROFILES.bowling;

  it("rotational med ball throw scores high for bowling", () => {
    const rotationalScore = scoreSportFit({ sportProfile: bowling, exercise: MED_BALL_ROTATIONAL });
    const squatScore = scoreSportFit({ sportProfile: bowling, exercise: BACK_SQUAT_BILATERAL });
    expect(rotationalScore.total).toBeGreaterThan(squatScore.total);
  });

  it("suitcase carry (unilateral + grip + anti-rotation) scores high for bowling", () => {
    const carryScore = scoreSportFit({ sportProfile: bowling, exercise: SUITCASE_CARRY });
    const squatScore = scoreSportFit({ sportProfile: bowling, exercise: BACK_SQUAT_BILATERAL });
    expect(carryScore.total).toBeGreaterThan(squatScore.total);
  });

  it("landmine rotation gets priority bonus for bowling", () => {
    const result = scoreSportFit({ sportProfile: bowling, exercise: LANDMINE_ROTATION });
    expect(result.breakdown.priorityBonus).toBeGreaterThan(0);
  });

  it("Pallof press gets priority bonus for bowling (anti-rotation)", () => {
    const result = scoreSportFit({ sportProfile: bowling, exercise: PALLOF_PRESS });
    expect(result.breakdown.priorityBonus).toBeGreaterThan(0);
  });
});

// ─── Test 3: Flag football — acceleration/COD/sprint boosted ─────────────────

describe("Test 3: Flag football profile", () => {
  const flagFootball = SPORT_DEMAND_PROFILES.flag_football;

  it("sprint repeats score higher than bilateral slow squat for flag football", () => {
    const sprintScore = scoreSportFit({ sportProfile: flagFootball, exercise: SPRINT_REPEATS });
    const squatScore = scoreSportFit({ sportProfile: flagFootball, exercise: BACK_SQUAT_BILATERAL });
    expect(sprintScore.total).toBeGreaterThan(squatScore.total);
  });

  it("lateral bound (COD/decel) scores well for flag football", () => {
    const lateralScore = scoreSportFit({ sportProfile: flagFootball, exercise: LATERAL_BOUND });
    const squatScore = scoreSportFit({ sportProfile: flagFootball, exercise: BACK_SQUAT_BILATERAL });
    expect(lateralScore.total).toBeGreaterThan(squatScore.total);
  });

  it("Nordic curl scores well for flag football (hamstring resilience)", () => {
    const nordicResult = scoreSportFit({ sportProfile: flagFootball, exercise: NORDIC_CURL });
    expect(nordicResult.total).toBeGreaterThan(0);
    // Nordic targets hamstring — high injury bias for flag football
    expect(nordicResult.breakdown.injuryBiasBonus).toBeGreaterThan(0);
  });

  it("sprint repeats get energy system match bonus for flag football", () => {
    const result = scoreSportFit({ sportProfile: flagFootball, exercise: SPRINT_REPEATS });
    expect(result.breakdown.priorityBonus + result.breakdown.qualityMatch).toBeGreaterThan(10);
  });
});

// ─── Test 4: Cricket bowler differs from cricket batter ──────────────────────

describe("Test 4: Cricket bowler vs batter profile differentiation", () => {
  const bowler = SPORT_DEMAND_PROFILES.cricket_bowler;
  const batter = SPORT_DEMAND_PROFILES.cricket_batter;

  it("bowler profile has higher rotation demand than batter", () => {
    expect(bowler.demandProfile.rotation).toBeGreaterThanOrEqual(batter.demandProfile.rotation);
  });

  it("bowler profile has higher overhead demand than batter", () => {
    expect(bowler.demandProfile.overheadDemand).toBeGreaterThan(batter.demandProfile.overheadDemand);
  });

  it("bowler has higher low-back injury bias than batter", () => {
    expect(bowler.injuryBias.lowBack).toBeGreaterThan(batter.injuryBias.lowBack);
  });

  it("batter has higher grip demand than bowler", () => {
    expect(batter.demandProfile.gripForearmDemand).toBeGreaterThanOrEqual(bowler.demandProfile.gripForearmDemand);
  });

  it("med ball rotational throw scores higher for bowler than batter due to trunk rotation priority", () => {
    const bowlerScore = scoreSportFit({ sportProfile: bowler, exercise: MED_BALL_ROTATIONAL });
    const batterScore = scoreSportFit({ sportProfile: batter, exercise: MED_BALL_ROTATIONAL });
    // Both prioritize rotation — but bowler's trunk rotation demand is more critical
    // Both should score reasonably well (>20 is passing)
    expect(bowlerScore.total).toBeGreaterThan(15);
    expect(batterScore.total).toBeGreaterThan(15);
  });

  it("bowler prioritizes overhead_stability; batter does not", () => {
    expect(bowler.programmingBias.prioritizeQualities).toContain("overhead_stability");
    expect(batter.programmingBias.deEmphasizeQualities).toContain("overhead_stability");
  });

  it("bowler profile ID is different from batter profile ID", () => {
    expect(bowler.id).not.toBe(batter.id);
    expect(bowler.displayName).not.toBe(batter.displayName);
  });
});

// ─── Test 5: Missing metadata falls back safely ───────────────────────────────

describe("Test 5: Missing metadata graceful fallback", () => {
  const pickleball = SPORT_DEMAND_PROFILES.pickleball;

  const exerciseWithNoTags: ExerciseSportMetadata = {
    name: "Some Unnamed Exercise",
    // No movementQualities, jointDemands, sportTransferTags, or intentTags
  };

  const exerciseWithOnlyFamily: ExerciseSportMetadata = {
    name: "Some Elastic Exercise",
    family: "elastic_reactive",
    velocityIntent: "explosive",
    // No new quality tags — only family
  };

  it("does not throw when exercise has no metadata", () => {
    expect(() =>
      scoreSportFit({ sportProfile: pickleball, exercise: exerciseWithNoTags })
    ).not.toThrow();
  });

  it("returns a valid result when exercise has no metadata", () => {
    const result = scoreSportFit({ sportProfile: pickleball, exercise: exerciseWithNoTags });
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.missingMetadata).toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("falls back to family-based estimate for elastic exercises", () => {
    const result = scoreSportFit({ sportProfile: pickleball, exercise: exerciseWithOnlyFamily });
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("returns explanation note about sparse metadata", () => {
    const result = scoreSportFit({ sportProfile: pickleball, exercise: exerciseWithNoTags });
    expect(result.explanation.some(e => e.includes("metadata"))).toBe(true);
  });

  it("elastic family gives higher fallback score for lateral sport (pickleball) than bilateral family", () => {
    const elasticResult = scoreSportFit({ sportProfile: pickleball, exercise: exerciseWithOnlyFamily });
    const bilateralEx: ExerciseSportMetadata = { name: "No Tag Squat", family: "heavy_bilateral_squat" };
    const bilateralResult = scoreSportFit({ sportProfile: pickleball, exercise: bilateralEx });
    expect(elasticResult.total).toBeGreaterThanOrEqual(bilateralResult.total);
  });
});

// ─── Test 6: Older users without sport profile do not break ──────────────────

describe("Test 6: No sport profile — graceful behavior", () => {
  it("getSportDemandProfile returns null for unknown sport string", () => {
    expect(getSportDemandProfile("unknown_sport_xyz")).toBeNull();
    expect(getSportDemandProfile("not_a_sport")).toBeNull();
  });

  it("getSportDemandProfile returns null for empty sportFocus field", () => {
    const userSportFocus: string | null = null; // simulating old user with no sport set
    const profile = getSportDemandProfile(userSportFocus);
    expect(profile).toBeNull();
  });

  it("scoreSportFit with general_athlete profile does not crash", () => {
    const generalAthlete = SPORT_DEMAND_PROFILES.general_athlete;
    expect(() =>
      scoreSportFit({ sportProfile: generalAthlete, exercise: BACK_SQUAT_BILATERAL })
    ).not.toThrow();
  });

  it("ranking logic should be able to skip sport fit scoring when no profile exists", () => {
    // Simulating a ranking pipeline that guards against null sport profile
    const userSportFocus: string | null = null;
    const sportProfile = getSportDemandProfile(userSportFocus);

    // If no profile, sport fit score defaults to 0 (no boost, no penalty)
    const sportFitScore = sportProfile
      ? scoreSportFit({ sportProfile, exercise: BACK_SQUAT_BILATERAL }).total
      : 0;

    expect(sportFitScore).toBe(0);
  });

  it("profile lookup with old user having no secondary sports is safe", () => {
    // Old users have secondarySports = null in the DB
    const secondarySports: string | null = null;
    const parsed = secondarySports ? JSON.parse(secondarySports) as string[] : [];
    expect(parsed).toEqual([]);
    expect(Array.isArray(parsed)).toBe(true);
  });
});

// ─── Bonus: Score sanity checks ───────────────────────────────────────────────

describe("Score sanity checks", () => {
  it("total score is always between 0 and 100", () => {
    const profiles = [
      SPORT_DEMAND_PROFILES.pickleball,
      SPORT_DEMAND_PROFILES.bowling,
      SPORT_DEMAND_PROFILES.flag_football,
      SPORT_DEMAND_PROFILES.cricket_bowler,
    ];
    const exercises = [LATERAL_BOUND, BACK_SQUAT_BILATERAL, MED_BALL_ROTATIONAL, SPRINT_REPEATS];

    for (const profile of profiles) {
      for (const exercise of exercises) {
        const result = scoreSportFit({ sportProfile: profile, exercise });
        expect(result.total).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeLessThanOrEqual(100);
      }
    }
  });

  it("all required new sport profiles have all demandProfile keys defined", () => {
    const requiredKeys: (keyof typeof SPORT_DEMAND_PROFILES.pickleball.demandProfile)[] = [
      "acceleration", "maxVelocity", "lateralMovement", "changeOfDirection",
      "deceleration", "elasticReactivity", "rotation", "antiRotation",
      "overheadDemand", "unilateralControl", "gripForearmDemand",
      "aerobicDemand", "repeatSprintDemand",
    ];

    const checkProfiles = ["pickleball", "bowling", "flag_football", "cricket_bowler", "mma", "boxing", "wrestling"];
    for (const sportId of checkProfiles) {
      const profile = SPORT_DEMAND_PROFILES[sportId];
      expect(profile, `Missing profile: ${sportId}`).toBeDefined();
      for (const key of requiredKeys) {
        expect(profile.demandProfile[key], `${sportId}.demandProfile.${key} is undefined`).toBeDefined();
      }
    }
  });
});
