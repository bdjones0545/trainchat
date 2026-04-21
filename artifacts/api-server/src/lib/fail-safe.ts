import type { ExtractedConstraints } from "./intent";
import type { FocusMode } from "./focus-engines/engine-interface";

export type FailSafeCategory =
  | "long_horizon_request"
  | "excessive_frequency"
  | "conflicting_constraints"
  | "vague_request"
  | "ambiguous_focus"
  | "oversized_build_request"
  | "extreme_equipment_constraint"
  | "rapid_chained_edits"
  | "partial_program_state"
  | "unsupported_combination"
  | "state_mismatch_risk"
  | "no_visible_change_risk";

export type FailSafeStrategy =
  | "allow"
  | "simplify"
  | "cap_frequency"
  | "reduce_scope"
  | "redirect_focus"
  | "require_existing_program"
  | "block_and_explain"
  | "queue_edit"
  | "retryable_error";

export type FailSafeResolution = {
  triggered: boolean;
  categories: FailSafeCategory[];
  severity: "low" | "medium" | "high";
  strategy: FailSafeStrategy;
  notes?: string[];
  resultingScope?: string;
  defaultsApplied?: string[];
  userFacingMessage?: string;
};

export type RecentCommand = {
  content?: string | null;
  role?: string | null;
  createdAt?: Date | string | number | null;
};

export type ResolveFailSafeStateInput = {
  message: string;
  focusMode?: FocusMode | string | null;
  profile?: Record<string, unknown> | null;
  activeProgram?: Record<string, unknown> | null;
  recentCommands?: RecentCommand[];
  requestedFrequency?: number | null;
  requestedDuration?: number | null;
  action?: string | null;
  intentType?: string | null;
};

export const FAIL_SAFE_CATEGORIES: Array<{ id: FailSafeCategory; definition: string }> = [
  { id: "long_horizon_request", definition: "Requests for multi-week, multi-month, season, offseason, macrocycle, or 6+ week planning that should be reduced to a first block instead of fully materialized." },
  { id: "excessive_frequency", definition: "Requests for 6-7 training days per week, daily training, 2x/day training, or density beyond the default recovery envelope." },
  { id: "conflicting_constraints", definition: "Requests that combine contradictory adaptation, fatigue, impact, volume, time, safety, or equipment demands." },
  { id: "vague_request", definition: "Underspecified build or edit requests that need safe defaults instead of failure." },
  { id: "ambiguous_focus", definition: "Requests whose strongest intent belongs to a different focus lane than the currently selected Strength, Speed, or Mobility mode." },
  { id: "oversized_build_request", definition: "Requests likely to produce excessive output or token load, especially detailed long-horizon week-by-week builds." },
  { id: "extreme_equipment_constraint", definition: "Requests where available equipment or space cannot reasonably support the requested training type without simplification." },
  { id: "rapid_chained_edits", definition: "Multiple edit or mutation commands arriving close together while program state may still be updating." },
  { id: "partial_program_state", definition: "Edit, session, or block actions attempted without a complete saved program state." },
  { id: "unsupported_combination", definition: "Combinations that the current system should not execute directly, such as pain plus max effort or unsupported 2x/day structures." },
  { id: "state_mismatch_risk", definition: "Program state appears to belong to a different focus mode or stale context than the current request." },
  { id: "no_visible_change_risk", definition: "Soft edit requests that may not create an obvious visible program change unless upgraded or explained." },
];

const editLocks = new Map<string, number>();

function isEditAction(action?: string | null, intentType?: string | null, message = ""): boolean {
  const lower = message.toLowerCase();
  return action === "APPLY_MUTATION" ||
    intentType === "EDIT_PROGRAM" ||
    intentType === "ADJUST_FOR_PAIN" ||
    intentType === "ADJUST_FOR_READINESS" ||
    /\b(edit|adjust|change|swap|replace|remove|add|increase|decrease|reduce|make it|lower|more|less|refocus|deload)\b/.test(lower);
}

function normalizeFocus(focus?: FocusMode | string | null): FocusMode {
  return focus === "speed" || focus === "mobility" || focus === "strength" ? focus : "strength";
}

function inferRequestedFocus(message: string): FocusMode | null {
  const lower = message.toLowerCase();
  const mobility = /\b(mobility|flexibility|range of motion|rom|hips?|shoulders?|ankles?|thoracic|stretch|stiff|cars?|pails?|rails?)\b/.test(lower);
  const speed = /\b(speed|sprint|acceleration|deceleration|agility|footwork|quickness|change of direction|plyometric|reactive)\b/.test(lower);
  const strength = /\b(strength|stronger|squat|bench|deadlift|hypertrophy|muscle|arms?|powerlifting|max effort)\b/.test(lower);
  if (mobility && !speed && !strength) return "mobility";
  if (speed && !mobility && !strength) return "speed";
  if (strength && !mobility && !speed) return "strength";
  return null;
}

