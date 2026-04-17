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

import { db, userMemoriesTable, userProfilesTable, readinessEntriesTable, sessionFeedbackTable, sessionLogsTable, exerciseLogsTable, systemChangeLog } from "@workspace/db";
import { eq, desc, and, gte, lt, asc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemoryType =
  | "exercise_preference"      // prefers or avoids specific exercises/equipment
  | "pain_pattern"             // recurring discomfort with movement patterns
  | "session_preference"       // session length, format, structure preferences
  | "volume_response"          // how user responds to volume and intensity
  | "split_preference"         // preferred training structure / days
  | "recovery_pattern"         // sleep and recovery tendencies
  | "adherence_pattern"        // consistency tendencies
  | "sport_context"            // athlete's sport/activity background
  | "time_constraint"          // session duration limits
  | "communication_preference" // how user prefers to receive coaching
  | "training_preference";     // stated programming emphasis preference

export type MemorySentiment = "positive" | "negative" | "neutral";
export type MemorySource = "onboarding" | "feedback" | "readiness" | "inferred" | "conversation";

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
  if (p.equipmentAccess) {
    const eq_lower = p.equipmentAccess.toLowerCase();
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

// ─── Conversation-level extraction ───────────────────────────────────────────

/**
 * Extract durable coaching memories from the user's message text.
 *
 * Reads the raw message for sport context, time constraints, communication
 * preferences, and training emphasis — things that a real coach would note
 * and never ask about again.
 *
 * Uses pattern matching only (no AI call). Fast, deterministic, silent on failure.
 * Confidence starts at 2 (single signal) and grows with repeated mentions.
 */
export async function extractMemoriesFromMessage(
  userId: number,
  userMessage: string
): Promise<number> {
  if (!userMessage || userMessage.trim().length < 4) return 0;
  const msg = userMessage.toLowerCase();
  const candidates: MemoryCandidate[] = [];

  // ── Sport context ────────────────────────────────────────────────────────
  const sports: { pattern: RegExp; name: string }[] = [
    // American football — must come before generic "football" check
    { pattern: /\b(american football|nfl|gridiron|quarterback|wide receiver|running back|linebacker|tight end)\b/, name: "football" },
    // Soccer — "football" intentionally excluded to avoid misclassifying American football players
    { pattern: /\b(soccer|futbol)\b/, name: "soccer" },
    // Generic "football" defaults to American football in US context
    { pattern: /\bfootball\b/, name: "football" },
    { pattern: /\bbasketball\b/, name: "basketball" },
    { pattern: /\bbaseball\b/, name: "baseball" },
    { pattern: /\btennis\b/, name: "tennis" },
    { pattern: /\brugby\b/, name: "rugby" },
    { pattern: /\bvolleyball\b/, name: "volleyball" },
    { pattern: /\bswimming\b/, name: "swimming" },
    { pattern: /\bcycling\b/, name: "cycling" },
    { pattern: /\b(running|track)\b/, name: "running/track" },
    { pattern: /\bgolf\b/, name: "golf" },
    { pattern: /\bwrestling\b/, name: "wrestling" },
    { pattern: /\b(mma|mixed martial arts)\b/, name: "MMA" },
    { pattern: /\bboxing\b/, name: "boxing" },
    { pattern: /\bclimbing\b/, name: "climbing" },
    { pattern: /\browings?\b/, name: "rowing" },
    { pattern: /\bcrossfit\b/, name: "CrossFit" },
    { pattern: /\bpowerlifting\b/, name: "powerlifting" },
    { pattern: /\bweightlifting\b/, name: "weightlifting" },
    { pattern: /\btriathlon\b/, name: "triathlon" },
    { pattern: /\blacrosse\b/, name: "lacrosse" },
    { pattern: /\bhockey\b/, name: "hockey" },
  ];

  for (const sport of sports) {
    if (sport.pattern.test(msg)) {
      candidates.push({
        type: "sport_context",
        subject: sport.name,
        sentiment: "neutral",
        confidence: 3,
        source: "conversation",
        detail: `User is a ${sport.name} athlete. Programs and coaching should reflect ${sport.name}-relevant demands and training context.`,
      });
      break; // Only capture one sport per message to avoid conflicts
    }
  }

  // ── Time constraints ─────────────────────────────────────────────────────
  const timeMatch = msg.match(
    /(?:only\s+have|have\s+(?:about|around|under)?|keep\s+(?:it\s+)?(?:to|under|around)|max(?:imum)?\s+(?:of\s+)?|around|about|under|within)\s+(\d{1,3})\s*(?:to\s+\d{1,3}\s*)?(?:min(?:ute)?s?|hour?s?)\b/
  );
  if (timeMatch) {
    const mins = parseInt(timeMatch[1]);
    if (mins >= 15 && mins <= 120) {
      candidates.push({
        type: "time_constraint",
        subject: "session duration",
        sentiment: "neutral",
        confidence: 3,
        source: "conversation",
        detail: `User prefers sessions around ${mins} minutes. Structure programming to fit within this window — prioritize primary and secondary work, compress or remove lower-priority accessories as needed.`,
      });
    }
  }

  // ── Communication preferences ─────────────────────────────────────────────
  if (
    /keep\s+(?:it\s+)?(?:short|brief|concise|simple)|(?:don'?t\s+)?(?:over)?explain|less\s+(?:explanation|detail|text)|more\s+(?:direct|concise)|just\s+(?:give\s+me|tell\s+me)\s+(?:the\s+)?(?:program|workout|exercises?)/.test(msg)
  ) {
    candidates.push({
      type: "communication_preference",
      subject: "concise coaching",
      sentiment: "positive",
      confidence: 3,
      source: "conversation",
      detail: "User prefers concise, direct coaching. Keep confirmations brief. Act quickly. Avoid lengthy explanations unless specifically asked.",
    });
  } else if (
    /(?:explain|why|reason|help\s+me\s+understand|teach\s+me|more\s+detail|walk\s+me\s+through|want\s+to\s+(?:understand|know\s+why))/.test(msg)
  ) {
    candidates.push({
      type: "communication_preference",
      subject: "detailed explanations",
      sentiment: "positive",
      confidence: 2,
      source: "conversation",
      detail: "User appreciates coaching context and explanations — briefly justify programming decisions when appropriate.",
    });
  }

  // ── Training emphasis preferences ─────────────────────────────────────────
  if (
    /\b(?:strength[\s-]focused|prefer\s+strength|more\s+strength|strength[\s-]first|heavy\s+lifting|low[\s-]rep|powerlifting\s+style|strength\s+training)\b/.test(msg)
  ) {
    candidates.push({
      type: "training_preference",
      subject: "strength-focused programming",
      sentiment: "positive",
      confidence: 3,
      source: "conversation",
      detail: "User prefers strength-focused programming. Prioritize compound movements, progressive load, lower rep ranges (1-6), and neural efficiency.",
    });
  } else if (
    /\b(?:hypertrophy|muscle[\s-]building|build\s+(?:muscle|size|mass)|aesthetics|bodybuilding|pump\s+work|more\s+volume)\b/.test(msg)
  ) {
    candidates.push({
      type: "training_preference",
      subject: "hypertrophy-focused programming",
      sentiment: "positive",
      confidence: 3,
      source: "conversation",
      detail: "User prefers hypertrophy-focused programming. Prioritize moderate rep ranges (6-15), mechanical tension, volume accumulation, and isolation work.",
    });
  } else if (
    /\b(?:athletic|explosiv|power\s+training|sport[\s-]specific|speed\s+work|agility|conditioning|performance[\s-]based)\b/.test(msg)
  ) {
    candidates.push({
      type: "training_preference",
      subject: "athletic performance programming",
      sentiment: "positive",
      confidence: 3,
      source: "conversation",
      detail: "User prefers athletic/performance-oriented programming. Include power, speed, and sport-transfer work alongside strength foundations.",
    });
  }

  if (candidates.length === 0) return 0;
  await Promise.all(candidates.map((c) => upsertMemory(userId, c)));
  return candidates.length;
}

// ─── Session-log memory extraction ───────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Keywords to detect lower-body exercise names */
const LOWER_BODY_KEYWORDS = [
  "squat", "deadlift", "rdl", "leg press", "lunge", "split squat", "step up",
  "hip thrust", "glute bridge", "hamstring curl", "calf raise", "leg extension",
  "broad jump", "box jump", "broad jump", "bound", "hop",
];

function isLowerBodyExercise(name: string): boolean {
  const n = name.toLowerCase();
  return LOWER_BODY_KEYWORDS.some((kw) => n.includes(kw));
}

/**
 * Extract long-term coaching patterns from session logs and exercise logs.
 * Surfaces patterns that the profile/readiness/feedback extractors don't catch:
 *   - Session length tolerance (from actual logged durations)
 *   - Day-of-week compliance (which days are skipped most)
 *   - Lower-body volume sensitivity (hard sessions with many lower-body exercises)
 *   - Exercise-specific pain associations (from exercise log completion + session pain)
 *   - Progression stall patterns (from systemChangeLog regression frequency)
 */
async function extractSessionLogMemories(userId: number): Promise<MemoryCandidate[]> {
  const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000); // 8 weeks

  const [recentSessions, recentExerciseLogs, recentChangeLogs] = await Promise.all([
    db.select().from(sessionLogsTable)
      .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, since)))
      .orderBy(desc(sessionLogsTable.completedAt))
      .limit(30),
    db.select().from(exerciseLogsTable)
      .where(and(eq(exerciseLogsTable.userId, userId), gte(exerciseLogsTable.createdAt, since)))
      .orderBy(desc(exerciseLogsTable.createdAt))
      .limit(150),
    db.select({ intent: systemChangeLog.intent, decisionMetadata: systemChangeLog.decisionMetadata, createdAt: systemChangeLog.createdAt })
      .from(systemChangeLog)
      .where(and(eq(systemChangeLog.userId, userId), gte(systemChangeLog.createdAt, since)))
      .orderBy(desc(systemChangeLog.createdAt))
      .limit(50),
  ]);

  if (recentSessions.length < 3) return [];

  const candidates: MemoryCandidate[] = [];
  const attended = recentSessions.filter((s) => s.sessionStatus === "completed" || s.sessionStatus === "partial");

  // ── Session length preference ─────────────────────────────────────────────
  const sessionsWithDuration = attended.filter((s) => s.actualDuration != null);
  if (sessionsWithDuration.length >= 4) {
    const durations = sessionsWithDuration.map((s) => s.actualDuration!);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Cross with difficulty: do shorter sessions correlate with better outcomes?
    const shortSessions = sessionsWithDuration.filter((s) => s.actualDuration! <= 50);
    const longSessions = sessionsWithDuration.filter((s) => s.actualDuration! >= 65);
    const shortAvgDiff = shortSessions.length >= 2
      ? shortSessions.filter((s) => s.difficultyScore != null).reduce((a, s) => a + s.difficultyScore!, 0) / shortSessions.filter((s) => s.difficultyScore != null).length
      : null;
    const longAvgDiff = longSessions.length >= 2
      ? longSessions.filter((s) => s.difficultyScore != null).reduce((a, s) => a + s.difficultyScore!, 0) / longSessions.filter((s) => s.difficultyScore != null).length
      : null;

    if (avgDuration <= 52) {
      // User's actual sessions run short — they may prefer brevity
      const conf: 1|2|3|4|5 = sessionsWithDuration.length >= 8 ? 4 : 3;
      candidates.push({
        type: "session_preference",
        subject: "shorter session format",
        sentiment: "positive",
        confidence: conf,
        source: "inferred",
        detail: `User's sessions consistently run ${Math.round(avgDuration)} minutes on average. Programs should stay within 45–55 minutes to match their natural session length.`,
      });
    } else if (avgDuration >= 70) {
      const conf: 1|2|3|4|5 = sessionsWithDuration.length >= 8 ? 3 : 2;
      candidates.push({
        type: "session_preference",
        subject: "longer session tolerance",
        sentiment: "positive",
        confidence: conf,
        source: "inferred",
        detail: `User consistently completes sessions averaging ${Math.round(avgDuration)} minutes. They tolerate longer training without dropout — fuller session structures are appropriate.`,
      });
    }

    // If short sessions → lower difficulty AND long sessions → higher difficulty, store that
    if (shortAvgDiff !== null && longAvgDiff !== null && longAvgDiff - shortAvgDiff >= 1.0) {
      candidates.push({
        type: "adherence_pattern",
        subject: "session length fatigue correlation",
        sentiment: "negative",
        confidence: 3,
        source: "inferred",
        detail: `User rates longer sessions significantly harder than shorter ones (avg difficulty: ${longAvgDiff.toFixed(1)} vs ${shortAvgDiff.toFixed(1)}). Prefer concise sessions — cut lower-priority accessories before extending core work.`,
      });
    }
  }

  // ── Day-of-week compliance ────────────────────────────────────────────────
  if (recentSessions.length >= 6) {
    const daySkips: Record<number, number> = {};
    const dayAttends: Record<number, number> = {};
    for (const s of recentSessions) {
      const dow = new Date(s.completedAt).getDay();
      if (s.sessionStatus === "skipped") {
        daySkips[dow] = (daySkips[dow] ?? 0) + 1;
      } else {
        dayAttends[dow] = (dayAttends[dow] ?? 0) + 1;
      }
    }
    // Find a day with notably high skip rate (≥ 2 skips, >50% of appearances)
    for (let d = 0; d < 7; d++) {
      const skips = daySkips[d] ?? 0;
      const attends = dayAttends[d] ?? 0;
      const total = skips + attends;
      if (total < 2 || skips < 2) continue;
      const skipRate = skips / total;
      if (skipRate >= 0.5) {
        const conf: 1|2|3|4|5 = skipRate >= 0.7 ? 4 : 3;
        candidates.push({
          type: "adherence_pattern",
          subject: `${DAY_NAMES[d]} compliance`,
          sentiment: "negative",
          confidence: conf,
          source: "inferred",
          detail: `User skips ${DAY_NAMES[d]} sessions at a high rate (${Math.round(skipRate * 100)}% of the time). ${DAY_NAMES[d]} sessions should be shorter and optional, or moved to a different day.`,
        });
        break; // One flagged day at a time
      }
    }
  }

  // ── Lower-body volume sensitivity ─────────────────────────────────────────
  if (recentExerciseLogs.length >= 10) {
    // Group exercise logs by session date (approximate — use day bucket)
    const lowerBodySessionDates = new Set<string>();
    for (const log of recentExerciseLogs) {
      if (isLowerBodyExercise(log.exerciseName)) {
        const dateKey = new Date(log.createdAt).toDateString();
        lowerBodySessionDates.add(dateKey);
      }
    }

    // Find sessions on those dates with high difficulty
    const lbHardSessions = recentSessions.filter((s) => {
      const dateKey = new Date(s.completedAt).toDateString();
      return lowerBodySessionDates.has(dateKey) && (s.difficultyScore ?? 0) >= 4;
    });
    const lbSessions = recentSessions.filter((s) => {
      const dateKey = new Date(s.completedAt).toDateString();
      return lowerBodySessionDates.has(dateKey);
    });

    if (lbSessions.length >= 3 && lbHardSessions.length >= 2) {
      const hardRate = lbHardSessions.length / lbSessions.length;
      if (hardRate >= 0.5) {
        const conf: 1|2|3|4|5 = lbHardSessions.length >= 4 ? 4 : 3;
        candidates.push({
          type: "volume_response",
          subject: "lower body volume sensitivity",
          sentiment: "negative",
          confidence: conf,
          source: "inferred",
          detail: `User's lower-body sessions frequently rate very difficult (${Math.round(hardRate * 100)}% of lower-body sessions rated hard). Reduce lower-body volume and keep accessory work light on heavy leg days.`,
        });
      }
    }
  }

  // ── Exercise-specific stall / pain patterns ───────────────────────────────
  // Use systemChangeLog load_reduction events to find stalling exercises
  const regressionsByExercise: Record<string, number> = {};
  for (const log of recentChangeLogs) {
    if (log.intent === "load_reduction") {
      const meta = log.decisionMetadata as Record<string, unknown> | null;
      const name = meta?.exerciseName as string | undefined;
      if (name) {
        regressionsByExercise[name] = (regressionsByExercise[name] ?? 0) + 1;
      }
    }
  }
  // Exercises with 3+ regressions in 8 weeks = stall pattern
  for (const [exerciseName, count] of Object.entries(regressionsByExercise)) {
    if (count >= 3) {
      const conf: 1|2|3|4|5 = count >= 5 ? 4 : 3;
      candidates.push({
        type: "exercise_preference",
        subject: `${exerciseName} progression stall`,
        sentiment: "negative",
        confidence: conf,
        source: "inferred",
        detail: `User has repeatedly required load reductions on ${exerciseName} (${count} times in recent weeks). Consider using a regression or alternative movement. Do not aggressively progress this pattern.`,
      });
    }
  }

  // Also check for progression successes
  const progressionsByExercise: Record<string, number> = {};
  for (const log of recentChangeLogs) {
    if (log.intent === "auto_progression") {
      const meta = log.decisionMetadata as Record<string, unknown> | null;
      const name = meta?.exerciseName as string | undefined;
      if (name) {
        progressionsByExercise[name] = (progressionsByExercise[name] ?? 0) + 1;
      }
    }
  }
  for (const [exerciseName, count] of Object.entries(progressionsByExercise)) {
    if (count >= 3 && !regressionsByExercise[exerciseName]) {
      // Clean progressions with no regressions = good exercise fit
      candidates.push({
        type: "exercise_preference",
        subject: `${exerciseName} positive response`,
        sentiment: "positive",
        confidence: Math.min(5, 2 + Math.floor(count / 2)) as 1|2|3|4|5,
        source: "inferred",
        detail: `User progresses cleanly on ${exerciseName} (${count} consecutive progressions). Maintain this movement in future programs — it is well-matched to their profile.`,
      });
    }
  }

  // ── Compliance trend ──────────────────────────────────────────────────────
  const completedCount = attended.length;
  const totalCount = recentSessions.length;
  const complianceRate = totalCount > 0 ? completedCount / totalCount : 0;

  if (complianceRate >= 0.85 && totalCount >= 6) {
    candidates.push({
      type: "adherence_pattern",
      subject: "high training compliance",
      sentiment: "positive",
      confidence: Math.min(5, 2 + Math.floor(totalCount / 4)) as 1|2|3|4|5,
      source: "inferred",
      detail: `User demonstrates high training compliance (${Math.round(complianceRate * 100)}% completion rate over ${totalCount} sessions). Progression can be planned confidently — they show up reliably.`,
    });
  } else if (complianceRate <= 0.55 && totalCount >= 6) {
    candidates.push({
      type: "adherence_pattern",
      subject: "inconsistent compliance",
      sentiment: "negative",
      confidence: 3,
      source: "inferred",
      detail: `User's training compliance is inconsistent (${Math.round(complianceRate * 100)}% over ${totalCount} sessions). Build simpler, shorter programs that are more executable. Avoid complex periodization until consistency improves.`,
    });
  }

  return candidates;
}

