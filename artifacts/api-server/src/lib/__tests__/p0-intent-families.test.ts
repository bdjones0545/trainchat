/**
 * P0 Intent Family Tests — Mode-Aware Semantic Classification
 *
 * Tests all four new P0 intent families added during the semantic intent audit:
 *   - cod_decel_focus (Speed mode — change of direction / deceleration)
 *   - footwork_rhythm_focus (Speed mode — ladder / quicker feet / rhythm)
 *   - rom_restoration_focus (Mobility mode — range of motion / open up / loosen up)
 *   - tissue_stiffness_focus (Mobility mode — stiffness / tightness / tissue release)
 *
 * Also tests the reactive_focus synonym extensions:
 *   - snappier, lighter on the ground, crisp contacts, pop off the ground
 *
 * And tests the misrouting guards:
 *   - "change of direction" no longer routes to power_explosive_focus
 *   - "faster feet" no longer routes to speed_focus
 *   - "less stiffness" no longer routes to clarification_required
 *   - "open my hips" no longer routes to clarification_required
 */

import { describe, it, expect } from "vitest";
import { normalizeToIntentFamily } from "../intent-family-engine";

// ─── COD / Decel Focus ────────────────────────────────────────────────────────

describe("cod_decel_focus — core deceleration commands", () => {
  it("'More decel' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("More decel").family).toBe("cod_decel_focus");
  });

  it("'Better deceleration' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Better deceleration").family).toBe("cod_decel_focus");
  });

  it("'Decel mechanics' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Improve my decel mechanics").family).toBe("cod_decel_focus");
  });

  it("'Less braking' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Less braking").family).toBe("cod_decel_focus");
  });

  it("'Improve braking' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Improve braking mechanics").family).toBe("cod_decel_focus");
  });

  it("'Stop faster' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("I need to stop faster").family).toBe("cod_decel_focus");
  });

  it("'Stop and go' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Add more stop and go work").family).toBe("cod_decel_focus");
  });

  it("'T-drill' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Add T-drill to my sessions").family).toBe("cod_decel_focus");
  });

  it("'505 drill' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("More 505 drill work").family).toBe("cod_decel_focus");
  });

  it("'Pro agility drill' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Add pro agility drill to my training").family).toBe("cod_decel_focus");
  });

  it("'Landing mechanics' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Improve landing mechanics").family).toBe("cod_decel_focus");
  });

  it("'Better agility' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Better agility").family).toBe("cod_decel_focus");
  });

  it("'Agility training' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Add more agility training").family).toBe("cod_decel_focus");
  });

  it("'COD work' resolves to cod_decel_focus", () => {
    expect(normalizeToIntentFamily("Add COD work to my program").family).toBe("cod_decel_focus");
  });
});

describe("cod_decel_focus — misrouting guard: change of direction no longer hits power_explosive_focus", () => {
  it("'Change of direction' resolves to cod_decel_focus, NOT power_explosive_focus", () => {
    const result = normalizeToIntentFamily("I need to work on my change of direction");
    expect(result.family).toBe("cod_decel_focus");
    expect(result.family).not.toBe("power_explosive_focus");
  });

  it("'Cutting ability' resolves to cod_decel_focus", () => {
    const result = normalizeToIntentFamily("Improve my cutting ability");
    expect(result.family).toBe("cod_decel_focus");
  });

  it("'Agility drills' resolves to cod_decel_focus, NOT power_explosive_focus", () => {
    const result = normalizeToIntentFamily("Add more agility drills");
    expect(result.family).toBe("cod_decel_focus");
    expect(result.family).not.toBe("power_explosive_focus");
  });
});

// ─── Footwork / Rhythm Focus ──────────────────────────────────────────────────

