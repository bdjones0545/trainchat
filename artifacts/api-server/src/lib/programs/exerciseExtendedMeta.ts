/**
 * Exercise Extended Metadata
 *
 * Supplements the existing ExerciseMeta pool entries with additional scoring
 * dimensions needed by the Block Variation Engine:
 *   - family: movement pattern cluster
 *   - complexity: technical demand
 *   - velocityIntent: natural speed intent of the movement
 *   - stabilityDemand: how much balance/stability is required
 *
 * This is a lookup table keyed by exercise name (must match pool entries exactly).
 * When a name is not found, safe defaults are applied.
 */

export interface ExerciseExtendedMeta {
  family: string;
  /**
   * Movement equivalence cluster — a sub-family grouping of exercises that are
   * functionally interchangeable in a given slot (e.g. all bilateral barbell
   * squats, all vertical-pull patterns).  Used by the cluster-alternative-bonus
   * scoring dimension to rotate through equivalents across builds rather than
   * always defaulting to the same archetype exercise.
   *
   * Leave undefined (or use the helper default "unclassified") for exercises
   * where cluster-level rotation is not meaningful.
   */
  equivalenceCluster?: string;
  complexity: "simple" | "moderate" | "complex";
  velocityIntent: "slow_grind" | "moderate" | "ballistic" | "explosive";
  stabilityDemand: "low" | "moderate" | "high";
}

const DEFAULT_EXTENDED: ExerciseExtendedMeta = {
  family: "heavy_bilateral_squat",
  complexity: "moderate",
  velocityIntent: "moderate",
  stabilityDemand: "moderate",
};

