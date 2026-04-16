/**
 * TrainChat Message-Aware Engine Routing Layer
 *
 * Phase 6 Intelligence Upgrade — Live message routing.
 *
 * PROBLEM SOLVED:
 * Phases 1–5 built real programming intelligence, but all engines were
 * triggered from stored profile fields only. A user could ask something new
 * in chat and the wrong (or no) engine would fire.
 *
 * This module is the fix. It evaluates BOTH the user's live message AND
 * stored profile data to decide which engines activate — and which wins
 * when they conflict.
 *
 * Priority order (highest to lowest):
 * 1. Re-entry / safety override (re-entry always wins)
 * 2. Explicit live message request (what the user says NOW)
 * 3. Sport-specific context (detected from message > profile)
 * 4. Season context (detected from message > profile)
 * 5. Profile default goal and sport
 * 6. General base programming rules
 */

import { logger } from "./logger";
import { isConditioningGoal } from "./conditioning-engine";
import { isPowerRequest, isSpeedRequest } from "./power-speed-engine";
import { mapSportToProfile, detectSeasonContext, type SeasonContext } from "./sport-profile-engine";
import { needsPeriodizationContext } from "./periodization-engine";
import { detectReEntryStatus, type ReEntryClassification } from "./re-entry-engine";
import { detectMobilityRequest, needsMobilityContext } from "./mobility-engine";
import { type UserProfile } from "./training-intelligence";

// ─── Routing Decision Types ───────────────────────────────────────────────────

export type DominantDomain =
  | "reEntry"
  | "sport"
  | "conditioning"
  | "powerSpeed"
  | "periodization"
  | "mobility"
  | "base";

export interface SportDetection {
  active: boolean;
  sport: string | null;
  source: "message" | "profile" | "none";
}

export interface SeasonDetection {
  context: SeasonContext | null;
  source: "message" | "profile" | "none";
}

export interface ReEntryDetection {
  active: boolean;
  classification: ReEntryClassification | null;
}

export interface RoutingDebug {
  messageSignals: string[];
  profileSignals: string[];
  priorityResolution: string;
  enginesActive: string[];
  dominantDomain: DominantDomain;
}

export interface RoutingDecision {
  conditioning: boolean;
  powerSpeed: boolean;
  sport: SportDetection;
  season: SeasonDetection;
  reEntry: ReEntryDetection;
  periodization: boolean;
  mobility: boolean;
  dominantDomain: DominantDomain;
  debug: RoutingDebug;
}

// ─── Sport Detection Vocabulary ───────────────────────────────────────────────

const SPORT_MESSAGE_PATTERNS: Record<string, RegExp> = {
  football: /\b(football|nfl|american football|lineman|linebacker|quarterback|wide.?receiver|running.?back|defensive.?back|safety|cornerback|oline|d-line)\b/i,
  basketball: /\b(basketball|nba|baller|hooper|court|post.player|point.guard|shooting.guard|small.forward|power.forward|center)\b/i,
  soccer: /\b(soccer|futbol|association football|midfielder|striker|forward|goalkeeper|winger|fullback|pitch)\b/i,
  baseball: /\b(baseball|mlb|pitcher|catcher|outfield|infield|shortstop|first base|second base|third base|batting)\b/i,
  rugby: /\b(rugby|rugby league|rugby union|scrum|prop|flanker|hooker)\b/i,
  lacrosse: /\b(lacrosse|lax)\b/i,
  hockey: /\b(hockey|ice hockey|nhl|puck)\b/i,
  track: /\b(track|sprinter|distance.runner|100m|200m|400m|800m|track.and.field|cross.country)\b/i,
  volleyball: /\b(volleyball|setter|libero|outside.hitter|middle.blocker)\b/i,
};

// ─── Season Detection Vocabulary ──────────────────────────────────────────────