describe("footwork_rhythm_focus — core footwork commands", () => {
  it("'More footwork' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("More footwork").family).toBe("footwork_rhythm_focus");
  });

  it("'Better footwork' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Better footwork").family).toBe("footwork_rhythm_focus");
  });

  it("'Quicker feet' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("I need quicker feet").family).toBe("footwork_rhythm_focus");
  });

  it("'Faster feet' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Faster feet").family).toBe("footwork_rhythm_focus");
  });

  it("'Quick feet' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Add quick feet drills").family).toBe("footwork_rhythm_focus");
  });

  it("'Ladder work' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Add ladder work").family).toBe("footwork_rhythm_focus");
  });

  it("'Ladder drills' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("More ladder drills").family).toBe("footwork_rhythm_focus");
  });

  it("'Speed ladder' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Add speed ladder to warm-up").family).toBe("footwork_rhythm_focus");
  });

  it("'Agility ladder' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Agility ladder work").family).toBe("footwork_rhythm_focus");
  });

  it("'Foot speed' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("I want to improve my foot speed").family).toBe("footwork_rhythm_focus");
  });

  it("'Foot coordination' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Better foot coordination").family).toBe("footwork_rhythm_focus");
  });

  it("'Rhythm training' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("More rhythm training").family).toBe("footwork_rhythm_focus");
  });

  it("'Coordination drills' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Add coordination drills").family).toBe("footwork_rhythm_focus");
  });

  it("'Lateral shuffle' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Add lateral shuffle patterns").family).toBe("footwork_rhythm_focus");
  });

  it("'Shadow footwork' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Add shadow footwork drills").family).toBe("footwork_rhythm_focus");
  });

  it("'Mirror drill' resolves to footwork_rhythm_focus", () => {
    expect(normalizeToIntentFamily("Add mirror drill to the session").family).toBe("footwork_rhythm_focus");
  });
});

describe("footwork_rhythm_focus — misrouting guard: 'faster feet' no longer routes to speed_focus", () => {
  it("'Faster feet' resolves to footwork_rhythm_focus, NOT speed_focus", () => {
    const result = normalizeToIntentFamily("I want faster feet");
    expect(result.family).toBe("footwork_rhythm_focus");
    expect(result.family).not.toBe("speed_focus");
  });
});

// ─── ROM Restoration Focus ────────────────────────────────────────────────────

describe("rom_restoration_focus — core range of motion commands", () => {
  it("'More range' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("I want more range").family).toBe("rom_restoration_focus");
  });

  it("'Better range' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Better range of motion").family).toBe("rom_restoration_focus");
  });

  it("'Restore my range' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Help me restore my range").family).toBe("rom_restoration_focus");
  });

  it("'Gain more range' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("I want to gain more range").family).toBe("rom_restoration_focus");
  });

  it("'Increase ROM' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Increase my ROM").family).toBe("rom_restoration_focus");
  });

  it("'Open up my hips' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Open up my hips").family).toBe("rom_restoration_focus");
  });

  it("'Open my hips' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Open my hips").family).toBe("rom_restoration_focus");
  });

  it("'Open up my shoulders' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Open up my shoulders").family).toBe("rom_restoration_focus");
  });

  it("'Open up my thoracic' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Open up my thoracic spine").family).toBe("rom_restoration_focus");
  });

  it("'Loosen up' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("I need to loosen up").family).toBe("rom_restoration_focus");
  });

  it("'Loosen up my hips' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Loosen up my hips").family).toBe("rom_restoration_focus");
  });

  it("'Feel less tight' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("I want to feel less tight").family).toBe("rom_restoration_focus");
  });

  it("'Restore my flexibility' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Restore my flexibility").family).toBe("rom_restoration_focus");
  });

  it("'Restore my mobility' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Help restore my mobility").family).toBe("rom_restoration_focus");
  });

  it("'Less restricted' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("I feel less restricted in my hips").family).toBe("rom_restoration_focus");
  });

  it("'Hip opener' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("More hip opener work").family).toBe("rom_restoration_focus");
  });

  it("'Hip mobility work' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Add more hip mobility work").family).toBe("rom_restoration_focus");
  });

  it("'Thoracic mobility' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Improve thoracic mobility").family).toBe("rom_restoration_focus");
  });

  it("'Ankle mobility' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Add ankle mobility work").family).toBe("rom_restoration_focus");
  });

  it("'Ankle dorsiflexion' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("Improve ankle dorsiflexion").family).toBe("rom_restoration_focus");
  });

  it("'Less aggressive on the stretching' resolves to rom_restoration_focus", () => {
    expect(normalizeToIntentFamily("A bit less aggressive on the stretching").family).toBe("rom_restoration_focus");
  });
});

