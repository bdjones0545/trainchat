/**
 * Coaching Knowledge Seeder
 *
 * Populates the coaching_knowledge table with foundational philosophy,
 * sport-specific rules, programming principles, and anti-patterns.
 *
 * Safe to call multiple times — checks count before inserting.
 * Called on startup if the table is empty.
 */

import { db, coachingKnowledgeTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { logger } from "./logger";

const COACHING_KNOWLEDGE_SEED = [
  {
    type: "philosophy" as const,
    content:
      "Training is a neurological process first and a muscular process second. Movement quality, coordination, and motor control determine how effectively force can be expressed.",
    isActive: true,
  },
  {
    type: "philosophy" as const,
    content:
      "Exercises are not the goal — adaptations are. Exercise selection must always serve a specific adaptation tied to the athlete's sport and needs.",
    isActive: true,
  },
  {
    type: "philosophy" as const,
    content:
      "More load is not inherently better. The goal is to recruit more motor units through better mechanics and intent, not just increased resistance.",
    isActive: true,
  },
  {
    type: "philosophy" as const,
    content:
      "Every program must balance performance and longevity. High output without tissue tolerance leads to breakdown.",
    isActive: true,
  },
  {
    type: "sport_template" as const,
    sport: "football",
    content:
      "Primary focus is force production, rate of force development, and collision robustness. Emphasize compound lifts, acceleration, and explosive work.",
    isActive: true,
  },
  {
    type: "rule" as const,
    sport: "football",
    content:
      "Power work must be performed early in the session when neural freshness is highest.",
    isActive: true,
  },
  {
    type: "sport_template" as const,
    sport: "golf",
    content:
      "Primary focus is rotational sequencing, stability, and efficient force transfer. Prioritize coordination and controlled power over maximal load.",
    isActive: true,
  },
  {
    type: "rule" as const,
    sport: "golf",
    content:
      "Use rotational power drills such as med ball work instead of heavy bilateral loading as the primary stimulus.",
    isActive: true,
  },
  {
    type: "sport_template" as const,
    sport: "swimming",
    content:
      "Primary focus is tissue tolerance, posture, and repetitive force production. Emphasize shoulder health and efficiency.",
    isActive: true,
  },
  {
    type: "rule" as const,
    sport: "swimming",
    content:
      "Shoulder integrity and movement quality take priority over maximal strength development.",
    isActive: true,
  },
  {
    type: "sport_template" as const,
    sport: "mma",
    content:
      "Primary focus is repeat-effort power, conditioning, and fatigue resistance. Training should reflect round-based demands.",
    isActive: true,
  },
  {
    type: "rule" as const,
    sport: "mma",
    content:
      "Conditioning must match fight work-rest ratios. Avoid generic steady-state conditioning.",
    isActive: true,
  },
  {
    type: "rule" as const,
    content:
      "Session structure should follow neural demand: high-skill movements first, then strength, then accessory work.",
    isActive: true,
  },
  {
    type: "rule" as const,
    content:
      "Different exercises require different rep strategies. Do not apply the same rep ranges across all movements.",
    isActive: true,
  },
  {
    type: "rule" as const,
    content:
      "Unilateral work should improve coordination and stability, not just increase volume.",
    isActive: true,
  },
  {
    type: "rule" as const,
    content:
      "Do not default to squat and deadlift as primary lifts for every athlete. Exercise selection must match sport demands.",
    tags: ["anti-pattern"],
    isActive: true,
  },
  {
    type: "rule" as const,
    content: "Do not increase load at the expense of movement quality.",
    tags: ["anti-pattern"],
    isActive: true,
  },
  {
    type: "rule" as const,
    content:
      "Explosive exercises must be performed with intent. Do not include them passively.",
    tags: ["anti-pattern"],
    isActive: true,
  },
  {
    type: "rule" as const,
    content:
      "Progression should not always be load-based. Improvements in control, coordination, and efficiency are valid progressions.",
    isActive: true,
  },
  {
    type: "rule" as const,
    content:
      "Volume should only increase when recovery capacity supports it.",
    isActive: true,
  },
];

export async function isCoachingKnowledgeEmpty(): Promise<boolean> {
  const [result] = await db
    .select({ count: count() })
    .from(coachingKnowledgeTable);
  return Number(result?.count ?? 0) === 0;
}

export async function seedCoachingKnowledge(): Promise<{ inserted: number }> {
  logger.info("[CoachingKnowledgeSeeder] Starting seed...");

  let inserted = 0;

  for (const entry of COACHING_KNOWLEDGE_SEED) {
    await db.insert(coachingKnowledgeTable).values({
      type: entry.type,
      content: entry.content,
      sport: (entry as any).sport ?? null,
      tags: (entry as any).tags ?? [],
      isActive: entry.isActive,
      sourceType: "seed",
    });
    inserted++;
  }

  logger.info(
    `[CoachingKnowledgeSeeder] Done. ${inserted} entries inserted.`,
  );
  return { inserted };
}

export async function seedCoachingKnowledgeIfEmpty(): Promise<void> {
  try {
    const empty = await isCoachingKnowledgeEmpty();
    if (empty) {
      logger.info(
        "[CoachingKnowledgeSeeder] Coaching knowledge is empty — seeding now...",
      );
      const { inserted } = await seedCoachingKnowledge();
      logger.info(
        `[CoachingKnowledgeSeeder] Auto-seed complete: ${inserted} entries inserted.`,
      );
    } else {
      logger.info(
        "[CoachingKnowledgeSeeder] Coaching knowledge already populated — skipping auto-seed.",
      );
    }
  } catch (err) {
    logger.error(
      { err },
      "[CoachingKnowledgeSeeder] Auto-seed failed — AI coaching context will be empty.",
    );
  }
}
