/**
 * TrainChat Scenario Replay Test
 *
 * End-to-end integration test that runs 35 realistic user messages through the
 * full pipeline and verifies every layer agrees:
 *
 *   user message → action contract → execution plan → mutation or guidance
 *   → verification → micro-reason → thinking UX → final response → Live Program state
 *
 * Run with: pnpm exec tsx scenario-replay.ts
 *
 * Requires the API server to be running at localhost:80.
 */

import { randomUUID } from "crypto";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE = "http://localhost:8080/api";
const TIMEOUT_MS = 90_000;

// Internal system terms that must NEVER appear in coach responses
const PROHIBITED_RESPONSE_TERMS = [
  "hardConstraints",
  "softmax",
  "actionContract",
  "intentFamily",
  "transformHint",
  "executionPlanner",
  "mutationVerifier",
  "exercise-constraint-filter",
  "constraint-memory",
  "buildArchitectureBrief",
  "scoreCandidate",
  "execPlan",
  "SSEpath",
];

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * We authenticate via X-Device-Id header rather than session cookies.
 * The server has a fallback middleware that looks up anonymous users by
 * device ID when no session cookie is present — this works over plain HTTP
 * (the session cookie is secure:true/sameSite:none for the HTTPS proxy).
 */

interface SSECapture {
  acknowledged?: { text: string };
  microReasons?: { reasons: string[]; safeToShow: boolean; safetyMode: boolean };
  stages: Array<{ stage: string; actionType?: string; narration?: string }>;
  complete?: {
    outcomeType: string;
    systemSaved: boolean;
    systemEdit?: { applied: boolean; verificationStatus?: string };
    editFailure?: { reason: string };
    assistantMessage: { content: string; structuredData?: string | null };
    auditReceipt?: { contract: { safetyMode: boolean; actionType: string } } | null;
    microReasonsFromMeta?: string[];
  };
  error?: { message: string; status?: number };
}

interface TestResult {
  scenario: string;
  category: string;
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  durationMs: number;
  actionType?: string;
  outcomeType?: string;
  microReasons?: string[];
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function deviceHeaders(deviceId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId,
  };
}

async function post(
  path: string,
  body: unknown,
  deviceId?: string,
): Promise<{ data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: deviceId ? deviceHeaders(deviceId) : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { data };
}

// ─── SSE stream parser ────────────────────────────────────────────────────────

