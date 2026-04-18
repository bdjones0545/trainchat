/**
 * Language Coverage Test Harness — DEV only
 *
 * Runs a broad set of English coaching inputs through the language system
 * and prints structured output for each.
 *
 * Run with:
 *   npx tsx scripts/language-coverage-test.ts
 *
 * Output for each test case:
 *   - Raw input
 *   - Normalized concepts
 *   - Extracted structured intent
 *   - Confidence
 *   - Ambiguity / contradiction notes
 *   - Resulting programming directives
 */

import { extractAgentIntentProfile, normalizeMessage } from "../src/lib/language-system";

const TEST_CASES: Array<{ label: string; input: string; hasActiveProgram?: boolean }> = [
  // ── Direct requests ────────────────────────────────────────────────────────
  { label: "direct:create_strength", input: "Build me a 4-day strength program", hasActiveProgram: false },
  { label: "direct:create_athletic", input: "Create a 3-day athletic performance plan. I play basketball and need to be faster and more explosive." },
  { label: "direct:create_hypertrophy", input: "I want to build muscle. Give me a 5-day hypertrophy split with full gym access." },

  // ── Vague requests ─────────────────────────────────────────────────────────
  { label: "vague:improve_it", input: "Make it better", hasActiveProgram: true },
  { label: "vague:generic_change", input: "Change the program", hasActiveProgram: true },
  { label: "vague:make_it_work", input: "Can you fix this for me", hasActiveProgram: true },

  // ── Slang / metaphor requests ──────────────────────────────────────────────
  { label: "slang:springy_pop", input: "Same vibe, just more pop. I want to feel springy again.", hasActiveProgram: true },
  { label: "slang:cooked_grindy", input: "It's too grindy. Make it cleaner and sharper, not so heavy.", hasActiveProgram: true },
  { label: "slang:less_grindy_more_bounce", input: "Less grindy, more bounce. I want to feel light on my feet.", hasActiveProgram: true },
  { label: "slang:hit_harder", input: "Make it hit harder but without wrecking me", hasActiveProgram: true },

  // ── Fatigue / recovery states ──────────────────────────────────────────────
  { label: "recovery:smoked", input: "I'm smoked today but still want to train. Something manageable.", hasActiveProgram: true },
  { label: "recovery:cooked_lighter", input: "Cooked from the week. Need a lighter day — don't want to get crushed.", hasActiveProgram: true },
  { label: "recovery:low_motivation", input: "Not really feeling it today but I'm here. Low motivation, want to train but not get destroyed.", hasActiveProgram: true },
  { label: "recovery:fresh", input: "Feeling great today, sharp and fully recovered. Ready to push hard.", hasActiveProgram: true },
  { label: "recovery:sore_legs", input: "Legs are still sore from Tuesday. Something that's easy on my legs today.", hasActiveProgram: true },

  // ── Preservation requests ──────────────────────────────────────────────────
  { label: "preserve:keep_upper", input: "Keep the upper days and fix the lower days", hasActiveProgram: true },
  { label: "preserve:same_vibe", input: "Keep the same vibe but make it more athletic", hasActiveProgram: true },
  { label: "preserve:liked_last", input: "I liked the last program except day 2. Can we keep everything else?", hasActiveProgram: true },
  { label: "preserve:med_ball", input: "Keep the med ball work but make the lifting easier on my knees", hasActiveProgram: true },
  { label: "preserve:dont_remove_sprints", input: "Don't remove the sprint work. Change the lifting but leave the speed work in.", hasActiveProgram: true },

  // ── Contradiction requests ─────────────────────────────────────────────────
  { label: "contradiction:volume_shorter_fatigue", input: "More volume, shorter sessions, less fatigue", hasActiveProgram: true },
  { label: "contradiction:preserve_everything_change_everything", input: "Same vibe but completely different exercises, structure, and split", hasActiveProgram: true },
  { label: "contradiction:strength_and_cardio", input: "I want to get really strong AND improve my conditioning a lot at the same time", hasActiveProgram: true },

  // ── Conversational follow-ups ──────────────────────────────────────────────
  { label: "followup:actually_keep_upper", input: "Actually keep the upper days", hasActiveProgram: true },
  { label: "followup:go_back", input: "Go back to something like the last block", hasActiveProgram: true },
  { label: "followup:same_but_explosive", input: "Same idea but more explosive", hasActiveProgram: true },
  { label: "followup:nevermind_shorter", input: "Never mind — make it shorter", hasActiveProgram: true },

  // ── Equipment / schedule constraints ──────────────────────────────────────
  { label: "constraint:no_barbell", input: "No barbell this week. Only dumbbells at the hotel gym.", hasActiveProgram: true },
  { label: "constraint:30_minutes", input: "I only have 30 minutes. Keep it tight.", hasActiveProgram: true },
  { label: "constraint:traveling", input: "Traveling this week, minimal equipment, 3 days max", hasActiveProgram: true },
  { label: "constraint:knee_friendly", input: "Knees are bothering me. Need lower impact, easy on the knees.", hasActiveProgram: true },

  // ── Multi-intent / mixed requests ─────────────────────────────────────────
  { label: "multi:athletic_less_bodybuilding", input: "Less bodybuilding, more performance. Make it more athletic and less grindy.", hasActiveProgram: true },
  { label: "multi:explosive_no_crush", input: "More explosive but don't destroy me. Keep the structure but change the exercises.", hasActiveProgram: true },
  { label: "multi:keep_upper_fix_lower", input: "Keep the upper body the same and make the lower days more explosive", hasActiveProgram: true },
  { label: "multi:smoked_still_train", input: "I'm beat up but I still want to train. Something lighter that won't crush me. No barbell today.", hasActiveProgram: true },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

function printDivider(char = "─", length = 80): void {
  console.log(char.repeat(length));
}

function printTestResult(label: string, input: string, hasActiveProgram: boolean): void {
  printDivider("═");
  console.log(`TEST: ${label}`);
  printDivider();
  console.log(`INPUT: "${input}"`);
  console.log(`has_active_program: ${hasActiveProgram}`);
  printDivider("-");

  const { normalized, concepts } = normalizeMessage(input);
  console.log(`NORMALIZED CONCEPTS (${concepts.length}):`);
  if (concepts.length === 0) {
    console.log("  (none detected)");
  } else {
    for (const c of concepts) console.log(`  • ${c}`);
  }
  printDivider("-");

  const profile = extractAgentIntentProfile(input, hasActiveProgram);

  console.log(`STRUCTURED INTENT:`);
  console.log(`  requestType:        ${profile.requestType}`);
  console.log(`  primaryGoal:        ${profile.primaryGoal ?? "none"}`);
  console.log(`  secondaryGoals:     ${profile.secondaryGoals.length > 0 ? profile.secondaryGoals.join(", ") : "none"}`);
  console.log(`  recoveryState:      ${profile.recoveryState}`);
  console.log(`  stylePreferences:   ${profile.stylePreferences.length > 0 ? profile.stylePreferences.join(", ") : "none"}`);

  if (profile.requestedChanges.length > 0) {
    console.log(`  requestedChanges:`);
    for (const c of profile.requestedChanges) {
      console.log(`    • ${c.direction} → ${c.concept} (target: ${c.target})`);
    }
  } else {
    console.log(`  requestedChanges:   none`);
  }

  if (profile.preserveInstructions.length > 0) {
    console.log(`  preserveInstructions:`);
    for (const i of profile.preserveInstructions) {
      console.log(`    • [${i.target}] ${i.raw}`);
    }
  } else {
    console.log(`  preserveInstructions: none`);
  }

  console.log(`  equipment.unavailable: ${profile.constraints.equipment.unavailable.join(", ") || "none"}`);
  console.log(`  bodyLimitations:    ${profile.constraints.bodyLimitations.join("; ") || "none"}`);
  console.log(`  schedule.days:      ${profile.constraints.schedule.daysPerWeek ?? "not specified"}`);
  console.log(`  schedule.duration:  ${profile.constraints.schedule.sessionDurationMinutes ? `${profile.constraints.schedule.sessionDurationMinutes}min` : "not specified"}`);

  printDivider("-");
  console.log(`CONFIDENCE: ${(profile.confidenceScore * 100).toFixed(0)}%`);

  if (profile.ambiguityFlags.length > 0) {
    console.log(`AMBIGUITY FLAGS:`);
    for (const f of profile.ambiguityFlags) {
      console.log(`  ⚠ [${f.type}] ${f.description}`);
    }
  }

  if (profile.contradictions.length > 0) {
    console.log(`CONTRADICTIONS:`);
    for (const c of profile.contradictions) {
      console.log(`  ✗ "${c.conflictA}" ↔ "${c.conflictB}"`);
      console.log(`    ${c.description}`);
    }
  }

  if (profile.ambiguityFlags.length === 0 && profile.contradictions.length === 0) {
    console.log(`No ambiguity or contradictions detected.`);
  }

  printDivider("-");
  console.log(`PROGRAMMING DIRECTIVES (${profile.programmingDirectives.length}):`);
  const sorted = [...profile.programmingDirectives].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
  if (sorted.length === 0) {
    console.log(`  (no directives — check confidence or input`);
  }
  for (const d of sorted) {
    const shortDirective = d.directive.length > 120 ? d.directive.slice(0, 120) + "…" : d.directive;
    console.log(`  [${d.priority.toUpperCase()}] (${d.source})`);
    console.log(`    ${shortDirective}`);
  }

  console.log("");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("\n");
printDivider("═");
console.log("TRAINCHAT LANGUAGE SYSTEM COVERAGE TEST HARNESS");
printDivider("═");
console.log(`Running ${TEST_CASES.length} test cases...`);
console.log("\n");

let passCount = 0;
let flagCount = 0;

for (const tc of TEST_CASES) {
  const hasActiveProgram = tc.hasActiveProgram ?? true;
  printTestResult(tc.label, tc.input, hasActiveProgram);

  const profile = extractAgentIntentProfile(tc.input, hasActiveProgram);
  const hasSignals =
    profile.primaryGoal !== null ||
    profile.recoveryState !== "unknown" ||
    profile.stylePreferences.length > 0 ||
    profile.requestedChanges.length > 0 ||
    profile.preserveInstructions.length > 0 ||
    profile.programmingDirectives.length > 0;

  if (hasSignals || profile.requestType !== "unclear") {
    passCount++;
  } else {
    flagCount++;
  }
}

printDivider("═");
console.log(`COVERAGE SUMMARY`);
printDivider("─");
console.log(`Total cases:    ${TEST_CASES.length}`);
console.log(`With signals:   ${passCount} (${Math.round((passCount / TEST_CASES.length) * 100)}%)`);
console.log(`No signals:     ${flagCount} (may need pattern expansion)`);
printDivider("═");
