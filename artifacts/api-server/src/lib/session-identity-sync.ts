/**
 * Session Identity Sync — v2
 *
 * Deterministic, rule-based system that ensures a session's `label` (title)
 * and `emphasis` (subtitle) stay in sync with the session's actual training
 * character after any identity-changing refinement.
 *
 * Architecture:
 *   1. AI layer — each transformation aiDirective explicitly tells the AI to
 *      produce an update_session change with new label + emphasis.
 *   2. Deterministic fallback (this module) — if the AI forgets, the edit-engine
 *      calls `ensureSessionIdentityUpdated()` which auto-patches any session
 *      that was structurally changed but did not receive an identity update.
 *
 * Exports:
 *   - shouldRecomputeSessionIdentity(intentFamily) → boolean
 *   - inferSessionRegion(exercises) → "Lower" | "Upper" | "Full Body"
 *   - inferSessionBias(exercises) → bias string
 *   - recomputeSessionIdentity({ session, intentFamily, programContext }) → { label, emphasis }
 *   - ensureSessionIdentityUpdated(plan, intentFamily?) → PatchedIdentityResult[]
 */

import { db } from "@workspace/db";
import { trainingSessions, sessionExercises } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { EditPlan } from "./edit-intent-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionIdentity {
  label: string;
  emphasis: string;
}

/** Minimal session shape needed for identity recomputation */
export interface SessionForIdentity {
  id: number;
  label: string;
  emphasis: string | null;
  exercises: Array<{
    id: number;
    name: string;
    category: string;
  }>;
}

export interface ProgramContextForIdentity {
  sport?: string | null;
  goal?: string | null;
  category?: string | null;
}

/** Returned by ensureSessionIdentityUpdated for each session that was patched */
export interface PatchedIdentityResult {
  sessionId: number;
  previousLabel: string;
  previousEmphasis: string | null;
  newLabel: string;
  newEmphasis: string;
  intentFamily: string;
  inferredRegion: string;
}

export type SessionRegion = "Lower" | "Upper" | "Full Body";
export type SessionBias =
  | "power"
  | "strength"
  | "hypertrophy"
  | "endurance"
  | "conditioning"
  | "recovery"
  | "mixed";

// ─── Task 3: Trigger rules ────────────────────────────────────────────────────

/** Canonical set of intent families that materially shift session identity */
const IDENTITY_TRIGGER_FAMILIES = new Set<string>([
  "power_explosive_focus",
  "strength_focus",
  "hypertrophy_focus",
  "endurance_focus",
  "conditioning_focus",
  "speed_focus",
  "athletic_performance_focus",
  "recovery_focus",
  "fatigue_management",
]);

/**
 * Returns true if the given intent family should trigger session identity
 * recomputation.
 *
 * Returns false for: easier/harder single-exercise, cue-only, small prescription.
 */
export function shouldRecomputeSessionIdentity(intentFamily: string): boolean {
  return IDENTITY_TRIGGER_FAMILIES.has(intentFamily);
}

// ─── Task 4: Exercise-composition inference ───────────────────────────────────

/** Lower-body exercise name keywords */
const LOWER_KEYWORDS = new Set([
  "squat", "deadlift", "lunge", "leg press", "step-up", "step up",
  "hip thrust", "glute", "hamstring", "leg curl", "leg extension", "calf",
  "rdl", "romanian", "box jump", "broad jump", "sprint", "bound", "bounds",
  "hip hinge", "sumo", "sled", "nordic", "split squat", "pistol",
  "trap bar", "hex bar", "goblet", "front squat", "hack squat", "bulgarian",
  "lateral bound", "hurdle", "plyometric", "jump squat", "jump",
  "drop step", "skater", "hip extension",
]);

/** Upper-body exercise name keywords */
const UPPER_KEYWORDS = new Set([
  "bench press", "push-up", "push up", "pull-up", "pull up",
  "overhead press", "shoulder press", "military press", "row",
  "lat pulldown", "bicep", "tricep", "chest press", "dumbbell press",
  "cable fly", "chest fly", "face pull", "rear delt", "upright row",
  "incline", "decline", "dip", "chin-up", "chin up",
  "landmine press", "floor press", "seal row", "meadows row",
  "curl", "extension", "skull crusher", "close grip", "wide grip",
  "cable row", "t-bar", "kroc row", "ring row",
  "med ball slam", "rotational throw", "med ball",
]);

