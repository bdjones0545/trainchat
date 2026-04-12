/**
 * Prescription Schema Engine
 *
 * Defines which prescription fields are valid for each exercise family,
 * and resolves user commands to the correct structured DB field.
 *
 * Physical field mapping:
 *   sets       → sessionExercises.sets (integer)
 *   reps       → sessionExercises.reps (text) — also used for duration/distance/height display
 *   rest       → sessionExercises.rest (text)
 *   tempo      → sessionExercises.tempo (text)
 *   notes      → sessionExercises.notes (text) — coaching cues only, NOT load/distance
 *   metadata   → sessionExercises.metadata (jsonb) — structured: { prescription: { load, height, distance } }
 *
 * "notes" is a last resort for data that has NO structured field.
 * "metadata.prescription" is the structured home for load, height, distance, etc.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExerciseFamily =
  | "load_reps"       // Barbell/DB lifts: squat, bench, deadlift, row, press
  | "reps_only"       // Bodyweight: pull-up, push-up, dip, chin-up
  | "distance_reps"   // Horizontal jumps: broad jump, triple broad jump, bounds
  | "height_reps"     // Vertical jumps: box jump, depth jump, hurdle jump
  | "throws_reps"     // Med ball throws, rotational slams
  | "time_only"       // Isometric holds: plank, side plank, hollow hold, L-sit
  | "unilateral"      // Single-leg/arm variants with each-side tracking
  | "mobility_flow"   // Warm-up flows: CARs, leg swings, hip circles
  | "conditioning"    // Intervals, sled work (variable schema)
  | "generic";        // Fallback when family is unknown

export interface PrescriptionField {
  /** Logical field name */
  field: "sets" | "reps" | "rest" | "tempo" | "notes" | "load" | "height" | "distance" | "duration" | "repsEachSide";
  /** Physical DB column to write (may differ from logical field) */
  dbColumn: "sets" | "reps" | "rest" | "tempo" | "notes" | "metadata";
  /** Key within metadata.prescription if dbColumn is "metadata" */
  metadataKey?: string;
  /** Accepted units */
  units?: string[];
}

export interface ExerciseFamilySchema {
  family: ExerciseFamily;
  allowedFields: PrescriptionField["field"][];
  preferredFields: PrescriptionField["field"][];
  forbiddenFields: PrescriptionField["field"][];
  /** For unilateral exercises, reps default to "each side" */
  defaultEachSide?: boolean;
  /** Text label shown to user in error messages */
  description: string;
}

// ─── Family Schemas ───────────────────────────────────────────────────────────

