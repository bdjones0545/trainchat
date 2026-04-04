import { db, guestSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { GuestSession } from "@workspace/db";

export type { GuestSession };

function normalizeGuestSession(session: GuestSession) {
  return {
    id: session.id,
    deviceId: session.deviceId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastActiveAt: session.lastActiveAt,
    teaserUsesCount: session.teaserUsesCount,
    onboardingStartedAt: session.onboardingStartedAt,
    onboardingCompletedAt: session.onboardingCompletedAt,
    firstProgramGeneratedAt: session.firstProgramGeneratedAt,
    paywallShownAt: session.paywallShownAt,
    convertedAt: session.convertedAt,
    linkedUserId: session.linkedUserId,
    metadata: session.metadata,
  };
}

/**
 * Initialize a guest session for the given device ID.
 * - Returns existing session if one is found (and updates lastActiveAt).
 * - Creates a new session if none exists.
 *
 * Future phases can extend this to gate blocked devices, run conversion
 * checks, and log analytics events.
 */
export async function initGuestSession(deviceId: string) {
  if (!deviceId || typeof deviceId !== "string" || deviceId.trim().length < 8) {
    throw new Error("Invalid deviceId");
  }

  const sanitizedId = deviceId.trim().slice(0, 128);

  const [existing] = await db
    .select()
    .from(guestSessionsTable)
    .where(eq(guestSessionsTable.deviceId, sanitizedId))
    .limit(1);

  if (existing) {
    if (existing.status === "blocked") {
      logger.warn({ deviceId: sanitizedId }, "Blocked guest session attempted access");
      throw new Error("Guest session blocked");
    }

    const [updated] = await db
      .update(guestSessionsTable)
      .set({ lastActiveAt: new Date() })
      .where(eq(guestSessionsTable.deviceId, sanitizedId))
      .returning();

    logger.debug({ deviceId: sanitizedId, id: existing.id }, "Guest session resumed");
    return normalizeGuestSession(updated);
  }

  const [created] = await db
    .insert(guestSessionsTable)
    .values({ deviceId: sanitizedId })
    .returning();

  logger.info({ deviceId: sanitizedId, id: created.id }, "Guest session created");
  return normalizeGuestSession(created);
}

/**
 * Fetch an existing guest session by device ID without touching lastActiveAt.
 */
export async function getGuestSession(deviceId: string) {
  const sanitizedId = deviceId.trim().slice(0, 128);

  const [session] = await db
    .select()
    .from(guestSessionsTable)
    .where(eq(guestSessionsTable.deviceId, sanitizedId))
    .limit(1);

  return session ? normalizeGuestSession(session) : null;
}

/**
 * Partially update a guest session by device ID.
 * Used by future phases to record onboarding progress, paywall events, etc.
 */
export async function updateGuestSession(
  deviceId: string,
  data: Partial<
    Pick<
      GuestSession,
      | "status"
      | "teaserUsesCount"
      | "onboardingStartedAt"
      | "onboardingCompletedAt"
      | "firstProgramGeneratedAt"
      | "paywallShownAt"
      | "convertedAt"
      | "linkedUserId"
      | "metadata"
    >
  >
) {
  const sanitizedId = deviceId.trim().slice(0, 128);

  const [updated] = await db
    .update(guestSessionsTable)
    .set({ ...data, lastActiveAt: new Date() })
    .where(eq(guestSessionsTable.deviceId, sanitizedId))
    .returning();

  return updated ? normalizeGuestSession(updated) : null;
}

/**
 * Link a guest session to a real user account after conversion.
 * Marks the session as converted and stores the linked user ID.
 */
export async function convertGuestSession(deviceId: string, userId: number) {
  return updateGuestSession(deviceId, {
    status: "converted",
    linkedUserId: userId,
    convertedAt: new Date(),
  });
}
