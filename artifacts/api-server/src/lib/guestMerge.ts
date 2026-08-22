import {
  db,
  usersTable,
  userProfilesTable,
  conversationsTable,
  messagesTable,
  trainingSystems,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { convertGuestSession, getGuestSession } from "./guestService";
import { createTrainingSystemFromProgram, type ChatProgram } from "./training-system-service";
import type { GuestChatProgram } from "./guestChat";
import { logger } from "./logger";
import { profileSettingsSchema } from "./profile-settings";

// ─── Teaser Limits ─────────────────────────────────────────────────────────────
// Mirrors GUEST_CONFIG.TEASER_TOTAL_LIMIT on the frontend.
// Adjust both together when changing the teaser gate.
export const TEASER_GENERATE_LIMIT = 1; // max distinct program generations
export const TEASER_TOTAL_LIMIT = 8; // free chat messages before paywall (Phase 3: 5→8)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STYLE_TO_DURATION: Record<string, number> = {
  "Heavy Compound Lifts": 75,
  "High-Volume Isolation": 60,
  "Athletic & Explosive": 60,
  "Low-Impact & Joint Friendly": 45,
  "HIIT & Circuit Style": 45,
  "Slow & Controlled": 60,
};

const GUEST_GOAL_ALIASES: Record<string, string> = {
  "general fitness": "general_fitness",
  "build muscle": "muscle_gain",
  "muscle gain": "muscle_gain",
  strength: "strength",
  "fat loss": "fat_loss",
  endurance: "endurance",
  "athletic performance": "sport_performance",
};

/**
 * Guest onboarding predates the canonical profile vocabulary. Normalize the
 * supported legacy labels, then use the exact registered-profile contract
 * rather than inserting arbitrary guest-session values.
 */
function parseGuestProfileAnswers(answers: Record<string, unknown>) {
  const rawGoal = String(answers.goal ?? "").trim().toLowerCase();
  const trainingGoal = GUEST_GOAL_ALIASES[rawGoal] ?? rawGoal.replace(/\s+/g, "_");
  const rawExperience = String(answers.experience ?? "").trim().toLowerCase();
  const equipmentAccess = Array.isArray(answers.equipment)
    ? answers.equipment.map(String).join(", ")
    : "";

  return profileSettingsSchema.safeParse({
    trainingGoal,
    experienceLevel: rawExperience,
    trainingStyle: "general_strength",
    daysPerWeek: Number(answers.frequency),
    sessionDuration: STYLE_TO_DURATION[String(answers.style)] ?? 60,
    equipmentAccess: equipmentAccess || "full gym",
    injuries: answers.injuries ? String(answers.injuries) : null,
    sportFocus: answers.sport ? String(answers.sport) : null,
  });
}

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

/**
 * Convert a GuestChatProgram (from conversational chat extraction) to the
 * ChatProgram format that createTrainingSystemFromProgram accepts.
 */
function guestChatProgramToChatProgram(gcp: GuestChatProgram): ChatProgram {
  return {
    programName: gcp.programName,
    description: gcp.description,
    progressionStrategy: gcp.progressionStrategy,
    splitType: gcp.splitType,
    days: gcp.days.map((d) => ({
      dayNumber: d.dayNumber,
      name: d.name,
      focus: d.focus,
      exercises: d.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        notes: ex.notes,
      })),
      notes: d.notes,
    })),
  };
}

/**
 * Convert a legacy GuestProgram (from onboarding generate flow) to ChatProgram format.
 */
function legacyGuestProgramToChatProgram(gp: any): ChatProgram {
  return {
    programName: gp.programName ?? "Training Program",
    description: gp.rationale ?? gp.coachIntro,
    progressionStrategy: gp.progressionPrinciple,
    days: (gp.days ?? []).map((d: any) => ({
      dayNumber: d.dayNumber,
      name: d.name,
      focus: d.focus,
      exercises: (d.exercises ?? []).map((ex: any) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        notes: ex.notes,
      })),
      notes: d.dayNotes,
    })),
  };
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
 * 3. Create a starter conversation with the full chat history
 * 4. Create a real training_system from the guest's structured program JSON (Phase 3)
 * 5. Mark user onboardingComplete = true (skips the in-app onboarding flow)
 * 6. Convert guest session (status → converted, linkedUserId, convertedAt)
 */
