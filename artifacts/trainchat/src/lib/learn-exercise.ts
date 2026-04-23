/**
 * learn-exercise.ts
 *
 * Shared types, helpers, and coaching-intelligence fallbacks for the
 * Learn Exercise modal system. No backend required — all content is
 * derived client-side from exercise name, classification, and session context.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ExerciseRole =
  | "PRIMARY"
  | "SECONDARY"
  | "POWER"
  | "PREP"
  | "SKILL"
  | "TRUNK"
  | "ACCESSORY"
  | "CONDITIONING"
  | "SUPPORT"
  | null;

export interface LearnExerciseData {
  exerciseId?: string | null;
  exerciseName: string;
  canonicalExerciseName?: string | null;
  role?: ExerciseRole;
  movementFamily?: string | null;
  bodyRegion?: string | null;

  whyThisIsHere?: string | null;
  coachingCues?: string[];
  commonMistakes?: string[];

  easierOptions?: string[];
  harderOptions?: string[];
  substituteOptions?: string[];

  youtubeQuery?: string | null;
}

export interface LearnExerciseContext {
  dayIndex?: number | null;
  dayTitle?: string | null;
  sessionIdentity?: string | null;
  programTitle?: string | null;
  sport?: string | null;
  goal?: string | null;
}

// ─── Speed / Footwork slot patterns (client-side mirror of speed-engine.ts) ───
// Used to derive ExerciseRole deterministically from exercise name when the
// AI-output classification field is absent.

const CLIENT_SPEED_SLOT_PATTERNS: Array<{ slot: string; pattern: RegExp }> = [
  { slot: "activation",        pattern: /ankle.stiff(?:ness)?(?:.prep)?|hip.hinge.march|single.leg.hip.hinge/i },
  { slot: "sprint_prep",       pattern: /wall.march|wall.drive|a.skip|b.skip|march.to.skip|march.to.run|build.up.run|build.?up.run|speed.ladder.in.out|linear.ladder(?!.*reactive)|ladder.in.out/i },
  { slot: "speed_primary",     pattern: /falling.start|flying.(?:20|30|40|start)|block.start|kneeling.start|sled.sprint|t.drill|5.10.5|l.drill|box.drill|505.drill|wicket.run/i },
  { slot: "reactive_plyo",     pattern: /stiffness.hop|pogo.hop|lateral.hurdle.hop|single.leg.stiffness|countermovement.jump|single.leg.decel|linear.bound|alternating.bound|lateral.bound|skater.jump/i },
  { slot: "cod_footwork",      pattern: /ickey.shuffle|lateral.ladder|carioca|zigzag.hop|mirror.drill|drop.step.decel|crossover.step|shadow.footwork|reactive.(?:ladder|agility|cone)|reactive.drill/i },
  { slot: "speed_endurance",   pattern: /repeat.(?:30|40|60)m.sprint|tempo.run|150m.speed.endurance|assault.bike.sprint/i },
  { slot: "resilience_finish", pattern: /nordic|isometric.hamstring|isometric.ham(?:string)?|copenhagen|straight.leg.calf|calf.march|jump.squat|trap.bar.jump|power.clean/i },
];

/**
 * Detects the canonical Speed / Footwork flow slot for a given exercise name.
 * Returns null if the name does not match any speed slot.
 */
export function deriveSpeedSlotFromName(name: string): string | null {
  const match = CLIENT_SPEED_SLOT_PATTERNS.find((p) => p.pattern.test(name));
  return match?.slot ?? null;
}

/**
 * Maps a speed flow slot string to the corresponding ExerciseRole badge.
 *
 * Speed slot → display role mapping (coach-like labels):
 *   activation        → PREP
 *   sprint_prep       → PREP
 *   speed_primary     → PRIMARY
 *   reactive_plyo     → POWER
 *   cod_footwork      → SKILL
 *   speed_endurance   → CONDITIONING
 *   resilience_finish → ACCESSORY
 */
export function mapSpeedSlotToRole(slot: string): ExerciseRole {
  switch (slot) {
    case "activation":        return "PREP";
    case "sprint_prep":       return "PREP";
    case "speed_primary":     return "PRIMARY";
    case "reactive_plyo":     return "POWER";
    case "cod_footwork":      return "SKILL";
    case "speed_endurance":   return "CONDITIONING";
    case "resilience_finish": return "ACCESSORY";
    default:                  return null;
  }
}

