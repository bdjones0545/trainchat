import { logger } from "./logger";
import type {
  WhitepaperSection,
  WhitepaperCitationBlock,
  WhitepaperSeoMetadata,
} from "@workspace/db";

// ─── Output Schema ─────────────────────────────────────────────────────────────

export interface GeneratedWhitepaper {
  title: string;
  subtitle: string;
  code: string;
  slug: string;
  abstract: string;
  keywords: string[];
  estimatedPages: string;
  sections: WhitepaperSection[];
  citation: WhitepaperCitationBlock;
  seoMetadata: WhitepaperSeoMetadata;
}

export interface GenerationInput {
  title: string;
  code: string;
  slug: string;
  subtitle?: string | null;
  thesis?: string | null;
  targetAudience?: string | null;
}

// ─── Validation ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS: (keyof GeneratedWhitepaper)[] = [
  "title",
  "subtitle",
  "abstract",
  "keywords",
  "sections",
  "citation",
  "seoMetadata",
];

function validateOutput(data: unknown): data is GeneratedWhitepaper {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (d[field] === undefined || d[field] === null) {
      logger.warn({ field }, "[whitepaper-generator] Missing required field in generated output");
      return false;
    }
  }

  if (!Array.isArray(d.sections) || d.sections.length < 4) {
    logger.warn({ sectionCount: Array.isArray(d.sections) ? d.sections.length : 0 }, "[whitepaper-generator] Too few sections");
    return false;
  }

  if (!Array.isArray(d.keywords) || d.keywords.length < 3) {
    logger.warn("[whitepaper-generator] Too few keywords");
    return false;
  }

  const citation = d.citation as Record<string, unknown>;
  if (!citation?.formatted || !citation?.canonicalUrl) {
    logger.warn("[whitepaper-generator] Citation block incomplete");
    return false;
  }

  return true;
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the TrainChat Research Publishing System. You write formal whitepapers for the TrainChat platform — an AI performance coaching system built on principled, constraint-aware, adaptive training architecture.

## TrainChat Academic Tone Rules
- Write in formal academic prose. Third person. No colloquialisms.
- Arguments are structural, not preference-based. Every claim has architectural justification.
- Introduce TrainChat-original frameworks explicitly: "TrainChat defines...", "The [Framework Name] establishes..."
- Never invent citations, studies, or external research. If referencing established exercise science principles (progressive overload, periodization, specificity), state them as principles — not as citations from invented papers.
- Do not attribute quotes to real researchers unless they are verifiable, well-known, and publicly documented.
- The tone is confident, precise, and institution-grade — the voice of a serious AI coaching research group.

## Framework Registry (Use these accurately)
- ACA — Adaptive Coaching Architecture: Three-layer system. Layer 1: Coaching Intelligence (decision engine). Layer 2: Adaptive Programming (execution engine). Layer 3: Conversational Interface (input layer).
- MFP — Mutation-First Programming: Five-level mutation hierarchy. Most surgical intervention always preferred over rebuild.
- LSM — Living System Model: Three properties of a living training system vs static program.
- CACS — Constraint-Aware Coaching Systems: Constraint taxonomy, registry architecture, constraint resolution.
- CP — Conversational Periodization: Dynamic block mutation through continuous coaching dialogue.
- DGH — Deterministic-Generative Hybrid Model: Generative layer interprets, deterministic layer decides.

## Output Format
Respond with a single valid JSON object matching this exact schema. No markdown fences. No preamble.

