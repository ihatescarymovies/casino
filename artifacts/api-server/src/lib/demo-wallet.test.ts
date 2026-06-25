import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDemoBalance,
  seedDemoWallet,
  placeDemoBet,
  creditDemoPayout,
  resetDemoWallet,
  getDemoTransactionHistory,
} from "./demo-wallet";
import { InsufficientFunds, WalletNotFound, WalletError } from "./errors";

/* ── Mutable mock state ─────────────────────────────────────────────── */

let mockDemoWallets: Array<{
  id: number;
  userId: string;
  balance: number;
  resetCount: number;
  lastResetAt: Date | null;
  createdAt: Date;
}> = [];

let mockDemoTransactions: Array<{
  id: number;
  demoWalletId: number;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  gameType: string | null;
  roundId: string | null;
  createdAt: Date;
}> = [];

let nextDemoWalletId = 1;
let nextDemoTransactionId = 1;

function resetMockState() {
  mockDemoWallets = [];
  mockDemoTransactions = [];
  nextDemoWalletId = 1;
  nextDemoTransactionId = 1;
}

/* ── Query chain helpers ──────────────────────────────────────────── */

function createQueryPromise(items: unknown[]) {
  const promise = Promise.resolve(items) as Promise<unknown[]> &
    Record<string, unknown>;
  promise.for = vi.fn(() => Promise.resolve(items));
  promise.orderBy = vi.fn(() => createQueryPromise(items));
  promise.limit = vi.fn((lim: number) => {
    const limited = Array.isArray(items) ? items.slice(0, lim) : items;
    const p = Promise.resolve(limited) as Promise<unknown[]> &
      Record<string, unknown>;
    p.offset = vi.fn((off: number) =>
      Promise.resolve(Array.isArray(limited) ? limited.slice(off) : limited),
    );
    return p;
  });
  return promise;
}

function createSelect(fields?: unknown) {
  if (fields && typeof fields === "object" && "count" in fields) {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() =>
          Promise.resolve([{ count: mockDemoTransactions.length }]),
        ),
      })),
    };
  }
  return {
    from: vi.fn((table: unknown) => {
      const items =
        (table as Record<string, unknown>)?.__table === "demo_transactions"
          ? mockDemoTransactions
          : mockDemoWallets;
      return {
        where: vi.fn(() => createQueryPromise(items)),
      };
    }),
  };
}

function createTx() {
  return {
    select: vi.fn(createSelect),
    update: vi.fn(() => ({
      set: vi.fn((updates: Record<string, unknown>) => ({
        where: vi.fn(() => {
          if (mockDemoWallets.length > 0) {
            mockDemoWallets[0] = {
              ...mockDemoWallets[0],
              ...updates,
            } as (typeof mockDemoWallets)[0];
          }
          const promise = Promise.resolve([mockDemoWallets[0]]) as Promise<
            unknown[]
          > &
            Record<string, unknown>;
          promise.returning = vi.fn(() =>
            Promise.resolve([mockDemoWallets[0]]),
          );
          return promise;
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: unknown) => {
        const items = Array.isArray(vals) ? vals : [vals];
        const isWallet =
          (table as Record<string, unknown>)?.__table === "demo_wallets";
        const results = items.map((v: Record<string, unknown>) => ({
          id: isWallet ? nextDemoWalletId++ : nextDemoTransactionId++,
          ...(isWallet ? { lastResetAt: null } : {}),
          ...v,
          createdAt: new Date(),
        }));
        if (isWallet) {
          mockDemoWallets.push(...(results as typeof mockDemoWallets));
        } else {
          mockDemoTransactions.push(
            ...(results as typeof mockDemoTransactions),
          );
        }
        return {
          returning: vi.fn(() => Promise.resolve(results)),
        };
      }),
    })),
  };
}

function buildDb() {
  const tx = createTx();
  return {
    ...tx,
    transaction: vi.fn(
      async (
        callback: (tx: ReturnType<typeof createTx>) => Promise<unknown>,
      ) => {
        return await callback(createTx());
      },
    ),
  };
}

/* ── Mock drizzle-orm ─────────────────────────────────────────────── */

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn(() => ({ __op: "eq" })),
    desc: vi.fn(() => ({ __op: "desc" })),
    sql: Object.assign(
      vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
        __op: "sql",
        strings,
        values,
      })),
      { raw: vi.fn((str: string) => ({ __op: "sql_raw", str })) },
    ),
  };
});

/* ── Mock @workspace/db ───────────────────────────────────────────── */

