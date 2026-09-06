/**
 * BOOSTY store catalog — SERVER SIDE, and authoritative.
 *
 * The browser tells us which SKU it wants. It never tells us the price, the
 * Stripe price id, or what the SKU grants: a client that can name its own price
 * can buy the whole locker for one cent. Everything below is resolved here.
 *
 * Stripe price ids come from the environment so the same code runs against test
 * and live keys without a rebuild. A SKU with no configured price id is treated
 * as not for sale rather than as free.
 */

export type BoostySkuKind = "cosmetic" | "bundle" | "sparks";

export interface BoostySku {
  id: string;
  kind: BoostySkuKind;
  name: string;
  /** Expected price in cents. Display + sanity check only; Stripe is the truth. */
  cents: number;
  /** Sparks credited on purchase. Cosmetics grant none; some bundles do. */
  sparks?: number;
  /** Env var holding this SKU's Stripe price id. */
  priceEnv: string;
  /** Bundles only: the individual SKUs this unlocks. */
  grants?: string[];
  /** bundle.all only: everything, including cosmetics added later. */
  everything?: boolean;
  blurb?: string;
}

const PREMIUM_PILOTS = ["wigsby", "vex", "beef", "blorp", "ozone", "pixel", "auditor"];
const PREMIUM_TRAILS = ["trail.glitter", "trail.regret", "trail.void", "trail.cashmoney"];

const SKUS: BoostySku[] = [
  // ── Pilots ────────────────────────────────────────────────────────────────
  { id: "wigsby", kind: "cosmetic", name: "Judge Wigsby", cents: 199, priceEnv: "BOOSTY_PRICE_WIGSBY" },
  { id: "vex", kind: "cosmetic", name: "Countess Vex", cents: 199, priceEnv: "BOOSTY_PRICE_VEX" },
  { id: "beef", kind: "cosmetic", name: "Beef Wellington III", cents: 299, priceEnv: "BOOSTY_PRICE_BEEF" },
  { id: "blorp", kind: "cosmetic", name: "Blorp", cents: 299, priceEnv: "BOOSTY_PRICE_BLORP" },
  { id: "ozone", kind: "cosmetic", name: "Captain Ozone", cents: 299, priceEnv: "BOOSTY_PRICE_OZONE" },
  { id: "pixel", kind: "cosmetic", name: "Pixel Pete", cents: 399, priceEnv: "BOOSTY_PRICE_PIXEL" },
  { id: "auditor", kind: "cosmetic", name: "The Auditor", cents: 399, priceEnv: "BOOSTY_PRICE_AUDITOR" },

  // ── Trails ────────────────────────────────────────────────────────────────
  { id: "trail.glitter", kind: "cosmetic", name: "Glitter Bomb", cents: 99, priceEnv: "BOOSTY_PRICE_TRAIL_GLITTER" },
  { id: "trail.regret", kind: "cosmetic", name: "A Small Personal Raincloud", cents: 149, priceEnv: "BOOSTY_PRICE_TRAIL_REGRET" },
  { id: "trail.void", kind: "cosmetic", name: "Concerning Void", cents: 199, priceEnv: "BOOSTY_PRICE_TRAIL_VOID" },
  { id: "trail.cashmoney", kind: "cosmetic", name: "Burning Actual Money", cents: 249, priceEnv: "BOOSTY_PRICE_TRAIL_CASHMONEY" },

  // ── Bundles ───────────────────────────────────────────────────────────────
  // A ladder, not a single all-or-nothing offer. Every rung is checked against
  // its own contents by auditBundles() so a bundle can never cost more than
  // buying the same items separately.
  {
    id: "bundle.rookie",
    kind: "bundle",
    name: "Rookie Kit",
    blurb: "One pilot, one trail, and a thousand sparks. The cheap way in.",
    cents: 299,
    sparks: 1000,
    grants: ["blorp", "trail.glitter"],
    priceEnv: "BOOSTY_PRICE_BUNDLE_ROOKIE",
  },
  {
    id: "bundle.trails",
    kind: "bundle",
    name: "Full Exhaust",
    blurb: "Every premium trail. Leave in a different way each run.",
    cents: 399,
    grants: PREMIUM_TRAILS,
    priceEnv: "BOOSTY_PRICE_BUNDLE_TRAILS",
  },
  {
    id: "bundle.pilots",
    kind: "bundle",
    name: "Flight Crew",
    blurb: "All seven premium pilots. The whole ridiculous roster.",
    cents: 699,
    grants: PREMIUM_PILOTS,
    priceEnv: "BOOSTY_PRICE_BUNDLE_PILOTS",
  },
  {
    id: "bundle.all",
    kind: "bundle",
    name: "The Whole Locker",
    blurb: "Every pilot and trail, now and in future. Nothing left to buy.",
    cents: 999,
    everything: true,
    priceEnv: "BOOSTY_PRICE_BUNDLE",
  },

  // ── Spark packs (consumable currency) ─────────────────────────────────────
  { id: "sparks.small", kind: "sparks", name: "Pocket Change", cents: 199, sparks: 1000, priceEnv: "BOOSTY_PRICE_SPARKS_SMALL" },
  { id: "sparks.medium", kind: "sparks", name: "Serious Sparks", cents: 699, sparks: 5000, priceEnv: "BOOSTY_PRICE_SPARKS_MEDIUM" },
  { id: "sparks.large", kind: "sparks", name: "Unreasonable Quantity", cents: 1499, sparks: 15000, priceEnv: "BOOSTY_PRICE_SPARKS_LARGE" },
];