const FAMILY_SCHEMAS: Record<ExerciseFamily, ExerciseFamilySchema> = {
  load_reps: {
    family: "load_reps",
    description: "barbell/dumbbell lift",
    allowedFields: ["sets", "reps", "load", "rest", "tempo", "notes"],
    preferredFields: ["sets", "reps", "load", "rest"],
    forbiddenFields: ["height", "distance", "duration"],
    defaultEachSide: false,
  },
  reps_only: {
    family: "reps_only",
    description: "bodyweight exercise",
    allowedFields: ["sets", "reps", "rest", "tempo", "notes"],
    preferredFields: ["sets", "reps", "rest"],
    forbiddenFields: ["load", "height", "distance", "duration"],
    defaultEachSide: false,
  },
  distance_reps: {
    family: "distance_reps",
    description: "horizontal jump/bound",
    allowedFields: ["sets", "reps", "distance", "rest", "notes"],
    preferredFields: ["distance", "reps", "sets", "rest"],
    forbiddenFields: ["load", "height", "duration"],
    defaultEachSide: false,
  },
  height_reps: {
    family: "height_reps",
    description: "vertical jump",
    allowedFields: ["sets", "reps", "height", "rest", "notes"],
    preferredFields: ["height", "reps", "sets", "rest"],
    forbiddenFields: ["load", "distance", "duration"],
    defaultEachSide: false,
  },
  throws_reps: {
    family: "throws_reps",
    description: "med ball throw/slam",
    allowedFields: ["sets", "reps", "load", "rest", "notes"],
    preferredFields: ["reps", "sets", "rest"],
    forbiddenFields: ["height", "distance", "duration"],
    defaultEachSide: false,
  },
  time_only: {
    family: "time_only",
    description: "timed hold/isometric",
    allowedFields: ["sets", "duration", "rest", "notes"],
    preferredFields: ["duration", "sets", "rest"],
    forbiddenFields: ["load", "reps", "height", "distance"],
    defaultEachSide: false,
  },
  unilateral: {
    family: "unilateral",
    description: "single-leg/arm exercise",
    allowedFields: ["sets", "repsEachSide", "reps", "load", "rest", "tempo", "notes"],
    preferredFields: ["sets", "repsEachSide", "rest"],
    forbiddenFields: ["height", "distance", "duration"],
    defaultEachSide: true,
  },
  mobility_flow: {
    family: "mobility_flow",
    description: "mobility/warm-up flow",
    allowedFields: ["sets", "reps", "duration", "rest", "notes"],
    preferredFields: ["reps", "duration"],
    forbiddenFields: ["load", "height", "distance"],
    defaultEachSide: false,
  },
  conditioning: {
    family: "conditioning",
    description: "conditioning/interval work",
    allowedFields: ["sets", "reps", "duration", "distance", "rest", "notes"],
    preferredFields: ["sets", "duration", "distance"],
    forbiddenFields: ["load", "height", "tempo"],
    defaultEachSide: false,
  },
  generic: {
    family: "generic",
    description: "exercise",
    allowedFields: ["sets", "reps", "rest", "tempo", "notes"],
    preferredFields: ["sets", "reps", "rest"],
    forbiddenFields: [],
    defaultEachSide: false,
  },
};

// ─── Exercise Family Classifier ───────────────────────────────────────────────

/**
 * Name-pattern lists for each exercise family.
 * Checked in order — first match wins.
 */
const FAMILY_PATTERNS: Array<{ family: ExerciseFamily; patterns: RegExp[] }> = [
  {
    family: "time_only",
    patterns: [
      /plank/i, /side\s+plank/i, /hollow\s+hold/i, /l.?sit/i,
      /dead\s+bug/i, /iso\s+hold/i, /wall\s+sit/i, /hang/i,
      /carry.*time/i, /farmer.*carry/i, /pallof.*hold/i,
    ],
  },
  {
    family: "distance_reps",
    patterns: [
      /broad\s+jump/i, /triple\s+broad\s+jump/i, /bound/i,
      /horizontal\s+jump/i, /long\s+jump/i, /standing\s+broad/i,
      /lateral\s+bound/i,
    ],
  },
  {
    family: "height_reps",
    patterns: [
      /box\s+jump/i, /depth\s+jump/i, /hurdle\s+jump/i,
      /vertical\s+jump/i, /standing\s+jump/i, /squat\s+jump/i,
    ],
  },
  {
    family: "throws_reps",
    patterns: [
      /med\s+ball/i, /medicine\s+ball/i, /ball\s+slam/i,
      /rotational.*throw/i, /chest\s+pass/i, /overhead\s+slam/i,
    ],
  },
  {
    family: "unilateral",
    patterns: [
      /shrimp\s+squat/i, /rfess/i, /rear\s+foot\s+elevated/i,
      /split\s+squat/i, /bulgarian/i, /single.?leg/i, /sl\s+/i,
      /single.?arm/i, /lateral\s+lunge/i, /reverse\s+lunge/i,
      /step.?up/i, /pistol/i, /single\s+arm/i,
    ],
  },
  {
    family: "reps_only",
    patterns: [
      /pull.?up/i, /chin.?up/i, /push.?up/i, /dip\b/i,
      /ring\s+row/i, /trx/i, /inverted\s+row/i, /bodyweight/i,
      /air\s+squat/i, /nordic/i, /ghr/i,
    ],
  },
  {
    family: "mobility_flow",
    patterns: [
      /car\b/i, /leg\s+swing/i, /hip\s+circle/i, /ankle\s+circle/i,
      /hip\s+flexor/i, /world\s+greatest/i, /inchworm/i, /flow/i,
      /prying/i, /90.90/i,
    ],
  },
  {
    family: "load_reps",
    patterns: [
      /squat/i, /bench/i, /deadlift/i, /press/i, /row/i,
      /rdl/i, /romanian/i, /power\s+clean/i, /clean/i, /snatch/i,
      /jerk/i, /hip\s+thrust/i, /leg\s+press/i, /hack\s+squat/i,
      /trap\s+bar/i, /hex\s+bar/i, /barbell/i, /dumbbell/i, /db\b/i,
      /kettlebell/i, /kb\b/i, /cable/i, /machine/i, /curl/i,
      /extension/i, /fly/i, /raise/i, /pulldown/i, /pullover/i,
      /face\s+pull/i, /good\s+morning/i, /pendlay/i, /bent.?over/i,
      /pallof\s+press/i, /landmine/i,
    ],
  },
];

