// ─── Special Populations Engine ──────────────────────────────────────────────
//
// Dedicated programming branch for:
//   - Older adults (60+)
//   - Beginners / deconditioned users
//   - Post-rehab / return-to-training
//   - Pain-sensitive / low-impact users
//   - Prenatal / postpartum (conservative routing)
//
// These populations are NOT lighter athletes.
// They are a different optimization problem with different constraints,
// different session framing, and different scoring priorities.
//
// This engine is entirely separate from the athlete/performance path.
// ─────────────────────────────────────────────────────────────────────────────

import type { SessionArchitecture, NeuralDemand, MovementPattern, CNSBlock } from "./program-architecture-engine";
import type { SlotExerciseSelection } from "./exercise-variation-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpecialPopTag =
  | "older_adult"
  | "beginner"
  | "post_rehab"
  | "pain_sensitive"
  | "low_impact"
  | "prenatal_postpartum";

export interface SpecialPopulationProfile {
  tags: SpecialPopTag[];
  primaryTag: SpecialPopTag;
  painFlags: string[];      // e.g. ["knee", "back", "shoulder"]
  ageFlag: number | null;   // extracted age if mentioned
  sportContext: string | null; // sport detected in the user request (e.g. "pickleball", "golf")
  isConservative: boolean;  // true → prioritize safety even more heavily
  detectedFrom: string;     // summary of what triggered detection
}

// ─── Detection ────────────────────────────────────────────────────────────────

const OLDER_ADULT_PATTERNS = [
  /\b(older adult|elderly|senior|aging|aged|60[\s-]?(\+|plus|year)|6[1-9][\s-]?year|7\d[\s-]?year|8\d[\s-]?year|age[d]?\s*(60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80))\b/i,
  /\b(for my (mom|dad|mother|father|grandmother|grandfather|grandma|grandpa))\b/i,
  /\b(retired|retirement|post.?menopausal|osteoporosis|bone density|balance training for older)\b/i,
];

const BEGINNER_PATTERNS = [
  /\b(beginner|never lifted|never trained|brand new|just starting|starting from scratch|no experience|first time|hasn.?t worked out|hasn.?t exercised|completely new|totally new|absolute beginner|newbie)\b/i,
  /\b(deconditioned|out of shape|sedentary|inactive for|hasn.?t been active|years out of the gym|been inactive)\b/i,
  /\b(beginner.?friendly|easy.?to.?start|start simple|simple program)\b/i,
];

const POST_REHAB_PATTERNS = [
  /\b(post.?rehab|returning (after|from) injury|recovering from|cleared (from|by) (rehab|doctor|physio|pt)|return.?to.?training|return.?to.?sport|after surgery|post.?surgery|post.?op)\b/i,
  /\b(acl|mcl|pcl|rotator cuff repair|labrum|meniscus|hip replacement|knee replacement|back surgery|spinal surgery|herniated disc)\b/i,
  /\b(just been cleared|doctor cleared|physio cleared|therapist cleared|recently cleared)\b/i,
];

const PAIN_SENSITIVE_PATTERNS = [
  /\b(knee pain|knee problems|bad knee|knee injury|arthriti[cs]|osteoarthrit[ic]|joint pain|hip pain|bad hip|lower back pain|back pain|bad back|shoulder pain|bad shoulder|neck pain|chronic pain|pain.?sensitive|history of pain)\b/i,
  /\b(avoid|no|without|can.?t do|shouldn.?t do).{0,20}(squat|deadlift|barbell|jump|high impact|running)\b/i,
];

const LOW_IMPACT_PATTERNS = [
  /\b(low.?impact|gentle|soft|easy on (the |my )?(joints|knees|back|body)|no jumping|no running|no plyometrics|no high.?impact|joint.?friendly|safe (program|training|exercise))\b/i,
  /\b(light (training|exercise|program)|non.?aggressive|conservative (program|training|approach))\b/i,
];

const PRENATAL_POSTPARTUM_PATTERNS = [
  /\b(prenatal|postnatal|postpartum|pregnancy|pregnant|new mom|new mother|after giving birth|after (having|my) baby|pelvic floor|diastasis)\b/i,
];

// Detects sport from the user message text (lowercase).
// Matches sport names and common derivatives (golfer, tennis player, pickleball player, etc.)
function detectSportFromText(text: string): string | null {
  const sportPatterns: Array<[RegExp, string]> = [
    [/\bpickleball\b/, "pickleball"],
    [/\bgolf(?:er|ers)?\b/, "golf"],
    [/\btennis\b/, "tennis"],
    [/\bpadel\b/, "padel"],
    [/\bbadminton\b/, "badminton"],
    [/\bsquash\b/, "squash"],
    [/\bbasketball\b/, "basketball"],
    [/\bsoccer\b|\bfootball\b/, "soccer"],
    [/\bbaseball\b/, "baseball"],
    [/\bsoftball\b/, "softball"],
    [/\bhockey\b/, "hockey"],
    [/\blacrosse\b/, "lacrosse"],
    [/\bvolleyball\b/, "volleyball"],
    [/\bswimm?ing\b|\bswimmer\b/, "swimming"],
    [/\brunn?ing\b|\brunner\b/, "running"],
    [/\bcycling\b|\bbiking\b|\bcyclist\b|\bbiker\b/, "cycling"],
    [/\bwrestling\b|\bwrestler\b/, "wrestling"],
    [/\bboxing\b|\bboxer\b/, "boxing"],
    [/\bmma\b|mixed martial/, "mma"],
  ];
  for (const [pattern, sport] of sportPatterns) {
    if (pattern.test(text)) return sport;
  }
  return null;
}

