import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { walletsTable } from "./wallets";
import { usersTable as authUsersTable } from "./auth";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id")
    .notNull()
    .references(() => walletsTable.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => authUsersTable.id),
  type: varchar("type", { length: 20 }).notNull(),
  amount: integer("amount").notNull(),
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("completed"),
  referenceId: varchar("reference_id", { length: 64 }),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;
export type InsertTransaction = typeof transactionsTable.$inferInsert;
