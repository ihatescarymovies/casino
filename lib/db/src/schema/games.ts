import { pgTable, serial, text, boolean, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamesTable = pgTable("games", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  provider: text("provider").notNull(),
  rtp: real("rtp").notNull(),
  minBet: real("min_bet"),
  maxBet: real("max_bet"),
  imageUrl: text("image_url").notNull(),
  isFeatured: boolean("is_featured").notNull().default(false),
  isHot: boolean("is_hot").notNull().default(false),
  isNew: boolean("is_new").notNull().default(false),
  description: text("description"),
  jackpotAmount: real("jackpot_amount"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({ id: true, createdAt: true });
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;