export function classifyExerciseFamily(exerciseName: string): ExerciseFamily {
  for (const { family, patterns } of FAMILY_PATTERNS) {
    if (patterns.some((p) => p.test(exerciseName))) return family;
  }
  return "generic";
}

export function getExerciseFamilySchema(exerciseName: string): ExerciseFamilySchema {
  return FAMILY_SCHEMAS[classifyExerciseFamily(exerciseName)];
}

// ─── Field Resolution ─────────────────────────────────────────────────────────

export type LogicalField = "reps" | "sets" | "rest" | "load" | "height" | "distance" | "duration" | "repsEachSide" | "tempo";

/** Result of resolving a command to a field */
export interface FieldResolution {
  logicalField: LogicalField;
  /** The DB column to write to */
  dbColumn: "sets" | "reps" | "rest" | "tempo" | "notes" | "metadata";
  /** Key within metadata.prescription if dbColumn === "metadata" */
  metadataKey?: string;
  /** Formatted display value for the field */
  displayValue: string;
  /** Raw numeric value */
  numericValue: number;
  /** Unit string */
  unit: string;
  /** If true, store as "N each side" in reps */
  eachSide?: boolean;
}

export interface FieldForbiddenResult {
  forbidden: true;
  logicalField: LogicalField;
  coachMessage: string;
}

/**
 * Resolve a logical field + value to the correct DB column,
 * validating against the exercise family schema.
 */
export function resolveField(
  logicalField: LogicalField,
  numericValue: number,
  unit: string,
  exerciseName: string,
  eachSide?: boolean
): FieldResolution | FieldForbiddenResult {
  const schema = getExerciseFamilySchema(exerciseName);

  // Check forbidden fields
  if (schema.forbiddenFields.includes(logicalField as any)) {
    return {
      forbidden: true,
      logicalField,
      coachMessage: buildForbiddenMessage(logicalField, exerciseName, schema),
    };
  }

  return buildResolution(logicalField, numericValue, unit, exerciseName, schema, eachSide);
}

function buildForbiddenMessage(
  field: LogicalField,
  exerciseName: string,
  schema: ExerciseFamilySchema
): string {
  const available = schema.allowedFields.filter((f) => f !== "notes").join(", ");
  const messages: Partial<Record<LogicalField, string>> = {
    load: `${exerciseName} is a ${schema.description} — load isn't tracked for this movement. You can change: ${available}.`,
    height: `${exerciseName} is a ${schema.description} — height targets aren't used here. You can change: ${available}.`,
    distance: `${exerciseName} is a ${schema.description} — distance tracking isn't valid for this slot. You can change: ${available}.`,
    duration: `${exerciseName} tracks reps, not time. You can change: ${available}.`,
    reps: `${exerciseName} is time-based — reps don't apply. Try updating the duration instead (e.g. "Make this 30 seconds").`,
  };
  return messages[field] ?? `That field isn't valid for ${exerciseName}. Available fields: ${available}.`;
}

