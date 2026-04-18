/**
 * Perceived Variance Audit — Visible Spine Detection
 *
 * The structural variance audit catches architectural sameness (block/split/family).
 * This audit catches *visible* sameness — when the first 3-5 exercises the user sees
 * feel identical across program generations even though structural scores vary.
 *
 * Core concept: "Visible Spine"
 *   For each day, the visible spine is the ordered sequence of the first exercises
 *   the user sees: first explosive → first primary lower → first unilateral → first trunk.
 *   If the visible spine repeats, the program *feels* the same to the user.
 *
 * Log markers:
 *   [PerceivedVarianceAudit]        — main per-generation audit entry
 *   [PerceivedVarianceAuditWarning] — specific visible repetition detected
 *   [PerceivedVarianceAuditReroll]  — reroll action targeting visible sameness
 */

import type { SlotExerciseSelection } from "../exercise-variation-engine";
import { getSlotHistory } from "../exercise-variation-engine";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VisibleSpine {
  dayIndex: number;
  dayTheme: string;
  primaryPattern: string;
  firstExplosive: string | null;
  firstPrimaryLower: string | null;
  firstUnilateral: string | null;
  firstTrunk: string | null;
  spineKey: string;
}

export interface VisibleIdentity {
  generationId: string;
  generatedAt: number;

  day1Spine: VisibleSpine | null;
  day2Spine: VisibleSpine | null;
  allDaySpines: VisibleSpine[];

  heroExercises: string[];
  firstExplosiveByDay: (string | null)[];
  firstPrimaryLowerByDay: (string | null)[];
  firstUnilateralByDay: (string | null)[];
  firstTrunkByDay: (string | null)[];

  visibleOrderingKey: string;
}

export interface PerceivedVarianceAuditResult {
  generationId: string;
  visibleIdentity: VisibleIdentity;
  repeatedVisibleElements: string[];
  warnings: string[];
  rerollRecommended: boolean;
  suggestedActions: string[];
  slotHistorySummary: Record<string, string[]>;
}

// ─── History Store ────────────────────────────────────────────────────────────

const VISIBLE_IDENTITY_HISTORY: VisibleIdentity[] = [];
const MAX_VISIBLE_HISTORY = 8;

function recordVisibleIdentity(vi: VisibleIdentity): void {
  VISIBLE_IDENTITY_HISTORY.push(vi);
  while (VISIBLE_IDENTITY_HISTORY.length > MAX_VISIBLE_HISTORY) {
    VISIBLE_IDENTITY_HISTORY.shift();
  }
}

export function getRecentVisibleIdentities(n = 5): VisibleIdentity[] {
  return VISIBLE_IDENTITY_HISTORY.slice(-n);
}

// ─── Visible Spine Builder ────────────────────────────────────────────────────

const PATTERN_TO_PRIMARY_SLOT: Record<string, string> = {
  squat: "bilateral_squat_strength",
  hinge: "bilateral_hinge_strength",
  power: "lower_power",
  upper_push: "upper_push_primary",
  upper_pull: "upper_pull_primary",
  unilateral_lower: "unilateral_lower",
};

function buildVisibleSpine(
  dayIndex: number,
  dayTheme: string,
  primaryPattern: string,
  slots: Record<string, string>,
): VisibleSpine {
  const firstExplosive = slots["lower_power"] ?? null;

  const primarySlot = PATTERN_TO_PRIMARY_SLOT[primaryPattern] ?? "bilateral_squat_strength";
  const firstPrimaryLower = ["squat", "hinge", "power", "unilateral_lower"].includes(primaryPattern)
    ? (slots[primarySlot] ?? slots["bilateral_squat_strength"] ?? null)
    : null;

  const firstUnilateral = slots["unilateral_lower"] ?? null;
  const firstTrunk = slots["trunk_anti_rotation"] ?? null;

  const spineKey = [firstExplosive, firstPrimaryLower, firstUnilateral, firstTrunk]
    .map((e) => (e ?? "—").replace(/\s+/g, "_").toLowerCase())
    .join("|");

  return {
    dayIndex,
    dayTheme,
    primaryPattern,
    firstExplosive,
    firstPrimaryLower,
    firstUnilateral,
    firstTrunk,
    spineKey,
  };
}

// ─── Visible Identity Builder ─────────────────────────────────────────────────

export function buildVisibleIdentity(
  generationId: string,
  slots: SlotExerciseSelection,
  dayTemplates: Array<{ dayIndex: number; label: string; primaryPattern: string }>,
): VisibleIdentity {
  const slotMap = slots as unknown as Record<string, string>;

  const allDaySpines = dayTemplates.map((dt) =>
    buildVisibleSpine(dt.dayIndex, dt.label, dt.primaryPattern, slotMap),
  );

  const firstExplosiveByDay = allDaySpines.map((s) => s.firstExplosive);
  const firstPrimaryLowerByDay = allDaySpines.map((s) => s.firstPrimaryLower);
  const firstUnilateralByDay = allDaySpines.map((s) => s.firstUnilateral);
  const firstTrunkByDay = allDaySpines.map((s) => s.firstTrunk);

  const heroExercises = [
    slotMap["lower_power"],
    slotMap["bilateral_squat_strength"],
    slotMap["bilateral_hinge_strength"],
    slotMap["unilateral_lower"],
    slotMap["trunk_anti_rotation"],
  ].filter(Boolean);

  const visibleOrderingKey = allDaySpines.map((s) => s.spineKey).join("//");

  return {
    generationId,
    generatedAt: Date.now(),
    day1Spine: allDaySpines[0] ?? null,
    day2Spine: allDaySpines[1] ?? null,
    allDaySpines,
    heroExercises,
    firstExplosiveByDay,
    firstPrimaryLowerByDay,
    firstUnilateralByDay,
    firstTrunkByDay,
    visibleOrderingKey,
  };
}

