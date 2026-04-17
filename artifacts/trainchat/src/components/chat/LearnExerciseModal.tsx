/**
 * LearnExerciseModal
 *
 * Premium coaching assist layer. Opens as a bottom-sheet on mobile,
 * centered modal on desktop. Powered entirely by client-side coaching
 * intelligence derived from exercise name, classification, and session context.
 * No new API endpoints — "Ask coach" routes back through existing chat flow.
 */

import { X, BookOpen, ChevronRight, ExternalLink, Dumbbell } from "lucide-react";
import { useEffect, useRef } from "react";

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface LearnExerciseProps {
  exerciseName: string;
  exerciseNotes?: string;
  classification?: string;
  dayName?: string;
  dayFocus?: string;
  programGoal?: string;
  onClose: () => void;
  onAskCoach?: (message: string) => void;
}

// ─── Category detection ────────────────────────────────────────────────────────

type ExerciseCategory =
  | "bilateral_squat"
  | "unilateral_lower"
  | "hinge"
  | "upper_push"
  | "upper_pull"
  | "carry_loaded"
  | "power_jump"
  | "power_throw"
  | "sprint"
  | "trunk_anti_extension"
  | "trunk_anti_rotation"
  | "trunk_flexion"
  | "conditioning"
  | "prep_mobility"
  | "row"
  | "overhead_press"
  | "curl_isolation"
  | "tricep_isolation"
  | "generic";

function detectCategory(name: string): ExerciseCategory {
  const n = name.toLowerCase();

  if (/plank|dead\s*bug|ab\s*wheel|hollow|rollout|stir|saw/.test(n))
    return "trunk_anti_extension";
  if (/pallof|rotational|anti.?rotat|side.*plank/.test(n))
    return "trunk_anti_rotation";
  if (/crunch|sit.?up|leg\s*raise|cable\s*crunch|ab\s*crunch/.test(n))
    return "trunk_flexion";
  if (/box\s*jump|broad\s*jump|depth\s*jump|vertical\s*jump|plyometric|jump\s*squat|bounding|skater/.test(n))
    return "power_jump";
  if (/med\s*ball|slam|rotational.*throw|shot\s*put/.test(n))
    return "power_throw";
  if (/power\s*clean|hang\s*clean|snatch|hang\s*snatch|clean.*jerk|barbell\s*clean/.test(n))
    return "power_throw";
  if (/sprint|acceleration|fly.*10|hill\s*run|sled\s*push|sled\s*pull|prowler/.test(n))
    return "sprint";
  if (/carry|farmers|suitcase|overhead\s*carry/.test(n))
    return "carry_loaded";
  if (/deadlift|rdl|romanian|good\s*morning|swing|trap\s*bar|sumo/.test(n))
    return "hinge";
  if (/squat|goblet|front\s*squat|hack\s*squat|leg\s*press|belt\s*squat/.test(n))
    return "bilateral_squat";
  if (/split\s*squat|lunge|step.?up|single.?leg\s*squat|pistol|bulgarian|reverse\s*lunge|walking\s*lunge/.test(n))
    return "unilateral_lower";
  if (/bench\s*press|push.?up|dip|floor\s*press|landmine\s*press|chest\s*press|chest\s*fly|incline|decline/.test(n))
    return "upper_push";
  if (/overhead\s*press|ohp|shoulder\s*press|military\s*press|dumbbell\s*press|arnold\s*press/.test(n) &&
      !/incline|decline|bench/.test(n))
    return "overhead_press";
  if (/pull.?up|chin.?up|lat\s*pulldown|pull\s*down/.test(n))
    return "upper_pull";
  if (/row|rhomboid|face\s*pull|cable\s*row|seated\s*row|bent.?over\s*row|inverted\s*row|t.?bar/.test(n))
    return "row";
  if (/curl|bicep|hammer|preacher|concentration|spider\s*curl/.test(n))
    return "curl_isolation";
  if (/tricep|pushdown|extension|skull\s*crusher|close.?grip\s*bench|overhead\s*tricep/.test(n))
    return "tricep_isolation";
  if (/jog|run|bike|row\s*erg|rower|ski\s*erg|assault\s*bike|interval|tempo\s*run|easy\s*run|zone/.test(n))
    return "conditioning";
  if (/warm|mobility|stretch|activation|foam\s*roll|hip\s*circle|inchworm|leg\s*swing|band\s*pull/.test(n))
    return "prep_mobility";

  return "generic";
}

