// One-off admin runner: review all unreviewed research documents via the Librarian Agent.
// Usage: pnpm --filter @workspace/api-server exec tsx --tsconfig tsconfig.json src/scripts/run-librarian-review.ts
//
// This script is safe to run multiple times — it only processes docs where
// librarian_recommendation IS NULL (already-reviewed docs are skipped).

import { reviewUnreviewedDocuments } from "../research/research-librarian-agent";

console.log("[LibrarianReview] Starting batch review of unreviewed documents...");
console.log("[LibrarianReview] This may take 2–4 minutes for 22 documents.");
console.log("[LibrarianReview] Each document requires one OpenAI call.\n");

const start = Date.now();

try {
  const result = await reviewUnreviewedDocuments(5);

  const elapsed = Math.round((Date.now() - start) / 1000);

  console.log("\n========================================");
  console.log("  LIBRARIAN REVIEW COMPLETE");
  console.log("========================================");
  console.log(`  Processed :  ${result.processed}`);
  console.log(`  Approved  :  ${result.approved}  → status=approved, is_active=true`);
  console.log(`  Needs review: ${result.needsReview} → status=pending, is_active=false`);
  console.log(`  Rejected  :  ${result.rejected}  → status=rejected, is_active=false`);
  console.log(`  Errors    :  ${result.errors}`);
  console.log(`  Time      :  ${elapsed}s`);
  console.log("========================================\n");

  console.log("Per-document results:");
  for (const r of result.results) {
    if (r.ok) {
      const arrow = r.recommendation === "approve" ? "✓" : r.recommendation === "needs_review" ? "⚠" : "✗";
      console.log(`  ${arrow} Doc ${r.id}: ${r.recommendation}  (${r.previousStatus} → ${r.newStatus})`);
    } else {
      console.log(`  ✗ Doc ${r.id}: ERROR — ${r.error}`);
    }
  }

  if (result.needsReview > 0) {
    console.log(`\n[Action required] ${result.needsReview} doc(s) flagged needs_review.`);
    console.log("  Review warningFlags via: GET /api/admin/research?status=pending");
    console.log("  Then approve individually: POST /api/admin/research/:id/approve");
  }

  if (result.errors > 0) {
    console.log(`\n[Warning] ${result.errors} doc(s) failed analysis (OpenAI error?). Re-run to retry.`);
  }

  process.exit(0);
} catch (err: any) {
  console.error("[LibrarianReview] Fatal error:", err.message);
  process.exit(1);
}
