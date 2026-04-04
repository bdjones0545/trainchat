import {
  db,
  usersTable,
  userProfilesTable,
  conversationsTable,
  messagesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { convertGuestSession, getGuestSession } from "./guestService";
import { logger } from "./logger";

// ─── Teaser Limits ─────────────────────────────────────────────────────────────
// Mirrors GUEST_CONFIG.TEASER_TOTAL_LIMIT on the frontend.
// Adjust both together when changing the teaser gate.
export const TEASER_GENERATE_LIMIT = 1; // max distinct program generations
export const TEASER_TOTAL_LIMIT = 2; // total interactions (1 program + 1 followup)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STYLE_TO_DURATION: Record<string, number> = {
  "Heavy Compound Lifts": 75,
  "High-Volume Isolation": 60,
  "Athletic & Explosive": 60,
  "Low-Impact & Joint Friendly": 45,
  "HIIT & Circuit Style": 45,
  "Slow & Controlled": 60,
};

function formatProgramAsText(program: any): string {
  if (!program) return "";

  const lines: string[] = [
    `**${program.programName}**`,
    `_${program.weeklyStructure}_`,
    "",
    program.coachIntro ?? "",
    "",
    program.rationale ?? "",
    "",
    "---",
    "",
  ];

  for (const day of program.days ?? []) {
    lines.push(`**Day ${day.dayNumber}: ${day.name}**`);
    lines.push(`_${day.focus}_`);
    lines.push("");
    for (const ex of day.exercises ?? []) {
      lines.push(
        `• **${ex.name}** — ${ex.sets} sets × ${ex.reps}  |  Rest: ${ex.rest}`,
      );
      if (ex.notes) lines.push(`  _${ex.notes}_`);
    }
    if (day.dayNotes) {
      lines.push("");
      lines.push(day.dayNotes);
    }
    lines.push("");
  }

  if (program.coachNote) {
    lines.push("---");
    lines.push(program.coachNote);
  }
  if (program.progressionPrinciple) {
    lines.push("");
    lines.push(`_Progression: ${program.progressionPrinciple}_`);
  }

  return lines.join("\n").trim();
}

// ─── Core Merge Function ───────────────────────────────────────────────────────

/**
 * Merge a guest session into a real user account.
 *
 * Called immediately after registration or login when a deviceId is present.
 *
 * Steps:
 * 1. Load the guest session — bail safely if missing or already converted
 * 2. Populate user_profile from onboarding answers (if user has none)
 * 3. Create a starter conversation with the generated program (if user has none)
 * 4. Mark user onboardingComplete = true (skips the in-app onboarding flow)
 * 5. Convert guest session (status → converted, linkedUserId, convertedAt)
 */
export async function mergeGuestToUser(
  deviceId: string,
  userId: number,
): Promise<{ merged: boolean; reason?: string }> {
  // Load guest session
  const session = await getGuestSession(deviceId);
  if (!session) {
    logger.warn(
      { deviceId, userId },
      "mergeGuestToUser: guest session not found — skipping",
    );
    return { merged: false, reason: "session_not_found" };
  }

  // Already converted for this user — idempotent
  if (session.status === "converted" && session.linkedUserId === userId) {
    logger.debug(
      { deviceId, userId },
      "mergeGuestToUser: already converted for this user",
    );
    return { merged: true, reason: "already_converted" };
  }

  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const answers = meta.onboardingAnswers as Record<string, any> | undefined;
  const program = meta.firstProgramOutput as Record<string, any> | undefined;

  // ── 1. Populate user profile ──────────────────────────────────────────────
  const [existingProfile] = await db
    .select({ id: userProfilesTable.id })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  if (!existingProfile && answers) {
    const equipmentList = Array.isArray(answers.equipment)
      ? answers.equipment
      : [];
    const equipmentAccess = equipmentList.join(", ") || "Full Gym";
    const sessionDuration = STYLE_TO_DURATION[answers.style as string] ?? 60;

    await db.insert(userProfilesTable).values({
      userId,
      trainingGoal: String(answers.goal ?? "General Fitness"),
      experienceLevel: String(answers.experience ?? "Intermediate"),
      trainingStyle: String(answers.style ?? "General"),
      daysPerWeek: Number(answers.frequency) || 3,
      sessionDuration,
      equipmentAccess,
      injuries: answers.injuries ? String(answers.injuries) : null,
      sportFocus: answers.sport ? String(answers.sport) : null,
    });

    logger.info(
      { deviceId, userId },
      "mergeGuestToUser: user profile created from onboarding answers",
    );
  }

  // ── 2. Create starter conversation ───────────────────────────────────────
  const [existingConv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, userId))
    .limit(1);

  if (!existingConv && program) {
    const programName = String(program.programName ?? "Your Training Program");

    const [conv] = await db
      .insert(conversationsTable)
      .values({ userId, title: programName })
      .returning();

    const programText = formatProgramAsText(program);
    const intro = program.coachIntro
      ? `${program.coachIntro}\n\nHere is your personalized program:\n\n${programText}`
      : programText;

    await db.insert(messagesTable).values({
      conversationId: conv.id,
      role: "assistant",
      content: intro,
      structuredData: JSON.stringify({
        type: "guest_program_import",
        program,
        sourceDeviceId: deviceId,
      }),
    });

    logger.info(
      { deviceId, userId, conversationId: conv.id },
      "mergeGuestToUser: starter conversation created from guest program",
    );
  }

  // ── 3. Mark user onboarding complete ─────────────────────────────────────
  await db
    .update(usersTable)
    .set({ onboardingComplete: true })
    .where(eq(usersTable.id, userId));

  // ── 4. Convert guest session ──────────────────────────────────────────────
  await convertGuestSession(deviceId, userId);

  logger.info(
    { deviceId, userId },
    "mergeGuestToUser: guest session merged successfully",
  );

  return { merged: true };
}
