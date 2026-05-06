import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-03-31.basil" });

async function main() {
  const lookupKeys = [
    "trainchat_starter_monthly","trainchat_starter_yearly",
    "trainchat_pro_monthly","trainchat_pro_yearly",
    "trainchat_elite_monthly","trainchat_elite_yearly"
  ];

  const prices = await stripe.prices.list({ lookup_keys: lookupKeys, expand: ["data.product"], limit: 20 });
  const results: any[] = [];
  const keysSeen: Record<string,number> = {};
  const dupes: string[] = [];

  for (const p of prices.data) {
    const prod = p.product as Stripe.Product;
    const k = p.lookup_key!;
    keysSeen[k] = (keysSeen[k] ?? 0) + 1;
    if (keysSeen[k] > 1) dupes.push(k);
    results.push({ lookupKey: k, priceId: p.id, productId: prod.id, productName: prod.name,
      active: p.active, currency: p.currency, unit_amount: p.unit_amount,
      interval: p.recurring?.interval, interval_count: p.recurring?.interval_count });
  }
  results.sort((a,b) => a.lookupKey.localeCompare(b.lookupKey));

  console.log("\n── PHASE 1: PRODUCT + PRICE VALIDATION ──");
  for (const r of results) {
    const status = r.active ? "✓" : "✗ INACTIVE";
    console.log(`  ${status}  ${r.lookupKey.padEnd(35)} ${r.priceId}  $${(r.unit_amount/100).toFixed(2)}/${r.interval}  product:${r.productName}`);
  }
  console.log(`  TOTAL: ${prices.data.length}/6  DUPES: ${dupes.length}  ${dupes.join(", ") || "none"}`);
  
  const missing = lookupKeys.filter(k => !results.find(r => r.lookupKey === k));
  if (missing.length) console.log(`  MISSING LOOKUP KEYS: ${missing.join(", ")}`);
  else console.log(`  All 6 lookup keys present`);

  const monthly: Record<string,number> = {};
  const yearly: Record<string,number> = {};
  for (const r of results) {
    const [,tier,interval] = r.lookupKey.split("_");
    if (interval === "monthly") monthly[tier] = r.unit_amount;
    if (interval === "yearly") yearly[tier] = r.unit_amount;
  }
  console.log("\n── YEARLY DISCOUNT VERIFICATION ──");
  for (const tier of Object.keys(monthly)) {
    const disc = Math.round((1 - yearly[tier] / (monthly[tier] * 12)) * 100);
    const correct = disc >= 15 && disc <= 25;
    console.log(`  ${correct?"✓":"✗"}  ${tier}: monthly*12=$${(monthly[tier]*12/100).toFixed(2)}  yearly=$${(yearly[tier]/100).toFixed(2)}  discount=${disc}%`);
  }

  const currencies = [...new Set(results.map(r => r.currency))];
  console.log(`\n── CONSISTENCY ──`);
  console.log(`  Currencies: ${currencies.join(",")} ${currencies.length===1?"✓":"✗ MULTIPLE"}`);

  // Check webhook
  const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
  console.log("\n── WEBHOOKS ──");
  for (const w of webhooks.data) {
    console.log(`  ${w.status==="enabled"?"✓":"✗"}  ${w.id}  ${w.url}  events:${w.enabled_events.length}`);
  }
}
main().catch(e => { console.error("AUDIT ERROR:", e.message); process.exit(1); });
