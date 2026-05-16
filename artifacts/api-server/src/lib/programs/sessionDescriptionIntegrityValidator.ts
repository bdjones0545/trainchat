// ─── Session Description Integrity Validator ─────────────────────────────────
//
// Post-generation source-of-truth guard:
// Ensures that every exercise name mentioned in session descriptions, notes,
// or intent fields actually exists in the saved session's exercises[] array.
//
// Problem it solves:
//   The AI generates session descriptions from an architecture brief that may
//   reference exercises by name (e.g. "Nordic Hamstring Curl is the primary
//   anchor of this session"). If the AI then builds an exercises[] that omits
//   that exercise, the user sees a description that contradicts the program.
//
// Decision hierarchy:
//   1. Extract exercise name mentions from all text fields of each session day
//   2. Compare against exercises[] saved to that day
//   3. For each missing mentioned exercise:
//      a. INSERT into exercises[] if session has < MAX_SESSION_EXERCISES (7)
//         and the exercise fits the session's theme profile
//      b. Otherwise REWRITE the description to remove the mention
//   4. Emit a dev-mode audit log per day with full details
//
// Regression test:
//   Theme: Hamstring + Adductor Resilience + Hip Strength
//   Description mentions: Nordic hamstring curl, hip thrust, Copenhagen plank
//   Expected: those exercises appear in exercises[] OR the description is rewritten
// ─────────────────────────────────────────────────────────────────────────────

import type { ProgramDay, Exercise, ProgramStructure } from "../ai";
import { getKnownExerciseNames, getExerciseThemeProfile, computeExerciseCoherence } from "./exerciseThemeProfiles";
import type { SessionAdaptationFingerprint } from "./sessionAdaptationFingerprint";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard cap from the density fill engine — never exceed this per session */
const MAX_SESSION_EXERCISES = 7;

// ─── Exercise Name Alias Map ──────────────────────────────────────────────────
// Maps common description-language variants → canonical theme profile names.
// Descriptions often use colloquial or shortened exercise names that differ
// from the canonical registry keys.

