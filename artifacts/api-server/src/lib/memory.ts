/**
 * TrainChat Long-Term Memory Service (Phase 5)
 *
 * Stores, extracts, and retrieves durable coaching memories about a user.
 * Memories are high-value, training-relevant observations that persist
 * across sessions and inform future AI recommendations.
 *
 * Separation of concerns:
 * - training-intelligence.ts  → static rules from profile
 * - adaptation.ts             → short-term signals (recent readiness/feedback)
 * - memory.ts                 → long-term patterns and preferences
 * - insights.ts               → proactive suggestions from combined signals
 */

import { db, userMemoriesTable, userProfilesTable, readinessEntriesTable, sessionFeedbackTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemoryType =
  | "exercise_preference"   // prefers or avoids specific exercises/equipment
  | "pain_pattern"          // recurring discomfort with movement patterns
  | "session_preference"    // session length, format, structure preferences
  | "volume_response"       // how user responds to volume and intensity
  | "split_preference"      // preferred training structure / days
  | "recovery_pattern"      // sleep and recovery tendencies
  | "adherence_pattern";    // consistency tendencies

export type MemorySentiment = "positive" | "negative" | "neutral";
export type MemorySource = "onboarding" | "feedback" | "readiness" | "inferred";

export interface MemoryEntry {
  id: number;
  userId: number;
  type: MemoryType;
  subject: string;
  sentiment: MemorySentiment;
  confidence: number;
  source: MemorySource;
  detail: string;
  updatedAt: Date;
  createdAt: Date;
}

interface MemoryCandidate {
  type: MemoryType;
  subject: string;
  sentiment: MemorySentiment;
  confidence: number;
  source: MemorySource;
  detail: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Upsert a memory by userId + type + subject.
 * If one already exists with higher confidence, we only update if the new one is >= current.
 */
export async function upsertMemory(userId: number, candidate: MemoryCandidate): Promise<void> {
  const existing = await db
    .select()
    .from(userMemoriesTable)
    .where(
      and(
        eq(userMemoriesTable.userId, userId),
        eq(userMemoriesTable.type, candidate.type),
        eq(userMemoriesTable.subject, candidate.subject)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    // Only update if new confidence >= current (don't weaken established memories)
    if (candidate.confidence >= current.confidence) {
      await db
        .update(userMemoriesTable)
        .set({
          sentiment: candidate.sentiment,
          confidence: candidate.confidence,
          source: candidate.source,
          detail: candidate.detail,
          updatedAt: new Date(),
        })
        .where(eq(userMemoriesTable.id, current.id));
    }
  } else {
    await db.insert(userMemoriesTable).values({
      userId,
      type: candidate.type,
      subject: candidate.subject,
      sentiment: candidate.sentiment,
      confidence: candidate.confidence,
      source: candidate.source,
      detail: candidate.detail,
    });
  }
}

export async function listMemories(userId: number): Promise<MemoryEntry[]> {
  return db
    .select()
    .from(userMemoriesTable)
    .where(eq(userMemoriesTable.userId, userId))
    .orderBy(desc(userMemoriesTable.updatedAt)) as Promise<MemoryEntry[]>;
}

// ─── Extraction logic ─────────────────────────────────────────────────────────

function avg(vals: number[]): number {
  if (vals.length === 0) return 3;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Extract memories from user's onboarding profile.
 * Runs once on first sync; subsequent calls are idempotent (upsert logic handles it).
 */
async function extractProfileMemories(userId: number): Promise<MemoryCandidate[]> {
  const profiles = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  if (profiles.length === 0) return [];
  const p = profiles[0];
  const candidates: MemoryCandidate[] = [];

  // Equipment preferences
  if (p.equipment) {
    const eq_lower = p.equipment.toLowerCase();
    if (eq_lower.includes("dumbbell") && !eq_lower.includes("barbell")) {
      candidates.push({
        type: "exercise_preference",
        subject: "dumbbell exercises",
        sentiment: "positive",
        confidence: 3,
        source: "onboarding",
        detail: "User's available equipment is primarily dumbbells — programs should prioritize dumbbell-friendly variations.",
      });
    }
    if (eq_lower.includes("barbell") || eq_lower.includes("squat rack")) {
      candidates.push({
        type: "exercise_preference",
        subject: "barbell compound lifts",
        sentiment: "positive",
        confidence: 3,
        source: "onboarding",
        detail: "User has access to barbell and rack — compound barbell lifts are appropriate.",
      });
    }
    if (eq_lower.includes("bodyweight") || eq_lower === "none" || eq_lower.includes("home")) {
      candidates.push({
        type: "session_preference",
        subject: "bodyweight and minimal equipment training",
        sentiment: "positive",
        confidence: 3,
        source: "onboarding",
        detail: "User trains with minimal or bodyweight equipment — exercise selection should reflect this.",
      });
    }
  }

  // Injury/limitation patterns
  if (p.injuries) {
    const inj = p.injuries.toLowerCase();
    const painPatterns: { keywords: string[]; subject: string; detail: string }[] = [
      {
        keywords: ["shoulder", "rotator"],
        subject: "overhead shoulder movements",
        detail: "User reported shoulder injury/limitation in onboarding. Avoid aggressive overhead pressing and internal rotation under load.",
      },
      {
        keywords: ["knee", "patellar", "acl", "mcl"],
        subject: "high knee-stress movements",
        detail: "User reported knee issue/limitation. Reduce aggressive knee-dominant loading (deep squats, jump landings). Favor hip-dominant alternatives.",
      },
      {
        keywords: ["lower back", "lumbar", "disc", "herniat"],
        subject: "spinal loading",
        detail: "User reported lower back issue. Avoid high-load spinal compression. Prioritize hip hinge technique and core stability work.",
      },
      {
        keywords: ["hip", "groin", "labrum"],
        subject: "hip-loaded movements",
        detail: "User reported hip limitation. Monitor deep hip flexion, lateral movements, and high-rep hip-dominant exercises.",
      },
      {
        keywords: ["wrist", "forearm", "carpal"],
        subject: "loaded wrist extension",
        detail: "User reported wrist/forearm issue. Avoid heavy press movements that load wrist extension. Use neutral grip where possible.",
      },
    ];

    for (const pp of painPatterns) {
      if (pp.keywords.some((kw) => inj.includes(kw))) {
        candidates.push({
          type: "pain_pattern",
          subject: pp.subject,
          sentiment: "negative",
          confidence: 4,
          source: "onboarding",
          detail: pp.detail,
        });
      }
    }

    // Generic injury note if no specific pattern matched
    if (candidates.filter((c) => c.type === "pain_pattern").length === 0 && p.injuries.trim().length > 3) {
      candidates.push({
        type: "pain_pattern",
        subject: "reported limitations",
        sentiment: "negative",
        confidence: 3,
        source: "onboarding",
        detail: `User reported the following limitation(s) during onboarding: "${p.injuries}". Factor this into exercise selection.`,
      });
    }
  }

  // Training schedule preference
  if (p.daysPerWeek) {
    const days = Number(p.daysPerWeek);
    if (!isNaN(days)) {
      const label = days <= 3 ? "low-frequency (3 days or fewer)" : days >= 5 ? "high-frequency (5+ days)" : "moderate-frequency (4 days)";
      candidates.push({
        type: "split_preference",
        subject: `${days}-day training week`,
        sentiment: "positive",
        confidence: 4,
        source: "onboarding",
        detail: `User prefers ${label} training — ${days} days per week. Structure programs accordingly.`,
      });
    }
  }

  // Experience level → volume response expectation
  if (p.experienceLevel) {
    const exp = p.experienceLevel.toLowerCase();
    if (exp.includes("beginner") || exp.includes("new")) {
      candidates.push({
        type: "volume_response",
        subject: "training volume tolerance",
        sentiment: "neutral",
        confidence: 3,
        source: "onboarding",
        detail: "User is a beginner — lower volume, higher rest, basic movement patterns are appropriate. Progress conservatively.",
      });
    } else if (exp.includes("advanced") || exp.includes("competitive")) {
      candidates.push({
        type: "volume_response",
        subject: "training volume tolerance",
        sentiment: "positive",
        confidence: 3,
        source: "onboarding",
        detail: "User has advanced training experience — higher volume, more complex programming, and faster progression are appropriate.",
      });
    }
  }

  return candidates;
}

/**
 * Extract memories from recent readiness entries.
 * Requires ≥3 entries to establish a pattern.
 */
async function extractReadinessMemories(userId: number): Promise<MemoryCandidate[]> {
  const entries = await db
    .select()
    .from(readinessEntriesTable)
    .where(eq(readinessEntriesTable.userId, userId))
    .orderBy(desc(readinessEntriesTable.createdAt))
    .limit(14);

  if (entries.length < 3) return [];

  const candidates: MemoryCandidate[] = [];

  const painAvg = avg(entries.map((e) => e.painScore));
  const sleepAvg = avg(entries.map((e) => e.sleepScore));
  const energyAvg = avg(entries.map((e) => e.energyScore));
  const sorenessAvg = avg(entries.map((e) => e.sorenessScore));

  // Chronic pain pattern
  if (painAvg >= 3.2 && entries.length >= 5) {
    candidates.push({
      type: "pain_pattern",
      subject: "recurring pain in check-ins",
      sentiment: "negative",
      confidence: Math.min(5, Math.floor(entries.length / 3) + 2) as 1 | 2 | 3 | 4 | 5,
      source: "readiness",
      detail: `User has consistently reported elevated pain scores (avg ${painAvg.toFixed(1)}/5) across ${entries.length} check-ins. Program design should be conservative with high-stress movements.`,
    });
  }

  // Poor sleep pattern
  if (sleepAvg < 2.5 && entries.length >= 5) {
    candidates.push({
      type: "recovery_pattern",
      subject: "sleep quality",
      sentiment: "negative",
      confidence: 3,
      source: "readiness",
      detail: `User consistently reports poor sleep quality (avg ${sleepAvg.toFixed(1)}/5). Recovery may be chronically compromised — avoid high-intensity accumulation phases until sleep improves.`,
    });
  } else if (sleepAvg >= 4.2 && entries.length >= 5) {
    candidates.push({
      type: "recovery_pattern",
      subject: "sleep quality",
      sentiment: "positive",
      confidence: 3,
      source: "readiness",
      detail: `User consistently reports excellent sleep quality (avg ${sleepAvg.toFixed(1)}/5). Recovery is strong — higher training loads are well-supported.`,
    });
  }

  // Chronic low energy
  if (energyAvg < 2.5 && entries.length >= 5) {
    candidates.push({
      type: "recovery_pattern",
      subject: "energy levels",
      sentiment: "negative",
      confidence: 3,
      source: "readiness",
      detail: `User chronically reports low energy (avg ${energyAvg.toFixed(1)}/5). High-CNS-demand training should be used cautiously. Prioritize shorter, more focused sessions.`,
    });
  }

  // High chronic soreness
  if (sorenessAvg >= 3.8 && entries.length >= 5) {
    candidates.push({
      type: "volume_response",
      subject: "soreness accumulation",
      sentiment: "negative",
      confidence: 3,
      source: "readiness",
      detail: `User frequently reports significant soreness (avg ${sorenessAvg.toFixed(1)}/5). Volume may be exceeding recovery capacity — consider reducing training density or increasing recovery days.`,
    });
  }

  return candidates;
}

/**
 * Extract memories from session feedback.
 * Requires ≥3 feedback entries to establish a pattern.
 */
async function extractFeedbackMemories(userId: number): Promise<MemoryCandidate[]> {
  const entries = await db
    .select()
    .from(sessionFeedbackTable)
    .where(eq(sessionFeedbackTable.userId, userId))
    .orderBy(desc(sessionFeedbackTable.createdAt))
    .limit(10);

  if (entries.length < 3) return [];

  const candidates: MemoryCandidate[] = [];

  const difficultyAvg = avg(entries.map((e) => e.difficultyScore));
  const painAvg = avg(entries.map((e) => e.painResponseScore));
  const energyAvg = avg(entries.map((e) => e.energyResponseScore));

  // Volume response patterns
  if (difficultyAvg >= 4.2) {
    candidates.push({
      type: "volume_response",
      subject: "session difficulty tolerance",
      sentiment: "negative",
      confidence: Math.min(5, Math.floor(entries.length / 3) + 1) as 1 | 2 | 3 | 4 | 5,
      source: "feedback",
      detail: `User consistently finds sessions very difficult (avg difficulty ${difficultyAvg.toFixed(1)}/5 across ${entries.length} sessions). Reduce overall intensity or volume — programs may be exceeding current capacity.`,
    });
  } else if (difficultyAvg <= 2.2 && entries.length >= 4) {
    candidates.push({
      type: "volume_response",
      subject: "session difficulty tolerance",
      sentiment: "positive",
      confidence: Math.min(5, Math.floor(entries.length / 3) + 1) as 1 | 2 | 3 | 4 | 5,
      source: "feedback",
      detail: `User consistently handles sessions well — finds them manageable (avg difficulty ${difficultyAvg.toFixed(1)}/5). Training can be progressively intensified.`,
    });
  }

  // Session pain response
  if (painAvg >= 3.5) {
    candidates.push({
      type: "pain_pattern",
      subject: "recurring session pain",
      sentiment: "negative",
      confidence: Math.min(5, Math.floor(entries.length / 2) + 1) as 1 | 2 | 3 | 4 | 5,
      source: "feedback",
      detail: `User repeatedly reports pain during/after sessions (avg ${painAvg.toFixed(1)}/5). This is a significant pattern — exercise selection, load, or joint stress may need immediate review.`,
    });
  }

  // Post-session energy — indicator of volume appropriateness
  if (energyAvg >= 4.2 && entries.length >= 4) {
    candidates.push({
      type: "recovery_pattern",
      subject: "post-session energy response",
      sentiment: "positive",
      confidence: 3,
      source: "feedback",
      detail: `User consistently feels energized after sessions (avg ${energyAvg.toFixed(1)}/5). Training load is well-calibrated — user is responding positively to the work.`,
    });
  } else if (energyAvg <= 1.8 && entries.length >= 4) {
    candidates.push({
      type: "volume_response",
      subject: "post-session energy depletion",
      sentiment: "negative",
      confidence: 3,
      source: "feedback",
      detail: `User consistently feels drained after sessions (avg energy ${energyAvg.toFixed(1)}/5). Programs may be too demanding — reduce session density and prioritize quality over quantity.`,
    });
  }

  // Adherence pattern — compute from feedback frequency
  if (entries.length >= 4) {
    const earliest = entries[entries.length - 1];
    const latest = entries[0];
    const daySpan = Math.max(1, (latest.createdAt.getTime() - earliest.createdAt.getTime()) / 86400000);
    const sessionsPerWeek = (entries.length / daySpan) * 7;

    if (sessionsPerWeek >= 3.5) {
      candidates.push({
        type: "adherence_pattern",
        subject: "training consistency",
        sentiment: "positive",
        confidence: 3,
        source: "feedback",
        detail: `User shows strong training consistency — logging approximately ${sessionsPerWeek.toFixed(1)} sessions per week. Progression can be planned confidently.`,
      });
    } else if (sessionsPerWeek < 2 && daySpan >= 14) {
      candidates.push({
        type: "adherence_pattern",
        subject: "training consistency",
        sentiment: "negative",
        confidence: 2,
        source: "feedback",
        detail: `User's training frequency is lower than planned (approx ${sessionsPerWeek.toFixed(1)} sessions/week based on recent logs). Consider simplifying the program structure to improve adherence.`,
      });
    }
  }

  return candidates;
}

// ─── Memory sync ──────────────────────────────────────────────────────────────

/**
 * Main sync function — extracts memories from all data sources and upserts them.
 * Call this after new readiness entries or session feedback are logged,
 * and on each AI message (non-blocking, awaited in parallel with AI call).
 */
export async function syncMemoriesFromData(userId: number): Promise<number> {
  const [profileCandidates, readinessCandidates, feedbackCandidates] = await Promise.all([
    extractProfileMemories(userId),
    extractReadinessMemories(userId),
    extractFeedbackMemories(userId),
  ]);

  const all = [...profileCandidates, ...readinessCandidates, ...feedbackCandidates];
  await Promise.all(all.map((c) => upsertMemory(userId, c)));
  return all.length;
}

// ─── Context builder ──────────────────────────────────────────────────────────

/**
 * Builds the memory context block for injection into the AI system prompt.
 * Only includes memories with confidence ≥ 2.
 */
export function buildMemoryContext(memories: MemoryEntry[]): string {
  const relevant = memories.filter((m) => m.confidence >= 2);
  if (relevant.length === 0) return "";

  const byType: Partial<Record<MemoryType, MemoryEntry[]>> = {};
  for (const m of relevant) {
    if (!byType[m.type]) byType[m.type] = [];
    byType[m.type]!.push(m);
  }

  const lines: string[] = [];
  lines.push("## LONG-TERM MEMORY");
  lines.push("(Persistent coaching knowledge about this user — treat as established facts, not guesses)");
  lines.push("");

  const typeLabels: Record<MemoryType, string> = {
    exercise_preference: "Exercise & Equipment Preferences",
    pain_pattern: "Pain & Limitation Patterns",
    session_preference: "Session Preferences",
    volume_response: "Volume & Intensity Response",
    split_preference: "Schedule & Split Preferences",
    recovery_pattern: "Recovery Patterns",
    adherence_pattern: "Consistency & Adherence",
  };

  const order: MemoryType[] = [
    "pain_pattern",
    "exercise_preference",
    "volume_response",
    "recovery_pattern",
    "session_preference",
    "split_preference",
    "adherence_pattern",
  ];

  for (const type of order) {
    const entries = byType[type];
    if (!entries || entries.length === 0) continue;

    lines.push(`### ${typeLabels[type]}`);
    for (const m of entries) {
      const confidenceStar = m.confidence >= 4 ? " ★" : "";
      lines.push(`- ${m.detail}${confidenceStar}`);
    }
    lines.push("");
  }

  lines.push("Reference this memory naturally when relevant. Do not recite it robotically. Use it like a coach who knows their client.");

  return lines.join("\n");
}
