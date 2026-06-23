import { vi, beforeAll } from "vitest";

/**
 * Mock @workspace/db so auth middleware doesn't fail when no PG is available.
 * The health route doesn't need DB — this just prevents import errors.
 */
vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  sessionsTable: {},
  usersTable: {},
  walletsTable: {},
  transactionsTable: {},
  gamesTable: {},
  gameRoundsTable: {},
  promotionsTable: {},
  winnersTable: {},
  hashChainsTable: {},
  gameSessionsTable: {},
  authUsersTable: {},
  authSessionsTable: {},
}));

beforeAll(() => {
  process.env.NODE_ENV = "test";
});
