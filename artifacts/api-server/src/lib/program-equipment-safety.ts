import type { ProgramStructure } from "./ai";
import {
  EXERCISE_LIBRARY,
  normalizeEquipment,
  type EquipmentLevel,
} from "./training-intelligence";
import { EXERCISES } from "./exercise-library-data";

export interface EquipmentConstraintViolation {
  exerciseName: string;
  equipmentLevel: EquipmentLevel;
  availableEquipment: readonly string[];
  detectedEquipment: readonly string[];
  detail: string;
}

export interface CanonicalExerciseEquipmentAudit {
  exerciseName: string;
  canonicalNames: readonly string[];
  equipmentLevel: EquipmentLevel;
  canonicalEquipment: readonly string[];
  compatible: boolean;
  resolution: "canonical" | "alias" | "composite" | "unknown";
}

const ALLOWED_EQUIPMENT: Record<EquipmentLevel, ReadonlySet<string>> = {
  full_gym: new Set([
    "barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell",
    "band", "trap_bar", "pull_up_bar", "bench", "box", "sled",
    "ab_wheel", "medicine_ball", "stability_ball", "rings", "landmine",
  ]),
  // "Only dumbbells" permits dumbbell-loaded and genuinely equipment-free
  // movements. It does not imply bands, kettlebells, a pull-up bar, a box, or
  // any commercial-gym station.
  dumbbells_only: new Set(["dumbbell", "bodyweight"]),
  home_limited: new Set(["dumbbell", "bodyweight", "band", "kettlebell"]),
  bodyweight: new Set(["bodyweight"]),
};

const REQUIRED_EQUIPMENT_BY_NAME: ReadonlyArray<[RegExp, string]> = [
  [/\bbarbell\b/i, "barbell"],
  [/\b(?:cable|pulldown)\b/i, "cable"],
  [/\b(?:machine|leg press|hack squat|smith)\b/i, "machine"],
  [/\b(?:resistance )?band(?:ed|-assisted)?\b/i, "band"],
  [/\bkettlebell\b/i, "kettlebell"],
  [/\btrap bar\b/i, "trap_bar"],
  [/\b(?:pull-up|pull up|chin-up|chin up)\b/i, "pull_up_bar"],
  [/\b(?:box (?:jump|squat|step)|step-up|bulgarian split squat|deficit)\b/i, "box"],
  [/\bbench press\b/i, "bench"],
  [/\bmedicine ball\b/i, "medicine_ball"],
  [/\b(?:stability|swiss) ball\b/i, "stability_ball"],
  [/\b(?:ring|trx)\b/i, "rings"],
  [/\blandmine\b/i, "landmine"],
  [/\bsled\b/i, "sled"],
  [/\bab wheel(?: rollout)?\b/i, "ab_wheel"],
];

// These catalogue tags describe a physical prerequisite, not interchangeable
// loading options. An exercise tagged bodyweight + pull_up_bar still requires
// the bar; the bodyweight tag cannot make it compatible by itself.
const REQUIRED_PREREQUISITE_TAGS = new Set([
  "pull_up_bar", "box", "plyo_box", "bench", "medicine_ball",
  "stability_ball", "rings", "trx", "landmine", "sled",
  "ab_wheel",
]);

const canonicalEquipment = new Map<string, readonly string[]>();
const canonicalExercise = new Map<string, (typeof EXERCISES)[number]>();
const legacyExercise = new Map<string, (typeof EXERCISE_LIBRARY)[number]>();

function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const CANONICAL_NAME_ALIASES = new Map<string, string>([
  [normalizeExerciseName("Ab Wheel"), normalizeExerciseName("Ab Wheel Rollout")],
  [normalizeExerciseName("DB Row"), normalizeExerciseName("Dumbbell Row")],
  [normalizeExerciseName("DB RDL"), normalizeExerciseName("Dumbbell RDL")],
  [normalizeExerciseName("RDL"), normalizeExerciseName("Romanian Deadlift")],
]);

