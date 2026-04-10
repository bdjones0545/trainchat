// ─── Knowledge Retrieval Service ──────────────────────────────────────────────
//
// Queries the coaching_knowledge table and returns relevant entries formatted
// for injection into the AI system prompt. Retrieval is context-aware:
// it matches on goal, sport, body region, and general philosophy rules.

import { db, coachingKnowledgeTable } from "@workspace/db";
import { eq, and, or, isNull, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";

export interface KnowledgeRetrievalOptions {
  goal?: string | null;
  sport?: string | null;
  bodyRegion?: string | null;
  maxEntries?: number;
}

// ─── Normalize helpers ────────────────────────────────────────────────────────

function normalizeGoalTag(rawGoal: string): string[] {
  const g = rawGoal.toLowerCase();
  if (/strength|strong|power/.test(g)) return ["strength"];
  if (/hypertrophy|muscle|size|bulk/.test(g)) return ["hypertrophy"];
  if (/athletic|performance|sport/.test(g)) return ["athletic_performance"];
  if (/fat.?loss|weight.?loss|cut|lean/.test(g)) return ["fat_loss"];
  if (/endurance|cardio|conditioning/.test(g)) return ["endurance"];
  return ["general_fitness"];
}

function normalizeSportTag(rawSport: string | null | undefined): string | null {
  if (!rawSport) return null;
  const s = rawSport.toLowerCase();
  if (/soccer|football|futbol/.test(s)) return "soccer";
  if (/basketball|hoops|nba/.test(s)) return "basketball";
  if (/baseball|softball/.test(s)) return "baseball";
  if (/tennis|racket|racquet/.test(s)) return "tennis";
  if (/swim|swimming/.test(s)) return "swimming";
  if (/track|sprint|running/.test(s)) return "track";
  if (/hockey/.test(s)) return "hockey";
  if (/golf/.test(s)) return "golf";
  if (/martial|mma|wrestling|judo|bjj/.test(s)) return "combat_sports";
  return s.trim().toLowerCase();
}

// ─── Main retrieval function ─────────────────────────────────────────────────

export async function retrieveRelevantKnowledge(
  options: KnowledgeRetrievalOptions,
): Promise<string> {
  const { goal, sport, bodyRegion, maxEntries = 12 } = options;

  try {
    const goalTags = goal ? normalizeGoalTag(goal) : [];
    const sportTag = normalizeSportTag(sport);

    const all = await db
      .select()
      .from(coachingKnowledgeTable)
      .where(eq(coachingKnowledgeTable.isActive, true));

    if (all.length === 0) return "";

    // Score each entry by relevance
    const scored = all.map((entry) => {
      let score = 0;

      // Philosophy and rules always get a base score — they apply universally
      if (entry.type === "philosophy" || entry.type === "rule") score += 1;

      // Goal match
      if (entry.goal && goalTags.includes(entry.goal)) score += 3;
      if (!entry.goal && entry.type !== "exercise") score += 0.5; // general entries

      // Sport match
      if (sportTag && entry.sport === sportTag) score += 4;
      if (!entry.sport && entry.type !== "exercise") score += 0.5; // non-sport-specific

      // Body region match
      if (bodyRegion && entry.bodyRegion === bodyRegion) score += 2;

      // Tag overlap
      const entryTags: string[] = Array.isArray(entry.tags) ? entry.tags : [];
      const contextTags = [
        ...(goalTags),
        ...(sportTag ? [sportTag] : []),
        ...(bodyRegion ? [bodyRegion] : []),
      ];
      const overlap = entryTags.filter((t) => contextTags.includes(t)).length;
      score += overlap * 0.5;

      return { entry, score };
    });

    const top = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxEntries)
      .map((s) => s.entry);

    if (top.length === 0) return "";

    const grouped: Record<string, string[]> = {};
    for (const entry of top) {
      const label =
        entry.type === "philosophy" ? "Coaching Philosophy"
        : entry.type === "rule" ? "System Rules"
        : entry.type === "sport_template" ? "Sport-Specific Guidance"
        : "Exercise Intelligence";
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(`- ${entry.content}`);
    }

    const lines: string[] = ["\n## COACHING KNOWLEDGE BASE (Admin-Curated)"];
    lines.push("The following entries are curated coaching rules and philosophy. Apply them when relevant:");
    for (const [label, entries] of Object.entries(grouped)) {
      lines.push(`\n### ${label}`);
      lines.push(...entries);
    }

    return lines.join("\n");
  } catch (err) {
    logger.warn({ err }, "[KnowledgeRetrieval] Failed to retrieve knowledge — skipping");
    return "";
  }
}
