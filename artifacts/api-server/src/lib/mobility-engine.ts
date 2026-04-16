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