for (const exercise of EXERCISES) {
  const key = normalizeExerciseName(exercise.name);
  canonicalEquipment.set(key, exercise.equipment);
  canonicalExercise.set(key, exercise);
}
for (const exercise of EXERCISE_LIBRARY) {
  const key = normalizeExerciseName(exercise.name);
  legacyExercise.set(key, exercise);
  if (!canonicalEquipment.has(key)) {
    canonicalEquipment.set(key, exercise.equipment);
  }
}

function resolveCanonicalComponent(name: string): {
  exercise: (typeof EXERCISES)[number] | undefined;
  canonicalName: string | undefined;
  equipment: readonly string[] | undefined;
  aliased: boolean;
} {
  const normalized = normalizeExerciseName(name);
  const canonicalKey = CANONICAL_NAME_ALIASES.get(normalized) ?? normalized;
  const exercise = canonicalExercise.get(canonicalKey);
  const legacy = legacyExercise.get(canonicalKey);
  return {
    exercise,
    canonicalName: exercise?.name ?? legacy?.name,
    equipment: canonicalEquipment.get(canonicalKey),
    aliased: canonicalKey !== normalized,
  };
}

function splitCompositeExerciseName(name: string): string[] {
  return name.split(/\s*\+\s*/).map((part) => part.trim()).filter(Boolean);
}

function explicitRequirements(name: string): string[] {
  return REQUIRED_EQUIPMENT_BY_NAME
    .filter(([pattern]) => pattern.test(name))
    .map(([, equipment]) => equipment);
}

function isCompatibleExercise(name: string, equipment: readonly string[] | undefined, allowed: ReadonlySet<string>): boolean {
  if (!equipment) return false;
  if (explicitRequirements(name).some((item) => !allowed.has(item))) return false;
  if (equipment.some((item) => REQUIRED_PREREQUISITE_TAGS.has(item) && !allowed.has(item))) return false;
  return equipment.some((item) => allowed.has(item));
}

/**
 * Resolve and classify an exercise name using the canonical exercise catalogue.
 * Composite prep rows are valid only when every component resolves; a "Prep"
 * label alone never grants equipment compatibility.
 */
export function auditCanonicalExerciseEquipment(
  exerciseName: string,
  rawEquipment: string,
): CanonicalExerciseEquipmentAudit {
  const equipmentLevel = normalizeEquipment(rawEquipment);
  const allowed = ALLOWED_EQUIPMENT[equipmentLevel];
  const components = splitCompositeExerciseName(exerciseName);
  const resolved = components.map(resolveCanonicalComponent);
  const allResolved = resolved.every((item) => item.equipment && item.canonicalName);
  const canonicalNames = resolved.flatMap((item) => item.canonicalName ? [item.canonicalName] : []);
  const equipment = Array.from(new Set(resolved.flatMap((item) => item.equipment ?? [])));
  const compatible = allResolved && resolved.every((item, index) =>
    isCompatibleExercise(
      item.canonicalName ?? components[index],
      item.equipment,
      allowed,
    ),
  );

  return {
    exerciseName,
    canonicalNames,
    equipmentLevel,
    canonicalEquipment: equipment,
    compatible,
    resolution: !allResolved
      ? "unknown"
      : components.length > 1
        ? "composite"
        : resolved[0]?.aliased
          ? "alias"
          : "canonical",
  };
}

function normalizedMovementPattern(pattern: string | undefined): string | undefined {
  if (pattern === "squat" || pattern === "knee_dominant") return "knee_dominant";
  if (pattern === "hinge" || pattern === "hip_dominant") return "hip_dominant";
  return pattern;
}

/**
 * Canonical equipment boundary for provider and deterministic artifacts.
 * Restricted modes fail closed for unknown non-prep exercises. Prep movements
 * without an equipment-bearing name are treated as equipment-free mobility.
 */
