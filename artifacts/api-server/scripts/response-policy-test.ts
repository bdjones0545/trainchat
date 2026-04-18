/**
 * Response Policy Test Harness — DEV only
 *
 * Runs the language system + response policy engine over a range of example
 * messages and prints structured output for each:
 *   - AgentIntentProfile summary
 *   - Resolved ResponsePolicy
 *   - Example response draft (illustrating the policy in action)
 *
 * Run from artifacts/api-server/:
 *   npx tsx scripts/response-policy-test.ts
 */

import { extractAgentIntentProfile } from "../src/lib/language-system";
import { resolveResponsePolicy, type ResponsePolicyContext, type ActionType, type ResponseMode } from "../src/lib/response-policy-engine";

// ─── Test Cases ────────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  message: string;
  context: ResponsePolicyContext;
  /** Optional expected action — for self-check */
  expectedAction?: ActionType;
}

const TEST_CASES: TestCase[] = [
  {
    id: "create:4day_strength",
    message: "Build me a 4-day strength program",
    context: { hasActiveProgram: false },
    expectedAction: "CREATE_PROGRAM",
  },
  {
    id: "preserve_modify:lower_days",
    message: "Keep the same vibe but fix the lower days",
    context: { hasActiveProgram: true, currentBlock: "Accumulation Block — Week 2" },
    expectedAction: "MODIFY_BLOCK",
  },
  {
    id: "recovery:smoked_today",
    message: "I'm smoked today, can we dial it back?",
    context: { hasActiveProgram: true, todaySession: "Lower Body Power" },
    expectedAction: "ADJUST_TODAY",
  },
  {
    id: "equipment:no_barbell_this_week",
    message: "No barbell this week, I'm training at my hotel gym",
    context: { hasActiveProgram: true },
    expectedAction: "MODIFY_PROGRAM",
  },
  {
    id: "explain:why_this_exercise",
    message: "Why did you choose this exercise for day 2?",
    context: { hasActiveProgram: true },
    expectedAction: "EXPLAIN_REASONING",
  },
  {
    id: "conversational:looks_good",
    message: "This looks good, I like it",
    context: { hasActiveProgram: true },
    expectedAction: "NO_PROGRAM_CHANGE",
  },
  {
    id: "style:same_idea_more_pop",
    message: "Same idea, just more pop",
    context: { hasActiveProgram: true, currentBlock: "Speed-Strength Phase" },
    expectedAction: "MODIFY_PROGRAM",
  },
  {
    id: "preserve_modify:keep_upper_fix_lower",
    message: "Keep upper body and make the lower days easier on my knees",
    context: {
      hasActiveProgram: true,
      preservedLikes: ["barbell squats", "Nordic hamstring curls"],
    },
    expectedAction: "MODIFY_BLOCK",
  },
  {
    id: "modify:day2_only",
    message: "I liked the last one except day 2",
    context: { hasActiveProgram: true },
    expectedAction: "MODIFY_DAY",
  },
  {
    id: "style:more_athletic",
    message: "Make it more athletic, less bodybuilding",
    context: { hasActiveProgram: true },
    expectedAction: "MODIFY_PROGRAM",
  },
  {
    id: "contradiction:never_mind_shorter",
    message: "Actually never mind, just make it shorter",
    context: { hasActiveProgram: true },
    expectedAction: "MODIFY_PROGRAM",
  },
  {
    id: "recovery:train_but_not_crushed",
    message: "I want to train but not get crushed — keep it lighter",
    context: { hasActiveProgram: true, todaySession: "Full Body Session A" },
    expectedAction: "ADJUST_TODAY",
  },
  {
    id: "deload:need_a_deload",
    message: "I think I need a deload week, my body is pretty beat up",
    context: { hasActiveProgram: true, currentBlock: "Intensification Block" },
    expectedAction: "DELOAD_PROGRAM",
  },
  {
    id: "progress:make_it_harder",
    message: "This is getting easy, let's progress it",
    context: { hasActiveProgram: true },
    expectedAction: "PROGRESS_PROGRAM",
  },
  {
    id: "question:how_speed",
    message: "How would this help my speed on the field?",
    context: { hasActiveProgram: true },
    expectedAction: "ANSWER_QUESTION",
  },
];