function deriveFrequency(message: string, requestedFrequency?: number | null): number | null {
  if (requestedFrequency) return requestedFrequency;
  const lower = message.toLowerCase();
  if (/\b(daily|every day|7\s*days?)\b/.test(lower)) return 7;
  const match = lower.match(/\b([1-7])\s*(?:x|times?|days?|sessions?)\s*(?:a|per)?\s*week\b/);
  if (match) return Number(match[1]);
  return null;
}

function recentEditBurst(recentCommands: RecentCommand[] | undefined): boolean {
  if (!recentCommands || recentCommands.length < 2) return false;
  const now = Date.now();
  const recentEdits = recentCommands.filter((cmd) => {
    if (!cmd.content || cmd.role === "assistant") return false;
    const time = cmd.createdAt ? new Date(cmd.createdAt).getTime() : now;
    return Number.isFinite(time) && now - time <= 15_000 && isEditAction(null, null, cmd.content);
  });
  return recentEdits.length >= 2;
}

function hasUsableProgram(activeProgram?: Record<string, unknown> | null): boolean {
  if (!activeProgram) return false;
  if (Array.isArray((activeProgram as any).days)) return (activeProgram as any).days.length > 0;
  if (Array.isArray((activeProgram as any).phases)) return (activeProgram as any).phases.length > 0;
  if ((activeProgram as any).id) return true;
  return false;
}

function programFocus(activeProgram?: Record<string, unknown> | null): string | null {
  const meta = (activeProgram as any)?.metadata;
  return (meta?.focusMode ?? (activeProgram as any)?.focusMode ?? null) as string | null;
}

function chooseStrategy(categories: FailSafeCategory[]): FailSafeStrategy {
  if (categories.includes("rapid_chained_edits")) return "queue_edit";
  if (categories.includes("partial_program_state")) return "require_existing_program";
  if (categories.includes("state_mismatch_risk")) return "block_and_explain";
  if (categories.includes("ambiguous_focus")) return "redirect_focus";
  if (categories.includes("excessive_frequency")) return "cap_frequency";
  if (categories.includes("long_horizon_request") || categories.includes("oversized_build_request")) return "reduce_scope";
  if (categories.includes("conflicting_constraints") || categories.includes("unsupported_combination") || categories.includes("extreme_equipment_constraint")) return "simplify";
  if (categories.includes("vague_request") || categories.includes("no_visible_change_risk")) return "simplify";
  return "allow";
}

function chooseSeverity(categories: FailSafeCategory[]): "low" | "medium" | "high" {
  if (categories.some((c) => c === "partial_program_state" || c === "state_mismatch_risk" || c === "unsupported_combination" || c === "rapid_chained_edits")) return "high";
  if (categories.some((c) => c === "long_horizon_request" || c === "excessive_frequency" || c === "conflicting_constraints" || c === "oversized_build_request" || c === "ambiguous_focus")) return "medium";
  return categories.length > 0 ? "low" : "low";
}

