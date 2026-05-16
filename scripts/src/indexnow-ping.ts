/**
 * IndexNow Ping Script — TrainChat®
 *
 * Submits all public indexable URLs to Bing's IndexNow endpoint.
 * IndexNow notifies Bing (and via sharing, Yandex, Seznam, etc.)
 * immediately when content is new or updated.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run indexnow           # ping all URLs
 *   pnpm --filter @workspace/scripts run indexnow:priority  # ping priority URLs only
 *   pnpm --filter @workspace/scripts run indexnow:url <url> # ping a single URL
 *
 * Requirements:
 *   - Key file must be live at: https://www.trainchat.ai/a8f3b21c4e6d9017f5c8b2a4e1d7f305.txt
 *   - Verify at: https://www.bing.com/indexnow after first submission
 *
 * IndexNow spec: https://www.indexnow.org/documentation
 */

const INDEXNOW_KEY = "a8f3b21c4e6d9017f5c8b2a4e1d7f305";
const HOST = "www.trainchat.ai";
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

// ─── URL Registry ──────────────────────────────────────────────────────────────
// Tier 1: Primary topical authority pages — highest crawl priority
const PRIORITY_URLS: string[] = [
  "https://www.trainchat.ai/",
  "https://www.trainchat.ai/what-is-ai-fitness-coaching",
  "https://www.trainchat.ai/ai-workout-generator",
  "https://www.trainchat.ai/ai-personal-trainer",
  "https://www.trainchat.ai/adaptive-coaching-ai",
  "https://www.trainchat.ai/ai-strength-coach",
  "https://www.trainchat.ai/ai-periodization-software",
  "https://www.trainchat.ai/conversational-workout-builder",
  "https://www.trainchat.ai/ai-sports-performance-platform",
  "https://www.trainchat.ai/vibe-code-your-workouts",
  "https://www.trainchat.ai/conversational-fitness-ai",
  "https://www.trainchat.ai/adaptive-workout-app",
  "https://www.trainchat.ai/best-ai-workout-app",
  "https://www.trainchat.ai/adaptive-coaching-architecture",
  "https://www.trainchat.ai/mutation-first-programming",
  "https://www.trainchat.ai/living-training-system",
  "https://www.trainchat.ai/real-time-workout-adaptation",
];

// Tier 2: Supporting semantic cluster — concepts, whitepapers, comparison pages
const SECONDARY_URLS: string[] = [
  "https://www.trainchat.ai/whitepapers",
  "https://www.trainchat.ai/whitepapers/adaptive-coaching-architecture",
  "https://www.trainchat.ai/whitepapers/mutation-first-programming",
  "https://www.trainchat.ai/whitepapers/the-problem-with-static-programming",
  "https://www.trainchat.ai/vs-chatgpt-workouts",
  "https://www.trainchat.ai/vs-fitbod",
  "https://www.trainchat.ai/vs-trainerize",
  "https://www.trainchat.ai/vs-traditional-apps",
  "https://www.trainchat.ai/what-is-adaptive-programming",
  "https://www.trainchat.ai/what-is-coaching-intelligence",
  "https://www.trainchat.ai/ai-coaching-vs-personal-trainer",
  "https://www.trainchat.ai/glossary",
  "https://www.trainchat.ai/terminology",
  "https://www.trainchat.ai/faq",
  "https://www.trainchat.ai/concepts",
  "https://www.trainchat.ai/concepts/adaptive-programming",
  "https://www.trainchat.ai/concepts/coaching-intelligence",
  "https://www.trainchat.ai/concepts/progressive-overload",
  "https://www.trainchat.ai/concepts/intelligent-periodization",
  "https://www.trainchat.ai/concepts/dynamic-progression",
  "https://www.trainchat.ai/concepts/training-memory",
  "https://www.trainchat.ai/concepts/workout-mutation",
  "https://www.trainchat.ai/concepts/fatigue-management",
  "https://www.trainchat.ai/concepts/cns-load-management",
  "https://www.trainchat.ai/concepts/supercompensation",
  "https://www.trainchat.ai/concepts/said-principle",
  "https://www.trainchat.ai/concepts/motor-learning",
  "https://www.trainchat.ai/concepts/training-specificity",
  "https://www.trainchat.ai/concepts/training-load-management",
  "https://www.trainchat.ai/concepts/performance-adaptation",
  "https://www.trainchat.ai/concepts/living-training-system",
  "https://www.trainchat.ai/concepts/conversational-training",
];