const EXERCISE_ALIASES: Record<string, string> = {
  // Nordic variants
  "nordic curl":                        "Nordics (Nordic Hamstring Curl)",
  "nordic curls":                       "Nordics (Nordic Hamstring Curl)",
  "nordic hamstring curl":              "Nordics (Nordic Hamstring Curl)",
  "nordic hamstring curls":             "Nordics (Nordic Hamstring Curl)",
  "nordics":                            "Nordics (Nordic Hamstring Curl)",
  "nordic":                             "Nordics (Nordic Hamstring Curl)",

  // Copenhagen variants
  "copenhagen plank":                   "Copenhagen Plank",
  "copenhagen planks":                  "Copenhagen Plank",
  "copenhagen adduction":               "Copenhagen Adduction",
  "cph plank":                          "Copenhagen Plank",

  // Hip thrust variants
  "hip thrust":                         "Hip Thrust (barbell)",
  "hip thrusts":                        "Hip Thrust (barbell)",
  "barbell hip thrust":                 "Hip Thrust (barbell)",
  "barbell hip thrusts":                "Hip Thrust (barbell)",

  // RDL / hinge variants
  "rdl":                                "Romanian Deadlift",
  "romanian deadlift":                  "Romanian Deadlift",
  "single-leg rdl":                     "Single-Leg Romanian Deadlift",
  "single leg rdl":                     "Single-Leg Romanian Deadlift",
  "sl rdl":                             "Single-Leg Romanian Deadlift",
  "slrdl":                              "Single-Leg Romanian Deadlift",
  "dumbbell rdl":                       "Dumbbell Romanian Deadlift",
  "db rdl":                             "Dumbbell Romanian Deadlift",
  "hex bar rdl":                        "Hex Bar RDL",
  "kickstand rdl":                      "Kickstand RDL",

  // Deadlift variants
  "conventional deadlift":              "Conventional Deadlift",
  "trap bar deadlift":                  "Trap Bar Deadlift",
  "trap bar dl":                        "Trap Bar Deadlift",
  "trap bar":                           "Trap Bar Deadlift",
  "rack pull":                          "Rack Pull (from knee)",
  "rack pulls":                         "Rack Pull (from knee)",
  "stiff leg deadlift":                 "Stiff-Leg Deadlift",
  "stiff-leg deadlift":                 "Stiff-Leg Deadlift",
  "sumo deadlift":                      "Sumo Deadlift",
  "glute ham raise":                    "Glute-Ham Raise",
  "glute-ham raise":                    "Glute-Ham Raise",
  "ghr":                                "Glute-Ham Raise",

  // Squat variants
  "back squat":                         "Back Squat",
  "front squat":                        "Front Squat",
  "box squat":                          "Box Squat",
  "goblet squat":                       "Goblet Squat (heavy)",
  "bulgarian split squat":              "Bulgarian Split Squat",
  "split squat":                        "Bulgarian Split Squat",
  "rfess":                              "Rear-Foot Elevated Split Squat (RFESS)",
  "belt squat":                         "Belt Squat",

  // Unilateral lower
  "single-leg romanian deadlift":       "Single-Leg Romanian Deadlift",
  "single leg romanian deadlift":       "Single-Leg Romanian Deadlift",
  "single-leg hip thrust":              "Single-Leg Hip Thrust",
  "single leg hip thrust":              "Single-Leg Hip Thrust",
  "reverse lunge":                      "Reverse Lunge",
  "lateral lunge":                      "Lateral Lunge",
  "step-up":                            "Step-Up with Knee Drive",
  "step up":                            "Step-Up with Knee Drive",
  "cossack squat":                      "Cossack Squat",

  // Carries
  "farmers carry":                      "Farmers Carry",
  "farmers walk":                       "Farmers Carry",
  "farmer's carry":                     "Farmers Carry",
  "suitcase carry":                     "Suitcase Carry",
  "overhead carry":                     "Overhead Carry",

  // Plyometric
  "box jump":                           "Box Jump",
  "broad jump":                         "Broad Jump",
  "depth jump":                         "Depth Jump",
  "jump squat":                         "Jump Squat (barbell, 30% 1RM)",
  "lateral bound":                      "Lateral Bound",

  // Upper push
  "bench press":                        "Bench Press",
  "barbell bench press":                "Bench Press",
  "overhead press":                     "Overhead Press",
  "push press":                         "Push Press",

  // Upper pull
  "pull-up":                            "Pull-Up (weighted)",
  "pullup":                             "Pull-Up (weighted)",
  "pull up":                            "Pull-Up (weighted)",
  "chin-up":                            "Chin-Up",
  "barbell row":                        "Barbell Row",
  "cable row":                          "Cable Row",
  "dumbbell row":                       "Dumbbell Row",
  "face pull":                          "Face Pull",
  "band pull-apart":                    "Band Pull-Apart",

  // Trunk
  "pallof press":                       "Pallof Press",
  "ab wheel rollout":                   "Ab Wheel Rollout",
  "dead bug":                           "Dead Bug",
  "landmine rotation":                  "Landmine Rotation",
  "cable chop":                         "Cable Chop",
};

// ─── Primary Slot Detection Patterns ────────────────────────────────────────
// Detect when a description claims a specific exercise is "the primary" of
// the session. The exercise must then exist in exercises[] as primary/first.

