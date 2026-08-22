import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, trainingSystems, userProfilesTable, usersTable } from "@workspace/db";
import profileRouter from "../src/routes/profile";
import { resolveAgentSettingsContext } from "../src/lib/agent-settings-resolver";

let passed = 0;
function check(value: unknown, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`);
  passed++;
  console.log(`✓ ${message}`);
}

const coachSettings = {
  conciseResponses: true, proactiveInsights: false, autoAdjustRecommendations: false,
  memoryPersonalization: true, coachingStyle: "analytical", explanationDepth: "detailed",
  trainingAggression: "conservative", requireApprovalStructural: true,
  requireApprovalDeload: true, adaptFromReadiness: false, adaptFromMissedSessions: false,
};

const baseProfile = {
  trainingGoal: "strength", experienceLevel: "intermediate", trainingStyle: "general_strength",
  daysPerWeek: 4, sessionDuration: 60, equipmentAccess: "full gym",
  injuries: null, sportFocus: null,
};

async function main() {
  const [user] = await db.insert(usersTable).values({ isAnonymous: true, deviceId: `feature-audit-${Date.now()}` }).returning();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = { userId: user.id }; next(); });
  app.use(profileRouter);

  try {
    let response = await request(app).put("/profile/coach-settings").send(coachSettings);
    check(response.status === 200, "coaching settings persist through the authenticated API");
    response = await request(app).get("/profile/coach-settings");
    check(JSON.stringify(response.body) === JSON.stringify(coachSettings), "a fresh client restores server-authoritative coaching settings");
    const resolved = await resolveAgentSettingsContext(user.id, { ...coachSettings, coachingStyle: "supportive" });
    check(resolved.behavior.coachingStyle === "analytical", "AI routing consumes server-authoritative coaching settings over stale client cache");

    response = await request(app).post("/profile").send({ ...baseProfile, exercisePreferences: "front squat", exercisesToAvoid: "back squat" });
    check(response.status === 200, "canonical profile values are accepted");
    const [system] = await db.insert(trainingSystems).values({
      userId: user.id, name: "Audit Program", overarchingGoal: "strength",
      trainingStyle: "general_strength", weeklyFrequency: 4, equipmentAccess: "full gym",
    }).returning();

    response = await request(app).post("/profile").send({ ...baseProfile, experienceLevel: "advanced" });
    check(response.status === 200, "non-conflicting profile update succeeds");
    let [savedSystem] = await db.select().from(trainingSystems).where(eq(trainingSystems.id, system.id));
    check(savedSystem.needsReview === false, "non-conflicting changes do not stale the active program");
    let [savedProfile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, user.id));
    check(savedProfile.exercisePreferences === "front squat" && savedProfile.exercisesToAvoid === "back squat", "omitted preferences and exclusions are preserved");

    response = await request(app).post("/profile").send({ ...baseProfile, daysPerWeek: 3 });
    check(response.status === 200, "conflicting profile constraint persists immediately");
    [savedSystem] = await db.select().from(trainingSystems).where(eq(trainingSystems.id, system.id));
    check(savedSystem.needsReview === true, "conflicting settings mark the active program needs-review");
    check(Array.isArray(savedSystem.reviewReasons) && savedSystem.reviewReasons.includes("training_frequency"), "freshness API state includes a truthful bounded reason");

    const originalProgram = JSON.stringify({ name: savedSystem.name, goal: savedSystem.overarchingGoal, frequency: savedSystem.weeklyFrequency, equipment: savedSystem.equipmentAccess });
    for (const [label, profileChange, expectedReason] of [
      ["equipment", { equipmentAccess: "dumbbells only" }, "equipment_access"],
      ["injury", { injuries: "active knee pain" }, "injury_or_pain_constraint"],
      ["exclusion", { exercisesToAvoid: "back squat" }, "exercise_exclusions"],
    ] as const) {
      await db.update(userProfilesTable).set({ ...baseProfile, exercisesToAvoid: null }).where(eq(userProfilesTable.userId, user.id));
      await db.update(trainingSystems).set({ needsReview: false, reviewReasons: null, markedNeedsReviewAt: null }).where(eq(trainingSystems.id, system.id));
      response = await request(app).post("/profile").send({ ...baseProfile, ...profileChange });
      [savedSystem] = await db.select().from(trainingSystems).where(eq(trainingSystems.id, system.id));
      check(response.status === 200 && savedSystem.needsReview === true && (savedSystem.reviewReasons as string[]).includes(expectedReason), `${label} change marks the existing program needs-review`);
      check(JSON.stringify({ name: savedSystem.name, goal: savedSystem.overarchingGoal, frequency: savedSystem.weeklyFrequency, equipment: savedSystem.equipmentAccess }) === originalProgram, `${label} change does not silently mutate the existing program`);
    }

    response = await request(app).post("/profile").send({ ...baseProfile, daysPerWeek: 9 });
    check(response.status === 400, "unsupported profile values are rejected at the API boundary");
    response = await request(app).put("/profile/coach-settings").send({ ...coachSettings, coachingStyle: "unsupported" });
    check(response.status === 400, "unsupported coaching controls are rejected at the API boundary");

    const [identity] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
    check(Object.entries(coachSettings).every(([key, value]) => (identity.coachingSettings as any)?.[key] === value), "invalid saves do not overwrite persisted coaching controls");
    console.log(`\n${passed} passed, 0 failed`);
  } finally {
    await db.delete(usersTable).where(eq(usersTable.id, user.id));
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