export function resolveFailSafeState(input: ResolveFailSafeStateInput): FailSafeResolution {
  const message = input.message.trim();
  const lower = message.toLowerCase();
  const focusMode = normalizeFocus(input.focusMode);
  const categories: FailSafeCategory[] = [];
  const notes: string[] = [];
  const defaultsApplied: string[] = [];
  const frequency = deriveFrequency(message, input.requestedFrequency);
  const requestedFocus = inferRequestedFocus(message);
  const editAction = isEditAction(input.action, input.intentType, message);
  const buildAction = input.intentType === "CREATE_PROGRAM" || input.intentType === "START_NEW_PROGRAM" || input.action === "REBUILD_PROGRAM" || /\b(build|create|make me|give me|program|plan|routine)\b/.test(lower);

  if (/\b(?:multi[\s-]?week|multi[\s-]?month|season|offseason|off-season|macrocycle|mesocycle|(?:[6-9]|1[0-9]|[2-9][0-9])\s*week|(?:2|3|4|5|6|7|8|9|10|11|12)\s*month)\b/.test(lower)) {
    categories.push("long_horizon_request");
    notes.push("Long horizon reduced to an initial block.");
  }

  if ((frequency ?? 0) >= 6 || /\b(?:2x|two times|twice)\s*(?:a\s*)?day\b/.test(lower)) {
    categories.push("excessive_frequency");
    notes.push("Training density capped for recovery.");
  }

  const highIntensity = /\b(high intensity|max effort|heavy|hard|all out|intense)\b/.test(lower);
  const lowImpact = /\b(low impact|joint friendly|no impact|easy on joints)\b/.test(lower);
  const highVolume = /\b(high volume|tons of volume|lots of sets|every day)\b/.test(lower);
  const lowFatigue = /\b(low fatigue|minimal fatigue|no soreness|recoverable)\b/.test(lower);
  const goalCount = [/\bstrength\b/.test(lower), /\bspeed|acceleration|agility\b/.test(lower), /\bmobility|flexibility|rom\b/.test(lower), /\bhypertrophy|muscle|size\b/.test(lower)].filter(Boolean).length;
  if ((highIntensity && lowImpact && (highVolume || lowFatigue)) || goalCount >= 3 || /\bpain\b/.test(lower) && /\b(max effort|no regressions?|heavy)\b/.test(lower)) {
    categories.push("conflicting_constraints");
    notes.push("Conflicting demands simplified by safety, feasibility, clarity, then optimization.");
  }

  if (/^(build me something|build me a program|make me something|make it better|i need something|help me train|program please|give me a plan)$/i.test(message)) {
    categories.push("vague_request");
    defaultsApplied.push("3 days/week", "moderate volume", `${focusMode} focus`, "general performance bias");
  }

  if (requestedFocus && requestedFocus !== focusMode) {
    categories.push("ambiguous_focus");
    notes.push(`Request appears better suited to ${requestedFocus} while current focus is ${focusMode}.`);
  }

  if (message.length > 700 || /\b(?:each week|every week|week by week|all weeks|full schedule|full calendar|every session|every workout)\b/.test(lower) && categories.includes("long_horizon_request")) {
    categories.push("oversized_build_request");
    notes.push("Output scope compacted before generation.");
  }

  if ((/\b(no equipment|bodyweight only|no space|small apartment|hotel room)\b/.test(lower) && /\b(full sprint|sprint plan|max speed|barbell|rack|heavy)\b/.test(lower)) || (/\bhome gym\b/.test(lower) && /\bfull sprint|track sprint|flying sprint\b/.test(lower))) {
    categories.push("extreme_equipment_constraint");
    notes.push("Equipment or space constraint requires exercise substitutions.");
  }

  if (editAction && recentEditBurst(input.recentCommands)) {
    categories.push("rapid_chained_edits");
    notes.push("Edit queue protected from overlapping mutations.");
  }

  if (editAction && !hasUsableProgram(input.activeProgram)) {
    categories.push("partial_program_state");
    notes.push("Mutation requires a saved program state.");
  }

  if (/\b(?:2x|two times|twice)\s*(?:a\s*)?day\b/.test(lower) || /\bpain\b/.test(lower) && /\b(max effort|no regressions?|all out)\b/.test(lower)) {
    categories.push("unsupported_combination");
    notes.push("Unsupported combination routed to safer coaching structure.");
  }

  const activeFocus = programFocus(input.activeProgram);
  if (activeFocus && activeFocus !== focusMode) {
    categories.push("state_mismatch_risk");
    notes.push(`Active program focus ${activeFocus} does not match requested focus ${focusMode}.`);
  }

  if (editAction && /\b(more explosive|lower impact|more recovery|more hip focus|hip focus|more athletic|make it better|cleaner)\b/.test(lower)) {
    categories.push("no_visible_change_risk");
    notes.push("Soft edit needs a visible structural change or explicit Coach Insight.");
  }

  const uniqueCategories = Array.from(new Set(categories));
  const strategy = chooseStrategy(uniqueCategories);
  const severity = chooseSeverity(uniqueCategories);

  return {
    triggered: uniqueCategories.length > 0,
    categories: uniqueCategories,
    severity,
    strategy,
    notes: notes.length ? notes : undefined,
    resultingScope: buildAction && (uniqueCategories.includes("long_horizon_request") || uniqueCategories.includes("oversized_build_request")) ? "initial_block_3_day_program" : undefined,
    defaultsApplied: defaultsApplied.length ? defaultsApplied : undefined,
    userFacingMessage: buildFailSafeUserMessage({ triggered: uniqueCategories.length > 0, categories: uniqueCategories, severity, strategy }),
  };
}

export function applyFailSafeConstraints(constraints: ExtractedConstraints | null, resolution: FailSafeResolution): ExtractedConstraints | null {
  if (!constraints || !resolution.triggered) return constraints;
  const next = { ...constraints };
  if (resolution.categories.includes("excessive_frequency") && (next.daysPerWeek ?? 0) > 5) next.daysPerWeek = 5;
  if (resolution.categories.includes("long_horizon_request") && !next.daysPerWeek) next.daysPerWeek = 3;
  if (resolution.categories.includes("vague_request") && !next.daysPerWeek) next.daysPerWeek = 3;
  if (resolution.categories.includes("conflicting_constraints") && (next.daysPerWeek ?? 0) > 5) next.daysPerWeek = 4;
  return next;
}

