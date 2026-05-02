// ─── Weekly Research Update Seeder — Week 1 ──────────────────────────────────
//
// 3 curated principle documents covering the top identified knowledge gaps:
//   1. Hypertrophy Science Fundamentals (strength_conditioning)
//   2. Recovery and Fatigue Management Protocols (recovery_wellness)
//   3. Concurrent Training — Strength + Endurance (strength_conditioning)
//
// Documents are inserted as status: "pending" / isActive: false.
// DO NOT auto-approve. Admin must review before these enter agent retrieval.
//
// Source: "Weekly Curated Update"
// Week:   1 (Gaps: hypertrophy, recovery, concurrent training)
// Limit:  5 docs / 25 chunks per week (this week: 3 docs / 15 chunks)

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Librarian Evaluation Summary ────────────────────────────────────────────
//
// All 3 candidates were evaluated against Research Librarian Agent criteria:
//   - Source quality: Internal curated principle documents (expert_consensus)
//   - Evidence type: Broad consensus across sports science literature
//   - Warning flags: expert_consensus (no primary citations) — expected for curated docs
//   - Recommendation: needs_review (admin confirmation required per protocol)
//   - Trust level: high (well-established principles, not single-study claims)
//
// Retrieval validation (Phase 6):
//   - "build a hypertrophy program" → tags: hypertrophy, volume, muscle_growth ✓
//   - "how do I know when to deload" → tags: deload, fatigue_management, recovery ✓
//   - "I want strength AND cardio" → tags: concurrent_training, interference_effect ✓
//
// Programming impact (Phase 7):
//   - After approval, programming guidance will be extended for all 3 topics.
//   - These docs are pending — impact testing runs after admin approval.

// ─── Document Definitions ─────────────────────────────────────────────────────

