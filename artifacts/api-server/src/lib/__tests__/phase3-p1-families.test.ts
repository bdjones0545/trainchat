/**
 * Phase 3 — P1 Family Tests
 *
 * Validates all 6 new first-class intent families:
 *   1. tendon_resilience_focus   (speed primary)
 *   2. end_range_control_focus   (mobility primary)
 *   3. mobility_flow_focus       (mobility primary)
 *   4. unilateral_emphasis       (strength primary)
 *   5. posterior_chain_emphasis  (strength primary)
 *   6. trunk_core_emphasis       (all modes)
 *
 * Each section tests:
 *   - mode-specific routing (MODE_PRIORITY_PATTERNS pre-pass)
 *   - global routing (FAMILY_PATTERNS fallback, no mode)
 *   - anti-collision guards (must NOT collapse into wrong family)
 *   - debugInfo.matchedBy value
 */

import { describe, it, expect } from "vitest";
import {
  normalizeToIntentFamily,
  getTransformationBundle,
  type IntentFamily,
} from "../intent-family-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const family = (r: ReturnType<typeof normalizeToIntentFamily>) => r.family;
const mode = (r: ReturnType<typeof normalizeToIntentFamily>) => r.debugInfo.matchedBy;

// ─── 1. tendon_resilience_focus ───────────────────────────────────────────────

describe("tendon_resilience_focus — speed mode primary", () => {
  it("'protect my tendons' with speed → tendon_resilience_focus (mode-specific)", () => {
    const r = normalizeToIntentFamily("protect my tendons", "speed");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'reduce tendon load' with speed → tendon_resilience_focus", () => {
    const r = normalizeToIntentFamily("reduce tendon load", "speed");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'easier on my Achilles' with speed → tendon_resilience_focus", () => {
    const r = normalizeToIntentFamily("easier on my Achilles", "speed");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more tendon-friendly' with speed → tendon_resilience_focus", () => {
    const r = normalizeToIntentFamily("more tendon-friendly", "speed");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'less patellar tendon stress' with speed → tendon_resilience_focus", () => {
    const r = normalizeToIntentFamily("less patellar tendon stress", "speed");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'Achilles-friendly' with speed → tendon_resilience_focus", () => {
    const r = normalizeToIntentFamily("make this Achilles-friendly", "speed");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("mode-specific");
  });
});

describe("tendon_resilience_focus — global (no mode)", () => {
  it("'protect my tendons' no mode → tendon_resilience_focus (global)", () => {
    const r = normalizeToIntentFamily("protect my tendons");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("global");
  });

  it("'tendon health' no mode → tendon_resilience_focus", () => {
    const r = normalizeToIntentFamily("improve tendon health");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("global");
  });

  it("'more tendon-friendly training' no mode → tendon_resilience_focus", () => {
    const r = normalizeToIntentFamily("more tendon-friendly training");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("global");
  });

  it("'easier on my Achilles' no mode → tendon_resilience_focus", () => {
    const r = normalizeToIntentFamily("easier on my Achilles");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(mode(r)).toBe("global");
  });
});

describe("tendon_resilience_focus — anti-collision guards", () => {
  it("tendon load with speed mode does NOT route to injury_modification", () => {
    const r = normalizeToIntentFamily("reduce tendon load", "speed");
    expect(family(r)).not.toBe("injury_modification");
  });

  it("tendon load with speed mode does NOT route to recovery_focus", () => {
    const r = normalizeToIntentFamily("protect my tendons", "speed");
    expect(family(r)).not.toBe("recovery_focus");
  });

  it("tendon load with speed mode does NOT route to joint_friendly_modification", () => {
    const r = normalizeToIntentFamily("more tendon-friendly", "speed");
    expect(family(r)).not.toBe("joint_friendly_modification");
  });

  it("explicit pain language still routes to injury_modification (anti-collision other direction)", () => {
    const r = normalizeToIntentFamily("my knee hurts", "speed");
    expect(family(r)).toBe("injury_modification");
  });
});