export function buildFailSafePromptSection(resolution: FailSafeResolution): string | null {
  if (!resolution.triggered || resolution.strategy === "allow") return null;
  return [
    "## FAIL-SAFE RULES LAYER ACTIVE",
    `Categories: ${resolution.categories.join(", ")}`,
    `Strategy: ${resolution.strategy}`,
    "Apply this intervention before generating or mutating:",
    "- Prioritize safety, feasibility, clarity, then optimization.",
    "- If long-horizon planning was requested, build only the first safe block or a 3-day starting program and store the longer horizon as metadata.",
    "- If frequency is excessive, cap to a recoverable weekly structure rather than generating an oversized schedule.",
    "- If constraints conflict, preserve the strongest safe intent and downgrade secondary demands.",
    "- If the request is vague, use safe defaults: 3 days/week, moderate volume, current focus mode, and general performance bias.",
    "- If the edit may create no visible change, make the change visible in exercises, volume, session emphasis, or explain the change clearly in Coach Insight.",
  ].join("\n");
}

export function buildFailSafeUserMessage(resolution: Pick<FailSafeResolution, "triggered" | "categories" | "strategy" | "severity">): string | undefined {
  if (!resolution.triggered) return undefined;
  if (resolution.categories.includes("long_horizon_request")) return "I built the first phase around that longer goal so you can start cleanly and progress forward from there.";
  if (resolution.categories.includes("excessive_frequency")) return "I tightened this to a more recoverable weekly structure so the work stays high quality.";
  if (resolution.categories.includes("conflicting_constraints")) return "I prioritized the parts that can coexist cleanly and simplified the rest so the program stays effective.";
  if (resolution.categories.includes("ambiguous_focus")) return "That request fits a different training focus. Switch focus modes and I’ll build it with the right engine.";
  if (resolution.categories.includes("partial_program_state")) return "I need a saved program before I can apply that change. Build or restore a program first, then I can edit it cleanly.";
  if (resolution.categories.includes("rapid_chained_edits")) return "Updating your program now. Send the next change after this one finishes so the edits land in order.";
  if (resolution.categories.includes("vague_request")) return "I used safe defaults: 3 days per week, moderate volume, and the current training focus.";
  if (resolution.categories.includes("no_visible_change_risk")) return "I made that adjustment visible in the program structure so the change is easy to verify.";
  return "I simplified the request so the program stays coherent and recoverable.";
}

export function attachFailSafeMetadata<T extends Record<string, any>>(data: T | null | undefined, resolution: FailSafeResolution): T | null | undefined {
  if (!data || !resolution.triggered) return data;
  data._failSafe = {
    categories: resolution.categories,
    severity: resolution.severity,
    strategy: resolution.strategy,
    resultingScope: resolution.resultingScope ?? null,
    defaultsApplied: resolution.defaultsApplied ?? [],
    longTermHorizon: resolution.categories.includes("long_horizon_request"),
  };
  return data;
}

export function prependFailSafeMessage(content: string, resolution: FailSafeResolution): string {
  const message = buildFailSafeUserMessage(resolution);
  if (!message || content.includes(message)) return content;
  return `${message}\n\n${content}`;
}

export function logFailSafeAudit(logger: { info: (obj: unknown, msg?: string) => void }, input: ResolveFailSafeStateInput, resolution: FailSafeResolution): void {
  logger.info(
    {
      focusMode: normalizeFocus(input.focusMode),
      userMessage: input.message.slice(0, 300),
      triggered: resolution.triggered,
      categories: resolution.categories,
      severity: resolution.severity,
      strategy: resolution.strategy,
      resultingScope: resolution.resultingScope ?? null,
      defaultsApplied: resolution.defaultsApplied ?? [],
      userFacingMessage: resolution.userFacingMessage ?? null,
    },
    "[FailSafeAudit]"
  );
}

export function acquireFailSafeEditLock(key: string, ttlMs = 20_000): { acquired: boolean; release: () => void } {
  const now = Date.now();
  const existing = editLocks.get(key);
  if (existing && existing > now) {
    return { acquired: false, release: () => {} };
  }
  const expiresAt = now + ttlMs;
  editLocks.set(key, expiresAt);
  const timer = setTimeout(() => {
    if (editLocks.get(key) === expiresAt) editLocks.delete(key);
  }, ttlMs);
  return {
    acquired: true,
    release: () => {
      clearTimeout(timer);
      if (editLocks.get(key) === expiresAt) editLocks.delete(key);
    },
  };
}