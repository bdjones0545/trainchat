import { Router, type IRouter } from "express";
import { db, shareMomentAuditTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";
import { OPENAI_MODELS } from "../lib/openai-models";

const router: IRouter = Router();

const AuditBody = z.object({
  momentType: z.string(),
  triggerSource: z.string(),
  dataSource: z.string().optional(),
  shareCardGenerated: z.boolean().default(false),
  shareActionUsed: z.string().optional(),
  captionGenerated: z.boolean().default(false),
});

router.post("/share-moments/audit", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId as number;
    const body = AuditBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { momentType, triggerSource, dataSource, shareCardGenerated, shareActionUsed, captionGenerated } = body.data;

    await db.insert(shareMomentAuditTable).values({
      userId,
      momentType,
      triggerSource,
      dataSource: dataSource ?? null,
      shareCardGenerated,
      shareActionUsed: shareActionUsed ?? null,
      captionGenerated,
    });

    logger.info({ userId, momentType, triggerSource, shareActionUsed }, "[ShareMomentAudit] logged");
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "[ShareMomentAudit] failed to log");
    res.status(500).json({ error: "Failed to log share moment" });
  }
});

const ExerciseSchema = z.object({
  name: z.string(),
  sets: z.number().optional().nullable(),
  reps: z.string().optional().nullable(),
});

const DaySchema = z.object({
  dayNumber: z.number(),
  name: z.string(),
  exercises: z.array(ExerciseSchema),
});

const ProgramCardBody = z.object({
  programName: z.string(),
  daysPerWeek: z.number(),
  blockLengthWeeks: z.number().optional().nullable(),
  blockPhases: z.array(z.string()).optional().nullable(),
  day1: DaySchema,
  focusMode: z.enum(["strength", "speed", "mobility"]).optional().nullable(),
});

const PROGRAM_CARD_SYSTEM_PROMPT = `You are generating a SHAREABLE PROGRAM CARD and CAPTION for TrainChat.

This is NOT a generic summary.
This is a SOCIAL-READY, HIGH-CONVERSION share output.

GOAL:
Make the user want to share their program because it looks legit, structured, and impressive.

OUTPUT FORMAT:

Return ONLY valid JSON, no markdown, no code fences:

{
  "title": "...",
  "subtitle": "...",
  "phases": ["W1 — ...", "W2 — ...", ...],
  "dayPreview": {
    "title": "...",
    "exercises": ["Exercise — sets x reps", ...]
  },
  "tagline": "...",
  "caption": "..."
}

RULES:

1. TITLE (HOOK)
Must feel personal + strong:
Examples:
- "My current training system"
- "Program I just built"
- "Day 1 locked in"
DO NOT mention "AI" here.

2. SUBTITLE (PROOF / CONTEXT)
Short, clean:
- "4-day strength program"
- "Speed-focused system"
- "Built with TrainChat AI" (optional, subtle)

3. PHASES (CRITICAL — THIS SELLS STRUCTURE)
Format EXACTLY:
"W1 — Establish"
"W2 — Build"
"W3 — Intensify"
"W4 — Peak"
If no labels exist, intelligently generate: Establish → Build → Intensify → Peak
Max 4 items.

4. DAY PREVIEW (MOST IMPORTANT PART)
This MUST feel like a REAL workout.
FORMAT:
- Title: "DAY 1 — LOWER STRENGTH" or "DAY 1 — SPEED + ACCELERATION"
- Exercises: MAX 4 exercises only
  Format: "Back Squat — 4x5" or "RDL — 3x6"
Use sets x reps OR time format if needed.
DO NOT include fluff text, descriptions, or notes.

5. TAGLINE (BOTTOM LINE)
Short, punchy, identity-driven. MAX 5 words.
Examples: "No more guessing." / "Everything adjusts." / "Locked in."

6. CAPTION (THIS DRIVES SHARES)
Tone: Confident, minimal, slightly flex.
Line 1: "I built this with TrainChat."
Line 2: What it is (e.g. "4-day strength system")
Line 3: Hook (e.g. "Let's see what it does." or "No more guessing.")

7. STYLE CONSTRAINTS
- NO paragraphs, NO explanations, NO coaching language, NO emojis, NO filler
- Everything must feel: CLEAN, CONFIDENT, REAL

FINAL INSTRUCTION:
This must feel like something a serious athlete would share.
If it feels generic, rewrite it.`;

