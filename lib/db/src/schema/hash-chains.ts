import {
  boolean,
  pgTable,
  serial,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

export const hashChainsTable = pgTable("hash_chains", {
  id: serial("id").primaryKey(),
  serverSeedHash: varchar("server_seed_hash", { length: 64 }).notNull(),
  serverSeed: varchar("server_seed", { length: 128 }).notNull(),
  previousHash: varchar("previous_hash", { length: 64 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  rotatedAt: timestamp("rotated_at"),
  rotationReason: varchar("rotation_reason", { length: 50 }),
});

export type HashChain = typeof hashChainsTable.$inferSelect;
export type InsertHashChain = typeof hashChainsTable.$inferInsert;
