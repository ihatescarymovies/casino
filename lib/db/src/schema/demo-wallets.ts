import {
  integer,
  pgTable,
  serial,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable as authUsersTable } from "./auth";

export const demoWalletsTable = pgTable("demo_wallets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => authUsersTable.id),
  balance: integer("balance").notNull().default(0),
  resetCount: integer("reset_count").notNull().default(0),
  lastResetAt: timestamp("last_reset_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DemoWallet = typeof demoWalletsTable.$inferSelect;
export type InsertDemoWallet = typeof demoWalletsTable.$inferInsert;