router.post("/share-moments/program-card", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const body = ProgramCardBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { programName, daysPerWeek, blockLengthWeeks, blockPhases, day1, focusMode } = body.data;

    const userMessage = JSON.stringify({
      programName,
      daysPerWeek,
      blockLengthWeeks: blockLengthWeeks ?? 4,
      blockPhases: blockPhases && blockPhases.length > 0 ? blockPhases : null,
      day1: {
        name: day1.name,
        exercises: day1.exercises.map((e) => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
        })),
      },
      focusMode: focusMode ?? "strength",
    });

    const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const openAIBaseUrl = process.env.OPENAI_API_KEY
      ? "https://api.openai.com/v1"
      : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1");

    if (!apiKey) {
      const fallback = buildFallbackProgramCard(programName, daysPerWeek, focusMode ?? "strength", day1);
      res.json(fallback);
      return;
    }

    const resp = await fetch(`${openAIBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODELS.SHARE_MOMENTS,
        messages: [
          { role: "system", content: PROGRAM_CARD_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 600,
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      logger.error({ status: resp.status }, "[ProgramCard] OpenAI call failed");
      const fallback = buildFallbackProgramCard(programName, daysPerWeek, focusMode ?? "strength", day1);
      res.json(fallback);
      return;
    }

    const data = await resp.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";

    let card: ProgramCardResult;
    try {
      const parsed = JSON.parse(raw);
      // Field-level validation: ensure required top-level string fields are
      // present and non-empty before using the AI response. Valid JSON with
      // missing or blank fields falls back rather than reaching the UI as undefined.
      const hasRequiredFields =
        parsed &&
        typeof parsed.title === "string" && parsed.title.trim().length > 0 &&
        typeof parsed.caption === "string" && parsed.caption.trim().length > 0 &&
        typeof parsed.tagline === "string" && parsed.tagline.trim().length > 0;
      if (!hasRequiredFields) {
        logger.warn("[ProgramCard] AI response missing required fields — using fallback");
        card = buildFallbackProgramCard(programName, daysPerWeek, focusMode ?? "strength", day1);
      } else {
        card = parsed;
      }
    } catch {
      logger.warn("[ProgramCard] Failed to parse AI response, using fallback");
      card = buildFallbackProgramCard(programName, daysPerWeek, focusMode ?? "strength", day1);
    }

    res.json(card);
  } catch (err) {
    logger.error(err, "[ProgramCard] Unexpected error");
    res.status(500).json({ error: "Failed to generate program card" });
  }
});

interface ProgramCardResult {
  title: string;
  subtitle: string;
  phases: string[];
  dayPreview: {
    title: string;
    exercises: string[];
  };
  tagline: string;
  caption: string;
}

function buildFallbackProgramCard(
  programName: string,
  daysPerWeek: number,
  focusMode: string,
  day1: z.infer<typeof DaySchema>,
): ProgramCardResult {
  const focusLabel = focusMode === "speed" ? "Speed" : focusMode === "mobility" ? "Mobility" : "Strength";
  const dayTitle = `DAY 1 — ${day1.name.toUpperCase()}`;
  const exercises = day1.exercises.slice(0, 4).map((e) => {
    const sets = e.sets ?? 3;
    const reps = e.reps ?? "8";
    return `${e.name} — ${sets}x${reps}`;
  });

  return {
    title: "My current training system",
    subtitle: `${daysPerWeek}-day ${focusLabel.toLowerCase()} program`,
    phases: ["W1 — Establish", "W2 — Build", "W3 — Intensify", "W4 — Peak"],
    dayPreview: { title: dayTitle, exercises },
    tagline: "No more guessing.",
    caption: `I built this with TrainChat.\n${daysPerWeek}-day ${focusLabel.toLowerCase()} system.\nLet's see what it does.`,
  };
}

export default router;
