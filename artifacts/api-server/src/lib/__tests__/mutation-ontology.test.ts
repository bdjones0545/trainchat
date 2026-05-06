/**
 * Mutation Ontology — Spec Tests
 *
 * Covers the canonical mutation registry:
 *  1. getMutationFamilies() returns all expected families
 *  2. isMutationFamilyOntology() correctly gates mutation vs non-mutation families
 *  3. resolveMutationCommand() resolves old IntentFamily aliases to canonical commands
 *  4. getCanonicalName() / getMutationCategory() return correct metadata
 *  5. MUTATION_ONTOLOGY completeness — every command has required fields
 *  6. Alias consistency — every alias maps back to its canonical command
 *  7. validateOperationsOntology() catches structural-change violations
 *  8. New athletic/mobility families are fully covered
 */

import { describe, it, expect } from "vitest";
import {
  getMutationFamilies,
  isMutationFamilyOntology,
  resolveMutationCommand,
  getCanonicalName,
  getMutationCategory,
  validateOperationsOntology,
  MUTATION_ONTOLOGY,
  INTENT_FAMILY_TO_CANONICAL,
} from "../mutation-ontology";
import type { CanonicalCommandName } from "../mutation-ontology";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1 — getMutationFamilies()
// ═══════════════════════════════════════════════════════════════════════════════

