// ─── Strength Research Seed Pack ──────────────────────────────────────────────
//
// Curated principle documents for strength training.
// These are NOT fake citations. They are synthesized coaching principles
// derived from established sports science frameworks (NSCA, CSCS, strength
// science literature, and resistance training research).
//
// Admin note on every document:
//   "Seed principle document. Replace or supplement with source-backed
//    evidence as library matures."
//
// Run via: POST /api/admin/research/seed-strength (admin only)

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { createChunksForDocument } from "./research-ingestion";
import { logger } from "../lib/logger";
import type { InsertResearchDocument } from "@workspace/db";

// ─── Seed Data ────────────────────────────────────────────────────────────────

const ADMIN_NOTE =
  "Seed principle document. Replace or supplement with source-backed evidence as library matures.";

const STRENGTH_SEED_DOCUMENTS: (InsertResearchDocument & {
  plainLanguageSummary: string;
  coachingImplications: string;
  programmingImplications: string;
  safetyConsiderations: string;
  limitations: string;
  contraindications: string;
})[] = [
  // 1. Max Strength Programming Principles
  {
    title: "Max Strength Programming Principles — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "max_strength", "progressive_overload", "intensity"],
    populationTags: ["intermediate", "advanced"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for maximum strength development — heavy loading, lower rep ranges, extended rest, technical quality, and long-term progressive overload planning.",
    plainLanguageSummary:
      "Max strength is developed through heavy compound loading (typically 75–95% of 1RM), low-to-moderate rep ranges (1–6 reps), full recovery between sets, and consistent progressive overload over months and years. Technical quality on heavy lifts must never be sacrificed for load — failed reps on high-skill barbell movements carry significant injury risk.",
    coachingImplications:
      "Use low-rep, heavy-load work for max strength expression. Prioritize the major barbell patterns (squat, deadlift, bench, overhead press, row). Technical failure is the real failure point — not rep failure. Build strength over months of consistent, gradually increasing work, not through aggressive load jumps. Longer training age requires more structure (periodization, intensity variation) to continue progressing.",
    programmingImplications:
      "Primary strength sets: 3–6 sets of 1–6 reps at 75–95% 1RM. Rest: 3–5 minutes between heavy compound sets. Weekly frequency: 2–4 sessions. Progress by adding small loads (2.5–5 kg) per week for novices; week-to-week or block-to-block for intermediate+. Periodize by varying intensity over 4–6 week blocks. Deload every 4–6 weeks by reducing volume 30–50%.",
    safetyConsiderations:
      "Heavy barbell lifting carries significant risk if form breaks down. Do not program maximal loads until technique is consistent across all rep ranges. Avoid true-failure on high-skill technical lifts (squat, deadlift, Olympic lifts). Warm-up sets are mandatory — never jump straight to working weight. Address any pain immediately — do not push through joint pain under heavy load.",
    limitations:
      "Max strength programming principles apply most directly to barbell training with coaches or experienced athletes. Equipment, coaching quality, and individual biomechanics all affect optimal loading strategies. Not all athletes require max strength emphasis — context and goal determine priority.",
    contraindications:
      "Maximum-intensity barbell lifting is contraindicated for athletes with active spinal, hip, knee, or shoulder pathology without clinical clearance. Do not program competition-attempt loads in training without meet-prep context.",
  },

  // 2. Strength Volume and Frequency
  {
    title: "Strength Volume and Frequency — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "volume", "frequency", "programming"],
    populationTags: ["beginner", "intermediate", "advanced"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for managing weekly volume and frequency in strength training — weekly hard sets, multi-pattern training, and balancing stress with recovery.",
    plainLanguageSummary:
      "Strength training requires sufficient frequency to reinforce movement patterns and adequate volume to drive adaptation, without accumulating so much fatigue that recovery is compromised. Most major patterns benefit from 2+ training exposures per week. Weekly hard-set volume for strength: 6–12 sets per major pattern. More volume is not always better — quality sets drive progress, not accumulated junk volume.",
    coachingImplications:
      "Structure programs around major movement patterns trained 2–4 times per week. Avoid excessive volume on heavy compound lifts — more sets above recovery capacity produces fatigue, not strength. For intermediate+ athletes, frequency matters more than total set count in a single session. Distribute volume across the week rather than cramming it into fewer sessions.",
    programmingImplications:
      "Target 6–12 weekly hard sets per major pattern for strength development. 3–4 sessions per week is the typical effective range. Novices can progress on as few as 2 sessions per week if consistency is high. Heavy compound lifts: cap per-session working sets at 3–6 to maintain quality. Accessory work can add 2–3 additional sets per pattern. Reduce volume by 40–50% in deload weeks.",
    safetyConsiderations:
      "Excess volume accumulated on heavy technical lifts increases cumulative fatigue and injury risk. Monitor for technique degradation as a signal of excessive volume or insufficient recovery. Do not add volume continuously without planned deload periods.",
    limitations:
      "Optimal volume varies significantly by individual recovery capacity, training age, intensity, and nutrition. The 6–12 sets/pattern range is a useful starting point, not a fixed prescription. High-frequency low-volume approaches can work equally well for some athletes.",
    contraindications:
      "High weekly volume on heavy compound lifts is not appropriate for athletes returning from injury, beginners with poor technique, or during in-season phases where recovery is limited.",
  },

  // 3. Progressive Overload for Strength
  {
    title: "Progressive Overload for Strength — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "progressive_overload", "periodization"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for progressive overload in strength training — load increases, alternative progression forms, deload timing, and progression matching to experience level.",
    plainLanguageSummary:
      "Progressive overload is the fundamental driver of strength adaptation — the body must be progressively challenged over time. Load is the most direct overload lever, but reps, sets, tempo, ROM, and density are all valid progression methods when load increases are not appropriate. Deloading when fatigue accumulates is part of long-term progression, not a failure.",
    coachingImplications:
      "Novices: add small loads each session (microplates, 2.5 kg increments). Intermediate: progress load weekly or bi-weekly. Advanced: block-based load progression (monthly). When load cannot increase, progress via more reps at the same weight, additional sets, reduced rest, slower tempo, or increased ROM. Deload every 4–6 weeks — reduce volume by 30–50% while maintaining intensity.",
    programmingImplications:
      "Linear progression for novices: same lift, add weight each session. Intermediate: undulating periodization — vary load across sessions (heavy/moderate/light). Advanced: block periodization — accumulation → intensification → realization. Always deload before peaking. Track all lifts — load, reps, sets, RPE. Progression should be documented, not guessed.",
    safetyConsiderations:
      "Aggressive load progression without adequate base or form increases injury risk. Do not rush through novice linear progression to reach intermediate programming. When in doubt, add a rep before adding a plate. Form must be consistent at current load before progressing.",
    limitations:
      "Progression rates vary significantly by individual, sleep, nutrition, stress, and training history. Linear progression stalls faster for older adults and athletes under high concurrent training loads. Alternative progression methods (density, tempo, ROM) have less direct research support than load progression for strength.",
    contraindications:
      "Forced progression through pain is contraindicated. Progressive overload in pain context must be symptom-guided — progress only when symptoms remain stable or improve.",
  },

  // 4. Rest Periods for Strength
  {
    title: "Rest Periods for Strength Training — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "rest_periods", "intensity", "recovery"],
    populationTags: ["beginner", "intermediate", "advanced"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for rest period management in strength training — longer rest for heavy compound lifts, appropriate accessory rest, and the role of rest in supporting output quality.",
    plainLanguageSummary:
      "Rest periods between strength sets directly affect the quality of subsequent sets. Heavy compound lifts (squat, deadlift, press) require 3–5 minutes of rest between working sets to allow phosphocreatine resynthesis and CNS recovery. Short rest periods in strength training compromises load and quality — this is appropriate for conditioning goals, not strength development.",
    coachingImplications:
      "Prescribe rest based on the purpose of the lift, not time efficiency. Heavy compound lifts: 3–5 minutes minimum. Moderate-intensity compound work: 2–3 minutes. Accessory and isolation work: 60–120 seconds. Do NOT compress rest periods on primary strength lifts — this is one of the most common programming errors. If time is a genuine constraint, reduce volume before compressing rest.",
    programmingImplications:
      "Program rest as part of the prescription: 'Squat 4×4 @ 85% — 4 min rest.' Accessory supersets acceptable: pair non-competing muscle groups (e.g., pressing + rowing) to improve time efficiency without compromising primary lift quality. Avoid circuit-style strength programming if max strength is the goal.",
    safetyConsiderations:
      "Insufficient rest between heavy compound sets increases fatigue-related technical failure risk, especially in lower-back and knee-dominant lifts. Compressed rest periods on heavy deadlifts and squats dramatically increase injury risk from degraded form.",
    limitations:
      "Longer rest periods require longer sessions — a real-world constraint. Rest period research focuses mostly on compound lifts; accessory rest is less studied. Individual recovery rates vary by fitness level, age, and load.",
    contraindications:
      "Circuit-style short rest (under 60 seconds) is not appropriate for maximum strength development in the primary compound movements. This applies regardless of time pressure.",
  },

  // 5. Exercise Selection for Strength
  {
    title: "Exercise Selection for Strength Training — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "exercise_selection", "movement_patterns"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for exercise selection in strength programming — major movement patterns, variation selection based on goal/equipment/pain/skill, and accessory work placement.",
    plainLanguageSummary:
      "Effective strength programs are built around the major human movement patterns: squat, hinge, push, pull, carry, and trunk. Within each pattern, exercise variation should be selected based on the athlete's goal, available equipment, pain or limitations, movement skill, and training experience. Not every athlete needs a barbell back squat — the movement pattern matters more than the specific exercise.",
    coachingImplications:
      "Always identify which pattern each exercise serves. Ensure weekly balance across all 6 major patterns. Select variations the athlete can execute well — a goblet squat performed correctly outperforms a barbell squat done poorly. Modify exercises to match pain, equipment, and skill level. Progress exercise variation difficulty over time as skill and strength develop.",
    programmingImplications:
      "Primary compound movements (1–2 per session): anchor each session around 1–2 major pattern exercises. Accessory work (2–4 exercises): reinforce technical weaknesses, add volume, or address imbalances. Daily template: primary strength exercise → secondary strength/accessory exercise → isolation/support work. Ensure weekly training covers all 6 patterns across sessions.",
    safetyConsiderations:
      "Exercise selection errors are a primary cause of training-related pain. Matching exercise to individual anatomy, mobility, and skill level is mandatory — not optional. Do not program exercises the athlete cannot execute safely. Modify before removing — most exercises have pain-free alternatives within the same pattern.",
    limitations:
      "There is no single 'best' strength exercise — variation is context-dependent. Transfer of strength between variations (e.g., squat to leg press) is partial, not complete. Specifying exercises without assessing individual movement quality is programming by template, not by need.",
    contraindications:
      "High-risk variations (barbell behind-the-neck press, full-depth Jefferson curl under heavy load, Smith machine squats for athletes) should be avoided unless athlete has specific need and demonstrated skill.",
  },

  // 6. Beginner Strength Training
  {
    title: "Beginner Strength Training — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "beginner", "motor_learning", "technique"],
    populationTags: ["beginner"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for beginner strength training — motor learning emphasis, conservative loading, simple progression, avoiding complexity, and building training consistency first.",
    plainLanguageSummary:
      "Beginners improve strength rapidly from any stimulus — the priority is motor learning (movement quality), not optimal loading. Over-complicating beginner programming with advanced techniques, periodization schemes, or high volumes delays skill development and increases dropout. Consistency, progressive loading, and movement quality are the only requirements for beginner strength progress.",
    coachingImplications:
      "Beginners need to learn movement patterns — not chase loading. Use moderate weights (50–70% 1RM or RPE 5–7) while technique is being established. Limit to 3–6 exercises per session. Simple 3×5 or 3×8 structures are highly effective. Avoid failure training in the first 3–6 months. Prioritize showing up consistently over any specific protocol.",
    programmingImplications:
      "2–3 sessions per week full-body. 3–4 exercises per session covering major patterns. Linear progression: add small weight each session on primary lifts. Rep range: 5–10 for most exercises. No specialization or advanced techniques until consistent training for 6+ months. Volume increases gradually after 8–12 weeks of consistent attendance.",
    safetyConsiderations:
      "Beginners should not train to failure on technical compound lifts — form degrades significantly at failure and injury risk is high. Always leave 2–3 reps in reserve. Movement quality check before every loading increase. If form breaks down, reduce load rather than pushing through.",
    limitations:
      "Beginner gains are partly explained by neural adaptations — these do not necessarily indicate genuine strength progress that will persist. Motivation and adherence are the primary limiting factors for beginners, not program optimization. Programming complexity is frequently wasted on beginners.",
    contraindications:
      "Advanced periodization schemes (DUP, block periodization, conjugate methods) are unnecessary and potentially counterproductive for beginners. True failure training on compound lifts is not appropriate for athletes in the first 6 months of training.",
  },

  // 7. Strength Training with Pain or Limitations
  {
    title: "Strength Training with Pain or Limitations — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "pain_modification", "safety", "joint_friendly"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for strength training with pain or physical limitations — preserving training intent while modifying painful patterns, using pain-free ROM, and avoiding diagnosis or treatment claims.",
    plainLanguageSummary:
      "Pain or physical limitations do not mean stopping all strength training. The goal is to preserve training intent while modifying the painful pattern. This means using pain-free ROM, selecting alternative exercises within the same movement pattern, adjusting load, tempo, or range, and always staying within symptom-free boundaries. Coaches do not diagnose or treat — they modify exercise selection conservatively.",
    coachingImplications:
      "When pain is present: identify the painful movement, find a pain-free alternative within the same pattern, and maintain the training intent. Examples: knee pain → box squat or leg press instead of full-squat; shoulder pain → landmine press instead of overhead press; back pain → trap bar deadlift instead of conventional. Do not avoid all loading of the area — many structures benefit from load within pain-free range.",
    programmingImplications:
      "Pain-context programming: use symptom-guided selection for every exercise. Reduce load and volume 20–40% initially when pain is present. Prioritize isometric holds as bridge exercises when dynamic loading is provocative. Reintroduce dynamic loading gradually at reduced range and load. Never prescribe exercise that consistently reproduces pain >2/10.",
    safetyConsiderations:
      "Do not diagnose or claim to treat injury. Never prescribe exercises that reproduce significant pain. Refer to physiotherapist or clinician for clinical assessment when pain is persistent, worsening, or accompanied by neurological symptoms (numbness, tingling). Always frame modifications as 'working around' rather than 'treating' the issue.",
    limitations:
      "Coaching modifications for pain are not medical treatment. Individual pain thresholds and injury presentations vary widely. Some pain presentations require clinical evaluation before exercise modification is appropriate.",
    contraindications:
      "Progressive loading of a painful joint without clinical clearance when pain is >4/10, worsening over sessions, or accompanied by neurological symptoms is contraindicated. Avoid high-load/high-velocity movements on acutely injured areas.",
  },

  // 8. Strength and Athletic Performance
  {
    title: "Strength and Athletic Performance — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "athletic_performance", "power", "force_production"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for strength training in athletic performance contexts — max strength as a force-production foundation, pairing with power/speed work, and avoiding fatigue that harms sport qualities.",
    plainLanguageSummary:
      "Maximum strength is the foundation for athletic force production — it directly supports sprinting, jumping, change of direction, and power output. However, strength for athletic performance must be paired with power, speed, and sport-specific training, not treated as the sole focus. Excessive fatigue from strength work that impairs speed/power quality is counterproductive to athletic performance.",
    coachingImplications:
      "Strength training for athletes should serve sport performance — not replace it. Build max strength during off-season and pre-season phases. Reduce strength volume in-season to maintenance while preserving intensity. Pair strength sessions with power work (Olympic lifts, jump squats, medicine ball throws) to express strength as sport-relevant force. Avoid placing heavy strength sessions immediately before or after high-intensity speed or sport practice.",
    programmingImplications:
      "Off-season: 3–4 strength sessions per week at higher volume. Pre-season: 2–3 sessions, transitioning to power emphasis. In-season: 1–2 sessions maintenance (lower volume, moderate-high intensity). Session order: power/speed first → strength second. Strength sessions should be completed 24–48 hours before sport practice or competition. Heavy lower-body sessions must not immediately precede sprint or plyometric sessions.",
    safetyConsiderations:
      "Strength training fatigue that carries into sport practice or competition compromises both performance and injury risk. Monitor athlete readiness when combining heavy strength and high-intensity sport training. Reduce strength volume during competition-heavy periods even if the athlete feels able to train.",
    limitations:
      "The optimal balance of strength to sport-specific training varies by sport, position, training age, and competitive schedule. Transfer of strength gains to sport performance is not automatic — sport-specific skill and power development must complement strength training.",
    contraindications:
      "Maximum-intensity strength training immediately before speed, power, or sport-specific sessions is contraindicated — it compromises quality and elevates injury risk from cumulative fatigue.",
  },

  // 9. Strength Periodization
  {
    title: "Strength Periodization — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "periodization", "training_phase", "deload"],
    populationTags: ["intermediate", "advanced"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for strength periodization — organizing loading over weeks and blocks, alternating accumulation/intensification/deload phases, and matching progression to training age and recovery.",
    plainLanguageSummary:
      "Periodization is the planned organization of training variables (volume, intensity, frequency) over time to drive progression and manage fatigue. For strength, common models include linear (increasing load, decreasing reps), undulating (varying load within weeks), and block periodization (distinct phases: accumulation, intensification, realization, deload). Deload phases are not optional — they are required for long-term progress.",
    coachingImplications:
      "Match periodization complexity to training age: novices need simple linear progression; intermediate+ benefit from undulating or block approaches. Always plan deloads — every 4–6 weeks for most athletes. Peaking phases (highest intensity, lowest volume) should precede testing or competition, not daily training. Avoid maintaining maximum intensity indefinitely — fatigue accumulates and performance declines.",
    programmingImplications:
      "Novice: linear progression (session-to-session load increases). Intermediate: weekly undulating periodization (heavy/moderate/light days) or 4-week linear blocks with planned deload. Advanced: block periodization — 3–4 week accumulation (higher volume, moderate intensity) → 2–3 week intensification (lower volume, higher intensity) → 1 week deload → peak/test. Deload: reduce volume 40–50%, maintain intensity at 70–80%.",
    safetyConsiderations:
      "Training without planned deloads leads to cumulative fatigue accumulation, performance stagnation, and elevated injury risk. Forcing intensity peaks too frequently or for too long increases overuse injury risk, particularly in tendons.",
    limitations:
      "Periodization models are frameworks, not prescriptions — individual response varies. Research comparing periodization models shows modest differences; adherence to any structured plan outperforms unsystematic training.",
    contraindications:
      "True peaking (extremely high intensity, very low volume) is not appropriate for beginners, general fitness populations, or athletes without a dedicated competition to peak for.",
  },

  // 10. Strength for Older Adults
  {
    title: "Strength Training for Older Adults — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "strength_conditioning",
    topicTags: ["strength", "older_adults", "safety", "functional_strength"],
    populationTags: ["older_adult"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for strength training in older adult populations — supporting function and independence, conservative loading progression, controlled movement, joint-friendly selection, and avoiding unnecessary high-risk variations.",
    plainLanguageSummary:
      "Strength training for older adults is among the most evidence-supported interventions for maintaining function, independence, and quality of life. Older adults can and should train with meaningful loads — the key differences are conservative progression timelines, extended recovery windows, emphasis on controlled movement quality, and joint-friendly exercise variation. Avoiding high-risk exercises is a priority.",
    coachingImplications:
      "Frame strength training for older adults around function: getting off the floor, carrying groceries, climbing stairs. Choose exercises that build these capacities. Prioritize bilateral exercises before unilateral. Machine exercises are often preferable for stability and safety. Controlled tempo (3 seconds eccentric) is valuable. Avoid egos around load — 2–3 RIR is appropriate, not failure training.",
    programmingImplications:
      "2–3 sessions per week. 6–10 working sets per session. Exercise selection: goblet squat, leg press, hip hinge, lat pulldown, chest press, seated row, step-ups, farmer carry. Avoid: barbell back squat, heavy overhead pressing, ballistic exercises unless well-established. Progression: 3–4 week blocks before load increases. Use smaller weight increments (1–2.5 kg). Extended deload every 3–4 weeks.",
    safetyConsiderations:
      "Fall risk is the primary safety concern for older adult strength training. Avoid exercises with significant fall risk unless supervised and supported. Monitor blood pressure response to heavy efforts. Controlled tempo prevents momentum-driven injury. Ensure safe entry and exit from all exercise positions — this is often more hazardous than the exercise itself.",
    limitations:
      "Research on optimal strength programming for older adults is less precise than for younger populations. Individual health status (medication, cardiovascular status, osteoporosis, arthritis) significantly affects exercise selection and progression. Medical clearance before beginning strength training is appropriate for sedentary older adults.",
    contraindications:
      "High-impact exercises (box jumps, bounding), heavy axial loading (barbell back squat) without established technique and strength base, and training to failure are contraindicated for most older adult beginners. Exercises that significantly elevate blood pressure or require extreme joint ROM should be avoided without clinical clearance.",
  },
];

// ─── Seeder Functions ─────────────────────────────────────────────────────────

export async function hasStrengthResearch(): Promise<boolean> {
  const result = await db
    .select({ cnt: count() })
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.source, "Curated TrainChat Research Seed"));

  // Check for specifically strength docs
  const strengthDocs = await db
    .select({ cnt: count() })
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.category, "strength_conditioning"));

  return (strengthDocs[0]?.cnt ?? 0) > 0;
}

export async function seedStrengthResearch(force = false): Promise<{
  inserted: number;
  skipped: number;
  chunks: number;
}> {
  const alreadySeeded = await hasStrengthResearch();

  if (alreadySeeded && !force) {
    logger.info("[StrengthSeeder] Strength research already seeded — skipping");
    return { inserted: 0, skipped: STRENGTH_SEED_DOCUMENTS.length, chunks: 0 };
  }

  let inserted = 0;
  let totalChunks = 0;

  for (const docData of STRENGTH_SEED_DOCUMENTS) {
    try {
      const {
        plainLanguageSummary,
        coachingImplications,
        programmingImplications,
        safetyConsiderations,
        limitations,
        contraindications,
        ...insertDoc
      } = docData;

      const [doc] = await db
        .insert(researchDocumentsTable)
        .values(insertDoc)
        .returning();

      if (!doc) continue;

      // Generate chunks for all content fields
      const chunkTexts: { text: string; type: string }[] = [
        { text: `${doc.title}: ${plainLanguageSummary}`, type: "summary" },
        { text: coachingImplications, type: "coaching_implications" },
        { text: programmingImplications, type: "programming_implications" },
        { text: safetyConsiderations, type: "safety" },
        { text: limitations, type: "limitations" },
      ];

      for (const { text, type } of chunkTexts) {
        if (!text?.trim()) continue;
        await db.insert(researchChunksTable).values({
          documentId: doc.id,
          chunkText: text,
          chunkType: type,
          topicTags: doc.topicTags ?? [],
          category: doc.category,
          trustLevel: doc.trustLevel,
        });
        totalChunks++;
      }

      inserted++;
      logger.info({ title: doc.title }, "[StrengthSeeder] Seeded document");
    } catch (err) {
      logger.warn({ err, title: docData.title }, "[StrengthSeeder] Failed to insert document");
    }
  }

  logger.info({ inserted, totalChunks }, "[StrengthSeeder] Strength seed complete");
  return { inserted, skipped: 0, chunks: totalChunks };
}