// ─── Example Response Draft Generator ─────────────────────────────────────────

function generateExampleResponse(
  action: ActionType,
  mode: ResponseMode,
  message: string,
  preserveTargets: string[],
  context: ResponsePolicyContext
): string {
  const hasPreserve = preserveTargets.length > 0;

  const templates: Partial<Record<ActionType, string>> = {
    CREATE_PROGRAM:
      "On it — I'll build you a 4-day strength plan around compound lifts with the right loading structure for your goal.",
    MODIFY_PROGRAM:
      hasPreserve
        ? `I'll leave ${preserveTargets.join(" and ")} as-is and update the rest based on what you're after.`
        : "Got it — I'll update the program to match what you're looking for.",
    MODIFY_BLOCK:
      hasPreserve
        ? `I'll keep ${preserveTargets.join(" and ")} exactly as-is and rework the other days.`
        : "I'll rework the block — keeping the overall structure and adjusting the parts that need it.",
    MODIFY_DAY:
      "I'll clean up that day and leave everything else alone.",
    ADJUST_TODAY:
      "Since you're a bit smoked today, I'll dial this session back — same structure, less demand. Get your work in without grinding yourself into the ground.",
    SWAP_EXERCISE:
      "Swapping it out now — I'll find something in the same movement pattern that fits your setup.",
    EXPLAIN_REASONING:
      "Happy to break it down — the exercise choice is driven by the movement pattern balance across the week and the loading phase you're in.",
    ANSWER_QUESTION:
      "Good question. The structure here builds the qualities that translate directly to field speed — force production, rate of force development, and repeat-sprint capacity.",
    NO_PROGRAM_CHANGE:
      "Glad it's working. Let me know if you want to adjust anything as you get into it.",
    COACH_CONVERSATION:
      "Yeah, that makes sense. We can keep the feel of the plan and just sharpen the parts that are dragging.",
    CHECK_IN_RESPONSE:
      "Appreciate the heads up — I'll factor that in.",
    DELOAD_PROGRAM:
      "Makes sense — your body's earned a back-off week. I'll reduce the volume and intensity across the board while keeping the movement patterns in place.",
    PROGRESS_PROGRAM:
      "Let's step it up — I'll increase the loading demand and tighten the intensity zones across the block.",
    REGRESS_PROGRAM:
      "Dialing it back a bit — I'll reduce the complexity and loading so the quality stays high.",
    CLARIFY_SOFTLY:
      "Just want to make sure I've got this right — are you looking to change the whole plan or just specific parts of it?",
  };

  return templates[action] ?? "Got it — I'll make the adjustment now.";
}

// ─── Printer ───────────────────────────────────────────────────────────────────

const DIVIDER = "═".repeat(80);
const LINE = "─".repeat(80);

function print(s: string) { process.stdout.write(s + "\n"); }
function dim(s: string) { return s; }