const PRIMARY_ANCHOR_PATTERNS: RegExp[] = [
  // "X is the primary exercise" or "X is the session anchor"
  /\b([\w][\w\s\-/()']+?)\s+(?:is|are)\s+(?:the\s+)?(?:primary exercise|session anchor|primary anchor|the session anchor)/gi,
  // "primary exercise: X"
  /(?:primary exercise|session anchor)[:\s]+([A-Za-z][\w\s\-/()']+?)(?:[.,—(]|$)/gi,
  // "THIS IS THE SESSION" uppercase marker followed by exercise name in description context
  /(?:This IS the session|This is the session)[.\s–—]*([A-Za-z][\w\s\-/()']+?)(?:[.,—(]|$)/gi,
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntegrityAction =
  | "ok"               // exercise was found — no action needed
  | "inserted"         // exercise was missing but inserted into exercises[]
  | "description_rewritten"  // exercise was missing and over cap — removed from text
  | "primary_mismatch_logged"; // description claims wrong primary — logged only

export interface ExerciseIntegrityEntry {
  mentionedName: string;     // raw mention from text (e.g. "Nordic hamstring curl")
  canonicalName: string;     // resolved canonical name (e.g. "Nordics (Nordic Hamstring Curl)")
  sourceField: string;       // which field contained the mention
  action: IntegrityAction;
}

export interface DayIntegrityResult {
  dayNumber: number;
  title: string;
  mentionedExercises: string[];
  savedExercises: string[];
  missingMentionedExercises: string[];
  primarySlotViolation: { claimedPrimary: string; actualPrimary: string } | null;
  actionsTaken: ExerciseIntegrityEntry[];
}

export interface SessionDescriptionIntegrityReport {
  sessionId: string;
  days: DayIntegrityResult[];
  totalMissing: number;
  totalInserted: number;
  totalRewritten: number;
}

// ─── Name Index ───────────────────────────────────────────────────────────────

/** Lazily built; reused across all days in one build */
let _nameIndex: { allPatterns: string[]; aliasMap: Map<string, string> } | null = null;

function getNameIndex(): { allPatterns: string[]; aliasMap: Map<string, string> } {
  if (_nameIndex) return _nameIndex;

  const aliasMap = new Map<string, string>();

  // Canonical names (exact registry keys)
  for (const name of getKnownExerciseNames()) {
    aliasMap.set(name.toLowerCase(), name);
  }

  // Common description-language aliases
  for (const [alias, canonical] of Object.entries(EXERCISE_ALIASES)) {
    // Only register alias if canonical is in registry (or keep as-is for unknown)
    aliasMap.set(alias.toLowerCase(), canonical);
  }

  // Sort patterns longest-first so "single-leg romanian deadlift" matches before "rdl"
  const allPatterns = [...aliasMap.keys()].sort((a, b) => b.length - a.length);

  _nameIndex = { allPatterns, aliasMap };
  return _nameIndex;
}

// ─── Text Helpers ─────────────────────────────────────────────────────────────

interface TextFieldSource {
  text: string;
  field: string;
}

function getDayTextFields(day: ProgramDay): TextFieldSource[] {
  const fields: TextFieldSource[] = [];

  if (day.focus) fields.push({ text: day.focus, field: "day.focus" });
  if (day.notes) fields.push({ text: day.notes, field: "day.notes" });
  for (const note of day.sessionFlowNotes ?? []) {
    if (note) fields.push({ text: note, field: "day.sessionFlowNotes" });
  }
  for (const ex of day.exercises) {
    if (ex.intent) fields.push({ text: ex.intent, field: `exercise.intent(${ex.name})` });
    if (ex.notes) fields.push({ text: ex.notes, field: `exercise.notes(${ex.name})` });
  }

  return fields;
}

function combinedDayText(day: ProgramDay): string {
  return getDayTextFields(day).map((f) => f.text).join(" ");
}

// ─── Exercise Name Extraction ─────────────────────────────────────────────────

interface MentionResult {
  rawText: string;        // the matched alias/pattern text
  canonical: string;      // canonical name it resolved to
  sourceField: string;
}

function extractMentionsFromFields(fields: TextFieldSource[]): MentionResult[] {
  const { allPatterns, aliasMap } = getNameIndex();
  const found: MentionResult[] = [];
  const foundCanonicals = new Set<string>();

  for (const { text, field } of fields) {
    const lower = text.toLowerCase();

    for (const pattern of allPatterns) {
      const idx = lower.indexOf(pattern);
      if (idx === -1) continue;

      // Word-boundary check: character before and after must be non-word or start/end
      const charBefore = idx === 0 ? "\0" : lower[idx - 1];
      const charAfter = idx + pattern.length >= lower.length ? "\0" : lower[idx + pattern.length];
      const boundaryChars = /[\s,.()\-–—:;/\0]/;

      if (!boundaryChars.test(charBefore) || !boundaryChars.test(charAfter)) continue;

      const canonical = aliasMap.get(pattern)!;

      // De-duplicate: record each canonical only once per day
      if (foundCanonicals.has(canonical)) continue;
      foundCanonicals.add(canonical);

      found.push({ rawText: pattern, canonical, sourceField: field });
    }
  }

  return found;
}

// ─── Primary Slot Detection ───────────────────────────────────────────────────

interface PrimarySlotClaim {
  claimedName: string;     // exercise name claimed as primary in description
  canonical: string;       // resolved canonical
}

function detectPrimarySlotClaims(text: string): PrimarySlotClaim[] {
  const { aliasMap } = getNameIndex();
  const claims: PrimarySlotClaim[] = [];
  const seen = new Set<string>();

  for (const pattern of PRIMARY_ANCHOR_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const claimed = m[1]?.trim().toLowerCase();
      if (!claimed || seen.has(claimed)) continue;

      // Find best matching canonical from aliasMap
      const { allPatterns } = getNameIndex();
      for (const aliasPattern of allPatterns) {
        if (claimed.includes(aliasPattern)) {
          seen.add(claimed);
          claims.push({
            claimedName: m[1].trim(),
            canonical: aliasMap.get(aliasPattern)!,
          });
          break;
        }
      }
    }
  }

  return claims;
}

function getActualPrimaryExercise(exercises: Exercise[]): string | null {
  // The actual primary is the exercise marked classification=primary,
  // or — if none are marked — the first non-prep exercise (index 1 if [0] is prep/warm-up)
  const explicitPrimary = exercises.find((e) => e.classification === "primary");
  if (explicitPrimary) return explicitPrimary.name;

  const nonPrep = exercises.filter((e) => e.classification !== "prep" && e.classification !== "power");
  return nonPrep[0]?.name ?? exercises[0]?.name ?? null;
}

// ─── Text Rewrite ─────────────────────────────────────────────────────────────

/**
 * Removes mentions of `exerciseName` from a text string.
 * Strategy: remove the smallest unit of text that contains the mention.
 *   - First tries to remove the sentence (text up to the next punctuation boundary)
 *   - Falls back to removing just the exercise name token
 */
function rewriteRemoveMention(text: string, exerciseName: string): string {
  // Build a regex that matches the exercise name (case-insensitive)
  // along with an optional prescription pattern like "(3 × 5-8)" or "(4 × 5-8 eccentric)"
  const escaped = exerciseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prescriptionSuffix = String.raw`(?:\s*\([^)]*\))?`;
  const nameRegex = new RegExp(
    `(?:[.!?—–]\\s*)?[^.!?—–]*\\b${escaped}\\b[^.!?—–]*[.!?—–]?`,
    "gi",
  );

  // Remove the phrase/sentence containing the exercise name
  let result = text.replace(nameRegex, " ").replace(/\s{2,}/g, " ").trim();

  // If nothing was removed (boundary mismatch), do a simpler name-only removal
  if (result === text) {
    const simpleRegex = new RegExp(escaped + prescriptionSuffix, "gi");
    result = text.replace(simpleRegex, "").replace(/\s{2,}/g, " ").trim();
  }

  return result;
}

/**
 * Applies rewrite to all text fields in a day that mention the exercise.
 * Returns the patched day (immutable — returns new day object).
 */
function rewriteDayDescriptions(day: ProgramDay, canonicalName: string, aliases: string[]): ProgramDay {
  const namesToRemove = [canonicalName, ...aliases];

  function patchText(text: string | undefined): string | undefined {
    if (!text) return text;
    let result = text;
    for (const name of namesToRemove) {
      result = rewriteRemoveMention(result, name);
    }
    return result || undefined;
  }

  return {
    ...day,
    focus: patchText(day.focus),
    notes: patchText(day.notes),
    sessionFlowNotes: day.sessionFlowNotes?.map((n) => patchText(n) ?? "").filter(Boolean),
    exercises: day.exercises.map((ex) => ({
      ...ex,
      intent: patchText(ex.intent),
      notes: patchText(ex.notes),
    })),
  };
}

// ─── Exercise Insertion ───────────────────────────────────────────────────────

/**
 * Determine the appropriate classification for an inserted exercise based
 * on which adaptation dimensions dominate its theme profile.
 */
function classifyForInsertion(canonicalName: string): Exercise["classification"] {
  const profile = getExerciseThemeProfile(canonicalName);

  const dims = Object.entries(profile) as [string, number][];
  if (dims.length === 0) return "finisher";

  const dominant = dims.sort(([, a], [, b]) => b - a)[0][0];

  if (dominant === "hamstring_resilience" || dominant === "adductor_resilience") return "trunk";
  if (dominant === "hip_strength" || dominant === "glute_development") return "secondary";
  if (dominant === "trunk_stability" || dominant === "rotational_power") return "trunk";
  if (dominant === "elastic_reactivity") return "power";
  if (dominant === "upper_push_strength" || dominant === "upper_pull_strength") return "secondary";
  return "finisher";
}

/**
 * Returns a default prescription for an inserted exercise.
 * Based on the exercise's dominant adaptation dimension.
 */
function defaultPrescription(canonicalName: string): { sets: number; reps: string; rest: string } {
  const profile = getExerciseThemeProfile(canonicalName);
  const dims = Object.entries(profile) as [string, number][];
  const dominant = dims.sort(([, a], [, b]) => b - a)[0]?.[0] ?? "";

  if (dominant === "hamstring_resilience" || dominant === "eccentric_loading") {
    return { sets: 3, reps: "5-8 (eccentric focus)", rest: "90s" };
  }
  if (dominant === "adductor_resilience" || dominant === "isometric_loading") {
    return { sets: 3, reps: "20-30 sec each side", rest: "60s" };
  }
  if (dominant === "elastic_reactivity") {
    return { sets: 4, reps: "4-5", rest: "2min" };
  }
  if (dominant === "upper_push_strength" || dominant === "upper_pull_strength") {
    return { sets: 3, reps: "8-12", rest: "90s" };
  }
  return { sets: 3, reps: "8-10", rest: "90s" };
}

/**
 * Inserts a missing exercise into the day's exercises[] array.
 * Position: before the first "trunk" or "finisher" exercise if one exists,
 * otherwise appended at the end.
 */
function insertExercise(day: ProgramDay, canonicalName: string): ProgramDay {
  const classification = classifyForInsertion(canonicalName);
  const { sets, reps, rest } = defaultPrescription(canonicalName);

  const newExercise: Exercise = {
    name: canonicalName,
    classification,
    sets,
    reps,
    rest,
    intent: `${canonicalName} — inserted by integrity guard (mentioned in description but missing from program)`,
  };

  const exercises = [...day.exercises];

  // Insert before first trunk/finisher block if present, else append
  const insertionIdx = exercises.findIndex(
    (e) => e.classification === "trunk" || e.classification === "finisher",
  );

  if (insertionIdx >= 0) {
    exercises.splice(insertionIdx, 0, newExercise);
  } else {
    exercises.push(newExercise);
  }

  return { ...day, exercises };
}

// ─── Day Validator ────────────────────────────────────────────────────────────

/**
 * Validates and patches a single ProgramDay for description integrity.
 *
 * @param day           The program day to validate
 * @param fingerprint   Optional session adaptation fingerprint for coherence scoring
 * @returns { patchedDay, result }
 */
function validateDay(
  day: ProgramDay,
  fingerprint: SessionAdaptationFingerprint | null,
): { patchedDay: ProgramDay; result: DayIntegrityResult } {
  const textFields = getDayTextFields(day);
  const fullText = combinedDayText(day);
  const { aliasMap } = getNameIndex();

  // ── Step 1: Extract all exercise name mentions ──────────────────────────────
  const mentions = extractMentionsFromFields(textFields);

  const mentionedExercises = [...new Set(mentions.map((m) => m.canonical))];
  const savedExercises = day.exercises.map((e) => e.name);

  // ── Step 2: Find missing exercises ─────────────────────────────────────────
  // An exercise is "missing" if its canonical name doesn't match any saved exercise
  // (case-insensitive, also checking aliases of saved exercise names)
  const savedLower = new Set(savedExercises.map((n) => n.toLowerCase()));
  const savedCanonicals = new Set(
    savedExercises
      .map((n) => aliasMap.get(n.toLowerCase()) ?? n)
      .map((n) => n.toLowerCase()),
  );

  const missingMentioned = mentionedExercises.filter((canonical) => {
    const cLower = canonical.toLowerCase();
    return !savedLower.has(cLower) && !savedCanonicals.has(cLower);
  });

  // ── Step 3: Primary slot validation ────────────────────────────────────────
  const primaryClaims = detectPrimarySlotClaims(fullText);
  const actualPrimary = getActualPrimaryExercise(day.exercises);
  let primarySlotViolation: DayIntegrityResult["primarySlotViolation"] = null;

  for (const claim of primaryClaims) {
    const claimedLower = claim.canonical.toLowerCase();
    const actualPrimaryCanonicalLower = (aliasMap.get(actualPrimary?.toLowerCase() ?? "") ?? actualPrimary ?? "").toLowerCase();
    if (
      actualPrimary &&
      claimedLower !== actualPrimary.toLowerCase() &&
      claimedLower !== actualPrimaryCanonicalLower
    ) {
      primarySlotViolation = {
        claimedPrimary: claim.canonical,
        actualPrimary,
      };
      break;
    }
  }

  // ── Step 4: Corrective actions ──────────────────────────────────────────────
  const actionsTaken: ExerciseIntegrityEntry[] = [];
  let patchedDay = day;

  for (const canonical of missingMentioned) {
    const mention = mentions.find((m) => m.canonical === canonical)!;
    const canInsert = patchedDay.exercises.length < MAX_SESSION_EXERCISES;

    // Optional: if fingerprint is available, only insert if coherence is meaningful
    let coherenceOk = true;
    if (fingerprint && canInsert) {
      const profile = getExerciseThemeProfile(canonical);
      const coherence = computeExerciseCoherence(profile, fingerprint);
      // Only skip insertion if coherence is very low (< 0.1) AND we have fingerprint context
      // This prevents inserting completely off-theme exercises
      if (coherence < 0.1 && Object.keys(profile).length > 0) {
        coherenceOk = false;
      }
    }

    if (canInsert && coherenceOk) {
      patchedDay = insertExercise(patchedDay, canonical);
      actionsTaken.push({
        mentionedName: mention.rawText,
        canonicalName: canonical,
        sourceField: mention.sourceField,
        action: "inserted",
      });
    } else {
      // Find all aliases that map to this canonical (to rewrite all variations)
      const allAliasesForCanonical = [canonical, ...Object.entries(EXERCISE_ALIASES)
        .filter(([, v]) => v === canonical)
        .map(([k]) => k)];

      patchedDay = rewriteDayDescriptions(patchedDay, canonical, allAliasesForCanonical);
      actionsTaken.push({
        mentionedName: mention.rawText,
        canonicalName: canonical,
        sourceField: mention.sourceField,
        action: "description_rewritten",
      });
    }
  }

  // Log primary slot violations (read-only — we don't auto-fix primary slot
  // because swapping primary exercises requires architectural judgment)
  if (primarySlotViolation) {
    actionsTaken.push({
      mentionedName: primarySlotViolation.claimedPrimary,
      canonicalName: primarySlotViolation.claimedPrimary,
      sourceField: "primary_slot_claim",
      action: "primary_mismatch_logged",
    });
  }

  return {
    patchedDay,
    result: {
      dayNumber: day.dayNumber,
      title: day.name,
      mentionedExercises,
      savedExercises,
      missingMentionedExercises: missingMentioned,
      primarySlotViolation,
      actionsTaken,
    },
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Runs the Session Description Integrity check over every day in the program.
 *
 * Operates as a non-blocking post-generation pass:
 *   - Never throws (errors are caught and logged)
 *   - Returns the original program if it cannot run
 *   - Returns a patched ProgramStructure with corrected exercises[] and/or
 *     rewritten descriptions where violations were detected
 *
 * @param program     The generated ProgramStructure (post-AI generation)
 * @param sessionId   An opaque string for dev log correlation (e.g. "build-1716000000")
 * @param fingerprint Optional session adaptation fingerprint for coherence scoring
 */
export function runSessionDescriptionIntegrityCheck(
  program: ProgramStructure,
  sessionId: string,
  fingerprint: SessionAdaptationFingerprint | null = null,
): ProgramStructure {
  // Reset the name index cache between builds so it's rebuilt fresh
  _nameIndex = null;

  const dayResults: DayIntegrityResult[] = [];
  const patchedDays: ProgramDay[] = [];

  for (const day of program.days) {
    try {
      const { patchedDay, result } = validateDay(day, fingerprint);
      patchedDays.push(patchedDay);
      dayResults.push(result);
    } catch (err) {
      // Never block on validator errors — log and pass through
      patchedDays.push(day);
      dayResults.push({
        dayNumber: day.dayNumber,
        title: day.name,
        mentionedExercises: [],
        savedExercises: day.exercises.map((e) => e.name),
        missingMentionedExercises: [],
        primarySlotViolation: null,
        actionsTaken: [],
      });
    }
  }

  const report: SessionDescriptionIntegrityReport = {
    sessionId,
    days: dayResults,
    totalMissing: dayResults.reduce((acc, d) => acc + d.missingMentionedExercises.length, 0),
    totalInserted: dayResults.reduce(
      (acc, d) => acc + d.actionsTaken.filter((a) => a.action === "inserted").length,
      0,
    ),
    totalRewritten: dayResults.reduce(
      (acc, d) => acc + d.actionsTaken.filter((a) => a.action === "description_rewritten").length,
      0,
    ),
  };

  // ── Dev-mode audit log ──────────────────────────────────────────────────────
  // Emitted per day that has violations (to keep logs focused).
  // Also emits a summary if any actions were taken.
  if (process.env.NODE_ENV !== "production") {
    for (const d of dayResults) {
      if (d.missingMentionedExercises.length > 0 || d.primarySlotViolation) {
        console.log("[SessionDescriptionIntegrity]", JSON.stringify({
          sessionId,
          title: d.title,
          mentionedExercises: d.mentionedExercises,
          savedExercises: d.savedExercises,
          missingMentionedExercises: d.missingMentionedExercises,
          primarySlotViolation: d.primarySlotViolation,
          actionTaken: d.actionsTaken.map((a) => ({
            exercise: a.canonicalName,
            action: a.action,
            sourceField: a.sourceField,
          })),
        }));
      }
    }

    if (report.totalMissing > 0 || report.totalInserted > 0 || report.totalRewritten > 0) {
      console.log("[SessionDescriptionIntegritySummary]", JSON.stringify({
        sessionId,
        totalMissing: report.totalMissing,
        totalInserted: report.totalInserted,
        totalRewritten: report.totalRewritten,
        clean: report.totalMissing === 0,
      }));
    }
  }

  if (report.totalMissing > 0 || report.totalInserted > 0 || report.totalRewritten > 0) {
    return { ...program, days: patchedDays };
  }

  return program;
}