// ─── Internal category system ─────────────────────────────────────────────────

type ExerciseCategory =
  | "bilateral_squat"
  | "unilateral_lower"
  | "hinge"
  | "upper_push"
  | "overhead_press"
  | "upper_pull"
  | "row"
  | "carry_loaded"
  | "power_jump"
  | "power_throw"
  | "sprint"
  | "trunk_anti_extension"
  | "trunk_anti_rotation"
  | "trunk_flexion"
  | "conditioning"
  | "prep_mobility"
  | "curl_isolation"
  | "tricep_isolation"
  | "generic";

function detectCategory(name: string): ExerciseCategory {
  const n = name.toLowerCase();
  if (/plank|dead\s*bug|ab\s*wheel|hollow|rollout|stir|saw/.test(n)) return "trunk_anti_extension";
  if (/pallof|anti.?rotat|side.*plank/.test(n)) return "trunk_anti_rotation";
  if (/crunch|sit.?up|leg\s*raise|cable\s*crunch/.test(n)) return "trunk_flexion";
  if (/box\s*jump|broad\s*jump|depth\s*jump|vertical\s*jump|plyometric|jump\s*squat|bounding|skater/.test(n)) return "power_jump";
  if (/med\s*ball|slam|rotational.*throw|shot\s*put|power\s*clean|hang\s*clean|snatch/.test(n)) return "power_throw";
  if (/sprint|acceleration|hill\s*run|sled\s*push|sled\s*pull|prowler/.test(n)) return "sprint";
  if (/carry|farmers|suitcase/.test(n)) return "carry_loaded";
  if (/deadlift|rdl|romanian|good\s*morning|swing|trap\s*bar|sumo/.test(n)) return "hinge";
  if (/squat|goblet|front\s*squat|hack\s*squat|leg\s*press|belt\s*squat/.test(n)) return "bilateral_squat";
  if (/split\s*squat|lunge|step.?up|single.?leg\s*squat|pistol|bulgarian|reverse\s*lunge|walking\s*lunge/.test(n)) return "unilateral_lower";
  if (/bench\s*press|push.?up|dip|floor\s*press|chest\s*press|chest\s*fly|incline|decline/.test(n)) return "upper_push";
  if (/overhead\s*press|ohp|shoulder\s*press|military\s*press|arnold\s*press/.test(n) && !/bench/.test(n)) return "overhead_press";
  if (/pull.?up|chin.?up|lat\s*pulldown/.test(n)) return "upper_pull";
  if (/row|rhomboid|face\s*pull|inverted\s*row|t.?bar/.test(n)) return "row";
  if (/curl|bicep|hammer\s*curl|preacher/.test(n)) return "curl_isolation";
  if (/tricep|pushdown|skull\s*crusher/.test(n)) return "tricep_isolation";
  if (/jog|run|bike|rower|ski\s*erg|assault\s*bike|interval/.test(n)) return "conditioning";
  if (/warm|mobility|stretch|activation|foam\s*roll|hip\s*circle|inchworm|leg\s*swing/.test(n)) return "prep_mobility";
  return "generic";
}

interface CategoryCoachingData {
  movementFamily: string;
  bodyRegion: string;
  why: (name: string, context?: LearnExerciseContext) => string;
  cues: string[];
  mistakes: string[];
  easier: string;
  harder: string;
  substitute: string;
}