describe("rom_restoration_focus — misrouting guard: 'open my hips' no longer routes to clarification_required", () => {
  it("'Open my hips' resolves to rom_restoration_focus, NOT clarification_required", () => {
    const result = normalizeToIntentFamily("Open my hips");
    expect(result.family).toBe("rom_restoration_focus");
    expect(result.family).not.toBe("clarification_required");
  });

  it("'More range' resolves to rom_restoration_focus, NOT clarification_required", () => {
    const result = normalizeToIntentFamily("More range");
    expect(result.family).toBe("rom_restoration_focus");
    expect(result.family).not.toBe("clarification_required");
  });

  it("'Loosen up' resolves to rom_restoration_focus, NOT clarification_required", () => {
    const result = normalizeToIntentFamily("Loosen up");
    expect(result.family).toBe("rom_restoration_focus");
    expect(result.family).not.toBe("clarification_required");
  });
});

// ─── Tissue Stiffness Focus ───────────────────────────────────────────────────

describe("tissue_stiffness_focus — core stiffness commands", () => {
  it("'Less stiffness' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Less stiffness").family).toBe("tissue_stiffness_focus");
  });

  it("'Reduce stiffness' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Reduce stiffness").family).toBe("tissue_stiffness_focus");
  });

  it("'Feel less stiff' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("I want to feel less stiff").family).toBe("tissue_stiffness_focus");
  });

  it("'Too stiff' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("I feel too stiff after training").family).toBe("tissue_stiffness_focus");
  });

  it("'Morning stiffness' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Help with my morning stiffness").family).toBe("tissue_stiffness_focus");
  });

  it("'Chronic tightness' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("I have chronic tightness in my hips").family).toBe("tissue_stiffness_focus");
  });

  it("'Post-training stiffness' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("I get post-training stiffness").family).toBe("tissue_stiffness_focus");
  });

  it("'Tissue release' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Add more tissue release work").family).toBe("tissue_stiffness_focus");
  });

  it("'Myofascial release' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Add myofascial release").family).toBe("tissue_stiffness_focus");
  });

  it("'Foam rolling' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Add foam rolling to the session").family).toBe("tissue_stiffness_focus");
  });

  it("'Release tension' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Help release tension in my hips").family).toBe("tissue_stiffness_focus");
  });

  it("'Reduce tightness' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Reduce tightness in my back").family).toBe("tissue_stiffness_focus");
  });

  it("'Feel stuck in my hips' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("I feel stuck in my hips").family).toBe("tissue_stiffness_focus");
  });

  it("'Stiff back' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("My back is stiff all the time").family).toBe("tissue_stiffness_focus");
  });

  it("'Loaded stretching' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Add loaded stretching").family).toBe("tissue_stiffness_focus");
  });

  it("'PNF stretch' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Add PNF stretch work").family).toBe("tissue_stiffness_focus");
  });

  it("'Contract-relax' resolves to tissue_stiffness_focus", () => {
    expect(normalizeToIntentFamily("Add contract-relax sequences").family).toBe("tissue_stiffness_focus");
  });
});

describe("tissue_stiffness_focus — misrouting guard: 'less stiffness' no longer routes to clarification_required", () => {
  it("'Less stiffness' resolves to tissue_stiffness_focus, NOT clarification_required", () => {
    const result = normalizeToIntentFamily("Less stiffness");
    expect(result.family).toBe("tissue_stiffness_focus");
    expect(result.family).not.toBe("clarification_required");
  });

  it("'Reduce stiffness' resolves to tissue_stiffness_focus, NOT clarification_required", () => {
    const result = normalizeToIntentFamily("Reduce stiffness");
    expect(result.family).toBe("tissue_stiffness_focus");
    expect(result.family).not.toBe("clarification_required");
  });
});

// ─── reactive_focus synonym extensions ───────────────────────────────────────

