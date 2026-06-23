import {
  boolean,
  jsonb,
  pgTable,
  serial,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable as authUsersTable } from "./auth";

export const gameSessionsTable = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => authUsersTable.id),
  gameType: varchar("game_type", { length: 50 }).notNull(),
  sessionData: jsonb("session_data").notNull().default("{}"),
  isDemo: boolean("is_demo").default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type GameSession = typeof gameSessionsTable.$inferSelect;
export type InsertGameSession = typeof gameSessionsTable.$inferInsert;