const CATEGORY_DATA: Record<ExerciseCategory, CategoryCoachingData> = {
  bilateral_squat: {
    movementFamily: "Bilateral Squat",
    bodyRegion: "Lower Body",
    why: (n, ctx) =>
      `${n} is a foundational bilateral strength movement that builds lower body force production — the base for speed, jumping, and sport performance. In a ${ctx?.sessionIdentity ?? "strength"} session it's placed early while the CNS is fresh for maximum quality. The bilateral squat pattern is the highest-return movement for lower body hypertrophy and structural strength.`,
    cues: [
      "Brace your core hard before the descent — treat your torso like a rigid column",
      "Knee tracks the second toe — push them out actively throughout",
      "Drive vertically through the floor on the way up, not back",
      "Control the lowering phase — 2–3 seconds down builds more muscle",
    ],
    mistakes: [
      "Losing tension at the bottom — the 'butt wink' happens when core and hips aren't engaged",
      "Knees caving inward under load — push them out throughout the whole rep",
      "Cutting depth to use more weight — full depth is the point",
    ],
    easier: "Goblet Squat (lighter, teaches upright torso automatically)",
    harder: "Pause Squat — 3 seconds at the bottom, then drive",
    substitute: "Leg Press (removes spinal loading while keeping quad/glute demand)",
  },
  unilateral_lower: {
    movementFamily: "Unilateral Lower",
    bodyRegion: "Lower Body",
    why: (n) =>
      `${n} develops single-leg strength, hip stability, and balance — critical for running mechanics, change of direction, and correcting left-right asymmetries. Unilateral work also loads the hip in ways bilateral squat patterns can't replicate.`,
    cues: [
      "Front foot far enough forward that your shin stays mostly vertical",
      "Drive through the heel of the front foot — feel the glute engage",
      "Keep the torso upright — don't lean forward under load",
      "Control the knee — don't let it drift inward during the push phase",
    ],
    mistakes: [
      "Front foot too close — forces the shin forward, shifts all load to the quad",
      "Letting the rear knee bang the floor — you've lost control of the descent",
      "Holding the breath mid-set — loses core tension and posture",
    ],
    easier: "Reverse Lunge (more stable, shorter range of motion)",
    harder: "Weighted Bulgarian Split Squat (barbell on back)",
    substitute: "Step-Up (hip-drive alternative if knee is sensitive)",
  },
  hinge: {
    movementFamily: "Hip Hinge",
    bodyRegion: "Posterior Chain",
    why: (n) =>
      `${n} trains the posterior chain — glutes, hamstrings, and spinal erectors — through a loaded hip hinge. It's one of the highest-return strength movements for athletic power, injury resilience, and full-body muscle development. This pattern is irreplaceable in any serious program.`,
    cues: [
      "Hinge at the hips, not the lower back — push your hips back like closing a door with your glutes",
      "Keep the bar close to your body throughout — near contact the whole way",
      "Create lat tension before pulling — 'protect your armpits'",
      "Lock out by driving hips through, not by extending the lower back",
    ],
    mistakes: [
      "Rounding the lower back under load — the lumbar spine is not a load-bearing structure in flexion",
      "Bar drifting away from the body — doubles the effective load on the lumbar",
      "Jerking the bar off the floor — tension should already be built before it moves",
    ],
    easier: "Romanian Deadlift (hip hinge without floor contact, easier to control)",
    harder: "Conventional Deadlift with a 2-second pause at the knee on the way down",
    substitute: "Trap Bar Deadlift (more upright torso, same hip drive demand)",
  },
  upper_push: {
    movementFamily: "Horizontal Push",
    bodyRegion: "Upper Body",
    why: (n) =>
      `${n} builds pressing strength through the chest, anterior deltoid, and triceps. Horizontal pushing pairs with pulling work to balance shoulder health and build the upper body pressing capacity required in most athletic and physique goals.`,
    cues: [
      "Retract and depress the scapula before pressing — 'chest proud, shoulder blades squeezed together'",
      "Elbows 45–60° from the torso — not flared, not fully tucked",
      "Control the bar down — 2-second descent maximizes the stimulus",
      "Finish the rep with full lockout — don't short-change the top range",
    ],
    mistakes: [
      "Elbows flared to 90° — creates unnecessary torque on the shoulder joint",
      "Bouncing the bar off the chest — eliminates the most productive part of the lift",
      "Not creating full-body tension — leg drive, core brace, and upper back all contribute",
    ],
    easier: "Dumbbell Press (each arm works independently, more natural arc)",
    harder: "Paused Rep Bench Press (1–2 second dead stop at the chest)",
    substitute: "Push-Up with feet elevated (same pattern, no equipment needed)",
  },
  overhead_press: {
    movementFamily: "Vertical Push",
    bodyRegion: "Shoulders",
    why: (n) =>
      `${n} builds overhead pressing strength and requires full shoulder mobility and spinal stability. It develops the deltoids, upper traps, and triceps through a vertical force vector — essential for athletes who express or absorb force overhead.`,
    cues: [
      "Press in front of the face, not behind — more muscle, dramatically less risk",
      "Full lockout at the top — don't stop short of full elbow extension",
      "Brace hard — the weight compresses directly through your spine",
      "Keep the bar over the mid-foot at the top",
    ],
    mistakes: [
      "Excessive lower back extension — means shoulder mobility is limiting you, not strength",
      "Bar path drifting forward — wastes energy and puts load off-axis",
      "Stopping short of lockout — misses the stabilizer demand at the top",
    ],
    easier: "Seated Dumbbell Press (removes the balance requirement)",
    harder: "Strict Press with a 2-second pause at the clavicle level",
    substitute: "Landmine Press (shoulder-friendly arc of motion, less overhead range needed)",
  },
  upper_pull: {
    movementFamily: "Vertical Pull",
    bodyRegion: "Upper Back",
    why: (n) =>
      `${n} develops lat, rhomboid, and bicep strength through a vertical pulling pattern. Back strength protects the shoulder joint and balances the pressing volume in any well-designed program. This movement's full range of motion is where most of the long-term lat development happens.`,
    cues: [
      "Start from a dead hang — the full lat stretch at the bottom is where gains live",
      "Lead with the chest, not the chin — 'chest to bar' not 'chin over bar'",
      "Initiate by depressing the shoulder blades — the pull starts from the back, not the arms",
      "Control the descent — resist gravity over 2 seconds",
    ],
    mistakes: [
      "Kipping or swinging for momentum — loads the shoulder in an uncontrolled position",
      "Short range of motion — stopping before full lockout removes the most productive portion",
      "Arms doing all the work — if you don't feel it in your lats, start the pull from the elbows",
    ],
    easier: "Lat Pulldown (same pattern, fully adjustable load)",
    harder: "Weighted Pull-Up with a loading belt",
    substitute: "Ring Row or Inverted Row (horizontal pull alternative, fully scalable)",
  },
  row: {
    movementFamily: "Horizontal Pull",
    bodyRegion: "Mid Upper Back",
    why: (n) =>
      `${n} trains the mid and upper back through a horizontal pulling pattern. Every pressing movement in your program needs a corresponding row to maintain shoulder health, posture, and structural balance. This is non-negotiable in a well-designed program.`,
    cues: [
      "Drive the elbows back — think 'crack a walnut between your shoulder blades'",
      "Keep the torso fixed — no body swing or momentum",
      "Full range: reach forward to stretch, pull back to feel the contraction",
      "Pause at the top for 1 second and squeeze",
    ],
    mistakes: [
      "Using body swing to move heavier weight — shifts load from the target muscles to the spine",
      "Pulling to the wrong height — rows should pull to the lower chest, not the neck",
      "Rushing the lowering phase — the eccentric is half the stimulus",
    ],
    easier: "Seated Cable Row (constant tension, easy to learn and cue)",
    harder: "Barbell Bent-Over Row with a 3-second pause at the top",
    substitute: "Face Pull (rear delt and external rotation emphasis)",
  },
  carry_loaded: {
    movementFamily: "Loaded Carry",
    bodyRegion: "Full Body",
    why: (n) =>
      `${n} builds total-body stability, grip strength, and single-leg loading tolerance under real compressive force. It trains the core the way it actually functions in sport — braced under moving load. There is no better anti-lateral-flexion exercise.`,
    cues: [
      "Stand tall — don't let the weight tilt your torso",
      "Short, controlled steps — don't rush",
      "Shoulders packed down and back — don't let heavy load drag the shoulder down",
      "Breathe through the movement — don't hold for the entire carry",
    ],
    mistakes: [
      "Leaning toward the load — means the core isn't bracing hard enough",
      "Walking too fast — turns it into conditioning rather than strength",
      "Losing shoulder position under max weight",
    ],
    easier: "Lighter load, shorter distance",
    harder: "Offset carry — different load in each hand",
    substitute: "Side Plank (anti-lateral flexion without locomotion)",
  },
  power_jump: {
    movementFamily: "Plyometric / Power",
    bodyRegion: "Lower Body",
    why: (n) =>
      `${n} trains rate of force development — the ability to produce maximum force in minimum time. This is the most sport-relevant quality in the program. CNS-demanding, which is why it appears first in the session while the nervous system is completely fresh.`,
    cues: [
      "Max intent on every rep — this is not a medium-effort exercise",
      "Full hip, knee, and ankle extension at the top — don't cut it short",
      "Land softly — absorb force through ankles, knees, and hips",
      "Step down from the box — never jump down (cumulative impact adds up)",
    ],
    mistakes: [
      "Treating it like cardio — slow fatigued reps completely defeat the purpose",
      "Not resetting fully between reps — power work requires near-full recovery",
      "Landing stiff-legged — places enormous force into passive structures",
    ],
    easier: "Squat Jump (no box, lower CNS demand)",
    harder: "Depth Jump (drop and rebound — maximum reactive demand)",
    substitute: "Broad Jump (same power intent, horizontal direction)",
  },
  power_throw: {
    movementFamily: "Olympic / Ballistic Power",
    bodyRegion: "Full Body",
    why: (n) =>
      `${n} is one of the most technically demanding movements in the program. It trains the complete kinetic chain at maximal velocity — building power, coordination, and neural efficiency that transfers to nearly every athletic action from sprinting to contact sports.`,
    cues: [
      "Start position is everything — brace before you initiate, mid-foot balance",
      "The 'pull' is actually a push from the floor — drive your legs first, not your arms",
      "High elbows on the catch — bar should travel in a vertical path",
      "Reset fully between reps — this is not a rep-cadence exercise",
    ],
    mistakes: [
      "Early arm pull — arms stay straight until the hips fully extend",
      "Bar drifting forward on the first pull",
      "Catching in a partial position when full depth is prescribed",
    ],
    easier: "Hang Power Clean (starts from hip, reduces the technical demand significantly)",
    harder: "Full Clean from Floor (complete sequence with full hip and knee drive)",
    substitute: "Med Ball Slam (same power intent, zero technical risk)",
  },
  sprint: {
    movementFamily: "Sprint / Speed",
    bodyRegion: "Full Body",
    why: (n) =>
      `${n} develops straight-line acceleration and top-end speed — the most explosive output any athlete produces. CNS-intensive and placed first in the session when the nervous system is at peak capacity. Slow sprint work is wasted sprint work.`,
    cues: [
      "Lean from the ankles in acceleration — not from the waist",
      "Drive the arms hard — arm action drives leg action",
      "Full extension at the hip at toe-off — don't cut the stride short",
      "Eyes forward, head neutral — facial and neck tension affects mechanics everywhere",
    ],
    mistakes: [
      "Sitting back in the hips during acceleration — kills the forward force angle",
      "Overstriding at top speed — increases ground contact time and drops velocity",
      "Running slow reps to save energy — defeats the entire neurological purpose",
    ],
    easier: "30m acceleration at 85% effort",
    harder: "Resisted sprint with sled at 5–10% bodyweight",
    substitute: "Assault bike sprint (same metabolic demand, lower impact)",
  },
  trunk_anti_extension: {
    movementFamily: "Anti-Extension Core",
    bodyRegion: "Core",
    why: (n) =>
      `${n} trains spinal stability against extension forces — the same demand the spine faces under squat, deadlift, and sprint loads. A strong anti-extension core protects the lumbar and improves force transfer between the lower and upper body.`,
    cues: [
      "Posterior pelvic tilt — neutral spine, no excessive lower back arch",
      "Squeeze the glutes and brace the abdomen simultaneously",
      "Don't let your hips sag — the instant they drop you've lost the adaptation",
      "Breathe normally — gripping the breath creates a false sense of stability",
    ],
    mistakes: [
      "Hips too high — turns it into a rest position",
      "Holding the breath throughout the hold",
      "Not engaging the glutes — they're the primary lumbar stabilizers",
    ],
    easier: "Forearm Plank with one knee lightly touching the floor",
    harder: "Ab Wheel Rollout from knees",
    substitute: "Dead Bug (anti-extension stimulus, more accessible for beginners)",
  },
  trunk_anti_rotation: {
    movementFamily: "Anti-Rotation Core",
    bodyRegion: "Core",
    why: (n) =>
      `${n} trains the core's ability to resist rotation — fundamental for change of direction, throwing, and transferring power between the lower and upper body. It targets the obliques and deep stabilizers under directional load.`,
    cues: [
      "Stand tall — don't let the anchor pull your torso sideways",
      "Press to full arm extension and hold — resist the rotation actively",
      "Breathe throughout — don't hold your breath as a compensation",
      "Slow and controlled — this is about resisting force, not creating it",
    ],
    mistakes: [
      "Rotating toward the anchor — the entire goal is to resist that rotation",
      "Using momentum or shortened range of motion",
      "Standing too close — reduces resistance and range",
    ],
    easier: "Half-Kneeling Pallof Press (reduced stability challenge)",
    harder: "Standing Pallof Press with a 3-second pause at full extension",
    substitute: "Suitcase Carry (anti-lateral flexion via locomotion)",
  },
  trunk_flexion: {
    movementFamily: "Core Flexion",
    bodyRegion: "Core",
    why: (n) =>
      `${n} directly loads the rectus abdominis through trunk flexion. It contributes to visible core development and trains the trunk through its natural flexion pattern to complement the anti-extension and anti-rotation work in the program.`,
    cues: [
      "Curl the spine — don't just flex at the hip",
      "Exhale hard on the way up — diaphragm and core work together",
      "Control the lowering phase over 2–3 seconds",
      "Don't anchor the feet — that turns it into a hip flexor exercise",
    ],
    mistakes: [
      "Pulling on the head and neck — the cervical spine is not a load-bearing structure",
      "Using momentum to swing up — eliminates most of the stimulus",
      "Short range of motion — you need the full curl for full engagement",
    ],
    easier: "Crunches with knees bent and feet flat",
    harder: "Cable Crunch (progressive load on trunk flexion)",
    substitute: "Hanging Leg Raise (flexion with hip flexor component)",
  },
  conditioning: {
    movementFamily: "Energy System Training",
    bodyRegion: "Full Body",
    why: (n, ctx) =>
      `${n} targets the ${ctx?.goal ? ctx.goal + " energy system" : "aerobic or anaerobic energy system"} — building the metabolic engine that allows you to recover between sets, train at higher frequency, and sustain power output throughout competition. Conditioning is periodized just like strength.`,
    cues: [
      "Pace is prescribed — don't exceed the target zone",
      "Nasal breathing during aerobic work — it's a pacing signal, not just preference",
      "Consistency over intensity — base adaptations take weeks to build",
      "Monitor heart rate if possible — zone-based work has specific adaptations",
    ],
    mistakes: [
      "Going too hard on easy days — converts aerobic into anaerobic and slows recovery",
      "Skipping conditioning because it isn't 'lifting' — it's a performance requirement",
      "Treating all conditioning the same — intensity and duration determine the specific adaptation",
    ],
    easier: "Reduce duration or intensity by 20% and stay in the prescribed zone",
    harder: "Add intervals: work-to-rest ratio of 1:1 instead of 1:2",
    substitute: "Any low-impact option with the same duration and heart rate target",
  },
  prep_mobility: {
    movementFamily: "Movement Prep",
    bodyRegion: "Full Body",
    why: (n) =>
      `${n} primes joints and muscles before heavy loading. It raises tissue temperature, increases range of motion, and activates the neuromuscular patterns used in the main lifts. A proper warm-up directly improves performance and reduces injury risk in the working sets.`,
    cues: [
      "Move through full range — don't go through the motions with partial movement",
      "Controlled tempo — this is neural activation, not rushing to get to the bar",
      "Feel each end-range position — especially hip and thoracic mobility",
    ],
    mistakes: [
      "Skipping entirely — the first heavy set should never be the first time you move",
      "Going too fast — turns prep into momentum swinging instead of tissue preparation",
      "Static stretching only before loading — use dynamic movement first",
    ],
    easier: "Shorter duration with the same movement patterns",
    harder: "Add resistance bands to hip and shoulder mobility drills",
    substitute: "5-minute jog plus joint circles (minimal effective dose)",
  },
  curl_isolation: {
    movementFamily: "Isolation — Biceps",
    bodyRegion: "Arms",
    why: (n) =>
      `${n} directly loads the biceps brachii through elbow flexion. Isolation work at the end of a session targets muscles that don't receive enough direct stress from compound movements, contributing to hypertrophy and arm strength over time.`,
    cues: [
      "Supinate the wrist at the top — rotate the pinky toward the ceiling",
      "Don't swing — if you need momentum you've gone too heavy",
      "Squeeze hard at peak contraction",
      "Full extension at the bottom — the stretch position is where growth happens",
    ],
    mistakes: [
      "Body swing to move heavier weight — shifts load from the bicep to the lumbar",
      "Short range of motion — cutting off the stretch removes the most productive phase",
      "Too much weight too early — isolation work benefits from feeling the muscle",
    ],
    easier: "Cable Curl (constant tension throughout the range)",
    harder: "Incline Dumbbell Curl (maximizes stretch at the bottom)",
    substitute: "Hammer Curl (brachialis focus, easier on the wrists)",
  },
  tricep_isolation: {
    movementFamily: "Isolation — Triceps",
    bodyRegion: "Arms",
    why: (n) =>
      `${n} directly loads the triceps through elbow extension. The triceps make up approximately two-thirds of upper arm volume and are essential for pressing strength. This ensures full stimulus beyond what compound pressing can provide.`,
    cues: [
      "Full lockout — the long head only fully contracts at complete extension",
      "Keep elbows in — flared elbows reduce tricep tension and shift load elsewhere",
      "Only the forearm should move — don't recruit the shoulder",
      "Squeeze at full lockout on each rep",
    ],
    mistakes: [
      "Not reaching full lockout — misses the most productive portion of the range",
      "Elbows drifting out — converts it to a compound shoulder movement",
      "Too much weight — turns it into a shoulder exercise",
    ],
    easier: "Cable Pushdown (constant tension, easy to learn and isolate)",
    harder: "Skull Crusher followed by close-grip press at lockout",
    substitute: "Close-Grip Bench Press (compound pressing with tricep emphasis)",
  },
  generic: {
    movementFamily: "Strength Training",
    bodyRegion: "Multiple",
    why: (n) =>
      `${n} is included in this session based on your program goal and the training pattern of the day. Every exercise contributes a specific mechanical stimulus that complements the surrounding movements in the session.`,
    cues: [
      "Control the eccentric (lowering) phase — 2–3 seconds down",
      "Maintain a strong brace through every rep",
      "Full range of motion unless the prescription says otherwise",
      "Quality over quantity — stop the set if form breaks down",
    ],
    mistakes: [
      "Rushing through reps to finish faster — reduces mechanical stimulus",
      "Neglecting rest periods — recovery between sets is part of the prescription",
      "Inconsistent depth or range across a set",
    ],
    easier: "Reduce load by 15–20% and focus on technique quality",
    harder: "Add a 2-second pause at the hardest point of the movement",
    substitute: "Ask your coach for a specific contextual alternative",
  },
};