function buildResolution(
  logicalField: LogicalField,
  numericValue: number,
  unit: string,
  exerciseName: string,
  schema: ExerciseFamilySchema,
  eachSide?: boolean
): FieldResolution {
  // Special case: time_only exercises treat "reps" as "duration"
  if (logicalField === "reps" && schema.family === "time_only") {
    const display = formatDuration(numericValue, unit);
    return {
      logicalField: "duration",
      dbColumn: "reps",
      displayValue: display,
      numericValue,
      unit: normalizeDurationUnit(unit),
    };
  }

  // Special case: unilateral exercise reps default to each side
  const effectiveEachSide = eachSide || (logicalField === "reps" && schema.defaultEachSide);

  switch (logicalField) {
    case "sets":
      return { logicalField, dbColumn: "sets", displayValue: `${numericValue}`, numericValue, unit: "count" };

    case "reps":
    case "repsEachSide": {
      const display = effectiveEachSide ? `${numericValue} each side` : `${numericValue}`;
      return { logicalField: effectiveEachSide ? "repsEachSide" : "reps", dbColumn: "reps", displayValue: display, numericValue, unit: "count", eachSide: effectiveEachSide };
    }

    case "rest": {
      const display = formatRest(numericValue, unit);
      return { logicalField, dbColumn: "rest", displayValue: display, numericValue, unit };
    }

    case "tempo":
      return { logicalField, dbColumn: "tempo", displayValue: unit, numericValue, unit };

    case "duration": {
      const display = formatDuration(numericValue, unit);
      return { logicalField, dbColumn: "reps", displayValue: display, numericValue, unit: normalizeDurationUnit(unit) };
    }

    case "distance": {
      const display = formatDistance(numericValue, unit);
      return { logicalField, dbColumn: "metadata", metadataKey: "distance", displayValue: display, numericValue, unit: normalizeDistanceUnit(unit) };
    }

    case "height": {
      const display = formatHeight(numericValue, unit);
      return { logicalField, dbColumn: "metadata", metadataKey: "height", displayValue: display, numericValue, unit: normalizeHeightUnit(unit) };
    }

    case "load": {
      const display = formatLoad(numericValue, unit);
      return { logicalField, dbColumn: "metadata", metadataKey: "load", displayValue: display, numericValue, unit: normalizeLoadUnit(unit) };
    }

    default:
      return { logicalField, dbColumn: "reps", displayValue: `${numericValue}${unit}`, numericValue, unit };
  }
}

// ─── Unit normalizers ─────────────────────────────────────────────────────────

function normalizeDurationUnit(raw: string): string {
  const r = raw.toLowerCase().trim();
  return r.startsWith("min") ? "min" : "s";
}

function normalizeDistanceUnit(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r === "ft" || r.startsWith("feet") || r === "foot") return "ft";
  if (r.startsWith("m") && !r.startsWith("mi")) return "m";
  if (r === "in" || r.startsWith("inch")) return "in";
  return "ft";
}

function normalizeHeightUnit(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r === "in" || r.startsWith("inch")) return "in";
  if (r === "cm" || r.startsWith("cent")) return "cm";
  return "in";
}

function normalizeLoadUnit(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r === "kg" || r.startsWith("kilo")) return "kg";
  return "lb";
}

function formatDuration(value: number, unit: string): string {
  const isMin = normalizeDurationUnit(unit) === "min";
  return isMin ? `${value}min` : `${value}s`;
}

function formatRest(value: number, unit: string): string {
  const r = unit.toLowerCase();
  const isMin = r.startsWith("min") || (!r && value <= 10);
  const seconds = isMin ? value * 60 : value;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds}s`;
}

function formatDistance(value: number, unit: string): string {
  return `${value} ${normalizeDistanceUnit(unit)}`;
}

function formatHeight(value: number, unit: string): string {
  return `${value} ${normalizeHeightUnit(unit)}`;
}

function formatLoad(value: number, unit: string): string {
  return `${value} ${normalizeLoadUnit(unit)}`;
}

// ─── Build DB updates from resolution ────────────────────────────────────────

/**
 * Convert a FieldResolution into the Record<string, unknown> that
 * the edit engine expects as `updates`.
 */
export function resolutionToUpdates(resolution: FieldResolution): Record<string, unknown> {
  if (resolution.dbColumn === "metadata") {
    // Stored in metadata.prescription.<metadataKey>
    // The edit engine merges this into existing metadata
    return {
      [`__prescription_${resolution.metadataKey}`]: resolution.displayValue,
    };
  }
  return { [resolution.dbColumn]: resolution.displayValue };
}
