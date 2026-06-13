import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const PRODUCT_CATEGORIES = [
  "Speed Development",
  "Strength Development",
  "Recovery & Regeneration",
  "Monitoring & Assessment",
  "Conditioning",
  "Mobility & Rehabilitation",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_COST_TIERS = ["$", "$$", "$$$", "$$$$"] as const;
export type ProductCostTier = (typeof PRODUCT_COST_TIERS)[number];

export const productDirectoryTable = pgTable("product_directory", {
  id: serial("id").primaryKey(),

  name: text("name").notNull(),

  brand: text("brand"),

  category: text("category").$type<ProductCategory>().notNull(),

  subcategory: text("subcategory"),

  description: text("description"),

  primaryUse: text("primary_use"),

  sports: text("sports").array(),

  ageGroups: text("age_groups").array(),

  costTier: text("cost_tier").$type<ProductCostTier>(),

  portability: text("portability"),

  equipmentRequired: text("equipment_required"),

  website: text("website"),

  imageUrl: text("image_url"),

  isFeatured: boolean("is_featured").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ProductDirectoryItem =
  typeof productDirectoryTable.$inferSelect;
export type InsertProductDirectoryItem =
  typeof productDirectoryTable.$inferInsert;