export function validateProgramEquipmentConstraints(
  program: ProgramStructure,
  rawEquipment: string | null | undefined,
): EquipmentConstraintViolation[] {
  if (!rawEquipment) return [];
  const equipmentLevel = normalizeEquipment(rawEquipment);
  if (equipmentLevel === "full_gym") return [];

  const allowed = ALLOWED_EQUIPMENT[equipmentLevel];
  const violations: EquipmentConstraintViolation[] = [];

  for (const exercise of program.days.flatMap((day) => day.exercises)) {
    const name = exercise.name.trim();
    const audit = auditCanonicalExerciseEquipment(name, rawEquipment);
    const catalogEquipment = audit.canonicalEquipment;
    const requiredByName = explicitRequirements(name);
    const detected = Array.from(new Set([...(catalogEquipment ?? []), ...requiredByName]));

    const explicitUnavailable = requiredByName.filter((item) => !allowed.has(item));
    const unknownCanonical = audit.resolution === "unknown";
    const incompatibleCatalog = !unknownCanonical && !audit.compatible;

    if (explicitUnavailable.length === 0 && !unknownCanonical && !incompatibleCatalog) continue;

    violations.push({
      exerciseName: name,
      equipmentLevel,
      availableEquipment: Array.from(allowed),
      detectedEquipment: detected,
      detail: unknownCanonical
        ? `Exercise "${name}" is not in the canonical equipment catalogue for restricted generation.`
        : `Exercise "${name}" requires equipment outside ${equipmentLevel}.`,
    });
  }

  return violations;
}

/**
 * Re-selects incompatible deterministic choices from the canonical exercise
 * catalogue. Selection stays in the same movement pattern where possible and
 * never crosses the validator with an unknown or incompatible replacement.
 */
export function repairProgramEquipmentConstraints(
  program: ProgramStructure,
  rawEquipment: string | null | undefined,
): ProgramStructure | null {
  if (!rawEquipment) return program;
  const equipmentLevel = normalizeEquipment(rawEquipment);
  if (equipmentLevel === "full_gym") return program;
  const allowed = ALLOWED_EQUIPMENT[equipmentLevel];

  const repairedDays: ProgramStructure["days"] = [];
  for (const day of program.days) {
    const repairedExercises: typeof day.exercises = [];
    for (const exercise of day.exercises) {
        const currentAudit = auditCanonicalExerciseEquipment(exercise.name, rawEquipment);
        if (currentAudit.compatible) {
          repairedExercises.push(exercise);
          continue;
        }

        const normalizedName = normalizeExerciseName(exercise.name);
        const canonicalKey = CANONICAL_NAME_ALIASES.get(normalizedName) ?? normalizedName;
        const source = canonicalExercise.get(canonicalKey);
        const legacySource = legacyExercise.get(canonicalKey);
        const sourcePattern = normalizedMovementPattern(source?.movementPattern ?? legacySource?.pattern);
        const compatibleCandidates = EXERCISES.filter((candidate) =>
          isCompatibleExercise(candidate.name, candidate.equipment, allowed) &&
          Boolean(sourcePattern),
        );
        const samePattern = compatibleCandidates.filter((candidate) =>
          normalizedMovementPattern(candidate.movementPattern) === sourcePattern,
        );
        const sameRegion = source
          ? compatibleCandidates.filter((candidate) => candidate.bodyRegion === source.bodyRegion)
          : [];
        const replacement = samePattern[0] ?? sameRegion[0];
        if (!replacement) return null;
        repairedExercises.push({ ...exercise, name: replacement.name });
    }
    repairedDays.push({ ...day, exercises: repairedExercises });
  }

  return { ...program, days: repairedDays };
}

export function hasRestrictedEquipmentConstraint(rawEquipment: string | null | undefined): boolean {
  return Boolean(rawEquipment) && normalizeEquipment(rawEquipment!) !== "full_gym";
}
