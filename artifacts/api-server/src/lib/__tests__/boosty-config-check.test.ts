/**
 * boosty-config-check.test.ts
 *
 * A misconfigured store does not crash. It quietly refuses purchases, or worse,
 * charges an amount the shop never displayed. These are the specific silences
 * the preflight is meant to break.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const PRICE_ENVS = [
  "BOOSTY_PRICE_WIGSBY", "BOOSTY_PRICE_VEX", "BOOSTY_PRICE_BEEF", "BOOSTY_PRICE_BLORP",
  "BOOSTY_PRICE_OZONE", "BOOSTY_PRICE_PIXEL", "BOOSTY_PRICE_AUDITOR",
  "BOOSTY_PRICE_TRAIL_GLITTER", "BOOSTY_PRICE_TRAIL_REGRET", "BOOSTY_PRICE_TRAIL_VOID",
  "BOOSTY_PRICE_TRAIL_CASHMONEY", "BOOSTY_PRICE_BUNDLE",
  "BOOSTY_PRICE_SPARKS_SMALL", "BOOSTY_PRICE_SPARKS_MEDIUM", "BOOSTY_PRICE_SPARKS_LARGE",
];

function clearAll(): void {
  for (const k of PRICE_ENVS) delete process.env[k];
  delete process.env.BOOSTY_PUBLIC_URL;
}
function configureAll(): void {
  PRICE_ENVS.forEach((k, i) => { process.env[k] = `price_ok_${i}`; });
  process.env.BOOSTY_PUBLIC_URL = "https://play.example.com";
}

describe("BOOSTY config preflight — offline", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it("says nothing when the store is entirely off", async () => {
    const { checkBoostyEnv } = await import("../boostyConfigCheck");
    expect(checkBoostyEnv()).toEqual([]);
  });

  it("is clean when everything is configured", async () => {
    configureAll();
    const { checkBoostyEnv } = await import("../boostyConfigCheck");
    expect(checkBoostyEnv()).toEqual([]);
  });

  it("flags a PARTIAL config, which is the dangerous state", async () => {
    configureAll();
    delete process.env.BOOSTY_PRICE_BUNDLE;
    delete process.env.BOOSTY_PRICE_VEX;
    const { checkBoostyEnv } = await import("../boostyConfigCheck");
    const problems = checkBoostyEnv();
    expect(problems.some((p) => p.severity === "error" && /PARTIALLY configured/.test(p.message))).toBe(true);
    expect(problems.some((p) => /bundle\.all/.test(p.message))).toBe(true);
  });

  it("catches a missing BOOSTY_PUBLIC_URL, which 503s every checkout", async () => {
    configureAll();
    delete process.env.BOOSTY_PUBLIC_URL;
    const { checkBoostyEnv } = await import("../boostyConfigCheck");
    expect(checkBoostyEnv().some((p) => /BOOSTY_PUBLIC_URL is not set/.test(p.message))).toBe(true);
  });

  it("rejects a non-https public URL", async () => {
    configureAll();
    process.env.BOOSTY_PUBLIC_URL = "http://play.example.com";
    const { checkBoostyEnv } = await import("../boostyConfigCheck");
    expect(checkBoostyEnv().some((p) => /must be https/.test(p.message))).toBe(true);
  });

  it("allows http://localhost for development", async () => {
    configureAll();
    process.env.BOOSTY_PUBLIC_URL = "http://localhost:5310";
    const { checkBoostyEnv } = await import("../boostyConfigCheck");
    expect(checkBoostyEnv().some((p) => /must be https/.test(p.message))).toBe(false);
  });

  it("catches two SKUs sharing one price id — a copy-paste that sells the wrong thing", async () => {
    configureAll();
    process.env.BOOSTY_PRICE_VEX = process.env.BOOSTY_PRICE_BUNDLE;
    const { checkBoostyEnv } = await import("../boostyConfigCheck");
    expect(checkBoostyEnv().some((p) => /share the price id/.test(p.message))).toBe(true);
  });

  it("catches a product id pasted where a price id belongs", async () => {
    configureAll();
    process.env.BOOSTY_PRICE_BUNDLE = "prod_ABC123";
    const { checkBoostyEnv } = await import("../boostyConfigCheck");
    expect(checkBoostyEnv().some((p) => /not a Stripe price id/.test(p.message))).toBe(true);
  });
});

describe("BOOSTY config preflight — against Stripe", () => {
  beforeEach(() => { clearAll(); process.env.BOOSTY_PRICE_BUNDLE = "price_bundle"; process.env.BOOSTY_PUBLIC_URL = "https://p.example.com"; });
  afterEach(clearAll);

  const stripeWith = (price: any) => ({ prices: { retrieve: vi.fn().mockResolvedValue(price) } });

  it("passes a correct one-time price", async () => {
    const { checkBoostyPrices } = await import("../boostyConfigCheck");
    const problems = await checkBoostyPrices(stripeWith({ active: true, unit_amount: 999, currency: "usd" }) as any);
    expect(problems).toEqual([]);
  });

  it("catches a RECURRING price, which the BOOSTY webhook branch would never see", async () => {
    const { checkBoostyPrices } = await import("../boostyConfigCheck");
    const problems = await checkBoostyPrices(
      stripeWith({ active: true, unit_amount: 999, currency: "usd", recurring: { interval: "month" } }) as any
    );
    expect(problems.some((p) => /RECURRING/.test(p.message))).toBe(true);
  });

  it("catches an amount that disagrees with the shop", async () => {
    const { checkBoostyPrices } = await import("../boostyConfigCheck");
    const problems = await checkBoostyPrices(stripeWith({ active: true, unit_amount: 100, currency: "usd" }) as any);
    expect(problems.some((p) => /charges 100 but the catalog advertises 999/.test(p.message))).toBe(true);
  });

  it("catches an archived price", async () => {
    const { checkBoostyPrices } = await import("../boostyConfigCheck");
    const problems = await checkBoostyPrices(stripeWith({ active: false, unit_amount: 999, currency: "usd" }) as any);
    expect(problems.some((p) => /archived/.test(p.message))).toBe(true);
  });

  it("catches a price id from the wrong Stripe mode", async () => {
    const { checkBoostyPrices } = await import("../boostyConfigCheck");
    const stripe = { prices: { retrieve: vi.fn().mockRejectedValue(new Error("No such price")) } };
    const problems = await checkBoostyPrices(stripe as any);
    expect(problems.some((p) => /does not exist in this Stripe account/.test(p.message))).toBe(true);
  });

  it("never contacts Stripe for an unconfigured SKU", async () => {
    const { checkBoostyPrices } = await import("../boostyConfigCheck");
    const stripe = { prices: { retrieve: vi.fn().mockResolvedValue({ active: true, unit_amount: 999, currency: "usd" }) } };
    await checkBoostyPrices(stripe as any);
    expect(stripe.prices.retrieve).toHaveBeenCalledTimes(1); // only bundle.all is set
  });
});
