import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import express, { type Express } from "express";
import http from "node:http";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface TestResponse {
  status: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/* ── Request helper (supertest-style, no deps) ──────────────────────── */

export function request(app: Express) {
  return {
    get(path: string): Promise<TestResponse> {
      return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
          const addr = server.address();
          if (!addr || typeof addr === "string") {
            server.close();
            reject(new Error("Failed to get server address"));
            return;
          }
          const port = addr.port;
          const req = http.request(
            `http://127.0.0.1:${port}${path}`,
            { method: "GET" },
            (res) => {
              let data = "";
              res.on("data", (chunk: string) => {
                data += chunk;
              });
              res.on("end", () => {
                server.close();
                let body: unknown;
                try {
                  body = JSON.parse(data);
                } catch {
                  body = data;
                }
                resolve({
                  status: res.statusCode ?? 0,
                  body,
                  headers: res.headers,
                });
              });
            },
          );
          req.on("error", (err) => {
            server.close();
            reject(err);
          });
          req.end();
        });
      });
    },
    post(path: string, body?: unknown): Promise<TestResponse> {
      return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
          const addr = server.address();
          if (!addr || typeof addr === "string") {
            server.close();
            reject(new Error("Failed to get server address"));
            return;
          }
          const port = addr.port;
          const json = body != null ? JSON.stringify(body) : undefined;
          const req = http.request(
            `http://127.0.0.1:${port}${path}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(json != null
                  ? { "Content-Length": Buffer.byteLength(json).toString() }
                  : {}),
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk: string) => {
                data += chunk;
              });
              res.on("end", () => {
                server.close();
                let parsed: unknown;
                try {
                  parsed = JSON.parse(data);
                } catch {
                  parsed = data;
                }
                resolve({
                  status: res.statusCode ?? 0,
                  body: parsed,
                  headers: res.headers,
                });
              });
            },
          );
          req.on("error", (err) => {
            server.close();
            reject(err);
          });
          if (json != null) req.write(json);
          req.end();
        });
      });
    },
  };
}

/* ── Mocked DB state for E2E tests ──────────────────────────────────── */

export interface MockUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
}

export interface MockWallet {
  id: number;
  userId: string;
  balance: number;
  currency: string;
}

export interface MockDemoWallet {
  id: number;
  userId: string;
  balance: number;
  resetCount: number;
}

export interface MockTransaction {
  id: number;
  walletId: number;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: string;
  referenceId: string | null;
  description: string | null;
  gameType?: string | null;
  roundId?: string | null;
  createdAt: Date;
}

export interface MockGameRound {
  id: number;
  userId: string;
  gameType: string;
  betAmount: number;
  payout: number;
  result: string | null;
  serverSeedHash: string | null;
  clientSeed: string | null;
  nonce: number | null;
  details: Record<string, unknown> | null;
  verified: boolean;
  isDemo: boolean;
  status: string;
  createdAt: Date;
  chainId: number | null;
}

export interface MockHashChain {
  id: number;
  serverSeed: string;
  serverSeedHash: string;
  previousHash: string | null;
  isActive: boolean;
}

export interface MockDbState {
  users: MockUser[];
  wallets: MockWallet[];
  demoWallets: MockDemoWallet[];
  transactions: MockTransaction[];
  demoTransactions: MockTransaction[];
  gameRounds: MockGameRound[];
  hashChains: MockHashChain[];
}

let dbState: MockDbState = {
  users: [],
  wallets: [],
  demoWallets: [],
  transactions: [],
  demoTransactions: [],
  gameRounds: [],
  hashChains: [],
};

let idCounters = {
  user: 1,
  wallet: 1,
  demoWallet: 1,
  transaction: 1,
  demoTransaction: 1,
  gameRound: 1,
  hashChain: 1,
};

export function resetDbState() {
  dbState = {
    users: [],
    wallets: [],
    demoWallets: [],
    transactions: [],
    demoTransactions: [],
    gameRounds: [],
    hashChains: [],
  };
  idCounters = {
    user: 1,
    wallet: 1,
    demoWallet: 1,
    transaction: 1,
    demoTransaction: 1,
    gameRound: 1,
    hashChain: 1,
  };
  // Clear stale query results so updates apply to freshly-inserted items
  // (lastQueryResults holds array refs from before resetDbState replaced them)
  for (const key in lastQueryResults) delete lastQueryResults[key];
}

export function getDbState(): MockDbState {
  return dbState;
}

export function getIdCounters() {
  return idCounters;
}

/* ── Seed helpers ───────────────────────────────────────────────────── */

export function seedUser(user: Partial<MockUser> = {}): MockUser {
  const newUser: MockUser = {
    id: user.id ?? `user-${idCounters.user++}`,
    email: user.email ?? `test${idCounters.user}@example.com`,
    firstName: user.firstName ?? "Test",
    lastName: user.lastName ?? "User",
    profileImageUrl: user.profileImageUrl ?? null,
  };
  dbState.users.push(newUser);
  return newUser;
}

export function seedWallet(userId: string, balance: number): MockWallet {
  const wallet: MockWallet = {
    id: idCounters.wallet++,
    userId,
    balance,
    currency: "USD",
  };
  dbState.wallets.push(wallet);
  return wallet;
}

export function seedDemoWallet(
  userId: string,
  balance: number,
): MockDemoWallet {
  const wallet: MockDemoWallet = {
    id: idCounters.demoWallet++,
    userId,
    balance,
    resetCount: 0,
  };
  dbState.demoWallets.push(wallet);
  return wallet;
}

export function seedHashChain(gameType: string, count = 10): MockHashChain[] {
  const chains: MockHashChain[] = [];
  for (let i = 0; i < count; i++) {
    const seed = `${gameType}:chain1:${i}:random${i}`;
    const hash = require("node:crypto")
      .createHash("sha256")
      .update(seed)
      .digest("hex");
    chains.push({
      id: idCounters.hashChain++,
      serverSeed: seed,
      serverSeedHash: hash,
      previousHash: i > 0 ? chains[i - 1].serverSeedHash : null,
      isActive: true,
    });
  }
  dbState.hashChains.push(...chains);
  return chains;
}

/* ── Mock @workspace/db ─────────────────────────────────────────────── */

// Track last queried items per table so update() can narrow its scope.
const lastQueryResults: Record<string, any[]> = {};

export function setupMockDb() {
  vi.mock("@workspace/db", () => ({
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = table?.name ?? "";
          const resolveTable = (data: any[]) => {
            lastQueryResults[tableName] = data;
            return {
              where: vi.fn(() => ({
                for: vi.fn(() => Promise.resolve(data)),
                then: (resolve: any, reject: any) =>
                  Promise.resolve(data).then(resolve, reject),
              })),
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                  offset: vi.fn(() => Promise.resolve(data)),
                })),
              })),
              for: vi.fn(() => Promise.resolve(data)),
              then: (resolve: any, reject: any) =>
                Promise.resolve(data).then(resolve, reject),
            };
          };
          if (tableName.includes("demo_wallets")) {
            return resolveTable(dbState.demoWallets);
          }
          if (tableName.includes("demo_transactions")) {
            return resolveTable(dbState.demoTransactions);
          }
          if (tableName.includes("wallets")) {
            return resolveTable(dbState.wallets);
          }
          if (tableName.includes("transactions")) {
            return resolveTable(dbState.transactions);
          }
          if (tableName.includes("users")) {
            return resolveTable(dbState.users);
          }
          if (tableName.includes("game_rounds")) {
            return resolveTable(dbState.gameRounds);
          }
          if (tableName.includes("hash_chains")) {
            return resolveTable(dbState.hashChains);
          }
          return resolveTable([]);
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((vals: any) => {
          const values = Array.isArray(vals) ? vals : [vals];
          const inserted: any[] = [];
          for (const v of values) {
            // Determine table from context or infer
            if (v.userId && v.balance !== undefined && v.currency) {
              const item = { id: idCounters.wallet++, ...v };
              dbState.wallets.push(item);
              inserted.push(item);
            } else if (v.userId && v.resetCount !== undefined) {
              const item = { id: idCounters.demoWallet++, ...v };
              dbState.demoWallets.push(item);
              inserted.push(item);
            } else if (v.walletId && v.type) {
              const item = {
                id: idCounters.transaction++,
                ...v,
                createdAt: new Date(),
              };
              dbState.transactions.push(item);
              inserted.push(item);
            } else if (v.demoWalletId && v.type) {
              const item = {
                id: idCounters.demoTransaction++,
                ...v,
                createdAt: new Date(),
              };
              dbState.demoTransactions.push(item);
              inserted.push(item);
            } else if (v.gameType && v.betAmount !== undefined) {
              const item = {
                id: idCounters.gameRound++,
                ...v,
                createdAt: new Date(),
              };
              dbState.gameRounds.push(item);
              inserted.push(item);
            } else if (v.serverSeed && v.serverSeedHash) {
              const item = {
                id: idCounters.hashChain++,
                ...v,
                createdAt: new Date(),
              };
              dbState.hashChains.push(item);
              inserted.push(item);
            }
          }
          return { returning: vi.fn(() => Promise.resolve(inserted)) };
        }),
      })),
      update: vi.fn((table: any) => ({
        set: vi.fn((updates: any) => ({
          where: vi.fn((condition: any) => {
            const tableName = table?.name ?? "";
            const lastItems = lastQueryResults[tableName];
            const updatedItems: any[] = [];
            const updateItems = (items: any[]) => {
              if (lastItems && lastItems.length > 0) {
                const lastIds = new Set(lastItems.map((i: any) => i.id));
                for (const item of items) {
                  if (lastIds.has(item.id)) {
                    Object.assign(item, updates);
                    updatedItems.push(item);
                  }
                }
              } else {
                for (const item of items) {
                  Object.assign(item, updates);
                  updatedItems.push(item);
                }
              }
            };
            if (
              tableName.includes("wallets") &&
              updates.balance !== undefined
            ) {
              updateItems(dbState.wallets);
            }
            if (tableName.includes("game_rounds")) {
              updateItems(dbState.gameRounds);
            }
            if (
              tableName.includes("hash_chains") &&
              updates.isActive === false
            ) {
              // Only deactivate the first active chain to prevent
              // premature rotation which would generate 1M entries and timeout
              const target = dbState.hashChains.find((c) => c.isActive);
              if (target) target.isActive = false;
            }
            return { returning: vi.fn(() => Promise.resolve(updatedItems)) };
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
      transaction: vi.fn(async (fn: any) => {
        const txSelectFrom = (table: any) => {
          const tableName = table?.name ?? "";
          const lookupTable = () => {
            if (tableName.includes("demo_wallets")) return dbState.demoWallets;
            if (tableName.includes("demo_transactions"))
              return dbState.demoTransactions;
            if (tableName.includes("wallets")) return dbState.wallets;
            if (tableName.includes("transactions")) return dbState.transactions;
            if (tableName.includes("game_rounds")) return dbState.gameRounds;
            if (tableName.includes("hash_chains")) return dbState.hashChains;
            if (tableName.includes("users")) return dbState.users;
            return [] as any[];
          };
          return {
            where: vi.fn(() => ({
              for: vi.fn(() => Promise.resolve(lookupTable())),
            })),
          };
        };
        return fn({
          select: vi.fn(() => ({
            from: txSelectFrom,
          })),
          insert: vi.fn(() => ({
            values: vi.fn((vals: any) => {
              const values = Array.isArray(vals) ? vals : [vals];
              const inserted: any[] = [];
              for (const v of values) {
                if (v.userId && v.balance !== undefined && v.currency) {
                  const item = { id: idCounters.wallet++, ...v };
                  dbState.wallets.push(item);
                  inserted.push(item);
                } else if (v.userId && v.resetCount !== undefined) {
                  const item = { id: idCounters.demoWallet++, ...v };
                  dbState.demoWallets.push(item);
                  inserted.push(item);
                } else if (v.walletId && v.type) {
                  const item = {
                    id: idCounters.transaction++,
                    ...v,
                    createdAt: new Date(),
                  };
                  dbState.transactions.push(item);
                  inserted.push(item);
                } else if (v.demoWalletId && v.type) {
                  const item = {
                    id: idCounters.demoTransaction++,
                    ...v,
                    createdAt: new Date(),
                  };
                  dbState.demoTransactions.push(item);
                  inserted.push(item);
                } else if (v.gameType && v.betAmount !== undefined) {
                  const item = {
                    id: idCounters.gameRound++,
                    ...v,
                    createdAt: new Date(),
                  };
                  dbState.gameRounds.push(item);
                  inserted.push(item);
                } else if (v.serverSeed && v.serverSeedHash) {
                  const item = {
                    id: idCounters.hashChain++,
                    ...v,
                    createdAt: new Date(),
                  };
                  dbState.hashChains.push(item);
                  inserted.push(item);
                }
              }
              return { returning: vi.fn(() => Promise.resolve(inserted)) };
            }),
          })),
          update: vi.fn((table: any) => ({
            set: vi.fn((updates: any) => ({
              where: vi.fn((condition: any) => {
                const tableName = table?.name ?? "";
                const lastItems = lastQueryResults[tableName];
                const updateItems = (items: any[]) => {
                  if (lastItems && lastItems.length > 0) {
                    const lastIds = new Set(lastItems.map((i: any) => i.id));
                    for (const item of items) {
                      if (lastIds.has(item.id)) Object.assign(item, updates);
                    }
                  } else {
                    for (const item of items) Object.assign(item, updates);
                  }
                };
                if (
                  tableName.includes("wallets") &&
                  updates.balance !== undefined
                ) {
                  updateItems(dbState.wallets);
                }
                if (tableName.includes("game_rounds")) {
                  updateItems(dbState.gameRounds);
                }
                return Promise.resolve();
              }),
            })),
          })),
        });
      }),
    },
    usersTable: { name: "users" },
    walletsTable: { name: "wallets" },
    demoWalletsTable: { name: "demo_wallets" },
    transactionsTable: { name: "transactions" },
    demoTransactionsTable: { name: "demo_transactions" },
    gameRoundsTable: { name: "game_rounds" },
    hashChainsTable: { name: "hash_chains" },
    gamesTable: { name: "games" },
    promotionsTable: { name: "promotions" },
    winnersTable: { name: "winners" },
    sessionsTable: { name: "sessions" },
    authUsersTable: { name: "auth_users" },
    authSessionsTable: { name: "auth_sessions" },
    gameSessionsTable: { name: "game_sessions" },
  }));
}

/* ── App factory ────────────────────────────────────────────────────── */

export function createTestApp(userId?: string): Express {
  const app = express();
  app.use(express.json());

  // Auth middleware
  app.use((req: any, _res: any, next: any) => {
    if (userId) {
      req.user = {
        id: userId,
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        profileImageUrl: null,
      };
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    next();
  });

  return app;
}