// ─── Public helpers ────────────────────────────────────────────────────────────

export function mapRole(classification?: string | null): ExerciseRole {
  if (!classification) return null;
  const c = classification.toUpperCase();
  if (c.includes("PRIMARY")) return "PRIMARY";
  if (c.includes("SECONDARY")) return "SECONDARY";
  if (c.includes("POWER") || c.includes("EXPLOSIVE") || c.includes("PLYOMETRIC")) return "POWER";
  if (c.includes("TRUNK") || c.includes("CORE")) return "TRUNK";
  if (c.includes("ACCESSORY") || c.includes("ISOLATION")) return "ACCESSORY";
  if (c.includes("CONDITIONING") || c.includes("CARDIO")) return "CONDITIONING";
  if (c.includes("PREP") || c.includes("MOBILITY") || c.includes("WARM")) return "SUPPORT";
  return null;
}

/**
 * Derives an ExerciseRole deterministically from context, without relying on
 * AI classification output. Resolution order:
 *   1. Explicit classification string (if provided)
 *   2. Speed slot derived from exercise name via canonical slot patterns
 *   3. DB category field (activation, power, primary, secondary, trunk, conditioning, finisher)
 *   4. null (caller decides how to handle absence)
 *
 * In dev mode, logs the resolution path for debugging.
 */
