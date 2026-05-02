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

function hasStrengthTags(chunks: RetrievedResearchChunk[]): boolean {
  return hasTags(
    chunks,
    "strength",
    "max_strength",
    "strength_training",
    "progressive_overload",
    "periodization",
    "rest_periods",
    "exercise_selection",
    "movement_patterns",
    "motor_learning",
    "athletic_performance",
    "functional_strength",
    "joint_friendly",
  );
}

function hasMobilityTags(chunks: RetrievedResearchChunk[]): boolean {
  return hasTags(
    chunks,
    "mobility",
    "hip_mobility",
    "ankle_mobility",
    "thoracic_mobility",
    "shoulder_mobility",
    "dynamic_warmup",
    "movement_quality",
    "flexibility",
    "range_of_motion",
  );
}

function hasSpeedTags(chunks: RetrievedResearchChunk[]): boolean {
  return hasTags(
    chunks,
    "speed",
    "sprint_mechanics",
    "acceleration",
    "max_velocity",
    "change_of_direction",
    "agility",
    "force_velocity",
  );
}

function buildVolumeGuidance(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string {
  if (hasTags(chunks, "hypertrophy")) {
    const trust = hasHighTrust(chunks, "hypertrophy");
    return `Research-informed: Target 10–20 weekly sets per muscle group for hypertrophy. Distribute across 2+ sessions per muscle. Per-session set count: 4–8 working sets per muscle group. Prioritize mechanical tension — proximity to failure matters more than total volume in lower-volume ranges.${trust ? " (High-confidence evidence)" : " (Moderate evidence — apply conservatively)"}`;
  }
  if (hasStrengthTags(chunks) || hasTags(chunks, "strength_training", "powerlifting")) {
    if (hasTags(chunks, "older_adults", "functional_strength") || /older|senior/.test(ctx)) {
      return `Research-informed: Strength volume for older adults: 2–3 sessions per week, 6–10 working sets per session across major patterns. Begin at lower end of set ranges (2–3 sets). Allow 4–6 week adaptation blocks before increasing volume. Accumulate volume across more sessions, not longer single sessions.`;
    }
    if (hasTags(chunks, "beginner", "motor_learning") || /beginner|novice|new.?to/.test(ctx)) {
      return `Research-informed: Beginner strength volume: 2–3 full-body sessions per week, 3–4 exercises per session, 2–3 sets per exercise. Novices adapt to almost any training stimulus — more volume does not mean more progress. Build consistency first, then gradually add volume after 8–12 weeks.`;
    }
    return `Research-informed: Strength development uses lower per-session volume with higher intensity. 3–6 working sets per main lift. Weekly per-pattern volume: 6–12 sets across all sessions. Reduce volume during peaking and deload phases. Prioritize quality of effort over accumulated fatigue. Deload every 4–6 weeks: cut volume 40–50% while maintaining intensity.`;
  }
  if (hasTags(chunks, "sprint_mechanics", "speed", "max_velocity", "acceleration") || /sprint|speed|football/.test(ctx)) {
    return `Research-informed: Sprint/speed volume governed by quality, not quantity. Limit high-intensity sprint volume per session (4–8 maximal-effort sprints for neuromuscular quality). Total weekly sprint distance: guided by readiness. Lower volume in-season. Preserve neuromuscular quality over accumulated mileage. Do NOT inflate sprint volume to achieve conditioning effect — these are separate training qualities.`;
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
  if (hasMobilityTags(chunks) && !hasTags(chunks, "strength_training", "hypertrophy", "sprint_mechanics", "speed")) {
    return `Research-informed: Mobility work is integrated as session preparation and accessory work — not as high-volume standalone training. Dynamic warm-up mobility: 10–15 minutes per session. Active mobility exercises (CARs, controlled articulations) can be performed daily without significant fatigue accumulation. Focus on consistency of brief daily bouts rather than infrequent long sessions.`;
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
  if (hasStrengthTags(chunks) || hasTags(chunks, "strength_training", "powerlifting")) {
    if (hasTags(chunks, "beginner", "motor_learning") || /beginner|novice/.test(ctx)) {
      return `Research-informed: Beginner strength intensity: moderate loads (50–70% 1RM, RPE 5–7). Never train to failure on technical compound lifts. Leave 2–3 reps in reserve at all times. Controlled tempo. Technique is the primary performance variable — not load.`;
    }
    if (hasTags(chunks, "max_strength") || /max.?strength|1rm|heavy/.test(ctx)) {
      return `Research-informed: Max strength requires heavy loading (75–95% 1RM) on primary compound movements. Sub-maximal practice (80–90%) should constitute the bulk of training. Reserve true maximal loads (>95%) for testing or peaking only. Longer rest (3–5 min) is mandatory — compressed rest destroys heavy compound lift quality. Technical failure is the real failure point, not rep failure.`;
    }
    return `Research-informed: Strength development requires heavy-enough loading to drive adaptation. Primary compound movements: 75–90% 1RM or RPE 7–9. Rest 3–5 minutes between primary lift sets. Accessory work: moderate intensity, 60–120 second rest. Do not compress rest periods for time efficiency — this trades strength quality for fatigue.`;
  }
  if (hasTags(chunks, "sprint_mechanics", "speed", "max_velocity", "acceleration") || /sprint|speed|acceleration/.test(ctx)) {
    return `Research-informed: Speed and sprint development requires maximum intent on every rep. Work at >90% max velocity for speed quality. Inadequate rest destroys sprint quality — do not compress rest intervals for conditioning purposes. Fatigue-compromised sprints have poor neural transfer. Sprint quality is the non-negotiable variable; everything else is secondary.`;
  }
  if (hasTags(chunks, "change_of_direction", "agility", "deceleration")) {
    return `Research-informed: Change-of-direction training intensity should be progressive — begin at controlled submaximal speeds with planned cutting patterns before adding reactive demands and full-speed COD. Deceleration mechanics (hip-loading, braking angles) must be established at moderate intensity before high-velocity cutting is introduced.`;
  }
  if (hasTags(chunks, "older_adult") || /older|senior|65/.test(ctx)) {
    return `Research-informed: Moderate intensity (RPE 6–8, never to true failure) with controlled tempo (3-1-2 or slower) for older adult populations. Full ROM at manageable loads. Reduce loads if form compromises. Intensity increments should be small and infrequent.`;
  }
  if (hasTags(chunks, "plyometrics")) {
    return `Research-informed: Plyometric intensity is governed by ground contact mechanics, not added external load. Maximal intent on each jump/bound with full recovery between reps. Never program plyometrics under fatigue conditions that compromise landing quality.`;
  }
  if (hasMobilityTags(chunks)) {
    return `Research-informed: Mobility work intensity is governed by active control — never forced into end range. Dynamic mobility during warm-up should be moderate intensity, gradually increasing. Static stretching post-session: hold for 30–60 seconds at comfortable end range, not pain range. Forced stretching is counterproductive and increases injury risk.`;
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
  if (hasStrengthTags(chunks) || hasTags(chunks, "strength_training")) {
    if (hasTags(chunks, "joint_friendly", "pain_modification") || ctx.includes("pain") || ctx.includes("knee") || ctx.includes("shoulder") || ctx.includes("back")) {
      lines.push(`Strength + pain/limitation: Preserve movement pattern intent while modifying the specific exercise. Knee pain → box squat, leg press, goblet squat; Shoulder pain → landmine press, DB neutral-grip press, cable row; Back pain → trap bar deadlift, hip thrust, machine row. Use pain-free ROM and isometric holds as a bridge. Do not remove the entire pattern — modify the variation.`);
    } else if (hasTags(chunks, "older_adults", "functional_strength") || /older|senior/.test(ctx)) {
      lines.push(`Strength (older adult): Prioritize functional patterns — goblet squat, leg press, hip hinge, lat pulldown, chest press, seated row, step-ups, farmer carry. Machine variations are often preferable for stability. Avoid high-risk variations (barbell back squat, heavy overhead) unless well-established. Include balance and stability exercises.`);
    } else if (hasTags(chunks, "beginner", "motor_learning") || /beginner|novice/.test(ctx)) {
      lines.push(`Strength (beginner): Select 3–6 exercises per session covering all major patterns. Prefer simpler variations (goblet squat, dumbbell RDL, push-up, dumbbell row, farmer carry). Avoid advanced variations (barbell Olympic lifts, complex periodization) until movement patterns are consistent. Consistency and technique trump exercise complexity.`);
    } else if (hasTags(chunks, "athletic_performance") || /athletic|football|sport|performance/.test(ctx)) {
      lines.push(`Strength (athletic): Anchor around barbell compound movements (squat, hinge, press, pull). Include power bridging exercises (trap bar deadlift, jump squat, hang power clean) to express strength as sport force. Accessory work reinforces technical weaknesses. Match exercise selection to sport demands and position.`);
    } else {
      lines.push(`Strength: Anchor each session around 1–2 major compound movements (squat, hinge, press, pull, carry). Accessory work (2–4 exercises) reinforces technical weaknesses and adds pattern volume. Ensure weekly balance across all 6 patterns. Choose variations appropriate to the athlete's skill, equipment, and goal — the pattern matters more than the specific exercise.`);
    }
  }
  if (hasTags(chunks, "sprint_mechanics", "speed", "acceleration", "max_velocity") || /sprint|speed|football/.test(ctx)) {
    lines.push(`Speed/sprint: Prioritize acceleration work (resisted sprints, sled push, A-skips, wall drills), max velocity mechanics (flying sprints, wickets, falling starts), and reactive drills. Power work (trap bar deadlift, jump squat, hang power clean) directly supports sprint speed. Do not substitute generic conditioning drills for structured speed work.`);
  }
  if (hasTags(chunks, "change_of_direction", "agility", "deceleration")) {
    lines.push(`Change of direction / deceleration: Include dedicated deceleration strength work (Nordic curls, eccentric-focused RDL, step-behind decelerations), structured cutting drills (45°/90° planned cuts before reactive), and braking mechanics exercises. Avoid random cone-ladder circuits as the primary agility method — use structured, progressive COD patterns with defined mechanics.`);
  }
  if (hasTags(chunks, "force_velocity")) {
    lines.push(`Strength-speed / force-velocity: Include power bridging exercises (hang power clean, trap bar deadlift jump, medicine ball throws, jump squats) to connect max strength to sprint speed. Place power work when CNS is freshest — before strength or conditioning in the session order.`);
  }
  if (hasTags(chunks, "plyometrics")) {
    lines.push(`Plyometrics: Progress from bilateral to unilateral, and from low-intensity to high-intensity (squat jump → box jump → depth jump). Prioritize landing quality and reactive mechanics. Do not program plyometrics when lower-body fatigue is high.`);
  }
  if (hasMobilityTags(chunks)) {
    lines.push(`Mobility/movement prep: Select joint-specific mobility exercises — hip (hip 90/90, world's greatest stretch, hip CARs), ankle (wall dorsiflexion mobilization, eccentric heel drops), thoracic (foam roller extension, open book, thoracic CARs), shoulder (band dislocates, wall slides). Dynamic warm-up before power/speed work must match session demands. Pair each mobility drill with a stability exercise in the same range. Reserve static stretching (30–60 second holds) for post-session, not pre-power.`);
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
  if (hasStrengthTags(chunks) || hasTags(chunks, "progressive_overload") || hasTags(chunks, "hypertrophy", "strength_training")) {
    const isHypertrophy = hasTags(chunks, "hypertrophy") && !hasStrengthTags(chunks);
    if (isHypertrophy) {
      return `Research-informed: Use double progression — first increase reps within a target range (e.g., 3×8 → 3×12), then increase load and drop back to lower rep range. Avoid arbitrary load increases without rep-range mastery. Log and track to ensure progressive overload is genuinely occurring.`;
    }
    if (hasTags(chunks, "beginner", "motor_learning") || /beginner|novice/.test(ctx)) {
      return `Research-informed: Beginner strength progression: add small weight each session (2.5–5 kg on compound lifts). When load cannot increase, add a rep. Technique must be consistent before adding load. This linear progression phase can last 3–12 months for true beginners. Do not skip to complex periodization.`;
    }
    if (hasTags(chunks, "periodization", "deload") || /intermediate|advanced|block|periodiz/.test(ctx)) {
      return `Research-informed: Intermediate+ strength progression: undulating load variation (heavy/moderate/light days) or block periodization (3–4 week accumulation → 2–3 week intensification → 1 week deload). Deload every 4–6 weeks — reduce volume 40–50% while maintaining intensity. Track 1RM and working maxes every session. Plan progression ahead — don't guess.`;
    }
    if (hasTags(chunks, "pain_modification", "joint_friendly") || ctx.includes("pain")) {
      return `Research-informed: Pain-context strength progression is symptom-guided. Progress only when symptoms remain stable or below baseline during and after training. Increase one variable at a time (load OR reps OR volume — never all at once). Never chase progression at the cost of symptom flare-up.`;
    }
    return `Research-informed: Strength progression requires planned overload. Linear progression for novices (add weight each session). Intermediate+ use weekly or block-based progression. Deload every 4–6 weeks. Track loads and reps every session. Use alternative progression (reps, tempo, ROM, density) when load increases are not appropriate.`;
  }
  if (hasTags(chunks, "sprint_mechanics", "speed", "acceleration", "max_velocity") || /sprint|speed/.test(ctx)) {
    return `Research-informed: Speed progression is NOT linear load-based. Progress sprint quality by: reducing resistance (resisted → free sprint), increasing distance segments, improving mechanics, and improving reactive quality. Volume increases: no more than 10% per week. Never sacrifice quality for volume or distance progression. Track sprint times and mechanics — not just reps.`;
  }
  if (hasTags(chunks, "change_of_direction", "agility")) {
    return `Research-informed: COD progression: planned cutting patterns at submaximal speed → reactive stimuli at controlled speed → full-speed reactive cutting. Build deceleration strength (eccentric squats, Nordic curls) as the prerequisite before adding aggressive cutting angles or velocity. Progress angle complexity and decision demand separately.`;
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
  if (hasMobilityTags(chunks)) {
    return `Research-informed: Mobility progression: passive range → active controlled range → loaded range. Address one joint per focus block with consistency (daily short bouts are more effective than infrequent long sessions). Progress mobility gains into stability and strength in the new range before adding load. Allow 4–8+ weeks for meaningful, lasting mobility improvement.`;
  }
  return "";
}

function buildRecoveryGuidance(
  ctx: string,
  chunks: RetrievedResearchChunk[],
): string {
  const lines: string[] = [];

  if (hasStrengthTags(chunks) || hasTags(chunks, "recovery") || hasTags(chunks, "hypertrophy")) {
    if (hasTags(chunks, "rest_periods") || hasStrengthTags(chunks)) {
      lines.push(`Strength recovery: Rest 3–5 minutes between heavy compound sets (squat, deadlift, press, weighted pull-up). Rest 60–120 seconds for accessory and isolation work. Do NOT compress rest on primary lifts for time efficiency — this directly degrades strength output and technical quality. Allow 48–72h between sessions targeting the same primary pattern. Deload weeks: reduce volume 40–50%, maintain intensity.`);
    } else {
      lines.push(`Allow 48–72h between sessions targeting the same primary muscle groups. Recovery between hypertrophy sets: 1–3 min. Recovery between strength sets: 3–5 min.`);
    }
  }
  if (hasTags(chunks, "sprint_mechanics", "speed", "max_velocity", "acceleration") || /sprint|speed/.test(ctx)) {
    lines.push(`Sprint/speed: Full CNS recovery between efforts — work:rest ratios of 1:6 to 1:10. 48h minimum between high-intensity sprint sessions. Do not program sprint work after heavy lower-body strength in the same session. Fatigue from conditioning sessions must not carry into speed sessions.`);
  }
  if (hasTags(chunks, "change_of_direction", "agility")) {
    lines.push(`COD/agility: 48h between high-intensity COD sessions. Do not pair with heavy eccentric lower-body work in same session — cumulative fatigue degrades cutting mechanics and elevates injury risk.`);
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
  if (hasMobilityTags(chunks)) {
    lines.push(`Mobility/warm-up: Integrate dynamic movement prep (leg swings, hip circles, lunge patterns, arm circles, joint CARs) at the start of every training session — especially before power and speed work. Warm-up should ramp intensity gradually over 10–15 minutes. Reserve static holds (30–60s) for post-session cool-down blocks, not pre-power preparation. Active mobility exercises carry low fatigue cost and can be included daily.`);
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
  if (hasTags(chunks, "sprint_mechanics", "speed", "max_velocity") && (ctx.includes("pain") || ctx.includes("knee") || ctx.includes("hamstring") || ctx.includes("hip"))) {
    lines.push(`SAFETY — speed + pain context: Sprint work with pain or injury present requires conservative exposure. Reduce sprint intensity to submaximal, eliminate reactive/max-velocity work, and address the symptomatic area first. Hamstring and hip pain are absolute contraindications to maximal-intent sprint work until symptom-free.`);
  }
  if (hasTags(chunks, "change_of_direction", "agility") && (ctx.includes("knee") || ctx.includes("ankle") || ctx.includes("pain"))) {
    lines.push(`SAFETY — COD + joint pain: High-velocity cutting and deceleration are contraindicated when knee or ankle pain is present. Modify to planned, controlled deceleration drills at submaximal speed. Do not program reactive cutting until the athlete is pain-free at lower-intensity COD.`);
  }
  if (hasMobilityTags(chunks)) {
    lines.push(`SAFETY — mobility: Do not claim mobility prevents injury. Frame as movement quality and readiness preparation. Mobility exercises must stay in pain-free ranges — never forced through pain. Hypermobile joints should not receive excessive passive stretching without concurrent stability training. No medical claims about joint health or injury prevention.`);
  }
  if (hasStrengthTags(chunks) && !ctx.includes("pain") && !ctx.includes("injur")) {
    lines.push(`SAFETY — strength: Never skip warm-up sets before heavy compound lifts. Technical failure on barbell lifts (squat, deadlift) is the real limit — do not push into form breakdown under heavy load. Avoid failure training on high-skill lifts. Deload regularly — training without planned recovery phases accumulates injury risk. Do not add load faster than technique can adapt.`);
  }
  if (hasTags(chunks, "beginner", "motor_learning") || /beginner|novice/.test(ctx)) {
    if (hasStrengthTags(chunks)) {
      lines.push(`SAFETY — beginner strength: Beginners must not train to failure on technical compound lifts. Always leave 2–3 reps in reserve. Reduce load before pushing through compromised form. Movement pattern quality is the non-negotiable safety variable at this stage.`);
    }
  }
  if (hasTags(chunks, "older_adults", "functional_strength") || (/older|senior/.test(ctx) && hasStrengthTags(chunks))) {
    lines.push(`SAFETY — older adult strength: Fall risk and controlled entry/exit from all positions must be evaluated. Do not program unsupported single-leg exercises without demonstrated balance. Controlled tempo mandatory. Monitor cardiovascular response — heavy efforts are not appropriate without medical clearance for sedentary older adults.`);
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

  if (hasStrengthTags(chunks)) {
    if (hasTags(chunks, "beginner", "motor_learning") || /beginner|novice/.test(ctx)) {
      contra.push("Failure training on technical compound lifts (squat, deadlift, overhead press) for beginners");
      contra.push("Advanced periodization schemes (conjugate, daily max effort) before consistent technique is established");
    }
    if (hasTags(chunks, "older_adults", "functional_strength") || /older|senior/.test(ctx)) {
      contra.push("High-impact exercises (box jumps, bounding) without established strength and coordination base for older adults");
      contra.push("Training to failure on barbell compound lifts for older adult beginners");
      contra.push("Heavy axial loading without established core stability and movement competency");
    }
  }
  if (ctx.includes("knee") || ctx.includes("patell")) {
    contra.push("Deep loaded squats below 90° if knee pain is present");
    contra.push("Leg extension machine in pain-provocative ranges");
    contra.push("Running or jumping until symptom-free at lower load");
    if (hasTags(chunks, "change_of_direction", "agility")) {
      contra.push("High-velocity reactive cutting until knee is symptom-free and deceleration strength is re-established");
    }
    if (hasStrengthTags(chunks)) {
      contra.push("High-bar back squat to full depth with knee pain — modify to box squat, goblet squat, or leg press");
    }
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
    if (hasTags(chunks, "sprint_mechanics", "speed", "acceleration")) {
      contra.push("Max-intent sprint work or hip-flexion-dominant acceleration drills until hip is symptom-free");
    }
  }
  if (ctx.includes("hamstring") || ctx.includes("posterior")) {
    if (hasSpeedTags(chunks)) {
      contra.push("Maximum-intensity sprint work with active hamstring pain or strain");
      contra.push("High-speed reactive drills until hamstring is cleared through graduated return-to-speed protocol");
    }
  }
  if (ctx.includes("ankle") && hasMobilityTags(chunks)) {
    contra.push("Aggressive loaded ankle dorsiflexion over acutely swollen or sprained ankle");
    contra.push("Banded ankle mobilization applied directly over acute ankle sprain");
  }
  if (ctx.includes("thoracic") && hasMobilityTags(chunks)) {
    contra.push("Aggressive thoracic extension exercises if osteoporosis, fracture risk, or disc pathology is present");
  }
  if (hasTags(chunks, "older_adult") || /older|senior/.test(ctx)) {
    contra.push("High-impact plyometrics without established landing competency");
    contra.push("Unassisted single-leg balance work on unstable surfaces without progression");
  }
  if (hasMobilityTags(chunks) && ctx.includes("hyper")) {
    contra.push("Extensive passive stretching in hypermobile joints without concurrent stability training");
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
