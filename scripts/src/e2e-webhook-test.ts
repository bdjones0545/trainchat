import Stripe from "stripe";
import crypto from "crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2023-10-16" });
const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const webhookUrl = "http://localhost:80/api/stripe/webhook";

if (!secret) { console.error("STRIPE_WEBHOOK_SECRET not set"); process.exit(1); }

console.log("=== TrainChat Webhook E2E Test ===\n");

// ── Step 1: Pull the most recent real events from Stripe ──────────────────────
// We replay real Stripe-signed events rather than crafting fake payloads, so
// stripe-replit-sync can validate and fetch them from its own tables.
// We sign locally so our server accepts them (same secret, same algorithm).

const EVENTS_TO_TEST = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "invoice.paid",
];

const events = await stripe.events.list({ limit: 50 });
console.log(`Fetched ${events.data.length} recent events from Stripe\n`);

// Find one event of each type we care about
const found: Record<string, Stripe.Event> = {};
for (const ev of events.data) {
  if (EVENTS_TO_TEST.includes(ev.type) && !found[ev.type]) {
    found[ev.type] = ev;
  }
}

if (Object.keys(found).length === 0) {
  console.log("No matching recent events found — sending a signed synthetic event instead.");
  console.log("This is safe: it exercises signature verification + business logic routing.\n");
}

// ── Step 2: Re-sign each real event and POST to the local webhook ─────────────
async function sendSignedEvent(event: Stripe.Event): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  const header = `t=${ts},v1=${sig}`;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

// ── Step 3: Also test a synthetic subscription event (no real Stripe fetch) ───
// customer.subscription.* events don't require stripe-replit-sync to re-fetch
// from Stripe, so a well-formed synthetic event passes end-to-end.
function syntheticSubEvent(type: string): Stripe.Event {
  const ts = Math.floor(Date.now() / 1000);
  return {
    id: `evt_synth_${crypto.randomBytes(6).toString("hex")}`,
    object: "event",
    api_version: "2023-10-16",
    created: ts,
    type,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    data: {
      object: {
        id: `sub_synth_${crypto.randomBytes(6).toString("hex")}`,
        object: "subscription",
        status: "active",
        customer: "cus_synth_test",
        cancel_at_period_end: false,
        current_period_end: ts + 30 * 86400,
        current_period_start: ts,
        trial_end: null,
        items: {
          object: "list",
          data: [{
            id: "si_synth",
            object: "subscription_item",
            price: {
              id: process.env.STRIPE_PRICE_TRAINCHAT_MONTHLY ?? "price_test",
              object: "price",
              lookup_key: "trainchat_monthly",
              recurring: { interval: "month", interval_count: 1 },
            },
          }],
        },
      },
    },
  } as unknown as Stripe.Event;
}

// ── Run tests ─────────────────────────────────────────────────────────────────

const results: Array<{ type: string; source: string; status: number; pass: boolean }> = [];

// Test 1: Real events replayed from Stripe
for (const [type, event] of Object.entries(found)) {
  process.stdout.write(`  [REAL]  ${type.padEnd(40)} → `);
  const r = await sendSignedEvent(event);
  // 200 = success; 400 with "already processed" in logs is also fine (idempotency)
  const pass = r.status === 200;
  process.stdout.write(`HTTP ${r.status} ${pass ? "✅" : "❌"}\n`);
  if (!pass) console.log(`          ${r.body}`);
  results.push({ type, source: "real", status: r.status, pass });
}

// Test 2: Synthetic subscription events (no Stripe API lookup required)
for (const type of ["customer.subscription.created", "customer.subscription.updated"]) {
  process.stdout.write(`  [SYNTH] ${type.padEnd(40)} → `);
  const event = syntheticSubEvent(type);
  const r = await sendSignedEvent(event);
  // 200 = processed; may also be 200 with "user not found" (correct — no user for cus_synth_test)
  const pass = r.status === 200;
  process.stdout.write(`HTTP ${r.status} ${pass ? "✅" : "❌"}\n`);
  if (!pass) console.log(`          ${r.body}`);
  results.push({ type, source: "synth", status: r.status, pass });
}

// Test 3: Bad signature must return 400
process.stdout.write(`  [GUARD] bad signature                           → `);
const badSig = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=bad" },
  body: '{"type":"test"}',
});
const badPass = badSig.status === 400;
process.stdout.write(`HTTP ${badSig.status} ${badPass ? "✅" : "❌"}\n`);
results.push({ type: "bad-signature", source: "guard", status: badSig.status, pass: badPass });

// Test 4: Idempotency — resend a synthetic event with the same ID
const idempEvent = syntheticSubEvent("customer.subscription.updated");
await sendSignedEvent(idempEvent); // first send
await new Promise(r => setTimeout(r, 500));
process.stdout.write(`  [IDEMP] duplicate event same ID                 → `);
const idempResult = await sendSignedEvent(idempEvent); // resend same event
const idempPass = idempResult.status === 200; // should 200 with skip-log
process.stdout.write(`HTTP ${idempResult.status} ${idempPass ? "✅" : "❌"} (check logs for 'already processed')\n`);
results.push({ type: "idempotency", source: "guard", status: idempResult.status, pass: idempPass });

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════");
const allPass = results.every(r => r.pass);
console.log(allPass ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED");
console.log("══════════════════════════════════════════════");
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"}  ${r.source.padEnd(6)} ${r.type}`);
}
console.log("\n📋 Check API server logs for detailed event processing output.");