export function deriveRole(
  exerciseName: string,
  opts?: {
    classification?: string | null;
    slot?: string | null;
    dbCategory?: string | null;
  },
): ExerciseRole {
  const { classification, slot, dbCategory } = opts ?? {};

  // 1. Explicit AI classification string
  const fromClassification = mapRole(classification);
  if (fromClassification) {
    if (import.meta.env.DEV) {
      console.log("[ExerciseClassification] exercise=%s | slot=%s | mode=classification | role=%s | fallback=false",
        exerciseName, slot ?? "<none>", fromClassification);
    }
    return fromClassification;
  }

  // 2. Speed slot — either explicitly passed or derived from name
  const resolvedSlot = slot ?? deriveSpeedSlotFromName(exerciseName);
  if (resolvedSlot) {
    const fromSlot = mapSpeedSlotToRole(resolvedSlot);
    if (fromSlot) {
      if (import.meta.env.DEV) {
        console.log("[ExerciseClassification] exercise=%s | slot=%s | mode=slot | role=%s | fallback=%s",
          exerciseName, resolvedSlot, fromSlot, !slot ? "true (name-derived)" : "false");
      }
      return fromSlot;
    }
  }

  // 3. DB category
  if (dbCategory) {
    const fromDb = mapDbCategoryToRole(dbCategory);
    if (fromDb) {
      if (import.meta.env.DEV) {
        console.log("[ExerciseClassification] exercise=%s | slot=%s | mode=db-category | role=%s | fallback=true",
          exerciseName, resolvedSlot ?? "<none>", fromDb);
      }
      return fromDb;
    }
  }

  if (import.meta.env.DEV) {
    console.log("[ExerciseClassification] exercise=%s | slot=%s | mode=none | role=null | fallback=true",
      exerciseName, resolvedSlot ?? "<none>");
  }
  return null;
}

