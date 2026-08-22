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

const ALLOWED_EQUIPMENT: Record<EquipmentLevel, ReadonlySet<string>> = {
  full_gym: new Set([
    "barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell",
    "band", "trap_bar", "pull_up_bar", "bench", "box", "sled",
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
];

// These catalogue tags describe a physical prerequisite, not interchangeable
// loading options. An exercise tagged bodyweight + pull_up_bar still requires
// the bar; the bodyweight tag cannot make it compatible by itself.
const REQUIRED_PREREQUISITE_TAGS = new Set([
  "pull_up_bar", "box", "plyo_box", "bench", "medicine_ball",
  "stability_ball", "rings", "trx", "landmine", "sled",
]);

const canonicalEquipment = new Map<string, readonly string[]>();
const canonicalExercise = new Map<string, (typeof EXERCISES)[number]>();
const legacyExercise = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.name.toLowerCase(), exercise]));
for (const exercise of EXERCISES) {
  canonicalEquipment.set(exercise.name.toLowerCase(), exercise.equipment);
  canonicalExercise.set(exercise.name.toLowerCase(), exercise);
}
for (const exercise of EXERCISE_LIBRARY) {
  if (!canonicalEquipment.has(exercise.name.toLowerCase())) {
    canonicalEquipment.set(exercise.name.toLowerCase(), exercise.equipment);
  }
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
    const catalogEquipment = canonicalEquipment.get(name.toLowerCase());
    const requiredByName = explicitRequirements(name);
    const detected = Array.from(new Set([...(catalogEquipment ?? []), ...requiredByName]));
    const classification = exercise.classification?.toLowerCase() ?? "";

    const explicitUnavailable = requiredByName.filter((item) => !allowed.has(item));
    const hasAllowedCatalogOption = isCompatibleExercise(name, catalogEquipment, allowed);
    const unknownNonPrep = !catalogEquipment && classification !== "prep";
    const incompatibleCatalog = Boolean(catalogEquipment) && !hasAllowedCatalogOption;

    if (explicitUnavailable.length === 0 && !unknownNonPrep && !incompatibleCatalog) continue;

    violations.push({
      exerciseName: name,
      equipmentLevel,
      availableEquipment: Array.from(allowed),
      detectedEquipment: detected,
      detail: unknownNonPrep
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
        const currentEquipment = canonicalEquipment.get(exercise.name.toLowerCase());
        const classification = exercise.classification?.toLowerCase() ?? "";
        if (
          (classification === "prep" && explicitRequirements(exercise.name).every((item) => allowed.has(item))) ||
          isCompatibleExercise(exercise.name, currentEquipment, allowed)
        ) {
          repairedExercises.push(exercise);
          continue;
        }

        const source = canonicalExercise.get(exercise.name.toLowerCase());
        const legacySource = legacyExercise.get(exercise.name.toLowerCase());
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
