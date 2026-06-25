import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { demoWalletsTable } from "./demo-wallets";
import { usersTable as authUsersTable } from "./auth";

export const demoTransactionsTable = pgTable("demo_transactions", {
  id: serial("id").primaryKey(),
  demoWalletId: integer("demo_wallet_id")
    .notNull()
    .references(() => demoWalletsTable.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => authUsersTable.id),
  type: varchar("type", { length: 20 }).notNull(),
  amount: integer("amount").notNull(),
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  gameType: varchar("game_type", { length: 64 }),
  roundId: varchar("round_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DemoTransaction = typeof demoTransactionsTable.$inferSelect;
export type InsertDemoTransaction = typeof demoTransactionsTable.$inferInsert;