// ─── Coaching data per category ────────────────────────────────────────────────

interface CoachingData {
  cues: string[];
  mistakes: string[];
  easierVersion: string;
  harderVersion: string;
  substitute: string;
  movementFamily: string;
  whyItMatters: string;
}

function getCoachingData(
  category: ExerciseCategory,
  exerciseName: string,
  dayFocus?: string,
  programGoal?: string,
): CoachingData {
  const name = exerciseName;

  const data: Record<ExerciseCategory, CoachingData> = {
    bilateral_squat: {
      movementFamily: "Bilateral Squat",
      whyItMatters: `${name} is a foundational bilateral strength movement that builds lower body force production — the base for speed, jumping, and sport performance. In a ${dayFocus ?? "strength"} session it's placed to generate maximum mechanical tension before fatigue accumulates.`,
      cues: [
        "Brace your core hard before the descent — treat your torso like a rigid column",
        "Shins stay roughly perpendicular — knee tracks the second toe throughout",
        "Drive vertically through the floor on the way up, not back",
        "Control the lowering phase — 2–3 seconds down builds more muscle",
      ],
      mistakes: [
        "Losing tension at the bottom — the 'butt wink' happens when core and hips aren't engaged",
        "Knees caving inward under load — push them out actively throughout",
        "Cutting depth short to use more weight — full depth is the point",
      ],
      easierVersion: "Goblet Squat (lighter, better posture cue)",
      harderVersion: "Pause Squat or Tempo Squat (3-second down, 2-second pause)",
      substitute: "Leg Press (reduces spinal loading while keeping quad/glute demand)",
    },
    unilateral_lower: {
      movementFamily: "Unilateral Lower",
      whyItMatters: `${name} develops single-leg strength, balance, and hip stability — critical for running mechanics, change of direction, and correcting left-right asymmetries. Unilateral work also loads the hip in ways bilateral squat patterns can't replicate.`,
      cues: [
        "Front foot far enough forward that your shin stays mostly vertical",
        "Drive through the heel of the front foot — feel the glute engage",
        "Keep the torso upright — don't lean forward under load",
        "Control the knee — don't let it drift inward during the push phase",
      ],
      mistakes: [
        "Front foot too close — forces the shin forward and shifts load to the quad only",
        "Letting the rear knee bang the ground — means you've lost control of the descent",
        "Holding your breath or losing brace mid-set",
      ],
      easierVersion: "Reverse Lunge (more stable, less balance challenge)",
      harderVersion: "Weighted Bulgarian Split Squat (barbell or dumbbells)",
      substitute: "Step-Up (hip-drive alternative if knee is an issue)",
    },
    hinge: {
      movementFamily: "Hip Hinge",
      whyItMatters: `${name} trains the posterior chain — glutes, hamstrings, and spinal erectors — through a loaded hip hinge pattern. It's one of the highest-return strength movements for athletic power, injury resilience, and full-body muscle development.`,
      cues: [
        "Hinge at the hips, not the lower back — push your hips back like you're closing a door",
        "Keep the bar close to your body throughout — near-contact on the way up",
        "Create lat tension before the pull — 'protect your armpits'",
        "Lock out by driving hips through, not by hyperextending the lower back",
      ],
      mistakes: [
        "Rounding the lower back under load — lose the brace and the disc takes the load",
        "Bar drifting away from the body — multiplies the load through the lumbar",
        "Jerking the bar off the floor — tension should already be in the system before it moves",
      ],
      easierVersion: "Romanian Deadlift with lighter load (hip hinge pattern, no floor contact)",
      harderVersion: "Conventional Deadlift with paused rep at knee (3-sec hold)",
      substitute: "Trap Bar Deadlift (more upright torso, still hip-dominant)",
    },
    upper_push: {
      movementFamily: "Horizontal Push",
      whyItMatters: `${name} builds pressing strength through the chest, anterior deltoid, and triceps. It's a horizontal force production pattern that pairs with pulling work to maintain shoulder health and balanced upper body development.`,
      cues: [
        "Retract and depress the scapula before pressing — 'chest proud, shoulder blades squeezed'",
        "Control the bar path — slight arc toward the lower chest, not straight up",
        "Elbows 45–60° from torso — not flared, not tucked all the way",
        "Slow the eccentric — 2-second descent maximizes muscle tension",
      ],
      mistakes: [
        "Flared elbows (90°) — high torque on the shoulder joint, unnecessary risk",
        "Bouncing the bar off the chest — eliminates the stretch load that builds muscle",
        "Not creating tension through the whole body — leg drive, core, and upper back all contribute",
      ],
      easierVersion: "Dumbbell Press (each arm works independently, easier to control)",
      harderVersion: "Paused Rep Bench Press (1–2 second dead stop at chest)",
      substitute: "Push-Up with feet elevated (bodyweight, same pattern)",
    },
    overhead_press: {
      movementFamily: "Vertical Push",
      whyItMatters: `${name} builds overhead pressing strength through the deltoids, upper traps, and triceps, and requires full shoulder mobility and spinal stability. It's essential for athletes who need to express force or absorb contact overhead.`,
      cues: [
        "Press in front of the face, not behind the neck — more muscle, less risk",
        "Full lockout at the top — don't stop short of full elbow extension",
        "Brace hard — the weight is directly compressing your spine",
        "Bar path slightly back at the top — should finish over the mid-foot",
      ],
      mistakes: [
        "Pressing with excessive lower back extension — means shoulder mobility is limiting you",
        "Bar path forward — wastes energy and puts load off-axis",
        "Stopping short of lockout — misses the top-end shoulder stabilizer contribution",
      ],
      easierVersion: "Seated Dumbbell Press (removes balance requirement)",
      harderVersion: "Strict Press with paused rep at clavicle level",
      substitute: "Landmine Press (shoulder-friendly arc of motion)",
    },
    upper_pull: {
      movementFamily: "Vertical Pull",
      whyItMatters: `${name} develops lat, rhomboid, and bicep strength through a vertical pulling pattern. Pulling strength builds the back musculature that protects the shoulder joint and balances pressing volume in any well-designed program.`,
      cues: [
        "Start from a dead hang — full lat stretch at the bottom is where gains live",
        "Lead with the chest, not the chin — 'chest to bar' not 'chin over bar'",
        "Initiate by depressing the shoulder blades — start the pull from the back, not the arms",
        "Control the descent — resist gravity on the way down for 2 seconds",
      ],
      mistakes: [
        "Kipping or swinging for momentum — fine for sport, not for building back strength",
        "Short range of motion — stopping before full lockout kills the stretch portion",
        "Arms doing all the work — if you don't feel it in your lats, cue the pull from the elbows",
      ],
      easierVersion: "Lat Pulldown (same pattern, adjustable load)",
      harderVersion: "Weighted Pull-Up (belt with added plates)",
      substitute: "Ring Row or Inverted Row (horizontal pull alternative)",
    },
    row: {
      movementFamily: "Horizontal Pull",
      whyItMatters: `${name} trains the mid and upper back — rhomboids, traps, rear delts, and lats — through a horizontal pulling pattern. Every pressing movement in your program needs a row to counter it for shoulder health and posture.`,
      cues: [
        "Drive the elbows back and together — think 'crack a walnut between your shoulder blades'",
        "Keep the torso fixed — don't use momentum or body swing",
        "Full range: reach forward to create lat stretch, pull back to feel the contraction",
        "Pause at the top for 1 second and squeeze",
      ],
      mistakes: [
        "Using too much body swing to move heavier weight — reduces muscular demand, adds spinal load",
        "Pulling to the wrong height — rows should pull to the lower chest/upper abdomen",
        "Rushing the eccentric — the lowering phase is half the stimulus",
      ],
      easierVersion: "Seated Cable Row (fixed range of motion, easy to cue)",
      harderVersion: "Barbell Row with 3-second pause at top",
      substitute: "Face Pull (rear delt and external rotation emphasis)",
    },
    carry_loaded: {
      movementFamily: "Loaded Carry",
      whyItMatters: `${name} builds total-body stability, grip strength, and single-leg loading tolerance under real compressive force. It trains the core the way it actually functions in sport — not isolated, but braced under moving load.`,
      cues: [
        "Stand tall — don't let the weight tilt your torso to one side",
        "Short, controlled steps — don't rush or shuffle",
        "Shoulders packed down and back — don't let the weight drag the shoulder down",
        "Breathe through the movement — don't hold your breath for the whole carry",
      ],
      mistakes: [
        "Leaning to one side — means the core isn't bracing hard enough",
        "Walking too fast — turns it into a conditioning piece, not a strength piece",
        "Losing shoulder position under heavy load",
      ],
      easierVersion: "Lighter load, shorter distance",
      harderVersion: "Offset carry (different load in each hand)",
      substitute: "Plank Hold (anti-lateral flexion without locomotion)",
    },
    power_jump: {
      movementFamily: "Plyometric / Power",
      whyItMatters: `${name} trains rate of force development — the ability to produce maximum force in minimum time. It's the most sport-relevant quality in this program. CNS-demanding, so it goes first in the session while the nervous system is fresh.`,
      cues: [
        "Intent is everything — every rep is max effort, not medium effort",
        "Full hip, knee, and ankle extension at the top — don't cut it short",
        "Land softly — absorb force through the ankles, knees, and hips",
        "Step down from the box — never jump down (cumulative impact over time adds up)",
      ],
      mistakes: [
        "Treating it like a cardio exercise — slow and fatigued reps defeat the purpose",
        "Not resetting between reps — power work requires full recovery between jumps",
        "Landing stiff-legged — places huge force into passive structures",
      ],
      easierVersion: "Squat Jump (no box required, lower CNS demand)",
      harderVersion: "Depth Jump (drop-and-rebound, maximum reactive demand)",
      substitute: "Broad Jump (horizontal power direction)",
    },
    power_throw: {
      movementFamily: "Olympic / Power",
      whyItMatters: `${name} is the most technically demanding movement in the program. It trains the complete kinetic chain — from floor to full extension — at maximal velocity. Builds power, coordination, and neural efficiency that transfers to nearly every athletic action.`,
      cues: [
        "Start position is everything — brace before you initiate, mid-foot balance",
        "The 'pull' is actually a push from the floor — drive your legs, not your arms",
        "High elbows on the catch — bar should move in a vertical path",
        "Reset fully between reps — this is not a set-and-rep cardio drill",
      ],
      mistakes: [
        "Early arm pull — arms should be straight until the hips extend",
        "Bar drifting away from the body on the first pull",
        "Catching in a partial squat when full depth is needed",
      ],
      easierVersion: "Hang Power Clean (starts from the hip, reduces technical demand)",
      harderVersion: "Full Clean from Floor (complete hip and knee drive required)",
      substitute: "Med Ball Slam (similar power intent, zero technical risk)",
    },
    sprint: {
      movementFamily: "Sprint / Speed",
      whyItMatters: `${name} develops straight-line acceleration and top-end speed — the most explosive output any athlete produces. CNS-intensive, so it's placed early in the session when the nervous system is completely fresh.`,
      cues: [
        "Lean from the ankles in acceleration — not from the waist",
        "Drive the arms hard — arm action drives leg action",
        "Full extension at the hip at toe-off — don't cut the stride short",
        "Eyes forward, head neutral — facial tension affects mechanics everywhere else",
      ],
      mistakes: [
        "Sitting back in the hips during acceleration — kills forward force angle",
        "Overstriding at top speed — ground contact time increases, speed drops",
        "Running slow reps to save energy — defeats the entire purpose",
      ],
      easierVersion: "30m acceleration at 85% effort",
      harderVersion: "Resisted sprint with sled (5–10% bodyweight)",
      substitute: "Cycle sprints or assault bike (same metabolic demand, lower impact)",
    },
    trunk_anti_extension: {
      movementFamily: "Anti-Extension Core",
      whyItMatters: `${name} trains spinal stability against extension forces — the same demand your spine faces under squat, deadlift, and sprint loads. A strong anti-extension core protects the lumbar spine and improves transfer of force between lower and upper body.`,
      cues: [
        "Posterior pelvic tilt — neutral spine, no excessive lower back arch",
        "Squeeze the glutes and brace the abdomen simultaneously",
        "Don't let your hips sag — the second they drop you've lost the adaptation",
        "Breathe normally throughout — gripping the breath makes it isometric cardio",
      ],
      mistakes: [
        "Hips too high — turns it into a rest position, not a loaded hold",
        "Holding the breath — triggers a false sense of stability",
        "Not engaging the glutes — the glutes are the primary lumbar stabilizer",
      ],
      easierVersion: "Forearm Plank with knee contact",
      harderVersion: "Ab Wheel Rollout from knees",
      substitute: "Dead Bug (same anti-extension stimulus, more accessible)",
    },
    trunk_anti_rotation: {
      movementFamily: "Anti-Rotation Core",
      whyItMatters: `${name} trains the core's ability to resist rotation — a fundamental athletic quality for change of direction, throwing, and any power transfer between your lower and upper body. It targets the obliques and deep stabilizers under directional load.`,
      cues: [
        "Stand tall — don't let the band or cable pull your torso sideways",
        "Press or hold the position with arms straight out — resist the rotation actively",
        "Breathe throughout and maintain brace — don't hold your breath to compensate",
        "Slow and controlled — this is about resisting force, not generating it",
      ],
      mistakes: [
        "Rotating toward the anchor point — the whole point is not to rotate",
        "Using momentum or short range of motion",
        "Standing too close to the anchor — reduces resistance and range",
      ],
      easierVersion: "Half-Kneeling Pallof Press (reduced base of support challenge)",
      harderVersion: "Standing Pallof Press with pause at end range",
      substitute: "Suitcase Carry (anti-lateral flexion, locomotion-based)",
    },
    trunk_flexion: {
      movementFamily: "Core Flexion",
      whyItMatters: `${name} directly loads the rectus abdominis through trunk flexion. It develops core strength through the flexion pattern and builds the visible abdominal development that supports posture and appearance goals.`,
      cues: [
        "Curl the spine — don't just flex at the hip or pull on the neck",
        "Exhale hard on the way up — the diaphragm and core work together",
        "Control the eccentric — lower slowly over 2–3 seconds",
        "Don't anchor the feet — it turns it into a hip flexor exercise",
      ],
      mistakes: [
        "Pulling on the head and neck — the cervical spine is not load-bearing",
        "Using momentum to swing up — eliminates most of the stimulus",
        "Partial range of motion — you need the full curl for full engagement",
      ],
      easierVersion: "Crunches with feet flat on floor",
      harderVersion: "Cable Crunch (add progressive load to trunk flexion)",
      substitute: "Hanging Leg Raise (flexion with hip flexor component)",
    },
    conditioning: {
      movementFamily: "Energy System / Conditioning",
      whyItMatters: `${name} targets your aerobic or anaerobic energy system — building the engine that lets you recover between sets, train more frequently, and sustain power output in competition. Conditioning work is periodized just like strength.`,
      cues: [
        "Pace is prescribed — don't go harder than the target zone",
        "Nasal breathing where possible (aerobic work) — it's a pacing signal",
        "Monitor heart rate if possible — zone-based work has specific adaptations",
        "Consistency over intensity — aerobic base takes weeks to build",
      ],
      mistakes: [
        "Going too hard on easy days — turns aerobic into anaerobic and slows recovery",
        "Skipping conditioning because it's not 'lifting' — it's a performance requirement",
        "Treating all conditioning the same — intensity and duration determine the adaptation",
      ],
      easierVersion: "Reduce duration or intensity by 20%",
      harderVersion: "Add intervals: work-to-rest ratio of 1:1 instead of 1:2",
      substitute: "Any low-impact option with the same duration and heart rate zone",
    },
    prep_mobility: {
      movementFamily: "Movement Prep",
      whyItMatters: `${name} primes your joints and muscles before heavy loading. It raises tissue temperature, increases range of motion, and activates the neuromuscular patterns used in the main lifts. A proper warm-up directly improves performance and reduces injury risk in the session.`,
      cues: [
        "Move through full range — don't go through the motions with partial movement",
        "Maintain a controlled tempo — this is activation, not rushing to get started",
        "Feel each position — especially end-range hip and thoracic mobility",
      ],
      mistakes: [
        "Skipping it entirely — the first heavy set of the session should never be the first movement",
        "Going too fast — turns prep into momentum swinging, not tissue preparation",
        "Only doing static stretching before lifting — use dynamic movement before load",
      ],
      easierVersion: "Shorter duration with same movements",
      harderVersion: "Add banded resistance to mobility drills",
      substitute: "5-minute jog + joint circles (minimal effective dose)",
    },
    curl_isolation: {
      movementFamily: "Isolation — Biceps",
      whyItMatters: `${name} directly loads the biceps brachii through elbow flexion. Isolation work at the end of a session accumulates volume on muscles that don't receive enough direct stress from compound movements alone, contributing to hypertrophy and arm strength.`,
      cues: [
        "Supinate the wrist at the top — rotate the pinky up toward the ceiling",
        "Don't swing — if you need momentum you've gone too heavy",
        "Squeeze hard at the top — isometric contraction doubles the stimulus",
        "Full extension at the bottom — don't stop the range of motion short",
      ],
      mistakes: [
        "Using body swing to move heavier weight — shifts load from the bicep to the spine",
        "Short range of motion — the stretch position is where much of the growth happens",
        "Too much weight too early — isolation work benefits from feeling the muscle work",
      ],
      easierVersion: "Cable Curl (constant tension throughout the range)",
      harderVersion: "Incline Dumbbell Curl (greater stretch at the bottom)",
      substitute: "Hammer Curl (brachialis focus, easier on wrists)",
    },
    tricep_isolation: {
      movementFamily: "Isolation — Triceps",
      whyItMatters: `${name} directly loads the triceps through elbow extension. The triceps make up about two-thirds of arm volume and are essential for any pressing strength. Isolation work ensures the full stimulus that compound pressing movements can't always provide.`,
      cues: [
        "Lock out fully at the bottom — the long head only fully contracts at full extension",
        "Keep elbows in — flared elbows reduce tricep tension",
        "Avoid swinging the elbow — only the forearm should move",
        "Squeeze hard at the end range of each rep",
      ],
      mistakes: [
        "Not reaching full lockout — misses the most productive portion of the range",
        "Elbows drifting — converts it into a compound movement",
        "Too much weight — makes it a shoulder exercise",
      ],
      easierVersion: "Cable Pushdown (constant tension, easier to learn)",
      harderVersion: "Skull Crusher with close-grip press at lockout",
      substitute: "Close-Grip Bench Press (compound pressing with tricep emphasis)",
    },
    generic: {
      movementFamily: "Strength Training",
      whyItMatters: `${name} is included in this session based on your program goal and the training pattern of the day. Each exercise contributes to the overall mechanical stimulus and complements the other movements in this session.`,
      cues: [
        "Control the eccentric (lowering) phase — 2–3 seconds down",
        "Maintain a strong brace through every rep",
        "Full range of motion unless the prescription specifies otherwise",
        "Quality over quantity — stop the set if form breaks down",
      ],
      mistakes: [
        "Rushing through reps to finish faster — reduces the stimulus",
        "Neglecting rest periods — recovery between sets is part of the prescription",
        "Inconsistent depth or range across a set",
      ],
      easierVersion: "Reduce load by 15–20% and focus on technique",
      harderVersion: "Add a 2-second pause at the hardest point of the movement",
      substitute: "Ask your coach for a specific alternative",
    },
  };

  return data[category];
}

