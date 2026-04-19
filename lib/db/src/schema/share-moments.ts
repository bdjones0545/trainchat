import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const shareMomentAuditTable = pgTable("share_moment_audit", {
  id: serial("id").primaryKey(),

  userId: integer("user_id"),

  momentType: text("moment_type").notNull(),

  triggerSource: text("trigger_source").notNull(),

  dataSource: text("data_source"),

  shareCardGenerated: boolean("share_card_generated").notNull().default(false),

  shareActionUsed: text("share_action_used"),

  captionGenerated: boolean("caption_generated").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShareMomentAudit = typeof shareMomentAuditTable.$inferSelect;
export type InsertShareMomentAudit = typeof shareMomentAuditTable.$inferInsert;
