export * from "./game-rounds";
export * from "./game-sessions";
export * from "./games";
export * from "./hash-chains";
export * from "./payments";
export * from "./promotions";
export * from "./transactions";
export * from "./wallets";
export * from "./winners";

// auth.ts — re-export with renames to avoid collisions with sessions.ts and users.ts
export {
  sessionsTable as authSessionsTable,
  usersTable as authUsersTable,
  type UpsertUser as AuthUpsertUser,
  type User as AuthUser,
} from "./auth";

// sessions.ts (app session store, NOT Replit auth) — conflicts with auth.ts's sessionsTable
export { sessionsTable, type Session, type InsertSession } from "./sessions";

// users.ts (legacy serial PK users) — conflicts with auth.ts's usersTable and User
export {
  usersTable,
  oauthAccountsTable,
  type User as LegacyUser,
  type InsertUser as LegacyInsertUser,
  type OAuthAccount,
} from "./users";
