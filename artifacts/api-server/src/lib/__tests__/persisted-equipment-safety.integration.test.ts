import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  conversationsTable,
  db,
  sessionExercises,
  trainingPhases,
  trainingSessions,
  trainingSystems,
  trainingWeeks,
  userProfilesTable,
  usersTable,
} from "@workspace/db";
import { generateAIResponse } from "../ai";
import { auditCanonicalExerciseEquipment } from "../program-equipment-safety";
import { createTrainingSystemFromProgram } from "../training-system-service";

const REQUEST = "Build a strength program using only dumbbells. No barbell, cables, machines, or other equipment.";
const EQUIPMENT_MODE = "dumbbells_only";
const createdUserIds: number[] = [];

describe.skipIf(!process.env.DATABASE_URL)("persisted restricted-equipment safety", () => {
  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
  });

  it("keeps the deterministic dumbbells-only program canonical after persistence transformation", async () => {
    const [user] = await db.insert(usersTable).values({
      email: `equipment-audit-${Date.now()}@example.invalid`,
      passwordHash: "synthetic-not-a-login-hash",
      name: "Equipment Audit",
      isAnonymous: false,
    }).returning();
    createdUserIds.push(user.id);

    await db.insert(userProfilesTable).values({
      userId: user.id,
      trainingGoal: "Strength",
      experienceLevel: "Intermediate",
      trainingStyle: "Balanced",
      daysPerWeek: 3,
      sessionDuration: 60,
      equipmentAccess: EQUIPMENT_MODE,
    });

    const [conversation] = await db.insert(conversationsTable).values({
      userId: user.id,
      title: "Persisted equipment safety audit",
    }).returning();

    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    const previousIntegrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

    let generated: Awaited<ReturnType<typeof generateAIResponse>>;
    try {
      generated = await generateAIResponse(REQUEST, [], user.id, {
        intentResult: { type: "CREATE_PROGRAM" } as never,
        extractedConstraints: {
          sportFocus: null,
          primaryGoal: "strength",
          daysPerWeek: 3,
          sessionDuration: null,
          equipment: EQUIPMENT_MODE,
          experienceLevel: "intermediate",
          trainingBias: null,
          limitations: null,
          locationContext: null,
          seasonContext: null,
          gameFrequencyPerWeek: null,
          practiceFrequencyPerWeek: null,
          userAge: null,
          isOlderAdult: false,
        },
        focusMode: "strength",
        hasActiveProgram: false,
      });
    } finally {
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
      if (previousIntegrationKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = previousIntegrationKey;
    }

    expect(generated.generationProvenance).toMatchObject({
      provider: "local_fallback",
      fallbackUsed: true,
    });
    expect(generated.structuredData).toBeTruthy();

    const system = await createTrainingSystemFromProgram(
      user.id,
      generated.structuredData!,
      conversation.id,
      "strength",
    );

    const rows = await db
      .select({ name: sessionExercises.name })
      .from(sessionExercises)
      .innerJoin(trainingSessions, eq(sessionExercises.trainingSessionId, trainingSessions.id))
      .innerJoin(trainingWeeks, eq(trainingSessions.trainingWeekId, trainingWeeks.id))
      .innerJoin(trainingPhases, eq(trainingWeeks.trainingPhaseId, trainingPhases.id))
      .where(and(eq(trainingPhases.trainingSystemId, system.id)));

    const uniqueNames = [...new Set(rows.map((row) => row.name))].sort();
    const audits = uniqueNames.map((name) => auditCanonicalExerciseEquipment(name, EQUIPMENT_MODE));
    const incompatible = audits.filter((audit) => !audit.compatible && audit.resolution !== "unknown");
    const uncatalogued = audits.filter((audit) => audit.resolution === "unknown");

    console.log("[PersistedEquipmentAudit]", JSON.stringify({
      request: REQUEST,
      systemId: system.id,
      totalExerciseRows: rows.length,
      uniqueExerciseCount: uniqueNames.length,
      incompatibleCount: incompatible.length,
      uncataloguedCount: uncatalogued.length,
      exercises: audits.map((audit) => ({
        persistedName: audit.exerciseName,
        canonicalNames: audit.canonicalNames,
        equipment: audit.canonicalEquipment,
        resolution: audit.resolution,
        compatible: audit.compatible,
      })),
    }));

    expect(rows.length).toBeGreaterThan(0);
    expect(incompatible).toEqual([]);
    expect(uncatalogued).toEqual([]);
    expect(audits.every((audit) => audit.compatible)).toBe(true);
  });
});
