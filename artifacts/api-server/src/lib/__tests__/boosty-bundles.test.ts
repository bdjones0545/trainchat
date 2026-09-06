/**
 * boosty-bundles.test.ts
 *
 * Bundles are the one SKU kind that grants something other than itself, which
 * makes two things go wrong quietly:
 *   - a bundle that grants a SKU id that does not exist sells nothing;
 *   - a bundle priced above its own contents is worse than buying the parts,
 *     and nobody notices until a customer does the arithmetic.
 * Both are asserted rather than trusted.
 */

import { describe, it, expect } from "vitest";
import {
  BOOSTY_SKUS, getSku, grantsFor, sparksFor, auditBundles,
} from "../boostyCatalog";

describe("BOOSTY bundle catalog", () => {
  it("every bundle offer is arithmetically honest", () => {
    // Fails loudly with the specific offer named, rather than a bare boolean.
    expect(auditBundles()).toEqual([]);
  });

  it("every granted id refers to a real SKU", () => {
    for (const sku of BOOSTY_SKUS) {
      for (const id of sku.grants ?? []) {
        expect(getSku(id), `${sku.id} grants unknown SKU "${id}"`).toBeTruthy();
      }
    }
  });

  it("a subset bundle expands to itself plus its contents", () => {
    const trails = getSku("bundle.trails")!;
    const granted = grantsFor(trails);
    expect(granted).toContain("bundle.trails");
    expect(granted).toContain("trail.void");
    expect(granted).toContain("trail.glitter");
    expect(granted.length).toBe(5); // itself + 4 trails
  });

  it("bundle.all does NOT enumerate contents — it is the everything flag", () => {
    const all = getSku("bundle.all")!;
    expect(all.everything).toBe(true);
    expect(grantsFor(all)).toEqual(["bundle.all"]);
  });

  it("a subset bundle must never imply future cosmetics", () => {
    for (const sku of BOOSTY_SKUS) {
      if (sku.kind !== "bundle" || sku.id === "bundle.all") continue;
      expect(sku.everything, `${sku.id} must not set everything`).not.toBe(true);
    }
  });

  it("the Rookie Kit carries sparks; pure cosmetics do not", () => {
    expect(sparksFor(getSku("bundle.rookie")!)).toBe(1000);
    expect(sparksFor(getSku("bundle.pilots")!)).toBe(0);
    expect(sparksFor(getSku("wigsby")!)).toBe(0);
    expect(sparksFor(getSku("sparks.large")!)).toBe(15000);
  });

  it("the all-inclusive bundle stays the best deal", () => {
    const all = getSku("bundle.all")!;
    const pilots = getSku("bundle.pilots")!;
    const trails = getSku("bundle.trails")!;
    // Buying the two big subsets must cost more than buying everything,
    // or the ladder inverts and bundle.all becomes pointless.
    expect(pilots.cents + trails.cents).toBeGreaterThan(all.cents);
  });

  it("Flight Crew covers every premium pilot", () => {
    const premium = BOOSTY_SKUS
      .filter((s) => s.kind === "cosmetic" && !s.id.startsWith("trail."))
      .map((s) => s.id);
    const granted = grantsFor(getSku("bundle.pilots")!);
    for (const id of premium) expect(granted, `missing ${id}`).toContain(id);
  });

  it("Full Exhaust covers every premium trail", () => {
    const premium = BOOSTY_SKUS.filter((s) => s.id.startsWith("trail.")).map((s) => s.id);
    const granted = grantsFor(getSku("bundle.trails")!);
    for (const id of premium) expect(granted, `missing ${id}`).toContain(id);
  });

  it("each bundle has its own Stripe price env var", () => {
    const bundles = BOOSTY_SKUS.filter((s) => s.kind === "bundle");
    const envs = bundles.map((b) => b.priceEnv);
    expect(new Set(envs).size, "two bundles share a price env var").toBe(bundles.length);
    expect(bundles.length).toBe(4);
  });
});
