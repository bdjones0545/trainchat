// ─── Real Evidence Seeder Runner ──────────────────────────────────────────────
//
// Creates real peer-reviewed research documents and runs each through the
// Librarian Agent before any can reach the Coach.
//
// Run:
//   pnpm --filter @workspace/api-server exec tsx --tsconfig tsconfig.json \
//     src/scripts/run-real-evidence-seeder.ts

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { REAL_EVIDENCE_DOCUMENTS } from "../research/research-real-evidence-seeder";
import { analyzeResearchDocument } from "../research/research-librarian-agent";

const SEEDER_VERSION = "real-evidence-v1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function documentExists(title: string): Promise<number | null> {
  const [existing] = await db
    .select({ id: researchDocumentsTable.id })
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.title, title));
  return existing?.id ?? null;
}

async function createDoc(
  data: (typeof REAL_EVIDENCE_DOCUMENTS)[number],
): Promise<number> {
  const [inserted] = await db
    .insert(researchDocumentsTable)
    .values({
      ...data,
      status: "pending",
      isActive: false,
    })
    .returning({ id: researchDocumentsTable.id });
  return inserted.id;
}

async function applyRecommendation(
  docId: number,
  recommendation: string,
): Promise<{ newStatus: string; newIsActive: boolean }> {
  let newStatus: "approved" | "pending" | "rejected";
  let newIsActive: boolean;

  if (recommendation === "approve") {
    newStatus = "approved";
    newIsActive = true;
  } else if (recommendation === "needs_review") {
    newStatus = "pending";
    newIsActive = false;
  } else {
    newStatus = "rejected";
    newIsActive = false;
  }

  await db
    .update(researchDocumentsTable)
    .set({ status: newStatus, isActive: newIsActive, updatedAt: new Date() })
    .where(eq(researchDocumentsTable.id, docId));

  return { newStatus, newIsActive };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const start = Date.now();
let created = 0, skipped = 0, approved = 0, needsReview = 0, rejected = 0, errors = 0;

const results: {
  id: number;
  title: string;
  action: "created" | "skipped";
  recommendation?: string;
  newStatus?: string;
  warningFlags?: string[];
  error?: string;
}[] = [];

console.log(`\n[RealEvidenceSeeder] Starting — ${REAL_EVIDENCE_DOCUMENTS.length} documents\n`);

for (const doc of REAL_EVIDENCE_DOCUMENTS) {
  const short = doc.title.slice(0, 70);

  // Skip if already exists
  const existingId = await documentExists(doc.title);
  if (existingId !== null) {
    console.log(`  ⟳ [SKIP]  ${short}...`);
    skipped++;
    results.push({ id: existingId, title: doc.title, action: "skipped" });
    continue;
  }

  // Create document
  let docId: number;
  try {
    docId = await createDoc(doc);
    created++;
    console.log(`  + [CREATE] id=${docId}  ${short}...`);
  } catch (err: any) {
    errors++;
    console.error(`  ✗ [ERROR]  ${short}... — ${err.message}`);
    results.push({ id: -1, title: doc.title, action: "created", error: err.message });
    continue;
  }

  // Run Librarian
  console.log(`    → Running Librarian...`);
  const outcome = await analyzeResearchDocument(docId);

  if (!outcome.ok) {
    errors++;
    console.error(`    ✗ Librarian error: ${outcome.error}`);
    results.push({ id: docId, title: doc.title, action: "created", error: outcome.error });
    continue;
  }

  const rec = outcome.result!.recommendation;
  const flags = outcome.result!.warningFlags ?? [];
  const { newStatus } = await applyRecommendation(docId, rec);

  if (rec === "approve") approved++;
  else if (rec === "needs_review") needsReview++;
  else rejected++;

  const icon = rec === "approve" ? "✓" : rec === "needs_review" ? "⚠" : "✗";
  console.log(`    ${icon} Librarian: ${rec}  →  status=${newStatus}${flags.length ? `  flags=${flags.join(",")}` : ""}`);

  results.push({
    id: docId,
    title: doc.title,
    action: "created",
    recommendation: rec,
    newStatus,
    warningFlags: flags,
  });
}

const elapsed = Math.round((Date.now() - start) / 1000);

console.log(`
========================================
  REAL EVIDENCE SEEDER COMPLETE
========================================
  Documents   :  ${REAL_EVIDENCE_DOCUMENTS.length}
  Created     :  ${created}
  Skipped     :  ${skipped}
  Approved    :  ${approved}  ← retrievable by Coach now
  Needs review:  ${needsReview}  ← pending admin sign-off
  Rejected    :  ${rejected}
  Errors      :  ${errors}
  Time        :  ${elapsed}s
========================================
`);

// Show retrievable chunk count
const [{ chunks }] = await db
  .select({ chunks: sql<number>`COUNT(*)` })
  .from(researchChunksTable)
  .where(
    sql`document_id IN (
      SELECT id FROM research_documents
      WHERE status = 'approved' AND is_active = true
        AND librarian_recommendation IN ('approve', 'needs_review')
    )`,
  );

console.log(`Retrievable chunks now available to Coach: ${chunks}`);

if (needsReview > 0) {
  const pendingDocs = results.filter((r) => r.recommendation === "needs_review");
  console.log(`\n[Action required] ${needsReview} doc(s) need admin review:`);
  for (const d of pendingDocs) {
    console.log(`  Doc ${d.id}: ${d.title.slice(0, 70)}...`);
    if (d.warningFlags?.length) console.log(`    warningFlags: ${d.warningFlags.join(", ")}`);
  }
  console.log("\n  Review via: GET /api/admin/research?status=pending");
  console.log("  Approve:   POST /api/admin/research/:id/approve");
}

if (rejected > 0) {
  const rejectedDocs = results.filter((r) => r.recommendation === "reject");
  console.log(`\n[Rejected by Librarian]`);
  for (const d of rejectedDocs) {
    console.log(`  Doc ${d.id}: ${d.title.slice(0, 70)}...`);
  }
}

process.exit(errors > 0 ? 1 : 0);