function tokenizeExerciseName(name: string): string[] {
  return name.toLowerCase().split(/[\s-_/]+/);
}

function matchesKeywordSet(name: string, keywords: Set<string>): boolean {
  const lower = name.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

/**
 * Infers the body region of a session from its exercise composition.
 * Uses exercise name analysis rather than label string-matching.
 * Falls back to label-based detection if exercises list is empty.
 */
export function inferSessionRegion(
  exercises: Array<{ name: string; category: string }>,
  fallbackLabel = "",
): SessionRegion {
  if (exercises.length === 0) {
    return inferRegionFromLabel(fallbackLabel);
  }

  let lowerCount = 0;
  let upperCount = 0;

  for (const ex of exercises) {
    // Skip warmup / activation / trunk / conditioning / recovery — region-neutral
    if (["warmup", "activation", "trunk", "conditioning", "recovery"].includes(ex.category)) {
      continue;
    }
    const isLower = matchesKeywordSet(ex.name, LOWER_KEYWORDS);
    const isUpper = matchesKeywordSet(ex.name, UPPER_KEYWORDS);
    if (isLower && !isUpper) lowerCount++;
    else if (isUpper && !isLower) upperCount++;
    // Both or neither: ambiguous — don't count either way
  }

  const total = lowerCount + upperCount;
  if (total === 0) return inferRegionFromLabel(fallbackLabel);

  const lowerRatio = lowerCount / total;
  const upperRatio = upperCount / total;

  if (lowerRatio >= 0.6) return "Lower";
  if (upperRatio >= 0.6) return "Upper";
  return "Full Body";
}

/** Label-string fallback for when exercise list is empty */
function inferRegionFromLabel(label: string): SessionRegion {
  const l = label.toLowerCase();
  if (
    l.includes("upper") || l.includes("push") || l.includes("pull") ||
    l.includes("bench") || l.includes("press") || l.includes("row") ||
    l.includes("chest") || l.includes("shoulder") || l.includes("back")
  ) return "Upper";
  if (
    l.includes("lower") || l.includes("squat") || l.includes("deadlift") ||
    l.includes("leg") || l.includes("hip") || l.includes("glute") ||
    l.includes("hamstring") || l.includes("calf")
  ) return "Lower";
  return "Full Body";
}

/**
 * Infers the dominant training bias of a session from its exercise categories.
 */
export function inferSessionBias(
  exercises: Array<{ name: string; category: string }>,
): SessionBias {
  const counts: Record<string, number> = {};
  for (const ex of exercises) {
    counts[ex.category] = (counts[ex.category] ?? 0) + 1;
  }

  const total = exercises.length;
  if (total === 0) return "mixed";

  const powerCount = counts.power ?? 0;
  const primaryCount = counts.primary ?? 0;
  const secondaryCount = counts.secondary ?? 0;
  const accessoryCount = counts.accessory ?? 0;
  const finisherCount = counts.finisher ?? 0;
  const conditioningCount = counts.conditioning ?? 0;
  const recoveryCount = counts.recovery ?? 0;

  if (powerCount >= 2) return "power";
  if (conditioningCount >= 1) return "conditioning";
  if (recoveryCount >= Math.ceil(total * 0.5)) return "recovery";

  const strengthScore = primaryCount + secondaryCount;
  const volumeScore = accessoryCount + finisherCount;

  if (strengthScore >= total * 0.6) return "strength";
  if (volumeScore >= total * 0.5) return "hypertrophy";
  if (powerCount >= 1 && strengthScore >= 1) return "power";

  return "mixed";
}

// ─── Task 5: Full template matrix ─────────────────────────────────────────────

type RegionedTemplate = {
  label: string;
  emphasis: string;
};

type IdentityTemplateMatrix = Record<string, Record<SessionRegion, RegionedTemplate>>;

const TEMPLATE_MATRIX: IdentityTemplateMatrix = {
  power_explosive_focus: {
    Lower: {
      label: "Lower Power — Explosive Output + Bar Speed",
      emphasis: "Horizontal power, elastic force expression, and high-velocity lower-body force development",
    },
    Upper: {
      label: "Upper Power — Bar Speed + Explosive Pressing",
      emphasis: "Vertical and horizontal bar speed, elastic pressing power, and upper-body force expression at high velocity",
    },
    "Full Body": {
      label: "Full Body Power — Explosive Intent + CNS Activation",
      emphasis: "Explosive power expression, bar velocity, and maximal neuromuscular activation across the session",
    },
  },

  strength_focus: {
    Lower: {
      label: "Lower Strength — Maximal Force Output",
      emphasis: "Heavy compound loading, peak force development, and bilateral squat and hinge strength expression",
    },
    Upper: {
      label: "Upper Strength — Maximal Force Output",
      emphasis: "Heavy compound pressing and pulling, peak force development, and bilateral upper-body strength expression",
    },
    "Full Body": {
      label: "Full Body Strength — Force Production Priority",
      emphasis: "Heavy compound loading, peak force output, and maximal strength expression across upper and lower body",
    },
  },

  hypertrophy_focus: {
    Lower: {
      label: "Lower Hypertrophy — Volume + Mechanical Tension",
      emphasis: "Quad and posterior chain volume, metabolic stress, and progressive mechanical tension for lower-body muscle development",
    },
    Upper: {
      label: "Upper Hypertrophy — Volume + Mechanical Tension",
      emphasis: "Pushing and pulling volume, isolation density, and progressive mechanical tension for upper-body muscle-building",
    },
    "Full Body": {
      label: "Full Body Hypertrophy — Volume Accumulation",
      emphasis: "Progressive volume accumulation, mechanical tension, and metabolic stress for systemic muscle-building",
    },
  },

  endurance_focus: {
    Lower: {
      label: "Lower Strength Endurance — Work Capacity",
      emphasis: "High-rep lower-body density, compressed rest intervals, and aerobic capacity integration",
    },
    Upper: {
      label: "Upper Strength Endurance — Sustained Output",
      emphasis: "High-rep pulling and pressing density, compressed rest, and aerobic capacity integration for sustained upper-body output",
    },
    "Full Body": {
      label: "Full Body Strength Endurance — Work Capacity",
      emphasis: "High-rep density, compressed rest intervals, and aerobic capacity integration across all movement patterns",
    },
  },

  conditioning_focus: {
    Lower: {
      label: "Lower Conditioning — Metabolic + Cardiovascular Output",
      emphasis: "Interval conditioning, lower-body circuit density, and cardiovascular work capacity development",
    },
    Upper: {
      label: "Upper Conditioning — Metabolic Density",
      emphasis: "Upper-body conditioning circuits, interval density, and cardiovascular work capacity",
    },
    "Full Body": {
      label: "Full Body Conditioning — Metabolic Output",
      emphasis: "Interval conditioning circuits, total-body density, and cardiovascular work capacity development",
    },
  },

  speed_focus: {
    Lower: {
      label: "Lower Speed + Power — Acceleration Development",
      emphasis: "Sprint mechanics, acceleration-deceleration quality, and velocity-support lower-body strength",
    },
    Upper: {
      label: "Upper Speed + Power — Rotational Velocity",
      emphasis: "Bar speed, upper-body velocity expression, and rotational power for sport and throwing transfer",
    },
    "Full Body": {
      label: "Full Body Speed Development — Velocity + Mechanics",
      emphasis: "Sprint mechanics, acceleration quality, and velocity-support strength across all planes of motion",
    },
  },

  athletic_performance_focus: {
    Lower: {
      label: "Lower Athletic — Power + Sport Transfer",
      emphasis: "Explosive force expression, deceleration quality, and multi-directional lower-body athleticism",
    },
    Upper: {
      label: "Upper Athletic — Power + Rotational Transfer",
      emphasis: "Rotational power, upper-body velocity, and multi-plane strength for sport transfer",
    },
    "Full Body": {
      label: "Full Body Athletic — Power + Conditioning",
      emphasis: "Explosive movement quality, multi-directional athleticism, and sport-transfer conditioning",
    },
  },

  recovery_focus: {
    Lower: {
      label: "Lower Recovery — Tissue Quality + Low-Impact Support",
      emphasis: "Lower-impact movement quality, tissue tolerance, and recovery-oriented force support",
    },
    Upper: {
      label: "Upper Recovery — Tissue Quality + Controlled Loading",
      emphasis: "Low-intensity upper-body movement, tissue recovery, and controlled loading for readiness maintenance",
    },
    "Full Body": {
      label: "Active Recovery — Movement Quality + CNS Restoration",
      emphasis: "Low-intensity movement quality, tissue restoration, and CNS readiness preparation",
    },
  },

  fatigue_management: {
    Lower: {
      label: "Lower Strength — Reduced Volume / Fatigue Management",
      emphasis: "Preserved compound lower-body strength with reduced accessory load and extended recovery windows",
    },
    Upper: {
      label: "Upper Strength — Reduced Volume / Fatigue Management",
      emphasis: "Preserved compound pressing and pulling with reduced accessory volume and extended recovery windows",
    },
    "Full Body": {
      label: "Full Body Reload — Reduced Fatigue + Quality Output",
      emphasis: "Lower stress, cleaner execution, and preserved movement quality with reduced total fatigue cost",
    },
  },
};

// ─── Task 6: Fallback templates ───────────────────────────────────────────────

const FALLBACK_TEMPLATES: Record<string, SessionIdentity> = {
  power_explosive_focus: {
    label: "Power Development — Explosive Intent",
    emphasis: "Bar speed, elastic force expression, and high-velocity power development",
  },
  strength_focus: {
    label: "Strength Development — Maximal Force",
    emphasis: "Heavy compound loading, peak force output, and maximal strength expression",
  },
  hypertrophy_focus: {
    label: "Hypertrophy — Volume + Tension",
    emphasis: "Progressive volume accumulation, mechanical tension, and metabolic stress",
  },
  endurance_focus: {
    label: "Endurance Development — Work Capacity",
    emphasis: "High-rep density, compressed rest intervals, and aerobic capacity integration",
  },
  conditioning_focus: {
    label: "Conditioning — Metabolic Output",
    emphasis: "Interval conditioning, circuit density, and cardiovascular work capacity",
  },
  speed_focus: {
    label: "Speed Development — Velocity + Mechanics",
    emphasis: "Sprint mechanics, acceleration quality, and velocity-support strength",
  },
  athletic_performance_focus: {
    label: "Athletic Development — Power + Conditioning",
    emphasis: "Explosive movement quality, multi-directional athleticism, and sport-transfer conditioning",
  },
  recovery_focus: {
    label: "Active Recovery — Movement Quality",
    emphasis: "Low-intensity movement quality, tissue restoration, and CNS readiness preparation",
  },
  fatigue_management: {
    label: "Reload — Reduced Fatigue + Quality Output",
    emphasis: "Preserved compound work with reduced accessory load and extended recovery windows",
  },
};

// ─── Task 2: Main recompute function ─────────────────────────────────────────

/**
 * Recomputes a session's `label` and `emphasis` based on the transformation
 * intent family and the session's actual exercise composition.
 *
 * Uses `inferSessionRegion` (exercise-structure-based) to determine body
 * region, then looks up the matching template. Falls back cleanly if the
 * combination is not found.
 *
 * Returns null if the intent family is not identity-changing.
 */
export function recomputeSessionIdentity({
  session,
  intentFamily,
  programContext,
}: {
  session: SessionForIdentity;
  intentFamily: string;
  programContext?: ProgramContextForIdentity;
}): SessionIdentity | null {
  if (!shouldRecomputeSessionIdentity(intentFamily)) return null;

  const region = inferSessionRegion(session.exercises, session.label);

  // Apply sport context: sport programs often skew Full Body even for lower sessions
  let effectiveRegion: SessionRegion = region;
  if (programContext?.sport && region !== "Upper") {
    // Sport sessions are treated as Full Body for identity purposes to avoid
    // hyper-specific lower/upper labels that don't fit sport contexts
    effectiveRegion = "Full Body";
  }

  const template = TEMPLATE_MATRIX[intentFamily]?.[effectiveRegion];
  if (template) {
    return { label: template.label, emphasis: template.emphasis };
  }

  // Fallback: use family-level generic template
  const fallback = FALLBACK_TEMPLATES[intentFamily];
  return fallback ?? null;
}

// ─── Intent Family Resolution from plan.intent string ────────────────────────

/**
 * Maps the free-form `plan.intent` string back to a canonical intent family.
 * Used when the caller did not pass an explicit intentFamily.
 */
export function resolveIntentFamilyFromString(planIntent: string): string | null {
  const intent = planIntent.toLowerCase();

  if (intent.includes("power_explosive_focus") || intent.includes("explosive") || intent.includes("power")) {
    return "power_explosive_focus";
  }
  if (intent.includes("strength_focus") || intent.includes("more strength") || intent.includes("heavier")) {
    return "strength_focus";
  }
  if (intent.includes("hypertrophy_focus") || intent.includes("hypertrophy") || intent.includes("muscle building")) {
    return "hypertrophy_focus";
  }
  if (intent.includes("endurance_focus") || intent.includes("more endurance") || intent.includes("aerobic")) {
    return "endurance_focus";
  }
  if (intent.includes("conditioning_focus") || intent.includes("conditioning") || intent.includes("metabolic")) {
    return "conditioning_focus";
  }
  if (intent.includes("speed_focus") || intent.includes("more speed") || intent.includes("speed")) {
    return "speed_focus";
  }
  if (intent.includes("athletic_performance_focus") || intent.includes("athletic")) {
    return "athletic_performance_focus";
  }
  if (
    intent.includes("recovery_focus") || intent.includes("lower impact") ||
    intent.includes("recovery") || intent.includes("less impact")
  ) {
    return "recovery_focus";
  }
  if (
    intent.includes("fatigue_management") || intent.includes("reduce volume") ||
    intent.includes("deload") || intent.includes("reduce fatigue")
  ) {
    return "fatigue_management";
  }

  return null;
}

// ─── Collect session IDs affected by structural changes ───────────────────────

/**
 * Collects session IDs from the EditPlan that received structural changes
 * (exercise add/replace/delete, or multi-field exercise updates that shift
 * session character).
 *
 * For update_exercise changes: only counted if reps, sets, tempo, or rest
 * were modified — purely note-based updates are excluded.
 */
async function collectStructurallyChangedSessionIds(plan: EditPlan): Promise<Set<number>> {
  const sessions = new Set<number>();

  for (const change of plan.changes) {
    if (
      change.type === "add_exercise" ||
      change.type === "replace_exercise" ||
      change.type === "delete_exercise"
    ) {
      if (change.sessionId) sessions.add(change.sessionId);
    } else if (change.type === "update_exercise") {
      const u = change.updates ?? {};
      const isStructural = !!(u.reps || u.sets || u.tempo || u.rest);
      if (isStructural) {
        try {
          const rows = await db
            .select({ sessionId: sessionExercises.trainingSessionId })
            .from(sessionExercises)
            .where(eq(sessionExercises.id, change.id))
            .limit(1);
          if (rows[0]?.sessionId) sessions.add(rows[0].sessionId);
        } catch {
          // Best-effort
        }
      }
    }
  }

  return sessions;
}

/** Returns the set of session IDs that already received a label/emphasis update */
function getSessionsWithIdentityUpdate(plan: EditPlan): Set<number> {
  const updated = new Set<number>();
  for (const change of plan.changes) {
    if (change.type === "update_session" && change.updates) {
      if (change.updates.label || change.updates.emphasis) {
        updated.add(change.id);
      }
    }
  }
  return updated;
}

// ─── Task 7 + 9: ensureSessionIdentityUpdated ─────────────────────────────────

/**
 * Post-mutation guard: after applying an EditPlan, checks whether each
 * structurally-changed session already received a label/emphasis update.
 *
 * For sessions that did NOT receive an identity update, deterministically
 * computes and persists the new label + emphasis using the template matrix.
 *
 * Returns details for each patched session (used for changeSummary augmentation).
 */
export async function ensureSessionIdentityUpdated(
  plan: EditPlan,
  intentFamily?: string,
): Promise<PatchedIdentityResult[]> {
  const family = intentFamily ?? resolveIntentFamilyFromString(plan.intent);

  if (!family || !shouldRecomputeSessionIdentity(family)) {
    return [];
  }

  const structurallyChangedSessions = await collectStructurallyChangedSessionIds(plan);
  if (structurallyChangedSessions.size === 0) return [];

  const alreadyUpdatedSessions = getSessionsWithIdentityUpdate(plan);

  const sessionsNeedingUpdate = [...structurallyChangedSessions].filter(
    (id) => !alreadyUpdatedSessions.has(id),
  );
  if (sessionsNeedingUpdate.length === 0) return [];

  const patched: PatchedIdentityResult[] = [];

  for (const sessionId of sessionsNeedingUpdate) {
    try {
      // Fetch session
      const sessionRows = await db
        .select({
          id: trainingSessions.id,
          label: trainingSessions.label,
          emphasis: trainingSessions.emphasis,
        })
        .from(trainingSessions)
        .where(eq(trainingSessions.id, sessionId))
        .limit(1);

      const sessionRow = sessionRows[0];
      if (!sessionRow) continue;

      // Fetch current exercises (post-mutation state)
      const exerciseRows = await db
        .select({
          id: sessionExercises.id,
          name: sessionExercises.name,
          category: sessionExercises.category,
        })
        .from(sessionExercises)
        .where(eq(sessionExercises.trainingSessionId, sessionId));

      const sessionForIdentity: SessionForIdentity = {
        id: sessionRow.id,
        label: sessionRow.label,
        emphasis: sessionRow.emphasis,
        exercises: exerciseRows,
      };

      const inferredRegion = inferSessionRegion(exerciseRows, sessionRow.label);

      const identity = recomputeSessionIdentity({
        session: sessionForIdentity,
        intentFamily: family,
      });

      if (!identity) continue;

      // ── Task 9: Debug logging ─────────────────────────────────────────────
      logger.info({
        sessionId,
        intentFamily: family,
        previousLabel: sessionRow.label,
        previousEmphasis: sessionRow.emphasis,
        inferredRegion,
        newLabel: identity.label,
        newEmphasis: identity.emphasis,
        exerciseCount: exerciseRows.length,
        recomputed: true,
      }, "[SessionIdentitySync] Recomputing session identity");

      // Persist
      await db
        .update(trainingSessions)
        .set({
          label: identity.label,
          emphasis: identity.emphasis,
          updatedAt: new Date(),
        } as any)
        .where(eq(trainingSessions.id, sessionId));

      logger.info({
        sessionId,
        newLabel: identity.label,
        newEmphasis: identity.emphasis,
      }, "[SessionIdentitySync] Session identity persisted");

      patched.push({
        sessionId,
        previousLabel: sessionRow.label,
        previousEmphasis: sessionRow.emphasis,
        newLabel: identity.label,
        newEmphasis: identity.emphasis,
        intentFamily: family,
        inferredRegion,
      });
    } catch (err) {
      logger.warn(
        { err, sessionId, family },
        "[SessionIdentitySync] Failed to patch session identity",
      );
    }
  }

  return patched;
}

// ─── Task 8: Build changeSummary suffix for identity updates ─────────────────

/**
 * Builds a human-readable suffix to append to the mutation changeSummary
 * when session identity was auto-patched.
 *
 * Returns empty string if no sessions were patched (no-op).
 */
export function buildIdentityUpdateSummary(patched: PatchedIdentityResult[]): string {
  if (patched.length === 0) return "";

  if (patched.length === 1) {
    return ` Day identity updated to "${patched[0].newLabel}".`;
  }

  const labels = patched.map((p) => `"${p.newLabel}"`).join(", ");
  return ` Session identities updated: ${labels}.`;
}
