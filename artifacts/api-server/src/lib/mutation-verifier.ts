/**
 * Mutation Verifier — Phase 2
 *
 * Verifies that every edit operation actually produced the expected changes
 * in the canonical training program state (DB post-mutation snapshot).
 *
 * Implements the ATTEMPT → APPLY → VERIFY → RESPOND standard.
 * The verifier is purely synchronous — it compares already-captured
 * before/after snapshots. No additional DB queries are issued here.
 *
 * Canonical program state: session_exercises, training_sessions,
 * training_weeks, training_phases, training_systems tables.
 *
 * Verification statuses:
 *   verified — all intended changes confirmed in post-mutation state
 *   partial  — some changes confirmed, some missing
 *   failed   — handler reported success but post-state is unchanged
 *   noop     — zero changes were applied by the engine
 *   unclear  — changes applied but cannot be deterministically confirmed
 */

import type { EditPlan, EditChange } from "./edit-intent-service";
import type { SystemSnapshot } from "./change-log-service";
import type { IntentFamily } from "./intent-family-engine";

// ─── Public types ──────────────────────────────────────────────────────────────

export type VerificationStatus = "verified" | "partial" | "failed" | "noop" | "unclear";

export interface MutationVerificationResult {
  status: VerificationStatus;
  /** true when status is "verified" or "partial" */
  verified: boolean;
  requestedMutationType: string;
  /** Technical summary for logging */
  summary: string;
  /** User-safe coaching explanation */
  userSafeSummary: string;
  expectedChanges: string[];
  verifiedChanges: string[];
  missingChanges: string[];
  unexpectedChanges?: string[];
  requiresReview?: boolean;
  metadata?: Record<string, unknown>;
}

// ─── Internal per-change result ────────────────────────────────────────────────

interface ChangeVerification {
  changeType: string;
  entityId: number;
  isVerified: boolean;
  isUnclear: boolean;
  verifiedChanges: string[];
  missingChanges: string[];
  unclearChanges: string[];
}

// ─── Normalisation utilities ───────────────────────────────────────────────────

function normStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).toLowerCase().trim();
}

