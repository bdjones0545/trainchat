import { and, eq, sql } from "drizzle-orm";
import { chatTurnsTable, db, usersTable } from "@workspace/db";

export type BeginTurnResult =
  | { state: "claimed"; turnId: number }
  | { state: "duplicate"; status: "processing" | "succeeded" | "failed"; responsePayload: unknown | null };

export async function beginChatTurn(input: {
  conversationId: number;
  userId: number;
  clientTurnId: string;
}): Promise<BeginTurnResult> {
  const [claimed] = await db
    .insert(chatTurnsTable)
    .values({ ...input, status: "processing" })
    .onConflictDoNothing({
      target: [chatTurnsTable.conversationId, chatTurnsTable.clientTurnId],
    })
    .returning({ id: chatTurnsTable.id });

  if (claimed) return { state: "claimed", turnId: claimed.id };

  const [existing] = await db
    .select({
      userId: chatTurnsTable.userId,
      status: chatTurnsTable.status,
      responsePayload: chatTurnsTable.responsePayload,
    })
    .from(chatTurnsTable)
    .where(and(
      eq(chatTurnsTable.conversationId, input.conversationId),
      eq(chatTurnsTable.clientTurnId, input.clientTurnId),
    ));

  // A turn ID cannot be transferred between users even if conversation data is
  // corrupted or ownership changes concurrently.
  if (!existing || existing.userId !== input.userId) {
    return { state: "duplicate", status: "failed", responsePayload: null };
  }

  let responsePayload: unknown | null = null;
  if (existing.responsePayload) {
    try { responsePayload = JSON.parse(existing.responsePayload); } catch { responsePayload = null; }
  }
  return {
    state: "duplicate",
    status: existing.status as "processing" | "succeeded" | "failed",
    responsePayload,
  };
}

/**
 * Atomically records the final result and charges at most once. Only successful
 * product outcomes consume quota; provider/persistence failures do not.
 */
export async function finalizeChatTurn(input: {
  turnId: number;
  userId: number;
  responsePayload: unknown;
  successful: boolean;
  shouldChargeQuota: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [turn] = await tx
      .select({ status: chatTurnsTable.status, quotaCharged: chatTurnsTable.quotaCharged })
      .from(chatTurnsTable)
      .where(and(eq(chatTurnsTable.id, input.turnId), eq(chatTurnsTable.userId, input.userId)))
      .for("update");

    if (!turn || turn.status !== "processing") return;

    const charge = input.successful && input.shouldChargeQuota && !turn.quotaCharged;
    if (charge) {
      await tx
        .update(usersTable)
        .set({ messageCount: sql`${usersTable.messageCount} + 1` })
        .where(eq(usersTable.id, input.userId));
    }

    await tx
      .update(chatTurnsTable)
      .set({
        status: input.successful ? "succeeded" : "failed",
        responsePayload: JSON.stringify(input.responsePayload),
        quotaCharged: charge || turn.quotaCharged,
        completedAt: new Date(),
      })
      .where(eq(chatTurnsTable.id, input.turnId));
  });
}
