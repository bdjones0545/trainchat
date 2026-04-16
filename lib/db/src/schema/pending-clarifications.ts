import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";
import { usersTable } from "./users";

export const pendingClarificationsTable = pgTable("pending_clarifications", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  targetProgramId: integer("target_program_id"),
  targetSessionId: integer("target_session_id"),
  originalRequest: text("original_request").notNull(),
  intentFamily: text("intent_family").notNull(),
  pendingAspect: text("pending_aspect").notNull(),
  partialEditPlan: text("partial_edit_plan"),
  clarificationQuestion: text("clarification_question").notNull(),
  editSubtype: text("edit_subtype"),
  editIntent: text("edit_intent"),
  turnsRemaining: integer("turns_remaining").notNull().default(2),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PendingClarification = typeof pendingClarificationsTable.$inferSelect;
