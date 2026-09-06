import { logger } from "./logger";
import { BOOSTY_SKUS, priceIdFor, unconfiguredSkus } from "./boostyCatalog";

/**
 * BOOSTY store configuration preflight.
 *
 * A misconfigured store does not crash — it quietly refuses every purchase, or
 * worse, charges the wrong amount. Both look like "sales are slow". This turns
 * that class of silence into a startup log line and a runnable check.
 *
 * The offline half (env vars present, shape correct) runs at startup. The
 * online half (do these price ids exist, do the amounts match, are they
 * one-time) needs a Stripe call and runs from `pnpm run boosty:check`.
 */

export interface ConfigProblem {
  severity: "error" | "warning";
  sku?: string;
  message: string;
}

/** Offline checks — no network, safe to run during boot. */
export function checkBoostyEnv(): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const unconfigured = unconfiguredSkus();

  // All-or-nothing is fine (store off). A PARTIAL config is the dangerous
  // state: the shop renders, some items silently refuse, and it reads as a bug.
  if (unconfigured.length > 0 && unconfigured.length < BOOSTY_SKUS.length) {
    problems.push({
      severity: "error",
      message:
        `BOOSTY store is PARTIALLY configured — ${unconfigured.length} of ` +
        `${BOOSTY_SKUS.length} SKUs have no price id and will refuse to sell: ` +
        unconfigured.join(", "),
    });
  }

  const anyConfigured = unconfigured.length < BOOSTY_SKUS.length;
  const publicUrl = process.env.BOOSTY_PUBLIC_URL;

  if (anyConfigured && !publicUrl) {
    problems.push({
      severity: "error",
      message: "BOOSTY_PUBLIC_URL is not set — every checkout will return 503.",
    });
  }
  if (publicUrl && !/^https:\/\//.test(publicUrl) && !/^http:\/\/localhost/.test(publicUrl)) {
    problems.push({
      severity: "error",
      message: `BOOSTY_PUBLIC_URL must be https (or http://localhost for dev): got "${publicUrl}"`,
    });
  }
  if (publicUrl && publicUrl.endsWith("/")) {
    problems.push({
      severity: "warning",
      message: "BOOSTY_PUBLIC_URL has a trailing slash; return URLs will contain a double slash.",
    });
  }

  // Two SKUs pointing at one price is a copy-paste error that silently sells
  // the wrong thing.
  const seen = new Map<string, string>();
  for (const sku of BOOSTY_SKUS) {
    const id = priceIdFor(sku);
    if (!id) continue;
    const other = seen.get(id);
    if (other) {
      problems.push({
        severity: "error",
        sku: sku.id,
        message: `${sku.id} and ${other} share the price id ${id} — one of them is wrong.`,
      });
    } else {
      seen.set(id, sku.id);
    }
    if (!/^price_/.test(id)) {
      problems.push({
        severity: "error",
        sku: sku.id,
        message: `${sku.priceEnv} is "${id}", which is not a Stripe price id (expected price_...). A product id (prod_...) will not work.`,
      });
    }
  }

  return problems;
}

/** Called at startup. Never throws: a bad store must not take TrainChat down. */
export function logBoostyConfigStatus(): void {
  const unconfigured = unconfiguredSkus();
  if (unconfigured.length === BOOSTY_SKUS.length) {
    logger.info("[BoostyConfig] store is off — no price ids configured (this is fine)");
    return;
  }

  const problems = checkBoostyEnv();
  for (const p of problems) {
    if (p.severity === "error") logger.error({ sku: p.sku }, `[BoostyConfig] ${p.message}`);
    else logger.warn({ sku: p.sku }, `[BoostyConfig] ${p.message}`);
  }
  if (!problems.length) {
    logger.info(
      { skus: BOOSTY_SKUS.length },
      "[BoostyConfig] store is configured — all SKUs have a price id"
    );
  }
}

/**
 * Online checks against the live Stripe account. Verifies that each configured
 * price actually exists, is active, is ONE-TIME, and charges the amount the
 * catalog advertises.
 *
 * The recurring check matters most: a subscription price here would produce a
 * checkout the BOOSTY webhook branch never sees, because the event carries a
 * subscription and the TrainChat path claims it.
 */
export async function checkBoostyPrices(
  stripe: { prices: { retrieve: (id: string) => Promise<any> } }
): Promise<ConfigProblem[]> {
  const problems: ConfigProblem[] = [];

  for (const sku of BOOSTY_SKUS) {
    const id = priceIdFor(sku);
    if (!id) continue;

    let price: any;
    try {
      price = await stripe.prices.retrieve(id);
    } catch (err: any) {
      problems.push({
        severity: "error",
        sku: sku.id,
        message: `${sku.priceEnv}=${id} does not exist in this Stripe account (${err?.message ?? "lookup failed"}). Wrong key, or wrong mode (test vs live)?`,
      });
      continue;
    }

    if (price.active === false) {
      problems.push({ severity: "error", sku: sku.id, message: `${sku.id}: price ${id} is archived in Stripe.` });
    }
    if (price.recurring) {
      problems.push({
        severity: "error",
        sku: sku.id,
        message: `${sku.id}: price ${id} is RECURRING. BOOSTY sells one-time items; a subscription price produces a checkout this webhook branch never receives.`,
      });
    }
    if (price.unit_amount !== sku.cents) {
      problems.push({
        severity: "error",
        sku: sku.id,
        message: `${sku.id}: Stripe charges ${price.unit_amount} but the catalog advertises ${sku.cents}. The player would be charged a different price than the shop shows.`,
      });
    }
    if (price.currency && price.currency !== "usd") {
      problems.push({
        severity: "warning",
        sku: sku.id,
        message: `${sku.id}: price is in ${price.currency}, catalog assumes usd.`,
      });
    }
  }

  return problems;
}
