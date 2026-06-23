import {
  boolean,
  pgTable,
  serial,
  integer,
  varchar,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable as authUsersTable } from "./auth";
import { hashChainsTable } from "./hash-chains";

export const gameRoundsTable = pgTable("game_rounds", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => authUsersTable.id),
  gameType: varchar("game_type", { length: 50 }).notNull(),
  betAmount: integer("bet_amount").notNull(),
  payout: integer("payout").notNull().default(0),
  result: varchar("result", { length: 20 }),
  details: jsonb("details"),
  serverSeedHash: varchar("server_seed_hash", { length: 64 }),
  clientSeed: varchar("client_seed", { length: 64 }),
  nonce: integer("nonce").default(0),
  chainId: integer("chain_id").references(() => hashChainsTable.id),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type GameRound = typeof gameRoundsTable.$inferSelect;
export type InsertGameRound = typeof gameRoundsTable.$inferInsert;