describe("reactive_focus — new synonym patterns (snappier / lighter on ground / crisp / pop)", () => {
  it("'Snappier' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("Make it snappier").family).toBe("reactive_focus");
  });

  it("'More snap' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("More snap off the floor").family).toBe("reactive_focus");
  });

  it("'Snappy off the ground' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("I want to be snappy off the ground").family).toBe("reactive_focus");
  });

  it("'Lighter on the ground' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("I want to be lighter on the ground").family).toBe("reactive_focus");
  });

  it("'Lighter on the floor' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("Lighter on the floor").family).toBe("reactive_focus");
  });

  it("'Light on my feet' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("I want to feel light on my feet").family).toBe("reactive_focus");
  });

  it("'Crisper contacts' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("Crisper contacts").family).toBe("reactive_focus");
  });

  it("'More crisp' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("Make my landings more crisp").family).toBe("reactive_focus");
  });

  it("'Crisp off the ground' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("Crisp off the ground").family).toBe("reactive_focus");
  });

  it("'Pop off the ground' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("I want to pop off the ground").family).toBe("reactive_focus");
  });

  it("'Pop off the floor' resolves to reactive_focus", () => {
    expect(normalizeToIntentFamily("More pop off the floor").family).toBe("reactive_focus");
  });
});

describe("reactive_focus synonym guard: new phrases NOT misrouted to clarification_required", () => {
  it("'Snappier' resolves to reactive_focus, NOT clarification_required", () => {
    const result = normalizeToIntentFamily("Snappier");
    expect(result.family).toBe("reactive_focus");
    expect(result.family).not.toBe("clarification_required");
  });

  it("'Lighter on the ground' resolves to reactive_focus, NOT clarification_required", () => {
    const result = normalizeToIntentFamily("Lighter on the ground");
    expect(result.family).toBe("reactive_focus");
    expect(result.family).not.toBe("clarification_required");
  });

  it("'Pop off the ground' resolves to reactive_focus, NOT clarification_required", () => {
    const result = normalizeToIntentFamily("Pop off the ground");
    expect(result.family).toBe("reactive_focus");
    expect(result.family).not.toBe("clarification_required");
  });
});

// ─── Regression guard: existing correct routings must still pass ──────────────

describe("regression guard — pre-existing families unaffected by new additions", () => {
  it("'More explosive' still routes to power_explosive_focus", () => {
    expect(normalizeToIntentFamily("More explosive").family).toBe("power_explosive_focus");
  });

  it("'More speed' still routes to speed_focus", () => {
    expect(normalizeToIntentFamily("More speed").family).toBe("speed_focus");
  });

  it("'Get faster' still routes to speed_focus", () => {
    expect(normalizeToIntentFamily("Get faster").family).toBe("speed_focus");
  });

  it("'Reduce ground contact time' still routes to reactive_focus", () => {
    expect(normalizeToIntentFamily("Reduce ground contact time").family).toBe("reactive_focus");
  });

  it("'More reactive' still routes to reactive_focus", () => {
    expect(normalizeToIntentFamily("More reactive").family).toBe("reactive_focus");
  });

  it("'More elastic' still routes to reactive_focus", () => {
    expect(normalizeToIntentFamily("Make this more elastic").family).toBe("reactive_focus");
  });

  it("'More mobility' still routes to mobility_support", () => {
    expect(normalizeToIntentFamily("More mobility").family).toBe("mobility_support");
  });

  it("'Tight hips' still routes to mobility_support", () => {
    expect(normalizeToIntentFamily("My hips are tight").family).toBe("mobility_support");
  });

  it("'Add flexibility' still routes to mobility_support", () => {
    expect(normalizeToIntentFamily("Add flexibility work").family).toBe("mobility_support");
  });

  it("'More strength' still routes to strength_focus", () => {
    expect(normalizeToIntentFamily("More strength").family).toBe("strength_focus");
  });

  it("'Make it harder' still routes to increase_difficulty", () => {
    expect(normalizeToIntentFamily("Make it harder").family).toBe("increase_difficulty");
  });

  it("'Deload' still routes to recovery_focus", () => {
    expect(normalizeToIntentFamily("I need a deload week").family).toBe("recovery_focus");
  });

  it("'Shorten this block' still routes to session_reduction", () => {
    expect(normalizeToIntentFamily("Shorten this block").family).toBe("session_reduction");
  });

  it("'My knee hurts' still routes to injury_modification", () => {
    expect(normalizeToIntentFamily("My knee hurts").family).toBe("injury_modification");
  });
});
