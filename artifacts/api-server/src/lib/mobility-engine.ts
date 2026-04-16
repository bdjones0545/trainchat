/**
 * TrainChat Mobility & Movement Support Engine
 *
 * Phase 7 Intelligence Upgrade — Mobility, flexibility, activation, tissue
 * tolerance, and movement-support programming.
 *
 * Fills the gap between strength/conditioning work and complete coaching:
 * - Movement prep and warm-up design
 * - Mobility and flexibility prescription
 * - Activation and primer work
 * - Tissue tolerance and resilience support
 * - Recovery and restoration programming
 * - Sport-specific movement quality integration
 *
 * Architecture note: follows the same pattern as re-entry-engine.ts and
 * conditioning-engine.ts — independent of OpenAI, injected into the system
 * prompt via buildMobilityContext().
 */

// ─── Category Types ───────────────────────────────────────────────────────────

export type MovementSupportCategory =
  | "mobility"              // Active range-of-motion development
  | "flexibility"           // Passive/static tissue length
  | "activation"            // Neuromuscular firing and priming
  | "tissue_tolerance"      // Tendon/fascial load management
  | "positional_stability"  // End-range control and joint stability
  | "recovery_restoration"  // Post-session or recovery-day work
  | "movement_prep"         // Pre-session warm-up architecture
  | "cooldown_downregulation"; // Post-session nervous system downregulation

// ─── Body Region Tags ─────────────────────────────────────────────────────────

export type BodyRegion =
  | "ankle"
  | "foot"
  | "calf"
  | "knee"
  | "hip"
  | "adductor"
  | "hamstring"
  | "glute"
  | "quad"
  | "lumbar"
  | "thoracic_spine"
  | "shoulder"
  | "scapular"
  | "rotator_cuff"
  | "trunk"
  | "wrist"
  | "elbow"
  | "neck"
  | "full_body";

// ─── Purpose Tags ─────────────────────────────────────────────────────────────

export type MovementSupportPurpose =
  | "pre_lift_prep"          // Before a strength/hypertrophy session
  | "sprint_prep"            // Before speed/power work
  | "upper_body_prep"        // Before upper-body dominant sessions
  | "lower_body_prep"        // Before lower-body dominant sessions
  | "landing_decel_prep"     // Before deceleration / landing tasks
  | "overhead_prep"          // Before overhead lifting or throwing
  | "post_session_recovery"  // After main training sessions
  | "reentry_support"        // During re-entry / return-to-training
  | "inseason_support"       // In-season maintenance / recovery
  | "sport_resilience"       // Sport-specific tissue support
  | "warmup"                 // General warm-up context
  | "cooldown";              // General cooldown context

// ─── Session Placement ───────────────────────────────────────────────────────

export type SessionPlacement =
  | "warmup_block"          // Start of session (always)
  | "primer_before_main"    // Just before the first primary lift
  | "between_set_filler"    // Between working sets (low fatigue cost)
  | "accessory_support"     // In the accessory block
  | "finisher"              // End of session
  | "recovery_day"          // Standalone recovery session
  | "cooldown_block";       // End of session — wind-down only

// ─── Dosage Types ────────────────────────────────────────────────────────────

export type DosageType = "reps" | "seconds" | "breaths" | "distance" | "rounds";

// ─── Intensity Level ─────────────────────────────────────────────────────────

export type IntensityLevel = "passive" | "low" | "moderate" | "challenging";

// ─── Movement Support Exercise Entry ─────────────────────────────────────────

export interface MovementSupportExercise {
  name: string;
  category: MovementSupportCategory;
  bodyRegions: BodyRegion[];
  purposes: MovementSupportPurpose[];
  dosageType: DosageType;
  defaultDosage: string;           // e.g. "30 sec", "10 reps", "5 breaths"
  sessionPlacement: SessionPlacement[];
  equipment: string[];             // "none", "band", "foam_roller", "lacrosse_ball", etc.
  intensityLevel: IntensityLevel;
  sportTags: string[];             // sport keys this drill particularly benefits
  coachingNote: string;
  progressionOf?: string;          // easier version this progresses from
  regressionOf?: string;           // harder version this regresses from
}

// ─── Movement Support Exercise Library ───────────────────────────────────────

