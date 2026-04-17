import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const supportSubmissionsTable = pgTable("support_submissions", {
  id: serial("id").primaryKey(),

  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),

  type: text("type", { enum: ["contact", "bug", "feature"] }).notNull(),

  name: text("name").notNull(),
  email: text("email").notNull(),

  category: text("category"),
  subject: text("subject"),

  message: text("message").notNull(),

  metadata: jsonb("metadata"),

  emailSent: text("email_sent").notNull().default("pending"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSupportSubmissionSchema = createInsertSchema(supportSubmissionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportSubmission = z.infer<typeof insertSupportSubmissionSchema>;
export type SupportSubmission = typeof supportSubmissionsTable.$inferSelect;