// ─── Repetition Detectors ─────────────────────────────────────────────────────

function detectRepeatedElements(
  current: VisibleIdentity,
  history: VisibleIdentity[],
): { reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (history.length === 0) return { reasons, warnings };

  const mostRecent = history[history.length - 1];
  const n = history.length;

  // ── Day-1 spine identity ───────────────────────────────────────────────
  if (current.day1Spine && mostRecent.day1Spine) {
    if (current.day1Spine.spineKey === mostRecent.day1Spine.spineKey) {
      reasons.push(`day 1 visible spine identical to most recent program (${current.day1Spine.spineKey})`);
    }

    if (current.day1Spine.firstExplosive && current.day1Spine.firstExplosive === mostRecent.day1Spine.firstExplosive) {
      reasons.push(`same day-1 first explosive as most recent: ${current.day1Spine.firstExplosive}`);
    }

    if (current.day1Spine.firstPrimaryLower && current.day1Spine.firstPrimaryLower === mostRecent.day1Spine.firstPrimaryLower) {
      reasons.push(`same day-1 primary lift as most recent: ${current.day1Spine.firstPrimaryLower}`);
    }

    if (current.day1Spine.firstUnilateral && current.day1Spine.firstUnilateral === mostRecent.day1Spine.firstUnilateral) {
      reasons.push(`same day-1 unilateral exercise as most recent: ${current.day1Spine.firstUnilateral}`);
    }

    if (current.day1Spine.firstTrunk && current.day1Spine.firstTrunk === mostRecent.day1Spine.firstTrunk) {
      reasons.push(`same day-1 trunk exercise as most recent: ${current.day1Spine.firstTrunk}`);
    }
  }

  // ── Hero exercise repetition across all recent ────────────────────────
  const heroSet = new Set(current.heroExercises);
  for (const prior of history) {
    const priorHeroSet = new Set(prior.heroExercises);
    const overlapHeroes = [...heroSet].filter((e) => priorHeroSet.has(e));
    if (overlapHeroes.length >= 3) {
      reasons.push(`hero exercises overlap ${overlapHeroes.length}/5 with program ${prior.generationId.slice(0, 8)}: [${overlapHeroes.join(", ")}]`);
    }
  }

  // ── Consecutive explosive slot repeats ────────────────────────────────
  const explosiveSlotHistory = getSlotHistory("lower_power");
  if (explosiveSlotHistory.length >= 2) {
    const last2Explosive = explosiveSlotHistory.slice(-2);
    if (last2Explosive[0] === last2Explosive[1] && last2Explosive[1] === current.day1Spine?.firstExplosive) {
      warnings.push(`first explosive (${current.day1Spine?.firstExplosive}) repeated 3+ generations in a row`);
    }
  }

  // ── Consecutive squat slot repeats ───────────────────────────────────
  const squatSlotHistory = getSlotHistory("bilateral_squat_strength");
  if (squatSlotHistory.length >= 2) {
    const lastSquat = squatSlotHistory[squatSlotHistory.length - 1];
    const prev2Squat = squatSlotHistory[squatSlotHistory.length - 2];
    const currentSquat = current.heroExercises[1];
    if (lastSquat === prev2Squat && lastSquat === currentSquat) {
      warnings.push(`primary squat (${currentSquat}) repeated 3+ generations in a row`);
    }
  }

  // ── Visible ordering key repeat ───────────────────────────────────────
  const repeatedOrderingKey = history.filter((p) => p.visibleOrderingKey === current.visibleOrderingKey).length;
  if (repeatedOrderingKey >= 2) {
    reasons.push(`same visible session ordering key in ${repeatedOrderingKey + 1} of ${n + 1} recent programs`);
    warnings.push(`program visible ordering is stale — same jump+squat+hinge+unilateral+trunk spine`);
  }

  // ── Spine key distribution check ─────────────────────────────────────
  const allSpineKeys = history.map((p) => p.day1Spine?.spineKey).filter(Boolean);
  const uniqueSpineKeys = new Set(allSpineKeys);
  if (allSpineKeys.length >= 3 && uniqueSpineKeys.size === 1) {
    warnings.push(`day-1 spine has been identical across all ${allSpineKeys.length} recent programs`);
  }

  return { reasons, warnings };
}

// ─── Reroll Actions ────────────────────────────────────────────────────────────

