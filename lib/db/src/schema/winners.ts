import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const winnersTable = pgTable("winners", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  gameName: text("game_name").notNull(),
  winAmount: real("win_amount").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  avatarUrl: text("avatar_url"),
});

export const insertWinnerSchema = createInsertSchema(winnersTable).omit({ id: true });
export type InsertWinner = z.infer<typeof insertWinnerSchema>;
export type Winner = typeof winnersTable.$inferSelect;
