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

  // ── Sport Fit Tags (Phase 2) ──────────────────────────────────────────────
  // These extend the existing metadata safely. All fields are optional.
  // When present, they power the scoreSportFit() engine.
  // When absent, the scorer falls back to family/intentTags.

  /**
   * Primary athletic qualities this exercise develops.
   * Values map to demand dimensions in SportDemandProfile.
   *
   * Examples: "acceleration", "lateral_decel", "rotation_power",
   * "anti_rotation", "elastic_stiffness", "overhead_stability",
   * "unilateral_balance", "grip_endurance", "trunk_stiffness",
   * "reactive_footwork", "cod", "max_velocity"
   */
  movementQualities?: string[];

  /**
   * Joints / tissues primarily loaded by this exercise.
   * Used to match against SportDemandProfile.injuryBias for
   * injury-prevention scoring.
   *
   * Examples: "ankle_stiffness", "knee_dominant", "hip_dominant",
   * "shoulder_stability", "elbow_load", "wrist_forearm", "lumbar_control",
   * "hamstring"
   */
  jointDemands?: string[];

  /**
   * Energy systems this exercise trains.
   * Examples: "alactic", "glycolytic", "aerobic", "repeat_sprint"
   */
  energySystemTags?: string[];

  /**
   * Sport transfer tags — high-level bridge labels between exercise
   * qualities and sport performance concepts.
   * Examples: "first_step", "sprint_mechanics", "reactive_speed",
   * "tackle_resilience", "court_coverage", "arm_care"
   */
  transferTags?: string[];

  /**
   * Sports this exercise has particular relevance for.
   * Used as a supplemental signal when demand profile scoring is ambiguous.
   * Examples: "pickleball", "cricket_bowler", "flag_football"
   */
  sportTags?: string[];
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
  // equivalenceCluster "deadlift-pattern" groups conventional/sumo/trap bar —
  // heavy axial-load pulling patterns that are functionally interchangeable as
  // a primary strength hinge.
  // equivalenceCluster "rdl-pattern" groups all hip-hinge knee-soft patterns —
  // used for cross-family saturation: if bilateral RDL is already selected,
  // the movementClusterPenalty will also suppress unilateral RDL variants
  // (SLRDL, Kickstand RDL) in the same build call.
  "Conventional Deadlift":             { family: "heavy_bilateral_hinge", equivalenceCluster: "deadlift-pattern", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Sumo Deadlift":                     { family: "heavy_bilateral_hinge", equivalenceCluster: "deadlift-pattern", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Rack Pull (from knee)":             { family: "heavy_bilateral_hinge", equivalenceCluster: "deadlift-pattern", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Snatch-Grip Deadlift":              { family: "heavy_bilateral_hinge", equivalenceCluster: "deadlift-pattern", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Romanian Deadlift":                 { family: "heavy_bilateral_hinge", equivalenceCluster: "rdl-pattern",      complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Romanian Deadlift (heavy)":         { family: "heavy_bilateral_hinge", equivalenceCluster: "rdl-pattern",      complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Good Morning":                      { family: "heavy_bilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Dumbbell Romanian Deadlift":        { family: "heavy_bilateral_hinge", equivalenceCluster: "rdl-pattern",      complexity: "simple",   velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Kettlebell Deadlift":               { family: "heavy_bilateral_hinge", complexity: "simple",   velocityIntent: "slow_grind",  stabilityDemand: "low" },
  // hip-thrust-pattern cluster bridges bilateral and unilateral hip thrust —
  // same cross-family saturation logic as rdl-pattern.
  "Barbell Hip Thrust":                { family: "heavy_bilateral_hinge", equivalenceCluster: "hip-thrust-pattern", complexity: "simple",   velocityIntent: "slow_grind",  stabilityDemand: "low" },
  "Hip Thrust (barbell)":              { family: "heavy_bilateral_hinge", equivalenceCluster: "hip-thrust-pattern", complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "low" },

  // ── Unilateral Squat ──────────────────────────────────────────────────
  // Three sub-clusters by movement archetype:
  //   split-squat-pattern: rear-foot-elevated / true split squat positions
  //   lunge-pattern:       traveling or fixed lunge with frontal knee flexion
  //   step-up-pattern:     concentric-led ascending step movements
  // Cluster-alternative bonus promotes rotation between archetypes build-over-build.
  "Bulgarian Split Squat":             { family: "unilateral_squat", equivalenceCluster: "split-squat-pattern", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Rear-Foot Elevated Split Squat (RFESS)": { family: "unilateral_squat", equivalenceCluster: "split-squat-pattern", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Single-Leg Squat to Box":           { family: "unilateral_squat", equivalenceCluster: "split-squat-pattern", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Pistol Squat":                      { family: "unilateral_squat", equivalenceCluster: "split-squat-pattern", complexity: "complex",  velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Reverse Lunge":                     { family: "unilateral_squat", equivalenceCluster: "lunge-pattern",       complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Lateral Lunge":                     { family: "unilateral_squat", equivalenceCluster: "lunge-pattern",       complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Walking Lunge (weighted)":          { family: "unilateral_squat", equivalenceCluster: "lunge-pattern",       complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Deficit Reverse Lunge":             { family: "unilateral_squat", equivalenceCluster: "lunge-pattern",       complexity: "moderate", velocityIntent: "moderate",    stabilityDemand: "high" },
  "Cossack Squat":                     { family: "unilateral_squat", equivalenceCluster: "lunge-pattern",       complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Lateral Step-Up":                   { family: "unilateral_squat", equivalenceCluster: "step-up-pattern",     complexity: "moderate", velocityIntent: "moderate",    stabilityDemand: "high" },
  "Step-Up with Knee Drive":           { family: "unilateral_squat", equivalenceCluster: "step-up-pattern",     complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Box Step-Up":                       { family: "unilateral_squat", equivalenceCluster: "step-up-pattern",     complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },

  // ── Unilateral Hinge ──────────────────────────────────────────────────
  // rdl-pattern cluster shared with bilateral RDL variants — so if
  // Romanian Deadlift is already selected in the bilateral hinge slot,
  // SLRDL and Kickstand RDL receive a movementClusterPenalty in the same
  // build call, steering the unilateral slot toward more distinct patterns.
  "Single-Leg Romanian Deadlift":      { family: "unilateral_hinge", equivalenceCluster: "rdl-pattern",          complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Single-Leg Hip Thrust":             { family: "unilateral_hinge", equivalenceCluster: "hip-thrust-pattern",   complexity: "simple",   velocityIntent: "moderate",    stabilityDemand: "moderate" },
  "Single-Leg Deadlift (KB)":          { family: "unilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Kickstand RDL":                     { family: "unilateral_hinge", equivalenceCluster: "rdl-pattern",      complexity: "simple",   velocityIntent: "slow_grind",  stabilityDemand: "moderate" },
  "Single-Leg Good Morning":           { family: "unilateral_hinge", complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
  "Hip Hinge to Single-Leg RDL":       { family: "unilateral_hinge", equivalenceCluster: "rdl-pattern",      complexity: "moderate", velocityIntent: "slow_grind",  stabilityDemand: "high" },
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
  // horizontal-push cluster: rotation bonus drives build-to-build variation
  // (Bench Press one block, Incline DB Press the next, etc.)
  "Barbell Bench Press":               { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "DB Bench Press":                    { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Incline Barbell Press":             { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Incline DB Press":                  { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Close-Grip Bench":                  { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Push-Up (weighted)":                { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Dumbbell Floor Press":              { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Machine Chest Press":               { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Cable Fly":                         { family: "upper_horizontal_push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Bench Press":                       { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "low" },
  "Dumbbell Press (flat)":             { family: "upper_horizontal_push", equivalenceCluster: "horizontal-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },

  // ── Upper Vertical Push ───────────────────────────────────────────────
  // vertical-push cluster: same rotation-bonus logic for OHP variants.
  // Push Press (barbell) is also here — it is physically an OHP with a leg
  // drive assist; it belongs in this family. The "Push Press" entry in the
  // plyometric section is a naming inconsistency and should not be confused
  // with this — they are tagged separately by familiy intent.
  "Overhead Press (barbell)":          { family: "upper_vertical_push", equivalenceCluster: "vertical-push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Dumbbell Overhead Press":           { family: "upper_vertical_push", equivalenceCluster: "vertical-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "high" },
  "Landmine Press":                    { family: "upper_vertical_push", equivalenceCluster: "vertical-push", complexity: "moderate", velocityIntent: "moderate",   stabilityDemand: "high" },
  "Seated DB Press":                   { family: "upper_vertical_push", equivalenceCluster: "vertical-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "low" },
  "Arnold Press":                      { family: "upper_vertical_push", equivalenceCluster: "vertical-push", complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "high" },
  "Z-Press":                           { family: "upper_vertical_push", equivalenceCluster: "vertical-push", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Push Press (barbell)":              { family: "upper_vertical_push", equivalenceCluster: "vertical-push", complexity: "moderate", velocityIntent: "ballistic",  stabilityDemand: "moderate" },

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
  // Clusters enable library-driven week-role rotation within each archetype:
  //   anti-extension-trunk  : supine/prone stability (Dead Bug, Plank, Ab Wheel)
  //   anti-rotation-trunk   : lateral stiffness / Pallof family
  //   loaded-carry          : locomotion-under-load (Farmers, Suitcase)
  //   lateral-trunk         : unilateral adductor/abductor stiffness (Copenhagen)
  "Dead Bug":                          { family: "trunk_stability", equivalenceCluster: "anti-extension-trunk", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Hollow Body Hold":                  { family: "trunk_stability", equivalenceCluster: "anti-extension-trunk", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "Prone Plank":                       { family: "trunk_stability", equivalenceCluster: "anti-extension-trunk", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "moderate" },
  "RKC Plank":                         { family: "trunk_stability", equivalenceCluster: "anti-extension-trunk", complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Ab Wheel":                          { family: "trunk_stability", equivalenceCluster: "anti-extension-trunk", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Stir the Pot":                      { family: "trunk_stability", equivalenceCluster: "anti-extension-trunk", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "L-Sit (box)":                       { family: "trunk_stability", equivalenceCluster: "anti-extension-trunk", complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Pallof Press":                      { family: "trunk_stability", equivalenceCluster: "anti-rotation-trunk",  complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Cable Pallof Press":                { family: "trunk_stability", equivalenceCluster: "anti-rotation-trunk",  complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Band Pallof Press":                 { family: "trunk_stability", equivalenceCluster: "anti-rotation-trunk",  complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Half-Kneeling Pallof Press":        { family: "trunk_stability", equivalenceCluster: "anti-rotation-trunk",  complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Tall-Kneeling Pallof Press":        { family: "trunk_stability", equivalenceCluster: "anti-rotation-trunk",  complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Standing Anti-Rotation Press":      { family: "trunk_stability", equivalenceCluster: "anti-rotation-trunk",  complexity: "simple",   velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Landmine Anti-Rotation":            { family: "trunk_stability", equivalenceCluster: "anti-rotation-trunk",  complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },
  "Farmers Carry":                     { family: "trunk_stability", equivalenceCluster: "loaded-carry",         complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "moderate" },
  "Suitcase Carry":                    { family: "trunk_stability", equivalenceCluster: "loaded-carry",         complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "high" },
  "Cable Lift":                        { family: "trunk_stability", equivalenceCluster: "loaded-carry",         complexity: "simple",   velocityIntent: "moderate",   stabilityDemand: "high" },
  "Copenhagen Plank":                  { family: "trunk_stability", equivalenceCluster: "lateral-trunk",        complexity: "moderate", velocityIntent: "slow_grind", stabilityDemand: "high" },

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

// ─── Sport Quality Tag Enrichment ────────────────────────────────────────────
//
// Adds movementQualities, jointDemands, energySystemTags, transferTags, and
// sportTags to exercises without touching any existing field.
//
// This table is the authoritative source for sport-fit scoring metadata.
// Add new exercises here as the library grows — no existing entry needs
// to be modified.
//
// Keyed by exercise name (must match EXERCISE_EXTENDED_META or DB name exactly).

export const EXERCISE_SPORT_TAGS: Record<string, Partial<ExerciseExtendedMeta>> = {

  // ── Lateral / Reactive Exercises ─────────────────────────────────────────
  "Lateral Bound": {
    movementQualities: ["lateral_decel", "elastic_stiffness", "cod", "unilateral_balance"],
    jointDemands: ["ankle_stiffness", "hip_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["court_coverage", "reactive_speed"],
  },
  "Single-Leg Pogo": {
    movementQualities: ["elastic_stiffness", "reactive_footwork", "unilateral_balance"],
    jointDemands: ["ankle_stiffness"],
    energySystemTags: ["alactic"],
    transferTags: ["reactive_speed", "court_coverage"],
  },
  "Pogo Jumps": {
    movementQualities: ["elastic_stiffness", "reactive_footwork"],
    jointDemands: ["ankle_stiffness"],
    energySystemTags: ["alactic"],
    transferTags: ["reactive_speed"],
  },
  "Hurdle Hops": {
    movementQualities: ["elastic_stiffness", "reactive_footwork", "deceleration"],
    jointDemands: ["ankle_stiffness", "knee_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["reactive_speed"],
  },
  "Ankle Hop": {
    movementQualities: ["elastic_stiffness", "reactive_footwork"],
    jointDemands: ["ankle_stiffness"],
    energySystemTags: ["alactic"],
    transferTags: ["reactive_speed"],
  },
  "Lateral Box Jump": {
    movementQualities: ["lateral_decel", "elastic_stiffness", "cod", "acceleration"],
    jointDemands: ["ankle_stiffness", "knee_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["court_coverage", "reactive_speed"],
  },
  "Reactive Bound Series": {
    movementQualities: ["elastic_stiffness", "reactive_footwork", "lateral_decel", "cod"],
    jointDemands: ["ankle_stiffness"],
    energySystemTags: ["alactic"],
    transferTags: ["reactive_speed", "court_coverage"],
  },
  "Depth Jump": {
    movementQualities: ["elastic_stiffness", "deceleration", "acceleration"],
    jointDemands: ["ankle_stiffness", "knee_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["reactive_speed"],
  },
  "Depth Drop": {
    movementQualities: ["deceleration", "elastic_stiffness"],
    jointDemands: ["ankle_stiffness", "knee_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["reactive_speed"],
  },
  "Linear Bounds": {
    movementQualities: ["elastic_stiffness", "acceleration"],
    jointDemands: ["ankle_stiffness", "hip_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["sprint_mechanics"],
  },
  "Triple Extension Sprint Drill": {
    movementQualities: ["acceleration", "max_velocity", "elastic_stiffness"],
    jointDemands: ["ankle_stiffness", "hip_dominant", "hamstring"],
    energySystemTags: ["alactic"],
    transferTags: ["sprint_mechanics"],
  },
  "A-Skip": {
    movementQualities: ["acceleration", "elastic_stiffness"],
    jointDemands: ["ankle_stiffness"],
    energySystemTags: ["alactic"],
    transferTags: ["sprint_mechanics"],
  },
  "B-Skip": {
    movementQualities: ["max_velocity", "elastic_stiffness"],
    jointDemands: ["ankle_stiffness", "hamstring"],
    energySystemTags: ["alactic"],
    transferTags: ["sprint_mechanics"],
  },

  // ── Plyometric Exercises ──────────────────────────────────────────────────
  "Box Jump": {
    movementQualities: ["acceleration", "elastic_stiffness"],
    jointDemands: ["knee_dominant", "ankle_stiffness"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step"],
  },
  "Broad Jump": {
    movementQualities: ["acceleration", "elastic_stiffness"],
    jointDemands: ["hip_dominant", "knee_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["sprint_mechanics", "first_step"],
  },
  "Squat Jump": {
    movementQualities: ["acceleration", "elastic_stiffness"],
    jointDemands: ["knee_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step"],
  },
  "Jump Squat": {
    movementQualities: ["acceleration", "elastic_stiffness"],
    jointDemands: ["knee_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step"],
  },
  "Split Jump": {
    movementQualities: ["elastic_stiffness", "unilateral_balance", "deceleration"],
    jointDemands: ["knee_dominant", "hip_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step"],
  },
  "Power Clean (from floor)": {
    movementQualities: ["acceleration", "elastic_stiffness", "max_velocity"],
    jointDemands: ["hip_dominant", "ankle_stiffness", "lumbar_control"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step", "sprint_mechanics"],
  },
  "Hang Power Clean": {
    movementQualities: ["acceleration", "elastic_stiffness"],
    jointDemands: ["hip_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step"],
  },

  // ── Rotational / Anti-Rotation ────────────────────────────────────────────
  "Med Ball Rotational Throw": {
    movementQualities: ["rotation_power", "elastic_stiffness"],
    jointDemands: ["lumbar_control", "hip_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["swing_power", "strike_power"],
    sportTags: ["baseball", "golf", "cricket", "boxing", "mma"],
  },
  "Rotational Med Ball Slam": {
    movementQualities: ["rotation_power", "anti_rotation"],
    jointDemands: ["lumbar_control"],
    energySystemTags: ["alactic"],
    transferTags: ["swing_power", "strike_power"],
    sportTags: ["baseball", "golf", "boxing"],
  },
  "Med Ball Scoop Toss": {
    movementQualities: ["rotation_power", "acceleration"],
    jointDemands: ["hip_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step", "swing_power"],
  },
  "Landmine Rotation": {
    movementQualities: ["rotation_power", "anti_rotation", "trunk_stiffness"],
    jointDemands: ["lumbar_control"],
    energySystemTags: ["alactic"],
    transferTags: ["swing_power"],
    sportTags: ["baseball", "golf", "bowling", "cricket"],
  },
  "Cable Woodchop": {
    movementQualities: ["rotation_power", "anti_rotation"],
    jointDemands: ["lumbar_control"],
    energySystemTags: ["alactic"],
    transferTags: ["swing_power"],
    sportTags: ["golf", "baseball", "bowling"],
  },
  "MB Side Slam": {
    movementQualities: ["rotation_power"],
    jointDemands: ["lumbar_control"],
    energySystemTags: ["alactic"],
    transferTags: ["swing_power"],
  },

  // ── Anti-Rotation / Trunk Stability ───────────────────────────────────────
  "Pallof Press": {
    movementQualities: ["anti_rotation", "trunk_stiffness"],
    jointDemands: ["lumbar_control"],
    energySystemTags: [],
    transferTags: ["tackle_resilience", "contact_readiness"],
    sportTags: ["pickleball", "golf", "bowling", "wrestling"],
  },
  "Half-Kneeling Pallof Press": {
    movementQualities: ["anti_rotation", "trunk_stiffness", "unilateral_balance"],
    jointDemands: ["lumbar_control", "hip_stability"],
    energySystemTags: [],
    transferTags: ["tackle_resilience"],
  },
  "Tall-Kneeling Pallof Press": {
    movementQualities: ["anti_rotation", "trunk_stiffness"],
    jointDemands: ["lumbar_control"],
    energySystemTags: [],
    transferTags: ["tackle_resilience"],
  },
  "Standing Anti-Rotation Press": {
    movementQualities: ["anti_rotation", "trunk_stiffness"],
    jointDemands: ["lumbar_control"],
    energySystemTags: [],
    transferTags: ["tackle_resilience"],
  },
  "Landmine Anti-Rotation": {
    movementQualities: ["anti_rotation", "trunk_stiffness", "rotation_power"],
    jointDemands: ["lumbar_control"],
    energySystemTags: [],
    transferTags: ["tackle_resilience"],
  },
  "Suitcase Carry": {
    movementQualities: ["anti_rotation", "trunk_stiffness", "grip_endurance", "unilateral_balance"],
    jointDemands: ["lumbar_control", "wrist_forearm"],
    energySystemTags: ["aerobic"],
    transferTags: ["tackle_resilience", "contact_readiness"],
    sportTags: ["bowling", "wrestling", "mma"],
  },
  "Farmers Carry": {
    movementQualities: ["trunk_stiffness", "grip_endurance", "anti_rotation"],
    jointDemands: ["wrist_forearm", "lumbar_control"],
    energySystemTags: ["aerobic"],
    transferTags: ["tackle_resilience"],
    sportTags: ["wrestling", "rugby", "mma"],
  },
  "Dead Bug": {
    movementQualities: ["anti_rotation", "trunk_stiffness"],
    jointDemands: ["lumbar_control"],
    energySystemTags: [],
    transferTags: ["contact_readiness"],
  },
  "Copenhagen Plank": {
    movementQualities: ["anti_rotation", "unilateral_balance", "trunk_stiffness"],
    jointDemands: ["hip_dominant", "hip_stability"],
    energySystemTags: [],
    transferTags: ["court_coverage", "groin_resilience"],
    sportTags: ["pickleball", "badminton", "squash", "soccer", "hockey"],
  },

  // ── Unilateral Lower Body ─────────────────────────────────────────────────
  "Lateral Lunge": {
    movementQualities: ["lateral_decel", "cod", "unilateral_balance"],
    jointDemands: ["hip_dominant", "knee_dominant", "hip_stability"],
    energySystemTags: [],
    transferTags: ["court_coverage", "reactive_speed"],
    sportTags: ["pickleball", "badminton", "squash", "padel"],
  },
  "Cossack Squat": {
    movementQualities: ["lateral_decel", "unilateral_balance", "cod"],
    jointDemands: ["hip_dominant", "hip_stability", "knee_dominant"],
    energySystemTags: [],
    transferTags: ["court_coverage", "groin_resilience"],
    sportTags: ["pickleball", "badminton", "squash"],
  },
  "Single-Leg Romanian Deadlift": {
    movementQualities: ["unilateral_balance", "deceleration"],
    jointDemands: ["hamstring", "hip_dominant"],
    energySystemTags: [],
    transferTags: ["reactive_speed", "sprint_mechanics"],
  },
  "Kickstand RDL": {
    movementQualities: ["unilateral_balance", "deceleration"],
    jointDemands: ["hamstring", "hip_dominant"],
    energySystemTags: [],
    transferTags: ["sprint_mechanics"],
  },
  "Single-Leg Hip Thrust": {
    movementQualities: ["unilateral_balance"],
    jointDemands: ["hip_dominant", "hamstring"],
    energySystemTags: [],
    transferTags: ["first_step"],
  },
  "Bulgarian Split Squat": {
    movementQualities: ["unilateral_balance", "deceleration"],
    jointDemands: ["knee_dominant", "hip_dominant"],
    energySystemTags: [],
    transferTags: ["first_step", "sprint_mechanics"],
  },
  "Rear-Foot Elevated Split Squat (RFESS)": {
    movementQualities: ["unilateral_balance", "deceleration"],
    jointDemands: ["knee_dominant", "hip_dominant"],
    energySystemTags: [],
    transferTags: ["first_step", "sprint_mechanics"],
  },
  "Pistol Squat": {
    movementQualities: ["unilateral_balance", "deceleration", "elastic_stiffness"],
    jointDemands: ["knee_dominant", "ankle_stiffness"],
    energySystemTags: [],
    transferTags: ["court_coverage"],
  },
  "Step-Up with Knee Drive": {
    movementQualities: ["unilateral_balance", "acceleration"],
    jointDemands: ["knee_dominant", "hip_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step"],
  },

  // ── Hamstring / Posterior Chain ───────────────────────────────────────────
  "Nordics (Nordic Hamstring Curl)": {
    movementQualities: ["deceleration"],
    jointDemands: ["hamstring"],
    energySystemTags: [],
    transferTags: ["sprint_mechanics", "reactive_speed"],
    sportTags: ["flag_football", "soccer", "lacrosse", "rugby"],
  },
  "Glute-Ham Raise": {
    movementQualities: ["deceleration"],
    jointDemands: ["hamstring", "hip_dominant"],
    energySystemTags: [],
    transferTags: ["sprint_mechanics"],
  },
  "Romanian Deadlift": {
    movementQualities: ["deceleration", "trunk_stiffness"],
    jointDemands: ["hamstring", "lumbar_control"],
    energySystemTags: [],
    transferTags: ["sprint_mechanics"],
  },
  "Romanian Deadlift (heavy)": {
    movementQualities: ["deceleration", "trunk_stiffness"],
    jointDemands: ["hamstring", "lumbar_control"],
    energySystemTags: [],
    transferTags: ["sprint_mechanics"],
  },

  // ── Overhead / Shoulder ───────────────────────────────────────────────────
  "Overhead Press (barbell)": {
    movementQualities: ["overhead_stability"],
    jointDemands: ["shoulder_stability"],
    energySystemTags: [],
    transferTags: ["arm_care"],
  },
  "Dumbbell Overhead Press": {
    movementQualities: ["overhead_stability"],
    jointDemands: ["shoulder_stability"],
    energySystemTags: [],
    transferTags: ["arm_care"],
    sportTags: ["volleyball", "badminton", "cricket_bowler"],
  },
  "Landmine Press": {
    movementQualities: ["overhead_stability", "anti_rotation"],
    jointDemands: ["shoulder_stability"],
    energySystemTags: [],
    transferTags: ["arm_care"],
    sportTags: ["volleyball", "baseball_pitcher", "cricket_bowler"],
  },
  "Face Pull": {
    movementQualities: ["overhead_stability"],
    jointDemands: ["shoulder_stability", "elbow_load"],
    energySystemTags: [],
    transferTags: ["arm_care"],
    sportTags: ["volleyball", "cricket_bowler", "baseball_pitcher", "pickleball"],
  },
  "Band Pull-Apart": {
    movementQualities: ["overhead_stability"],
    jointDemands: ["shoulder_stability"],
    energySystemTags: [],
    transferTags: ["arm_care"],
  },
  "External Rotation (band)": {
    movementQualities: ["overhead_stability"],
    jointDemands: ["shoulder_stability", "elbow_load"],
    energySystemTags: [],
    transferTags: ["arm_care"],
    sportTags: ["volleyball", "cricket_bowler", "baseball_pitcher", "pickleball", "padel"],
  },
  "Prone Y-T-W": {
    movementQualities: ["overhead_stability"],
    jointDemands: ["shoulder_stability"],
    energySystemTags: [],
    transferTags: ["arm_care"],
  },

  // ── Grip / Forearm ────────────────────────────────────────────────────────
  "Farmers Carry": {
    movementQualities: ["trunk_stiffness", "grip_endurance", "anti_rotation"],
    jointDemands: ["wrist_forearm", "lumbar_control"],
    energySystemTags: ["aerobic"],
    transferTags: ["tackle_resilience"],
    sportTags: ["wrestling", "rugby", "mma"],
  },

  // ── Conditioning / Sprint ─────────────────────────────────────────────────
  "Sprint Repeats": {
    movementQualities: ["acceleration", "max_velocity", "repeat_sprint"],
    jointDemands: ["hamstring", "ankle_stiffness"],
    energySystemTags: ["alactic", "repeat_sprint"],
    transferTags: ["sprint_mechanics", "first_step"],
    sportTags: ["flag_football", "soccer", "lacrosse", "rugby", "basketball"],
  },
  "Sled Push": {
    movementQualities: ["acceleration", "trunk_stiffness"],
    jointDemands: ["hip_dominant", "knee_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["first_step", "sprint_mechanics"],
    sportTags: ["flag_football", "football", "rugby"],
  },
  "Sled Pull": {
    movementQualities: ["acceleration", "deceleration"],
    jointDemands: ["hip_dominant"],
    energySystemTags: ["alactic"],
    transferTags: ["sprint_mechanics"],
  },
  "KB Swing": {
    movementQualities: ["elastic_stiffness", "rotation_power", "anti_rotation"],
    jointDemands: ["hip_dominant", "lumbar_control"],
    energySystemTags: ["alactic", "repeat_sprint"],
    transferTags: ["first_step"],
  },
};

/**
 * Look up extended metadata for an exercise by name.
 * Merges base structural metadata with sport quality tags.
 * Returns safe defaults if the exercise is not found.
 */
export function getExerciseExtendedMeta(exerciseName: string): ExerciseExtendedMeta {
  const base = EXERCISE_EXTENDED_META[exerciseName] ?? DEFAULT_EXTENDED;
  const sportTags = EXERCISE_SPORT_TAGS[exerciseName];
  if (!sportTags) return base;
  return { ...base, ...sportTags };
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