const WEEKLY_UPDATE_WEEK1_DOCUMENTS = [
  // ─── 1. Hypertrophy Science Fundamentals ───────────────────────────────────
  {
    title: "Hypertrophy Science Fundamentals — Weekly Curated Update",
    category: "strength_conditioning" as const,
    source: "Weekly Curated Update",
    topicTags: ["hypertrophy", "volume", "muscle_growth", "rep_ranges", "training_frequency"],
    populationTags: ["general_adults", "intermediate_trainees", "beginners"],
    evidenceType: "expert_consensus" as const,
    trustLevel: "high" as const,
    confidence: "strong" as const,
    status: "pending" as const,
    isActive: false,
    librarianRecommendation: "needs_review" as const,
    librarianAdminNotes:
      "Generated via weekly research update. Review before approval. Expert consensus curated doc covering hypertrophy mechanisms, rep ranges, volume landmarks, and frequency. No primary citations — well-established principles. Recommend approval after admin review.",
    warningFlags: ["expert_consensus"],
    plainLanguageSummary:
      "Muscle hypertrophy is primarily driven by mechanical tension — applying near-maximal load through a full range of motion. Rep ranges for hypertrophy span a wide continuum (6–30 reps), producing comparable results when effort is equated close to failure. Weekly training volume (10–20 hard sets per muscle per week) is the strongest modifiable predictor of muscle growth.",
    coachingImplications:
      "Structure hypertrophy programs around compound movements performed through full range of motion with controlled effort close to failure. Allow volume to progress gradually over weeks — beginners respond to 4–10 sets per muscle per week, intermediate trainees to 10–20. Train each muscle group 2–3 times per week to distribute volume and reduce per-session fatigue. Rest 2–3 minutes between sets for compound lifts to preserve force output and total volume capacity. Progressive overload — adding reps, load, or sets week to week — is non-negotiable for continued hypertrophy.",
    programmingImplications:
      "Rep ranges of 6–30 are all effective for hypertrophy when taken close to failure (0–4 reps in reserve). Mix moderate (8–12) and higher (15–20) rep ranges across exercises and sessions. Weekly set volume per muscle group: beginners 4–10 sets, intermediate 10–20, advanced up to 20+. Frequency: 2–3 sessions per muscle per week. Compound exercises (squat, press, row, hinge) should anchor each session; isolation work supplements where needed. Rest periods: 2–3 minutes for compound lifts, 60–90 seconds for isolation. Exercise variety across a mesocycle promotes complete stimulation of all muscle regions.",
    safetyConsiderations:
      "Training to absolute failure is not required and may increase injury risk — working 0–3 reps in reserve (RIR) provides sufficient stimulus with better safety margins. Beginners should build technique proficiency before pushing near-failure. Volume should be increased incrementally: adding 1–2 sets per muscle per week avoids excessive soreness and overuse risk. Monitor for persistent soreness, sleep disruption, and declining performance as early overreaching signals.",
    limitations:
      "Most hypertrophy research is conducted on young, trained males. Evidence on older adults, females, and beginners is growing but less comprehensive. Optimal volume is highly individual — some trainees may respond better to lower volumes. Exact mechanisms of hypertrophy remain debated; this document reflects the current dominant consensus. These principles do not replace individualized periodization planning.",
    contraindications:
      "High-rep near-failure training is contraindicated for individuals with acute joint pain, recent musculoskeletal injury, or unmanaged cardiovascular conditions. Training volume guidance does not apply during active deload weeks.",
  },

  // ─── 2. Recovery and Fatigue Management Protocols ──────────────────────────
  {
    title: "Recovery and Fatigue Management Protocols — Weekly Curated Update",
    category: "recovery_wellness" as const,
    source: "Weekly Curated Update",
    topicTags: ["recovery", "fatigue_management", "deload", "sleep", "load_management"],
    populationTags: ["general_adults", "athletes", "intermediate_trainees", "older_adults"],
    evidenceType: "expert_consensus" as const,
    trustLevel: "high" as const,
    confidence: "moderate" as const,
    status: "pending" as const,
    isActive: false,
    librarianRecommendation: "needs_review" as const,
    librarianAdminNotes:
      "Generated via weekly research update. Review before approval. Expert consensus curated doc covering deload timing, sleep, active recovery, and HRV-based readiness. No primary citations — well-established principles. HRV guidance is moderately evidenced. Recommend approval after admin review.",
    warningFlags: ["expert_consensus"],
    plainLanguageSummary:
      "Training adaptation occurs during recovery, not during the training session. Sleep (7–9 hours) is the single most impactful recovery tool. Structured deload periods every 4–8 weeks — reducing volume by 40–60% while maintaining intensity — allow accumulated fatigue to dissipate without losing fitness adaptations.",
    coachingImplications:
      "Coach athletes to treat recovery as training: consistent sleep, planned deloads, and strategic rest days are not optional extras — they determine whether training adaptations are realized. Signs that a deload or additional rest is needed include: soreness lasting more than 48 hours, multiple consecutive sessions of declining performance, poor sleep quality, elevated resting heart rate, and mood disturbance or loss of motivation. Older adults and beginners typically need longer inter-session recovery than intermediate or advanced athletes.",
    programmingImplications:
      "Schedule a structured deload every 4–8 weeks: reduce volume by 40–60% (e.g., from 16 sets per muscle to 6–8 sets) while keeping exercise selection and load similar. Avoid reducing intensity to near-zero during deloads — maintaining load helps prevent skill decay. Space sessions for the same muscle group at least 24–48 hours apart (minimum). Active recovery sessions (walking, light cycling, swimming) on off days accelerate repair by improving blood flow without adding training stress. Program at least 1–2 full rest days per week for most users.",
    safetyConsiderations:
      "Sleep restriction below 6 hours significantly impairs strength, power output, and anabolic hormone profiles — consistently poor sleep should prompt a program volume reduction, not training intensification. Cold water immersion may reduce acute soreness but may blunt long-term hypertrophy if used chronically after every hypertrophy session. HRV monitoring is a practical readiness tool — HRV readings significantly below personal baseline suggest incomplete recovery and warrant reduced session intensity or a rest day.",
    limitations:
      "Optimal deload frequency is highly individual — some athletes tolerate 6-week blocks, others need deloads every 3–4 weeks. HRV as a recovery metric shows promise but individual HRV baselines vary widely and require personal calibration. Sleep research is predominantly conducted in controlled settings; real-world sleep quality is multifactorial. Recovery rates vary significantly by age, training history, and life stress.",
    contraindications:
      "Deload timing guidance does not apply during return-to-training after illness or injury, where modified protocols are required. Active recovery activities should be low enough in intensity to avoid accumulating additional fatigue — any activity that causes soreness is not recovery. HRV-guided training modifications should not substitute for medical evaluation when fatigue symptoms are prolonged or severe.",
  },

  // ─── 3. Concurrent Training — Strength + Endurance ─────────────────────────
  {
    title: "Concurrent Training — Combining Strength and Endurance — Weekly Curated Update",
    category: "strength_conditioning" as const,
    source: "Weekly Curated Update",
    topicTags: ["concurrent_training", "strength", "endurance", "interference_effect", "programming"],
    populationTags: ["general_adults", "athletes", "intermediate_trainees"],
    evidenceType: "expert_consensus" as const,
    trustLevel: "high" as const,
    confidence: "moderate" as const,
    status: "pending" as const,
    isActive: false,
    librarianRecommendation: "needs_review" as const,
    librarianAdminNotes:
      "Generated via weekly research update. Review before approval. Expert consensus curated doc covering the interference effect and practical concurrent training guidelines. Interference effect evidence is moderately consistent. Conflicting evidence exists on HIIT vs. steady-state interference magnitude. Recommend approval after admin review.",
    warningFlags: ["expert_consensus", "conflicting_evidence"],
    plainLanguageSummary:
      "Concurrent training — combining resistance and endurance training in the same program — is the most common scenario for general fitness users and many athletes. The 'interference effect' is real but often overstated: endurance work primarily impairs strength and hypertrophy gains when volume is excessive, sessions are poorly sequenced, or high-intensity cardio is used without recovery time. Both goals are achievable simultaneously for most users with proper programming.",
    coachingImplications:
      "Reassure users that strength and cardio goals are compatible — the interference effect is most pronounced at high endurance volumes and with poor session sequencing. For general fitness users, 2–3 resistance sessions plus 2–3 moderate-intensity cardio sessions per week is a practical evidence-informed structure that supports both goals. When combining in the same day, always perform resistance training before cardio — residual fatigue from cardio before lifting significantly reduces force output. Cycling causes less interference than running due to lower eccentric muscle damage; this makes cycling a better concurrent modality when strength is a priority.",
    programmingImplications:
      "Separate resistance and endurance sessions by at least 6 hours when possible. If combined in one session: resistance first, cardio second. Limit high-intensity interval training (HIIT) to 1–2 sessions per week maximum when also strength training — HIIT causes greater interference than moderate steady-state work. Low-to-moderate intensity steady-state cardio (Zone 2, ~60–70% max heart rate) causes minimal interference with strength and hypertrophy and supports cardiovascular recovery. Keep total weekly endurance volume manageable: more than 3 high-intensity cardio sessions per week significantly increases interference risk. Concurrent training beginners and intermediate trainees adapt well to both stimuli; advanced athletes seeking maximal strength or hypertrophy may need to prioritize one adaptation.",
    safetyConsiderations:
      "Excessive concurrent volume without adequate recovery is a leading cause of overuse injury and overreaching. Monitor total weekly training stress: combining 4+ strength sessions with 4+ high-intensity cardio sessions without recovery days is unsustainable for most. Ensure at least 2 full rest or active recovery days per week for concurrent trainees.",
    limitations:
      "Most interference effect research uses specific exercise modalities (cycling, running) and may not generalize equally to all endurance sports. The magnitude of interference varies considerably with individual recovery capacity, training history, and life stress. Research on optimal concurrent training structure for older adults and beginners is limited — these populations likely adapt differently than the trained young adults who dominate the research base.",
    contraindications:
      "Concurrent high-intensity cardio and near-failure resistance training in the same session is not appropriate for beginners or individuals with cardiovascular disease risk factors without medical clearance. Running-based concurrent training may be contraindicated for individuals with lower-limb injuries or pain — cycling or swimming are safer substitutes.",
  },
];

