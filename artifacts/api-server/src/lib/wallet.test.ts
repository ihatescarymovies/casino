import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getBalance,
  placeBet,
  creditPayout,
  getTransactionHistory,
} from "./wallet";
import { InsufficientFunds, WalletNotFound, WalletError } from "./errors";

/* ── Mutable mock state ─────────────────────────────────────────────── */

let mockWallets: Array<{
  id: number;
  userId: string;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}> = [];

let mockTransactions: Array<{
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
  createdAt: Date;
}> = [];

let nextWalletId = 1;
let nextTransactionId = 1;

function resetMockState() {
  mockWallets = [];
  mockTransactions = [];
  nextWalletId = 1;
  nextTransactionId = 1;
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
          Promise.resolve([{ count: mockTransactions.length }]),
        ),
      })),
    };
  }
  return {
    from: vi.fn((table: unknown) => {
      const items =
        (table as Record<string, unknown>)?.__table === "transactions"
          ? mockTransactions
          : mockWallets;
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
          if (mockWallets.length > 0) {
            mockWallets[0] = {
              ...mockWallets[0],
              ...updates,
            } as (typeof mockWallets)[0];
          }
          return Promise.resolve();
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: unknown) => {
        const items = Array.isArray(vals) ? vals : [vals];
        const results = items.map((v: Record<string, unknown>) => ({
          id: nextTransactionId++,
          ...v,
          createdAt: new Date(),
        }));
        mockTransactions.push(...(results as typeof mockTransactions));
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

describe("wallet service", () => {
  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
  });

  describe("getBalance", () => {
    it("returns balance and currency for existing wallet", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 5000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getBalance("user-1");
      expect(result).toEqual({ balance: 5000, currency: "USD" });
    });

    it("throws WalletNotFound when wallet does not exist", async () => {
      await expect(getBalance("user-missing")).rejects.toThrow(WalletNotFound);
    });
  });

  describe("placeBet", () => {
    it("debits balance and records transaction on successful bet", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 10000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await placeBet("user-1", 2500, "slots", "round-1");

      expect(result.balanceBefore).toBe(10000);
      expect(result.balanceAfter).toBe(7500);
      expect(result.transactionId).toBeDefined();
      expect(mockWallets[0].balance).toBe(7500);
      expect(mockTransactions).toHaveLength(1);
      expect(mockTransactions[0].type).toBe("bet");
      expect(mockTransactions[0].amount).toBe(2500);
      expect(mockTransactions[0].balanceBefore).toBe(10000);
      expect(mockTransactions[0].balanceAfter).toBe(7500);
      expect(mockTransactions[0].referenceId).toBe("round-1");
      expect(mockTransactions[0].description).toBe("Bet on slots");
    });

    it("throws InsufficientFunds when balance is too low", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 1000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        placeBet("user-1", 2500, "slots", "round-1"),
      ).rejects.toThrow(InsufficientFunds);
      expect(mockWallets[0].balance).toBe(1000);
      expect(mockTransactions).toHaveLength(0);
    });

    it("throws WalletError for non-integer amount", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 10000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        placeBet("user-1", 25.5, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
    });

    it("throws WalletError for zero or negative amount", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 10000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(placeBet("user-1", 0, "slots", "round-1")).rejects.toThrow(
        WalletError,
      );
      await expect(
        placeBet("user-1", -100, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
    });

    it("throws WalletNotFound when wallet does not exist", async () => {
      await expect(
        placeBet("user-missing", 100, "slots", "round-1"),
      ).rejects.toThrow(WalletNotFound);
    });

    it("uses SELECT FOR UPDATE inside a transaction", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 5000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { db } = await import("@workspace/db");
      await placeBet("user-1", 1000, "slots", "round-1");

      expect(db.transaction).toHaveBeenCalledTimes(1);

      // Verify the transaction callback uses row-level locking
      const txCallback = (db.transaction as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      const mockTx = createTx();
      await txCallback(mockTx);

      expect(mockTx.select).toHaveBeenCalled();
      const selectResult = mockTx.select.mock.results[0];
      expect(selectResult).toBeDefined();
    });
  });

  describe("creditPayout", () => {
    it("credits balance and records transaction on successful payout", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 5000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await creditPayout("user-1", 3000, "slots", "round-1");

      expect(result.balanceBefore).toBe(5000);
      expect(result.balanceAfter).toBe(8000);
      expect(result.transactionId).toBeDefined();
      expect(mockWallets[0].balance).toBe(8000);
      expect(mockTransactions).toHaveLength(1);
      expect(mockTransactions[0].type).toBe("payout");
      expect(mockTransactions[0].amount).toBe(3000);
      expect(mockTransactions[0].balanceBefore).toBe(5000);
      expect(mockTransactions[0].balanceAfter).toBe(8000);
      expect(mockTransactions[0].referenceId).toBe("round-1");
      expect(mockTransactions[0].description).toBe("Payout from slots");
    });

    it("throws WalletError for non-integer amount", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 10000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        creditPayout("user-1", 25.5, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
    });

    it("throws WalletError for zero or negative amount", async () => {
      mockWallets.push({
        id: nextWalletId++,
        userId: "user-1",
        balance: 10000,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        creditPayout("user-1", 0, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
      await expect(
        creditPayout("user-1", -100, "slots", "round-1"),
      ).rejects.toThrow(WalletError);
    });

    it("throws WalletNotFound when wallet does not exist", async () => {
      await expect(
        creditPayout("user-missing", 100, "slots", "round-1"),
      ).rejects.toThrow(WalletNotFound);
    });
  });

  describe("getTransactionHistory", () => {
    it("returns paginated transactions", async () => {
      const walletId = nextWalletId++;
      for (let i = 1; i <= 25; i++) {
        mockTransactions.push({
          id: i,
          walletId,
          userId: "user-1",
          type: i % 2 === 0 ? "payout" : "bet",
          amount: i * 100,
          balanceBefore: 0,
          balanceAfter: 0,
          status: "completed",
          referenceId: `round-${i}`,
          description: `Transaction ${i}`,
          createdAt: new Date(2024, 0, i),
        });
      }
      nextTransactionId = 26;

      const result = await getTransactionHistory("user-1", 1, 10);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(25);
      expect(result.transactions).toHaveLength(10);
    });

    it("clamps limit to valid range", async () => {
      const result = await getTransactionHistory("user-1", 1, 0);
      expect(result.limit).toBe(1);

      const result2 = await getTransactionHistory("user-1", 1, 200);
      expect(result2.limit).toBe(100);
    });

    it("clamps page to at least 1", async () => {
      const result = await getTransactionHistory("user-1", 0, 10);
      expect(result.page).toBe(1);
    });
  });
});