// ─── Role pill ─────────────────────────────────────────────────────────────────

function RolePill({ classification }: { classification: string }) {
  const upper = classification.toUpperCase();
  const style =
    /primary|compound/i.test(classification)
      ? "bg-primary/15 text-primary border-primary/30"
      : /power|explosive|plyometric/i.test(classification)
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : /accessory|isolation/i.test(classification)
      ? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
      : /prep|mobility|warm/i.test(classification)
      ? "bg-green-500/15 text-green-400 border-green-500/30"
      : /trunk|core/i.test(classification)
      ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
      : "bg-accent text-muted-foreground border-border";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold tracking-[0.1em] border uppercase ${style}`}
    >
      {upper}
    </span>
  );
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.14em] mb-2">
      {children}
    </p>
  );
}

// ─── Cue list ──────────────────────────────────────────────────────────────────

function CueList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((cue, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
          <span className="text-[12px] text-foreground/80 leading-snug">{cue}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Mistake list ──────────────────────────────────────────────────────────────

function MistakeList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((m, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400/60 flex-shrink-0" />
          <span className="text-[12px] text-foreground/75 leading-snug">{m}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Modify card ──────────────────────────────────────────────────────────────

function ModifyCard({
  label,
  description,
  accent,
}: {
  label: string;
  description: string;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${accent}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1 opacity-70">{label}</p>
      <p className="text-[12px] leading-snug text-foreground/80">{description}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LearnExerciseModal({
  exerciseName,
  exerciseNotes,
  classification,
  dayName,
  dayFocus,
  programGoal,
  onClose,
  onAskCoach,
}: LearnExerciseProps) {
  const category = detectCategory(exerciseName);
  const coaching = getCoachingData(category, exerciseName, dayFocus, programGoal);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const ytQuery = encodeURIComponent(`${exerciseName} exercise proper form strength training`);
  const ytUrl = `https://www.youtube.com/results?search_query=${ytQuery}`;
  const ytDemoQuery = encodeURIComponent(`${exerciseName} tutorial technique coaching`);
  const ytDemoUrl = `https://www.youtube.com/results?search_query=${ytDemoQuery}`;

  const coachPrompts = [
    `Explain how to perform ${exerciseName}`,
    `Why is ${exerciseName} in my program?`,
    `Give me an easier version of ${exerciseName}`,
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: "fadeIn 0.18s ease both" }}
      />

      {/* Sheet / Modal */}
      <div
        className={[
          "fixed z-50 bg-card border border-border flex flex-col overflow-hidden",
          /* Mobile: bottom sheet */
          "bottom-0 left-0 right-0 rounded-t-[24px] max-h-[82vh]",
          /* Desktop: centered modal */
          "md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2",
          "md:w-[480px] md:rounded-[20px] md:max-h-[80vh]",
        ].join(" ")}
        style={{ animation: "slideUpModal 0.22s cubic-bezier(0.22, 1, 0.36, 1) both" }}
      >
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes slideUpModal {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          @media (min-width: 768px) {
            @keyframes slideUpModal {
              from { transform: translate(-50%, calc(-50% + 24px)); opacity: 0; }
              to   { transform: translate(-50%, -50%);              opacity: 1; }
            }
          }
        `}</style>

        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-border">
          {/* Drag handle — mobile only */}
          <div className="md:hidden w-10 h-1 rounded-full bg-border mx-auto mb-4" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-[9px] font-bold text-primary uppercase tracking-[0.14em]">
                  Learn Exercise
                </span>
                {classification && <RolePill classification={classification} />}
              </div>
              <h2 className="text-[18px] font-bold text-foreground leading-tight tracking-tight">
                {exerciseName}
              </h2>
              {coaching.movementFamily && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{coaching.movementFamily}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-accent/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 py-4 space-y-5">

            {/* Why it's in your program */}
            <div>
              <SectionLabel>Why this is in your program</SectionLabel>
              <p className="text-[12px] text-foreground/75 leading-relaxed">
                {coaching.whyItMatters}
              </p>
              {/* Use the exercise notes as a coach cue if available */}
              {exerciseNotes && (
                <div className="mt-2.5 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
                  <p className="text-[10px] font-semibold text-primary mb-0.5">Coach note</p>
                  <p className="text-[11px] text-foreground/70 leading-relaxed italic">{exerciseNotes}</p>
                </div>
              )}
            </div>

            {/* Key coaching cues */}
            <div>
              <SectionLabel>Key coaching cues</SectionLabel>
              <CueList items={coaching.cues} />
            </div>

            {/* Common mistakes */}
            <div>
              <SectionLabel>Common mistakes</SectionLabel>
              <MistakeList items={coaching.mistakes} />
            </div>

            {/* Modify this movement */}
            <div>
              <SectionLabel>Modify this movement</SectionLabel>
              <div className="space-y-2">
                <ModifyCard
                  label="Easier"
                  description={coaching.easierVersion}
                  accent="bg-green-500/5 border-green-500/20"
                />
                <ModifyCard
                  label="Harder"
                  description={coaching.harderVersion}
                  accent="bg-primary/5 border-primary/20"
                />
                <ModifyCard
                  label="If this bothers you"
                  description={coaching.substitute}
                  accent="bg-amber-500/5 border-amber-500/20"
                />
              </div>
            </div>

            {/* See it in action */}
            <div>
              <SectionLabel>See it in action</SectionLabel>
              <div className="flex gap-2">
                <a
                  href={ytDemoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/40 transition-colors"
                >
                  View demo
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
                <a
                  href={ytUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/40 transition-colors"
                >
                  Search videos
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              </div>
            </div>

            {/* Ask coach */}
            {onAskCoach && (
              <div>
                <SectionLabel>Ask coach about this movement</SectionLabel>
                <div className="space-y-1.5">
                  {coachPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        onAskCoach(prompt);
                        onClose();
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/40 transition-colors group"
                    >
                      <span className="text-[11px] text-foreground/70 group-hover:text-foreground text-left leading-snug transition-colors">
                        {prompt}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary flex-shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom spacer for safe area */}
            <div className="h-4" />
          </div>
        </div>
      </div>
    </>
  );
}