const BY_ID = new Map(SKUS.map((s) => [s.id, s]));

/** What a purchase of this SKU unlocks. Bundles expand; everything else is itself. */
export function grantsFor(sku: BoostySku): string[] {
  if (sku.kind !== "bundle") return sku.kind === "sparks" ? [] : [sku.id];
  if (sku.everything) return [sku.id];
  return [sku.id, ...(sku.grants ?? [])];
}

/** Sparks credited by a purchase. Packs carry them; some bundles do too. */
export function sparksFor(sku: BoostySku): number {
  return sku.sparks ?? 0;
}

/**
 * A bundle that costs more than its contents is a broken offer, and a bundle
 * granting a SKU that does not exist silently sells nothing. Both are checked
 * rather than trusted, the same way the spark-pack badges are.
 */
export function auditBundles(): string[] {
  const problems: string[] = [];
  for (const sku of SKUS) {
    if (sku.kind !== "bundle" || sku.everything) continue;
    const grants = sku.grants ?? [];
    if (!grants.length) {
      problems.push(`${sku.id} is a bundle that grants nothing`);
      continue;
    }
    let contents = 0;
    for (const id of grants) {
      const item = BY_ID.get(id);
      if (!item) { problems.push(`${sku.id} grants "${id}", which is not a SKU`); continue; }
      if (item.kind === "bundle") problems.push(`${sku.id} grants another bundle (${id}) — not supported`);
      contents += item.cents;
    }
    if (sku.cents >= contents && contents > 0) {
      problems.push(`${sku.id} costs ${sku.cents} but its contents total ${contents} — the bundle is not a saving`);
    }
  }
  // The all-inclusive bundle must remain the best deal, or the ladder inverts.
  const all = BY_ID.get("bundle.all");
  const subsets = SKUS.filter((s) => s.kind === "bundle" && !s.everything && s.id !== "bundle.rookie");
  const subsetTotal = subsets.reduce((n, s) => n + s.cents, 0);
  if (all && subsetTotal > 0 && all.cents >= subsetTotal) {
    problems.push(`bundle.all costs ${all.cents} but the subset bundles total ${subsetTotal} — buying the parts is cheaper than everything`);
  }
  return problems;
}

export function getSku(id: unknown): BoostySku | null {
  if (typeof id !== "string") return null;
  return BY_ID.get(id) ?? null;
}

export function priceIdFor(sku: BoostySku): string | null {
  const v = process.env[sku.priceEnv];
  return v && v.trim() ? v.trim() : null;
}

/** A SKU is purchasable only once its Stripe price id is configured. */
export function isPurchasable(sku: BoostySku): boolean {
  return priceIdFor(sku) !== null;
}

/** Reverse lookup used by the webhook: Stripe price id -> our SKU. */
export function skuForPriceId(priceId: string): BoostySku | null {
  if (!priceId) return null;
  for (const sku of SKUS) {
    if (priceIdFor(sku) === priceId) return sku;
  }
  return null;
}

export function listCatalog(): Array<BoostySku & { available: boolean }> {
  return SKUS.map((s) => ({ ...s, available: isPurchasable(s) }));
}

/**
 * Startup diagnostic: which SKUs are on the shelf but have no price configured.
 * Surfacing this is the difference between "the store is quiet" and "the store
 * has been silently refusing every purchase since the last deploy".
 */
export function unconfiguredSkus(): string[] {
  return SKUS.filter((s) => !isPurchasable(s)).map((s) => s.id);
}

export const BOOSTY_PRODUCT_TAG = "boosty";

/**
 * Deterministic Stripe product id for a SKU.
 *
 * Stripe lets the caller choose a product id, and `products.retrieve` is
 * strongly consistent — unlike `products.search`, whose index lags creation by
 * up to about a minute. Seeding by search means a run that dies halfway and is
 * retried inside that window creates DUPLICATE products, and the next run then
 * picks an arbitrary one of them. A deterministic id removes the window.
 */
export function stripeProductIdFor(skuId: string): string {
  return "boosty_" + skuId.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
}
export { SKUS as BOOSTY_SKUS };