function suggestRerollActions(
  reasons: string[],
  warnings: string[],
  current: VisibleIdentity,
): string[] {
  const actions: string[] = [];

  if (reasons.some((r) => r.includes("first explosive") || r.includes("day-1 first explosive"))) {
    actions.push("boost_hero_penalty:lower_power");
  }

  if (reasons.some((r) => r.includes("primary lift") || r.includes("primary squat"))) {
    actions.push("boost_hero_penalty:bilateral_squat_strength");
  }

  if (reasons.some((r) => r.includes("unilateral"))) {
    actions.push("boost_hero_penalty:unilateral_lower");
  }

  if (reasons.some((r) => r.includes("trunk"))) {
    actions.push("boost_hero_penalty:trunk_anti_rotation");
  }

  if (reasons.some((r) => r.includes("hero exercises overlap"))) {
    actions.push("rerank_visible_slots");
  }

  if (warnings.some((w) => w.includes("spine has been identical") || w.includes("ordering is stale"))) {
    actions.push("select_next_split");
  }

  return actions;
}

// ─── Main Audit Function ──────────────────────────────────────────────────────

export function runPerceivedVarianceAudit(
  generationId: string,
  slots: SlotExerciseSelection,
  dayTemplates: Array<{ dayIndex: number; label: string; primaryPattern: string }>,
): PerceivedVarianceAuditResult {
  if (process.env.NODE_ENV === "production") {
    const vi = buildVisibleIdentity(generationId, slots, dayTemplates);
    recordVisibleIdentity(vi);
    return {
      generationId,
      visibleIdentity: vi,
      repeatedVisibleElements: [],
      warnings: [],
      rerollRecommended: false,
      suggestedActions: [],
      slotHistorySummary: {},
    };
  }

  // ── Build visible identity ────────────────────────────────────────────────
  const visibleIdentity = buildVisibleIdentity(generationId, slots, dayTemplates);

  // ── Compare against history ───────────────────────────────────────────────
  const recentIdentities = getRecentVisibleIdentities(5);
  const { reasons, warnings } = detectRepeatedElements(visibleIdentity, recentIdentities);

  // ── Record AFTER comparison (don't compare against self) ─────────────────
  recordVisibleIdentity(visibleIdentity);

  // ── Suggest reroll actions ────────────────────────────────────────────────
  const suggestedActions = suggestRerollActions(reasons, warnings, visibleIdentity);
  const rerollRecommended = reasons.length >= 2 || warnings.length >= 1;

  // ── Slot history summary for logging ─────────────────────────────────────
  const HIGH_VIS_SLOTS = [
    "lower_power", "bilateral_squat_strength", "bilateral_hinge_strength",
    "unilateral_lower", "trunk_anti_rotation",
  ];
  const slotHistorySummary: Record<string, string[]> = {};
  for (const slot of HIGH_VIS_SLOTS) {
    slotHistorySummary[slot] = getSlotHistory(slot);
  }

  // ── Structured audit log ──────────────────────────────────────────────────
  console.log("[PerceivedVarianceAudit]", JSON.stringify({
    generationId,
    day1Spine: visibleIdentity.day1Spine?.spineKey ?? null,
    day2Spine: visibleIdentity.day2Spine?.spineKey ?? null,
    heroExercises: visibleIdentity.heroExercises,
    firstExplosive: visibleIdentity.firstExplosiveByDay[0] ?? null,
    firstPrimaryLower: visibleIdentity.firstPrimaryLowerByDay[0] ?? null,
    firstUnilateral: visibleIdentity.firstUnilateralByDay[0] ?? null,
    firstTrunk: visibleIdentity.firstTrunkByDay[0] ?? null,
    comparisonWindowSize: recentIdentities.length,
    repeatedVisibleElements: reasons,
    rerollRecommended,
    suggestedActions,
    slotHistorySummary,
  }));

  // ── One-liner summary ─────────────────────────────────────────────────────
  console.log(
    `[PerceivedVarianceAudit] generation=${generationId.slice(0, 8)} ` +
    `explosive=${visibleIdentity.day1Spine?.firstExplosive ?? "—"} ` +
    `squat=${visibleIdentity.day1Spine?.firstPrimaryLower ?? "—"} ` +
    `unilateral=${visibleIdentity.day1Spine?.firstUnilateral ?? "—"} ` +
    `trunk=${visibleIdentity.day1Spine?.firstTrunk ?? "—"} ` +
    `repeats=${reasons.length} reroll=${rerollRecommended}`,
  );

  // ── Warnings ───────────────────────────────────────────────────────────────
  for (const w of warnings) {
    console.warn(`[PerceivedVarianceAuditWarning] ${w}`);
  }

  // ── Log reroll actions if triggered ──────────────────────────────────────
  for (const action of suggestedActions) {
    const [base, slot] = action.split(":");
    console.log(`[PerceivedVarianceAuditReroll] action=${base}${slot ? ` slot=${slot}` : ""} generationId=${generationId.slice(0, 8)}`);
  }

  return {
    generationId,
    visibleIdentity,
    repeatedVisibleElements: reasons,
    warnings,
    rerollRecommended,
    suggestedActions,
    slotHistorySummary,
  };
}
