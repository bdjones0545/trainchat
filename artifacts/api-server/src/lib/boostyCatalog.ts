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
  /** Sparks credited on purchase. Cosmetics grant none. */
  sparks?: number;
  /** Env var holding this SKU's Stripe price id. */
  priceEnv: string;
}

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

  // ── Bundle ────────────────────────────────────────────────────────────────
  { id: "bundle.all", kind: "bundle", name: "The Whole Locker", cents: 999, priceEnv: "BOOSTY_PRICE_BUNDLE" },

  // ── Spark packs (consumable currency) ─────────────────────────────────────
  { id: "sparks.small", kind: "sparks", name: "Pocket Change", cents: 199, sparks: 1000, priceEnv: "BOOSTY_PRICE_SPARKS_SMALL" },
  { id: "sparks.medium", kind: "sparks", name: "Serious Sparks", cents: 699, sparks: 5000, priceEnv: "BOOSTY_PRICE_SPARKS_MEDIUM" },
  { id: "sparks.large", kind: "sparks", name: "Unreasonable Quantity", cents: 1499, sparks: 15000, priceEnv: "BOOSTY_PRICE_SPARKS_LARGE" },
];

const BY_ID = new Map(SKUS.map((s) => [s.id, s]));

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
export { SKUS as BOOSTY_SKUS };
