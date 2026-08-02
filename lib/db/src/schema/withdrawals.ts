import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable as authUsersTable } from "./auth";

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => authUsersTable.id),
  payoutId: integer("payout_id"),
  blockchainCode: varchar("blockchain_code", { length: 10 }).notNull(),
  currencyCode: varchar("currency_code", { length: 10 }).notNull(),
  amountUsd: integer("amount_usd").notNull(),
  toAddress: varchar("to_address", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  txHash: varchar("tx_hash", { length: 255 }),
  fee: varchar("fee", { length: 50 }),
  failureReason: varchar("failure_reason", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;
export type InsertWithdrawalRequest =
  typeof withdrawalRequestsTable.$inferInsert;