export const MOVEMENT_SUPPORT_LIBRARY: MovementSupportExercise[] = [

  // ── ANKLE / FOOT ──
  {
    name: "Ankle Circles",
    category: "mobility",
    bodyRegions: ["ankle", "foot"],
    purposes: ["pre_lift_prep", "lower_body_prep", "sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "10 each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "basketball", "track", "football"],
    coachingNote: "Slow and full — maximize ROM before loading the ankle joint.",
  },
  {
    name: "Ankle Banded Dorsiflexion Mobilization",
    category: "mobility",
    bodyRegions: ["ankle"],
    purposes: ["pre_lift_prep", "lower_body_prep", "reentry_support", "warmup"],
    dosageType: "reps",
    defaultDosage: "10–15 reps each side",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["band"],
    intensityLevel: "low",
    sportTags: ["soccer", "basketball", "football", "track"],
    coachingNote: "Drive the knee over the third toe — feel the front-of-ankle restriction release. Critical before any squat-pattern work.",
  },
  {
    name: "Single-Leg Calf Raise",
    category: "tissue_tolerance",
    bodyRegions: ["calf", "ankle"],
    purposes: ["sport_resilience", "reentry_support", "inseason_support"],
    dosageType: "reps",
    defaultDosage: "3 × 15 slow tempo",
    sessionPlacement: ["accessory_support", "finisher", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "basketball", "track", "volleyball"],
    coachingNote: "3-second eccentric, 1-second hold at bottom. Builds Achilles tendon resilience — critical for court and field athletes.",
    regressionOf: "Weighted Single-Leg Calf Raise",
  },
  {
    name: "Weighted Single-Leg Calf Raise",
    category: "tissue_tolerance",
    bodyRegions: ["calf", "ankle"],
    purposes: ["sport_resilience", "inseason_support"],
    dosageType: "reps",
    defaultDosage: "3 × 12–15 with load",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["dumbbell", "barbell"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "basketball", "track", "volleyball"],
    coachingNote: "Full ROM — from full stretch to full contraction. Isoinertial Achilles load management.",
    progressionOf: "Single-Leg Calf Raise",
  },

  // ── HIP MOBILITY ──
  {
    name: "Hip 90/90 Stretch",
    category: "flexibility",
    bodyRegions: ["hip", "adductor", "glute"],
    purposes: ["pre_lift_prep", "lower_body_prep", "post_session_recovery", "reentry_support", "cooldown"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each side",
    sessionPlacement: ["warmup_block", "cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball", "hockey"],
    coachingNote: "Sit tall — anterior pelvic tilt to load the hip capsule, not the lumbar spine. Best hip mobility drill for most athletes.",
  },
  {
    name: "Hip Flexor Lunge Stretch",
    category: "flexibility",
    bodyRegions: ["hip", "quad"],
    purposes: ["pre_lift_prep", "lower_body_prep", "sprint_prep", "warmup", "cooldown"],
    dosageType: "seconds",
    defaultDosage: "30–45 sec each side",
    sessionPlacement: ["warmup_block", "cooldown_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Posterior pelvic tilt before the reach — if the pelvis dumps forward, you're stretching the lumbar, not the hip flexor.",
  },
  {
    name: "World's Greatest Stretch",
    category: "movement_prep",
    bodyRegions: ["hip", "thoracic_spine", "adductor", "shoulder"],
    purposes: ["pre_lift_prep", "lower_body_prep", "warmup", "sprint_prep"],
    dosageType: "reps",
    defaultDosage: "5 reps each side",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["football", "soccer", "basketball", "rugby", "lacrosse"],
    coachingNote: "Lunge, rotate, reach, extend — each position should be held briefly. A full-body prep movement in 5 reps per side.",
  },
  {
    name: "Deep Squat Hip Circle",
    category: "mobility",
    bodyRegions: ["hip", "ankle", "knee"],
    purposes: ["pre_lift_prep", "lower_body_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "8–10 each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "football", "basketball"],
    coachingNote: "Feet flat on the floor — ankles are the limiting factor for most athletes. Slow circles that cover the full hip arc.",
  },
  {
    name: "Lateral Band Walk",
    category: "activation",
    bodyRegions: ["glute", "hip", "knee"],
    purposes: ["pre_lift_prep", "lower_body_prep", "landing_decel_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "15–20 steps each direction",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["band"],
    intensityLevel: "low",
    sportTags: ["basketball", "soccer", "football", "volleyball"],
    coachingNote: "Maintain athletic stance — slight hip hinge throughout. Fires the posterior glute, which is often inhibited before athletic loading.",
  },
  {
    name: "Glute Bridge with Isometric Hold",
    category: "activation",
    bodyRegions: ["glute", "hip", "lumbar"],
    purposes: ["pre_lift_prep", "lower_body_prep", "reentry_support", "warmup"],
    dosageType: "seconds",
    defaultDosage: "3 × 10 sec holds",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Drive through heels, posterior pelvic tilt at top, hold. Activates glute max before hinge or squat patterns.",
  },
  {
    name: "Hip Airplane",
    category: "positional_stability",
    bodyRegions: ["hip", "glute", "knee"],
    purposes: ["landing_decel_prep", "sport_resilience", "reentry_support"],
    dosageType: "reps",
    defaultDosage: "8 each side",
    sessionPlacement: ["warmup_block", "accessory_support"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "basketball", "football", "track", "lacrosse"],
    coachingNote: "Single-leg balance with controlled hip rotation — builds mediolateral hip stability critical for deceleration and cutting.",
  },

  // ── ADDUCTOR / GROIN ──
  {
    name: "Adductor Rockback",
    category: "mobility",
    bodyRegions: ["adductor", "hip"],
    purposes: ["pre_lift_prep", "lower_body_prep", "sport_resilience", "warmup"],
    dosageType: "reps",
    defaultDosage: "8–10 each side",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "hockey", "basketball", "football"],
    coachingNote: "Slow rock into adductor stretch — feel the inner thigh load. Key for athletes in wide-stance or multi-directional sports.",
  },
  {
    name: "Copenhagen Plank",
    category: "tissue_tolerance",
    bodyRegions: ["adductor", "hip", "trunk"],
    purposes: ["sport_resilience", "inseason_support", "reentry_support"],
    dosageType: "seconds",
    defaultDosage: "3 × 10–20 sec each side",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["none"],
    intensityLevel: "challenging",
    sportTags: ["soccer", "hockey", "basketball", "football", "lacrosse"],
    coachingNote: "The gold-standard adductor injury prevention drill. Start with the short-lever version (bent knee). Load the adductor against gravity — not momentum.",
    regressionOf: "Long-Lever Copenhagen Plank",
  },
  {
    name: "Long-Lever Copenhagen Plank",
    category: "tissue_tolerance",
    bodyRegions: ["adductor", "hip", "trunk"],
    purposes: ["sport_resilience", "inseason_support"],
    dosageType: "seconds",
    defaultDosage: "3 × 15–30 sec each side",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["none"],
    intensityLevel: "challenging",
    sportTags: ["soccer", "hockey", "football", "lacrosse"],
    coachingNote: "Full straight-leg version — highest adductor demand. Use when short-lever variant is controlled for 20+ sec.",
    progressionOf: "Copenhagen Plank",
  },
  {
    name: "Groin Squeeze Isometric",
    category: "activation",
    bodyRegions: ["adductor"],
    purposes: ["pre_lift_prep", "sport_resilience", "reentry_support", "warmup"],
    dosageType: "seconds",
    defaultDosage: "5 × 5 sec squeezes",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "hockey"],
    coachingNote: "Lying on back, knees bent, squeeze a ball or your fists between your knees. Adductor pre-activation before lower body work.",
  },

  // ── HAMSTRING ──
  {
    name: "Nordic Hamstring Curl",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "knee"],
    purposes: ["sport_resilience", "inseason_support", "reentry_support"],
    dosageType: "reps",
    defaultDosage: "3 × 5–8 reps",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["none"],
    intensityLevel: "challenging",
    sportTags: ["soccer", "football", "basketball", "track", "rugby"],
    coachingNote: "The most evidence-backed hamstring injury prevention exercise. Control the fall slowly (3–5 sec) — do not flop. Start with 3–5 reps per set. Critical for sprint-sport athletes.",
    regressionOf: "Assisted Nordic Hamstring Curl",
  },
  {
    name: "Assisted Nordic Hamstring Curl",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "knee"],
    purposes: ["sport_resilience", "reentry_support"],
    dosageType: "reps",
    defaultDosage: "3 × 6–10 reps",
    sessionPlacement: ["accessory_support"],
    equipment: ["band"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Band assists the eccentric. Use until you can control the fall without support. Progress to unassisted over 4–6 weeks.",
    progressionOf: "Nordic Hamstring Curl",
  },
  {
    name: "Standing Hamstring Stretch",
    category: "flexibility",
    bodyRegions: ["hamstring"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "seconds",
    defaultDosage: "30–60 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Post-session or recovery day only — static stretching before a session reduces hamstring power output. Neutral spine throughout.",
  },
  {
    name: "Banded Leg Curl (Lying)",
    category: "activation",
    bodyRegions: ["hamstring", "knee"],
    purposes: ["pre_lift_prep", "lower_body_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "12–15 reps",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["band"],
    intensityLevel: "low",
    sportTags: ["soccer", "football", "basketball"],
    coachingNote: "Light resistance — activates the distal hamstring before squats or hip hinges. Not a strength exercise, a primer.",
  },

  // ── THORACIC SPINE ──
  {
    name: "Thoracic Spine Rotation",
    category: "mobility",
    bodyRegions: ["thoracic_spine", "shoulder"],
    purposes: ["pre_lift_prep", "upper_body_prep", "overhead_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "10 each side",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball", "golf", "soccer", "football", "basketball"],
    coachingNote: "Seated or quadruped — lock the lumbar out of it with hip positioning. Thoracic rotation, not lumbar rotation.",
  },
  {
    name: "Thoracic Extension Over Foam Roller",
    category: "mobility",
    bodyRegions: ["thoracic_spine"],
    purposes: ["pre_lift_prep", "upper_body_prep", "overhead_prep", "warmup", "post_session_recovery"],
    dosageType: "reps",
    defaultDosage: "8–10 extensions, 3–4 segments",
    sessionPlacement: ["warmup_block", "cooldown_block", "recovery_day"],
    equipment: ["foam_roller"],
    intensityLevel: "passive",
    sportTags: ["baseball", "volleyball", "basketball", "football"],
    coachingNote: "Place roller perpendicular to spine — work each segment from T4 to T10. Breathe out as you extend. Critical for overhead and pressing athletes.",
  },
  {
    name: "Cat-Cow",
    category: "movement_prep",
    bodyRegions: ["thoracic_spine", "lumbar", "trunk"],
    purposes: ["pre_lift_prep", "warmup", "reentry_support", "post_session_recovery"],
    dosageType: "reps",
    defaultDosage: "10–15 slow reps",
    sessionPlacement: ["warmup_block", "cooldown_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: [],
    coachingNote: "Slow and deliberate — exhale into flexion, inhale into extension. Spine articulation drill, not a strength movement.",
  },
  {
    name: "Quadruped Thoracic Rotation",
    category: "mobility",
    bodyRegions: ["thoracic_spine", "shoulder"],
    purposes: ["pre_lift_prep", "upper_body_prep", "overhead_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "10 each side",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Lock the lumbar by sitting back slightly — thread the needle, then rotate up to open the thorax. Feel the rotation at mid-back.",
  },

  // ── SHOULDER / SCAPULAR ──
  {
    name: "Band Pull-Apart",
    category: "activation",
    bodyRegions: ["scapular", "rotator_cuff", "shoulder"],
    purposes: ["pre_lift_prep", "upper_body_prep", "overhead_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "2–3 × 15–20 reps",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["band"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball", "football"],
    coachingNote: "Retract scapulae — don't let the shoulders shrug. Arms near parallel to the ground. Essential pre-pressing and pre-throwing activation.",
  },
  {
    name: "Scapular Wall Slide",
    category: "activation",
    bodyRegions: ["scapular", "shoulder"],
    purposes: ["pre_lift_prep", "upper_body_prep", "overhead_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "10–15 reps",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Elbows and wrists against the wall — slow slide up and down, maintaining contact throughout. Activates lower trap and serratus.",
  },
  {
    name: "Internal/External Rotation with Band",
    category: "activation",
    bodyRegions: ["rotator_cuff", "shoulder"],
    purposes: ["pre_lift_prep", "upper_body_prep", "overhead_prep", "warmup", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "15–20 each direction",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["band"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball", "football"],
    coachingNote: "Elbow fixed at 90° — this is a pre-activation drill, not a strengthening set. Light band, controlled tempo.",
  },
  {
    name: "Shoulder CARs (Controlled Articular Rotations)",
    category: "mobility",
    bodyRegions: ["shoulder", "scapular"],
    purposes: ["pre_lift_prep", "upper_body_prep", "overhead_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "5 slow circles each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Maximal active ROM — no momentum, just controlled circumduction of the glenohumeral joint. The shoulder equivalent of ankle circles.",
  },
  {
    name: "Sleeper Stretch",
    category: "flexibility",
    bodyRegions: ["rotator_cuff", "shoulder"],
    purposes: ["post_session_recovery", "cooldown", "sport_resilience", "inseason_support"],
    dosageType: "seconds",
    defaultDosage: "2–3 × 30 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Side-lying, apply gentle over-pressure to internal rotation. Evidence-based for posterior shoulder capsule tightness in overhead athletes.",
  },

  // ── TRUNK / CORE STABILITY ──
  {
    name: "Dead Bug",
    category: "positional_stability",
    bodyRegions: ["trunk", "lumbar"],
    purposes: ["pre_lift_prep", "reentry_support", "warmup"],
    dosageType: "reps",
    defaultDosage: "5–8 each side",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: [],
    coachingNote: "Lumbar pressed into the floor throughout — if the low back lifts, you've gone past your control range. Reduce ROM, not speed.",
  },
  {
    name: "Bird Dog",
    category: "positional_stability",
    bodyRegions: ["trunk", "lumbar", "glute"],
    purposes: ["pre_lift_prep", "reentry_support", "warmup"],
    dosageType: "reps",
    defaultDosage: "8 each side",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: [],
    coachingNote: "Spine neutral — no rotation, no hip drop. Slow extension with a 2-second hold. Builds anti-rotation and anti-extension simultaneously.",
  },
  {
    name: "Plank Hold",
    category: "positional_stability",
    bodyRegions: ["trunk", "shoulder", "lumbar"],
    purposes: ["pre_lift_prep", "reentry_support", "warmup"],
    dosageType: "seconds",
    defaultDosage: "3 × 20–40 sec",
    sessionPlacement: ["warmup_block", "accessory_support"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: [],
    coachingNote: "Hollow body — ribcage pulled toward hips. Don't let the hips hike up or the low back sag. Quality over duration.",
  },
  {
    name: "Pallof Press",
    category: "positional_stability",
    bodyRegions: ["trunk"],
    purposes: ["pre_lift_prep", "sport_resilience", "warmup"],
    dosageType: "reps",
    defaultDosage: "3 × 10 each side",
    sessionPlacement: ["warmup_block", "accessory_support"],
    equipment: ["band", "cable"],
    intensityLevel: "moderate",
    sportTags: ["baseball", "soccer", "football", "basketball"],
    coachingNote: "Anti-rotation under load — resist the pull, don't fight it dramatically. The point is quiet spinal control under tension.",
  },

  // ── WRIST / ELBOW ──
  {
    name: "Wrist Circles and Extension Stretch",
    category: "mobility",
    bodyRegions: ["wrist", "elbow"],
    purposes: ["pre_lift_prep", "upper_body_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "10 circles each direction, 20–30 sec stretch",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Both flexion and extension stretches — especially important before barbell pressing or Olympic lifting. Never skip on heavy press days.",
  },
  {
    name: "Forearm Flexor Stretch",
    category: "flexibility",
    bodyRegions: ["wrist", "elbow"],
    purposes: ["post_session_recovery", "cooldown", "sport_resilience"],
    dosageType: "seconds",
    defaultDosage: "30 sec each arm",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball"],
    coachingNote: "Arm extended, palm up, gently dorsiflex the wrist. Post-session in throwing or gripping athletes.",
  },

  // ── FULL BODY / GENERAL PREP ──
  {
    name: "General Movement Warm-Up (5 min)",
    category: "movement_prep",
    bodyRegions: ["full_body"],
    purposes: ["warmup", "pre_lift_prep"],
    dosageType: "rounds",
    defaultDosage: "1 round × 5 minutes",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: [],
    coachingNote: "Light aerobic raise (jog, bike, jump rope) + 5–10 min of joint circles and basic mobility. Elevates tissue temperature before targeted prep work.",
  },
  {
    name: "Foam Roller Thoracic / Glute / Calf",
    category: "recovery_restoration",
    bodyRegions: ["thoracic_spine", "glute", "calf"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec per region",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["foam_roller"],
    intensityLevel: "passive",
    sportTags: [],
    coachingNote: "Slow rolling — pause on tender spots for 5–10 sec. Not a structural tissue change, but improves mobility and parasympathetic recovery response.",
  },
  {
    name: "Diaphragmatic Breathing",
    category: "cooldown_downregulation",
    bodyRegions: ["trunk", "full_body"],
    purposes: ["post_session_recovery", "cooldown"],
    dosageType: "breaths",
    defaultDosage: "10 slow breaths (5 sec in, 7 sec out)",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: [],
    coachingNote: "Supine, one hand on chest, one on belly. Belly rises first. Extended exhale engages the parasympathetic system — true nervous system downregulation.",
  },
  {
    name: "Child's Pose",
    category: "cooldown_downregulation",
    bodyRegions: ["lumbar", "thoracic_spine", "hip", "shoulder"],
    purposes: ["post_session_recovery", "cooldown"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: [],
    coachingNote: "Arms extended overhead or along sides — both load different structures. Spinal decompression and passive hip flexion. Excellent session finisher.",
  },
  {
    name: "Pigeon Pose (Hip Opener)",
    category: "flexibility",
    bodyRegions: ["hip", "glute", "adductor"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball"],
    coachingNote: "Post-session or recovery day only. Hip ER and posterior capsule. If hip replacement or labral history — use supine figure-4 instead.",
  },

  // ── NECK / CERVICAL ──
  {
    name: "Cervical Rotation Stretch",
    category: "flexibility",
    bodyRegions: ["neck"],
    purposes: ["pre_lift_prep", "upper_body_prep", "warmup", "post_session_recovery"],
    dosageType: "seconds",
    defaultDosage: "20–30 sec each side",
    sessionPlacement: ["warmup_block", "cooldown_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["football", "rugby", "baseball"],
    coachingNote: "Slow active rotation to end range — no overpressure. For athletes in contact sports or those who sleep in poor positions. Never force neck rotation.",
  },
  {
    name: "Cervical Lateral Flexion Stretch",
    category: "flexibility",
    bodyRegions: ["neck", "shoulder"],
    purposes: ["pre_lift_prep", "upper_body_prep", "warmup", "post_session_recovery"],
    dosageType: "seconds",
    defaultDosage: "20–30 sec each side",
    sessionPlacement: ["warmup_block", "cooldown_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["football", "rugby", "baseball"],
    coachingNote: "Ear toward shoulder — let gravity do the work, no pulling the head down. Depress the opposite shoulder to increase the upper trap stretch.",
  },
  {
    name: "Chin Tuck (Cervical Retraction)",
    category: "activation",
    bodyRegions: ["neck", "thoracic_spine"],
    purposes: ["pre_lift_prep", "upper_body_prep", "reentry_support", "warmup"],
    dosageType: "reps",
    defaultDosage: "10–15 reps, 2 sec hold each",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball", "football", "volleyball"],
    coachingNote: "Double chin cue — draw the head straight back, not down. Counteracts forward head posture from desk work and sport. Activates deep neck flexors.",
  },
  {
    name: "Upper Trap / Levator Scapulae Stretch",
    category: "flexibility",
    bodyRegions: ["neck", "shoulder", "scapular"],
    purposes: ["pre_lift_prep", "upper_body_prep", "post_session_recovery", "cooldown"],
    dosageType: "seconds",
    defaultDosage: "30 sec each side",
    sessionPlacement: ["warmup_block", "cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball", "volleyball", "football"],
    coachingNote: "Seated, hand behind back, lateral flex and slight rotation to feel the stretch in the back of the neck and top of the shoulder. Critical for overhead athletes with chronic neck tension.",
  },

  // ── SPRINT PREP / MOVEMENT QUALITY ──
  {
    name: "Forward Leg Swing",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "glute"],
    purposes: ["sprint_prep", "lower_body_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "15–20 each leg",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Standing on one leg, swing freely forward and back — relaxed at first, gradually increasing amplitude. Groove hip flexion and extension in the sagittal plane before sprinting.",
  },
  {
    name: "Lateral Leg Swing",
    category: "movement_prep",
    bodyRegions: ["hip", "adductor", "glute"],
    purposes: ["sprint_prep", "lower_body_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "15–20 each leg",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["track", "soccer", "football", "basketball", "lacrosse"],
    coachingNote: "Swing across the body and out to the side — progressively wider arcs. Mobilizes the hip in the frontal plane, critical for multi-directional athletes.",
  },
  {
    name: "High Knee March",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "calf"],
    purposes: ["sprint_prep", "lower_body_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "2 × 20 m",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Hip to 90°, dorsiflexed foot, tall posture — arm drive mirrors the leg pattern. Drills sprint posture and hip flexor activation at slow speed before transitioning to skips.",
  },
  {
    name: "A-Skip",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "calf", "knee"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "2–3 × 20 m",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Rhythmic skip pattern with high knee drive and quick ground contact. Teaches sprint posture and ankle stiffness. Progress from march to skip when posture is stable.",
    progressionOf: "High Knee March",
  },
  {
    name: "B-Skip",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "2 × 20 m",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "A-skip with hamstring pawback — extend the knee forward then claw back to the ground. Teaches the backside sprint mechanics. Only add when A-skip technique is solid.",
    progressionOf: "A-Skip",
  },
  {
    name: "Pogo Hop (Ankle Stiffness Drill)",
    category: "activation",
    bodyRegions: ["ankle", "calf", "foot"],
    purposes: ["sprint_prep", "landing_decel_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "3 × 15–20 hops",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "basketball", "football", "volleyball"],
    coachingNote: "Minimal knee bend — drive from the ankle and foot, not the knee. Quick ground contact, springy. Builds the ankle stiffness and tendon elasticity needed for efficient sprinting.",
  },
  {
    name: "Wall Drill (Sprint Acceleration Posture)",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "trunk"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "3 × 5 each leg",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["track", "soccer", "football"],
    coachingNote: "Lean into the wall at 45°, drive alternating knees while maintaining a rigid body line. Drills triple extension and acceleration posture before speed work.",
  },
  {
    name: "Linear Sprint Build-Up",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "3 × 40–60 m, building to 80% max velocity",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Start at 50% effort, accelerate gradually to 80% by the end. Never use this as a performance run — it is tissue temperature and CNS prep before top-speed work.",
  },

  // ── SKIP VARIATIONS ──
  {
    name: "C-Skip",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "knee"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "2–3 × 20 m",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Full leg cycle through the flight path — high knee drive, full extension forward, then pawback to the ground. The C-skip is the final drill in the A→B→C series and closest to actual max velocity mechanics. Only use when B-skip is consistent.",
    progressionOf: "B-Skip",
  },
  {
    name: "Power Skip for Height",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "calf", "glute", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "2–3 × 20 m",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "basketball", "volleyball", "football", "soccer"],
    coachingNote: "Max triple extension on every skip — drive the knee up explosively while pushing off the planted foot through ankle, knee, and hip. The goal is maximum vertical displacement per skip, not covering ground quickly. Arm drive matches leg power.",
  },
  {
    name: "Power Skip for Distance",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "hamstring", "glute", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "2–3 × 30 m",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "football", "soccer", "basketball"],
    coachingNote: "Project forward — drive the free knee forward and up while extending the planted leg completely. Covers the most horizontal distance per skip. Bridges the gap between bounding and skipping. A-skip is the posture drill; this is the power expression of it.",
  },

  // ── WALL DRILL VARIATIONS ──
  {
    name: "Wall March (Hip Drive Isolation)",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "trunk"],
    purposes: ["sprint_prep", "warmup", "lower_body_prep"],
    dosageType: "reps",
    defaultDosage: "3 × 8 slow alternating drives each leg",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Hands on the wall, body at 45°, slow and deliberate — drive one knee up to 90° while the standing leg maintains rigid triple extension. The slowest version of wall work. Teaches posture and hip drive in complete isolation before adding speed.",
  },
  {
    name: "Single-Leg Rapid Fire Wall Drive",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "calf", "trunk"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "3 × 10–15 fast drives each leg",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "football"],
    coachingNote: "Same wall lean as the standard wall drill — drive one leg up and down as fast as possible while the opposite leg stays planted and rigid. Trains ground contact speed and hip flexor rate of force development without full sprint demand. Reset posture between sets.",
    progressionOf: "Wall Drill (Sprint Acceleration Posture)",
  },
  {
    name: "Wall Series (March → Skip → Switch)",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "trunk", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "2–3 rounds: 5 march + 5 skip + 5 switch per leg",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Complete sequence: slow march drives → skip rhythm at the wall → switch leg drill (alternating mid-air). The full wall series in one block. Most efficient pre-sprint warm-up protocol — covers posture, rhythm, and reactive speed in 5 minutes. Used by sprint coaches before any speed session.",
  },

  // ── SWITCH DRILLS ──
  {
    name: "Scissor Jump (Switch Leg Bound)",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "knee", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "3 × 6–8 total switches",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "basketball", "football", "volleyball"],
    coachingNote: "Start in a split stance, jump and switch legs mid-air, land softly in opposite split. Each landing absorbs force through heel-to-toe contact with both legs — no stiff-knee landings. The fundamental switch drill. Builds reactive leg-cycle coordination and landing mechanics simultaneously.",
  },
  {
    name: "Standing Quick Switch",
    category: "movement_prep",
    bodyRegions: ["ankle", "hip", "knee", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "3 × 10–15 sec continuous switching",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Split position, rapidly alternate feet as fast as possible — minimize flight time and ground contact time. The speed focus version of the scissor jump. Trains leg cycle frequency and fast-twitch ground contact. Keep upper body tall and arms driving.",
    progressionOf: "Scissor Jump (Switch Leg Bound)",
  },
  {
    name: "Lateral Quick Switch",
    category: "movement_prep",
    bodyRegions: ["ankle", "hip", "adductor", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "3 × 5–6 shuffles into a switch each direction",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "basketball", "football", "lacrosse", "tennis"],
    coachingNote: "2–3 shuffle steps, then a sharp plant and switch direction — cut off the outside foot. Transitions from linear switch mechanics into COD prep. The bridge between standing switch drills and reactive change-of-direction training.",
    progressionOf: "Standing Quick Switch",
  },

  // ── BOUNDING VARIATIONS ──
  {
    name: "Ankling",
    category: "movement_prep",
    bodyRegions: ["ankle", "foot", "calf"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "3 × 20–30 m",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["track", "soccer", "basketball", "football"],
    coachingNote: "Fast, tiny hops forward using only the ankle — knees barely bend, hips stay level. Purely a tendon elasticity and ground contact speed drill. Progression from stationary pogo hops to over-ground ankling. Used in elite sprint warm-ups to build the elastic stiffness that makes all other drills more efficient.",
    progressionOf: "Pogo Hop (Ankle Stiffness Drill)",
  },
  {
    name: "Triple Bound",
    category: "movement_prep",
    bodyRegions: ["hip", "knee", "ankle", "glute", "hamstring", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "3–4 × 3 consecutive bounds per leg",
    sessionPlacement: ["primer_before_main", "warmup_block"],
    equipment: ["none"],
    intensityLevel: "high",
    sportTags: ["track", "football", "soccer", "basketball"],
    coachingNote: "Three consecutive single-leg hops for maximum total distance — drive arm aggressively, full triple extension each hop. Classic power test used in combine prep and track protocols. Measures unilateral explosive output and single-leg landing ability simultaneously. Both legs tested separately.",
  },
  {
    name: "Continuous Bounds for Distance",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "glute", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "3–4 × 5–6 consecutive alternating bounds",
    sessionPlacement: ["primer_before_main", "warmup_block"],
    equipment: ["none"],
    intensityLevel: "high",
    sportTags: ["track", "football", "soccer", "basketball"],
    coachingNote: "5–6 consecutive alternating bounds with the focus on maximum horizontal distance per bound. Measure total distance across the sequence. Far more demanding than isolated bounds — the accumulated fatigue reveals single-leg power under repeated demand, which is exactly what sprinting asks for.",
    progressionOf: "Alternating Bounds",
  },

  // ── FOOTWORK & COD DRILLS ──
  {
    name: "Carioca (Standard)",
    category: "movement_prep",
    bodyRegions: ["hip", "adductor", "glute", "ankle", "full_body"],
    purposes: ["sprint_prep", "warmup", "lower_body_prep"],
    dosageType: "distance",
    defaultDosage: "3 × 20–30 m each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "football", "basketball", "lacrosse", "tennis", "track"],
    coachingNote: "Lateral movement with front crossover — lead leg crosses in front of the trail leg alternately. Stay tall, hips rotate smoothly, eyes and shoulders face forward. The foundational lateral footwork drill. Establishes hip rotation, adductor mobility, and lateral coordination before any speed work.",
  },
  {
    name: "Carioca (Back-Crossover)",
    category: "movement_prep",
    bodyRegions: ["hip", "adductor", "glute", "ankle", "thoracic_spine"],
    purposes: ["sprint_prep", "warmup", "lower_body_prep"],
    dosageType: "distance",
    defaultDosage: "3 × 20–30 m each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "football", "basketball", "lacrosse", "tennis", "track"],
    coachingNote: "Rear foot crosses behind the lead leg — opposite pattern to the standard Carioca. Greater demand on hip external rotation and thoracic rotation. Athletes often have a dominant side — run equal volume each direction and both patterns. The back-crossover stresses the posterior hip more than the front-crossover.",
    progressionOf: "Carioca (Standard)",
  },
  {
    name: "Fast Carioca",
    category: "movement_prep",
    bodyRegions: ["hip", "adductor", "ankle", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "3 × 20 m each direction",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "football", "basketball", "lacrosse", "track"],
    coachingNote: "Maximum speed Carioca — full rhythm maintained but at top lateral velocity. Knee lift is reduced compared to the standard version; the emphasis is ground contact speed. Transitions the Carioca from a mobility/warmup drill into a true speed-footwork drill. Only use after standard Carioca is rhythmically solid.",
    progressionOf: "Carioca (Standard)",
  },
  {
    name: "High-Knee Carioca",
    category: "movement_prep",
    bodyRegions: ["hip", "adductor", "glute", "ankle", "full_body"],
    purposes: ["sprint_prep", "warmup", "lower_body_prep"],
    dosageType: "distance",
    defaultDosage: "2–3 × 20 m each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "football", "basketball"],
    coachingNote: "Carioca with exaggerated knee drive — each crossover step brings the knee up to 90° or above. Combines the hip rotation of Carioca with the sprint posture demand of the A-skip. Used in track and speed programs as a bridge drill between sprint drills and lateral footwork.",
  },
  {
    name: "Tapioca",
    category: "movement_prep",
    bodyRegions: ["ankle", "hip", "adductor", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "3 × 15–20 m each direction",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "football", "basketball", "lacrosse"],
    coachingNote: "Short, rapid crossover steps covering minimal ground per step — the high-frequency cousin of Carioca. Ground contact is quicker and stride amplitude is smaller. Prioritizes foot speed and ankle stiffness over hip rotation range. Commonly used in Brazilian football prep — trains the rapid lateral footwork used in tight-space situations.",
    progressionOf: "Fast Carioca",
  },

  // ── SHUFFLE PATTERNS ──
  {
    name: "Defensive Shuffle (Athletic Position Shuffle)",
    category: "movement_prep",
    bodyRegions: ["hip", "glute", "adductor", "ankle", "quad"],
    purposes: ["sprint_prep", "warmup", "lower_body_prep", "sport_resilience"],
    dosageType: "distance",
    defaultDosage: "3 × 20 m each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["basketball", "soccer", "football", "lacrosse", "tennis", "volleyball"],
    coachingNote: "Low athletic stance — hips below shoulders, knees bent, weight on the balls of the feet. Push off the trailing leg, don't let feet come together. The foundational defensive movement pattern. If an athlete can't hold the defensive position for 20m they aren't ready for reactive shuffle work.",
  },
  {
    name: "Shuffle to Sprint Transition",
    category: "movement_prep",
    bodyRegions: ["hip", "glute", "ankle", "full_body"],
    purposes: ["sprint_prep", "warmup", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3–4 × 5 transitions each direction",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["basketball", "soccer", "football", "lacrosse", "tennis"],
    coachingNote: "2–3 shuffle steps, then a sharp crossover step and explosive sprint for 10–15m. The plant foot cuts off the lateral momentum — drive off it immediately. This transition is the most common athletic movement pattern in court and field sports. The shuffle is the read phase; the sprint is the reaction.",
    progressionOf: "Defensive Shuffle (Athletic Position Shuffle)",
  },
  {
    name: "Lateral Crossover Run",
    category: "movement_prep",
    bodyRegions: ["hip", "adductor", "glute", "ankle", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "distance",
    defaultDosage: "3 × 20–30 m each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "football", "basketball", "lacrosse", "track"],
    coachingNote: "Full running stride moving laterally — both feet cross with each step, unlike a shuffle where feet stay apart. Higher velocity than a shuffle, more hip flexor and adductor demand than Carioca. Fills the gap between Carioca (hip rotation focus) and sprinting (linear). Useful for covering large lateral distances at speed.",
  },

  // ── BACKPEDAL PATTERNS ──
  {
    name: "Backpedal",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "quad", "glute"],
    purposes: ["sprint_prep", "warmup", "lower_body_prep", "sport_resilience"],
    dosageType: "distance",
    defaultDosage: "3 × 20 m",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["football", "soccer", "basketball", "lacrosse", "tennis"],
    coachingNote: "Push back off the ball of the foot — don't heel-strike going backwards. Maintain forward lean and athletic position — backpedaling upright loses speed and control. The posterior chain drives the movement. Essential defensive skill and a critical warm-up tool before any backward deceleration is demanded in practice or competition.",
  },
  {
    name: "Backpedal to Hip Turn",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "glute", "ankle", "thoracic_spine"],
    purposes: ["sprint_prep", "warmup", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3 × 4–5 each direction",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["football", "soccer", "basketball", "lacrosse"],
    coachingNote: "Backpedal 5–10m, then open the hips on signal or cue and transition into a forward sprint. The hip must rotate fully before the sprint starts — no shuffling between modes. One of the most sport-specific transition movements in defensive-oriented sports. Drill left and right turns equally.",
    progressionOf: "Backpedal",
  },
  {
    name: "Backpedal to Decel and Sprint",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3–4 × 3 each direction",
    sessionPlacement: ["primer_before_main"],
    equipment: ["none"],
    intensityLevel: "high",
    sportTags: ["football", "soccer", "basketball", "lacrosse"],
    coachingNote: "Backpedal at 80–90%, brake hard and plant, then explode into a forward sprint. Full deceleration-to-acceleration sequence. The most demanding backpedal progression — requires active hamstring braking, hip turn mechanics, and explosive first-step all within one fluid transition. Use a coach or signal for the trigger.",
    progressionOf: "Backpedal to Hip Turn",
  },

  // ── AGILITY LADDER ──
  {
    name: "Ladder: Two-In (Quick Feet)",
    category: "movement_prep",
    bodyRegions: ["ankle", "hip", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "4–6 × length of ladder",
    sessionPlacement: ["warmup_block"],
    equipment: ["agility_ladder"],
    intensityLevel: "low",
    sportTags: ["soccer", "basketball", "football", "lacrosse", "tennis", "track"],
    coachingNote: "Both feet step into each rung, one at a time — right-left, advance, right-left, advance. The entry-point ladder pattern. Establishes foot rhythm, arm drive, and forward lean before any lateral or more complex patterns are introduced. Do not let the feet come down flat — stay on the balls of the feet throughout.",
  },
  {
    name: "Ladder: Ickey Shuffle",
    category: "movement_prep",
    bodyRegions: ["ankle", "hip", "adductor", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "4–6 × length of ladder",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["agility_ladder"],
    intensityLevel: "moderate",
    sportTags: ["football", "basketball", "soccer", "lacrosse"],
    coachingNote: "In-in-out pattern: right foot in, left foot in, right foot out to the right side, then advance. The classic lateral ladder pattern. Develops lateral foot placement precision and lateral-to-forward transition speed. Footwork must be clean before adding speed — count rhythm aloud until automatic.",
  },
  {
    name: "Ladder: Lateral Two-In",
    category: "movement_prep",
    bodyRegions: ["ankle", "hip", "adductor", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "4–6 × length each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["agility_ladder"],
    intensityLevel: "moderate",
    sportTags: ["basketball", "soccer", "football", "tennis", "lacrosse"],
    coachingNote: "Moving laterally — both feet step into each rung while traveling sideways. Hips stay square to the side, feet land in the rung sequentially. Builds lateral foot speed and hip abductor/adductor coordination. Progress to one-in lateral once two-in is automatic at speed.",
  },
  {
    name: "Ladder: Ali Shuffle",
    category: "movement_prep",
    bodyRegions: ["ankle", "hip", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "4–6 × length of ladder",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["agility_ladder"],
    intensityLevel: "moderate",
    sportTags: ["boxing", "basketball", "soccer", "football", "track"],
    coachingNote: "Split stance, both feet switch simultaneously to advance — left-right split becomes right-left split with each rung. Fast, rhythmic, bilateral. Builds the explosive leg switch speed and split-stance balance that transfers to reactive athletic movements. The switch happens from the hip, not just the foot.",
  },
  {
    name: "Ladder: In-In-Out-Out",
    category: "movement_prep",
    bodyRegions: ["ankle", "adductor", "hip", "full_body"],
    purposes: ["sprint_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "4–6 × length of ladder",
    sessionPlacement: ["warmup_block"],
    equipment: ["agility_ladder"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "basketball", "football", "lacrosse", "tennis"],
    coachingNote: "Both feet step inside the rung, then both feet step outside — advance and repeat. Wide-narrow-wide pattern. Develops lateral push power and adductor/abductor coordination simultaneously. Use arms to drive rhythm. Common in soccer and basketball conditioning for hip width control under fast footwork.",
  },

  // ── COD / AGILITY PATTERN DRILLS ──
  {
    name: "T-Drill",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "glute", "adductor", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "4–6 timed runs with full recovery",
    sessionPlacement: ["primer_before_main"],
    equipment: ["cones"],
    intensityLevel: "high",
    sportTags: ["football", "basketball", "soccer", "lacrosse", "baseball", "tennis"],
    coachingNote: "Sprint 10y forward, shuffle 5y left, shuffle 10y right, shuffle 5y back to center, backpedal 10y — touch each cone. Sub-10 seconds is elite for most sports. Tests acceleration, deceleration, lateral shuffle, and backpedal in one sequence. Full recovery between every rep — this is a quality drill, not conditioning.",
  },
  {
    name: "Pro Agility Shuttle (5-10-5)",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "4–6 timed runs with full recovery",
    sessionPlacement: ["primer_before_main"],
    equipment: ["cones"],
    intensityLevel: "high",
    sportTags: ["football", "basketball", "soccer", "lacrosse", "baseball"],
    coachingNote: "Start at center cone, sprint 5y right, touch, sprint 10y left, touch, sprint 5y back through center. Sub-4.5 sec is elite. The most widely used COD test in sport combine settings. The cut is the entire drill — deceleration mechanics, plant mechanics, and re-acceleration are the adaptations, not just foot speed.",
  },
  {
    name: "L-Drill (3-Cone Drill)",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "4–6 timed runs with full recovery",
    sessionPlacement: ["primer_before_main"],
    equipment: ["cones"],
    intensityLevel: "high",
    sportTags: ["football", "basketball", "soccer", "lacrosse"],
    coachingNote: "Three cones in an L — sprint 5y, return, then figure-8 around the outside and inside of the far cones. Sub-7 seconds is elite at the NFL combine. Rewards athletes who can bend and cut at speed without losing posture. The figure-8 portion is the differentiator — hip flexibility and lean into the turn determine the outcome.",
    progressionOf: "Pro Agility Shuttle (5-10-5)",
  },

  // ── DECELERATION DRILLS ──
  {
    name: "Snap-Down Drill",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "knee", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3–4 × 5–6 reps",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "football", "soccer", "basketball", "lacrosse"],
    coachingNote: "From a tall sprint posture, rapidly pull the leg down and back into the ground — the snap. Mimics the backside mechanics of max-velocity sprinting and trains the eccentric hamstring action required to brake the swing leg and accept ground force. The athlete should feel the hamstring load, not the quad. Drive the foot down with intent — not a passive drop. Essential before any sprint work.",
  },
  {
    name: "Sprint to Stop (Progressive Braking)",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "knee", "glute", "quad"],
    purposes: ["landing_decel_prep", "sport_resilience", "sprint_prep"],
    dosageType: "reps",
    defaultDosage: "4–6 × 20–30 m sprint, controlled stop",
    sessionPlacement: ["primer_before_main"],
    equipment: ["none"],
    intensityLevel: "high",
    sportTags: ["soccer", "basketball", "football", "lacrosse", "tennis", "track"],
    coachingNote: "Sprint at 80–90%, then brake and come to a complete controlled stop over the fewest steps possible — without stutter-stepping or stumbling. The braking steps should be long, low, and aggressive — penultimate step widens the base, final step absorbs. Work: begin at 60% sprint, progress to 90% over sessions. The stop is the skill, not the sprint. Athletes who stop well accelerate faster from the next action.",
  },
  {
    name: "3-Step Deceleration",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "knee", "ankle", "glute"],
    purposes: ["landing_decel_prep", "reentry_support", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3 × 6–8 reps each direction",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "basketball", "football", "lacrosse", "tennis"],
    coachingNote: "Walk or jog into the sequence, then brake to a stop over exactly 3 counted steps. Step 1: long penultimate step, lower the hips. Step 2: plant foot wide, absorb laterally. Step 3: dead stop — hold the position. Then restart. The counted steps make the mechanics teachable and repeatable. A critical re-entry drill — rebuilds braking mechanics after injury before full-speed deceleration is loaded.",
  },
  {
    name: "Sprint → Decel → Cut → Re-Accelerate",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "knee", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "4–6 × full sequences, full recovery",
    sessionPlacement: ["primer_before_main"],
    equipment: ["cones"],
    intensityLevel: "high",
    sportTags: ["soccer", "basketball", "football", "lacrosse", "tennis"],
    coachingNote: "Sprint 15–20m, decelerate into a cone, cut 45–90° and re-accelerate for 10m. The full athletic action cycle. Acceleration, deceleration, and change of direction are trained as one integrated sequence — not in isolation. Use preset cut angles first (closed-loop), then progress to a partner calling the cut direction on approach (open-loop). This is the closest training approximation to a real game movement.",
    progressionOf: "Sprint to Stop (Progressive Braking)",
  },
  {
    name: "505 Deceleration Drill",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "knee", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "4–6 timed runs each leg, full recovery",
    sessionPlacement: ["primer_before_main"],
    equipment: ["cones"],
    intensityLevel: "high",
    sportTags: ["soccer", "basketball", "football", "lacrosse", "rugby"],
    coachingNote: "Sprint 5m to a line, plant on the designated foot, decelerate to a stop, reverse and sprint 5m back through the start gate — timed. Sub-2.0 seconds is elite. A sport science gold-standard test of deceleration ability. Test both legs separately — asymmetry of more than 0.1 seconds between legs is a meaningful performance deficit and injury risk signal. The planting foot mechanics under speed are the entire drill.",
  },
  {
    name: "Y-Cut / V-Cut Drill",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "glute", "knee", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3–4 × 4–6 cuts each direction",
    sessionPlacement: ["primer_before_main"],
    equipment: ["cones"],
    intensityLevel: "high",
    sportTags: ["basketball", "soccer", "football", "lacrosse", "tennis"],
    coachingNote: "Sprint toward a cone at 45° approach, plant and cut to one of two preset exit angles — either back inside (V-cut) or continuing at a new angle (Y-cut). The cut foot plants outside the cone. Trains the most common attacking move in basketball and soccer — the angle-cut off a run. Progress from preset (closed-loop) to coach-called exit angle (open-loop) to simulate game decision-making.",
  },
  {
    name: "Mirror Drill",
    category: "movement_prep",
    bodyRegions: ["hip", "ankle", "glute", "adductor", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3–4 × 5–8 sec bouts, full recovery",
    sessionPlacement: ["primer_before_main"],
    equipment: ["none"],
    intensityLevel: "high",
    sportTags: ["basketball", "soccer", "football", "lacrosse", "tennis"],
    coachingNote: "Two athletes face each other across a line — one leads, one mirrors at max reactive speed. The leader changes direction without warning; the mirror decelerates and re-accelerates to match every movement. The only true open-loop deceleration drill. All other drills are closed-loop (preset). The mirror drill develops the reactive decel that games actually demand — braking in response to a stimulus, not a plan.",
  },
  {
    name: "Read and React Sprint Stop",
    category: "movement_prep",
    bodyRegions: ["hip", "hamstring", "ankle", "knee", "glute", "full_body"],
    purposes: ["sprint_prep", "landing_decel_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "4–6 × sprints with variable stop signal",
    sessionPlacement: ["primer_before_main"],
    equipment: ["none"],
    intensityLevel: "high",
    sportTags: ["basketball", "soccer", "football", "lacrosse", "tennis"],
    coachingNote: "Athlete sprints, a coach or partner calls stop at an unpredictable moment — athlete brakes immediately and holds. The variable timing element is critical — it prevents anticipatory braking, which masks the true reactive deceleration demand. Varies the stop distance (5m, 15m, 25m) across reps so the athlete cannot predict. Bridges the gap between drill mechanics and the chaotic stop demands of live competition.",
    progressionOf: "Sprint to Stop (Progressive Braking)",
  },

  // ── LANDING MECHANICS / TECHNIQUE PROGRESSIONS ──
  {
    name: "Altitude Landing (Drop Landing)",
    category: "tissue_tolerance",
    bodyRegions: ["ankle", "knee", "hip", "glute", "full_body"],
    purposes: ["landing_decel_prep", "reentry_support", "sprint_prep"],
    dosageType: "reps",
    defaultDosage: "3 × 5–8 drops from 20–40 cm box",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["box"],
    intensityLevel: "moderate",
    sportTags: ["basketball", "volleyball", "track", "soccer", "football"],
    coachingNote: "Step off — don't jump — from the box, land and immediately absorb the force through heel-to-toe contact with a soft knee and hip. Stick the landing completely still before releasing. The entry point for all landing progressions. Teaches eccentric absorption mechanics without any take-off demand. Mandatory first step before any depth jump work.",
  },
  {
    name: "Altitude Landing with Immediate Rebound",
    category: "tissue_tolerance",
    bodyRegions: ["ankle", "knee", "hip", "glute", "full_body"],
    purposes: ["landing_decel_prep", "sprint_prep"],
    dosageType: "reps",
    defaultDosage: "3 × 5 drops from 30–45 cm box",
    sessionPlacement: ["primer_before_main"],
    equipment: ["box"],
    intensityLevel: "high",
    sportTags: ["basketball", "volleyball", "track", "soccer", "football"],
    coachingNote: "Step off, absorb the landing, then immediately jump vertically as high as possible — minimal ground contact time. The progression from altitude landing. Now the landing becomes the loading phase for explosive output. Ground contact should be less than 0.25 seconds. This is the practical mechanism of the depth jump but with controlled step-off.",
    progressionOf: "Altitude Landing (Drop Landing)",
  },
  {
    name: "Single-Leg Altitude Landing",
    category: "tissue_tolerance",
    bodyRegions: ["ankle", "knee", "hip", "glute"],
    purposes: ["landing_decel_prep", "reentry_support", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3 × 4–6 each leg from 20–30 cm box",
    sessionPlacement: ["primer_before_main", "warmup_block"],
    equipment: ["box"],
    intensityLevel: "high",
    sportTags: ["basketball", "volleyball", "track", "soccer", "football"],
    coachingNote: "Step off on two feet, land on one leg — completely absorb the force and freeze. The unilateral landing progression. Forces the ankle, knee, and hip to independently manage landing forces without the support of the opposite leg. Essential for ACL resilience and return-to-sport readiness. Assess for knee cave, heel rise, or trunk lean — all are red flags.",
    progressionOf: "Altitude Landing (Drop Landing)",
  },
  {
    name: "Lateral Altitude Landing",
    category: "tissue_tolerance",
    bodyRegions: ["ankle", "knee", "hip", "adductor", "glute"],
    purposes: ["landing_decel_prep", "sport_resilience", "reentry_support"],
    dosageType: "reps",
    defaultDosage: "3 × 4–5 each direction from 20–30 cm box",
    sessionPlacement: ["primer_before_main"],
    equipment: ["box"],
    intensityLevel: "high",
    sportTags: ["basketball", "soccer", "football", "lacrosse", "tennis"],
    coachingNote: "Step off laterally — land and absorb on both feet, then progress to single-leg lateral landings. Addresses the frontal plane landing mechanics most relevant to cutting and COD athletes. The side-step landing pattern is the most undertrained and the most injury-relevant for field and court sports.",
    progressionOf: "Single-Leg Altitude Landing",
  },

  // ── FOAM ROLLING — TARGETED BY REGION ──
  {
    name: "Foam Roller Quadriceps",
    category: "recovery_restoration",
    bodyRegions: ["quad", "knee"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each leg",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["foam_roller"],
    intensityLevel: "passive",
    sportTags: ["soccer", "basketball", "football", "track"],
    coachingNote: "Prone position, roller at mid-thigh — include medial and lateral quad. Pause on tense spots. A quad-dominant day (squats, lunges) warrants 2–3 passes.",
  },
  {
    name: "Foam Roller Hamstrings",
    category: "recovery_restoration",
    bodyRegions: ["hamstring", "knee"],
    purposes: ["post_session_recovery", "cooldown"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each leg",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["foam_roller"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Seated on roller, drive across the hamstring by crossing the opposite ankle. Work from just above the knee up to the glute-ham junction.",
  },
  {
    name: "Foam Roller IT Band / TFL",
    category: "recovery_restoration",
    bodyRegions: ["knee", "hip"],
    purposes: ["post_session_recovery", "cooldown", "sport_resilience"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["foam_roller"],
    intensityLevel: "passive",
    sportTags: ["track", "soccer", "basketball"],
    coachingNote: "Side-lying, roller from lateral knee to lateral hip. Not a true stretch — the IT band doesn't lengthen — but reduces tone in the TFL and lateral quad. Pause on sensitive spots.",
  },
  {
    name: "Foam Roller Lats",
    category: "recovery_restoration",
    bodyRegions: ["shoulder", "thoracic_spine"],
    purposes: ["post_session_recovery", "cooldown", "upper_body_prep"],
    dosageType: "seconds",
    defaultDosage: "45–60 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day", "warmup_block"],
    equipment: ["foam_roller"],
    intensityLevel: "passive",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Side-lying with arm extended overhead — roller from armpit to mid-torso. Tight lats restrict overhead ROM significantly. Common in pulling athletes.",
  },
  {
    name: "Foam Roller Hip Flexors / Psoas",
    category: "recovery_restoration",
    bodyRegions: ["hip", "lumbar"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "seconds",
    defaultDosage: "60 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["foam_roller"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball"],
    coachingNote: "Prone with roller in the anterior hip crease — subtle weight shift side to side. Targets the psoas, which chronically tightens in athletes who spend significant time seated.",
  },
  {
    name: "Lacrosse Ball Adductor / Groin",
    category: "recovery_restoration",
    bodyRegions: ["adductor", "hip"],
    purposes: ["post_session_recovery", "cooldown", "sport_resilience"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["lacrosse_ball"],
    intensityLevel: "passive",
    sportTags: ["soccer", "hockey", "football", "lacrosse"],
    coachingNote: "Prone or side-lying with ball in inner thigh — small oscillations to cover the full adductor length. Particularly useful for soccer and hockey athletes after a heavy game load.",
  },
  {
    name: "Lacrosse Ball Glute / Piriformis",
    category: "recovery_restoration",
    bodyRegions: ["glute", "hip"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["lacrosse_ball"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball"],
    coachingNote: "Seated on ball in the glute — cross the ankle over the opposite knee to increase hip ER. Work into tender spots with controlled breathing. Excellent post-hinge and post-sprint session.",
  },
  {
    name: "Lacrosse Ball Plantar Fascia / Foot",
    category: "recovery_restoration",
    bodyRegions: ["foot", "ankle"],
    purposes: ["post_session_recovery", "cooldown", "sport_resilience"],
    dosageType: "seconds",
    defaultDosage: "60 sec each foot",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["lacrosse_ball"],
    intensityLevel: "passive",
    sportTags: ["basketball", "track", "soccer", "volleyball"],
    coachingNote: "Standing, roll the ball under the arch of the foot — heel to ball of foot. High foot-contact sports accumulate plantar tissue stress that is easily managed with 60 seconds post-session.",
  },

  // ── SHOULDER / OVERHEAD — ADVANCED ──
  {
    name: "Wall Overhead Slide",
    category: "mobility",
    bodyRegions: ["shoulder", "scapular", "thoracic_spine"],
    purposes: ["overhead_prep", "upper_body_prep", "pre_lift_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "10–15 reps",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Forearms on the wall, slide arms up while maintaining contact. Trains upward rotation and serratus activation in the overhead position. Essential before any overhead pressing or throwing work.",
  },
  {
    name: "Y-T-W-L Raise (Prone or Incline)",
    category: "activation",
    bodyRegions: ["scapular", "rotator_cuff", "shoulder"],
    purposes: ["upper_body_prep", "overhead_prep", "sport_resilience", "reentry_support"],
    dosageType: "reps",
    defaultDosage: "8–10 reps each position",
    sessionPlacement: ["warmup_block", "accessory_support"],
    equipment: ["dumbbell", "none"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball", "football"],
    coachingNote: "Prone on a bench or floor. Y = arms at 135°, T = arms at 90°, W = elbows bent to 90°, L = full 90/90 external rotation. Light or bodyweight only — these are activation, not strength sets.",
  },
  {
    name: "Trap-3 Raise",
    category: "activation",
    bodyRegions: ["scapular", "shoulder"],
    purposes: ["upper_body_prep", "overhead_prep", "sport_resilience"],
    dosageType: "reps",
    defaultDosage: "3 × 10–15 reps",
    sessionPlacement: ["warmup_block", "accessory_support"],
    equipment: ["dumbbell", "cable", "band"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Prone or inclined at 135° — raise the arm in the plane of the scapula. Isolates the lower trapezius, which is chronically underactivated in overhead and pressing athletes. Very light load.",
  },
  {
    name: "Open Book Thoracic Rotation",
    category: "mobility",
    bodyRegions: ["thoracic_spine", "shoulder"],
    purposes: ["upper_body_prep", "overhead_prep", "pre_lift_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "10 each side",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["baseball", "golf", "soccer", "volleyball"],
    coachingNote: "Side-lying, stack the knees, rotate the top arm and chest open to the ceiling — bottom knee stays on the floor. Pure thoracic rotation. Exhale as you rotate open.",
  },
  {
    name: "Overhead Reach with Thoracic Extension",
    category: "mobility",
    bodyRegions: ["thoracic_spine", "shoulder", "scapular"],
    purposes: ["overhead_prep", "upper_body_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "8–10 each side",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "From half-kneeling or tall kneeling — reach one arm overhead, extending through the thoracic spine as you go. Pairs thoracic extension mobility with overhead position. Prep for overhead pressing and throwing.",
  },
  {
    name: "Banded Shoulder Distraction",
    category: "mobility",
    bodyRegions: ["shoulder", "rotator_cuff"],
    purposes: ["overhead_prep", "upper_body_prep", "warmup", "sport_resilience"],
    dosageType: "seconds",
    defaultDosage: "30–60 sec each side",
    sessionPlacement: ["warmup_block"],
    equipment: ["band"],
    intensityLevel: "passive",
    sportTags: ["baseball", "volleyball", "basketball", "football"],
    coachingNote: "Band anchored high, loop around wrist — step away to create traction on the glenohumeral joint. Move the shoulder in gentle circles under traction. Decompresses the joint before loading.",
  },

  // ── TISSUE TOLERANCE — ADDITIONAL ──
  {
    name: "Spanish Squat Isometric (Patellar Tendon)",
    category: "tissue_tolerance",
    bodyRegions: ["knee", "quad"],
    purposes: ["sport_resilience", "reentry_support", "inseason_support"],
    dosageType: "seconds",
    defaultDosage: "4–5 × 30–45 sec holds",
    sessionPlacement: ["accessory_support", "finisher", "recovery_day"],
    equipment: ["band"],
    intensityLevel: "challenging",
    sportTags: ["basketball", "volleyball", "soccer", "track"],
    coachingNote: "Band around a fixed point, feet forward — sit into the squat so the shins are near vertical. Isometric holds for patellar tendon loading. Evidence-based for patellar tendinopathy management. Start with 30-sec holds.",
    regressionOf: "Decline Single-Leg Squat (Patellar Tendon Loading)",
  },
  {
    name: "Tibialis Anterior Raise",
    category: "tissue_tolerance",
    bodyRegions: ["ankle", "foot", "calf"],
    purposes: ["sport_resilience", "reentry_support", "inseason_support"],
    dosageType: "reps",
    defaultDosage: "3 × 20–25 reps",
    sessionPlacement: ["accessory_support", "finisher", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["track", "soccer", "basketball", "football"],
    coachingNote: "Stand with heels on a low step or flat — dorsiflex the ankle to bring toes up, lower slowly. Builds shin / tibialis anterior tissue tolerance. Underused for shin splint prevention and sprint athlete foot mechanics.",
  },
  {
    name: "Terminal Knee Extension (VMO Activation)",
    category: "activation",
    bodyRegions: ["knee", "quad"],
    purposes: ["pre_lift_prep", "lower_body_prep", "reentry_support", "warmup"],
    dosageType: "reps",
    defaultDosage: "2–3 × 15–20 reps",
    sessionPlacement: ["warmup_block", "primer_before_main"],
    equipment: ["band"],
    intensityLevel: "low",
    sportTags: ["soccer", "basketball", "football"],
    coachingNote: "Band behind the knee, drive to full extension. Isolates the VMO and retrains the terminal extension pattern — useful for post-ACL, patellar tracking issues, or knee pain before squatting.",
  },
  {
    name: "Isometric Hip Flexor Hold",
    category: "tissue_tolerance",
    bodyRegions: ["hip"],
    purposes: ["sport_resilience", "reentry_support", "pre_lift_prep"],
    dosageType: "seconds",
    defaultDosage: "3–5 × 10 sec each side",
    sessionPlacement: ["warmup_block", "accessory_support"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "track", "football", "basketball"],
    coachingNote: "Seated or supine, drive the knee up against your own hand resistance. Isometric contraction of the hip flexor complex. Activates psoas and rectus femoris before sprint or lower-body work, and builds hip flexor resilience over time.",
  },
  {
    name: "Decline Single-Leg Squat (Patellar Tendon Loading)",
    category: "tissue_tolerance",
    bodyRegions: ["knee", "quad"],
    purposes: ["sport_resilience", "inseason_support"],
    dosageType: "reps",
    defaultDosage: "3 × 8–12 slow reps",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["none"],
    intensityLevel: "challenging",
    sportTags: ["basketball", "volleyball", "soccer"],
    coachingNote: "25° decline board single-leg squat — maximizes patellar tendon load through full range. Eccentric emphasis. The gold standard for patellar tendinopathy loading. Must be pain-guided.",
    progressionOf: "Spanish Squat Isometric (Patellar Tendon)",
  },

  // ── HAMSTRING ECCENTRIC LOADING PROGRESSION ──
  {
    name: "Slider Hamstring Curl",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "glute", "knee"],
    purposes: ["reentry_support", "sport_resilience", "pre_lift_prep", "sprint_prep"],
    dosageType: "reps",
    defaultDosage: "3 × 8–12 reps, 3–4 sec eccentric lowering",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["sliders"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "football", "basketball", "track", "lacrosse"],
    coachingNote: "Bridge up, curl both heels in concentrically — then slowly slide feet back out over 3–4 seconds against full hamstring resistance. The eccentric push-out is the entire stimulus. Entry-level eccentric hamstring loading before the Nordic curl. Appropriate in the first weeks of re-entry after hamstring strain — lower absolute load than the Nordic, full eccentric control from rep one.",
  },
  {
    name: "Single-Leg Slider Curl",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "glute", "knee"],
    purposes: ["reentry_support", "sport_resilience", "sprint_prep"],
    dosageType: "reps",
    defaultDosage: "3 × 6–10 each leg, 3–5 sec eccentric",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["sliders"],
    intensityLevel: "challenging",
    sportTags: ["soccer", "football", "basketball", "track", "lacrosse"],
    coachingNote: "One heel on the slider, one leg floats — bridge up and curl in, then control the eccentric extension on one leg. Unilateral eccentric hamstring load. Exposes asymmetries and demands independent hamstring control on each side. Progress to this before the Nordic.",
    progressionOf: "Slider Hamstring Curl",
  },
  {
    name: "Swiss Ball Hamstring Curl",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "glute", "knee", "hip"],
    purposes: ["reentry_support", "sport_resilience", "pre_lift_prep"],
    dosageType: "reps",
    defaultDosage: "3 × 10–15 reps",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["swiss_ball"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "football", "basketball", "general"],
    coachingNote: "Heels on the ball, hips bridged — curl the ball in then roll it back out slowly. Trains the hamstring in its dual role: hip extension and knee flexion simultaneously. Eccentric emphasis on the extension phase. More stable than the Nordic, more functional than the machine curl. Good entry point for athletes who need hamstring loading without heavy eccentric demand.",
  },
  {
    name: "Razor Curl (Kneeling Hamstring Curl)",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "knee", "hip"],
    purposes: ["reentry_support", "sport_resilience", "sprint_prep"],
    dosageType: "reps",
    defaultDosage: "3 × 5–8 reps, maximum eccentric control",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["none"],
    intensityLevel: "challenging",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Ankles anchored, kneeling upright — fall forward under eccentric hamstring control, catch with hands, push back up to the start. Lower torque version of the Nordic — the moment arm is shorter because the hip stays more flexed. Use this as a step between slider curls and full Nordics. The fall should take at least 4–5 seconds. Tuck a pad under the knees.",
    progressionOf: "Single-Leg Slider Curl",
  },
  {
    name: "GHD Hamstring Curl",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "glute", "knee", "hip"],
    purposes: ["sport_resilience", "sprint_prep"],
    dosageType: "reps",
    defaultDosage: "3 × 6–10 reps, 3 sec lowering",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["ghd_machine"],
    intensityLevel: "challenging",
    sportTags: ["soccer", "football", "track", "basketball"],
    coachingNote: "Glute-ham device knee flexion curl — hip stays in full extension throughout, isolating the knee-flexion component of the hamstring. Unlike the Nordic, the hip angle doesn't change. Allows loaded progressions on the GHD. Eccentric on the lowering. A staple in track and football programs for hamstring resilience. Lower back through neutral — don't hyperextend.",
    progressionOf: "Razor Curl (Kneeling Hamstring Curl)",
  },

  // ── HAMSTRING ISOMETRIC LOADING ──
  {
    name: "Isometric Hamstring Hold",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "knee"],
    purposes: ["reentry_support", "sport_resilience", "pre_lift_prep"],
    dosageType: "seconds",
    defaultDosage: "3–5 × 20–45 sec holds each position",
    sessionPlacement: ["warmup_block", "accessory_support"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "football", "basketball", "track", "general"],
    coachingNote: "Seated or lying, press the heel firmly into the floor or a fixed surface — maximum contraction, no movement. Pure isometric hamstring loading. Appropriate in the earliest re-entry phases when eccentric loading is not yet tolerated. Builds motor unit activation and tendon stiffness with zero lengthening stress. Perform at multiple knee angles — different angles target different portions of the hamstring.",
  },
  {
    name: "90-90 Hamstring Isometric",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "knee", "hip"],
    purposes: ["reentry_support", "sport_resilience", "pre_lift_prep", "sprint_prep"],
    dosageType: "seconds",
    defaultDosage: "3–4 × 20–40 sec holds",
    sessionPlacement: ["warmup_block", "accessory_support"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Seated with hip and knee at 90°, drive the heel into the floor as hard as possible without moving — hold. Isometric loading in the mid-range of hamstring function. Effective activation protocol before sprint work and early re-entry tissue loading when eccentric is not yet appropriate. Progress hold duration before increasing contraction intensity.",
  },
  {
    name: "Isometric RDL Hold",
    category: "tissue_tolerance",
    bodyRegions: ["hamstring", "glute", "hip", "lumbar"],
    purposes: ["sport_resilience", "sprint_prep", "pre_lift_prep"],
    dosageType: "reps",
    defaultDosage: "4 × 5 reps with 3–5 sec pause at bottom",
    sessionPlacement: ["primer_before_main", "accessory_support"],
    equipment: ["barbell", "dumbbell", "bodyweight"],
    intensityLevel: "moderate",
    sportTags: ["soccer", "football", "basketball", "track", "lacrosse"],
    coachingNote: "Romanian deadlift with a deliberate pause at the bottom — full hamstring stretch under load, hold 3–5 seconds before driving back up. Stretch isometric in the position most relevant to sprint mechanics. Builds tendon tolerance at long muscle length, which is exactly where most hamstring strains occur. Light to moderate load only — the pause is the stimulus, not the weight.",
  },

  // ── ECCENTRIC CALF / ACHILLES LOADING ──
  {
    name: "Eccentric Single-Leg Calf Raise (Alfredson Protocol)",
    category: "tissue_tolerance",
    bodyRegions: ["calf", "ankle", "foot"],
    purposes: ["sport_resilience", "reentry_support", "inseason_support"],
    dosageType: "reps",
    defaultDosage: "3 × 15 — straight knee + 3 × 15 — bent knee, twice daily",
    sessionPlacement: ["finisher", "accessory_support", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "moderate",
    sportTags: ["track", "soccer", "basketball", "volleyball", "football"],
    coachingNote: "Rise on two feet, lower on one — 3 seconds down, all the way to the bottom. Full range of motion including the stretch at the very bottom is non-negotiable. Straight-knee version loads the gastrocnemius; bent-knee loads the soleus. Both must be used. This is the Alfredson Protocol — the gold-standard evidence-based Achilles tendon loading program. 3 × 15 twice daily is the clinical prescription. Pain during the exercise is acceptable; sharp pain that increases across sets is not. Add load in a backpack when bodyweight becomes easy.",
  },

  // ── ECCENTRIC UPPER BODY ──
  {
    name: "Slow Negative Pull-Up",
    category: "tissue_tolerance",
    bodyRegions: ["shoulder", "scapular", "elbow"],
    purposes: ["sport_resilience", "reentry_support", "pre_lift_prep", "upper_body_prep"],
    dosageType: "reps",
    defaultDosage: "3–4 × 4–6 reps, 5–8 sec eccentric lowering",
    sessionPlacement: ["accessory_support", "finisher"],
    equipment: ["pull_up_bar"],
    intensityLevel: "challenging",
    sportTags: ["general", "basketball", "football", "baseball"],
    coachingNote: "Jump or step to the top position — full chin over bar — then lower under complete eccentric control over 5–8 seconds. Eccentric-only. The primary tool for building unassisted pull-up strength and producing lat/bicep hypertrophy beyond what concentric pull-ups alone provide. Start with 3 reps per set to protect elbow tendons before building volume.",
  },

  // ── LOWER BODY — ADDITIONAL FLEXIBILITY / MOBILITY ──
  {
    name: "Couch Stretch",
    category: "flexibility",
    bodyRegions: ["hip", "quad"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support", "sprint_prep"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Back foot up on a box or wall, front leg at 90° — tall spine with posterior pelvic tilt before leaning forward. Targets rectus femoris and hip flexor. One of the most effective hip flexor stretches available.",
  },
  {
    name: "Frog Stretch (Bilateral Groin)",
    category: "flexibility",
    bodyRegions: ["adductor", "hip"],
    purposes: ["pre_lift_prep", "lower_body_prep", "post_session_recovery", "warmup"],
    dosageType: "seconds",
    defaultDosage: "30–60 sec",
    sessionPlacement: ["warmup_block", "cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "hockey", "football", "basketball"],
    coachingNote: "Quadruped, knees wide, feet out — rock back slowly. Bilateral adductor stretch with spine in neutral. Shorter holds pre-session (30 sec), longer post-session (60+ sec).",
  },
  {
    name: "Supine Figure-4 Stretch",
    category: "flexibility",
    bodyRegions: ["hip", "glute"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "seconds",
    defaultDosage: "60–90 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball"],
    coachingNote: "Supine, cross ankle over opposite knee, pull both legs toward chest. Hip external rotation stretch — safer alternative to Pigeon Pose for those with hip or knee pathology.",
  },
  {
    name: "Prone Quad / Rectus Femoris Stretch",
    category: "flexibility",
    bodyRegions: ["quad", "hip"],
    purposes: ["post_session_recovery", "cooldown"],
    dosageType: "seconds",
    defaultDosage: "30–45 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "Prone, pull the heel toward the glute — add posterior pelvic tilt to increase the rectus femoris stretch component. Post-session only.",
  },
  {
    name: "Lumbar Rotation Stretch",
    category: "flexibility",
    bodyRegions: ["lumbar", "hip"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "reps",
    defaultDosage: "10 each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: [],
    coachingNote: "Supine, knees bent, slowly let both knees fall to one side — hold 5 sec before returning. Gentle lumbar rotation for post-session recovery and lower back tension relief. Not a mobilization — do not force the range.",
  },
  {
    name: "Half-Kneeling Hip Flexor Stretch with Reach",
    category: "flexibility",
    bodyRegions: ["hip", "thoracic_spine"],
    purposes: ["pre_lift_prep", "sprint_prep", "lower_body_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "8–10 reps each side",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "low",
    sportTags: ["soccer", "football", "basketball", "track"],
    coachingNote: "From half-kneeling: posterior pelvic tilt, then reach the ipsilateral arm overhead and rotate slightly away. Integrates hip flexor stretch with thoracic rotation — dynamic version of the static lunge stretch.",
  },
  {
    name: "TFL / Lateral Hip Stretch",
    category: "flexibility",
    bodyRegions: ["hip", "knee"],
    purposes: ["post_session_recovery", "cooldown", "sport_resilience"],
    dosageType: "seconds",
    defaultDosage: "30–45 sec each side",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["track", "soccer", "basketball"],
    coachingNote: "Cross the stretched leg behind the standing leg, shift the hip laterally — feel the lateral hip. Targets the TFL and lateral hip structures that accumulate tension in running and multi-directional athletes.",
  },

  // ── RECOVERY / RESTORATION — ADDITIONAL ──
  {
    name: "Legs Up the Wall",
    category: "recovery_restoration",
    bodyRegions: ["full_body"],
    purposes: ["post_session_recovery", "cooldown", "inseason_support"],
    dosageType: "seconds",
    defaultDosage: "5–10 min",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: [],
    coachingNote: "Supine, legs vertical against the wall — promotes venous and lymphatic return from the lower extremities. Evidence-supported for acute recovery from high-leg-volume sessions. Pair with diaphragmatic breathing.",
  },
  {
    name: "Progressive Muscle Relaxation (Body Scan)",
    category: "cooldown_downregulation",
    bodyRegions: ["full_body"],
    purposes: ["post_session_recovery", "cooldown", "inseason_support"],
    dosageType: "seconds",
    defaultDosage: "5–8 min",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: [],
    coachingNote: "Supine — systematically tense then fully relax each muscle group from foot to head, 5 sec tension, 10 sec release. Reduces residual neural arousal post-session and improves sleep quality when done before bed.",
  },
  {
    name: "90-90 Breathing (Postural Reset)",
    category: "cooldown_downregulation",
    bodyRegions: ["trunk", "lumbar", "hip"],
    purposes: ["post_session_recovery", "cooldown", "reentry_support"],
    dosageType: "breaths",
    defaultDosage: "10 slow breaths",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: [],
    coachingNote: "Supine, hips and knees at 90° on a bench or box — exhale fully to reduce rib flare and reset the pelvis. Extension-dominant athletes (sprinters, lifters) especially benefit from this reset at session end.",
  },

  // ── WRIST / ELBOW — ADDITIONAL ──
  {
    name: "Prayer Stretch (Wrist Flexors)",
    category: "flexibility",
    bodyRegions: ["wrist", "elbow"],
    purposes: ["pre_lift_prep", "upper_body_prep", "post_session_recovery"],
    dosageType: "seconds",
    defaultDosage: "20–30 sec",
    sessionPlacement: ["warmup_block", "cooldown_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball", "volleyball", "basketball"],
    coachingNote: "Palms together, fingers up, elbows apart — gently press hands down to increase wrist extension. Counterbalances the chronic wrist flexion loading in throwing and gripping athletes.",
  },
  {
    name: "Forearm Extensor Stretch",
    category: "flexibility",
    bodyRegions: ["wrist", "elbow"],
    purposes: ["post_session_recovery", "cooldown", "sport_resilience"],
    dosageType: "seconds",
    defaultDosage: "30 sec each arm",
    sessionPlacement: ["cooldown_block", "recovery_day"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball"],
    coachingNote: "Arm extended, palm down, gently flex the wrist with the opposite hand. Targets the wrist extensors and lateral elbow region. Useful for lateral epicondyle management in throwing athletes.",
  },
  {
    name: "Elbow CARs (Controlled Articular Rotations)",
    category: "mobility",
    bodyRegions: ["elbow", "wrist"],
    purposes: ["pre_lift_prep", "upper_body_prep", "warmup"],
    dosageType: "reps",
    defaultDosage: "8–10 circles each direction",
    sessionPlacement: ["warmup_block"],
    equipment: ["none"],
    intensityLevel: "passive",
    sportTags: ["baseball", "volleyball"],
    coachingNote: "Full active supination and pronation through elbow flexion and extension — maximally contract through the arc. Elbow joint prep before any overhead or throwing session.",
  },
];

// ─── Mobility Request Detection ───────────────────────────────────────────────

const MOBILITY_TRIGGER_PATTERNS = [
  // Direct requests
  /\b(mobility|flexibility|flexible)\b/i,
  /\b(warm.?up|warmup|movement prep|move prep)\b/i,
  /\b(cool.?down|cooldown|recovery day|restoration)\b/i,
  /\b(activation|activate|primer|prime)\b/i,
  /\b(stiff|stiffness|tight(ness)?)\b/i,
  /\b(resilience|tissue work|tissue tolerance)\b/i,

  // Body part + feeling patterns
  /\b(hip|hips|ankle|ankles|shoulder|hamstring|groin|adductor|calf|thoracic|wrist)\b.*\b(tight|stiff|sore|pain|ache|issue|problem|feel)\b/i,
  /\b(feel|my)\b.*\b(hip|hips|ankle|shoulder|hamstring|groin|adductor|calf|thoracic)\b.*\b(tight|stiff|sore)\b/i,

  // Action requests
  /add (mobility|flexibility|warm.?up|activation|recovery|movement prep)/i,
  /add.*\b(stretching|stretch|tissue work)\b/i,
  /better warm.?up/i,
  /improve.*\b(mobility|flexibility|movement quality|range of motion)\b/i,
  /more (mobility|flexibility|movement prep|recovery work|stretching)/i,
  /\b(recovery work|recovery session|recovery day)\b/i,
  /make.*(shoulder|hip|ankle|wrist|knee).*friendly/i,
  /\b(movement quality|movement day)\b/i,

  // Sport-specific resilience language
  /\b(shoulder.?friendly|knee.?friendly|hip.?friendly)\b/i,
  /resilient.*(soccer|basketball|football|baseball|rugby|lacrosse)/i,
  /(soccer|basketball|football|baseball|rugby|lacrosse).*resilient/i,
  /sport.*resilience/i,
];

export function detectMobilityRequest(message: string): boolean {
  return MOBILITY_TRIGGER_PATTERNS.some((p) => p.test(message));
}

// ─── Body Region Extraction ────────────────────────────────────────────────────

export function extractMobilityBodyRegions(message: string): BodyRegion[] {
  const regions: BodyRegion[] = [];
  const m = message.toLowerCase();

  if (/\b(ankle|ankles)\b/.test(m)) regions.push("ankle");
  if (/\b(foot|feet)\b/.test(m)) regions.push("foot");
  if (/\b(calf|calves)\b/.test(m)) regions.push("calf");
  if (/\b(knee|knees)\b/.test(m)) regions.push("knee");
  if (/\b(hip|hips)\b/.test(m)) regions.push("hip");
  if (/\b(groin|adductor|inner.?thigh)\b/.test(m)) regions.push("adductor");
  if (/\b(hamstring|back of the leg)\b/.test(m)) regions.push("hamstring");
  if (/\b(glute|glutes|butt)\b/.test(m)) regions.push("glute");
  if (/\b(quad|quads|quadricep)\b/.test(m)) regions.push("quad");
  if (/\b(thoracic|t.spine|mid.back|upper.back rotation)\b/.test(m)) regions.push("thoracic_spine");
  if (/\b(shoulder|shoulders|rotator.cuff|labrum)\b/.test(m)) regions.push("shoulder");
  if (/\b(scap|scapula|scapular|rhomboid)\b/.test(m)) regions.push("scapular");
  if (/\b(trunk|core|abs|abdominal)\b/.test(m)) regions.push("trunk");
  if (/\b(wrist|wrists|carpal)\b/.test(m)) regions.push("wrist");
  if (/\b(elbow|elbows|tennis elbow|golfer)\b/.test(m)) regions.push("elbow");
  if (/\b(neck|cervical)\b/.test(m)) regions.push("neck");
  if (/\b(low.?back|lumbar|lower.?back)\b/.test(m)) regions.push("lumbar");

  return regions;
}

// ─── Purpose Inference ────────────────────────────────────────────────────────

export function inferMobilityPurposes(
  message: string,
  sport: string | null,
  sessionType?: string,
): MovementSupportPurpose[] {
  const purposes: MovementSupportPurpose[] = [];
  const m = message.toLowerCase();

  if (/warm.?up|before|prep|primer|activation|pre.session/.test(m)) {
    purposes.push("pre_lift_prep", "warmup");
  }
  if (/cool.?down|after|post.session|recovery/.test(m)) {
    purposes.push("post_session_recovery", "cooldown");
  }
  if (/sprint|speed|track|run/.test(m)) {
    purposes.push("sprint_prep");
  }
  if (/upper|press|bench|push|pull|upper.body/.test(m)) {
    purposes.push("upper_body_prep");
  }
  if (/lower|squat|deadlift|hip|leg|lower.body/.test(m)) {
    purposes.push("lower_body_prep");
  }
  if (/overhead|press overhead|shoulder press|snatch|clean/.test(m)) {
    purposes.push("overhead_prep");
  }
  if (/decel|landing|cut|change of direction|basketball|soccer/.test(m)) {
    purposes.push("landing_decel_prep");
  }
  if (/recovery day|restoration|active recovery|movement day/.test(m)) {
    purposes.push("post_session_recovery", "reentry_support");
  }
  if (/in.?season|during season|season/.test(m)) {
    purposes.push("inseason_support");
  }
  if (/resilient|resilience|tissue/.test(m)) {
    purposes.push("sport_resilience");
  }
  if (purposes.length === 0) {
    purposes.push("pre_lift_prep", "warmup");
  }

  return [...new Set(purposes)];
}

// ─── Sport-Specific Mobility Mapping ─────────────────────────────────────────

export interface SportMobilityProfile {
  sport: string;
  primaryRegions: BodyRegion[];
  criticalExercises: string[];           // Names from MOVEMENT_SUPPORT_LIBRARY
  tissuePriorities: string;
  inSeasonNote: string;
}

export const SPORT_MOBILITY_PROFILES: Record<string, SportMobilityProfile> = {
  soccer: {
    sport: "soccer",
    primaryRegions: ["adductor", "hip", "hamstring", "calf", "ankle"],
    criticalExercises: [
      "Copenhagen Plank",
      "Adductor Rockback",
      "Nordic Hamstring Curl",
      "Single-Leg Calf Raise",
      "Hip 90/90 Stretch",
      "Ankle Banded Dorsiflexion Mobilization",
    ],
    tissuePriorities: "Adductor/groin tissue tolerance is the #1 priority for soccer — Copenhagen plank variations must be present. Hamstring resilience (Nordic curl) is #2. Achilles/calf tissue load management for field volume.",
    inSeasonNote: "In-season: maintain Copenhagen plank 2×/week at reduced volume. Nordic hamstring at 2 × 5 reps. No new high-demand tissue work mid-season.",
  },
  basketball: {
    sport: "basketball",
    primaryRegions: ["knee", "hip", "ankle", "glute", "adductor"],
    criticalExercises: [
      "Hip Airplane",
      "Lateral Band Walk",
      "Ankle Banded Dorsiflexion Mobilization",
      "Copenhagen Plank",
      "Single-Leg Calf Raise",
    ],
    tissuePriorities: "Deceleration and landing mechanics drive tissue priority: knee (patellar tendon), hip stability, and ankle dorsiflexion. Lateral plane hip stability is critical for a multi-directional sport.",
    inSeasonNote: "In-season: prioritize ankle/hip prep before sessions and Achilles tissue work post-session. Minimize new tissue stress mid-season.",
  },
  baseball: {
    sport: "baseball",
    primaryRegions: ["shoulder", "scapular", "rotator_cuff", "thoracic_spine", "trunk", "elbow", "wrist"],
    criticalExercises: [
      "Band Pull-Apart",
      "Scapular Wall Slide",
      "Internal/External Rotation with Band",
      "Thoracic Spine Rotation",
      "Thoracic Extension Over Foam Roller",
      "Pallof Press",
      "Sleeper Stretch",
    ],
    tissuePriorities: "Shoulder health is the primary concern: rotator cuff pre-activation before throwing or pressing is non-negotiable. Thoracic rotation and trunk anti-rotation for throwing chain integrity.",
    inSeasonNote: "In-season: daily rotator cuff activation before throwing. Sleeper stretch post-throw. Thoracic mobility 3–4×/week. No new tissue loading during season.",
  },
  football: {
    sport: "football",
    primaryRegions: ["hip", "hamstring", "thoracic_spine", "shoulder", "ankle", "adductor"],
    criticalExercises: [
      "World's Greatest Stretch",
      "Hip 90/90 Stretch",
      "Nordic Hamstring Curl",
      "Band Pull-Apart",
      "Ankle Banded Dorsiflexion Mobilization",
    ],
    tissuePriorities: "Hip mobility and hamstring resilience are highest priority. Thoracic rotation for skill positions. Shoulder prep for all positions — high contact sport.",
    inSeasonNote: "In-season: prioritize recovery — hip/hamstring flexibility post-session, Nordic curls maintained at 2 × 5. Avoid high-demand tissue work when game load is heavy.",
  },
  volleyball: {
    sport: "volleyball",
    primaryRegions: ["shoulder", "scapular", "rotator_cuff", "knee", "ankle"],
    criticalExercises: [
      "Band Pull-Apart",
      "Scapular Wall Slide",
      "Internal/External Rotation with Band",
      "Single-Leg Calf Raise",
      "Ankle Banded Dorsiflexion Mobilization",
    ],
    tissuePriorities: "Shoulder and rotator cuff pre-activation before every session. Patellar and Achilles tendon tissue work given jump volume. Ankle dorsiflexion for landing mechanics.",
    inSeasonNote: "In-season: daily shoulder activation pre-practice. Calf/Achilles tissue loading 2×/week post-session. Monitor patellar tendon loading given jump frequency.",
  },
  rugby: {
    sport: "rugby",
    primaryRegions: ["hip", "adductor", "hamstring", "thoracic_spine", "shoulder", "trunk"],
    criticalExercises: [
      "Copenhagen Plank",
      "Nordic Hamstring Curl",
      "Pallof Press",
      "World's Greatest Stretch",
      "Thoracic Extension Over Foam Roller",
    ],
    tissuePriorities: "High contact and multi-directional demands: adductor/hamstring resilience priority. Trunk anti-rotation under contact. Thoracic rotation for offloading and tackling mechanics.",
    inSeasonNote: "In-season: maintain adductor and hamstring tissue work at maintenance doses. Reduce new loading after physical game days.",
  },
  lacrosse: {
    sport: "lacrosse",
    primaryRegions: ["hip", "adductor", "shoulder", "trunk", "hamstring"],
    criticalExercises: [
      "Copenhagen Plank",
      "Pallof Press",
      "Band Pull-Apart",
      "Hip Airplane",
      "Nordic Hamstring Curl",
    ],
    tissuePriorities: "Multi-directional, stick-sport: adductor resilience, trunk rotation for stick handling, shoulder pre-activation for throwing/cradling.",
    inSeasonNote: "In-season: same as soccer for adductor/hamstring. Maintain shoulder activation pre-practice.",
  },
  track: {
    sport: "track",
    primaryRegions: ["hamstring", "calf", "ankle", "hip", "glute"],
    criticalExercises: [
      "Nordic Hamstring Curl",
      "Single-Leg Calf Raise",
      "Ankle Banded Dorsiflexion Mobilization",
      "Hip Flexor Lunge Stretch",
      "Hip 90/90 Stretch",
    ],
    tissuePriorities: "Sprint athletes: hamstring injury prevention is #1 (Nordic curl), Achilles/calf tissue tolerance is #2. Ankle dorsiflexion for sprint mechanics.",
    inSeasonNote: "In-season/competition period: maintain Nordic curls 2×/week at maintenance dose. Calf tissue loading post-session only. Reduce static stretching before sprint sessions.",
  },
};

// ─── Session Placement Logic ──────────────────────────────────────────────────

export interface SessionMobilityBlock {
  placement: SessionPlacement;
  label: string;
  exercises: MovementSupportExercise[];
  duration: string;
  rationale: string;
}

export function buildMobilityBlockForSession(
  sessionFocus: string,       // e.g. "lower body", "upper body", "full body"
  sport: string | null,
  purposes: MovementSupportPurpose[],
  maxExercises: number = 4,
): MovementSupportExercise[] {
  const focusLower = sessionFocus.toLowerCase();

  let relevantExercises = MOVEMENT_SUPPORT_LIBRARY.filter((ex) => {
    const hasRelevantPurpose = ex.purposes.some((p) => purposes.includes(p));
    const matchesSport = sport ? (ex.sportTags.length === 0 || ex.sportTags.includes(sport)) : true;
    return hasRelevantPurpose && matchesSport;
  });

  // Score exercises by relevance
  const scored = relevantExercises.map((ex) => {
    let score = 0;

    // Session focus alignment
    if (focusLower.includes("lower") || focusLower.includes("leg") || focusLower.includes("squat") || focusLower.includes("hinge")) {
      if (ex.bodyRegions.some((r) => ["hip", "ankle", "knee", "hamstring", "adductor", "glute", "calf"].includes(r))) score += 3;
    }
    if (focusLower.includes("upper") || focusLower.includes("push") || focusLower.includes("pull") || focusLower.includes("press")) {
      if (ex.bodyRegions.some((r) => ["shoulder", "scapular", "rotator_cuff", "thoracic_spine", "wrist", "elbow"].includes(r))) score += 3;
    }
    if (focusLower.includes("full") || focusLower.includes("total")) {
      score += 1;
    }

    // Sport tag alignment
    if (sport && ex.sportTags.includes(sport)) score += 2;

    // Purpose match strength
    const purposeMatches = ex.purposes.filter((p) => purposes.includes(p)).length;
    score += purposeMatches;

    // Prefer lower intensity for warmup
    if (purposes.includes("warmup") || purposes.includes("pre_lift_prep")) {
      if (ex.intensityLevel === "passive" || ex.intensityLevel === "low") score += 1;
    }

    return { exercise: ex, score };
  });

  // Sort by score, deduplicate by category to ensure variety
  scored.sort((a, b) => b.score - a.score);

  const selected: MovementSupportExercise[] = [];
  const usedCategories = new Set<MovementSupportCategory>();

  for (const { exercise } of scored) {
    if (selected.length >= maxExercises) break;

    // Allow at most 2 per category
    const categoryCount = selected.filter((e) => e.category === exercise.category).length;
    if (categoryCount < 2) {
      selected.push(exercise);
      usedCategories.add(exercise.category);
    }
  }

  return selected;
}

// ─── Programming Rules ────────────────────────────────────────────────────────

export const MOBILITY_PROGRAMMING_RULES = [
  "Warm-up and prep work should be concise and targeted — 4–8 exercises maximum, focused on what the session demands.",
  "Do not overload sessions with unfocused mobility work — every drill should serve the session's demands or the athlete's weak links.",
  "Static flexibility work is generally better post-session or on recovery days — pre-session static stretching can reduce power output.",
  "Activation and primer work should sharpen the primary work, not fatigue it — keep intensity low and dosage appropriate.",
  "Tissue tolerance work (Nordic curls, Copenhagen planks, calf raises) is a training adaptation, not just prep — it belongs in the accessory block or finisher.",
  "Recovery days should be meaningful, not random — target the tissues stressed most in the previous sessions.",
  "In-season: maintain tissue work at maintenance dose (do not add volume) — the goal is resilience preservation, not new adaptation.",
  "Movement prep should match the session: lower-body session → hip/ankle/hamstring prep; upper-body session → shoulder/thoracic prep.",
  "Flexibility drills like pigeon pose or static hamstring stretch are post-session or rest-day tools, not pre-session tools.",
  "Coaching note: mobility work is never junk volume when targeted correctly — but unfocused stretching 'for the sake of it' dilutes the training signal.",
];

// ─── Trigger Categories ───────────────────────────────────────────────────────

export type MobilityRequestType =
  | "add_mobility"            // "add mobility to this day"
  | "better_warmup"           // "give me a better warm-up"
  | "tight_body_part"         // "my hips are tight"
  | "flexibility_work"        // "I want more flexibility work"
  | "recovery_work"           // "add recovery work"
  | "sport_friendly"          // "make this more shoulder friendly"
  | "recovery_day"            // "build me a recovery / movement day"
  | "sport_resilience"        // "make this more resilient for soccer"
  | "general_mobility";       // General detection

export function classifyMobilityRequest(message: string): MobilityRequestType {
  const m = message.toLowerCase();

  if (/recovery day|movement day|active recovery|restoration day/.test(m)) return "recovery_day";
  if (/resilient|resilience|tissue/.test(m)) return "sport_resilience";
  if (/(shoulder|knee|hip|ankle|wrist|elbow|back).?(friendly|safe)/.test(m)) return "sport_friendly";
  if (/recovery work|add recovery|more recovery/.test(m)) return "recovery_work";
  if (/flexibility|stretch|static stretch/.test(m)) return "flexibility_work";
  if (/(tight|stiff|sore|ache)/.test(m)) return "tight_body_part";
  if (/warm.?up|warmup|movement prep/.test(m)) return "better_warmup";
  if (/add mobility|more mobility|mobility work/.test(m)) return "add_mobility";

  return "general_mobility";
}

// ─── Context Builder (System Prompt Injection) ────────────────────────────────

export interface MobilityContextInput {
  message: string;
  sport: string | null;
  sessionType?: string;
  isInSeason?: boolean;
  isReEntry?: boolean;
}

export function buildMobilityContext(input: MobilityContextInput): string {
  const { message, sport, isInSeason, isReEntry } = input;
  const requestType = classifyMobilityRequest(message);
  const detectedRegions = extractMobilityBodyRegions(message);
  const purposes = inferMobilityPurposes(message, sport);

  const sportProfile = sport ? SPORT_MOBILITY_PROFILES[sport] ?? null : null;

  const regionFocus = detectedRegions.length > 0
    ? `Detected body regions of concern: ${detectedRegions.join(", ")}.`
    : sport && sportProfile
    ? `Sport-specific priority regions: ${sportProfile.primaryRegions.join(", ")}.`
    : "No specific body region identified — use session focus to guide selection.";

  const sportMobilitySection = sportProfile ? `
### SPORT-SPECIFIC MOBILITY PROFILE — ${sport?.toUpperCase()}
${sportProfile.tissuePriorities}

Critical exercises for this sport:
${sportProfile.criticalExercises.map((e) => `  • ${e}`).join("\n")}

${isInSeason ? `IN-SEASON PROTOCOL:\n${sportProfile.inSeasonNote}` : ""}
` : "";

  const requestTypeGuidance = buildRequestTypeGuidance(requestType, detectedRegions, sport);

  return `
## MOBILITY & MOVEMENT SUPPORT ENGINE — ACTIVE

### REQUEST CLASSIFICATION
Type: ${requestType.toUpperCase().replace(/_/g, " ")}
${regionFocus}
Purposes inferred: ${purposes.join(", ")}

### WHAT THIS ENGINE DOES
TrainChat now programs mobility, flexibility, activation, tissue tolerance, and movement-support work as a structured layer — not as an afterthought.

The movement support system has 8 categories:
- **mobility** — active range-of-motion development (joint CARs, ankle/hip circles, thoracic rotation)
- **flexibility** — passive tissue length work (static stretches — post-session or recovery day)
- **activation** — neuromuscular firing and primer work (band pull-aparts, lateral band walks, glute bridges)
- **tissue_tolerance** — tendon/fascial load management (Nordic curls, Copenhagen planks, calf raises)
- **positional_stability** — end-range joint control (dead bug, bird dog, Pallof press)
- **recovery_restoration** — post-session and recovery-day work (foam rolling, breathing, passive stretching)
- **movement_prep** — full warm-up architecture (World's Greatest Stretch, Cat-Cow, general aerobic raise)
- **cooldown_downregulation** — nervous system wind-down (diaphragmatic breathing, Child's Pose)

${requestTypeGuidance}

### SESSION PLACEMENT RULES
- **Warm-up/prep block**: mobility, activation, movement_prep — always first
- **Primer before main lift**: activation, positional_stability — just before the first primary exercise
- **Between-set filler**: passive mobility, low-demand activation — must not create fatigue
- **Accessory support block**: tissue_tolerance, positional_stability — after primary work
- **Finisher**: tissue_tolerance (Nordic curls, Copenhagen planks, calf raises)
- **Recovery day**: flexibility, recovery_restoration, cooldown_downregulation — the entire session
- **Cooldown block**: flexibility, cooldown_downregulation — post-session

### PROGRAMMING RULES — MANDATORY
${MOBILITY_PROGRAMMING_RULES.map((r) => `  • ${r}`).join("\n")}

${sportMobilitySection}

${isReEntry ? `
### RE-ENTRY + MOBILITY INTEGRATION
During re-entry, movement quality and tissue tolerance are PRIMARY objectives — not secondary.
- Every re-entry session should begin with a targeted 8–12 minute movement prep block
- Tissue tolerance work (Nordic curls, Copenhagen planks, calf raises) starts at the lowest dosage and builds
- Static flexibility work is appropriate post-session in all re-entry phases
- Movement complexity stays low — prioritize drilling positions, not loading them
- Body region activation before every primary pattern
` : ""}

### ANTI-PATTERNS — DO NOT DO THESE
  ✗ Do NOT add random stretches at the start of sessions that don't match session demands
  ✗ Do NOT prescribe static stretching before a sprint or power session (blunts power output)
  ✗ Do NOT treat "mobility" as a filler — every drill must serve the session
  ✗ Do NOT add tissue tolerance work (Nordics, Copenhagen) mid-warmup — it belongs in the accessory block
  ✗ Do NOT confuse "recovery day" with "light lifting day" — recovery days are mobility, flexibility, and restoration only
  ✗ Do NOT overload movement prep — 4–8 targeted exercises is a warm-up, 15 drills is noise
`.trim();
}

// ─── Request-Type Specific Guidance ──────────────────────────────────────────

function buildRequestTypeGuidance(
  type: MobilityRequestType,
  regions: BodyRegion[],
  sport: string | null,
): string {
  const regionStr = regions.length > 0 ? regions.join(", ") : "the session's relevant joints";

  switch (type) {
    case "add_mobility":
      return `### GUIDANCE — ADD MOBILITY
Add a structured warm-up/prep block targeting ${regionStr}.
Architecture: 5 min aerobic raise → 3–5 targeted mobility/activation drills → primer exercise before main lift.
Choose drills that directly prepare the joints and movement patterns the session will load.`;

    case "better_warmup":
      return `### GUIDANCE — IMPROVED WARM-UP
Build a purposeful warm-up, not a random collection of stretches.
Structure: (1) Aerobic temperature raise (3–5 min) → (2) Joint mobility for session demands → (3) Activation drills → (4) Movement prep pattern.
Total warm-up: 8–12 minutes. Concise, targeted, session-matched.`;

    case "tight_body_part":
      return `### GUIDANCE — ADDRESSING TIGHTNESS
"Tight" almost always means: restricted ROM, poor tissue tolerance, or inhibited muscles — not just short tissue.
For ${regionStr}: address with mobility drills first (active ROM), then targeted activation of the opposing muscle group.
Static stretching for the "tight" area is appropriate post-session, not pre-session.
If tightness persists: consider tissue tolerance loading (e.g., Nordic curls for hamstrings, Copenhagen planks for adductors).`;

    case "flexibility_work":
      return `### GUIDANCE — FLEXIBILITY WORK
Static flexibility work is most effective post-session or on recovery days.
Pre-session: use active mobility and activation drills instead of passive stretching.
Post-session or recovery day: target ${regionStr} with 30–90 second static holds.
For long-term flexibility development: 3–5× per week, post-training or standalone.`;

    case "recovery_work":
      return `### GUIDANCE — RECOVERY WORK
Recovery work is structured, not random stretching.
Components: (1) Light aerobic — walk, bike, swim (15–20 min at easy effort) → (2) Foam rolling key regions (60–90 sec each) → (3) Targeted static flexibility → (4) Diaphragmatic breathing.
Recovery sessions should feel restorative, not fatiguing.`;

    case "sport_friendly":
      return `### GUIDANCE — JOINT-FRIENDLY MODIFICATION
Making sessions more joint-friendly means:
1. Adding pre-session activation for the affected joint (band work, light isolation)
2. Reducing joint stress in primary exercise selection (where indicated)
3. Adding post-session tissue tolerance and flexibility work for that joint
Target: ${regionStr}. Address prep, loading strategy, and recovery in that order.`;

    case "recovery_day":
      return `### GUIDANCE — RECOVERY / MOVEMENT DAY
A recovery day is NOT a light lifting day. It is a structured restoration session.
Structure: (1) Easy aerobic activity (20 min walk, bike, swim) → (2) Foam rolling priority regions (5–8 min) → (3) Static flexibility for tissues most stressed this week (10–15 min) → (4) Breathing and downregulation (5 min).
Total: 40–50 minutes. Should feel like active recovery — not training.`;

    case "sport_resilience":
      return `### GUIDANCE — SPORT RESILIENCE PROGRAMMING
Sport resilience means progressive tissue tolerance loading for the injury-risk zones of the athlete's sport.
${sport ? `For ${sport}: see sport-specific mobility profile above for priority exercises and dosage.` : ""}
Tissue tolerance work (Nordic curls, Copenhagen planks, Achilles loading) is prescription work, not prep work — it belongs in the accessory block and builds over weeks.
Program this progressively: start conservative, add 1–2 reps or 5–10 seconds per week.`;

    default:
      return `### GUIDANCE — MOVEMENT SUPPORT
Add targeted movement prep and support work appropriate to the session's demands.
Match the mobility work to what the session loads: lower-body session → hip/ankle/hamstring prep; upper-body session → shoulder/thoracic prep.`;
  }
}

// ─── Trigger Check ────────────────────────────────────────────────────────────

export function needsMobilityContext(
  message: string,
  profileGoal: string,
  sport: string | null,
): boolean {
  const combined = message + " " + profileGoal;

  // Direct message trigger
  if (detectMobilityRequest(message)) return true;

  // Sport with re-entry (always benefits from mobility context)
  if (sport && /return|re.?entry|rebuild|haven.?t.?trained|getting.?back/.test(combined)) return true;

  // Recovery/restoration in goal
  if (/recovery|restoration|movement quality|tissue|resilience/.test(profileGoal.toLowerCase())) return true;

  return false;
}