export async function mergeGuestToUser(
  deviceId: string,
  userId: number,
): Promise<{ merged: boolean; reason?: string }> {
  const session = await getGuestSession(deviceId);
  if (!session) {
    logger.warn(
      { deviceId, userId },
      "mergeGuestToUser: guest session not found — skipping",
    );
    return { merged: false, reason: "session_not_found" };
  }

  if (session.status === "converted" && session.linkedUserId === userId) {
    logger.debug(
      { deviceId, userId },
      "mergeGuestToUser: already converted for this user",
    );
    return { merged: true, reason: "already_converted" };
  }

  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const answers = meta.onboardingAnswers as Record<string, any> | undefined;
  // Phase 3: prefer the conversational chat program JSON over the legacy generate output
  const chatProgramJSON = meta.chatProgramJSON as GuestChatProgram | undefined;
  const legacyProgram = meta.firstProgramOutput as Record<string, any> | undefined;

  // ── 1. Populate user profile ──────────────────────────────────────────────
  const [existingProfile] = await db
    .select({ id: userProfilesTable.id })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  if (!existingProfile && answers) {
    const profile = parseGuestProfileAnswers(answers);
    if (!profile.success) {
      logger.warn(
        { deviceId, userId, issueCount: profile.error.issues.length },
        "mergeGuestToUser: skipped invalid guest profile answers",
      );
    } else {
      await db.insert(userProfilesTable).values({ userId, ...profile.data });
      logger.info(
        { deviceId, userId },
        "mergeGuestToUser: user profile created from onboarding answers",
      );
    }
  }

  // ── 2. Create starter conversation ───────────────────────────────────────
  const [existingConv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, userId))
    .limit(1);

  if (!existingConv) {
    const chatHistory = meta.chatHistory as Array<{ role: string; content: string }> | undefined;
    const convTitle = chatProgramJSON
      ? chatProgramJSON.programName
      : legacyProgram
      ? String(legacyProgram.programName ?? "Your Training Program")
      : "Your Training Program";

    const [conv] = await db
      .insert(conversationsTable)
      .values({ userId, title: convTitle })
      .returning();

    if (chatHistory && chatHistory.length > 0) {
      const messageRows = chatHistory.map((msg) => ({
        conversationId: conv.id,
        role: msg.role as "user" | "assistant",
        content: msg.content,
        structuredData: null as string | null,
      }));

      await db.insert(messagesTable).values(messageRows);

      logger.info(
        { deviceId, userId, conversationId: conv.id, messageCount: messageRows.length },
        "mergeGuestToUser: full chat history restored from guest session",
      );
    } else if (legacyProgram) {
      const programText = formatProgramAsText(legacyProgram);
      const intro = legacyProgram.coachIntro
        ? `${legacyProgram.coachIntro}\n\nHere is your personalized program:\n\n${programText}`
        : programText;

      await db.insert(messagesTable).values({
        conversationId: conv.id,
        role: "assistant",
        content: intro,
        structuredData: JSON.stringify({
          type: "guest_program_import",
          program: legacyProgram,
          sourceDeviceId: deviceId,
        }),
      });

      logger.info(
        { deviceId, userId, conversationId: conv.id },
        "mergeGuestToUser: starter conversation created from guest program (legacy)",
      );
    }
  }

  // ── 3. Phase 3: Create real training system from structured program JSON ──
  // This is the key Phase 3 addition — after conversion the user immediately
  // has an active, editable training system rather than just chat history.
  const existingSystemRows = await db
    .select({ id: trainingSystems.id })
    .from(trainingSystems)
    .where(eq(trainingSystems.userId, userId))
    .limit(1)
    .catch(() => [] as { id: number }[]);
  const existingSystem = existingSystemRows[0];

  if (!existingSystem) {
    let chatProgram: ChatProgram | null = null;

    if (chatProgramJSON && chatProgramJSON.days && chatProgramJSON.days.length > 0) {
      chatProgram = guestChatProgramToChatProgram(chatProgramJSON);
      logger.info(
        { deviceId, userId, programName: chatProgram.programName },
        "mergeGuestToUser: using conversational chat program JSON for training system"
      );
    } else if (legacyProgram && legacyProgram.days && Array.isArray(legacyProgram.days) && legacyProgram.days.length > 0) {
      chatProgram = legacyGuestProgramToChatProgram(legacyProgram);
      logger.info(
        { deviceId, userId, programName: chatProgram.programName },
        "mergeGuestToUser: using legacy program JSON for training system"
      );
    }

    if (chatProgram) {
      try {
        const system = await createTrainingSystemFromProgram(userId, chatProgram);
        logger.info(
          { deviceId, userId, systemId: system.id, programName: chatProgram.programName },
          "mergeGuestToUser: real training system created from guest program"
        );
      } catch (err: any) {
        // Non-fatal: the user still gets their chat history, they just need to build a system
        logger.warn(
          { deviceId, userId, err: err.message },
          "mergeGuestToUser: failed to create training system from guest program — continuing"
        );
      }
    }
  }

  // ── 4. Mark user onboarding complete ─────────────────────────────────────
  await db
    .update(usersTable)
    .set({ onboardingComplete: true })
    .where(eq(usersTable.id, userId));

  // ── 5. Convert guest session ──────────────────────────────────────────────
  await convertGuestSession(deviceId, userId);

  logger.info(
    { deviceId, userId },
    "mergeGuestToUser: guest session merged successfully",
  );

  return { merged: true };
}
