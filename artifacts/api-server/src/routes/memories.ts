import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { listMemories, syncMemoriesFromData } from "../lib/memory";

const router: IRouter = Router();

router.get("/memories", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const memories = await listMemories(userId);
  res.json(memories.map((m) => ({
    id: m.id,
    userId: m.userId,
    type: m.type,
    subject: m.subject,
    sentiment: m.sentiment,
    confidence: m.confidence,
    source: m.source,
    detail: m.detail,
    updatedAt: m.updatedAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/memories/sync", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const synced = await syncMemoriesFromData(userId);
  res.json({ synced });
});

/**
 * GET /api/memories/insights
 *
 * Returns a curated set of high-confidence memory patterns formatted for
 * display to the user as coach-language insights.
 * Only includes patterns with confidence >= 3 and a recent update.
 */
router.get("/memories/insights", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const memories = await listMemories(userId);

  // Only surface high-confidence patterns that are recent and substantive
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days
  const surface = memories
    .filter((m) => m.confidence >= 3 && m.updatedAt >= cutoff)
    .sort((a, b) => b.confidence - a.confidence || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8);

  // Build coach-language summaries
  const insights = surface.map((m) => {
    const confidenceLabel = m.confidence >= 5 ? "strong" : m.confidence >= 4 ? "clear" : "emerging";

    return {
      id: m.id,
      type: m.type,
      subject: m.subject,
      sentiment: m.sentiment,
      confidence: m.confidence,
      confidenceLabel,
      detail: m.detail,
      coachMessage: buildCoachMessage(m.type, m.subject, m.sentiment, m.detail),
      updatedAt: m.updatedAt.toISOString(),
    };
  });

  res.json({ insights, total: memories.length });
});

function buildCoachMessage(type: string, subject: string, sentiment: string, detail: string): string {
  // Convert the detail (which is AI-context-facing) into user-facing coach language.
  // Extract the key observation from the detail.
  if (type === "session_preference" && subject.includes("shorter")) {
    return "You tend to perform better with shorter, focused sessions. This block stays within that window.";
  }
  if (type === "session_preference" && subject.includes("longer")) {
    return "You handle longer sessions well. Fuller training structures are appropriate for you.";
  }
  if (type === "adherence_pattern" && subject.includes("compliance") && sentiment === "positive") {
    return "You show up consistently — progression can be planned with confidence.";
  }
  if (type === "adherence_pattern" && subject.includes("compliance") && sentiment === "negative") {
    return "Consistency has been up and down. Simpler programs that are easier to execute are the priority right now.";
  }
  if (type === "adherence_pattern" && subject.includes("session length fatigue")) {
    return "Longer sessions push your difficulty higher than shorter ones. Lower-priority work is trimmed to protect what matters.";
  }
  if (type === "adherence_pattern" && subject.includes("compliance")) {
    const dayMatch = subject.match(/^(\w+day)/i);
    if (dayMatch) {
      return `${dayMatch[1]} sessions have a high skip rate. They're being kept shorter and simpler.`;
    }
  }
  if (type === "volume_response" && subject.includes("lower body")) {
    return "Your lower-body fatigue rises when volume is high. Lower-body days are kept tighter to protect output quality.";
  }
  if (type === "volume_response" && subject.includes("difficulty") && sentiment === "negative") {
    return "Sessions have been consistently demanding. Volume and intensity are being managed more conservatively.";
  }
  if (type === "volume_response" && sentiment === "positive") {
    return "You handle training load well. Progression can move at a confident pace.";
  }
  if (type === "exercise_preference" && subject.includes("stall")) {
    const exMatch = subject.match(/^(.+?) progression/);
    return exMatch
      ? `${exMatch[1]} has been stalling. Alternatives will be considered before pushing load further.`
      : "A recurring exercise pattern has stalled. Alternatives are being prioritized.";
  }
  if (type === "exercise_preference" && subject.includes("positive response")) {
    const exMatch = subject.match(/^(.+?) positive/);
    return exMatch
      ? `You progress well on ${exMatch[1]}. This movement will stay in future programs.`
      : "An exercise you respond well to is being kept in the program.";
  }
  if (type === "pain_pattern") {
    return "A recurring pain pattern has been noted. Exercise selection and loading are being managed conservatively.";
  }
  if (type === "recovery_pattern" && sentiment === "positive") {
    return "Your recovery is consistently strong. Higher training loads are well-supported.";
  }
  if (type === "recovery_pattern" && sentiment === "negative") {
    return "Recovery has been lagging. Session density is managed to give you enough room to adapt.";
  }
  if (type === "split_preference") {
    return detail.split(".")[0] + "."; // First sentence of the detail is usually clean
  }
  // Fallback — strip the technical AI-context language and use first sentence
  return detail.split(".")[0] + ".";
}

export default router;