const SEASON_MESSAGE_PATTERNS: Record<NonNullable<SeasonContext>, RegExp> = {
  in_season: /\b(in.?season|mid.?season|during.?(the.)?season|playing season|competition season|i'?m in.?season|currently playing|season.?started|games?.?start|we.?have games|i have games|playing right now)\b/i,
  off_season: /\b(off.?season|offseason|between seasons?|no.?season|finished the season|season.?over|building phase|training phase)\b/i,
  pre_season: /\b(pre.?season|preseason|training camp|before.?(the.)?season|preparing for season|season starts soon|season.?about to start|camp starts)\b/i,
  post_season: /\b(post.?season|after.?(the.)?season|season.?just ended|recovery.?season|off.?season start)\b/i,
};

// ─── Re-Entry Vocabulary ──────────────────────────────────────────────────────

const REENTRY_QUICK_PATTERNS = [
  /haven.?t.?(trained|worked out|lifted|been to the gym|exercised)/i,
  /getting back (into|to)/i,
  /coming back (from|after|to)/i,
  /returning to (training|the gym|lifting|working out)/i,
  /\d+\s*months?\s*(off|out|away|break|inactive)/i,
  /\d+\s*years?\s*(off|out|away|break|inactive)/i,
  /fell (off|behind|out of)/i,
  /starting (over|fresh|from scratch|from zero)/i,
  /been inconsistent/i,
  /took a (long|extended|big|huge)? (break|time off|layoff|hiatus)/i,
  /rebuild(ing)? (me|myself|my fitness|from scratch)/i,
  /out of shape/i,
  /picking (it )?back up/i,
  /re.?start/i,
  /been out (of the gym|of training)/i,
];

// ─── Conditioning Vocabulary (live message) ───────────────────────────────────

const CONDITIONING_MESSAGE_PATTERNS = [
  /build (my |more )?(conditioning|cardio|aerobic|engine|gas.?tank|fitness)/i,
  /improve (my )?(conditioning|cardio|aerobic|endurance|stamina|fitness)/i,
  /more (conditioning|cardio|aerobic work|endurance|stamina|work capacity)/i,
  /add (more )?(conditioning|cardio|aerobic|intervals|endurance work)/i,
  /game shape/i,
  /gas.?tank/i,
  /gassed (late|out|easily)/i,
  /out of breath/i,
  /repeat sprint/i,
  /work capacity/i,
  /better cardio/i,
];

// ─── Power / Speed Vocabulary (live message) ──────────────────────────────────

const POWER_SPEED_MESSAGE_PATTERNS = [
  /add (more )?(speed|power|explosiveness|explosive work|speed work|sprint work)/i,
  /more (speed|power|explosive|vertical|jump|quickness|agility)/i,
  /improve (my )?(speed|power|vertical|jump|explosiveness|first step|quickness|agility)/i,
  /build (my )?(speed|power|vertical|explosive|jump|acceleration)/i,
  /speed (work|training|program|for)/i,
  /sprint (training|program|work|session)/i,
  /vertical (jump|power|training)/i,
  /jump (higher|training|program)/i,
  /deceleration/i,
  /first.?step/i,
  /change of direction/i,
  /(more )?explosive/i,
];

// ─── Sport Detection from Message ─────────────────────────────────────────────

function detectSportFromMessage(message: string): string | null {
  for (const [sport, pattern] of Object.entries(SPORT_MESSAGE_PATTERNS)) {
    if (pattern.test(message)) return sport;
  }
  return null;
}

// ─── Season Detection from Message ───────────────────────────────────────────

function detectSeasonFromMessage(message: string): SeasonContext | null {
  for (const [season, pattern] of Object.entries(SEASON_MESSAGE_PATTERNS)) {
    if (pattern.test(message)) return season as SeasonContext;
  }
  return null;
}

// ─── Re-Entry Detection from Message ─────────────────────────────────────────

function detectReEntryFromMessage(message: string, profileGoal: string): ReEntryClassification | null {
  const hasQuickSignal = REENTRY_QUICK_PATTERNS.some((p) => p.test(message));
  if (!hasQuickSignal) return null;
  const classification = detectReEntryStatus(message, profileGoal);
  return classification.status !== "none" ? classification : null;
}

// ─── Conditioning Detection from Message ────────────────────────────────────

function detectConditioningFromMessage(message: string): boolean {
  return CONDITIONING_MESSAGE_PATTERNS.some((p) => p.test(message));
}

// ─── Power/Speed Detection from Message ──────────────────────────────────────

function detectPowerSpeedFromMessage(message: string): boolean {
  return (
    POWER_SPEED_MESSAGE_PATTERNS.some((p) => p.test(message)) ||
    isPowerRequest("", message) ||
    isSpeedRequest("", message)
  );
}

// ─── Priority Resolution ──────────────────────────────────────────────────────

function resolveDominantDomain(
  reEntryActive: boolean,
  powerSpeedFromMessage: boolean,
  conditioningFromMessage: boolean,
  sportFromMessage: boolean,
  periodizationActive: boolean,
  mobilityFromMessage: boolean,
  profileGoal: string,
): { dominant: DominantDomain; reason: string } {
  // Priority 1: Re-entry always overrides
  if (reEntryActive) {
    return { dominant: "reEntry", reason: "Re-entry detected — overrides all other programming defaults" };
  }

  // Priority 2: Explicit live message — power/speed
  if (powerSpeedFromMessage) {
    return { dominant: "powerSpeed", reason: "Live message explicitly requests power or speed work" };
  }

  // Priority 3: Explicit live message — conditioning
  if (conditioningFromMessage) {
    return { dominant: "conditioning", reason: "Live message explicitly requests conditioning work" };
  }

  // Priority 4: Explicit live message — mobility/movement support
  if (mobilityFromMessage) {
    return { dominant: "mobility", reason: "Live message explicitly requests mobility, warm-up, flexibility, or movement support work" };
  }

  // Priority 5: Sport-specific context from message
  if (sportFromMessage) {
    return { dominant: "sport", reason: "Live message contains sport-specific context" };
  }

  // Priority 6: Periodization need
  if (periodizationActive) {
    return { dominant: "periodization", reason: "Profile or request requires block periodization" };
  }

  // Priority 7: Profile goal
  const g = profileGoal.toLowerCase();
  if (isPowerRequest(g) || isSpeedRequest(g)) {
    return { dominant: "powerSpeed", reason: "Profile goal is power or speed" };
  }
  if (isConditioningGoal(g)) {
    return { dominant: "conditioning", reason: "Profile goal is conditioning" };
  }

  return { dominant: "base", reason: "General programming — no dominant specialization signal" };
}

// ─── Main Routing Function ────────────────────────────────────────────────────

export function resolveRoutingDecision(
  userMessage: string,
  profile: UserProfile | null,
): RoutingDecision {
  const profileGoal = profile?.trainingGoal ?? "";
  const profileSport = profile?.sportFocus ?? null;
  const profileExperience = profile?.experienceLevel ?? "intermediate";
  const profileGoalLower = profileGoal.toLowerCase();

  const messageSignals: string[] = [];
  const profileSignals: string[] = [];

  // ── Re-entry detection (message first, then profile) ─────────────────────
  const reEntryFromMsg = detectReEntryFromMessage(userMessage, profileGoal);
  const reEntryFromProfile = needsReEntryContextFromProfile(profileGoal);
  const reEntryActive = !!reEntryFromMsg || reEntryFromProfile;
  const reEntryClassification = reEntryFromMsg ?? (reEntryFromProfile ? detectReEntryStatus(profileGoal, profileGoal) : null);

  if (reEntryFromMsg) messageSignals.push("re-entry detected from message");
  if (reEntryFromProfile) profileSignals.push("re-entry detected from profile goal");

  // ── Sport detection (message overrides profile) ──────────────────────────
  const sportFromMessage = detectSportFromMessage(userMessage);
  const sportFromProfile = mapSportToProfile(profileSport) ? profileSport : null;
  const resolvedSport = sportFromMessage ?? sportFromProfile;
  const sportActive = !!resolvedSport;
  const sportSource: "message" | "profile" | "none" =
    sportFromMessage ? "message" : sportFromProfile ? "profile" : "none";

  if (sportFromMessage) messageSignals.push(`sport detected from message: ${sportFromMessage}`);
  if (sportFromProfile && !sportFromMessage) profileSignals.push(`sport from profile: ${sportFromProfile}`);

  // ── Season detection (message overrides profile) ─────────────────────────
  const seasonFromMessage = detectSeasonFromMessage(userMessage);
  const seasonFromProfile = detectSeasonContext(
    profileGoal + " " + (profileSport ?? ""),
    null,
  );
  const resolvedSeason = seasonFromMessage ?? seasonFromProfile;
  const seasonSource: "message" | "profile" | "none" =
    seasonFromMessage ? "message" : seasonFromProfile ? "profile" : "none";

  if (seasonFromMessage) messageSignals.push(`season detected from message: ${seasonFromMessage}`);
  if (seasonFromProfile && !seasonFromMessage) profileSignals.push(`season from profile: ${seasonFromProfile}`);

  // ── Conditioning detection (message OR profile) ──────────────────────────
  const conditioningFromMessage = detectConditioningFromMessage(userMessage);
  const conditioningFromProfile =
    isConditioningGoal(profileGoalLower) ||
    profileGoalLower.includes("fat loss") ||
    profileGoalLower.includes("body comp") ||
    profileGoalLower.includes("athletic") ||
    !!resolvedSport;
  const conditioningActive = conditioningFromMessage || conditioningFromProfile;

  if (conditioningFromMessage) messageSignals.push("conditioning request detected from message");
  if (conditioningFromProfile && !conditioningFromMessage) profileSignals.push("conditioning context from profile");

  // ── Power/Speed detection (message OR profile) ───────────────────────────
  const powerSpeedFromMessage = detectPowerSpeedFromMessage(userMessage);
  const powerSpeedFromProfile =
    isPowerRequest(profileGoalLower) ||
    isSpeedRequest(profileGoalLower) ||
    profileGoalLower.includes("power") ||
    profileGoalLower.includes("speed") ||
    profileGoalLower.includes("explosive") ||
    profileGoalLower.includes("sprint") ||
    profileGoalLower.includes("acceleration");
  const powerSpeedActive = powerSpeedFromMessage || powerSpeedFromProfile;

  if (powerSpeedFromMessage) messageSignals.push("power/speed request detected from message");
  if (powerSpeedFromProfile && !powerSpeedFromMessage) profileSignals.push("power/speed context from profile");

  // ── Periodization detection (message OR experience level) ────────────────
  const periodizationActive = needsPeriodizationContext(
    profileGoal,
    profileExperience,
    userMessage, // ← fixed: was using profileGoal twice before
  );

  if (periodizationActive) profileSignals.push("periodization context active");

  // ── Mobility detection (message OR goal) ────────────────────────────────
  const mobilityFromMessage = detectMobilityRequest(userMessage);
  const mobilityFromProfile = needsMobilityContext("", profileGoal, resolvedSport);
  const mobilityActive = mobilityFromMessage || mobilityFromProfile;

  if (mobilityFromMessage) messageSignals.push("mobility/movement support request detected from message");
  if (mobilityFromProfile && !mobilityFromMessage) profileSignals.push("mobility/recovery context from profile");

  // ── Priority resolution ───────────────────────────────────────────────────
  const { dominant, reason } = resolveDominantDomain(
    reEntryActive,
    powerSpeedFromMessage,
    conditioningFromMessage,
    !!sportFromMessage,
    periodizationActive,
    mobilityFromMessage,
    profileGoal,
  );

  // ── Active engines list (for debug) ─────────────────────────────────────
  const enginesActive: string[] = [];
  if (reEntryActive) enginesActive.push("re-entry");
  if (conditioningActive) enginesActive.push("conditioning");
  if (powerSpeedActive) enginesActive.push("power-speed");
  if (sportActive) enginesActive.push(`sport:${resolvedSport}`);
  if (resolvedSeason) enginesActive.push(`season:${resolvedSeason}`);
  if (periodizationActive) enginesActive.push("periodization");
  if (mobilityActive) enginesActive.push("mobility");
  if (enginesActive.length === 0) enginesActive.push("base");

  const debug: RoutingDebug = {
    messageSignals,
    profileSignals,
    priorityResolution: reason,
    enginesActive,
    dominantDomain: dominant,
  };

  const decision: RoutingDecision = {
    conditioning: conditioningActive,
    powerSpeed: powerSpeedActive,
    sport: {
      active: sportActive,
      sport: resolvedSport,
      source: sportSource,
    },
    season: {
      context: resolvedSeason,
      source: seasonSource,
    },
    reEntry: {
      active: reEntryActive,
      classification: reEntryClassification,
    },
    periodization: periodizationActive,
    mobility: mobilityActive,
    dominantDomain: dominant,
    debug,
  };

  // ── Structured logging ────────────────────────────────────────────────────
  logger.info(
    {
      routing: {
        enginesActive,
        dominantDomain: dominant,
        messageSignals,
        priorityResolution: reason,
        sport: resolvedSport,
        season: resolvedSeason,
        reEntryStatus: reEntryClassification?.status ?? "none",
        sources: {
          sport: sportSource,
          season: seasonSource,
          reEntryFromMessage: !!reEntryFromMsg,
          conditioningFromMessage,
          powerSpeedFromMessage,
          mobilityFromMessage,
        },
      },
    },
    "[MessageRouter] Routing decision resolved"
  );

  return decision;
}

// ─── Helper: Re-entry from profile only ──────────────────────────────────────

function needsReEntryContextFromProfile(trainingGoal: string): boolean {
  const g = trainingGoal.toLowerCase();
  return /return|re.?entry|rebuild|haven.?t.?trained|getting.?back|coming.?back|starting.?over|layoff|hiatus/.test(g);
}

// ─── Export resolved sport/season for use in context builders ────────────────

export function getResolvedSport(decision: RoutingDecision): string | null {
  return decision.sport.active ? decision.sport.sport : null;
}

export function getResolvedSeason(decision: RoutingDecision): SeasonContext | null {
  return decision.season.context;
}
