/**
 * Session Identity Sync
 *
 * Deterministic, rule-based fallback that ensures a session's `label`
 * (title) and `emphasis` (subtitle) stay in sync with the session's
 * training intent after a refinement mutation.
 *
 * Used as a post-mutation guard in the edit-engine:
 *   If the AI's EditPlan includes structural changes for an
 *   identity-changing intent family but did NOT include an update_session
 *   that refreshes `label`/`emphasis`, this module injects one automatically.
 */

import { db } from "@workspace/db";
import { trainingSessions, sessionExercises } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { EditPlan, EditChange } from "./edit-intent-service";

// ─── Identity-changing intent families ───────────────────────────────────────

/**
 * Intent families that materially shift training emphasis and therefore
 * require a session identity update (label + emphasis).
 * Minor adjustments (harder/easier single-exercise, local prescription tweak)
 * do NOT appear here and will never trigger identity recompute.
 */
export const IDENTITY_CHANGING_INTENTS = new Set([
  "power_explosive_focus",
  "strength_focus",
  "hypertrophy_focus",
  "endurance_focus",
  "conditioning_focus",
  "speed_focus",
  "athletic_performance_focus",
  "recovery_focus",
  "fatigue_management",
  // keyword signals also matched via plan.intent string
  "explosive",
  "more explosive",
  "more strength",
  "more endurance",
  "more conditioning",
  "lower impact",
  "hypertrophy",
  "recovery",
]);

// ─── Body-region detection from existing label ───────────────────────────────

function detectBodyRegion(label: string): "Lower" | "Upper" | "Full Body" {
  const l = label.toLowerCase();
  if (l.includes("upper") || l.includes("push") || l.includes("pull") || l.includes("bench") || l.includes("press") || l.includes("row")) {
    return "Upper";
  }
  if (l.includes("lower") || l.includes("squat") || l.includes("deadlift") || l.includes("leg") || l.includes("hip")) {
    return "Lower";
  }
  return "Full Body";
}

// ─── Identity template library ───────────────────────────────────────────────

interface IdentityTemplate {
  label: (region: string) => string;
  emphasis: (region: string) => string;
}

const IDENTITY_TEMPLATES: Record<string, IdentityTemplate> = {
  power_explosive_focus: {
    label: (r) => `${r} Power — Explosive Output + Bar Speed`,
    emphasis: (_r) => "Horizontal power, elastic force expression, and high-velocity force development",
  },
  strength_focus: {
    label: (r) => `${r} Strength — Maximal Force Output`,
    emphasis: (_r) => "Heavy compound loading, peak force development, and bilateral strength expression",
  },
  hypertrophy_focus: {
    label: (r) => `${r} Hypertrophy — Volume + Mechanical Tension`,
    emphasis: (_r) => "Isolation volume, metabolic stress, and progressive mechanical tension for muscle-building",
  },
  endurance_focus: {
    label: (r) => `${r} Strength Endurance — Work Capacity`,
    emphasis: (_r) => "High-rep density, compressed rest intervals, and aerobic capacity integration",
  },
  conditioning_focus: {
    label: (r) => `${r} Conditioning — Metabolic Output`,
    emphasis: (_r) => "Interval conditioning, circuit density, and cardiovascular work capacity",
  },
  speed_focus: {
    label: (r) => `${r} Speed + Power — Acceleration Development`,
    emphasis: (_r) => "Sprint mechanics, acceleration-deceleration quality, and velocity-support strength",
  },
  athletic_performance_focus: {
    label: (r) => `${r} Athletic — Power + Conditioning`,
    emphasis: (_r) => "Explosive movement quality, multi-directional athleticism, and sport-transfer conditioning",
  },
  recovery_focus: {
    label: (_r) => "Active Recovery — Movement Quality",
    emphasis: (_r) => "Low-intensity tissue restoration, mobility work, and CNS readiness preparation",
  },
  fatigue_management: {
    label: (r) => `${r} Strength — Reduced Volume / Fatigue Management`,
    emphasis: (_r) => "Preserved compound strength with reduced accessory load and extended recovery windows",
  },
};

// ─── Public: Recompute session identity from intent family ──────────────────

export interface SessionIdentity {
  label: string;
  emphasis: string;
}

/**
 * Returns a new { label, emphasis } for a session based on the
 * transformation intent family and the session's current label
 * (used only to detect body region: Upper / Lower / Full Body).
 *
 * Returns null if the intent family is not in the identity-changing set.
 */
export function recomputeSessionIdentity(
  intentFamily: string,
  currentLabel: string,
): SessionIdentity | null {
  const template = IDENTITY_TEMPLATES[intentFamily];
  if (!template) return null;

  const region = detectBodyRegion(currentLabel);
  return {
    label: template.label(region),
    emphasis: template.emphasis(region),
  };
}