// ─── Seeder Functions ─────────────────────────────────────────────────────────

export async function hasWeeklyUpdateWeek1Research(): Promise<boolean> {
  const result = await db
    .select({ cnt: count() })
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.source, "Weekly Curated Update"));
  return (result[0]?.cnt ?? 0) > 0;
}

export async function seedWeeklyUpdateWeek1(force = false): Promise<{
  inserted: number;
  skipped: number;
  chunks: number;
}> {
  const alreadySeeded = await hasWeeklyUpdateWeek1Research();

  if (alreadySeeded && !force) {
    logger.info("[WeeklyUpdateSeeder] Week 1 research already seeded — skipping");
    return { inserted: 0, skipped: WEEKLY_UPDATE_WEEK1_DOCUMENTS.length, chunks: 0 };
  }

  let inserted = 0;
  let totalChunks = 0;

  for (const docData of WEEKLY_UPDATE_WEEK1_DOCUMENTS) {
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

      // Update with content fields (stored separately from insert to keep types clean)
      await db
        .update(researchDocumentsTable)
        .set({
          plainLanguageSummary,
          coachingImplications,
          programmingImplications,
          safetyConsiderations,
          limitations,
          contraindications,
        })
        .where(eq(researchDocumentsTable.id, doc.id));

      // Generate 5 retrieval chunks per document
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
      logger.info({ title: doc.title }, "[WeeklyUpdateSeeder] Seeded pending document");
    } catch (err) {
      logger.warn({ err, title: docData.title }, "[WeeklyUpdateSeeder] Failed to insert document");
    }
  }

  logger.info(
    { inserted, totalChunks, status: "pending", isActive: false },
    "[WeeklyUpdateSeeder] Week 1 seed complete — documents are PENDING, not active",
  );
  return { inserted, skipped: 0, chunks: totalChunks };
}