/**
 * Maps a DB category string (from training_session_exercises.category) to
 * the corresponding ExerciseRole for badge display.
 */
export function mapDbCategoryToRole(category: string): ExerciseRole {
  switch (category) {
    case "warmup":      return "SUPPORT";
    case "activation":  return "PREP";
    case "power":       return "POWER";
    case "primary":     return "PRIMARY";
    case "secondary":   return "SECONDARY";
    case "trunk":       return "TRUNK";
    case "conditioning":return "CONDITIONING";
    case "recovery":    return "SUPPORT";
    case "finisher":    return "ACCESSORY";
    case "accessory":   return "ACCESSORY";
    default:            return null;
  }
}

export function buildWhyFallback(
  exerciseName: string,
  context?: LearnExerciseContext | null,
  movementFamily?: string | null,
  role?: ExerciseRole,
): string {
  const category = detectCategory(exerciseName);
  return CATEGORY_DATA[category].why(exerciseName, context ?? undefined);
}

export function buildCueFallback(
  exerciseName: string,
  _movementFamily?: string | null,
): string[] {
  const category = detectCategory(exerciseName);
  return CATEGORY_DATA[category].cues;
}

export function buildMistakeFallback(
  exerciseName: string,
  _movementFamily?: string | null,
): string[] {
  const category = detectCategory(exerciseName);
  return CATEGORY_DATA[category].mistakes;
}

