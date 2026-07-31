export * from "./demo-transactions";
export * from "./demo-wallets";
export * from "./game-rounds";
export * from "./game-sessions";
export * from "./games";
export * from "./hash-chains";
export * from "./payments";
export * from "./promotions";
export * from "./transactions";
export * from "./wallets";
export * from "./winners";

// auth.ts — Replit auth compatible (varchar IDs, mandatory for Replit Auth)
export {
  sessionsTable as authSessionsTable,
  usersTable as authUsersTable,
  type UpsertUser as AuthUpsertUser,
  type User as AuthUser,
} from "./auth";

// sessions.ts — app user login session store (renamed to avoid collision with auth sessions)
export { sessionsTable as userSessionsTable, type Session, type InsertSession } from "./sessions";
