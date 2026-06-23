import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable as authUsersTable } from "./auth";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => authUsersTable.id),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