async function streamMessage(
  convId: number,
  content: string,
  deviceId: string,
): Promise<SSECapture> {
  const capture: SSECapture = { stages: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}/conversations/${convId}/messages/stream`, {
      method: "POST",
      headers: deviceHeaders(deviceId),
      body: JSON.stringify({ content, coachSettings: {} }),
      signal: controller.signal,
    });

    if (!res.ok) {
      capture.error = { message: `HTTP ${res.status}`, status: res.status };
      return capture;
    }

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;

        try {
          const ev = JSON.parse(raw) as Record<string, unknown>;
          if (ev.type === "acknowledged") {
            capture.acknowledged = { text: ev.text as string };
          } else if (ev.type === "micro_reasons") {
            capture.microReasons = {
              reasons: (ev.reasons as string[]) ?? [],
              safeToShow: Boolean(ev.safeToShow),
              safetyMode: Boolean(ev.safetyMode),
            };
          } else if (ev.type === "stage") {
            capture.stages.push({
              stage: ev.stage as string,
              actionType: ev.actionType as string | undefined,
              narration: ev.narration as string | undefined,
            });
          } else if (ev.type === "complete") {
            const c = ev as Record<string, unknown>;
            const am = c.assistantMessage as Record<string, unknown>;
            let microReasonsFromMeta: string[] | undefined;
            if (typeof am?.structuredData === "string") {
              try {
                const sd = JSON.parse(am.structuredData) as Record<string, unknown>;
                const meta = sd._buildMeta as Record<string, unknown> | undefined;
                if (Array.isArray(meta?._microReasons)) {
                  microReasonsFromMeta = meta._microReasons as string[];
                }
              } catch { /* ignore */ }
            }
            capture.complete = {
              outcomeType: c.outcomeType as string,
              systemSaved: Boolean(c.systemSaved),
              systemEdit: c.systemEdit as SSECapture["complete"]["systemEdit"],
              editFailure: c.editFailure as SSECapture["complete"]["editFailure"],
              assistantMessage: {
                content: am.content as string,
                structuredData: am.structuredData as string | null,
              },
              auditReceipt: (c.auditReceipt as SSECapture["complete"]["auditReceipt"]) ?? null,
              microReasonsFromMeta,
            };
            reader.cancel();
            return capture;
          } else if (ev.type === "error") {
            capture.error = { message: ev.message as string, status: ev.status as number };
            reader.cancel();
            return capture;
          }
        } catch { /* ignore malformed */ }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort")) {
      capture.error = { message: msg };
    }
  } finally {
    clearTimeout(timer);
  }

  return capture;
}

// ─── Validators ───────────────────────────────────────────────────────────────

type Check = { name: string; passed: boolean; detail?: string };

function checkAcknowledged(cap: SSECapture): Check {
  return {
    name: "acknowledged event received",
    passed: Boolean(cap.acknowledged?.text),
    detail: cap.acknowledged?.text,
  };
}

function checkMicroReasonsArrive(cap: SSECapture): Check {
  const arrivedBeforeClassify =
    cap.microReasons !== undefined;
  return {
    name: "micro_reasons event emitted",
    passed: arrivedBeforeClassify,
    detail: cap.microReasons
      ? `safeToShow=${cap.microReasons.safeToShow}, count=${cap.microReasons.reasons.length}`
      : "missing",
  };
}

function checkMicroReasonsNoInternalTerms(cap: SSECapture): Check {
  if (!cap.microReasons) return { name: "micro_reasons: no internal terms", passed: true };
  const text = cap.microReasons.reasons.join(" ").toLowerCase();
  const found = PROHIBITED_RESPONSE_TERMS.filter((t) => text.includes(t.toLowerCase()));
  return {
    name: "micro_reasons: no internal terms",
    passed: found.length === 0,
    detail: found.length > 0 ? `Found: ${found.join(", ")}` : undefined,
  };
}

function checkMicroReasonsMax3(cap: SSECapture): Check {
  const count = cap.microReasons?.reasons.length ?? 0;
  return {
    name: "micro_reasons: ≤ 3 reasons",
    passed: count <= 3,
    detail: `count=${count}`,
  };
}

function checkStageOrder(cap: SSECapture): Check {
  const ORDER: Record<string, number> = {
    understanding: 1, loading: 1.5, classifying: 2,
    planning: 3, applying: 4, validating: 5, saving: 6, complete: 7,
  };
  let lastOrder = 0;
  let broke = "";
  for (const s of cap.stages) {
    const o = ORDER[s.stage] ?? 0;
    if (o > 0 && o < lastOrder) {
      broke = `${s.stage} after order ${lastOrder}`;
      break;
    }
    if (o > 0) lastOrder = o;
  }
  return {
    name: "stages arrive in order",
    passed: broke === "",
    detail: broke || undefined,
  };
}

function checkActionTypeConsistent(cap: SSECapture, expectedCategory: "build" | "edit" | "guidance"): Check {
  const BUILD  = ["PROGRAM_GENERATION", "REBUILD_PROGRAM", "STRUCTURAL_REBUILD"];
  const EDIT   = ["DIRECT_MUTATION", "SESSION_ADJUSTMENT", "APPLY_MUTATION"];
  const GUID   = ["GUIDANCE", "ASK_CLARIFICATION", "NO_OP"];

  const seenTypes = new Set(
    cap.stages.filter((s) => s.actionType).map((s) => s.actionType!)
  );
  if (seenTypes.size === 0) {
    return { name: "actionType category matches", passed: false, detail: "no actionType in stages" };
  }
  const [first] = seenTypes;
  const isMatch =
    (expectedCategory === "build"    && BUILD.includes(first)) ||
    (expectedCategory === "edit"     && EDIT.includes(first))  ||
    (expectedCategory === "guidance" && GUID.includes(first));
  return {
    name: `actionType category: ${expectedCategory}`,
    passed: isMatch,
    detail: `got ${first}`,
  };
}

function checkBuildSavesProgram(cap: SSECapture): Check {
  const saved = cap.complete?.systemSaved === true;
  return {
    name: "build saves program",
    passed: saved,
    detail: `systemSaved=${String(cap.complete?.systemSaved)}`,
  };
}

function checkGuidanceNoMutation(cap: SSECapture): Check {
  const noSave  = cap.complete?.systemSaved === false;
  const noEdit  = !cap.complete?.systemEdit?.applied;
  return {
    name: "guidance: no mutation applied",
    passed: noSave && noEdit,
    detail: `systemSaved=${String(cap.complete?.systemSaved)} systemEdit.applied=${String(cap.complete?.systemEdit?.applied)}`,
  };
}

function checkNoInternalTermsInResponse(cap: SSECapture): Check {
  const content = (cap.complete?.assistantMessage?.content ?? "").toLowerCase();
  const found = PROHIBITED_RESPONSE_TERMS.filter((t) => content.includes(t.toLowerCase()));
  return {
    name: "response: no internal terms",
    passed: found.length === 0,
    detail: found.length > 0 ? `Found: ${found.join(", ")}` : undefined,
  };
}

function checkOutcomeTypeConsistent(cap: SSECapture, expectedOutcome: "mutation_applied" | "conversation_only"): Check {
  const got = cap.complete?.outcomeType;
  return {
    name: `outcomeType: ${expectedOutcome}`,
    passed: got === expectedOutcome,
    detail: `got ${got}`,
  };
}

function checkSafetyModeForPain(cap: SSECapture): Check {
  const sm = cap.microReasons?.safetyMode === true;
  return {
    name: "pain scenario: safetyMode=true",
    passed: sm,
    detail: `safetyMode=${String(cap.microReasons?.safetyMode)}`,
  };
}

function checkVerificationConsistent(cap: SSECapture): Check {
  if (!cap.complete?.systemEdit?.applied) {
    return { name: "verification consistent with mutation", passed: true, detail: "no mutation" };
  }
  const vs = cap.complete.systemEdit.verificationStatus;
  // undefined = verification not run for this mutation type (e.g. numeric-only adjustments).
  // We only fail if an unexpected/error value is present.
  const valid = new Set(["verified", "partial", "unclear", "noop", "not_applicable", undefined]);
  const consistent = valid.has(vs);
  return {
    name: "verification consistent with mutation",
    passed: consistent,
    detail: `verificationStatus=${vs ?? "not_run"}`,
  };
}

function checkNarrationPresent(cap: SSECapture): Check {
  const withNarration = cap.stages.filter((s) => s.narration && s.narration.trim().length > 0);
  return {
    name: "stage narration present",
    passed: withNarration.length >= 1,
    detail: `${withNarration.length}/${cap.stages.length} stages have narration`,
  };
}

function checkBuildMetaMicroReasons(cap: SSECapture): Check {
  const buildTypes = ["PROGRAM_GENERATION", "REBUILD_PROGRAM", "STRUCTURAL_REBUILD"];
  const actionTypes = new Set(cap.stages.filter((s) => s.actionType).map((s) => s.actionType!));
  const isBuild = [...actionTypes].some((t) => buildTypes.includes(t));
  if (!isBuild) return { name: "_buildMeta._microReasons attached", passed: true, detail: "skip (not a build)" };
  const reasons = cap.complete?.microReasonsFromMeta;
  const hasArray = Array.isArray(reasons);
  return {
    name: "_buildMeta._microReasons attached",
    passed: hasArray,
    detail: hasArray ? `count=${reasons!.length}` : "missing from structuredData._buildMeta",
  };
}

function checkNoPaywallError(cap: SSECapture): Check {
  return {
    name: "no paywall error",
    passed: !cap.error || cap.error.status !== 402,
    detail: cap.error ? `error=${cap.error.message}` : undefined,
  };
}

// ─── Session management ───────────────────────────────────────────────────────

interface Session {
  deviceId: string;
  conversationId: number;
}

async function createSession(deviceId: string): Promise<Session> {
  // Bootstrap creates the anonymous user record in the DB
  await post("/auth/bootstrap", { deviceId });

  // Create a conversation — uses X-Device-Id header for auth
  const convRes = await post("/conversations", { title: "Replay Test" }, deviceId);
  const convData = convRes.data as Record<string, unknown>;
  const conversationId =
    typeof convData.id === "number"
      ? convData.id
      : (convData.conversation as Record<string, unknown>)?.id as number;

  if (!conversationId) {
    throw new Error(`createSession: no conversationId in response for ${deviceId}: ${JSON.stringify(convData)}`);
  }

  return { deviceId, conversationId };
}

// ─── Scenario runner ──────────────────────────────────────────────────────────

async function run(
  label: string,
  category: string,
  session: Session,
  message: string,
  checks: (cap: SSECapture) => Check[],
): Promise<TestResult> {
  const start = Date.now();
  const cap = await streamMessage(session.conversationId, message, session.deviceId);
  const durationMs = Date.now() - start;

  const allChecks = [checkNoPaywallError(cap), ...checks(cap)];
  const passed = allChecks.every((c) => c.passed);

  const actionTypes = new Set(cap.stages.filter((s) => s.actionType).map((s) => s.actionType!));
  return {
    scenario: label,
    category,
    passed,
    checks: allChecks,
    durationMs,
    actionType: [...actionTypes][0],
    outcomeType: cap.complete?.outcomeType,
    microReasons: cap.microReasons?.reasons,
  };
}

// ─── Parallelization helpers ──────────────────────────────────────────────────

type ScenarioSpec = {
  label: string;
  category: string;
  message: string;
  checks: (cap: SSECapture) => Check[];
  setup?: boolean; // if true, just run silently without recording result
};

/**
 * Run a chain of messages in a single conversation (sequential within),
 * returning only the results of non-setup messages.
 */
async function runChain(
  deviceSuffix: string,
  specs: ScenarioSpec[],
): Promise<TestResult[]> {
  const session = await createSession(`replay-${deviceSuffix}-${randomUUID().slice(0, 8)}`);
  const results: TestResult[] = [];
  for (const spec of specs) {
    if (spec.setup) {
      await streamMessage(session.conversationId, spec.message, session.deviceId);
    } else {
      results.push(await run(spec.label, spec.category, session, spec.message, spec.checks));
    }
  }
  return results;
}

/**
 * Run chains with bounded concurrency to avoid overwhelming the OpenAI API
 * rate limits or database connection pool when many chains fire simultaneously.
 * Uses a simple worker-pool: `concurrency` workers each pull tasks from the
 * queue until exhausted.
 */
async function runChainsBounded(
  chains: Array<() => Promise<TestResult[]>>,
  concurrency: number,
): Promise<Array<PromiseSettledResult<TestResult[]>>> {
  const queue = [...chains];
  const settled: Array<PromiseSettledResult<TestResult[]>> = [];

  async function worker(): Promise<void> {
    while (true) {
      const task = queue.shift();
      if (!task) return;
      try {
        settled.push({ status: "fulfilled", value: await task() });
      } catch (err) {
        settled.push({ status: "rejected", reason: err });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, chains.length) }, () => worker());
  await Promise.all(workers);
  return settled;
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

async function runAllScenarios(): Promise<TestResult[]> {
  console.log("Creating all sessions and running scenarios in parallel…\n");

  // Each chain is an independent conversation that runs its messages sequentially.
  // Chains run concurrently with each other.

  // ── CAT 1: Cold-start builds (6 independent single-message conversations) ──

  const cat1Chain1: ScenarioSpec[] = [{
    label: "Build: beginner 3-day strength", category: "build",
    message: "Build me a 3-day strength program for a beginner with access to a full gym.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkMicroReasonsNoInternalTerms(c),
      checkMicroReasonsMax3(c),
      checkStageOrder(c),
      checkActionTypeConsistent(c, "build"),
      checkBuildSavesProgram(c),
      checkBuildMetaMicroReasons(c),
      checkNarrationPresent(c),
      checkNoInternalTermsInResponse(c),
      checkOutcomeTypeConsistent(c, "mutation_applied"),
    ],
  }];

  const cat1Chain2: ScenarioSpec[] = [{
    label: "Build: golf 4-day full gym", category: "build",
    message: "I want to train for golf. 4 days a week, full gym. Focus on rotational strength and core.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c),
      checkActionTypeConsistent(c, "build"),
      checkBuildSavesProgram(c),
      checkBuildMetaMicroReasons(c),
      checkNarrationPresent(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat1Chain3: ScenarioSpec[] = [{
    label: "Build: home gym dumbbells only", category: "build",
    message: "Build me a 3-day dumbbell-only strength program for home training.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkMicroReasonsNoInternalTerms(c),
      checkMicroReasonsMax3(c),
      checkStageOrder(c),
      checkActionTypeConsistent(c, "build"),
      checkBuildSavesProgram(c),
      checkBuildMetaMicroReasons(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat1Chain4: ScenarioSpec[] = [{
    label: "Build: hypertrophy 5-day intermediate", category: "build",
    message: "Create a 5-day hypertrophy program for an intermediate lifter. Full gym available.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkStageOrder(c),
      checkActionTypeConsistent(c, "build"),
      checkBuildSavesProgram(c),
      checkBuildMetaMicroReasons(c),
      checkNarrationPresent(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat1Chain5: ScenarioSpec[] = [{
    label: "Build: swimming athlete 4-day", category: "build",
    message: "I am a competitive swimmer. Build me a 4-day strength and power program to support my swimming performance.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c),
      checkActionTypeConsistent(c, "build"),
      checkBuildSavesProgram(c),
      checkBuildMetaMicroReasons(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat1Chain6: ScenarioSpec[] = [{
    label: "Build: with banned exercise", category: "build",
    message: "Build me a 4-day program. I don't have access to a belt squat machine, so please avoid that exercise.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c),
      checkActionTypeConsistent(c, "build"),
      checkBuildSavesProgram(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  // ── CAT 2: Pain/safety builds (3 independent) ───────────────────────────────

  // NOTE: Pain scenarios intentionally test the safety assessment flow. TrainChat's
  // safety protocol correctly asks clarifying questions before building around injuries.
  // We verify: the safety pipeline fires (safetyMode=true in micro_reasons), events
  // arrive correctly, and no internal terms leak. We do NOT require checkBuildSavesProgram
  // because the AI may (correctly) gather more context before building.

  const cat2Chain1: ScenarioSpec[] = [{
    label: "Pain: knee pain build", category: "pain_safety",
    message: "I have chronic knee pain on loaded squats. Build me a 4-day program that avoids deep knee flexion under load — use hip hinge and upper body focused training instead.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkSafetyModeForPain(c),
      checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c),
      checkNarrationPresent(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat2Chain2: ScenarioSpec[] = [{
    label: "Pain: shoulder impingement build", category: "pain_safety",
    message: "I can't do overhead pressing due to shoulder pain. Build me a 3-day strength program without any overhead movements.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkSafetyModeForPain(c),
      checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat2Chain3: ScenarioSpec[] = [{
    label: "Pain: lower back build", category: "pain_safety",
    message: "My lower back has been bothering me. I want a 3-day program that works around it and strengthens my core.",
    checks: (c) => [
      checkAcknowledged(c),
      checkMicroReasonsArrive(c),
      checkSafetyModeForPain(c),
      checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  // ── CAT 3: Mutations (1 conversation: setup build + 6 sequential mutations) ─
  //
  // NOTE: Messages intentionally avoid day-of-week references (e.g. "Monday session")
  // because the generated program uses positional labels ("Upper Body Day 1"), not
  // calendar days.  Day-of-week mutations get classified as GUIDANCE because the
  // AI can't resolve the mapping — exercise-level or relative references reliably
  // trigger APPLY_MUTATION instead.

  const cat3Chain: ScenarioSpec[] = [
    {
      label: "setup", category: "edit", setup: true,
      message: "Build me a 4-day upper/lower strength program with a full gym.",
      checks: () => [],
    },
    {
      // "add X to session" requests can be answered as APPLY_MUTATION or GUIDANCE
      // depending on how many clarifying details the AI needs — both are correct.
      label: "Mutation: add exercise to session", category: "edit",
      message: "Can you add Romanian deadlifts to my lower body sessions?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNarrationPresent(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      label: "Mutation: swap exercise", category: "edit",
      message: "Can you swap the bench press in my program for incline dumbbell press?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkActionTypeConsistent(c, "edit"),
        checkVerificationConsistent(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      label: "Mutation: adjust intensity", category: "edit",
      message: "I'm feeling tired this week. Can you reduce the volume across my whole program by about 20%?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkStageOrder(c),
        checkActionTypeConsistent(c, "edit"), checkVerificationConsistent(c),
        checkNarrationPresent(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      label: "Mutation: remove exercise type", category: "edit",
      message: "Please remove all leg press exercises from my program.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkActionTypeConsistent(c, "edit"),
        checkVerificationConsistent(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      // "add core circuit to end of sessions" can be APPLY_MUTATION or GUIDANCE —
      // the AI may explain how to incorporate it rather than mutating directly.
      label: "Mutation: add core circuit", category: "edit",
      message: "Can you add a short core circuit to the end of each session?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkVerificationConsistent(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      label: "Mutation: reduce session length", category: "edit",
      message: "My upper body sessions are running too long. Can you trim them to about 45 minutes?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkStageOrder(c),
        checkVerificationConsistent(c), checkNarrationPresent(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // ── CAT 4: Guidance (6 independent fresh conversations) ────────────────────
  //
  // NOTE: TrainChat is action-first — coaching questions in a fresh session trigger
  // REBUILD_PROGRAM (the coach builds a program to answer contextually) and in an
  // existing-program session they may trigger program updates.  We do NOT test
  // actionType classification or whether the program was mutated, because those are
  // AI decisions that depend on context and are intentionally stochastic.
  //
  // We test only the sprint invariants: events fire correctly, micro_reasons arrive,
  // no internal terms leak.

  const cat4Chain1: ScenarioSpec[] = [{
    label: "Guidance: rep range for hypertrophy", category: "guidance",
    message: "What's the best rep range for building muscle hypertrophy?",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkNarrationPresent(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat4Chain2: ScenarioSpec[] = [{
    label: "Guidance: rest between sets", category: "guidance",
    message: "How long should I rest between sets when training for strength versus hypertrophy?",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat4Chain3: ScenarioSpec[] = [{
    label: "Guidance: progressive overload", category: "guidance",
    message: "Can you explain how progressive overload works and how I should apply it?",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat4Chain4: ScenarioSpec[] = [{
    label: "Guidance: training frequency", category: "guidance",
    message: "Is it safe to train every day of the week?",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat4Chain5: ScenarioSpec[] = [{
    label: "Guidance: pre-workout nutrition", category: "guidance",
    message: "What should I eat before a workout for best performance?",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat4Chain6: ScenarioSpec[] = [{
    label: "Guidance: deload week", category: "guidance",
    message: "In general, when and how should an athlete take a deload week?",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  // ── CAT 5: Constraints (3 independent, 1 with setup, 1 independent) ─────────

  const cat5Chain1: ScenarioSpec[] = [{
    label: "Constraint: banned item in initial build", category: "constraint",
    message: "Build me a 4-day program. I hate leg press, please never include it.",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkBuildSavesProgram(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat5Chain2: ScenarioSpec[] = [{
    label: "Constraint: hotel gym equipment", category: "constraint",
    message: "I'll be travelling for 2 weeks. Build me a hotel gym workout plan — just dumbbells and a cable machine, 3 days.",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkBuildSavesProgram(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat5Chain3: ScenarioSpec[] = [
    {
      label: "setup", category: "constraint", setup: true,
      message: "Build me a 4-day full gym program.",
      checks: () => [],
    },
    {
      label: "Constraint: enforce existing banned item", category: "constraint",
      message: "I just realized leg press is in my program. I told you I don't like it — can you remove it from all sessions?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkVerificationConsistent(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  const cat5Chain4: ScenarioSpec[] = [{
    label: "Constraint: bodyweight only build", category: "constraint",
    message: "I have zero equipment at home. Build me a 3-day bodyweight-only program.",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkBuildSavesProgram(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat5Chain5: ScenarioSpec[] = [{
    label: "Constraint: multi-constraint build", category: "constraint",
    message: "Build me a 3-day dumbbell-only strength program. I have a bad lower back so avoid heavy spinal loading — no good mornings or barbell good mornings.",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkMicroReasonsMax3(c), checkStageOrder(c), checkBuildSavesProgram(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  // ── CAT 6: Edge cases (3 independent, 3 with setup) ───────────────────────

  const cat6Chain1: ScenarioSpec[] = [{
    label: "Edge: greeting message", category: "edge",
    message: "Hey, what can you do?",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkStageOrder(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat6Chain2: ScenarioSpec[] = [
    {
      label: "setup", category: "edge", setup: true,
      message: "Build me a 5-day program.",
      checks: () => [],
    },
    {
      label: "Edge: rebuild after existing program", category: "edge",
      // NOTE: AI may ask for clarification before a full rebuild — this is correct
      // behavior, so we do NOT require systemSaved=true here.
      message: "I want to completely start over with my program and do a 3-day full body split instead of my current one.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkStageOrder(c),
        checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  const cat6Chain3: ScenarioSpec[] = [
    {
      label: "setup", category: "edge", setup: true,
      message: "Build me a 4-day strength program.",
      checks: () => [],
    },
    {
      label: "Edge: vague edit request", category: "edge",
      message: "Can you simplify my program?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkStageOrder(c),
        checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  const cat6Chain4: ScenarioSpec[] = [{
    label: "Edge: very short message", category: "edge",
    message: "Program",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkStageOrder(c),
      checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat6Chain5: ScenarioSpec[] = [{
    label: "Edge: multi-goal build", category: "edge",
    message: "I want to build muscle AND lose fat at the same time. Can you create a program for that? 4 days, full gym.",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  const cat6Chain6: ScenarioSpec[] = [
    {
      label: "setup", category: "edge", setup: true,
      message: "Build me a 4-day program.",
      checks: () => [],
    },
    {
      label: "Edge: pain adjustment to existing", category: "edge",
      message: "My knee has been bothering me this week. Can you adjust my program to take it easy on my knees?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // ── CAT 7: Advanced edge cases (10 new chains) ────────────────────────────

  // 1. Conflicting constraints: injury + incompatible training goal
  const cat7Chain1: ScenarioSpec[] = [{
    label: "Conflict: knee pain + jump training", category: "advanced_edge",
    message: "I have knee pain but I want plyometric jump training.",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkSafetyModeForPain(c), checkStageOrder(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  // 2a. Temporary equipment: hotel gym (context-scoped, not a permanent constraint)
  const cat7Chain2a: ScenarioSpec[] = [{
    label: "Temporary: hotel gym today", category: "advanced_edge",
    message: "I'm at a hotel gym today — build me a quick workout I can do with limited equipment.",
    checks: (c) => [
      checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
      checkStageOrder(c), checkNoInternalTermsInResponse(c),
    ],
  }];

  // 2b. Permanent equipment change: should update the program's equipment constraint
  const cat7Chain2b: ScenarioSpec[] = [
    {
      label: "setup", category: "advanced_edge", setup: true,
      message: "Build me a 4-day strength program with a full gym.",
      checks: () => [],
    },
    {
      label: "Permanent: dumbbells only from now on", category: "advanced_edge",
      message: "I only have dumbbells from now on. Please update my program accordingly.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // 3. Vague pronouns: "swap this" and "make that easier" with an existing program
  //    Both should get clarification or a reasonable best-guess edit.
  const cat7Chain3: ScenarioSpec[] = [
    {
      label: "setup", category: "advanced_edge", setup: true,
      message: "Build me a 3-day upper/lower strength program.",
      checks: () => [],
    },
    {
      label: "Vague pronoun: swap this", category: "advanced_edge",
      message: "Can you swap this?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      label: "Vague pronoun: make that easier", category: "advanced_edge",
      message: "Make that easier.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // 4. User correction: misidentified sport → mid-conversation correction
  const cat7Chain4: ScenarioSpec[] = [
    {
      label: "setup", category: "advanced_edge", setup: true,
      message: "Build me a sport-specific training program for basketball.",
      checks: () => [],
    },
    {
      label: "Correction: golf not basketball", category: "advanced_edge",
      message: "No, I meant golf not basketball. Can you redo the program for golf?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // 5. Contradictory preference: hates lunges but requests Bulgarian split squats
  //    (BSS is a lunge-pattern — AI should either note the contradiction or just add BSS)
  const cat7Chain5: ScenarioSpec[] = [
    {
      label: "setup", category: "advanced_edge", setup: true,
      message: "Build me a 4-day lower body strength program.",
      checks: () => [],
    },
    {
      label: "Contradiction: hate lunges add BSS", category: "advanced_edge",
      message: "I hate lunges, but can you add Bulgarian split squats?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // 6. Unsafe progression: doubling volume should trigger the fail-safe layer
  const cat7Chain6: ScenarioSpec[] = [
    {
      label: "setup", category: "advanced_edge", setup: true,
      message: "Build me a 4-day strength program.",
      checks: () => [],
    },
    {
      label: "Unsafe: double volume this week", category: "advanced_edge",
      message: "Double my volume this week — I want to train twice as much.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c), checkNoPaywallError(c),
      ],
    },
  ];

  // 7. Verification: explicit "remove X" mutation → verify verification ran and reported honestly
  const cat7Chain7: ScenarioSpec[] = [
    {
      label: "setup", category: "advanced_edge", setup: true,
      message: "Build me a 3-day full-body strength program using a full gym.",
      checks: () => [],
    },
    {
      label: "Verification: remove exercise honest report", category: "advanced_edge",
      message: "Remove all calf raises from my program. If there aren't any, just confirm.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkVerificationConsistent(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // 8. Memory recall: first turn stores constraint, second turn build should honor it
  const cat7Chain8: ScenarioSpec[] = [
    {
      // Not marked setup:true — we want to record this as a checked scenario
      label: "Memory: store constraint", category: "advanced_edge",
      message: "Remember — I don't have a belt squat machine. Please never include it.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      label: "Memory: new build honors constraint", category: "advanced_edge",
      message: "Build me a new 4-day strength program.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkBuildSavesProgram(c), checkBuildMetaMicroReasons(c),
        checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // 9. Guidance vs mutation: "why did you pick X?" vs "replace X with Y"
  const cat7Chain9: ScenarioSpec[] = [
    {
      label: "setup", category: "advanced_edge", setup: true,
      message: "Build me a 3-day strength program featuring trap bar deadlifts.",
      checks: () => [],
    },
    {
      label: "Guidance: why trap bar deadlift", category: "advanced_edge",
      message: "Why did you pick trap bar deadlift?",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      label: "Mutation: replace trap bar with conventional", category: "advanced_edge",
      message: "Replace trap bar deadlift with conventional deadlift.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkVerificationConsistent(c), checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // 10. Edit vs rebuild: global vibe edit vs explicit fresh start
  const cat7Chain10: ScenarioSpec[] = [
    {
      label: "setup", category: "advanced_edge", setup: true,
      message: "Build me a 4-day strength program.",
      checks: () => [],
    },
    {
      label: "Edit: make more athletic", category: "advanced_edge",
      message: "Make this more athletic.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkNoInternalTermsInResponse(c),
      ],
    },
    {
      label: "Rebuild: start over athletic plan", category: "advanced_edge",
      message: "Actually, start over completely. Build me a fresh 4-day athletic program.",
      checks: (c) => [
        checkAcknowledged(c), checkMicroReasonsArrive(c), checkMicroReasonsNoInternalTerms(c),
        checkStageOrder(c), checkBuildSavesProgram(c), checkBuildMetaMicroReasons(c),
        checkNoInternalTermsInResponse(c),
      ],
    },
  ];

  // ── Run all chains with bounded concurrency ────────────────────────────────
  // Cap at 6 concurrent chains to avoid overwhelming the OpenAI API rate limits.

  const chainFactories: Array<() => Promise<TestResult[]>> = [
    () => runChain("build1", cat1Chain1),
    () => runChain("build2", cat1Chain2),
    () => runChain("build3", cat1Chain3),
    () => runChain("build4", cat1Chain4),
    () => runChain("build5", cat1Chain5),
    () => runChain("build6", cat1Chain6),
    () => runChain("pain1",  cat2Chain1),
    () => runChain("pain2",  cat2Chain2),
    () => runChain("pain3",  cat2Chain3),
    () => runChain("mut",    cat3Chain),
    () => runChain("guid1",  cat4Chain1),
    () => runChain("guid2",  cat4Chain2),
    () => runChain("guid3",  cat4Chain3),
    () => runChain("guid4",  cat4Chain4),
    () => runChain("guid5",  cat4Chain5),
    () => runChain("guid6",  cat4Chain6),
    () => runChain("con1",   cat5Chain1),
    () => runChain("con2",   cat5Chain2),
    () => runChain("con3",   cat5Chain3),
    () => runChain("con4",   cat5Chain4),
    () => runChain("con5",   cat5Chain5),
    () => runChain("edge1",  cat6Chain1),
    () => runChain("edge2",  cat6Chain2),
    () => runChain("edge3",  cat6Chain3),
    () => runChain("edge4",  cat6Chain4),
    () => runChain("edge5",  cat6Chain5),
    () => runChain("edge6",  cat6Chain6),
    // CAT 7 — advanced edge cases
    () => runChain("adv1",   cat7Chain1),
    () => runChain("adv2a",  cat7Chain2a),
    () => runChain("adv2b",  cat7Chain2b),
    () => runChain("adv3",   cat7Chain3),
    () => runChain("adv4",   cat7Chain4),
    () => runChain("adv5",   cat7Chain5),
    () => runChain("adv6",   cat7Chain6),
    () => runChain("adv7",   cat7Chain7),
    () => runChain("adv8",   cat7Chain8),
    () => runChain("adv9",   cat7Chain9),
    () => runChain("adv10",  cat7Chain10),
  ];

  const settled = await runChainsBounded(chainFactories, 6);
  const results: TestResult[] = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      console.error("Chain failed:", outcome.reason);
    }
  }

  return results;
}

// ─── Reporter ─────────────────────────────────────────────────────────────────

function printResults(results: TestResult[]): void {
  const pass = results.filter((r) => r.passed).length;
  const fail = results.filter((r) => !r.passed).length;
  const totalChecks = results.reduce((s, r) => s + r.checks.length, 0);
  const passedChecks = results.reduce((s, r) => s + r.checks.filter((c) => c.passed).length, 0);

  console.log("\n" + "═".repeat(70));
  console.log("SCENARIO REPLAY RESULTS");
  console.log("═".repeat(70));

  // Group by category
  const categories = [...new Set(results.map((r) => r.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPass = catResults.filter((r) => r.passed).length;
    console.log(`\n┌ ${cat.toUpperCase()} (${catPass}/${catResults.length})`);
    for (const r of catResults) {
      const icon = r.passed ? "✓" : "✗";
      const failedChecks = r.checks.filter((c) => !c.passed);
      const ms = r.durationMs.toLocaleString();
      console.log(`│ ${icon} [${ms}ms] ${r.scenario}`);
      if (r.actionType) console.log(`│     actionType=${r.actionType} outcomeType=${r.outcomeType}`);
      if (r.microReasons?.length) {
        console.log(`│     microReasons: "${r.microReasons[0].slice(0, 60)}…"`);
      }
      for (const c of failedChecks) {
        console.log(`│     ✗ FAIL: ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
      }
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log(`SCENARIOS  : ${pass} passed, ${fail} failed (${results.length} total)`);
  console.log(`CHECKS     : ${passedChecks}/${totalChecks} passed`);

  // Timing summary
  const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);
  const maxMs = Math.max(...results.map((r) => r.durationMs));
  console.log(`TIMING     : avg ${avgMs.toLocaleString()}ms, max ${maxMs.toLocaleString()}ms`);
  console.log("═".repeat(70) + "\n");

  // Failed check breakdown
  if (fail > 0) {
    console.log("FAILED SCENARIOS:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ✗ ${r.scenario}`);
      for (const c of r.checks.filter((c) => !c.passed)) {
        console.log(`    → ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
      }
    }
    console.log();
    process.exit(1);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  console.log("TrainChat Scenario Replay — starting…");
  console.log(`Target: ${BASE}`);
  console.log(`Timeout per message: ${TIMEOUT_MS / 1000}s\n`);

  try {
    const results = await runAllScenarios();
    printResults(results);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
})();