export const EXERCISE_EXTENDED_META: Record<string, ExerciseExtendedMeta> = {
  // ── Heavy Bilateral Squat ───────────────────────────────────────────────
  // equivalenceCluster: "bilateral-squat" means all of these are movement-
  // equivalent substitutes for the primary squat slot; the cluster-alternative
  // bonus rotates through them build-over-build.
  "Back Squat":                        { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Front Squat":                       { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Pause Back Squat":                  { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Safety Bar Squat":                  { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Box Squat":                         { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Low-Bar Back Squat":                { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Cambered Bar Squat":                { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Heel-Elevated Back Squat":          { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Zercher Squat":                     { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Hatfield Squat":                    { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  // New bilateral-squat equivalents
  "Belt Squat":                        { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Tempo Back Squat (3-1-1)":          { family: "heavy_bilateral_squat", equivalenceCluster: "bilateral-squat", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  // Machine / isolation (same family, different cluster — not used as primary)
  "Hack Squat (machine)":              { family: "heavy_bilateral_squat", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "low" },
  "Leg Press (as primary)":            { family: "heavy_bilateral_squat", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "low" },

  // ── Goblet / Tempo Squat ───────────────────────────────────────────────
  "Goblet Squat (heavy)":              { family: "goblet_tempo_squat", equivalenceCluster: "goblet-squat", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Heel-Elevated Goblet Squat":        { family: "goblet_tempo_squat", equivalenceCluster: "goblet-squat", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Goblet Squat":                      { family: "goblet_tempo_squat", equivalenceCluster: "goblet-squat", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Tempo Goblet Squat":                { family: "goblet_tempo_squat", equivalenceCluster: "goblet-squat", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "low" },

  // ── Trap Bar ──────────────────────────────────────────────────────────
  "Trap Bar Deadlift (squat-mode, low handles)": { family: "trap_bar", complexity: "moderate", velocityIntent: "moderate", stabilityDemand: "moderate" },
  "Trap Bar Deadlift (low handles)":   { family: "trap_bar", complexity: "moderate", velocityIntent: "moderate", stabilityDemand: "moderate" },
  "Trap Bar Deadlift":                 { family: "trap_bar", complexity: "moderate", velocityIntent: "moderate", stabilityDemand: "moderate" },
  "Hex Bar Deadlift":                  { family: "trap_bar", complexity: "moderate", velocityIntent: "moderate", stabilityDemand: "moderate" },
  "Hex Bar RDL":                       { family: "trap_bar", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Trap Bar Jump":                     { family: "trap_bar", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "low" },
  "Trap Bar Velocity Deadlift":        { family: "trap_bar", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },

  // ── Heavy Bilateral Hinge ─────────────────────────────────────────────
  "Conventional Deadlift":             { family: "heavy_bilateral_hinge", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Sumo Deadlift":                     { family: "heavy_bilateral_hinge", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Rack Pull (from knee)":             { family: "heavy_bilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Snatch-Grip Deadlift":              { family: "heavy_bilateral_hinge", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Romanian Deadlift":                 { family: "heavy_bilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Romanian Deadlift (heavy)":         { family: "heavy_bilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Good Morning":                      { family: "heavy_bilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Dumbbell Romanian Deadlift":        { family: "heavy_bilateral_hinge", complexity: "simple",   velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Kettlebell Deadlift":               { family: "heavy_bilateral_hinge", complexity: "simple",   velocityIntent: "slow_grind",  stabilityDemand: "low" },
  "Barbell Hip Thrust":                { family: "heavy_bilateral_hinge", complexity: "simple",   velocityIntent: "slow_grind",  stabilityDemand: "low" },
  "Hip Thrust (barbell)":              { family: "heavy_bilateral_hinge", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "low" },

  // ── Unilateral Squat ──────────────────────────────────────────────────
  "Bulgarian Split Squat":             { family: "unilateral_squat", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Rear-Foot Elevated Split Squat (RFESS)": { family: "unilateral_squat", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Lateral Step-Up":                   { family: "unilateral_squat", complexity: "moderate", velocityIntent: "moderate",    stabilityDemand: "high" },
  "Single-Leg Squat to Box":           { family: "unilateral_squat", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Reverse Lunge":                     { family: "unilateral_squat", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Lateral Lunge":                     { family: "unilateral_squat", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Walking Lunge (weighted)":          { family: "unilateral_squat", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Cossack Squat":                     { family: "unilateral_squat", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Deficit Reverse Lunge":             { family: "unilateral_squat", complexity: "moderate", velocityIntent: "moderate",    stabilityDemand: "high" },
  "Step-Up with Knee Drive":           { family: "unilateral_squat", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Pistol Squat":                      { family: "unilateral_squat", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Box Step-Up":                       { family: "unilateral_squat", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },

  // ── Unilateral Hinge ──────────────────────────────────────────────────
  "Single-Leg Romanian Deadlift":      { family: "unilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Single-Leg Hip Thrust":             { family: "unilateral_hinge", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Single-Leg Deadlift (KB)":          { family: "unilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Kickstand RDL":                     { family: "unilateral_hinge", complexity: "simple",   velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Single-Leg Good Morning":           { family: "unilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Hip Hinge to Single-Leg RDL":       { family: "unilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Nordics (Nordic Hamstring Curl)":   { family: "unilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Glute-Ham Raise":                   { family: "unilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },

  // ── Plyometric ────────────────────────────────────────────────────────
  "Box Jump":                          { family: "plyometric", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Broad Jump":                        { family: "plyometric", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "low" },
  "Vertical Jump":                     { family: "plyometric", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Depth Drop":                        { family: "plyometric", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Depth Jump":                        { family: "plyometric", complexity: "complex",  velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Box Jump (continuous)":             { family: "plyometric", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "low" },
  "Lateral Box Jump":                  { family: "plyometric", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Split Jump":                        { family: "plyometric", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Squat Jump":                        { family: "plyometric", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Jump Squat":                        { family: "plyometric", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Dynamic Effort Squat":              { family: "plyometric", complexity: "complex",  velocityIntent: "explosive",  stabilityDemand: "high" },
  "Power Clean (from floor)":          { family: "plyometric", complexity: "complex",  velocityIntent: "explosive",  stabilityDemand: "high" },
  "Hang Power Clean":                  { family: "plyometric", complexity: "complex",  velocityIntent: "explosive",  stabilityDemand: "high" },
  "Hang Power Snatch":                 { family: "plyometric", complexity: "complex",  velocityIntent: "explosive",  stabilityDemand: "high" },
  "Push Press":                        { family: "plyometric", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },

  // ── Elastic / Reactive ────────────────────────────────────────────────
  "Pogo Jumps":                        { family: "elastic_reactive", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Ankle Hop":                         { family: "elastic_reactive", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Hurdle Hops":                       { family: "elastic_reactive", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Linear Bounds":                     { family: "elastic_reactive", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "low" },
  "Skip Drills":                       { family: "elastic_reactive", complexity: "simple",   velocityIntent: "ballistic",  stabilityDemand: "low" },
  "A-Skip":                            { family: "elastic_reactive", complexity: "simple",   velocityIntent: "ballistic",  stabilityDemand: "low" },
  "B-Skip":                            { family: "elastic_reactive", complexity: "moderate", velocityIntent: "ballistic",  stabilityDemand: "low" },
  "Single-Leg Pogo":                   { family: "elastic_reactive", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Lateral Bound":                     { family: "elastic_reactive", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Stiff-Leg Bound":                   { family: "elastic_reactive", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "low" },
  "Reactive Bound Series":             { family: "elastic_reactive", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "low" },
  "Triple Extension Sprint Drill":     { family: "elastic_reactive", complexity: "complex",  velocityIntent: "explosive",  stabilityDemand: "low" },

  // ── Ballistic / Med Ball ──────────────────────────────────────────────
  "Med Ball Scoop Toss":               { family: "ballistic", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Med Ball Overhead Slam":            { family: "ballistic", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Med Ball Rotational Throw":         { family: "ballistic", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "moderate" },
  "Rotational Med Ball Slam":          { family: "ballistic", complexity: "moderate", velocityIntent: "explosive",  stabilityDemand: "low" },
  "Med Ball Chest Pass":               { family: "ballistic", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Overhead Med Ball Throw":           { family: "ballistic", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },

  // ── Upper Horizontal Push ─────────────────────────────────────────────
  "Barbell Bench Press":               { family: "upper_horizontal_push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "DB Bench Press":                    { family: "upper_horizontal_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Incline Barbell Press":             { family: "upper_horizontal_push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Incline DB Press":                  { family: "upper_horizontal_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Close-Grip Bench":                  { family: "upper_horizontal_push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Push-Up (weighted)":                { family: "upper_horizontal_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Dumbbell Floor Press":              { family: "upper_horizontal_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Machine Chest Press":               { family: "upper_horizontal_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Cable Fly":                         { family: "upper_horizontal_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Bench Press":                       { family: "upper_horizontal_push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Dumbbell Press (flat)":             { family: "upper_horizontal_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },

  // ── Upper Vertical Push ───────────────────────────────────────────────
  "Overhead Press (barbell)":          { family: "upper_vertical_push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Dumbbell Overhead Press":           { family: "upper_vertical_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "high" },
  "Landmine Press":                    { family: "upper_vertical_push", complexity: "moderate", velocityIntent: "moderate",   stabilityDemand: "high" },
  "Seated DB Press":                   { family: "upper_vertical_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Arnold Press":                      { family: "upper_vertical_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "high" },
  "Z-Press":                           { family: "upper_vertical_push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Push Press (barbell)":              { family: "upper_vertical_push", complexity: "moderate", velocityIntent: "ballistic",  stabilityDemand: "moderate" },

  // ── Upper Horizontal Pull ─────────────────────────────────────────────
  // equivalenceCluster: "horizontal-pull" — all are movement-equivalent for
  // the horizontal-pull slot; cluster-alternative bonus rotates through them.
  "Barbell Row":                       { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Barbell Bent-Over Row":             { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Dumbbell Row":                      { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Cable Row":                         { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Seated Cable Row":                  { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Chest-Supported Row":               { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Chest-Supported Dumbbell Row":      { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Pendlay Row":                       { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Seal Row":                          { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Dumbbell Seal Row":                 { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Kroc Row":                          { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Meadows Row":                       { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "T-Bar Row":                         { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Single-Arm Dumbbell Row":           { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Half-Kneeling Cable Pull":          { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "TRX Row":                           { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Inverted Row":                      { family: "upper_horizontal_pull", equivalenceCluster: "horizontal-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },

  // ── Upper Vertical Pull ───────────────────────────────────────────────
  // equivalenceCluster: "vertical-pull" — all are movement-equivalent for the
  // vertical-pull slot (chin-over-bar or cable lat-to-chest pattern).
  "Pull-Up":                           { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "moderate", velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Chin-Up":                           { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "moderate", velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Weighted Pull-Up":                  { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Weighted Chin-Up":                  { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Lat Pulldown":                      { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Lat Pulldown (heavy)":              { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "moderate", velocityIntent: "moderate",   stabilityDemand: "low" },
  "Wide-Grip Lat Pulldown":            { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Single-Arm Lat Pulldown":           { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Neutral-Grip Pull-Up":              { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "moderate", velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Band-Assisted Pull-Up":             { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  // New vertical-pull equivalents
  "Banded Pull-Up":                    { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "moderate", velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Ring Pull-Up":                      { family: "upper_vertical_pull", equivalenceCluster: "vertical-pull", complexity: "complex",  velocityIntent: "moderate",   stabilityDemand: "high" },

  // ── Trunk Stability ───────────────────────────────────────────────────
  "Pallof Press":                      { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Cable Pallof Press":                { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Band Pallof Press":                 { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Dead Bug":                          { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Ab Wheel":                          { family: "trunk_stability", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "RKC Plank":                         { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Copenhagen Plank":                  { family: "trunk_stability", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Half-Kneeling Pallof Press":        { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Stir the Pot":                      { family: "trunk_stability", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Prone Plank":                       { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Hollow Body Hold":                  { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "L-Sit (box)":                       { family: "trunk_stability", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Suitcase Carry":                    { family: "trunk_stability", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "high" },
  "Farmers Carry":                     { family: "trunk_stability", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Tall-Kneeling Pallof Press":        { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Standing Anti-Rotation Press":      { family: "trunk_stability", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Landmine Anti-Rotation":            { family: "trunk_stability", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Cable Lift":                        { family: "trunk_stability", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "high" },

  // ── Rotational ────────────────────────────────────────────────────────
  "Landmine Rotation":                 { family: "rotational", complexity: "moderate", velocityIntent: "ballistic",  stabilityDemand: "moderate" },
  "Cable Woodchop":                    { family: "rotational", complexity: "simple",   velocityIntent: "ballistic",  stabilityDemand: "moderate" },
  "Band Rotation":                     { family: "rotational", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Rotational Cable Press":            { family: "rotational", complexity: "simple",   velocityIntent: "ballistic",  stabilityDemand: "moderate" },
  "MB Side Slam":                      { family: "rotational", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Thoracic Rotation Drill":           { family: "rotational", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "moderate" },

  // ── Conditioning ──────────────────────────────────────────────────────
  "Sled Push":                         { family: "conditioning", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "KB Swing":                          { family: "conditioning", complexity: "moderate", velocityIntent: "ballistic",  stabilityDemand: "moderate" },
  "Assault Bike":                      { family: "conditioning", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Battle Ropes":                      { family: "conditioning", complexity: "simple",   velocityIntent: "ballistic",  stabilityDemand: "low" },
  "Sled Pull":                         { family: "conditioning", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Kettlebell Swing":                  { family: "conditioning", complexity: "moderate", velocityIntent: "ballistic",  stabilityDemand: "moderate" },
  "Sprint Repeats":                    { family: "conditioning", complexity: "simple",   velocityIntent: "explosive",  stabilityDemand: "low" },
  "Row Ergometer Intervals":           { family: "conditioning", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Medicine Ball Circuit":             { family: "conditioning", complexity: "simple",   velocityIntent: "ballistic",  stabilityDemand: "low" },

  // ── Positional / Arm Care ─────────────────────────────────────────────
  "Face Pull":                         { family: "positional", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Band Pull-Apart":                   { family: "positional", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "External Rotation (band)":          { family: "positional", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Wall Slides":                       { family: "positional", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Side-Lying External Rotation":      { family: "positional", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Prone Y-T-W":                       { family: "positional", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Scapular Push-Up":                  { family: "positional", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "moderate" },

  // ── Isolation / Accessory ─────────────────────────────────────────────
  "Bicep Curl":                        { family: "isolation_accessory", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Tricep Pushdown":                   { family: "isolation_accessory", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Lateral Raise":                     { family: "isolation_accessory", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Calf Raise":                        { family: "isolation_accessory", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Leg Curl":                          { family: "isolation_accessory", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Leg Extension":                     { family: "isolation_accessory", complexity: "simple", velocityIntent: "slow_grind", stabilityDemand: "low" },
};

/**
 * Look up extended metadata for an exercise by name.
 * Returns safe defaults if the exercise is not found.
 */
export function getExerciseExtendedMeta(exerciseName: string): ExerciseExtendedMeta {
  return EXERCISE_EXTENDED_META[exerciseName] ?? DEFAULT_EXTENDED;
}

/** Get the family tag for an exercise. */
export function getExerciseFamily(exerciseName: string): string {
  return EXERCISE_EXTENDED_META[exerciseName]?.family ?? "heavy_bilateral_squat";
}

/**
 * Get the movement equivalence cluster for an exercise.
 * Returns "unclassified" when the exercise has no cluster assigned — the
 * cluster-alternative-bonus scoring dimension ignores "unclassified" candidates
 * so the signal is additive only for exercises with explicit cluster assignments.
 */
export function getEquivalenceCluster(exerciseName: string): string {
  return EXERCISE_EXTENDED_META[exerciseName]?.equivalenceCluster ?? "unclassified";
}