// ─── Memory decay ─────────────────────────────────────────────────────────────

/**
 * Reduce confidence of stale memories that haven't been reinforced.
 * - Memories not updated in 30+ days lose 1 confidence point
 * - Only applies to inferred memories (not onboarding / conversation)
 * - Never reduces below 1
 * - Only applies if there's recent positive contradicting evidence
 */
export async function decayStaleMemories(userId: number): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  // Only decay inferred memories that haven't been updated recently
  const stale = await db
    .select()
    .from(userMemoriesTable)
    .where(
      and(
        eq(userMemoriesTable.userId, userId),
        eq(userMemoriesTable.source, "inferred"),
        lt(userMemoriesTable.updatedAt, thirtyDaysAgo),
      ),
    );

  for (const m of stale) {
    if (m.confidence <= 1) continue;
    const newConf = Math.max(1, m.confidence - 1) as 1|2|3|4|5;
    // If 60+ days old and confidence is now 1, consider deleting
    if (m.confidence <= 2 && m.updatedAt < sixtyDaysAgo) {
      await db.delete(userMemoriesTable).where(eq(userMemoriesTable.id, m.id));
    } else {
      await db.update(userMemoriesTable)
        .set({ confidence: newConf, updatedAt: new Date() })
        .where(eq(userMemoriesTable.id, m.id));
    }
  }
}