{
  "title": "string — exact whitepaper title",
  "subtitle": "string — descriptive subtitle",
  "code": "string — 2-5 uppercase letters, e.g. 'CSAI'",
  "slug": "string — url-safe slug matching the topic slug",
  "abstract": "string — 2-3 paragraph academic abstract, plain text (use \\n\\n between paragraphs)",
  "keywords": ["array", "of", "5-8", "keyword strings"],
  "estimatedPages": "string — e.g. '~10 pages'",
  "sections": [
    {
      "number": "string — e.g. '1.'",
      "heading": "string — section title",
      "content": ["array of paragraph strings — each element is one paragraph"],
      "pullQuote": "optional string — a single compelling sentence from the section"
    }
  ],
  "citation": {
    "formatted": "string — APA-style citation: Author(s). (Year). Title. TrainChat Research Series. URL",
    "related": ["array of related framework codes or topic slugs"],
    "framework": ["optional array of framework codes this paper introduces or extends"],
    "canonicalUrl": "string — https://trainchat.ai/whitepapers/[slug]"
  },
  "seoMetadata": {
    "metaTitle": "string — SEO title, ≤60 chars",
    "metaDescription": "string — SEO description, ≤155 chars",
    "ogTitle": "string — Open Graph title",
    "ogDescription": "string — Open Graph description, 2-3 sentences"
  }
}

## Quality Rules
- Sections: minimum 4, maximum 8. Each section has at least 2 content paragraphs.
- Abstract: 200-400 words total across its paragraphs.
- No invented external citations. Label TrainChat-original frameworks clearly.
- The conclusion section must include a "Future Work" or "Implications" subsection reference.
- All framework codes mentioned must be from the Registry above or the paper being authored.
`;

// ─── Generator ─────────────────────────────────────────────────────────────────

export async function generateWhitepaper(
  input: GenerationInput,
): Promise<GeneratedWhitepaper> {
  const apiKey =
    process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseUrl =
    process.env.NODE_ENV === "development"
      ? "https://api.openai.com/v1"
      : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??
        "https://api.openai.com/v1");

  if (!apiKey) {
    throw new Error("No OpenAI API key configured");
  }

  const userPrompt = buildUserPrompt(input);

  logger.info(
    { slug: input.slug, code: input.code },
    "[whitepaper-generator] Starting generation",
  );

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 6000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `OpenAI API error ${response.status}: ${errText.slice(0, 200)}`,
    );
  }

  const json = await response.json() as { choices: Array<{ message: { content: string } }> };
  const rawContent = json.choices[0]?.message?.content;

  if (!rawContent) {
    throw new Error("OpenAI returned empty content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("OpenAI did not return valid JSON for whitepaper");
  }

  if (!validateOutput(parsed)) {
    throw new Error("Generated whitepaper failed schema validation");
  }

  logger.info(
    { slug: input.slug, sections: parsed.sections.length },
    "[whitepaper-generator] Generation succeeded",
  );

  return parsed;
}

// ─── User Prompt Builder ───────────────────────────────────────────────────────

function buildUserPrompt(input: GenerationInput): string {
  const lines: string[] = [
    `Generate a complete TrainChat whitepaper for the following topic:`,
    ``,
    `Title: ${input.title}`,
    `Code: ${input.code}`,
    `Slug: ${input.slug}`,
  ];

  if (input.subtitle) {
    lines.push(`Subtitle: ${input.subtitle}`);
  }

  if (input.thesis) {
    lines.push(``, `Core Thesis:`, input.thesis);
  }

  if (input.targetAudience) {
    lines.push(``, `Target Audience: ${input.targetAudience}`);
  }

  lines.push(
    ``,
    `Requirements:`,
    `- Minimum 5 sections (Introduction, 2-4 body sections, Conclusion)`,
    `- Abstract must be 2-3 paragraphs`,
    `- All TrainChat-original frameworks must be introduced with "TrainChat defines..." or "[Framework] establishes..."`,
    `- No invented citations, no invented research papers`,
    `- Use existing TrainChat framework codes (ACA, MFP, CACS, CP, DGH, LSM) accurately if they are referenced`,
    `- The paper code (${input.code}) must match a new framework this paper introduces`,
    `- Respond with only the JSON object — no markdown fences, no commentary`,
  );

  return lines.join("\n");
}