function normNum(val: unknown): number | null {
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function getField<T>(snapshot: SystemSnapshot, bucket: keyof SystemSnapshot, id: number, field: string): T | undefined {
  return ((snapshot[bucket] as Record<string, Record<string, unknown>>)?.[String(id)]?.[field]) as T | undefined;
}

// ─── Per-change verifiers ──────────────────────────────────────────────────────

function verifyReplaceExercise(
  change: EditChange,
  before: SystemSnapshot,
  after: SystemSnapshot,
): ChangeVerification {
  const id = change.id;
  if (!change.replacement?.name) {
    return {
      changeType: "replace_exercise", entityId: id,
      isVerified: false, isUnclear: true,
      verifiedChanges: [], missingChanges: [],
      unclearChanges: ["Replacement name not specified in plan"],
    };
  }
  const beforeName = normStr(getField(before, "exercises", id, "name"));
  const afterName = normStr(getField(after, "exercises", id, "name"));
  const expectedName = normStr(change.replacement.name);

  if (afterName === expectedName && afterName !== beforeName) {
    return {
      changeType: "replace_exercise", entityId: id,
      isVerified: true, isUnclear: false,
      verifiedChanges: [`name: "${beforeName}" → "${afterName}"`],
      missingChanges: [], unclearChanges: [],
    };
  }
  if (afterName !== beforeName) {
    return {
      changeType: "replace_exercise", entityId: id,
      isVerified: false, isUnclear: true,
      verifiedChanges: [], missingChanges: [],
      unclearChanges: [`Name changed to "${afterName}" but expected "${expectedName}"`],
    };
  }
  return {
    changeType: "replace_exercise", entityId: id,
    isVerified: false, isUnclear: false,
    verifiedChanges: [],
    missingChanges: [`name: unchanged at "${afterName}" (expected "${expectedName}")`],
    unclearChanges: [],
  };
}

function verifyUpdateExercise(
  change: EditChange,
  before: SystemSnapshot,
  after: SystemSnapshot,
): ChangeVerification {
  const id = change.id;
  const updates = change.updates ?? {};
  const beforeEx = ((before.exercises as any)?.[String(id)] ?? {}) as Record<string, unknown>;
  const afterEx = ((after.exercises as any)?.[String(id)] ?? {}) as Record<string, unknown>;
  const verifiedChanges: string[] = [];
  const missingChanges: string[] = [];
  const unclearChanges: string[] = [];

  for (const [field, value] of Object.entries(updates)) {
    // __prescription_* fields — map to snapshot keys like prescriptionLoad
    if (field.startsWith("__prescription_")) {
      const suffix = field.slice("__prescription_".length);
      const snapshotKey = "prescription" + suffix.charAt(0).toUpperCase() + suffix.slice(1);
      const bv = normStr(beforeEx[snapshotKey]);
      const av = normStr(afterEx[snapshotKey]);
      if (bv === "" && av === "") {
        unclearChanges.push(`${field}: not captured in snapshot`);
      } else if (av !== bv) {
        verifiedChanges.push(`${field}: ${beforeEx[snapshotKey] ?? "—"} → ${afterEx[snapshotKey] ?? "—"}`);
      } else {
        missingChanges.push(`${field}: unchanged (${afterEx[snapshotKey] ?? "—"})`);
      }
      continue;
    }

    if (field === "sets") {
      const bSets = normNum(beforeEx.sets);
      const aSets = normNum(afterEx.sets);
      if (value === "INCREMENT") {
        const expected = bSets !== null ? Math.min(bSets + 1, 6) : null;
        if (aSets !== null && aSets !== bSets) {
          if (expected === null || aSets === expected) {
            verifiedChanges.push(`sets: ${bSets} → ${aSets} (INCREMENT confirmed)`);
          } else {
            unclearChanges.push(`sets: ${bSets} → ${aSets} (INCREMENT applied, expected ${expected})`);
          }
        } else if (aSets === bSets) {
          missingChanges.push(`sets: unchanged at ${aSets} (expected INCREMENT)`);
        } else {
          unclearChanges.push(`sets: cannot verify INCREMENT`);
        }
      } else if (value === "DECREMENT") {
        const expected = bSets !== null ? Math.max(bSets - 1, 1) : null;
        if (aSets !== null && aSets !== bSets) {
          if (expected === null || aSets === expected) {
            verifiedChanges.push(`sets: ${bSets} → ${aSets} (DECREMENT confirmed)`);
          } else {
            unclearChanges.push(`sets: ${bSets} → ${aSets} (DECREMENT applied, expected ${expected})`);
          }
        } else if (aSets === bSets) {
          missingChanges.push(`sets: unchanged at ${aSets} (expected DECREMENT)`);
        } else {
          unclearChanges.push(`sets: cannot verify DECREMENT`);
        }
      } else {
        const expectedSets = normNum(value);
        if (aSets !== null && aSets !== bSets) {
          if (expectedSets !== null && aSets === expectedSets) {
            verifiedChanges.push(`sets: ${bSets} → ${aSets}`);
          } else {
            unclearChanges.push(`sets: changed to ${aSets} (expected ${expectedSets})`);
          }
        } else if (aSets === bSets) {
          missingChanges.push(`sets: unchanged at ${aSets} (expected ${expectedSets})`);
        } else {
          unclearChanges.push(`sets: cannot compare (before=${bSets}, after=${aSets})`);
        }
      }
      continue;
    }

    // Generic field
    if (field in beforeEx || field in afterEx) {
      const bv = normStr(beforeEx[field]);
      const av = normStr(afterEx[field]);
      if (av !== bv) {
        verifiedChanges.push(`${field}: "${beforeEx[field] ?? "—"}" → "${afterEx[field] ?? "—"}"`);
      } else {
        missingChanges.push(`${field}: unchanged ("${afterEx[field] ?? "—"}")`);
      }
    } else {
      unclearChanges.push(`${field}: not captured in snapshot`);
    }
  }

  const isVerified = verifiedChanges.length > 0 && missingChanges.length === 0 && unclearChanges.length === 0;
  const isUnclear = unclearChanges.length > 0 && verifiedChanges.length === 0 && missingChanges.length === 0;
  return { changeType: "update_exercise", entityId: id, isVerified, isUnclear, verifiedChanges, missingChanges, unclearChanges };
}

function verifyAddExercise(
  change: EditChange,
  after: SystemSnapshot,
  changeResult: { applied: boolean; newId?: number },
): ChangeVerification {
  if (!changeResult.applied) {
    return {
      changeType: "add_exercise", entityId: change.id,
      isVerified: false, isUnclear: false,
      verifiedChanges: [],
      missingChanges: [`"${change.exercise?.name ?? "exercise"}" was not inserted`],
      unclearChanges: [],
    };
  }
  const newId = changeResult.newId;
  if (newId && (after.exercises as any)?.[String(newId)]) {
    const insertedName = normStr(getField(after, "exercises", newId, "name"));
    const expectedName = normStr(change.exercise?.name);
    if (!expectedName || insertedName === expectedName) {
      return {
        changeType: "add_exercise", entityId: newId,
        isVerified: true, isUnclear: false,
        verifiedChanges: [`"${change.exercise?.name ?? insertedName}" added to session ${change.sessionId}`],
        missingChanges: [], unclearChanges: [],
      };
    }
    return {
      changeType: "add_exercise", entityId: newId,
      isVerified: false, isUnclear: true,
      verifiedChanges: [], missingChanges: [],
      unclearChanges: [`Inserted "${insertedName}" but expected "${expectedName}"`],
    };
  }
  return {
    changeType: "add_exercise", entityId: change.id,
    isVerified: false, isUnclear: true,
    verifiedChanges: [], missingChanges: [],
    unclearChanges: ["Exercise insertion could not be confirmed in post-mutation snapshot"],
  };
}

function verifyDeleteExercise(
  change: EditChange,
  before: SystemSnapshot,
  after: SystemSnapshot,
): ChangeVerification {
  const id = change.id;
  const wasPresent = !!(before.exercises as any)?.[String(id)];
  const stillPresent = !!(after.exercises as any)?.[String(id)];

  if (!wasPresent) {
    return {
      changeType: "delete_exercise", entityId: id,
      isVerified: false, isUnclear: true,
      verifiedChanges: [], missingChanges: [],
      unclearChanges: ["Exercise not in before snapshot — deletion cannot be verified"],
    };
  }
  if (!stillPresent) {
    return {
      changeType: "delete_exercise", entityId: id,
      isVerified: true, isUnclear: false,
      verifiedChanges: [`Exercise ${id} confirmed removed from database`],
      missingChanges: [], unclearChanges: [],
    };
  }
  return {
    changeType: "delete_exercise", entityId: id,
    isVerified: false, isUnclear: false,
    verifiedChanges: [],
    missingChanges: ["Exercise still present in database after deletion attempt"],
    unclearChanges: [],
  };
}

function verifyUpdateEntity(
  changeType: string,
  id: number,
  updates: Record<string, unknown>,
  bucket: keyof SystemSnapshot,
  before: SystemSnapshot,
  after: SystemSnapshot,
): ChangeVerification {
  const beforeEntity = ((before[bucket] as any)?.[String(id)] ?? {}) as Record<string, unknown>;
  const afterEntity = ((after[bucket] as any)?.[String(id)] ?? {}) as Record<string, unknown>;
  const verifiedChanges: string[] = [];
  const missingChanges: string[] = [];
  const unclearChanges: string[] = [];

  for (const [field] of Object.entries(updates)) {
    if (!(field in beforeEntity) && !(field in afterEntity)) {
      unclearChanges.push(`${field}: not captured in snapshot`);
      continue;
    }
    const bv = normStr(beforeEntity[field]);
    const av = normStr(afterEntity[field]);
    if (av !== bv) {
      verifiedChanges.push(`${field}: "${beforeEntity[field] ?? "—"}" → "${afterEntity[field] ?? "—"}"`);
    } else {
      missingChanges.push(`${field}: unchanged ("${afterEntity[field] ?? "—"}")`);
    }
  }

  const isVerified = verifiedChanges.length > 0 && missingChanges.length === 0 && unclearChanges.length === 0;
  const isUnclear = unclearChanges.length > 0 && verifiedChanges.length === 0 && missingChanges.length === 0;
  return { changeType, entityId: id, isVerified, isUnclear, verifiedChanges, missingChanges, unclearChanges };
}

// ─── Restore verifier ──────────────────────────────────────────────────────────

export interface RestoreVerificationResult {
  status: VerificationStatus;
  verified: boolean;
  verifiedCount: number;
  totalCount: number;
  summary: string;
}

/**
 * Verifies that a restore operation actually reverted the entities
 * to their expected state (the original beforeSnapshot).
 */
export function verifyRestoration(
  expectedState: SystemSnapshot,
  actualPostRestoreState: SystemSnapshot,
): RestoreVerificationResult {
  let totalFields = 0;
  let matchedFields = 0;
  const details: string[] = [];

  const buckets: (keyof SystemSnapshot)[] = ["exercises", "sessions", "weeks", "phases"];
  for (const bucket of buckets) {
    for (const [idStr, expectedFields] of Object.entries(expectedState[bucket] ?? {})) {
      const actualFields = (actualPostRestoreState[bucket] as any)?.[idStr] ?? {};
      for (const [field, expectedVal] of Object.entries(expectedFields)) {
        totalFields++;
        const ev = normStr(expectedVal);
        const av = normStr(actualFields[field]);
        if (ev === av) {
          matchedFields++;
        } else {
          details.push(`${bucket}[${idStr}].${field}: expected "${expectedVal}", got "${actualFields[field] ?? "—"}"`);
        }
      }
    }
  }

  if (totalFields === 0) {
    return { status: "unclear", verified: false, verifiedCount: 0, totalCount: 0, summary: "No fields to verify in restore snapshot" };
  }

  const ratio = matchedFields / totalFields;
  const status: VerificationStatus = ratio === 1 ? "verified" : ratio >= 0.8 ? "partial" : ratio > 0 ? "partial" : "failed";
  const verified = status === "verified" || status === "partial";

  return {
    status, verified,
    verifiedCount: matchedFields,
    totalCount: totalFields,
    summary: `Restore verification: ${matchedFields}/${totalFields} fields match expected state${details.length > 0 ? `. Mismatches: ${details.slice(0, 3).join("; ")}` : ""}`,
  };
}

// ─── Main entry point ──────────────────────────────────────────────────────────

/**
 * Verify a mutation plan against the before/after DB snapshots.
 * Call AFTER applyEditPlan has completed and both snapshots are captured.
 */
export function verifyMutation(
  plan: EditPlan,
  beforeSnapshot: SystemSnapshot,
  afterSnapshot: SystemSnapshot,
  changeResults: { applied: boolean; detail: string; newId?: number }[],
): MutationVerificationResult {
  // noop: no changes attempted or all rejected before touching the DB
  if (plan.changes.length === 0 || changeResults.every((r) => !r.applied)) {
    return {
      status: "noop",
      verified: false,
      requestedMutationType: plan.intent,
      summary: "No changes were applied to the training system",
      userSafeSummary: "No changes were applied — your program state is unchanged.",
      expectedChanges: plan.changes.map((c) => `${c.type} on entity ${c.id}`),
      verifiedChanges: [],
      missingChanges: plan.changes.map((c) => `${c.type} on entity ${c.id} — not applied`),
    };
  }

  const cvs: ChangeVerification[] = [];
  for (let i = 0; i < plan.changes.length; i++) {
    const change = plan.changes[i];
    const result = changeResults[i] ?? { applied: false, detail: "", newId: undefined };
    let cv: ChangeVerification;
    switch (change.type) {
      case "replace_exercise":   cv = verifyReplaceExercise(change, beforeSnapshot, afterSnapshot); break;
      case "update_exercise":    cv = verifyUpdateExercise(change, beforeSnapshot, afterSnapshot); break;
      case "add_exercise":       cv = verifyAddExercise(change, afterSnapshot, result); break;
      case "delete_exercise":    cv = verifyDeleteExercise(change, beforeSnapshot, afterSnapshot); break;
      case "update_session":     cv = verifyUpdateEntity("update_session", change.id, change.updates ?? {}, "sessions", beforeSnapshot, afterSnapshot); break;
      case "update_week":        cv = verifyUpdateEntity("update_week", change.id, change.updates ?? {}, "weeks", beforeSnapshot, afterSnapshot); break;
      case "update_phase":       cv = verifyUpdateEntity("update_phase", change.id, change.updates ?? {}, "phases", beforeSnapshot, afterSnapshot); break;
      default:
        cv = {
          changeType: (change as any).type, entityId: change.id,
          isVerified: false, isUnclear: true,
          verifiedChanges: [], missingChanges: [],
          unclearChanges: [`Unknown change type: ${(change as any).type}`],
        };
    }
    cvs.push(cv);
  }

  const allVerified  = cvs.every((cv) => cv.isVerified);
  const allUnclear   = cvs.every((cv) => cv.isUnclear);
  const someVerified = cvs.some((cv) => cv.isVerified);
  const someMissing  = cvs.some((cv) => cv.missingChanges.length > 0);
  const someUnclear  = cvs.some((cv) => cv.isUnclear);

  const flatVerified  = cvs.flatMap((cv) => cv.verifiedChanges);
  const flatMissing   = cvs.flatMap((cv) => cv.missingChanges);
  const flatUnclear   = cvs.flatMap((cv) => cv.unclearChanges);
  const flatExpected  = cvs.flatMap((cv) => [...cv.verifiedChanges, ...cv.missingChanges, ...cv.unclearChanges]);

  let status: VerificationStatus;
  if (allVerified)                           status = "verified";
  else if (allUnclear)                       status = "unclear";
  else if (someVerified && someMissing)      status = "partial";
  else if (someVerified && someUnclear)      status = "partial";
  else if (someUnclear && !someVerified)     status = "unclear";
  else if (!someVerified)                    status = "failed";
  else                                       status = "partial";

  const userSafeSummaryMap: Record<VerificationStatus, string> = {
    verified: `All ${flatVerified.length} change${flatVerified.length === 1 ? "" : "s"} confirmed in your training system.`,
    partial:  `${flatVerified.length} of ${flatExpected.length} change${flatExpected.length === 1 ? "" : "s"} confirmed. Some items may need your review.`,
    failed:   "The edit was processed but the expected changes were not detected in your program state. Your program may be unchanged.",
    noop:     "No changes were applied to your program.",
    unclear:  "Changes were applied. Some could not be fully verified — your program should reflect the edit.",
  };

  return {
    status,
    verified: status === "verified" || status === "partial",
    requestedMutationType: plan.intent,
    summary: `[${status.toUpperCase()}] ${plan.intent}: ${flatVerified.length} verified, ${flatMissing.length} missing, ${flatUnclear.length} unclear`,
    userSafeSummary: userSafeSummaryMap[status],
    expectedChanges: flatExpected,
    verifiedChanges: flatVerified,
    missingChanges: flatMissing,
    requiresReview: status === "partial" || status === "unclear",
    metadata: {
      totalChanges: plan.changes.length,
      verifiedCount: cvs.filter((cv) => cv.isVerified).length,
      missingCount:  cvs.filter((cv) => cv.missingChanges.length > 0).length,
      unclearCount:  cvs.filter((cv) => cv.isUnclear).length,
    },
  };
}

// ─── Constraint Compliance Verifier ───────────────────────────────────────────
//
// Verifies that a post-mutation snapshot satisfies the user's active constraints.
// Called AFTER verifyMutation() to provide a second layer of semantic validation.
//
// Checks:
//   1. Banned equipment is absent from all exercises in the post-mutation snapshot
//   2. Pain-constrained movements do not appear in the snapshot
//   3. Required exercises (positively requested) are present
//
// Returns a compact result — does NOT re-query the DB.

export interface ConstraintComplianceInput {
  intentFamily: IntentFamily;
  afterSnapshot: SystemSnapshot;
  bannedEquipment?: string[];          // equipment that must not appear
  bannedExercisePatterns?: string[];   // regex strings for movements to exclude
  requiredExercises?: string[];        // exercise names that must appear
  painBodyRegions?: string[];          // body regions with pain constraints
}

export interface ConstraintViolation {
  rule: string;
  detail: string;
  entityId?: number;
  exerciseName?: string;
}

export interface ConstraintComplianceResult {
  compliant: boolean;
  violations: ConstraintViolation[];
  checkedRules: string[];
  summary: string;
}

export function verifyConstraintCompliance(
  input: ConstraintComplianceInput,
): ConstraintComplianceResult {
  const {
    afterSnapshot,
    bannedEquipment = [],
    bannedExercisePatterns = [],
    requiredExercises = [],
    painBodyRegions = [],
  } = input;

  const violations: ConstraintViolation[] = [];
  const checkedRules: string[] = [];

  const exerciseEntries = Object.values(afterSnapshot.exercises);

  // ── Rule 1: Banned equipment check ─────────────────────────────────────────
  if (bannedEquipment.length > 0) {
    checkedRules.push(`banned_equipment: [${bannedEquipment.join(", ")}]`);
    for (const entry of exerciseEntries) {
      const name = normStr(entry?.name ?? "");
      const equipmentField = normStr(entry?.equipment ?? "");
      for (const banned of bannedEquipment) {
        const bannedNorm = banned.toLowerCase().trim();
        if (
          name.includes(bannedNorm) ||
          equipmentField.includes(bannedNorm)
        ) {
          violations.push({
            rule: "banned_equipment",
            detail: `Exercise "${entry?.name ?? "unknown"}" uses banned equipment: ${banned}`,
            entityId: typeof entry?.id === "number" ? entry.id : undefined,
            exerciseName: String(entry?.name ?? ""),
          });
        }
      }
    }
  }

  // ── Rule 2: Banned movement pattern check ──────────────────────────────────
  if (bannedExercisePatterns.length > 0) {
    checkedRules.push(`banned_patterns: [${bannedExercisePatterns.join(", ")}]`);
    for (const entry of exerciseEntries) {
      const name = normStr(entry?.name ?? "");
      for (const pattern of bannedExercisePatterns) {
        try {
          const re = new RegExp(pattern, "i");
          if (re.test(name)) {
            violations.push({
              rule: "banned_movement_pattern",
              detail: `Exercise "${entry?.name ?? "unknown"}" matches banned pattern: ${pattern}`,
              entityId: typeof entry?.id === "number" ? entry.id : undefined,
              exerciseName: String(entry?.name ?? ""),
            });
          }
        } catch {
          // Silently skip malformed regex patterns — don't crash verification
        }
      }
    }
  }

  // ── Rule 3: Pain body region check ─────────────────────────────────────────
  // If a user has pain in a region, exercises targeting that region should be
  // reviewed. This is a soft check — we flag, not hard-fail.
  if (painBodyRegions.length > 0) {
    checkedRules.push(`pain_body_regions: [${painBodyRegions.join(", ")}]`);
    const painKeywordMap: Record<string, string[]> = {
      knee: ["lunge", "squat", "leg press", "step up", "bulgarian", "jump"],
      hip: ["hip thrust", "hip hinge", "rdl", "deadlift", "good morning"],
      shoulder: ["overhead press", "lateral raise", "upright row", "behind the neck"],
      "lower back": ["good morning", "deadlift", "back extension", "hyperextension"],
      elbow: ["curl", "tricep", "close grip bench", "skull crusher"],
    };

    for (const region of painBodyRegions) {
      const keywords = painKeywordMap[region.toLowerCase()] ?? [];
      for (const entry of exerciseEntries) {
        const name = normStr(entry?.name ?? "");
        for (const kw of keywords) {
          if (name.includes(kw)) {
            violations.push({
              rule: "pain_region_conflict",
              detail: `Exercise "${entry?.name ?? "unknown"}" targets pain region "${region}" — confirm this is appropriate`,
              entityId: typeof entry?.id === "number" ? entry.id : undefined,
              exerciseName: String(entry?.name ?? ""),
            });
          }
        }
      }
    }
  }

  // ── Rule 4: Required exercises present check ───────────────────────────────
  if (requiredExercises.length > 0) {
    checkedRules.push(`required_exercises: [${requiredExercises.join(", ")}]`);
    const presentNames = exerciseEntries.map((e) => normStr(e?.name ?? ""));
    for (const required of requiredExercises) {
      const requiredNorm = required.toLowerCase().trim();
      const found = presentNames.some((name) => name.includes(requiredNorm));
      if (!found) {
        violations.push({
          rule: "required_exercise_missing",
          detail: `Required exercise "${required}" is not present in the post-mutation snapshot`,
          exerciseName: required,
        });
      }
    }
  }

  const compliant = violations.length === 0;

  return {
    compliant,
    violations,
    checkedRules,
    summary: compliant
      ? `Constraint compliance verified: ${checkedRules.length} rule${checkedRules.length === 1 ? "" : "s"} passed, 0 violations`
      : `Constraint violations: ${violations.length} violation${violations.length === 1 ? "" : "s"} across ${checkedRules.length} rule${checkedRules.length === 1 ? "" : "s"} — ${violations.map((v) => v.rule).join(", ")}`,
  };
}
