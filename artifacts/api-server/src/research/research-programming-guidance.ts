// ─── Research-Informed Programming Guidance ────────────────────────────────────
//
// Translates retrieved research chunks into structured programming constraints.
// This is the "translation layer" between raw evidence notes and actual
// program-generation decisions.
//
// Called inside buildSystemPrompt (program generation) and injected into
// mutation prompts (harder/easier, swap) so research shapes real decisions,
// not just chat explanations.

import { logger } from "../lib/logger";
import type { RetrievedResearchChunk } from "./research-retriever";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResearchProgrammingParams {
  goal?: string | null;
  sport?: string | null;
  population?: string | null;
  injuries?: string | null;
  trainingPhase?: string | null;
  retrievedChunks: RetrievedResearchChunk[];
}

export interface ResearchProgrammingGuidance {
  volumeGuidance: string;
  intensityGuidance: string;
  exerciseSelectionGuidance: string;
  progressionGuidance: string;
  recoveryGuidance: string;
  safetyGuidance: string;
  contraindications: string[];
  confidenceLevel: "high" | "moderate" | "low" | "insufficient";
  influencedDimensions: string[];
  researchSources: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasTags(chunks: RetrievedResearchChunk[], ...tags: string[]): boolean {
  return chunks.some((c) => tags.some((t) => (c.topicTags ?? []).includes(t)));
}

function hasCategory(chunks: RetrievedResearchChunk[], ...cats: string[]): boolean {
  return chunks.some((c) => cats.includes(c.category));
}

function hasHighTrust(chunks: RetrievedResearchChunk[], ...tags: string[]): boolean {
  return chunks.some(
    (c) =>
      ["gold", "high"].includes(c.trustLevel) &&
      tags.some((t) => (c.topicTags ?? []).includes(t)),
  );
}

function collectSources(chunks: RetrievedResearchChunk[]): string[] {
  const seen = new Set<string>();
  const sources: string[] = [];
  for (const c of chunks) {
    const key = `${c.documentTitle} (${c.documentSource})`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push(key);
    }
  }
  return sources;
}

