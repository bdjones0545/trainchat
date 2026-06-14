/**
 * Seed script: Assessment Intelligence tables
 * Run: pnpm --filter @workspace/api-server run seed:assessments
 *
 * Populates: assessments, assessment_quality_links, assessment_method_links,
 *            assessment_product_links, assessment_exercise_links
 */

import { db } from "@workspace/db";
import {
  assessmentsTable,
  assessmentQualityLinksTable,
  assessmentMethodLinksTable,
  assessmentProductLinksTable,
  assessmentExerciseLinksTable,
} from "@workspace/db/schema";
import { ASSESSMENTS } from "../../trainchat/src/data/directory/assessments";

async function seedAssessments() {
  console.log("🧪 Seeding Assessment Intelligence tables…");

  // Wipe existing data (idempotent)
  await db.delete(assessmentExerciseLinksTable);
  await db.delete(assessmentProductLinksTable);
  await db.delete(assessmentMethodLinksTable);
  await db.delete(assessmentQualityLinksTable);
  await db.delete(assessmentsTable);

  for (const a of ASSESSMENTS) {
    const [inserted] = await db
      .insert(assessmentsTable)
      .values({
        name: a.name,
        category: a.category,
        description: a.description,
        metric: a.metric,
        unit: a.unit,
        sportRelevance: a.sportRelevance,
        difficulty: a.difficulty,
        equipmentRequired: a.equipmentRequired,
        normativeData: a.normativeData,
      })
      .returning({ id: assessmentsTable.id });

    const dbId = inserted.id;

    if (a.qualities.length > 0) {
      await db.insert(assessmentQualityLinksTable).values(
        a.qualities.map((q) => ({
          assessmentId: dbId,
          qualityName: q.quality,
          linkType: q.linkType,
        }))
      );
    }

    if (a.methods.length > 0) {
      await db.insert(assessmentMethodLinksTable).values(
        a.methods.map((m) => ({
          assessmentId: dbId,
          methodName: m.method,
          weakness: m.weakness,
          priority: m.priority,
        }))
      );
    }

    if (a.products.length > 0) {
      await db.insert(assessmentProductLinksTable).values(
        a.products.map((p) => ({
          assessmentId: dbId,
          productName: p.product,
          role: p.role,
        }))
      );
    }

    if (a.exercises.length > 0) {
      await db.insert(assessmentExerciseLinksTable).values(
        a.exercises.map((e) => ({
          assessmentId: dbId,
          exerciseName: e.exercise,
          weakness: e.weakness,
          prescription: e.prescription,
        }))
      );
    }

    console.log(`  ✅ ${a.name} (${a.category})`);
  }

  console.log(`\n✅ Seeded ${ASSESSMENTS.length} assessments with all link tables.`);
  process.exit(0);
}

seedAssessments().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