// Tier 3: Institutional / brand pages
const BRAND_URLS: string[] = [
  "https://www.trainchat.ai/about",
  "https://www.trainchat.ai/founder",
  "https://www.trainchat.ai/doctrine",
  "https://www.trainchat.ai/methodology",
  "https://www.trainchat.ai/training-philosophy",
  "https://www.trainchat.ai/research",
  "https://www.trainchat.ai/for-athletes",
  "https://www.trainchat.ai/for-coaches",
  "https://www.trainchat.ai/frameworks",
  "https://www.trainchat.ai/curriculum",
  "https://www.trainchat.ai/diagrams",
  "https://www.trainchat.ai/press",
  "https://www.trainchat.ai/media-kit",
  "https://www.trainchat.ai/content",
  "https://www.trainchat.ai/youtube",
  "https://www.trainchat.ai/privacy",
  "https://www.trainchat.ai/terms",
];

const ALL_URLS = [...PRIORITY_URLS, ...SECONDARY_URLS, ...BRAND_URLS];

// ─── IndexNow API ──────────────────────────────────────────────────────────────

interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

interface PingResult {
  success: boolean;
  status?: number;
  body?: string;
  error?: string;
  urlCount: number;
}

async function pingIndexNow(urls: string[]): Promise<PingResult> {
  if (urls.length === 0) {
    return { success: false, error: "No URLs provided", urlCount: 0 };
  }

  // IndexNow accepts max 10,000 URLs per request, batch if needed
  const BATCH_SIZE = 10_000;
  const batches = [];
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    batches.push(urls.slice(i, i + BATCH_SIZE));
  }

  let lastResult: PingResult = { success: false, urlCount: 0 };

  for (const [i, batch] of batches.entries()) {
    if (batches.length > 1) {
      console.log(`\nSubmitting batch ${i + 1}/${batches.length} (${batch.length} URLs)...`);
    }

    const payload: IndexNowPayload = {
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: KEY_LOCATION,
      urlList: batch,
    };

    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });

      const body = await response.text().catch(() => "");
      lastResult = {
        success: response.ok || response.status === 202,
        status: response.status,
        body: body || undefined,
        urlCount: batch.length,
      };
    } catch (err) {
      lastResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        urlCount: batch.length,
      };
    }
  }

  return lastResult;
}

// ─── CLI Entry ─────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] ?? "all";
  const singleUrl = process.argv[3];

  console.log("╔═══════════════════════════════════════════╗");
  console.log("║  TrainChat® — IndexNow Submission          ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log(`  Key:      ${INDEXNOW_KEY}`);
  console.log(`  Host:     ${HOST}`);
  console.log(`  Endpoint: ${INDEXNOW_ENDPOINT}`);

  let urlsToSubmit: string[] = [];

  if (mode === "url" && singleUrl) {
    urlsToSubmit = [singleUrl];
    console.log(`\n  Mode: single URL → ${singleUrl}`);
  } else if (mode === "priority") {
    urlsToSubmit = PRIORITY_URLS;
    console.log(`\n  Mode: priority-only (${PRIORITY_URLS.length} URLs)`);
  } else {
    urlsToSubmit = ALL_URLS;
    console.log(`\n  Mode: all URLs (${ALL_URLS.length} total)`);
    console.log(`    Tier 1 (priority):  ${PRIORITY_URLS.length} URLs`);
    console.log(`    Tier 2 (secondary): ${SECONDARY_URLS.length} URLs`);
    console.log(`    Tier 3 (brand):     ${BRAND_URLS.length} URLs`);
  }

  console.log("\n  Submitting...\n");

  const result = await pingIndexNow(urlsToSubmit);

  if (result.success) {
    console.log(`✅ Success — ${result.urlCount} URL(s) submitted`);
    if (result.status) console.log(`   HTTP Status: ${result.status}`);
    console.log("\n  Bing will begin crawling within minutes.");
    console.log("  Verify at: https://www.bing.com/webmasters/");
    console.log("  Check GSC: https://search.google.com/search-console/");
  } else {
    console.error(`❌ Submission failed`);
    if (result.status) console.error(`   HTTP Status: ${result.status}`);
    if (result.error)  console.error(`   Error: ${result.error}`);
    if (result.body)   console.error(`   Response: ${result.body}`);
    console.log("\n  Common causes:");
    console.log("  1. Key file not yet live at the production URL");
    console.log(`     → Check: https://${HOST}/${INDEXNOW_KEY}.txt`);
    console.log("  2. Key file content does not match the key value");
    console.log("  3. Network/DNS issue from this environment");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