function printTestCase(tc: TestCase, idx: number) {
  print(`\n${DIVIDER}`);
  print(`TEST ${idx + 1}: ${tc.id}`);
  print(LINE);
  print(`INPUT: "${tc.message}"`);
  print(`context: hasActiveProgram=${tc.context.hasActiveProgram}${tc.context.currentBlock ? `, block="${tc.context.currentBlock}"` : ""}${tc.context.todaySession ? `, session="${tc.context.todaySession}"` : ""}`);
  print(LINE);

  const profile = extractAgentIntentProfile(tc.message, tc.context.hasActiveProgram);
  const policy = resolveResponsePolicy(profile, tc.context);

  // ── Profile summary ──
  print("AGENT INTENT PROFILE:");
  print(`  requestType:      ${profile.requestType}`);
  print(`  primaryGoal:      ${profile.primaryGoal ?? "none"}`);
  print(`  recoveryState:    ${profile.recoveryState}`);
  print(`  stylePrefs:       ${profile.stylePreferences.length > 0 ? profile.stylePreferences.join(", ") : "none"}`);
  print(`  preserve:         ${profile.preserveInstructions.length > 0 ? profile.preserveInstructions.map((p) => p.target).join(", ") : "none"}`);
  print(`  changes:          ${profile.requestedChanges.length > 0 ? profile.requestedChanges.map((c) => `${c.direction}:${c.target}`).join(", ") : "none"}`);
  print(`  confidence:       ${(profile.confidenceScore * 100).toFixed(0)}%`);
  if (profile.ambiguityFlags.length > 0) {
    print(`  ambiguity:        ${profile.ambiguityFlags.map((a) => a.type).join(", ")}`);
  }
  print(LINE);

  // ── Policy output ──
  print("RESPONSE POLICY:");
  print(`  actionType:        ${policy.actionType}${tc.expectedAction && policy.actionType !== tc.expectedAction ? ` ← expected: ${tc.expectedAction}` : ""}`);
  print(`  changeScope:       ${policy.changeScope}`);
  print(`  responseMode:      ${policy.responseMode}`);
  print(`  confidence:        ${(policy.confidence * 100).toFixed(0)}%`);
  print(`  mutation needed:   ${policy.programMutationNeeded}`);
  print(`  explanation:       ${policy.explanationNeeded}`);
  print(`  verbosity:         ${policy.verbosityLevel}`);
  print(`  tone:              ${policy.coachVoiceGuidance.toneProfile}`);
  print(`  ack style:         ${policy.coachVoiceGuidance.acknowledgmentStyle}`);
  print(`  mirror slang:      ${policy.coachVoiceGuidance.mirrorUserLanguage}`);
  if (policy.preserveTargets.length > 0) {
    print(`  preserveTargets:   ${policy.preserveTargets.join(", ")}`);
  }
  if (policy.warnings.length > 0) {
    print(`  WARNINGS:`);
    for (const w of policy.warnings) {
      print(`    ⚠ [${w.code}] ${w.message}`);
    }
  }
  print(LINE);

  // ── Example response draft ──
  const exampleResponse = generateExampleResponse(
    policy.actionType,
    policy.responseMode,
    tc.message,
    policy.preserveTargets,
    tc.context
  );
  print("EXAMPLE RESPONSE DRAFT:");
  print(`  "${exampleResponse}"`);
}

// ─── Run ───────────────────────────────────────────────────────────────────────

print(`\n${"═".repeat(80)}`);
print("RESPONSE POLICY TEST HARNESS");
print(`${"═".repeat(80)}`);

let passed = 0;
let mismatched = 0;

for (let i = 0; i < TEST_CASES.length; i++) {
  const tc = TEST_CASES[i];
  try {
    const profile = extractAgentIntentProfile(tc.message, tc.context.hasActiveProgram);
    const policy = resolveResponsePolicy(profile, tc.context);

    printTestCase(tc, i);

    if (tc.expectedAction) {
      if (policy.actionType === tc.expectedAction) {
        passed++;
      } else {
        mismatched++;
      }
    }
  } catch (err) {
    print(`\nERROR in test ${tc.id}: ${err}`);
    mismatched++;
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

const total = TEST_CASES.length;
const withExpected = TEST_CASES.filter((t) => t.expectedAction).length;

print(`\n${"═".repeat(80)}`);
print("COVERAGE SUMMARY");
print("─".repeat(80));
print(`Total cases:    ${total}`);
print(`With expected:  ${withExpected}`);
print(`Matched:        ${passed} (${Math.round((passed / withExpected) * 100)}%)`);
print(`Mismatched:     ${mismatched}`);
print(`${"═".repeat(80)}`);