export function detectSpecialPopulation(
  userMessage: string,
  goal: string | null,
): SpecialPopulationProfile | null {
  const text = (userMessage + " " + (goal ?? "")).toLowerCase();

  const tags: SpecialPopTag[] = [];
  const painFlags: string[] = [];
  let ageFlag: number | null = null;
  const detectedReasons: string[] = [];

  // Age extraction — expanded patterns cover common phrasing variants:
  // "65 year old", "65-year-old", "age 65", "aged 65", "I am 65", "I'm 65", "65yo", "72yo"
  const agePatterns = [
    // "65 year old", "65-year-old", "65yo", "65 y.o."
    /\b(\d{2})\s*[-]?\s*(?:year[s]?\s*old|y\.?o\.?)\b/i,
    // "65-year-old" with hyphens
    /\b(\d{2})\s*-\s*year[s]?[\s-]?old\b/i,
    // "age 65", "aged 65"
    /\bage[d]?\s*(\d{2})\b/i,
    // "I am 65", "I'm 65", "I am a 65"
    /\bi(?:'m| am)\s+(?:a\s+)?(\d{2})\b/i,
    // "for a 65-" (e.g. "program for a 65-year-old")
    /\bfor\s+a\s+(\d{2})[\s-]/i,
  ];
  for (const pat of agePatterns) {
    const m = text.match(pat);
    if (m) {
      const parsed = parseInt(m[1], 10);
      if (parsed >= 50 && parsed <= 100) {
        ageFlag = parsed;
        if (parsed >= 60 && !tags.includes("older_adult")) {
          tags.push("older_adult");
          detectedReasons.push(`age ${parsed} detected`);
        }
        break;
      }
    }
  }

  // Detect sport for sport+age integration
  const sportContext = detectSportFromText(text);

  // Older adult detection via keyword patterns (catches "senior", "60+", "retired", etc.)
  if (OLDER_ADULT_PATTERNS.some(p => p.test(text))) {
    if (!tags.includes("older_adult")) tags.push("older_adult");
    detectedReasons.push("older adult keywords");
  }

  // Beginner detection
  if (BEGINNER_PATTERNS.some(p => p.test(text))) {
    if (!tags.includes("beginner")) tags.push("beginner");
    detectedReasons.push("beginner/deconditioned keywords");
  }

  // Post-rehab detection
  if (POST_REHAB_PATTERNS.some(p => p.test(text))) {
    if (!tags.includes("post_rehab")) tags.push("post_rehab");
    detectedReasons.push("post-rehab/return-to-training keywords");
  }

  // Pain-sensitive detection
  if (PAIN_SENSITIVE_PATTERNS.some(p => p.test(text))) {
    if (!tags.includes("pain_sensitive")) tags.push("pain_sensitive");
    detectedReasons.push("pain/limitation keywords");

    if (/knee/i.test(text)) painFlags.push("knee");
    if (/\bback\b|spinal|disc/i.test(text)) painFlags.push("back");
    if (/shoulder/i.test(text)) painFlags.push("shoulder");
    if (/hip/i.test(text)) painFlags.push("hip");
    if (/\bneck\b/i.test(text)) painFlags.push("neck");
  }

  // Low impact detection
  if (LOW_IMPACT_PATTERNS.some(p => p.test(text))) {
    if (!tags.includes("low_impact")) tags.push("low_impact");
    detectedReasons.push("low-impact/gentle keywords");
  }

  // Prenatal/postpartum (conservative routing)
  if (PRENATAL_POSTPARTUM_PATTERNS.some(p => p.test(text))) {
    if (!tags.includes("prenatal_postpartum")) tags.push("prenatal_postpartum");
    detectedReasons.push("prenatal/postpartum keywords");
  }

  if (tags.length === 0) return null;

  // Priority order for primaryTag
  const primaryTag: SpecialPopTag =
    tags.includes("prenatal_postpartum") ? "prenatal_postpartum" :
    tags.includes("post_rehab") ? "post_rehab" :
    tags.includes("pain_sensitive") ? "pain_sensitive" :
    tags.includes("older_adult") ? "older_adult" :
    tags.includes("low_impact") ? "low_impact" :
    "beginner";

  const isConservative =
    tags.includes("prenatal_postpartum") ||
    tags.includes("post_rehab") ||
    (tags.includes("pain_sensitive") && painFlags.length >= 2) ||
    (ageFlag !== null && ageFlag >= 70);

  return {
    tags,
    primaryTag,
    painFlags,
    ageFlag,
    sportContext,
    isConservative,
    detectedFrom: detectedReasons.join("; "),
  };
}

// ─── Exercise Metadata ────────────────────────────────────────────────────────

interface SPExercise {
  name: string;
  populationFit: SpecialPopTag[];  // which populations this is ideal for
  jointFriendly: boolean;
  lowImpact: boolean;
  controlFirst: boolean;            // technique/control matters more than load
  spinalLoad: "high" | "moderate" | "low";
  kneeLoad: "high" | "moderate" | "low";
  balance: "bilateral" | "unilateral" | "supported";
  complexity: "simple" | "moderate" | "complex";
  avoidFor?: string[];              // e.g. ["back", "knee", "shoulder"]
}

// ─── Special Population Exercise Pools ───────────────────────────────────────

// Movement primers — NO plyometrics, NO maximal intent
const SP_LOWER_POWER_POOL: SPExercise[] = [
  { name: "Hip Bridge March", populationFit: ["older_adult", "beginner", "post_rehab", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Banded Lateral Walk", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Box Step-Up (slow, controlled)", populationFit: ["older_adult", "beginner", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "unilateral", complexity: "simple" },
  { name: "Sled Push (light, controlled)", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple", avoidFor: ["shoulder"] },
  { name: "Resistance Band Hip Kick", populationFit: ["older_adult", "beginner", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "simple" },
  { name: "Tall Kneeling Hip Lift", populationFit: ["post_rehab", "older_adult", "pain_sensitive", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "simple" },
  { name: "Glute Bridge Walkout", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Stationary Bike Activation (5 min easy)", populationFit: ["older_adult", "beginner", "low_impact", "pain_sensitive", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
];

// Bilateral squat patterns — safe, joint-friendly, load-tolerant
const SP_BILATERAL_SQUAT_POOL: SPExercise[] = [
  { name: "Goblet Squat", populationFit: ["beginner", "older_adult", "post_rehab", "pain_sensitive", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "bilateral", complexity: "simple" },
  { name: "Box Squat (controlled descent)", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "beginner"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "moderate", balance: "bilateral", complexity: "simple" },
  { name: "Trap Bar Squat", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "moderate", balance: "bilateral", complexity: "simple" },
  { name: "Leg Press (machine)", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "moderate", balance: "bilateral", complexity: "simple", avoidFor: ["back"] },
  { name: "TRX-Assisted Squat", populationFit: ["older_adult", "beginner", "post_rehab", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "supported", complexity: "simple" },
  { name: "Dumbbell Sumo Squat", populationFit: ["beginner", "older_adult", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "bilateral", complexity: "simple" },
  { name: "Seated Squat to Stand", populationFit: ["older_adult", "beginner", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Safety Bar Squat (light)", populationFit: ["post_rehab", "pain_sensitive", "older_adult"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "moderate", balance: "bilateral", complexity: "moderate", avoidFor: ["shoulder"] },
];

// Bilateral hinge patterns — posterior chain, controlled ROM
const SP_BILATERAL_HINGE_POOL: SPExercise[] = [
  { name: "Trap Bar Deadlift (controlled)", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "beginner"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "low", balance: "bilateral", complexity: "moderate" },
  { name: "Romanian Deadlift (light–moderate)", populationFit: ["beginner", "older_adult", "low_impact", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "low", balance: "bilateral", complexity: "moderate" },
  { name: "Hip Thrust (bodyweight or light load)", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "beginner", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Cable Pull-Through", populationFit: ["post_rehab", "pain_sensitive", "older_adult"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "moderate", avoidFor: ["back"] },
  { name: "Sumo Deadlift (wide stance, moderate load)", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "low", balance: "bilateral", complexity: "moderate", avoidFor: ["hip"] },
  { name: "Deadlift from Pins (elevated bar)", populationFit: ["post_rehab", "pain_sensitive", "older_adult"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "moderate", avoidFor: ["back"] },
  { name: "Kettlebell Deadlift (floor or elevated)", populationFit: ["beginner", "older_adult", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
];

// Unilateral lower — squat pattern, controlled, stable
const SP_UNILATERAL_LOWER_SQUAT_POOL: SPExercise[] = [
  { name: "Step-Up (controlled, loaded)", populationFit: ["older_adult", "post_rehab", "beginner", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "unilateral", complexity: "simple" },
  { name: "Reverse Lunge (controlled)", populationFit: ["beginner", "older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "unilateral", complexity: "simple", avoidFor: ["knee"] },
  { name: "Split Squat (bodyweight or light dumbbell)", populationFit: ["beginner", "older_adult", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "unilateral", complexity: "simple" },
  { name: "Lateral Step-Down (controlled)", populationFit: ["post_rehab", "older_adult", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "unilateral", complexity: "moderate" },
  { name: "Single-Leg Press (machine)", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "moderate", balance: "supported", complexity: "simple" },
  { name: "Assisted Lateral Lunge (TRX or wall)", populationFit: ["older_adult", "post_rehab", "beginner"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "supported", complexity: "moderate" },
];

// Unilateral lower — hinge pattern, posterior chain resilience
const SP_UNILATERAL_LOWER_HINGE_POOL: SPExercise[] = [
  { name: "Single-Leg Hip Bridge", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "simple" },
  { name: "Kickstand RDL (staggered stance)", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "beginner"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "low", balance: "unilateral", complexity: "moderate" },
  { name: "Single-Leg RDL (bodyweight)", populationFit: ["post_rehab", "older_adult", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "low", balance: "unilateral", complexity: "moderate" },
  { name: "Cable Pull-Through (single-leg)", populationFit: ["post_rehab", "older_adult"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "moderate" },
  { name: "Nordic Hamstring Curl (assisted)", populationFit: ["post_rehab", "older_adult"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "moderate", balance: "bilateral", complexity: "moderate", avoidFor: ["knee"] },
];

// Trunk anti-rotation — low load, controlled
const SP_TRUNK_ANTI_ROTATION_POOL: SPExercise[] = [
  { name: "Pallof Press", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Half-Kneeling Cable Anti-Rotation", populationFit: ["post_rehab", "older_adult", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "moderate", avoidFor: ["knee"] },
  { name: "Bird Dog", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "simple" },
  { name: "Suitcase Carry (light, controlled)", populationFit: ["older_adult", "beginner", "post_rehab", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "simple" },
  { name: "Modified Side Plank (from knees)", populationFit: ["older_adult", "beginner", "prenatal_postpartum", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Half-Kneeling Chop (light band)", populationFit: ["post_rehab", "older_adult", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "moderate" },
];

// Trunk anti-extension — core stability, low load
const SP_TRUNK_ANTI_EXTENSION_POOL: SPExercise[] = [
  { name: "Dead Bug (modified)", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Modified Plank (from knees)", populationFit: ["older_adult", "beginner", "post_rehab", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Swiss Ball Rollout", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "moderate" },
  { name: "Ab Wheel (from knees)", populationFit: ["post_rehab", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "moderate", kneeLoad: "moderate", balance: "bilateral", complexity: "moderate", avoidFor: ["back", "shoulder"] },
  { name: "Hollow Body Hold (modified)", populationFit: ["beginner", "older_adult", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "moderate" },
  { name: "Tall Plank Hold (full arms)", populationFit: ["beginner", "older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
];

// Upper push — joint-friendly, shoulder-conscious
const SP_UPPER_PUSH_POOL: SPExercise[] = [
  { name: "Dumbbell Incline Press", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Landmine Press (standing or kneeling)", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "moderate" },
  { name: "Cable Chest Press", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple", avoidFor: ["shoulder"] },
  { name: "Machine Chest Press", populationFit: ["older_adult", "beginner", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Push-Up (incline or full, controlled)", populationFit: ["beginner", "older_adult", "post_rehab", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Dumbbell Floor Press", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple", avoidFor: ["shoulder"] },
  { name: "Seated Dumbbell Shoulder Press (light)", populationFit: ["older_adult", "beginner", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple", avoidFor: ["shoulder"] },
];

// Upper push secondary — accessory work, lightweight
const SP_UPPER_PUSH_SECONDARY_POOL: SPExercise[] = [
  { name: "Face Pull", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "beginner"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Band Pull-Apart", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Dumbbell Lateral Raise (light)", populationFit: ["beginner", "older_adult", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple", avoidFor: ["shoulder"] },
  { name: "Push-Up Plus (serratus activation)", populationFit: ["post_rehab", "older_adult"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "moderate" },
  { name: "Cable External Rotation", populationFit: ["post_rehab", "older_adult", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "moderate" },
  { name: "Dumbbell Front Raise (light)", populationFit: ["beginner", "older_adult"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
];

// Upper pull primary — back and shoulder health
const SP_UPPER_PULL_POOL: SPExercise[] = [
  { name: "Seated Cable Row", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Lat Pulldown (machine)", populationFit: ["older_adult", "beginner", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Dumbbell Row (chest-supported)", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "beginner"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "simple", avoidFor: ["back"] },
  { name: "TRX Row (feet-assisted)", populationFit: ["older_adult", "beginner", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "moderate" },
  { name: "Band-Assisted Lat Pulldown", populationFit: ["beginner", "older_adult", "post_rehab", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Machine Row (seated)", populationFit: ["older_adult", "beginner", "pain_sensitive", "post_rehab"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Single-Arm Cable Row", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "moderate" },
];

// Upper pull secondary — rotator cuff, scapular health
const SP_UPPER_PULL_SECONDARY_POOL: SPExercise[] = [
  { name: "Band Pull-Apart (wide grip)", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Face Pull (light cable)", populationFit: ["older_adult", "post_rehab", "pain_sensitive", "beginner"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Dumbbell Rear Delt Fly (light)", populationFit: ["older_adult", "beginner", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Y/T/W (light dumbbell or band)", populationFit: ["post_rehab", "older_adult", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "moderate" },
  { name: "Cable External Rotation (supine)", populationFit: ["post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "unilateral", complexity: "simple" },
];

// Conditioning finisher — low-impact cardio and capacity
const SP_CONDITIONING_POOL: SPExercise[] = [
  { name: "Stationary Bike (moderate pace)", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive", "low_impact", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Rowing Machine (moderate pace)", populationFit: ["older_adult", "post_rehab", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple", avoidFor: ["back"] },
  { name: "Walk Intervals (treadmill or outdoor)", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive", "low_impact", "prenatal_postpartum"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple" },
  { name: "Sled Push (light load, slow pace)", populationFit: ["older_adult", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple", avoidFor: ["shoulder"] },
  { name: "Step-Up Cardio (low box)", populationFit: ["older_adult", "beginner", "post_rehab", "low_impact"], jointFriendly: true, lowImpact: true, controlFirst: false, spinalLoad: "low", kneeLoad: "moderate", balance: "unilateral", complexity: "simple" },
  { name: "Farmer Carry (light, short distance)", populationFit: ["older_adult", "beginner", "post_rehab", "pain_sensitive"], jointFriendly: true, lowImpact: true, controlFirst: true, spinalLoad: "low", kneeLoad: "low", balance: "bilateral", complexity: "simple", avoidFor: ["shoulder"] },
];

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreForPopulation(
  ex: SPExercise,
  profile: SpecialPopulationProfile,
  seed: number,
  slotIndex: number,
  alreadySelected: Set<string>,
): number {
  let score = 0;

  // Exact repeat penalty
  if (alreadySelected.has(ex.name)) return -99;

  // Population fit (how well this exercise matches the detected population)
  const matchCount = ex.populationFit.filter(tag => profile.tags.includes(tag)).length;
  score += matchCount * 2.0;

  // Safety tier — joint and spinal load
  if (ex.jointFriendly) score += 2.5;
  if (ex.lowImpact) score += 1.5;
  if (ex.controlFirst) score += 1.0;

  // Pain flag filtering
  for (const pain of profile.painFlags) {
    if (ex.avoidFor?.includes(pain)) {
      score -= 4.0; // strongly penalize if this exercise is flagged as risky for reported pain site
    }
  }

  // Complexity penalty for very conservative profiles
  if (profile.isConservative) {
    if (ex.complexity === "complex") score -= 2.0;
    if (ex.complexity === "moderate") score -= 0.5;
  }

  // Joint load penalties for pain flags
  if (profile.painFlags.includes("knee")) {
    if (ex.kneeLoad === "high") score -= 3.0;
    if (ex.kneeLoad === "moderate") score -= 1.0;
  }
  if (profile.painFlags.includes("back")) {
    if (ex.spinalLoad === "high") score -= 3.0;
    if (ex.spinalLoad === "moderate") score -= 1.5;
  }
  if (profile.painFlags.includes("shoulder") && ex.avoidFor?.includes("shoulder")) {
    score -= 3.0;
  }

  // Seed tiebreaker — variety within safe range (narrow vs athlete mode)
  const slotOffset = slotIndex * 0.17;
  score += ((seed + slotOffset) % 1) * 0.8;

  return score;
}

function pickBest<T extends SPExercise>(
  pool: T[],
  profile: SpecialPopulationProfile,
  seed: number,
  slotIndex: number,
  alreadySelected: Set<string>,
): string {
  const scored = pool
    .map(ex => ({ name: ex.name, score: scoreForPopulation(ex, profile, seed, slotIndex, alreadySelected) }))
    .sort((a, b) => b.score - a.score);

  const chosen = scored[0]?.name ?? pool[0]?.name ?? "Goblet Squat";
  alreadySelected.add(chosen);
  return chosen;
}

// ─── Exercise Selection ───────────────────────────────────────────────────────

export function selectSpecialPopExercises(
  profile: SpecialPopulationProfile,
  seed: number,
): SlotExerciseSelection {
  const selected = new Set<string>();

  const lower_power              = pickBest(SP_LOWER_POWER_POOL,              profile, seed, 0,  selected);
  const bilateral_squat_strength = pickBest(SP_BILATERAL_SQUAT_POOL,          profile, seed, 1,  selected);
  const bilateral_hinge_strength = pickBest(SP_BILATERAL_HINGE_POOL,          profile, seed, 2,  selected);
  const unilateral_lower         = pickBest(SP_UNILATERAL_LOWER_SQUAT_POOL,   profile, seed, 3,  selected);
  const unilateral_lower_alt     = pickBest(SP_UNILATERAL_LOWER_HINGE_POOL,   profile, seed, 4,  selected);
  const trunk_anti_rotation      = pickBest(SP_TRUNK_ANTI_ROTATION_POOL,      profile, seed, 5,  selected);
  const trunk_anti_extension     = pickBest(SP_TRUNK_ANTI_EXTENSION_POOL,     profile, seed, 6,  selected);
  const upper_push_primary       = pickBest(SP_UPPER_PUSH_POOL,               profile, seed, 7,  selected);
  const upper_push_secondary     = pickBest(SP_UPPER_PUSH_SECONDARY_POOL,     profile, seed, 8,  selected);
  const upper_pull_primary       = pickBest(SP_UPPER_PULL_POOL,               profile, seed, 9,  selected);
  const upper_pull_secondary     = pickBest(SP_UPPER_PULL_SECONDARY_POOL,     profile, seed, 10, selected);
  const conditioning_finisher    = pickBest(SP_CONDITIONING_POOL,             profile, seed, 11, selected);

  const block_template_index = Math.floor(seed * 3) % 3;

  return {
    lower_power,
    bilateral_squat_strength,
    bilateral_hinge_strength,
    unilateral_lower,
    unilateral_lower_alt,
    trunk_anti_rotation,
    trunk_anti_extension,
    upper_push_primary,
    upper_push_secondary,
    upper_pull_primary,
    upper_pull_secondary,
    rotational_power: "Rotational Med Ball (light, controlled)", // placeholder — not used in SP sessions
    conditioning_finisher,
    elastic_power: conditioning_finisher,   // SP uses low-impact conditioning instead
    positional_support: unilateral_lower,   // reuse unilateral selection
    block_template_index,
  };
}

// ─── Session Templates ────────────────────────────────────────────────────────

function spCNSBlock(role: CNSBlock["role"], desc: string): CNSBlock {
  return { role, description: desc };
}

export function buildSpecialPopSessionTemplates(
  daysPerWeek: number,
  profile: SpecialPopulationProfile,
  sel: SlotExerciseSelection,
  seed: number,
): SessionArchitecture[] {
  const d = Math.max(2, Math.min(5, daysPerWeek));

  const popLabel = profile.primaryTag === "older_adult" ? "Older Adult"
    : profile.primaryTag === "post_rehab" ? "Return-to-Training"
    : profile.primaryTag === "pain_sensitive" ? "Pain-Sensitive"
    : profile.primaryTag === "prenatal_postpartum" ? "Prenatal/Postpartum"
    : profile.primaryTag === "low_impact" ? "Low-Impact"
    : "Beginner";

  const lowerNeuralDemand: NeuralDemand = profile.isConservative ? "low" : "moderate";

  if (d === 2) {
    return [
      {
        dayNumber: 1,
        identity: "Lower Strength + Core Foundation",
        intent: `Controlled lower-body strength through safe squat and hinge patterns; core stability foundation. ${popLabel} framing: movement quality before load.`,
        neuralDemand: lowerNeuralDemand,
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "hinge", "unilateral_lower", "trunk"],
        cnsFlow: [
          spCNSBlock("prep", `Warm-up (8–10 min): joint mobility circuit — hip CARs × 5 each, ankle circles × 10, thoracic rotation × 8 each side. Glute activation: ${sel.lower_power} × 2 × 10 sub-maximal effort.`),
          spCNSBlock("primary", `Primary lower — squat pattern: ${sel.bilateral_squat_strength} (3 × 8–12 at controlled pace). FOCUS: controlled descent, full ROM without discomfort, neutral spine throughout.`),
          spCNSBlock("secondary", `Hip hinge / posterior chain: ${sel.bilateral_hinge_strength} (3 × 8–10). FOCUS: hip-hinge mechanics, soft knees, tension in hamstrings — not a speed exercise.`),
          spCNSBlock("unilateral", `Unilateral lower (one side at a time): ${sel.unilateral_lower} (2 × 8–10 each side). FOCUS: knee tracking over second toe, controlled return.`),
          spCNSBlock("trunk", `Core foundation: ${sel.trunk_anti_rotation} (2 × 10–12 each side) + ${sel.trunk_anti_extension} (2 × 8–10). Slow, controlled, no breath-holding.`),
        ],
        sportNotes: `${popLabel}: No explosive loading. Progression is based on movement quality and symptom-free execution — NOT load targets.`,
      },
      {
        dayNumber: 2,
        identity: "Upper Strength + Structural Support",
        intent: `Joint-friendly upper pressing and pulling balance; shoulder and scapular health; anti-extension core stability. ${popLabel} framing: structural resilience.`,
        neuralDemand: lowerNeuralDemand,
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
        cnsFlow: [
          spCNSBlock("prep", "Warm-up (5–8 min): band pull-apart × 15, wall slide × 10, thoracic rotation × 8 each side, shoulder circles. No rushing."),
          spCNSBlock("primary", `Upper push (joint-friendly): ${sel.upper_push_primary} (3 × 8–12). FOCUS: controlled tempo, shoulder blades retracted, no shrugging.`),
          spCNSBlock("secondary", `Upper pull: ${sel.upper_pull_primary} (3 × 8–12). FOCUS: initiate with shoulder blades, not arms — quality of movement over speed.`),
          spCNSBlock("secondary", `Shoulder care and secondary work: ${sel.upper_push_secondary} (2 × 12–15) + ${sel.upper_pull_secondary} (2 × 12–15).`),
          spCNSBlock("trunk", `Core stability: ${sel.trunk_anti_extension} (3 × 8–10) + ${sel.trunk_anti_rotation} (2 × 10 each side). Breathe steadily — no Valsalva.`),
          spCNSBlock("finisher", `Low-impact capacity: ${sel.conditioning_finisher} (8–12 min at conversational pace). Heart rate monitoring if appropriate.`),
        ],
        sportNotes: `${popLabel}: Push:pull ratio balanced. Shoulder care included every upper session.`,
      },
    ];
  }

  if (d === 3) {
    // Variant C (seed ≥ 0.67): Upper-first, builds to lower
    if (seed >= 0.67) {
      return [
        {
          dayNumber: 1,
          identity: "Upper Strength + Movement Foundations",
          intent: `Structural upper strength with full movement-quality warm-up; establish controlled movement patterns before loading. ${popLabel} focus: technique-first session.`,
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            spCNSBlock("prep", "Full upper warm-up (8 min): thoracic mobility, band pull-apart × 15, wall slide × 10, shoulder internal/external rotation."),
            spCNSBlock("primary", `Upper push primary: ${sel.upper_push_primary} (3 × 8–12). Controlled 3-sec descent, 1-sec hold at top.`),
            spCNSBlock("secondary", `Upper pull: ${sel.upper_pull_primary} (3 × 8–12). Initiate from scapula — NOT from hands.`),
            spCNSBlock("secondary", `Accessory work: ${sel.upper_push_secondary} (2 × 12–15) + ${sel.upper_pull_secondary} (2 × 12–15). Lightweight, slow.`),
            spCNSBlock("trunk", `Anti-rotation core: ${sel.trunk_anti_rotation} (3 × 10–12 each). Breathe behind the movement.`),
          ],
          sportNotes: `${popLabel}: Upper session first — lower fatigue state when learning or re-learning movement patterns.`,
        },
        {
          dayNumber: 2,
          identity: "Lower Strength + Joint Control",
          intent: `Squat-pattern bilateral strength; posterior chain; unilateral stability; progressive work capacity. All loading within symptom-free range.`,
          neuralDemand: lowerNeuralDemand,
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            spCNSBlock("prep", `Lower warm-up (10 min): hip mobility circuit → ${sel.lower_power} × 2 × 10 (activation, not exertion).`),
            spCNSBlock("primary", `Bilateral squat pattern: ${sel.bilateral_squat_strength} (3–4 × 8–12). COACH CUE: find your depth, own it, never rush the descent.`),
            spCNSBlock("secondary", `Hinge pattern: ${sel.bilateral_hinge_strength} (3 × 8–10). Hinge at hips first, knees follow — push the floor away on return.`),
            spCNSBlock("unilateral", `Single-leg work: ${sel.unilateral_lower} (2 × 8–10 each side) + ${sel.unilateral_lower_alt} (2 × 8 each side).`),
            spCNSBlock("trunk", `Core: ${sel.trunk_anti_extension} (3 × 8–10) + ${sel.trunk_anti_rotation} (2 × 10 each side).`),
          ],
          sportNotes: `${popLabel}: Lower session mid-week. Body has recovered from upper work.`,
        },
        {
          dayNumber: 3,
          identity: "Full Body Resilience + Capacity",
          intent: `Integration session — moderate-load full-body movements; work capacity within safe range; progressive tolerance building. No high-intensity loading.`,
          neuralDemand: "low",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "upper_pull", "unilateral_lower", "trunk"],
          cnsFlow: [
            spCNSBlock("prep", "Full-body mobility warm-up (10 min): world's greatest stretch, hip 90/90, thoracic extension, shoulder circles."),
            spCNSBlock("primary", `Hinge focal point: ${sel.bilateral_hinge_strength} (3 × 10 at reduced load — technique focus). Movement quality is the goal today, not load.`),
            spCNSBlock("secondary", `Pull reinforcement: ${sel.upper_pull_primary} (3 × 10–12). Complement the pressing from Day 1.`),
            spCNSBlock("unilateral", `Unilateral movement: ${sel.unilateral_lower_alt} (2 × 10 each side) — posterior chain resilience.`),
            spCNSBlock("trunk", `Loaded carry: Farmer Carry or Suitcase Carry (3 × 20–30m light) — trunk under sustained load, real-life transfer.`),
            spCNSBlock("finisher", `Capacity work: ${sel.conditioning_finisher} (10–15 min at easy conversational pace). FOCUS: movement consistency, not intensity.`),
          ],
          sportNotes: `${popLabel}: Capacity day — builds work tolerance over weeks, not sessions. Keep all sets 2–3 reps short of any struggle.`,
        },
      ];
    }

    // Variant B (seed ≥ 0.33): Hinge-first
    if (seed >= 0.33) {
      return [
        {
          dayNumber: 1,
          identity: "Posterior Chain Strength + Hip Control",
          intent: `Hinge-dominant lower session; posterior chain development; hip stability and control. All loading controlled and symptom-free.`,
          neuralDemand: lowerNeuralDemand,
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            spCNSBlock("prep", `Activation circuit (8 min): glute bridges × 15, clamshells × 12 each, hip 90/90 × 8 each. Then ${sel.lower_power} × 2 × 10 as movement primer.`),
            spCNSBlock("primary", `Hinge primary: ${sel.bilateral_hinge_strength} (3–4 × 8–10). Hip-hinge pattern — sit the hips back, feel stretch in hamstrings, drive hips forward.`),
            spCNSBlock("secondary", `Hip thrust / glute: ${sel.unilateral_lower_alt} (3 × 10 each side) — posterior chain and glute development.`),
            spCNSBlock("unilateral", `Single-leg stability: ${sel.unilateral_lower} (2 × 10 each side). Controlled, minimal sway.`),
            spCNSBlock("trunk", `Anti-rotation core: ${sel.trunk_anti_rotation} (3 × 10–12 each side) + Bird Dog (2 × 8–10 each side if not already selected).`),
          ],
          sportNotes: `${popLabel}: Hinge-dominant day. This builds the posterior chain needed for pain-free movement and daily life activities.`,
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Strength + Anti-Extension Core",
          intent: `Upper pressing and pulling for structural resilience; scapular control; anti-extension trunk integrity.`,
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            spCNSBlock("prep", "Shoulder activation (6 min): band pull-apart × 20, wall slide × 10, serratus activation, thoracic rotation × 8 each."),
            spCNSBlock("primary", `Push primary: ${sel.upper_push_primary} (3 × 8–12). Controlled pace throughout — 2-sec down, pause, press.`),
            spCNSBlock("secondary", `Pull primary: ${sel.upper_pull_primary} (3 × 8–12). Pull with the elbows, not the hands. Equal volume to press.`),
            spCNSBlock("secondary", `Shoulder care: ${sel.upper_pull_secondary} (2 × 12–15 light) + ${sel.upper_push_secondary} (2 × 12–15 light).`),
            spCNSBlock("trunk", `Anti-extension: ${sel.trunk_anti_extension} (3 × 8–10) — core bracing for spinal health and transfer.`),
          ],
          sportNotes: `${popLabel}: Shoulder health is included every upper session. If any shoulder discomfort appears, reduce range of motion first — never push through pain.`,
        },
        {
          dayNumber: 3,
          identity: "Lower Strength (Squat Pattern) + Full Body Capacity",
          intent: `Squat-pattern bilateral strength; unilateral integration; full-body work capacity as a week-closing session.`,
          neuralDemand: lowerNeuralDemand,
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "upper_pull", "unilateral_lower", "trunk"],
          cnsFlow: [
            spCNSBlock("prep", "Lower mobility warm-up (8–10 min): ankle mobility, hip flexor stretch, bodyweight squat warmup × 10."),
            spCNSBlock("primary", `Squat primary: ${sel.bilateral_squat_strength} (3–4 × 8–12). COACH CUE: brace the core, hips below parallel only if comfortable, heels flat.`),
            spCNSBlock("secondary", `Posterior chain complement: ${sel.bilateral_hinge_strength} (2 × 10, lighter load — technique day).`),
            spCNSBlock("unilateral", `Unilateral integration: ${sel.unilateral_lower} (2 × 10 each side).`),
            spCNSBlock("trunk", `Trunk: ${sel.trunk_anti_rotation} (2 × 10 each) + ${sel.trunk_anti_extension} (2 × 8–10).`),
            spCNSBlock("finisher", `Work capacity close: ${sel.conditioning_finisher} (10–12 min at easy effort) — week-closing aerobic buffer.`),
          ],
          sportNotes: `${popLabel}: Squat pattern is the secondary lower anchor this week. Load should feel manageable — 5–6 out of 10 effort maximum.`,
        },
      ];
    }

    // Variant A (seed < 0.33): Squat-first (default)
    return [
      {
        dayNumber: 1,
        identity: "Lower Strength + Core Foundation",
        intent: `Squat-pattern bilateral lower strength; hip hinge support; core stability. Foundation session — movement quality is the primary KPI.`,
        neuralDemand: lowerNeuralDemand,
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "hinge", "unilateral_lower", "trunk"],
        cnsFlow: [
          spCNSBlock("prep", `Lower activation (10 min): hip mobility circuit, glute bridge × 15, clamshells × 12 each. Then: ${sel.lower_power} × 2 × 10 as movement primer — no exertion.`),
          spCNSBlock("primary", `Bilateral squat: ${sel.bilateral_squat_strength} (3 × 8–12). COACHING CUE: big breath, brace core, push floor away. Never rush.`),
          spCNSBlock("secondary", `Hinge support: ${sel.bilateral_hinge_strength} (3 × 8–10). Feel hamstring tension — not a back exercise.`),
          spCNSBlock("unilateral", `Single-leg control: ${sel.unilateral_lower} (2 × 10 each side). Balance = brain-body connection. Own every rep.`),
          spCNSBlock("trunk", `Core: ${sel.trunk_anti_rotation} (3 × 10–12 each) + ${sel.trunk_anti_extension} (2 × 8–10). Quality over quantity.`),
        ],
        sportNotes: `${popLabel}: Day 1 establishes the primary squat pattern. This is the most important movement to build first.`,
      },
      {
        dayNumber: 2,
        identity: "Upper Structural + Movement Quality",
        intent: `Joint-friendly upper pressing and pulling; shoulder and scapular health; anti-extension core. Structural resilience session.`,
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
        cnsFlow: [
          spCNSBlock("prep", "Upper warm-up (6 min): band pull-apart × 20, wall slide × 10, arm circles, thoracic extension on foam roller if available."),
          spCNSBlock("primary", `Push primary: ${sel.upper_push_primary} (3 × 8–12). Full range of motion, controlled. Stop well before fatigue.`),
          spCNSBlock("secondary", `Pull primary: ${sel.upper_pull_primary} (3 × 8–12). Equal volume to pressing — this protects the shoulder joint long-term.`),
          spCNSBlock("secondary", `Shoulder and upper back care: ${sel.upper_push_secondary} (2 × 12–15) + ${sel.upper_pull_secondary} (2 × 12–15 light).`),
          spCNSBlock("trunk", `Anti-extension core: ${sel.trunk_anti_extension} (3 × 8–10). Core stability supports every lift.`),
        ],
        sportNotes: `${popLabel}: Upper session with structural balance. Push:pull volume is always matched.`,
      },
      {
        dayNumber: 3,
        identity: "Posterior Chain + Full Body Resilience",
        intent: `Hinge-dominant posterior chain; unilateral balance; low-impact capacity to close the week. Resilience and sustainability.`,
        neuralDemand: "low",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "unilateral_lower", "trunk"],
        cnsFlow: [
          spCNSBlock("prep", "Week-close warm-up (10 min): dynamic mobility, hip 90/90, hip CARs, thoracic rotation, light glute activation."),
          spCNSBlock("primary", `Hinge primary: ${sel.bilateral_hinge_strength} (3 × 8–10 at reduced load — technique emphasis day). Feel the posterior chain engagement.`),
          spCNSBlock("secondary", `Single-leg posterior chain: ${sel.unilateral_lower_alt} (3 × 8–10 each side). Hip-dominant, minimal knee involvement.`),
          spCNSBlock("trunk", `Trunk under load: Farmer Carry (3 × 20–30m light) + ${sel.trunk_anti_rotation} (2 × 10 each side). Loaded carries build real-world trunk strength.`),
          spCNSBlock("finisher", `Work capacity finisher: ${sel.conditioning_finisher} (10–15 min conversational pace). Finish the week with movement, not exertion.`),
        ],
        sportNotes: `${popLabel}: Day 3 is never a high-effort day. Leave the session feeling better than when you arrived.`,
      },
    ];
  }

  if (d === 4) {
    return [
      {
        dayNumber: 1,
        identity: "Lower Strength (Squat Pattern) + Core",
        intent: `Bilateral squat as the week's lower-body anchor; core foundation work. Establish the key movement pattern of the week.`,
        neuralDemand: lowerNeuralDemand,
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "unilateral_lower", "trunk"],
        cnsFlow: [
          spCNSBlock("prep", `Activation (10 min): joint mobility, glute bridge × 15, hip CARs × 5 each. Movement primer: ${sel.lower_power} × 2 × 10.`),
          spCNSBlock("primary", `Squat primary: ${sel.bilateral_squat_strength} (4 × 8–12 at controlled pace). Quality first.`),
          spCNSBlock("unilateral", `Single-leg work: ${sel.unilateral_lower} (3 × 10 each side). Stability and balance.`),
          spCNSBlock("trunk", `Core: ${sel.trunk_anti_rotation} (3 × 10–12 each) + ${sel.trunk_anti_extension} (2 × 8–10).`),
        ],
        sportNotes: `${popLabel}: 4-day split allows each pattern its own session. Lower sessions have a 48-hour buffer.`,
      },
      {
        dayNumber: 2,
        identity: "Upper Structural Push + Pull Balance",
        intent: `Press and pull in a single upper session; shoulder health; anti-extension core stability.`,
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
        cnsFlow: [
          spCNSBlock("prep", "Upper activation (6 min): band pull-apart × 20, wall slide × 10, thoracic mobilization."),
          spCNSBlock("primary", `Push primary: ${sel.upper_push_primary} (4 × 8–12). Controlled, full ROM.`),
          spCNSBlock("secondary", `Pull primary: ${sel.upper_pull_primary} (4 × 8–12). Initiate from scapula.`),
          spCNSBlock("secondary", `Shoulder care: ${sel.upper_pull_secondary} (2 × 12–15) + ${sel.upper_push_secondary} (2 × 12–15).`),
          spCNSBlock("trunk", `Core: ${sel.trunk_anti_extension} (3 × 8–10). Every upper session includes trunk work.`),
        ],
        sportNotes: `${popLabel}: Shoulder care is non-negotiable. Face pull or band work included every upper session.`,
      },
      {
        dayNumber: 3,
        identity: "Posterior Chain Strength + Hip Control",
        intent: `Hinge-dominant lower strength; posterior chain development; single-leg hinge for resilience.`,
        neuralDemand: lowerNeuralDemand,
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "unilateral_lower", "trunk"],
        cnsFlow: [
          spCNSBlock("prep", "Lower activation (8 min): hip flexor stretch, hamstring floss, clamshells × 12 each, glute bridge × 15."),
          spCNSBlock("primary", `Hinge primary: ${sel.bilateral_hinge_strength} (4 × 8–10). Hip-push-back pattern.`),
          spCNSBlock("secondary", `Glute/posterior chain: Hip Thrust or ${sel.unilateral_lower_alt} (3 × 10 each). Glute dominance.`),
          spCNSBlock("unilateral", `Single-leg hinge: ${sel.unilateral_lower_alt} (2 × 8–10 each side). Posterior chain balance.`),
          spCNSBlock("trunk", `Lateral core: ${sel.trunk_anti_rotation} (2 × 10 each) + Suitcase Carry (2 × 20m each side).`),
        ],
        sportNotes: `${popLabel}: Hinge session is separate from squat session — 48-hour lower-body buffer maintained.`,
      },
      {
        dayNumber: 4,
        identity: "Full Body Resilience + Work Capacity",
        intent: `Integration session; moderate load across all patterns; work capacity finisher for progressive tolerance.`,
        neuralDemand: "low",
        primaryPattern: "trunk",
        emphasizedPatterns: ["hinge", "upper_pull", "trunk", "unilateral_lower"],
        cnsFlow: [
          spCNSBlock("prep", "Full-body dynamic warm-up (10 min): world's greatest stretch, hip circles, shoulder circles, light jog or bike."),
          spCNSBlock("primary", `Hinge review: ${sel.bilateral_hinge_strength} (2 × 10 at reduced load — technique only).`),
          spCNSBlock("secondary", `Pull complement: ${sel.upper_pull_primary} (2 × 10–12 light). Reinforce the pulling pattern.`),
          spCNSBlock("trunk", `Loaded carry complex: Farmer Carry (3 × 20–30m light) — trunk and grip endurance.`),
          spCNSBlock("finisher", `Work capacity: ${sel.conditioning_finisher} (15–20 min at easy, conversational pace). This is building your engine, not your limit.`),
        ],
        sportNotes: `${popLabel}: Day 4 is integration and recovery. Never a max-effort day. Finish the week feeling capable.`,
      },
    ];
  }

  // Fallback for 5-day — use 4-day template
  return buildSpecialPopSessionTemplates(4, profile, sel, seed);
}

// ─── Variation Mandate for Special Populations ───────────────────────────────

// Builds sport-specific section for older adults that preserves athletic identity
// within the safety envelope.
function buildSportAgeIntegrationSection(sport: string, profile: SpecialPopulationProfile): string {
  const age = profile.ageFlag ?? 65;
  const sportLabel = sport.charAt(0).toUpperCase() + sport.slice(1);

  // Shared safe power alternatives
  const safePowerAlts = "Med Ball Scoop Toss / Med Ball Wall Pass / Sled Push (light) / Power Step-Up";

  // Sport-specific lateral/rotational alternatives
  const sportSpecificSections: Record<string, string> = {
    pickleball: `### PICKLEBALL-SPECIFIC MOVEMENT TARGETS (AGE ${age} — LOW-IMPACT FORMS ONLY)
- Rotational power: Cable chop, cable lift, med ball rotational wall pass, landmine rotation — NOT rotational plyometrics
- Lateral quickness: Lateral step-up, lateral band walk, lateral split squat, lateral shuffle (controlled) — NOT lateral bounds
- Court deceleration: Reverse lunge (controlled), lateral step-down, single-leg balance reach — NOT reactive jump stops
- Overhead reach / stroke power: Landmine press, cable shoulder press, dumbbell incline press — NOT heavy overhead barbell press
- Anti-rotation for paddle: Pallof press, half-kneeling cable anti-rotation, suitcase carry
- Quick feet (low amplitude): Light agility ladder footwork (no jumping), mini-band walk, balance reach in all directions`,

    golf: `### GOLF-SPECIFIC MOVEMENT TARGETS (AGE ${age} — LOW-IMPACT FORMS ONLY)
- Rotational power: Cable chop/lift, med ball rotational wall pass, landmine rotation — NOT rotational jumps
- Hip dissociation: Hip 90/90 transitions, half-kneeling hip flexor stretch, lateral lunge — controlled
- Balance and proprioception: Single-leg stance, single-leg balance reach, bosu balance work
- Thoracic mobility: Thoracic rotation drills, foam roller extension, open books — EVERY session
- Anti-sway core: Pallof press, suitcase carry, half-kneeling chop — NOT heavy loaded flexion
- Lower body drive: Hip thrust, trap bar deadlift (moderate), goblet squat — NOT heavy conventional deadlift`,

    tennis: `### TENNIS-SPECIFIC MOVEMENT TARGETS (AGE ${age} — LOW-IMPACT FORMS ONLY)
- Rotational power: Cable chop, landmine rotation, med ball wall pass — NOT rotational plyometrics
- Lateral change of direction: Lateral step-up, lateral band walk, lateral split squat — NOT lateral bounds
- Deceleration: Reverse lunge (controlled), lateral step-down — NOT reactive jump stops
- Overhead reach: Landmine press, cable shoulder press — NOT heavy overhead barbell press
- Anti-rotation: Pallof press, suitcase carry`,

    default: `### SPORT-SPECIFIC MOVEMENT TARGETS (AGE ${age} — LOW-IMPACT FORMS ONLY)
- Power: ${safePowerAlts} — NOT plyometric jumps or Olympic lifts
- Lateral movement: Lateral step-up, lateral band walk, controlled split squat — NOT lateral bounds
- Rotational strength: Cable chop/lift, med ball wall pass — NOT rotational plyometrics
- Balance: Single-leg balance reach, single-leg hip bridge — included every session`,
  };

  const section = sportSpecificSections[sport] ?? sportSpecificSections.default;

  return `
## AGE + SPORT INTEGRATION — ${sportLabel.toUpperCase()} PERFORMANCE FOR A ${age}-YEAR-OLD

This program preserves the athletic identity of ${sportLabel} while filtering all exercises through an age-aware safety lens.
The sport athleticism IS expressed — but through controlled, low-impact, joint-friendly movement.

${section}

### WHAT THIS MEANS FOR EXERCISE SELECTION
- Keep the MOVEMENT INTENT (rotational power, lateral quickness, explosive capacity)
- Change the EXPRESSION (cable and med ball instead of plyometrics; step-up instead of box jump; trap bar instead of barbell deadlift)
- The program should FEEL performance-oriented — it is NOT rehab. It is age-aware athletic development.`;
}

export function buildSpecialPopVariationMandate(
  sel: SlotExerciseSelection,
  profile: SpecialPopulationProfile,
): string {
  const popType = profile.primaryTag === "older_adult" ? "Older Adult"
    : profile.primaryTag === "post_rehab" ? "Return-to-Training"
    : profile.primaryTag === "pain_sensitive" ? "Pain-Sensitive"
    : profile.primaryTag === "prenatal_postpartum" ? "Prenatal/Postpartum"
    : profile.primaryTag === "low_impact" ? "Low-Impact General"
    : "Beginner";

  const isOlderAdultWithSport = profile.primaryTag === "older_adult" && !!profile.sportContext;
  const ageLabel = profile.ageFlag ? `${profile.ageFlag}-YEAR-OLD ` : "";

  const painNote = profile.painFlags.length > 0
    ? `\nPain flags detected: ${profile.painFlags.join(", ")} — avoid loading these joints beyond symptom-free range.`
    : "";

  const conservativeNote = profile.isConservative
    ? `\nCONSERVATIVE MODE ACTIVE: This is a high-caution profile (post-rehab, prenatal, 70+, or multi-site pain). Load conservatively. Err on the side of less.`
    : "";

  const sportIntegration = isOlderAdultWithSport
    ? buildSportAgeIntegrationSection(profile.sportContext!, profile)
    : "";

  const programFraming = isOlderAdultWithSport
    ? `This is an age-aware SPORT PERFORMANCE program — not generic rehab, not a generic older adult program.\nIt preserves ${profile.sportContext} athleticism while applying strict age-appropriate safety filters.\nDo NOT use:`
    : `This is NOT an athlete program. Do NOT use:`;

  return `## SPECIAL POPULATION PROGRAM — ${ageLabel}${popType.toUpperCase()}${profile.sportContext ? ` / ${profile.sportContext.toUpperCase()} PERFORMANCE` : ""}
${conservativeNote}${painNote}

${programFraming}
- Explosive plyometric exercises (box jumps, broad jumps, depth jumps, jump squats)
- Maximal-effort Olympic lifting (power clean, hang clean, snatch)
- High-impact landing movements
- Conventional barbell deadlift at 1–6 reps under high axial load
- Unscaled pull-ups as a primary movement (use lat pulldown or assisted pull-up)
- Bulgarian split squat under heavy load (use supported split squat or step-up)
${isOlderAdultWithSport ? "" : "- Maximal intent language (\"force production\", \"bar speed\", \"acceleration\")\n- Athlete-centric session framing"}
${sportIntegration}

### LOCKED EXERCISE SELECTIONS — USE THESE EXACTLY

- Movement Primer / Activation: ${sel.lower_power}
- Bilateral Squat (safe, joint-friendly): ${sel.bilateral_squat_strength}
- Bilateral Hinge (controlled, posterior chain): ${sel.bilateral_hinge_strength}
- Unilateral Lower (squat pattern): ${sel.unilateral_lower}
- Unilateral Lower (hinge pattern): ${sel.unilateral_lower_alt}
- Anti-Rotation Core: ${sel.trunk_anti_rotation}
- Anti-Extension Core: ${sel.trunk_anti_extension}
- Upper Push: ${sel.upper_push_primary}
- Upper Push Support / Shoulder Care: ${sel.upper_push_secondary}
- Upper Pull Primary: ${sel.upper_pull_primary}
- Upper Pull Support: ${sel.upper_pull_secondary}
- Capacity / Conditioning Finisher: ${sel.conditioning_finisher}

### PROHIBITED SUBSTITUTIONS

Do NOT use these exercises — they violate the age/safety parameters:
- Back Squat (high spinal load) → use ${sel.bilateral_squat_strength}
- Barbell Conventional Deadlift heavy/low-rep (high spinal load) → use ${sel.bilateral_hinge_strength}
- Box Jump / Broad Jump / Depth Jump (high-impact plyometric) → use ${sel.lower_power}
- Unscaled Pull-Up as primary (high demand, poor scalability) → use ${sel.upper_pull_primary}
- Bulgarian Split Squat under load (high balance demand + knee stress) → use ${sel.unilateral_lower}
- Power Clean / Hang Clean / Snatch (Olympic lift complexity) → use ${sel.lower_power}

### COACHING LANGUAGE STANDARDS

${isOlderAdultWithSport ? `Use performance-oriented but age-aware language:
- "Controlled explosiveness" or "low-impact power" (not just "power")
- "Sport-ready strength" (keep the athletic framing)
- "Lateral control" not "lateral speed"
- "Rotational strength" not "rotational explosiveness"
- "Leave 3+ reps in reserve" — training quality over grinding` : `Use joint-friendly framing in descriptions:
- "Controlled pace" not "bar speed"
- "Comfortable range of motion" not "full depth"
- "Symptom-free" not "to failure"
- "Movement quality" not "force output"
- "Leave 3+ reps in reserve" — never grind`}

### LOAD AND REP STANDARDS

- Sets: 2–4 (start at 2, build over weeks)
- Reps: 8–15 for most exercises (8–12 compounds, 12–15 accessories)
- Load: 5–6 RPE maximum (leave 4+ reps in reserve)
- Tempo: 2–3 sec controlled descent, pause, controlled return
- Progression: Add 1 rep before adding load. Add load only when all reps are clean.

### VALIDATION CHECKLIST

- [ ] No explosive/plyometric exercises appear as primary movements
- [ ] No conventional barbell deadlift at 1–6 reps
- [ ] No unscaled pull-ups as primary movement
- [ ] No Bulgarian split squat under heavy load
- [ ] Reps are in the 8–15 range (8–12 for compounds) — NOT 1–6 loading
- [ ] Session identities are appropriate${isOlderAdultWithSport ? " (performance-oriented but age-aware)" : " (not generic athlete framing)"}
- [ ] Every session includes trunk/core work
- [ ] Upper sessions include shoulder care (face pull, band pull-apart, or external rotation)
- [ ] Conditioning finisher is low-impact (bike, walk, rower, light sled — NOT sprints or jump rope)
${profile.sportContext ? `- [ ] Sport-specific movements (${profile.sportContext}) are included in age-appropriate forms` : ""}
- [ ] Pain flags (${profile.painFlags.join(", ") || "none"}) are respected in exercise selection`;
}

// ─── Progression Model Text ───────────────────────────────────────────────────

function buildProgressionModel(profile: SpecialPopulationProfile): string {
  return `
## SPECIAL POPULATION PROGRESSION MODEL — READ AND APPLY

This program does NOT use athlete-style progression (load → velocity → complexity).

PROGRESSION HIERARCHY (in order):
1. Technique mastery: Movement must be clean before ANY load increase
2. Range of motion: Comfortable, symptom-free ROM achieved consistently
3. Volume tolerance: Complete all sets and reps with 3+ reps in reserve
4. Load progression: Add 2.5–5% only AFTER all reps are pain-free and clean
5. Complexity increase: Only after weeks 6+ of consistent execution

NEVER:
- Push to failure
- Add load if form has degraded
- Train through pain (soreness is OK, pain is not)
- Rush to the next progression

RECOVERY STANDARDS (${profile.primaryTag === "older_adult" ? "Older Adult" : "Special Population"}):
- 48-hour minimum between lower-body sessions
- 48-hour minimum between upper-body sessions
- Full rest days between high-demand days
- Sleep and nutrition are part of the program — they are NOT optional accessories`;
}

// ─── Population Overlay for System Prompt ────────────────────────────────────

function buildPopulationOverlay(profile: SpecialPopulationProfile): string {
  const type = profile.primaryTag;
  const painNote = profile.painFlags.length > 0
    ? `\nPain/limitation flags: ${profile.painFlags.join(", ")} — do not load these joints beyond comfortable ROM.`
    : "";

  const base = type === "prenatal_postpartum"
    ? `\n## PRENATAL/POSTPARTUM SPECIAL NOTE\nThis user is prenatal or postpartum. Exercise is safe and beneficial. However:\n- Avoid exercises that cause discomfort, breath-holding, or abdominal pressure\n- No supine positions after first trimester if flagged by user\n- Include pelvic floor awareness in core work\n- All exertion should be conversational-pace maximum\n- Always recommend consulting their healthcare provider before starting${painNote}`
    : type === "post_rehab"
    ? `\n## RETURN-TO-TRAINING SPECIAL NOTE\nThis user is returning after injury or surgery. They are cleared to train but need:\n- Conservative loading (start at 40–50% of estimated capacity)\n- No pain during or after sessions — this is the highest-priority constraint\n- Progressive re-introduction over weeks, not days\n- Movement quality as the primary metric${painNote}`
    : type === "pain_sensitive"
    ? `\n## PAIN-SENSITIVE POPULATION NOTE\nThis user has reported pain or joint sensitivity. Rules:\n- Never prescribe exercises that load the painful joint under high stress\n- Symptom-free execution is mandatory — if discomfort appears, reduce load or ROM\n- Avoid high-compressive spinal loading (no heavy barbell squats, no heavy conventional deadlifts)${painNote}`
    : type === "older_adult"
    ? `\n## OLDER ADULT PROGRAMMING NOTE\nThis is a program for an older adult (${profile.ageFlag ? `age ${profile.ageFlag}` : "60+"}). Structural rules:\n- Balance and fall prevention are programming priorities\n- No explosive plyometrics or high-impact loading\n- Bilateral support (TRX, machine, or bench-supported) for stability during learning\n- Progression is measured in weeks and months, not days${painNote}`
    : `\n## BEGINNER / LOW-IMPACT NOTE\nThis user is new to training, deconditioned, or requesting low-impact programming.\n- All exercises must be learnable in 1–2 sessions without coaching history\n- No complex multi-joint movements until basics are established\n- Focus on building movement patterns before load${painNote}`;

  return base;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function buildSpecialPopArchitectureBrief(
  daysPerWeek: number,
  goal: string | null,
  userRequest: string,
  profile: SpecialPopulationProfile,
  seed: number,
): string {
  const sel = selectSpecialPopExercises(profile, seed);
  const sessions = buildSpecialPopSessionTemplates(daysPerWeek, profile, sel, seed);
  const mandate = buildSpecialPopVariationMandate(sel, profile);
  const progression = buildProgressionModel(profile);
  const populationOverlay = buildPopulationOverlay(profile);

  const sportHeader = profile.sportContext
    ? ` / ${profile.sportContext.toUpperCase()} PERFORMANCE`
    : "";
  const ageHeader = profile.ageFlag ? ` (AGE ${profile.ageFlag})` : "";
  const goalLabel = goal ?? (profile.sportContext
    ? `Age-aware ${profile.sportContext} performance`
    : "General strength and resilience");

  const weeklyRhythm = sessions
    .map(s => `Day ${s.dayNumber}: ${s.identity}`)
    .join(" → ");

  const sessionLines = sessions.map(s => {
    const flowLines = s.cnsFlow.map(b => `  [${b.role.toUpperCase()}] ${b.description}`).join("\n");
    return `### Day ${s.dayNumber}: ${s.identity}\nIntent: ${s.intent}\nDemand: ${s.neuralDemand.toUpperCase()}\n${flowLines}${s.sportNotes ? `\nNote: ${s.sportNotes}` : ""}`;
  }).join("\n\n");

  return `## SPECIAL POPULATION PROGRAM ARCHITECTURE — ${profile.primaryTag.toUpperCase().replace(/_/g, " ")}${ageHeader}${sportHeader}
Detection: ${profile.detectedFrom}
Days/week: ${daysPerWeek} | Goal: ${goalLabel}
${profile.sportContext ? `Sport context: ${profile.sportContext} — athleticism preserved through age-appropriate movements\n` : ""}
### WEEKLY RHYTHM
${weeklyRhythm}

### SESSION ARCHITECTURE
${sessionLines}

### RECOVERY RULES
- Minimum 48 hours between lower-body sessions
- Minimum 48 hours between upper-body sessions
- No back-to-back high-demand days
- Never train to failure — leave 3+ reps in reserve at all times
- Stop immediately if pain (not soreness) occurs during any exercise
${profile.ageFlag ? `- Age ${profile.ageFlag}: prioritize quality of movement over quantity of load` : ""}
${populationOverlay}

${mandate}

${progression}`;
}

// ─── Post-Generation Safety Filter ───────────────────────────────────────────
// Runs AFTER the AI generates program JSON.
// Guarantees that prohibited exercises never persist in the final saved program
// for older adult users, regardless of AI output.
// Uses minimal local interfaces to avoid circular import with ai.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = Record<string, any>;

// Exercises that must NEVER appear for older adults at any rep range.
const ALWAYS_PROHIBITED_PATTERNS: Array<{ pattern: RegExp; replacement: string; repOverride?: string }> = [
  { pattern: /\bbox[\s-]?jump/i,             replacement: "Box Step-Up (slow, controlled)",             repOverride: "8-10" },
  { pattern: /\bbroad[\s-]?jump/i,           replacement: "Step-Up with Knee Drive",                    repOverride: "8-10" },
  { pattern: /\bdepth[\s-]?jump/i,           replacement: "Step-Down (eccentric focus)",                repOverride: "8-10" },
  { pattern: /\bjump[\s-]?squat/i,           replacement: "Goblet Squat (slow, controlled)",             repOverride: "10-12" },
  { pattern: /\bplyometric/i,                replacement: "Box Step-Up (slow, controlled)",             repOverride: "8-10" },
  { pattern: /\bpower[\s-]?clean/i,          replacement: "Trap Bar Deadlift (controlled)",             repOverride: "8-10" },
  { pattern: /\bhang[\s-]?clean/i,           replacement: "Dumbbell Romanian Deadlift",                 repOverride: "10-12" },
  { pattern: /\bhang[\s-]?snatch/i,          replacement: "Dumbbell Romanian Deadlift",                 repOverride: "10-12" },
  { pattern: /\bpower[\s-]?snatch/i,         replacement: "Dumbbell Romanian Deadlift",                 repOverride: "10-12" },
  // Isolated snatch — exclude "overhead snatch" only; avoid hitting "snatch grip" patterns
  { pattern: /^snatch$/i,                    replacement: "Dumbbell Romanian Deadlift",                 repOverride: "10-12" },
  { pattern: /\bbulgarian[\s-]?split[\s-]?squat/i, replacement: "Rear-Foot Elevated Split Squat (supported)", repOverride: "10-12 each side" },
];

// Exercises that must be replaced only when the rep range is in the 1–6 (high-load) zone.
const HEAVY_LOAD_PATTERNS: Array<{ pattern: RegExp; replacement: string; repOverride: string }> = [
  { pattern: /\bconventional[\s-]?(?:barbell[\s-]?)?deadlift/i, replacement: "Trap Bar Deadlift (controlled)",   repOverride: "8-10" },
  { pattern: /\bbarbell[\s-]?deadlift/i,                         replacement: "Trap Bar Deadlift (controlled)",   repOverride: "8-10" },
  { pattern: /\bbarbell[\s-]?(?:back[\s-]?)?squat/i,             replacement: "Goblet Squat",                     repOverride: "10-12" },
  { pattern: /\bback[\s-]?squat/i,                               replacement: "Goblet Squat",                     repOverride: "10-12" },
];

// Pull-up patterns — replace ONLY if the exercise appears to be unscaled (no "assisted", "band", "lat pulldown" modifiers).
const UNSCALED_PULLUP_PATTERN = /^(?:weighted\s+)?pull[\s-]?up(?:s)?$/i;

/** Returns true if a rep string (e.g. "3-5", "4", "5-6") is in the 1–6 heavy-load zone. */
function isHeavyRepRange(reps: string | undefined): boolean {
  if (!reps) return false;
  const m = reps.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?/);
  if (!m) return false;
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  return hi <= 6;
}

/**
 * Scans a generated program for exercises prohibited for older adults and
 * replaces them with safe alternatives. Adjusts rep ranges as needed.
 * Returns a deep-copied sanitized program (original is not mutated).
 *
 * Safe to call on any program — if the user is NOT an older adult, returns the
 * program unchanged.
 */
export function sanitizeOlderAdultProgram(
  program: AnyProgram,
  userMessage: string,
): AnyProgram {
  const profile = detectSpecialPopulation(userMessage, null);
  if (!profile || !profile.tags.includes("older_adult")) {
    return program; // Not an older adult — no changes needed
  }

  const substitutions: Array<{ original: string; replacement: string; reason: string }> = [];
  const sanitized: AnyProgram = JSON.parse(JSON.stringify(program));

  for (const day of (sanitized.days ?? []) as AnyProgram[]) {
    for (const ex of (day.exercises ?? []) as AnyProgram[]) {
      const name: string = ex.name ?? "";

      // 1. Always-prohibited exercises
      let replaced = false;
      for (const rule of ALWAYS_PROHIBITED_PATTERNS) {
        if (rule.pattern.test(name)) {
          substitutions.push({ original: name, replacement: rule.replacement, reason: "always-prohibited for older adults" });
          ex.name = rule.replacement;
          if (rule.repOverride) ex.reps = rule.repOverride;
          replaced = true;
          break;
        }
      }
      if (replaced) continue;

      // 2. Heavy-load patterns — only replace if rep range is 1–6
      for (const rule of HEAVY_LOAD_PATTERNS) {
        if (rule.pattern.test(name) && isHeavyRepRange(ex.reps)) {
          substitutions.push({ original: name, replacement: rule.replacement, reason: `heavy rep range (${ex.reps}) not safe for older adult` });
          ex.name = rule.replacement;
          ex.reps = rule.repOverride;
          break;
        }
      }

      // 3. Unscaled pull-ups
      if (UNSCALED_PULLUP_PATTERN.test(name.trim())) {
        substitutions.push({ original: name, replacement: "Lat Pulldown (controlled)", reason: "unscaled pull-up as primary" });
        ex.name = "Lat Pulldown (controlled)";
        if (!ex.reps || isHeavyRepRange(ex.reps)) ex.reps = "10-12";
      }
    }
  }

  if (substitutions.length > 0 && process.env.NODE_ENV !== "production") {
    console.log("[OlderAdultSafetyFilter] Applied substitutions", JSON.stringify({ age: profile.ageFlag, substitutions }));
  }

  return sanitized;
}