// ─── Memory sync ──────────────────────────────────────────────────────────────

/**
 * Main sync function — extracts memories from all data sources and upserts them.
 * Call this after new readiness entries or session feedback are logged,
 * and on each AI message (non-blocking, awaited in parallel with AI call).
 */
export async function syncMemoriesFromData(userId: number): Promise<number> {
  const [profileCandidates, readinessCandidates, feedbackCandidates, sessionCandidates] = await Promise.all([
    extractProfileMemories(userId),
    extractReadinessMemories(userId),
    extractFeedbackMemories(userId),
    extractSessionLogMemories(userId),
  ]);

  const all = [...profileCandidates, ...readinessCandidates, ...feedbackCandidates, ...sessionCandidates];
  await Promise.all(all.map((c) => upsertMemory(userId, c)));

  // Decay stale inferred memories (non-blocking best-effort)
  decayStaleMemories(userId).catch(() => {});

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
    sport_context: "Sport & Athletic Context",
    time_constraint: "Session Time Constraints",
    communication_preference: "Communication Style",
    training_preference: "Training Emphasis",
  };

  const order: MemoryType[] = [
    "sport_context",
    "pain_pattern",
    "exercise_preference",
    "training_preference",
    "volume_response",
    "recovery_pattern",
    "session_preference",
    "time_constraint",
    "split_preference",
    "adherence_pattern",
    "communication_preference",
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