describe("getMutationFamilies()", () => {
  it("returns a non-empty array", () => {
    expect(getMutationFamilies().length).toBeGreaterThan(0);
  });

  it("includes all core mutation families", () => {
    const families = getMutationFamilies();
    const required = [
      "increase_difficulty",
      "decrease_difficulty",
      "increase_volume",
      "decrease_volume",
      "strength_focus",
      "hypertrophy_focus",
      "endurance_focus",
      "conditioning_focus",
      "power_explosive_focus",
      "speed_focus",
      "fatigue_management",
      "recovery_focus",
      "mobility_support",
      "injury_modification",
      "joint_friendly_modification",
      "equipment_constraint",
      "add_exercise",
      "exercise_swap",
      "exercise_progression",
      "exercise_regression",
      "day_progression",
      "day_regression",
      "readiness_low",
      "missed_sessions_reentry",
      "environment_temporary_switch",
      "bulk_session_sets_increase",
    ];
    for (const fam of required) {
      expect(families, `missing: ${fam}`).toContain(fam);
    }
  });

  it("includes all new athletic/mobility families", () => {
    const families = getMutationFamilies();
    const newFamilies = [
      "reactive_focus",
      "cod_decel_focus",
      "footwork_rhythm_focus",
      "athletic_performance_focus",
      "rom_restoration_focus",
      "tissue_stiffness_focus",
      "tendon_resilience_focus",
      "end_range_control_focus",
      "mobility_flow_focus",
      "unilateral_emphasis",
      "posterior_chain_emphasis",
      "trunk_core_emphasis",
    ];
    for (const fam of newFamilies) {
      expect(families, `missing new family: ${fam}`).toContain(fam);
    }
  });

  it("does NOT include non-mutation families", () => {
    const families = getMutationFamilies();
    expect(families).not.toContain("greeting");
    expect(families).not.toContain("program_safety_question");
    expect(families).not.toContain("program_explanation_question");
    expect(families).not.toContain("coaching_question");
    expect(families).not.toContain("new_program_request");
    expect(families).not.toContain("clarification_required");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 — isMutationFamilyOntology()
// ═══════════════════════════════════════════════════════════════════════════════

describe("isMutationFamilyOntology()", () => {
  it("returns true for all families returned by getMutationFamilies()", () => {
    for (const fam of getMutationFamilies()) {
      expect(isMutationFamilyOntology(fam), `should be mutation: ${fam}`).toBe(true);
    }
  });

  it("returns false for greeting", () => {
    expect(isMutationFamilyOntology("greeting")).toBe(false);
  });

  it("returns false for program_safety_question", () => {
    expect(isMutationFamilyOntology("program_safety_question")).toBe(false);
  });

  it("returns false for clarification_required", () => {
    expect(isMutationFamilyOntology("clarification_required")).toBe(false);
  });

  it("returns false for new_program_request", () => {
    expect(isMutationFamilyOntology("new_program_request")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 — resolveMutationCommand()
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolveMutationCommand()", () => {
  it("resolves core families to correct canonical commands", () => {
    expect(resolveMutationCommand("increase_difficulty")?.name).toBe("INCREASE_DIFFICULTY");
    expect(resolveMutationCommand("decrease_difficulty")?.name).toBe("DECREASE_DIFFICULTY");
    expect(resolveMutationCommand("strength_focus")?.name).toBe("STRENGTH_FOCUS");
    expect(resolveMutationCommand("hypertrophy_focus")?.name).toBe("HYPERTROPHY_FOCUS");
    expect(resolveMutationCommand("endurance_focus")?.name).toBe("ENDURANCE_FOCUS");
    expect(resolveMutationCommand("power_explosive_focus")?.name).toBe("POWER_EXPLOSIVE_FOCUS");
    expect(resolveMutationCommand("day_progression")?.name).toBe("DAY_PROGRESSION");
    expect(resolveMutationCommand("day_regression")?.name).toBe("DAY_REGRESSION");
    expect(resolveMutationCommand("recovery_focus")?.name).toBe("RECOVERY_FOCUS");
  });

  it("resolves new athletic families", () => {
    expect(resolveMutationCommand("reactive_focus")?.name).toBe("REACTIVE_FOCUS");
    expect(resolveMutationCommand("cod_decel_focus")?.name).toBe("COD_DECEL_FOCUS");
    expect(resolveMutationCommand("footwork_rhythm_focus")?.name).toBe("FOOTWORK_RHYTHM_FOCUS");
    expect(resolveMutationCommand("athletic_performance_focus")?.name).toBe("ATHLETIC_PERFORMANCE_FOCUS");
    expect(resolveMutationCommand("speed_focus")?.name).toBe("SPEED_FOCUS");
    expect(resolveMutationCommand("unilateral_emphasis")?.name).toBe("UNILATERAL_EMPHASIS");
    expect(resolveMutationCommand("posterior_chain_emphasis")?.name).toBe("POSTERIOR_CHAIN_EMPHASIS");
    expect(resolveMutationCommand("trunk_core_emphasis")?.name).toBe("TRUNK_CORE_EMPHASIS");
  });

  it("resolves new mobility/recovery families", () => {
    expect(resolveMutationCommand("rom_restoration_focus")?.name).toBe("ROM_RESTORATION_FOCUS");
    expect(resolveMutationCommand("tissue_stiffness_focus")?.name).toBe("TISSUE_STIFFNESS_FOCUS");
    expect(resolveMutationCommand("tendon_resilience_focus")?.name).toBe("TENDON_RESILIENCE_FOCUS");
    expect(resolveMutationCommand("end_range_control_focus")?.name).toBe("END_RANGE_CONTROL_FOCUS");
    expect(resolveMutationCommand("mobility_flow_focus")?.name).toBe("MOBILITY_FLOW_FOCUS");
  });

  it("returns null for non-mutation families", () => {
    expect(resolveMutationCommand("greeting")).toBeNull();
    expect(resolveMutationCommand("clarification_required")).toBeNull();
    expect(resolveMutationCommand("program_safety_question")).toBeNull();
    expect(resolveMutationCommand("new_program_request")).toBeNull();
  });

  it("resolved command has all required metadata fields", () => {
    const cmd = resolveMutationCommand("strength_focus");
    expect(cmd).not.toBeNull();
    expect(cmd!.aliases.length).toBeGreaterThan(0);
    expect(cmd!.minimumStructuralChanges).toBeGreaterThanOrEqual(1);
    expect(cmd!.antiPatterns.length).toBeGreaterThan(0);
    expect(cmd!.aiDirective.length).toBeGreaterThan(10);
    expect(cmd!.defaultScope).toMatch(/^(exercise|session|week|program)$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4 — getCanonicalName() / getMutationCategory()
// ═══════════════════════════════════════════════════════════════════════════════

describe("getCanonicalName()", () => {
  it("maps every mutation family to a canonical name", () => {
    for (const fam of getMutationFamilies()) {
      const name = getCanonicalName(fam);
      expect(name, `no canonical name for: ${fam}`).not.toBeNull();
      expect(typeof name).toBe("string");
    }
  });

  it("returns null for non-mutation families", () => {
    expect(getCanonicalName("greeting")).toBeNull();
    expect(getCanonicalName("new_program_request")).toBeNull();
  });
});

describe("getMutationCategory()", () => {
  it("returns correct category type for each family group", () => {
    expect(getMutationCategory("increase_difficulty")).toBe("difficulty_adjustment");
    expect(getMutationCategory("decrease_difficulty")).toBe("difficulty_adjustment");
    expect(getMutationCategory("strength_focus")).toBe("strength_specialization");
    expect(getMutationCategory("hypertrophy_focus")).toBe("hypertrophy_specialization");
    expect(getMutationCategory("endurance_focus")).toBe("endurance_conditioning");
    expect(getMutationCategory("conditioning_focus")).toBe("endurance_conditioning");
    expect(getMutationCategory("reactive_focus")).toBe("athletic_specialization");
    expect(getMutationCategory("cod_decel_focus")).toBe("athletic_specialization");
    expect(getMutationCategory("footwork_rhythm_focus")).toBe("athletic_specialization");
    expect(getMutationCategory("recovery_focus")).toBe("mobility_recovery");
    expect(getMutationCategory("rom_restoration_focus")).toBe("mobility_recovery");
    expect(getMutationCategory("tendon_resilience_focus")).toBe("mobility_recovery");
    expect(getMutationCategory("unilateral_emphasis")).toBe("structural_modification");
    expect(getMutationCategory("posterior_chain_emphasis")).toBe("structural_modification");
    expect(getMutationCategory("trunk_core_emphasis")).toBe("structural_modification");
    expect(getMutationCategory("equipment_constraint")).toBe("constraint_application");
    expect(getMutationCategory("injury_modification")).toBe("constraint_application");
    expect(getMutationCategory("readiness_low")).toBe("state_adaptation");
    expect(getMutationCategory("missed_sessions_reentry")).toBe("state_adaptation");
  });

  it("returns null for non-mutation families", () => {
    expect(getMutationCategory("greeting")).toBeNull();
    expect(getMutationCategory("clarification_required")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5 — MUTATION_ONTOLOGY completeness
// ═══════════════════════════════════════════════════════════════════════════════

describe("MUTATION_ONTOLOGY completeness", () => {
  it("every command has all required fields", () => {
    for (const [name, cmd] of Object.entries(MUTATION_ONTOLOGY)) {
      expect(cmd.name, `${name}: missing name`).toBeTruthy();
      expect(cmd.category, `${name}: missing category`).toBeTruthy();
      expect(cmd.description, `${name}: missing description`).toBeTruthy();
      expect(cmd.defaultScope, `${name}: missing defaultScope`).toMatch(/^(exercise|session|week|program)$/);
      expect(cmd.aliases.length, `${name}: no aliases`).toBeGreaterThan(0);
      expect(cmd.minimumStructuralChanges, `${name}: minimumStructuralChanges < 1`).toBeGreaterThanOrEqual(1);
      expect(cmd.antiPatterns.length, `${name}: no antiPatterns`).toBeGreaterThan(0);
      expect(cmd.aiDirective.length, `${name}: empty aiDirective`).toBeGreaterThan(10);
    }
  });

  it("command name field matches the registry key", () => {
    for (const [key, cmd] of Object.entries(MUTATION_ONTOLOGY)) {
      expect(cmd.name).toBe(key as CanonicalCommandName);
    }
  });

  it("has a command for every canonical command name referenced in INTENT_FAMILY_TO_CANONICAL", () => {
    const referenced = new Set(Object.values(INTENT_FAMILY_TO_CANONICAL));
    for (const name of referenced) {
      expect(MUTATION_ONTOLOGY[name], `no MUTATION_ONTOLOGY entry for: ${name}`).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6 — Alias consistency
// ═══════════════════════════════════════════════════════════════════════════════

describe("Alias consistency", () => {
  it("every alias in each command maps back to that command's name", () => {
    for (const [name, cmd] of Object.entries(MUTATION_ONTOLOGY)) {
      for (const alias of cmd.aliases) {
        const mapped = INTENT_FAMILY_TO_CANONICAL[alias];
        expect(mapped, `alias ${alias} → ${mapped}, expected ${name}`).toBe(name as CanonicalCommandName);
      }
    }
  });

  it("every entry in INTENT_FAMILY_TO_CANONICAL references a valid MUTATION_ONTOLOGY key", () => {
    for (const [fam, cmdName] of Object.entries(INTENT_FAMILY_TO_CANONICAL)) {
      expect(MUTATION_ONTOLOGY[cmdName as CanonicalCommandName], `${fam} → ${cmdName} not in MUTATION_ONTOLOGY`).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7 — validateOperationsOntology()
// ═══════════════════════════════════════════════════════════════════════════════

describe("validateOperationsOntology()", () => {
  function makeStructural(type: "update_exercise" | "add_exercise" | "replace_exercise" | "delete_exercise", updates?: Record<string, unknown>) {
    return { type, updates: updates ?? { reps: "6-10", rest: "90s" } };
  }

  it("returns no violations when structural count meets minimum", () => {
    const violations = validateOperationsOntology("strength_focus", [
      makeStructural("update_exercise"),
      makeStructural("update_exercise"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it("returns violation when structural count is below minimum", () => {
    const violations = validateOperationsOntology("strength_focus", [
      { type: "update_session", updates: { coachingNotes: "strength focus" } },
    ]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("STRENGTH_FOCUS");
    expect(violations[0]).toContain("[OntologyTrace]");
  });

  it("counts add_exercise as structural", () => {
    const violations = validateOperationsOntology("power_explosive_focus", [
      { type: "add_exercise" },
      makeStructural("update_exercise"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it("counts replace_exercise as structural", () => {
    const violations = validateOperationsOntology("exercise_swap", [
      { type: "replace_exercise" },
    ]);
    expect(violations).toHaveLength(0);
  });

  it("text-only update_session does NOT count as structural", () => {
    const violations = validateOperationsOntology("reactive_focus", [
      { type: "update_session", updates: { coachingNotes: "reactive quality", emphasis: "stiffness" } },
    ]);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("update_exercise with only notes does NOT count as structural", () => {
    const violations = validateOperationsOntology("hypertrophy_focus", [
      { type: "update_exercise", updates: { notes: "feel the muscle" } },
    ]);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("returns empty array for non-mutation families (no command to validate against)", () => {
    expect(validateOperationsOntology("greeting" as any, [])).toHaveLength(0);
    expect(validateOperationsOntology("clarification_required" as any, [])).toHaveLength(0);
  });

  it("returns empty array when changes list is empty but family requires only 1 structural change", () => {
    const violations = validateOperationsOntology("add_exercise", []);
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8 — New family coverage
// ═══════════════════════════════════════════════════════════════════════════════

describe("New athletic/mobility families are fully registered", () => {
  const NEW_FAMILIES = [
    "reactive_focus",
    "cod_decel_focus",
    "footwork_rhythm_focus",
    "rom_restoration_focus",
    "tissue_stiffness_focus",
    "tendon_resilience_focus",
    "end_range_control_focus",
    "mobility_flow_focus",
    "unilateral_emphasis",
    "posterior_chain_emphasis",
    "trunk_core_emphasis",
    "speed_focus",
    "athletic_performance_focus",
  ] as const;

  for (const fam of NEW_FAMILIES) {
    it(`${fam} is in getMutationFamilies()`, () => {
      expect(getMutationFamilies()).toContain(fam);
    });

    it(`${fam} resolves to a canonical command`, () => {
      const cmd = resolveMutationCommand(fam);
      expect(cmd).not.toBeNull();
      expect(cmd!.minimumStructuralChanges).toBeGreaterThanOrEqual(1);
    });

    it(`${fam} has antiPatterns and aiDirective`, () => {
      const cmd = resolveMutationCommand(fam)!;
      expect(cmd.antiPatterns.length).toBeGreaterThan(0);
      expect(cmd.aiDirective.length).toBeGreaterThan(20);
    });
  }
});