// ─── Intent Family Resolution from plan.intent string ────────────────────────

/**
 * Maps the free-form `plan.intent` string back to a canonical intent family.
 * Handles both direct family names and keyword signals.
 */
function resolveIntentFamily(planIntent: string): string | null {
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
  if (intent.includes("endurance_focus") || intent.includes("endurance") || intent.includes("aerobic")) {
    return "endurance_focus";
  }
  if (intent.includes("conditioning_focus") || intent.includes("conditioning") || intent.includes("metabolic")) {
    return "conditioning_focus";
  }
  if (intent.includes("speed_focus") || intent.includes("speed")) {
    return "speed_focus";
  }
  if (intent.includes("athletic_performance_focus") || intent.includes("athletic")) {
    return "athletic_performance_focus";
  }
  if (intent.includes("recovery_focus") || intent.includes("lower impact") || intent.includes("recovery")) {
    return "recovery_focus";
  }
  if (intent.includes("fatigue_management") || intent.includes("reduce volume") || intent.includes("deload")) {
    return "fatigue_management";
  }

  return null;
}

// ─── Public: Guard — ensure session identity was updated in the plan ─────────

/**
 * After applying an EditPlan, checks whether the plan already included
 * update_session changes that refreshed `label` and `emphasis` for each
 * structurally-changed session.
 *
 * If a session was structurally changed (exercise add/replace/delete) but did
 * NOT receive a label+emphasis update, this function automatically patches
 * that session in the DB using the deterministic identity template.
 *
 * Returns the list of session IDs that were patched (for logging).
 */
export async function ensureSessionIdentityUpdated(
  plan: EditPlan,
  intentFamily?: string,
): Promise<number[]> {
  const family = intentFamily ?? resolveIntentFamily(plan.intent);
  if (!family || !IDENTITY_TEMPLATES[family]) {
    return [];
  }

  // Collect session IDs that had structural changes (exercises)
  const structurallyChangedSessions = new Set<number>();
  for (const change of plan.changes) {
    if (
      change.type === "add_exercise" ||
      change.type === "replace_exercise" ||
      change.type === "delete_exercise"
    ) {
      if (change.sessionId) structurallyChangedSessions.add(change.sessionId);
    } else if (change.type === "update_exercise") {
      // Only count exercise updates that change reps/sets/tempo as structural
      const u = change.updates ?? {};
      if (u.reps || u.sets || u.tempo || u.rest) {
        // We need the session ID — look it up from the exercise
        // (The edit-engine has already applied changes, so this is post-mutation)
        // We'll try to get it from the exercise table
        try {
          const ex = await db
            .select({ sessionId: sessionExercises.sessionId })
            .from(sessionExercises)
            .where(eq(sessionExercises.id, change.id))
            .limit(1);
          if (ex[0]?.sessionId) structurallyChangedSessions.add(ex[0].sessionId);
        } catch {
          // Best-effort
        }
      }
    }
  }

  if (structurallyChangedSessions.size === 0) return [];

  // Find which of these sessions already had label/emphasis updated in the plan
  const alreadyUpdatedSessions = new Set<number>();
  for (const change of plan.changes) {
    if (change.type === "update_session" && change.updates) {
      if (change.updates.label || change.updates.emphasis) {
        alreadyUpdatedSessions.add(change.id);
      }
    }
  }

  // Sessions that were structurally changed but NOT given an identity update
  const sessionsNeedingIdentityUpdate = [...structurallyChangedSessions].filter(
    (id) => !alreadyUpdatedSessions.has(id),
  );

  if (sessionsNeedingIdentityUpdate.length === 0) return [];

  // Patch each session with the computed identity
  const patched: number[] = [];
  for (const sessionId of sessionsNeedingIdentityUpdate) {
    try {
      const rows = await db
        .select({ label: trainingSessions.label, emphasis: trainingSessions.emphasis })
        .from(trainingSessions)
        .where(eq(trainingSessions.id, sessionId))
        .limit(1);

      const current = rows[0];
      if (!current) continue;

      const identity = recomputeSessionIdentity(family, current.label);
      if (!identity) continue;

      await db
        .update(trainingSessions)
        .set({
          label: identity.label,
          emphasis: identity.emphasis,
          updatedAt: new Date(),
        } as any)
        .where(eq(trainingSessions.id, sessionId));

      logger.info(
        { sessionId, family, newLabel: identity.label, newEmphasis: identity.emphasis },
        "[SessionIdentitySync] Auto-patched session identity after mutation",
      );

      patched.push(sessionId);
    } catch (err) {
      logger.warn({ err, sessionId, family }, "[SessionIdentitySync] Failed to patch session identity");
    }
  }

  return patched;
}
