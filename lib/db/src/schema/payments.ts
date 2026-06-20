import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const paymentSessionsTable = pgTable("payment_sessions", {
  referenceId: varchar("reference_id").primaryKey(),
  invoiceId: varchar("invoice_id").notNull(),
  userId: varchar("user_id").notNull(),
  amountUsd: integer("amount_usd").notNull(),
  status: varchar("status").notNull().default("open"),
  filledAmount: varchar("filled_amount"),
  filledCurrency: varchar("filled_currency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentSession = typeof paymentSessionsTable.$inferSelect;
export type InsertPaymentSession = typeof paymentSessionsTable.$inferInsert;