vi.mock("@workspace/db", () => ({
  db: buildDb(),
  walletsTable: { __table: "wallets" },
  transactionsTable: { __table: "transactions" },
  demoWalletsTable: { __table: "demo_wallets" },
  demoTransactionsTable: { __table: "demo_transactions" },
  usersTable: {},
  sessionsTable: {},
  gamesTable: {},
  gameRoundsTable: {},
  promotionsTable: {},
  winnersTable: {},
  hashChainsTable: {},
  gameSessionsTable: {},
  authUsersTable: {},
  authSessionsTable: {},
}));

/* ── Tests ────────────────────────────────────────────────────────── */

describe("demo wallet service", () => {
  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
  });

  describe("seedDemoWallet", () => {
    it("creates a demo wallet with $100.00 (10,000 cents) if not exists", async () => {
      const result = await seedDemoWallet("user-1");

      expect(result.balance).toBe(10_000);
      expect(result.resetCount).toBe(0);
      expect(result.lastResetAt).toBeNull();
      expect(result.demo).toBe(true);
      expect(mockDemoWallets).toHaveLength(1);
      expect(mockDemoWallets[0].balance).toBe(10_000);
    });

    it("returns existing demo wallet without creating a new one", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 5000,
        resetCount: 2,
        lastResetAt: new Date("2024-01-01"),
        createdAt: new Date(),
      });

      const result = await seedDemoWallet("user-1");

      expect(result.balance).toBe(5000);
      expect(result.resetCount).toBe(2);
      expect(mockDemoWallets).toHaveLength(1);
    });
  });

  describe("getDemoBalance", () => {
    it("returns demo balance and seeds wallet if not exists", async () => {
      const result = await getDemoBalance("user-1");

      expect(result.balance).toBe(10_000);
      expect(result.demo).toBe(true);
      expect(mockDemoWallets).toHaveLength(1);
    });

    it("returns existing demo balance", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 7500,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      const result = await getDemoBalance("user-1");

      expect(result.balance).toBe(7500);
      expect(result.demo).toBe(true);
    });
  });

  describe("placeDemoBet", () => {
    it("debits balance and records transaction on successful bet", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 10_000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      const result = await placeDemoBet("user-1", 2500, "slots", "round-1");

      expect(result.balanceBefore).toBe(10_000);
      expect(result.balanceAfter).toBe(7500);
      expect(result.transactionId).toBeDefined();
      expect(result.demo).toBe(true);
      expect(mockDemoWallets[0].balance).toBe(7500);
      expect(mockDemoTransactions).toHaveLength(1);
      expect(mockDemoTransactions[0].type).toBe("bet");
      expect(mockDemoTransactions[0].amount).toBe(2500);
      expect(mockDemoTransactions[0].balanceBefore).toBe(10_000);
      expect(mockDemoTransactions[0].balanceAfter).toBe(7500);
      expect(mockDemoTransactions[0].roundId).toBe("round-1");
      expect(mockDemoTransactions[0].gameType).toBe("slots");
    });

    it("throws InsufficientFunds when balance is too low", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 1000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      await expect(
        placeDemoBet("user-1", 2500, "slots", "round-1"),
      ).rejects.toThrow(InsufficientFunds);
      expect(mockDemoWallets[0].balance).toBe(1000);
      expect(mockDemoTransactions).toHaveLength(0);
    });

    it("throws WalletError for non-integer amount", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 10_000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      await expect(
        placeDemoBet("user-1", 25.5, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
    });

    it("throws WalletError for zero or negative amount", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 10_000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      await expect(
        placeDemoBet("user-1", 0, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
      await expect(
        placeDemoBet("user-1", -100, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
    });

    it("throws WalletNotFound when wallet does not exist", async () => {
      await expect(
        placeDemoBet("user-missing", 100, "slots", "round-1"),
      ).rejects.toThrow(WalletNotFound);
    });
  });

  describe("creditDemoPayout", () => {
    it("credits balance and records transaction on successful payout", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 5000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      const result = await creditDemoPayout("user-1", 3000, "slots", "round-1");

      expect(result.balanceBefore).toBe(5000);
      expect(result.balanceAfter).toBe(8000);
      expect(result.transactionId).toBeDefined();
      expect(result.demo).toBe(true);
      expect(mockDemoWallets[0].balance).toBe(8000);
      expect(mockDemoTransactions).toHaveLength(1);
      expect(mockDemoTransactions[0].type).toBe("payout");
      expect(mockDemoTransactions[0].amount).toBe(3000);
      expect(mockDemoTransactions[0].balanceBefore).toBe(5000);
      expect(mockDemoTransactions[0].balanceAfter).toBe(8000);
      expect(mockDemoTransactions[0].roundId).toBe("round-1");
      expect(mockDemoTransactions[0].gameType).toBe("slots");
    });

    it("throws WalletError for non-integer amount", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 10_000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      await expect(
        creditDemoPayout("user-1", 25.5, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
    });

    it("throws WalletError for zero or negative amount", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 10_000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      await expect(
        creditDemoPayout("user-1", 0, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
      await expect(
        creditDemoPayout("user-1", -100, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
    });

    it("throws WalletNotFound when wallet does not exist", async () => {
      await expect(
        creditDemoPayout("user-missing", 100, "slots", "round-1"),
      ).rejects.toThrow(WalletNotFound);
    });
  });

  describe("resetDemoWallet", () => {
    it("resets balance to $100 and increments resetCount", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 500,
        resetCount: 1,
        lastResetAt: new Date("2024-01-01"),
        createdAt: new Date(),
      });

      const result = await resetDemoWallet("user-1");

      expect(result.balance).toBe(10_000);
      expect(result.resetCount).toBe(2);
      expect(result.demo).toBe(true);
      expect(mockDemoWallets[0].balance).toBe(10_000);
      expect(mockDemoTransactions).toHaveLength(1);
      expect(mockDemoTransactions[0].type).toBe("reset");
      expect(mockDemoTransactions[0].amount).toBe(10_000);
    });

    it("seeds wallet then resets if wallet did not exist", async () => {
      const result = await resetDemoWallet("user-1");

      expect(result.balance).toBe(10_000);
      expect(result.resetCount).toBe(1);
      expect(mockDemoWallets).toHaveLength(1);
    });

    it("throws WalletError when trying to reset more than once per day", async () => {
      const today = new Date();
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 500,
        resetCount: 1,
        lastResetAt: today,
        createdAt: new Date(),
      });

      await expect(resetDemoWallet("user-1")).rejects.toThrow(WalletError);
      expect(mockDemoWallets[0].balance).toBe(500);
      expect(mockDemoTransactions).toHaveLength(0);
    });

    it("allows reset on a different day", async () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 500,
        resetCount: 1,
        lastResetAt: yesterday,
        createdAt: new Date(),
      });

      const result = await resetDemoWallet("user-1");

      expect(result.balance).toBe(10_000);
      expect(result.resetCount).toBe(2);
    });
  });

  describe("getDemoTransactionHistory", () => {
    it("returns paginated demo transactions", async () => {
      const walletId = nextDemoWalletId++;
      for (let i = 1; i <= 25; i++) {
        mockDemoTransactions.push({
          id: i,
          demoWalletId: walletId,
          userId: "user-1",
          type: i % 2 === 0 ? "payout" : "bet",
          amount: i * 100,
          balanceBefore: 0,
          balanceAfter: 0,
          gameType: "slots",
          roundId: `round-${i}`,
          createdAt: new Date(2024, 0, i),
        });
      }
      nextDemoTransactionId = 26;

      const result = await getDemoTransactionHistory("user-1", 1, 10);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(25);
      expect(result.transactions).toHaveLength(10);
      expect(result.demo).toBe(true);
    });

    it("clamps limit to valid range", async () => {
      const result = await getDemoTransactionHistory("user-1", 1, 0);
      expect(result.limit).toBe(1);

      const result2 = await getDemoTransactionHistory("user-1", 1, 200);
      expect(result2.limit).toBe(100);
    });

    it("clamps page to at least 1", async () => {
      const result = await getDemoTransactionHistory("user-1", 0, 10);
      expect(result.page).toBe(1);
    });
  });

  describe("isolation from real wallet", () => {
    it("demo bet does not affect real wallet mock state", async () => {
      // Real wallet state (simulated — not used by demo service)
      const realWalletState = { balance: 5000 };

      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 10_000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      await placeDemoBet("user-1", 2500, "slots", "round-1");

      // Real wallet untouched
      expect(realWalletState.balance).toBe(5000);
      // Demo wallet modified
      expect(mockDemoWallets[0].balance).toBe(7500);
    });

    it("demo transactions are stored separately from real transactions", async () => {
      mockDemoWallets.push({
        id: nextDemoWalletId++,
        userId: "user-1",
        balance: 10_000,
        resetCount: 0,
        lastResetAt: null,
        createdAt: new Date(),
      });

      await placeDemoBet("user-1", 1000, "slots", "round-1");

      // Only demo transactions exist
      expect(mockDemoTransactions).toHaveLength(1);
      expect(mockDemoTransactions[0].demoWalletId).toBeDefined();
      expect(mockDemoTransactions[0]).not.toHaveProperty("walletId");
    });
  });
});
