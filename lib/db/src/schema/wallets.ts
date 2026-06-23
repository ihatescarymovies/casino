import {
  integer,
  pgTable,
  serial,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable as authUsersTable } from "./auth";

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => authUsersTable.id),
  balance: integer("balance").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Wallet = typeof walletsTable.$inferSelect;
export type InsertWallet = typeof walletsTable.$inferInsert;
