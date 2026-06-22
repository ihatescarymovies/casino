import { pgTable, serial, integer, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const gameRoundsTable = pgTable("game_rounds", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  gameType: varchar("game_type", { length: 50 }).notNull(),
  betAmount: integer("bet_amount").notNull(),
  payout: integer("payout").notNull().default(0),
  result: varchar("result", { length: 20 }),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type GameRound = typeof gameRoundsTable.$inferSelect;
export type InsertGameRound = typeof gameRoundsTable.$inferInsert;