export function buildYoutubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function buildAskCoachPrompts(exerciseName: string): string[] {
  return [
    `Explain how to perform ${exerciseName}`,
    `Why is ${exerciseName} in my program?`,
    `Give me an easier version of ${exerciseName}`,
  ];
}

/**
 * Main factory — turns raw exercise row data into a fully-enriched
 * LearnExerciseData object with coaching intelligence.
 *
 * Role resolution priority:
 *   1. Explicit classification string from AI output (if present)
 *   2. Speed slot — either explicitly provided or derived from exercise name
 *   3. DB category string (if available via opts.dbCategory)
 *   4. null (no badge shown)
 */
export function buildLearnExerciseData(
  exerciseName: string,
  opts?: {
    exerciseNotes?: string;
    classification?: string;
    slot?: string;
    dbCategory?: string;
    dayFocus?: string;
    programGoal?: string;
    context?: LearnExerciseContext;
  },
): LearnExerciseData {
  const category = detectCategory(exerciseName);
  const catData = CATEGORY_DATA[category];
  const role = deriveRole(exerciseName, {
    classification: opts?.classification,
    slot: opts?.slot,
    dbCategory: opts?.dbCategory,
  });
  const ctx = opts?.context;

  return {
    exerciseName,
    canonicalExerciseName: exerciseName,
    role,
    movementFamily: catData.movementFamily,
    bodyRegion: catData.bodyRegion,
    whyThisIsHere: catData.why(exerciseName, ctx),
    coachingCues: catData.cues,
    commonMistakes: catData.mistakes,
    easierOptions: [catData.easier],
    harderOptions: [catData.harder],
    substituteOptions: [catData.substitute],
    youtubeQuery: `${exerciseName} exercise proper form strength training`,
  };
}