function normalizedContext(params: ResearchProgrammingParams): string {
  return [
    params.goal ?? "",
    params.sport ?? "",
    params.population ?? "",
    params.injuries ?? "",
    params.trainingPhase ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

// ─── Dimension Builders ───────────────────────────────────────────────────────

function buildVolumeGuidance(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string {
  if (hasTags(chunks, "hypertrophy")) {
    const trust = hasHighTrust(chunks, "hypertrophy");
    return `Research-informed: Target 10–20 weekly sets per muscle group for hypertrophy. Distribute across 2+ sessions per muscle. Per-session set count: 4–8 working sets per muscle group. Prioritize mechanical tension — proximity to failure matters more than total volume in lower-volume ranges.${trust ? " (High-confidence evidence)" : " (Moderate evidence — apply conservatively)"}`;
  }
  if (hasTags(chunks, "strength_training", "powerlifting")) {
    return `Research-informed: Strength development uses lower per-session volume with higher intensity. 3–6 working sets per main lift. Weekly per-pattern volume: 6–12 sets. Reduce volume during peaking phases. Prioritize quality of effort over accumulated fatigue.`;
  }
  if (hasTags(chunks, "sprint_mechanics", "sport_performance") || /sprint|speed|football|soccer/.test(ctx)) {
    return `Research-informed: Sprint/speed volume governed by quality, not quantity. Limit high-intensity sprint volume per session (4–8 maximal-effort sprints for neuromuscular quality). Total weekly sprint distance: guided by readiness. Lower volume in-season. Preserve neuromuscular quality over accumulated mileage.`;
  }
  if (hasTags(chunks, "plyometrics")) {
    return `Research-informed: Plyometric dosage should be conservative to preserve landing quality and readiness. Beginner: 80–120 foot contacts/week. Intermediate: 120–200. Advanced: 200–300. Never sacrifice landing mechanics for more volume. Volume dictated by readiness, not progression calendar.`;
  }
  if (hasTags(chunks, "older_adult") || /older|senior|aging|65|60s|70s/.test(ctx)) {
    return `Research-informed: Conservative volume increments for older adults. Begin at lower end of working set ranges (2–3 sets). Allow 4–6 week adaptation blocks before volume increases. Avoid back-to-back high-volume sessions. Accumulate volume across more sessions rather than longer individual sessions.`;
  }
  if (hasTags(chunks, "endurance")) {
    return `Research-informed: Concurrent training — strength volume should be managed to avoid interference with endurance adaptations. 2–3 strength sessions/week at moderate volume. Sequence strength before endurance in same-day sessions where possible.`;
  }
  return "";
}

function buildIntensityGuidance(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string {
  if (hasTags(chunks, "hypertrophy")) {
    return `Research-informed: Hypertrophy is well-achieved across a broad rep range (6–30 reps) when taken close to failure. Train within 0–4 RIR (Reps in Reserve). Higher rep ranges (12–20) with closer proximity to failure are equally effective for hypertrophy vs. lower rep ranges at the same RIR. Avoid purely light-load high-rep work done far from failure.`;
  }
  if (hasTags(chunks, "strength_training", "powerlifting")) {
    return `Research-informed: Strength development requires heavy loading (75–95% 1RM) on primary compound movements. Include sub-maximal practice (80–90%) as the bulk of training volume. Reserve true maximal loads (>95%) for testing or peaking. Longer rest periods (3–5 min) are mandatory for strength expression and quality.`;
  }
  if (hasTags(chunks, "sprint_mechanics") || /sprint|speed|acceleration/.test(ctx)) {
    return `Research-informed: Speed and sprint development requires maximum intent on every rep. Work at >90% max velocity for speed quality. Inadequate rest destroys sprint quality — do not compress rest intervals for conditioning purposes. Fatigue-compromised sprints have poor neural transfer.`;
  }
  if (hasTags(chunks, "older_adult") || /older|senior|65/.test(ctx)) {
    return `Research-informed: Moderate intensity (RPE 6–8, never to true failure) with controlled tempo (3-1-2 or slower) for older adult populations. Full ROM at manageable loads. Reduce loads if form compromises. Intensity increments should be small and infrequent.`;
  }
  if (hasTags(chunks, "plyometrics")) {
    return `Research-informed: Plyometric intensity is governed by ground contact mechanics, not added external load. Maximal intent on each jump/bound with full recovery between reps. Never program plyometrics under fatigue conditions that compromise landing quality.`;
  }
  return "";
}

function buildExerciseSelectionGuidance(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string {
  const lines: string[] = [];

  if (hasTags(chunks, "hypertrophy")) {
    lines.push(`Hypertrophy: Prioritize exercises that allow maximal stretch under load (e.g., incline DB curl, deficit RDL, Bulgarian split squat). Include both compound and isolation work. Avoid exercises where form breaks down before reaching near-failure.`);
  }
  if (hasTags(chunks, "strength_training")) {
    lines.push(`Strength: Anchor sessions around barbell compound movements (squat, hinge, press, pull). Accessory work should reinforce technical weaknesses in primary patterns.`);
  }
  if (hasTags(chunks, "sprint_mechanics") || /sprint|speed|football|soccer/.test(ctx)) {
    lines.push(`Speed/sprint: Prioritize acceleration work (resisted sprints, sled push, A-skips, wall drills), max velocity mechanics (flying sprints, wickets, falling starts), and reactive drills. Power work (trap bar deadlift, jump squat, hang power clean) directly supports sprint speed.`);
  }
  if (hasTags(chunks, "plyometrics")) {
    lines.push(`Plyometrics: Progress from bilateral to unilateral, and from low-intensity to high-intensity (squat jump → box jump → depth jump). Prioritize landing quality and reactive mechanics. Do not program plyometrics when lower-body fatigue is high.`);
  }
  if (hasTags(chunks, "older_adult") || /older|senior|65/.test(ctx)) {
    lines.push(`Older adult population: Prefer bilateral exercises before unilateral. Machine variations acceptable and often preferable for joint safety. Include balance and stability work. Choose joint-friendly exercise variants (goblet squat over back squat, leg press, seated variations). Avoid high-impact exercises unless well-established.`);
  }
  if (hasTags(chunks, "pain_modification", "return_to_training") || (ctx.includes("pain") || ctx.includes("injur"))) {
    lines.push(`Pain/injury context: Select exercises that load AROUND the affected joint, not through it. Symptom-guided selection — stay in pain-free range. Use machine alternatives to unload the affected area. Isometric holds as bridge back to full loading.`);
  }
  if (hasTags(chunks, "body_composition")) {
    lines.push(`Body composition: Compound multi-joint movements deliver the most metabolic stimulus. Avoid excessive isolation work in place of compound movements. Circuit or superset structures acceptable for time efficiency without sacrificing progressive overload.`);
  }

  return lines.join(" | ");
}

function buildProgressionGuidance(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string {
  if (hasTags(chunks, "progressive_overload") || hasTags(chunks, "hypertrophy", "strength_training")) {
    const isHypertrophy = hasTags(chunks, "hypertrophy");
    if (isHypertrophy) {
      return `Research-informed: Use double progression — first increase reps within a target range (e.g., 3×8 → 3×12), then increase load and drop back to lower rep range. Avoid arbitrary load increases without rep-range mastery. Log and track to ensure progressive overload is genuinely occurring.`;
    }
    return `Research-informed: Strength progression requires planned overload. Linear progression for novices (add weight each session). Intermediate+ use weekly or block-based progression (linear periodization or DUP). Deload every 4–6 weeks. Track 1RM and working maxes — log every session.`;
  }
  if (hasTags(chunks, "sprint_mechanics") || /sprint|speed/.test(ctx)) {
    return `Research-informed: Speed progression is NOT linear load-based. Progress sprint quality by: reducing assists (resisted → free sprint), increasing distance segments, improving mechanics, and reducing contact times. Volume increases should be gradual (+10% max per week). Never sacrifice quality for speed progression.`;
  }
  if (hasTags(chunks, "plyometrics")) {
    return `Research-informed: Plyometric progression: bilateral → unilateral; low amplitude → high amplitude; slow-tempo → reactive. Foot contacts per week is the primary volume metric. Increase by no more than 10% per week. Progress difficulty only when landing quality and readiness are consistently strong.`;
  }
  if (hasTags(chunks, "older_adult") || /older|senior/.test(ctx)) {
    return `Research-informed: Conservative progression for older adult populations. Allow 3–4 weeks per load increment (vs. 1–2 weeks for younger adults). Use smaller load jumps (2.5 kg or less on barbell). Prefer rep-based progression before load increases. Deload more frequently (every 3–4 weeks).`;
  }
  if (hasTags(chunks, "pain_modification") || ctx.includes("pain")) {
    return `Research-informed: Pain-context progression is symptom-guided. Progress only when symptoms remain at or below baseline during and after training. Increase load or volume one variable at a time. Never chase progression at the cost of symptom flare-up.`;
  }
  return "";
}

function buildRecoveryGuidance(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string {
  const lines: string[] = [];

  if (hasTags(chunks, "recovery") || hasTags(chunks, "hypertrophy")) {
    lines.push(`Allow 48–72h between sessions targeting the same primary muscle groups. Recovery between hypertrophy sets: 1–3 min. Recovery between strength sets: 3–5 min.`);
  }
  if (hasTags(chunks, "sprint_mechanics") || /sprint|speed/.test(ctx)) {
    lines.push(`Sprint/speed: Full CNS recovery between efforts — work:rest ratios of 1:6 to 1:10. 48h minimum between high-intensity sprint sessions. Do not program sprint work after heavy lower-body strength if same day.`);
  }
  if (hasTags(chunks, "plyometrics")) {
    lines.push(`Plyometrics: 48–72h recovery between high-intensity plyometric sessions. Do not pair with heavy strength work in same session unless explicitly warm-up based.`);
  }
  if (hasTags(chunks, "older_adult") || /older|senior/.test(ctx)) {
    lines.push(`Older adult populations require extended recovery windows — 72–96h between intense sessions. Prefer alternating training focus (upper/lower or strength/conditioning).`);
  }
  if (hasTags(chunks, "load_management")) {
    lines.push(`Load management: Monitor cumulative fatigue across weeks. Deload every 4–6 weeks. Reduce volume (not intensity) by 30–50% in deload weeks.`);
  }

  return lines.join(" ");
}

function buildSafetyGuidance(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string {
  const lines: string[] = [];

  if (hasTags(chunks, "pain_modification", "return_to_training") || ctx.includes("pain") || ctx.includes("injur")) {
    lines.push(`SAFETY — pain context: Symptom-guided modification is mandatory. Stop or reduce any exercise that reproduces pain >2/10 on the pain scale. Do not push through joint pain. Use pain-free ROM only. No diagnosis or medical claims — refer to physiotherapist for clinical assessment.`);
  }
  if (hasTags(chunks, "older_adult") || /older|senior/.test(ctx)) {
    lines.push(`SAFETY — older adult context: Balance and fall-risk are primary safety concerns. Avoid exercises with high fall-risk unless supported (unassisted single-leg work, barbell overhead). Prioritize controlled tempo and safe entry/exit from positions. Always provide stable support options.`);
  }
  if (hasTags(chunks, "plyometrics")) {
    lines.push(`SAFETY — plyometrics: Never program plyometrics under fatigued conditions. Landing quality is the primary safety indicator — if landing is compromised, the session ends. Beginners must master landing mechanics before adding height or reactive demands.`);
  }
  if (hasCategory(chunks, "medical_rehab")) {
    lines.push(`SAFETY — medical/rehab context: Medical-category research applies. Conservative modifications only. Exercise does not replace medical treatment. Flag any exercises that are contraindicated per retrieved research.`);
  }

  return lines.join(" ");
}

function buildContraindications(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string[] {
  const contra: string[] = [];

  if (ctx.includes("knee") || ctx.includes("patell")) {
    contra.push("Deep loaded squats below 90° if knee pain is present");
    contra.push("Leg extension machine in pain-provocative ranges");
    contra.push("Running or jumping until symptom-free at lower load");
  }
  if (ctx.includes("shoulder") || ctx.includes("rotator")) {
    contra.push("Overhead pressing in pain range — reduce range or load");
    contra.push("Behind-the-neck press or lat pulldown");
    contra.push("High-fatigue overhead volume");
  }
  if (ctx.includes("back") || ctx.includes("lumbar") || ctx.includes("spine")) {
    contra.push("Heavy axial loading (barbell back squat/deadlift) until core stability established");
    contra.push("Loaded spinal flexion under fatigue");
    contra.push("High-rep ballistic movements that compromise spine position");
  }
  if (ctx.includes("hip") || ctx.includes("groin")) {
    contra.push("Deep hip flexion under load if hip pain present");
    contra.push("Single-leg exercises that reproduce groin or hip impingement pain");
  }
  if (hasTags(chunks, "older_adult") || /older|senior/.test(ctx)) {
    contra.push("High-impact plyometrics without established landing competency");
    contra.push("Unassisted single-leg balance work on unstable surfaces without progression");
  }

  return contra;
}

function determineConfidenceLevel(
  chunks: RetrievedResearchChunk[],
): ResearchProgrammingGuidance["confidenceLevel"] {
  if (chunks.length === 0) return "insufficient";
  const goldCount = chunks.filter((c) => c.trustLevel === "gold").length;
  const highCount = chunks.filter((c) => c.trustLevel === "high").length;
  if (goldCount >= 2 || (goldCount >= 1 && highCount >= 1)) return "high";
  if (goldCount >= 1 || highCount >= 2) return "moderate";
  if (chunks.length >= 2) return "low";
  return "insufficient";
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

export function buildResearchProgrammingGuidance(
  params: ResearchProgrammingParams,
): ResearchProgrammingGuidance {
  const { retrievedChunks } = params;

  if (!retrievedChunks || retrievedChunks.length === 0) {
    return {
      volumeGuidance: "",
      intensityGuidance: "",
      exerciseSelectionGuidance: "",
      progressionGuidance: "",
      recoveryGuidance: "",
      safetyGuidance: "",
      contraindications: [],
      confidenceLevel: "insufficient",
      influencedDimensions: [],
      researchSources: [],
    };
  }

  const ctx = normalizedContext(params);

  const volumeGuidance = buildVolumeGuidance(ctx, retrievedChunks);
  const intensityGuidance = buildIntensityGuidance(ctx, retrievedChunks);
  const exerciseSelectionGuidance = buildExerciseSelectionGuidance(ctx, retrievedChunks);
  const progressionGuidance = buildProgressionGuidance(ctx, retrievedChunks);
  const recoveryGuidance = buildRecoveryGuidance(ctx, retrievedChunks);
  const safetyGuidance = buildSafetyGuidance(ctx, retrievedChunks);
  const contraindications = buildContraindications(ctx, retrievedChunks);
  const confidenceLevel = determineConfidenceLevel(retrievedChunks);
  const researchSources = collectSources(retrievedChunks);

  const influencedDimensions: string[] = [];
  if (volumeGuidance) influencedDimensions.push("volume");
  if (intensityGuidance) influencedDimensions.push("intensity");
  if (exerciseSelectionGuidance) influencedDimensions.push("exercise_selection");
  if (progressionGuidance) influencedDimensions.push("progression");
  if (recoveryGuidance) influencedDimensions.push("recovery");
  if (safetyGuidance) influencedDimensions.push("safety");
  if (contraindications.length > 0) influencedDimensions.push("contraindications");

  if (process.env.NODE_ENV !== "production") {
    logger.debug(
      {
        _researchProgrammingDebug: true,
        chunksRetrieved: retrievedChunks.length,
        chunkTags: retrievedChunks.flatMap((c) => c.topicTags ?? []),
        confidenceLevel,
        influencedDimensions,
        researchSources,
      },
      "[ResearchProgrammingGuidance] Programming dimensions influenced by research",
    );
  }

  return {
    volumeGuidance,
    intensityGuidance,
    exerciseSelectionGuidance,
    progressionGuidance,
    recoveryGuidance,
    safetyGuidance,
    contraindications,
    confidenceLevel,
    influencedDimensions,
    researchSources,
  };
}

// ─── Prompt Formatter ─────────────────────────────────────────────────────────
// Formats the structured guidance into a prompt section for injection.

export function formatResearchGuidanceForPrompt(
  guidance: ResearchProgrammingGuidance,
): string {
  if (guidance.influencedDimensions.length === 0) return "";

  const lines: string[] = [
    "\n## RESEARCH-INFORMED PROGRAMMING GUIDANCE",
    `Evidence confidence: ${guidance.confidenceLevel.toUpperCase()}`,
    "Apply this guidance to improve the actual program structure — not just the explanation.",
    "Do NOT simply mention the research. Translate it into programming decisions.",
    "Do NOT overrule user constraints or pain/safety rules.\n",
  ];

  if (guidance.volumeGuidance) {
    lines.push(`**VOLUME:** ${guidance.volumeGuidance}`);
  }
  if (guidance.intensityGuidance) {
    lines.push(`**INTENSITY:** ${guidance.intensityGuidance}`);
  }
  if (guidance.exerciseSelectionGuidance) {
    lines.push(`**EXERCISE SELECTION:** ${guidance.exerciseSelectionGuidance}`);
  }
  if (guidance.progressionGuidance) {
    lines.push(`**PROGRESSION:** ${guidance.progressionGuidance}`);
  }
  if (guidance.recoveryGuidance) {
    lines.push(`**RECOVERY:** ${guidance.recoveryGuidance}`);
  }
  if (guidance.safetyGuidance) {
    lines.push(`**SAFETY:** ${guidance.safetyGuidance}`);
  }
  if (guidance.contraindications.length > 0) {
    lines.push(
      `**CONTRAINDICATIONS:** Avoid or modify:\n${guidance.contraindications.map((c) => `  - ${c}`).join("\n")}`,
    );
  }

  lines.push(
    "\nIf evidence is limited or conflicting, use conservative programming defaults.",
  );

  return lines.join("\n");
}

// ─── Compact formatter for mutation prompts ───────────────────────────────────
// Shorter version for injection into harder/easier, swap, and pain prompts.

export function formatResearchGuidanceCompact(
  guidance: ResearchProgrammingGuidance,
  focusDimensions?: Array<"exercise_selection" | "safety" | "intensity" | "progression">,
): string {
  if (guidance.influencedDimensions.length === 0) return "";

  const focus = focusDimensions ?? ["exercise_selection", "safety", "intensity"];
  const lines: string[] = ["\nRESEARCH GUIDANCE (apply to this specific modification):"];

  if (focus.includes("exercise_selection") && guidance.exerciseSelectionGuidance) {
    lines.push(`Exercise selection: ${guidance.exerciseSelectionGuidance.slice(0, 400)}`);
  }
  if (focus.includes("safety") && guidance.safetyGuidance) {
    lines.push(`Safety: ${guidance.safetyGuidance.slice(0, 300)}`);
  }
  if (focus.includes("intensity") && guidance.intensityGuidance) {
    lines.push(`Intensity: ${guidance.intensityGuidance.slice(0, 300)}`);
  }
  if (focus.includes("progression") && guidance.progressionGuidance) {
    lines.push(`Progression: ${guidance.progressionGuidance.slice(0, 300)}`);
  }
  if (guidance.contraindications.length > 0) {
    lines.push(`Contraindications: ${guidance.contraindications.join("; ")}`);
  }

  return lines.join("\n");
}