describe("tendon_resilience_focus — bundle exists", () => {
  it("bundle is defined for tendon_resilience_focus", () => {
    const b = getTransformationBundle("tendon_resilience_focus");
    expect(b).toBeDefined();
    expect(b.intentFamily).toBe("tendon_resilience_focus");
    expect(b.primaryChanges.some((c) => c.type === "add_tendon_prep")).toBe(true);
  });
});

// ─── 2. end_range_control_focus ───────────────────────────────────────────────

describe("end_range_control_focus — mobility mode primary", () => {
  it("'more end-range control' with mobility → end_range_control_focus (mode-specific)", () => {
    const r = normalizeToIntentFamily("more end-range control", "mobility");
    expect(family(r)).toBe("end_range_control_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'PAILs and RAILs' with mobility → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("add PAILs and RAILs", "mobility");
    expect(family(r)).toBe("end_range_control_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'own the position' with mobility → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("I want to own the position", "mobility");
    expect(family(r)).toBe("end_range_control_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'stronger in the end range' with mobility → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("stronger in the end range", "mobility");
    expect(family(r)).toBe("end_range_control_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'active range control' with mobility → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("more active range control", "mobility");
    expect(family(r)).toBe("end_range_control_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'functional range conditioning' with mobility → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("add functional range conditioning", "mobility");
    expect(family(r)).toBe("end_range_control_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'FRC work' with mobility → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("more FRC work", "mobility");
    expect(family(r)).toBe("end_range_control_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'isometric at end range' with mobility → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("add isometric at end range", "mobility");
    expect(family(r)).toBe("end_range_control_focus");
    expect(mode(r)).toBe("mode-specific");
  });
});

describe("end_range_control_focus — global (no mode)", () => {
  it("'end-range strength' no mode → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("more end-range strength");
    expect(family(r)).toBe("end_range_control_focus");
  });

  it("'PAILs' no mode → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("I want to add PAILs");
    expect(family(r)).toBe("end_range_control_focus");
  });

  it("'loaded end range' no mode → end_range_control_focus", () => {
    const r = normalizeToIntentFamily("more loaded end range work");
    expect(family(r)).toBe("end_range_control_focus");
  });
});

describe("end_range_control_focus — anti-collision guards", () => {
  it("PAILs/RAILs does NOT route to rom_restoration_focus", () => {
    const r = normalizeToIntentFamily("add PAILs and RAILs", "mobility");
    expect(family(r)).not.toBe("rom_restoration_focus");
  });

  it("'own the position' does NOT route to rom_restoration_focus", () => {
    const r = normalizeToIntentFamily("I want to own the position", "mobility");
    expect(family(r)).not.toBe("rom_restoration_focus");
  });

  it("'more end-range control' does NOT route to tissue_stiffness_focus", () => {
    const r = normalizeToIntentFamily("more end-range control", "mobility");
    expect(family(r)).not.toBe("tissue_stiffness_focus");
  });

  it("passive ROM language still goes to rom_restoration_focus (anti-collision other direction)", () => {
    const r = normalizeToIntentFamily("more range of motion", "mobility");
    expect(family(r)).toBe("rom_restoration_focus");
  });
});

describe("end_range_control_focus — bundle exists", () => {
  it("bundle is defined with add_end_range_strength", () => {
    const b = getTransformationBundle("end_range_control_focus");
    expect(b).toBeDefined();
    expect(b.intentFamily).toBe("end_range_control_focus");
    expect(b.primaryChanges.some((c) => c.type === "add_end_range_strength")).toBe(true);
  });
});

// ─── 3. mobility_flow_focus ───────────────────────────────────────────────────

describe("mobility_flow_focus — mobility mode primary", () => {
  it("'more flow' with mobility → mobility_flow_focus (mode-specific)", () => {
    const r = normalizeToIntentFamily("more flow", "mobility");
    expect(family(r)).toBe("mobility_flow_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'smoother mobility flow' with mobility → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("I want smoother mobility flow", "mobility");
    expect(family(r)).toBe("mobility_flow_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'connective movement' with mobility → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("more connective movement", "mobility");
    expect(family(r)).toBe("mobility_flow_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'integrated mobility sequence' with mobility → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("more integrated mobility sequence", "mobility");
    expect(family(r)).toBe("mobility_flow_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'less segmented mobility' with mobility → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("less segmented mobility", "mobility");
    expect(family(r)).toBe("mobility_flow_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'movement flow' with mobility → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("I want more movement flow", "mobility");
    expect(family(r)).toBe("mobility_flow_focus");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'continuous flow' with mobility → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("more continuous flow", "mobility");
    expect(family(r)).toBe("mobility_flow_focus");
    expect(mode(r)).toBe("mode-specific");
  });
});

describe("mobility_flow_focus — global (no mode)", () => {
  it("'mobility flow' no mode → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("add mobility flow");
    expect(family(r)).toBe("mobility_flow_focus");
  });

  it("'connective movement' no mode → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("more connective movement sequences");
    expect(family(r)).toBe("mobility_flow_focus");
  });

  it("'smoother transitions' no mode → mobility_flow_focus", () => {
    const r = normalizeToIntentFamily("smoother transitions between movements");
    expect(family(r)).toBe("mobility_flow_focus");
  });
});

describe("mobility_flow_focus — anti-collision guards", () => {
  it("'more flow' with mobility does NOT route to recovery_focus", () => {
    const r = normalizeToIntentFamily("more flow", "mobility");
    expect(family(r)).not.toBe("recovery_focus");
  });

  it("'mobility flow' does NOT route to mobility_support", () => {
    const r = normalizeToIntentFamily("add mobility flow");
    expect(family(r)).not.toBe("mobility_support");
  });

  it("'smoother mobility flow' does NOT route to recovery_focus", () => {
    const r = normalizeToIntentFamily("smoother mobility flow", "mobility");
    expect(family(r)).not.toBe("recovery_focus");
  });

  it("restorative language still goes to recovery_focus (anti-collision other direction)", () => {
    const r = normalizeToIntentFamily("more restorative session", "mobility");
    expect(family(r)).toBe("recovery_focus");
  });
});

describe("mobility_flow_focus — bundle exists", () => {
  it("bundle is defined with add_flow_sequence", () => {
    const b = getTransformationBundle("mobility_flow_focus");
    expect(b).toBeDefined();
    expect(b.intentFamily).toBe("mobility_flow_focus");
    expect(b.primaryChanges.some((c) => c.type === "add_flow_sequence")).toBe(true);
  });
});

// ─── 4. unilateral_emphasis ───────────────────────────────────────────────────

describe("unilateral_emphasis — strength mode primary", () => {
  it("'more unilateral' with strength → unilateral_emphasis (mode-specific)", () => {
    const r = normalizeToIntentFamily("more unilateral work", "strength");
    expect(family(r)).toBe("unilateral_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more single-leg work' with strength → unilateral_emphasis", () => {
    const r = normalizeToIntentFamily("more single-leg work", "strength");
    expect(family(r)).toBe("unilateral_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more one-leg work' with strength → unilateral_emphasis", () => {
    const r = normalizeToIntentFamily("more one-leg work", "strength");
    expect(family(r)).toBe("unilateral_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'less bilateral' with strength → unilateral_emphasis", () => {
    const r = normalizeToIntentFamily("less bilateral exercises", "strength");
    expect(family(r)).toBe("unilateral_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more split stance' with strength → unilateral_emphasis", () => {
    const r = normalizeToIntentFamily("more split stance work", "strength");
    expect(family(r)).toBe("unilateral_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'single-leg focus' with strength → unilateral_emphasis", () => {
    const r = normalizeToIntentFamily("I want a single-leg focus", "strength");
    expect(family(r)).toBe("unilateral_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });
});

describe("unilateral_emphasis — global (no mode)", () => {
  it("'more unilateral' no mode → unilateral_emphasis", () => {
    const r = normalizeToIntentFamily("more unilateral training");
    expect(family(r)).toBe("unilateral_emphasis");
  });

  it("'unilateral emphasis' no mode → unilateral_emphasis", () => {
    const r = normalizeToIntentFamily("add unilateral emphasis");
    expect(family(r)).toBe("unilateral_emphasis");
  });

  it("'more single-leg' no mode → unilateral_emphasis", () => {
    const r = normalizeToIntentFamily("more single-leg exercises");
    expect(family(r)).toBe("unilateral_emphasis");
  });
});

describe("unilateral_emphasis — anti-collision guards", () => {
  it("does NOT route to exercise_swap (not a one-off swap)", () => {
    const r = normalizeToIntentFamily("more unilateral work", "strength");
    expect(family(r)).not.toBe("exercise_swap");
  });

  it("does NOT route to add_exercise", () => {
    const r = normalizeToIntentFamily("more single-leg work", "strength");
    expect(family(r)).not.toBe("add_exercise");
  });

  it("does NOT route to hypertrophy_focus", () => {
    const r = normalizeToIntentFamily("more unilateral work", "strength");
    expect(family(r)).not.toBe("hypertrophy_focus");
  });
});

describe("unilateral_emphasis — bundle exists", () => {
  it("bundle is defined with add_unilateral_work", () => {
    const b = getTransformationBundle("unilateral_emphasis");
    expect(b).toBeDefined();
    expect(b.intentFamily).toBe("unilateral_emphasis");
    expect(b.primaryChanges.some((c) => c.type === "add_unilateral_work")).toBe(true);
  });
});

// ─── 5. posterior_chain_emphasis ─────────────────────────────────────────────

describe("posterior_chain_emphasis — strength mode primary", () => {
  it("'more posterior chain' with strength → posterior_chain_emphasis (mode-specific)", () => {
    const r = normalizeToIntentFamily("more posterior chain", "strength");
    expect(family(r)).toBe("posterior_chain_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more hamstrings' with strength → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("more hamstrings", "strength");
    expect(family(r)).toBe("posterior_chain_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more glutes' with strength → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("more glutes", "strength");
    expect(family(r)).toBe("posterior_chain_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more hinge work' with strength → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("more hinge work", "strength");
    expect(family(r)).toBe("posterior_chain_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more pulling' with strength → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("more pulling", "strength");
    expect(family(r)).toBe("posterior_chain_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'backside emphasis' with strength → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("more backside emphasis", "strength");
    expect(family(r)).toBe("posterior_chain_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more RDL' with strength → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("more RDL work", "strength");
    expect(family(r)).toBe("posterior_chain_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'glute dominant' with strength → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("make it more glute dominant", "strength");
    expect(family(r)).toBe("posterior_chain_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });
});

describe("posterior_chain_emphasis — global (no mode)", () => {
  it("'more posterior chain' no mode → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("more posterior chain work");
    expect(family(r)).toBe("posterior_chain_emphasis");
  });

  it("'more hamstrings' no mode → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("add more hamstring work");
    expect(family(r)).toBe("posterior_chain_emphasis");
  });

  it("'more glutes' no mode → posterior_chain_emphasis", () => {
    const r = normalizeToIntentFamily("I need more glute work");
    expect(family(r)).toBe("posterior_chain_emphasis");
  });
});

describe("posterior_chain_emphasis — anti-collision guards", () => {
  it("'more hamstrings' does NOT route to hypertrophy_focus", () => {
    const r = normalizeToIntentFamily("more hamstrings", "strength");
    expect(family(r)).not.toBe("hypertrophy_focus");
  });

  it("'more glutes' does NOT route to hypertrophy_focus", () => {
    const r = normalizeToIntentFamily("more glutes", "strength");
    expect(family(r)).not.toBe("hypertrophy_focus");
  });

  it("'more pulling' does NOT route to session_expansion", () => {
    const r = normalizeToIntentFamily("more pulling", "strength");
    expect(family(r)).not.toBe("session_expansion");
  });
});

describe("posterior_chain_emphasis — bundle exists", () => {
  it("bundle is defined with add_posterior_chain", () => {
    const b = getTransformationBundle("posterior_chain_emphasis");
    expect(b).toBeDefined();
    expect(b.intentFamily).toBe("posterior_chain_emphasis");
    expect(b.primaryChanges.some((c) => c.type === "add_posterior_chain")).toBe(true);
  });
});

// ─── 6. trunk_core_emphasis ───────────────────────────────────────────────────

describe("trunk_core_emphasis — strength mode", () => {
  it("'more core' with strength → trunk_core_emphasis (mode-specific)", () => {
    const r = normalizeToIntentFamily("more core", "strength");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more anti-rotation' with strength → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more anti-rotation work", "strength");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'trunk stability' with strength → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more trunk stability", "strength");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'midline stability' with strength → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more midline stability", "strength");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'pillar strength' with strength → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more pillar strength work", "strength");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'core emphasis' with strength → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("add core emphasis", "strength");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more anti-extension' with strength → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more anti-extension work", "strength");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });
});

describe("trunk_core_emphasis — speed mode", () => {
  it("'more core' with speed → trunk_core_emphasis (mode-specific)", () => {
    const r = normalizeToIntentFamily("more core", "speed");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'trunk stiffness' with speed → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more trunk stiffness", "speed");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'midline stability' with speed → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more midline stability", "speed");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'more anti-rotation' with speed → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more anti-rotation", "speed");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });
});

describe("trunk_core_emphasis — mobility mode", () => {
  it("'more core' with mobility → trunk_core_emphasis (mode-specific)", () => {
    const r = normalizeToIntentFamily("more core", "mobility");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'trunk control' with mobility → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more trunk control", "mobility");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'positional trunk control' with mobility → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more positional trunk control", "mobility");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });

  it("'deadbug work' with mobility → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("add deadbug work", "mobility");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(mode(r)).toBe("mode-specific");
  });
});

describe("trunk_core_emphasis — global (no mode)", () => {
  it("'more core work' no mode → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more core work");
    expect(family(r)).toBe("trunk_core_emphasis");
  });

  it("'more trunk stability' no mode → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more trunk stability training");
    expect(family(r)).toBe("trunk_core_emphasis");
  });

  it("'more anti-rotation' no mode → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("more anti-rotation");
    expect(family(r)).toBe("trunk_core_emphasis");
  });

  it("'core emphasis' no mode → trunk_core_emphasis", () => {
    const r = normalizeToIntentFamily("add core emphasis");
    expect(family(r)).toBe("trunk_core_emphasis");
  });
});

describe("trunk_core_emphasis — anti-collision guards", () => {
  it("'more core' with strength does NOT route to hypertrophy_focus", () => {
    const r = normalizeToIntentFamily("more core", "strength");
    expect(family(r)).not.toBe("hypertrophy_focus");
  });

  it("'more core' with strength does NOT route to session_expansion", () => {
    const r = normalizeToIntentFamily("more core", "strength");
    expect(family(r)).not.toBe("session_expansion");
  });

  it("'more core' with mobility does NOT route to recovery_focus", () => {
    const r = normalizeToIntentFamily("more core", "mobility");
    expect(family(r)).not.toBe("recovery_focus");
  });

  it("'more core' with mobility does NOT route to mobility_support", () => {
    const r = normalizeToIntentFamily("more core", "mobility");
    expect(family(r)).not.toBe("mobility_support");
  });

  it("'more anti-rotation' does NOT route to session_expansion", () => {
    const r = normalizeToIntentFamily("more anti-rotation", "strength");
    expect(family(r)).not.toBe("session_expansion");
  });
});

describe("trunk_core_emphasis — bundle exists", () => {
  it("bundle is defined with add_core_stability", () => {
    const b = getTransformationBundle("trunk_core_emphasis");
    expect(b).toBeDefined();
    expect(b.intentFamily).toBe("trunk_core_emphasis");
    expect(b.primaryChanges.some((c) => c.type === "add_core_stability")).toBe(true);
  });
});

// ─── Cross-mode validation cases from spec ────────────────────────────────────

describe("spec validation — cross-mode routing", () => {
  it("'more core' in strength → trunk_core_emphasis", () => {
    expect(family(normalizeToIntentFamily("more core", "strength"))).toBe("trunk_core_emphasis");
  });

  it("'more core' in mobility → trunk_core_emphasis (not recovery or mobility_support)", () => {
    const r = normalizeToIntentFamily("more core", "mobility");
    expect(family(r)).toBe("trunk_core_emphasis");
    expect(family(r)).not.toBe("recovery_focus");
    expect(family(r)).not.toBe("mobility_support");
  });

  it("'more flow' in mobility → mobility_flow_focus (not recovery_focus)", () => {
    const r = normalizeToIntentFamily("more flow", "mobility");
    expect(family(r)).toBe("mobility_flow_focus");
    expect(family(r)).not.toBe("recovery_focus");
  });

  it("'protect my tendons' in speed → tendon_resilience_focus (not injury_modification)", () => {
    const r = normalizeToIntentFamily("protect my tendons", "speed");
    expect(family(r)).toBe("tendon_resilience_focus");
    expect(family(r)).not.toBe("injury_modification");
  });

  it("'more unilateral' in strength → unilateral_emphasis (not exercise_swap)", () => {
    const r = normalizeToIntentFamily("more unilateral", "strength");
    expect(family(r)).toBe("unilateral_emphasis");
    expect(family(r)).not.toBe("exercise_swap");
  });

  it("'more unilateral' with no mode → unilateral_emphasis (stable outside strength)", () => {
    const r = normalizeToIntentFamily("more unilateral");
    expect(family(r)).toBe("unilateral_emphasis");
  });
});

// ─── Phase 2 behavior still stable after Phase 3 ─────────────────────────────

describe("Phase 2 backward compat — no regression from Phase 3 additions", () => {
  it("'more restorative' with mobility still → recovery_focus", () => {
    expect(family(normalizeToIntentFamily("more restorative session", "mobility"))).toBe("recovery_focus");
  });

  it("'deeper stretch' with mobility still → rom_restoration_focus", () => {
    expect(family(normalizeToIntentFamily("deeper stretch", "mobility"))).toBe("rom_restoration_focus");
  });

  it("'more explosive' with strength still → power_explosive_focus", () => {
    expect(family(normalizeToIntentFamily("more explosive", "strength"))).toBe("power_explosive_focus");
  });

  it("'quickness' with speed still → footwork_rhythm_focus", () => {
    expect(family(normalizeToIntentFamily("more quickness", "speed"))).toBe("footwork_rhythm_focus");
  });

  it("'change of direction' with speed still → cod_decel_focus", () => {
    expect(family(normalizeToIntentFamily("better change of direction", "speed"))).toBe("cod_decel_focus");
  });

  it("'more range' still → rom_restoration_focus globally", () => {
    expect(family(normalizeToIntentFamily("more range of motion"))).toBe("rom_restoration_focus");
  });

  it("'my knee hurts' still → injury_modification (pain language dominant)", () => {
    expect(family(normalizeToIntentFamily("my knee hurts"))).toBe("injury_modification");
  });

  it("'shorter workout' still → reduce_time", () => {
    expect(["reduce_time", "session_reduction"]).toContain(
      family(normalizeToIntentFamily("shorter workout")),
    );
  });

  it("'more strength' still → strength_focus", () => {
    expect(family(normalizeToIntentFamily("more strength"))).toBe("strength_focus");
  });
});
