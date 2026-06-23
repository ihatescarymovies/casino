import { vi, describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";

/* ── In-memory store for the mock DB ───────────────────────────────── */

let memoryStore: Array<{
  id: number;
  serverSeed: string;
  serverSeedHash: string;
  previousHash: string | null;
  isActive: boolean;
  createdAt?: Date;
  rotatedAt?: Date | null;
  rotationReason?: string | null;
}> = [];

let nextId = 1;

function resetStore() {
  memoryStore = [];
  nextId = 1;
}

const columnNameMap: Record<string, string> = {
  id: "id",
  server_seed: "serverSeed",
  server_seed_hash: "serverSeedHash",
  previous_hash: "previousHash",
  is_active: "isActive",
  created_at: "createdAt",
  rotated_at: "rotatedAt",
  rotation_reason: "rotationReason",
};

function evaluateCondition(
  condition: unknown,
  row: (typeof memoryStore)[0],
): boolean {
  if (!condition) return true;

  if (Array.isArray(condition)) {
    return condition.every((c) => evaluateCondition(c, row));
  }

  if (typeof condition !== "object" || condition === null) return true;

  const cond = condition as Record<string, unknown>;

  if (cond.operator === "and" && Array.isArray(cond.conditions)) {
    return cond.conditions.every((c: unknown) => evaluateCondition(c, row));
  }

  if (cond.operator === "=" && cond.left && typeof cond.left === "object") {
    const left = cond.left as { name?: string };
    if (left.name) {
      const propName = columnNameMap[left.name] ?? left.name;
      return (row as Record<string, unknown>)[propName] === cond.right;
    }
  }

  return true;
}

/* ── Mock drizzle-orm so eq() returns inspectable objects ──────────── */

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: any, value: any) => ({
    operator: "=" as const,
    left: column,
    right: value,
  })),
}));

/* ── Mock @workspace/db with an in-memory implementation ───────────── */

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition) => {
          const results = memoryStore.filter((row) =>
            evaluateCondition(condition, row),
          );
          return Promise.resolve(results);
        }),
        then: (onFulfilled: any, onRejected: any) =>
          Promise.resolve(memoryStore).then(onFulfilled, onRejected),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((data) => {
        const items = Array.isArray(data) ? data : [data];
        const rows = items.map((item) => {
          const row = { ...item, id: nextId++, createdAt: new Date() };
          memoryStore.push(row as (typeof memoryStore)[0]);
          return row;
        });

        return {
          returning: vi.fn(() => Promise.resolve(rows)),
          then: (onFulfilled: any, onRejected: any) =>
            Promise.resolve(undefined).then(onFulfilled, onRejected),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((updates) => ({
        where: vi.fn((condition) => {
          for (const row of memoryStore) {
            if (evaluateCondition(condition, row)) {
              Object.assign(row, updates);
            }
          }
          return Promise.resolve();
        }),
      })),
    })),
  },
  hashChainsTable: {
    id: { name: "id" },
    serverSeed: { name: "server_seed" },
    serverSeedHash: { name: "server_seed_hash" },
    previousHash: { name: "previous_hash" },
    isActive: { name: "is_active" },
    createdAt: { name: "created_at" },
    rotatedAt: { name: "rotated_at" },
    rotationReason: { name: "rotation_reason" },
  },
}));

/* ── Import the module under test ─────────────────────────────────── */

import {
  generateChain,
  getNextHash,
  verifyRound,
  getChainStatus,
  rotateChain,
  DEFAULT_CHAIN_SIZE,
  ROTATION_THRESHOLD,
} from "./hash-chain";

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("hash-chain", () => {
  beforeEach(() => {
    resetStore();
  });

  /* ── generateChain ───────────────────────────────────────────────── */

  describe("generateChain", () => {
    it("generates the requested number of hashes", async () => {
      const result = await generateChain("slots", 100);
      expect(result.total).toBe(100);
      expect(memoryStore.length).toBe(100);
    });

    it("produces seeds in the correct format", async () => {
      await generateChain("slots", 5);
      for (const row of memoryStore) {
        const parts = row.serverSeed.split(":");
        expect(parts.length).toBe(4);
        expect(parts[0]).toBe("slots");
        expect(parts[1]).toBeTruthy();
        expect(Number.isInteger(parseInt(parts[2], 10))).toBe(true);
        expect(parts[3]).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it("computes SHA-256 hashes correctly", async () => {
      await generateChain("slots", 10);
      for (const row of memoryStore) {
        const expected = createHash("sha256")
          .update(row.serverSeed)
          .digest("hex");
        expect(row.serverSeedHash).toBe(expected);
      }
    });

    it("links each hash to the previous one", async () => {
      await generateChain("slots", 10);
      for (let i = 1; i < memoryStore.length; i++) {
        expect(memoryStore[i].previousHash).toBe(
          memoryStore[i - 1].serverSeedHash,
        );
      }
      expect(memoryStore[0].previousHash).toBeNull();
    });

    it("uses node:crypto randomBytes, not Math.random", async () => {
      const mathRandomSpy = vi
        .spyOn(Math, "random")
        .mockImplementation(() => 0.5);
      await generateChain("slots", 10);
      expect(mathRandomSpy).not.toHaveBeenCalled();
      mathRandomSpy.mockRestore();
    });

    it("defaults to 1_000_000 hashes", () => {
      expect(DEFAULT_CHAIN_SIZE).toBe(1_000_000);
    });

    it("links new chain to previous hash when provided", async () => {
      await generateChain("slots", 5);
      const lastHash = memoryStore[memoryStore.length - 1].serverSeedHash;
      resetStore();

      await generateChain("slots", 5, lastHash);
      expect(memoryStore[0].previousHash).toBe(lastHash);
    });
  });

  /* ── getNextHash ─────────────────────────────────────────────────── */

  describe("getNextHash", () => {
    it("returns the highest-index hash first (reverse order)", async () => {
      await generateChain("slots", 10);
      const result = await getNextHash("slots");
      const info = parseSeedParts(result.serverSeed);
      expect(info.index).toBe(9);
      expect(result.nonce).toBe(9);
    });

    it("marks the returned hash as inactive", async () => {
      await generateChain("slots", 10);
      await getNextHash("slots");
      const activeCount = memoryStore.filter((r) => r.isActive).length;
      expect(activeCount).toBe(9);
    });

    it("returns correct serverSeedHash", async () => {
      await generateChain("slots", 10);
      const result = await getNextHash("slots");
      const expectedHash = createHash("sha256")
        .update(result.serverSeed)
        .digest("hex");
      expect(result.serverSeedHash).toBe(expectedHash);
    });

    it("serves hashes in descending index order", async () => {
      await generateChain("slots", 5);
      const results: number[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await getNextHash("slots");
        results.push(r.nonce);
      }
      expect(results).toEqual([4, 3, 2, 1]);
    });

    it("auto-rotates when all hashes are consumed", async () => {
      await generateChain("slots", 1);
      await getNextHash("slots");
      const result = await getNextHash("slots");
      expect(result.nonce).toBe(DEFAULT_CHAIN_SIZE - 1);
    }, 30000);

    it("auto-generates chain on first use", async () => {
      const result = await getNextHash("blackjack");
      expect(memoryStore.length).toBe(DEFAULT_CHAIN_SIZE);
      expect(result.nonce).toBe(DEFAULT_CHAIN_SIZE - 1);
    }, 30000);
  });

  /* ── verifyRound ─────────────────────────────────────────────────── */

  describe("verifyRound", () => {
    it("returns verified=true for a correct seed", async () => {
      await generateChain("slots", 10);
      const { serverSeed, serverSeedHash } = await getNextHash("slots");
      const result = await verifyRound(serverSeed);
      expect(result.verified).toBe(true);
      expect(result.computedHash).toBe(serverSeedHash);
      expect(result.expectedHash).toBe(serverSeedHash);
    });

    it("returns verified=false for a tampered seed", async () => {
      await generateChain("slots", 10);
      const { serverSeed } = await getNextHash("slots");
      const tampered = serverSeed + "x";
      const result = await verifyRound(tampered);
      expect(result.verified).toBe(false);
      expect(result.expectedHash).toBe("");
    });

    it("returns verified=false when seed is not found", async () => {
      const result = await verifyRound("nonexistent:seed");
      expect(result.verified).toBe(false);
      expect(result.expectedHash).toBe("");
    });
  });

  /* ── getChainStatus ──────────────────────────────────────────────── */

  describe("getChainStatus", () => {
    it("returns correct total and remaining counts", async () => {
      await generateChain("slots", 100);
      const status = await getChainStatus("slots");
      expect(status.total).toBe(100);
      expect(status.remaining).toBe(100);
      expect(status.percentage).toBe(1);
    });

    it("reflects consumed hashes", async () => {
      await generateChain("slots", 100);
      await getNextHash("slots");
      const status = await getChainStatus("slots");
      expect(status.remaining).toBe(99);
      expect(status.percentage).toBe(0.99);
    });

    it("throws when no chain exists for game type", async () => {
      await expect(getChainStatus("poker")).rejects.toThrow(
        "No chain found for game type",
      );
    });
  });

  /* ── rotateChain ─────────────────────────────────────────────────── */

  describe("rotateChain", () => {
    it("throws when chain does not need rotation", async () => {
      await generateChain("slots", 100);
      await expect(rotateChain("slots")).rejects.toThrow(
        "Chain does not need rotation",
      );
    });

    it("rotates when remaining is below threshold", async () => {
      await generateChain("slots", 11);
      deactivateHashes("slots", 10);

      const statusBefore = await getChainStatus("slots");
      expect(statusBefore.remaining).toBe(1);
      expect(statusBefore.percentage).toBeLessThan(ROTATION_THRESHOLD);

      const newChain = await rotateChain("slots");
      expect(newChain.total).toBe(DEFAULT_CHAIN_SIZE);

      const statusAfter = await getChainStatus("slots");
      expect(statusAfter.remaining).toBe(DEFAULT_CHAIN_SIZE);
      expect(statusAfter.chainId).not.toBe(statusBefore.chainId);
    }, 30000);

    it("deactivates the old chain on rotation", async () => {
      await generateChain("slots", 11);
      deactivateHashes("slots", 10);

      await rotateChain("slots");
      const oldRows = memoryStore.filter(
        (r) => r.serverSeed.startsWith("slots:") && r.isActive,
      );
      // Only the new chain should be active
      expect(oldRows.length).toBe(DEFAULT_CHAIN_SIZE);
    }, 30000);

    it("links new chain to previous chain's last hash", async () => {
      await generateChain("slots", 11);
      deactivateHashes("slots", 10);

      const oldHash0 = memoryStore[0];
      expect(oldHash0).toBeDefined();

      await rotateChain("slots");

      const newFirstHash = memoryStore[memoryStore.length - DEFAULT_CHAIN_SIZE];
      expect(newFirstHash).toBeDefined();
      expect(newFirstHash.previousHash).toBe(oldHash0.serverSeedHash);
    }, 30000);
  });

  /* ── auto-rotation via getNextHash ───────────────────────────────── */

  describe("auto-rotation", () => {
    it("triggers rotation when remaining drops below threshold", async () => {
      await generateChain("slots", 11);
      for (let i = 0; i < 9; i++) {
        await getNextHash("slots");
      }

      const statusBefore = await getChainStatus("slots");
      expect(statusBefore.remaining).toBe(2);
      expect(statusBefore.percentage).toBeGreaterThanOrEqual(
        ROTATION_THRESHOLD,
      );

      // Pop one more → 1 remaining = ~9% < 10%, should trigger rotation
      await getNextHash("slots");

      const statusAfter = await getChainStatus("slots");
      expect(statusAfter.remaining).toBeGreaterThan(1);
      expect(statusAfter.chainId).not.toBe(statusBefore.chainId);
    }, 30000);
  });
});

/* ── Helper ───────────────────────────────────────────────────────── */

function deactivateHashes(gameType: string, count: number) {
  const rows = memoryStore.filter((r) => {
    try {
      const info = parseSeedParts(r.serverSeed);
      return info.gameType === gameType && r.isActive;
    } catch {
      return false;
    }
  });

  rows.sort((a, b) => {
    const idxA = parseSeedParts(a.serverSeed).index;
    const idxB = parseSeedParts(b.serverSeed).index;
    return idxB - idxA;
  });

  for (let i = 0; i < Math.min(count, rows.length); i++) {
    rows[i].isActive = false;
  }
}

function parseSeedParts(serverSeed: string): {
  gameType: string;
  chainId: string;
  index: number;
} {
  const parts = serverSeed.split(":");
  return {
    gameType: parts[0],
    chainId: parts[1],
    index: parseInt(parts[2], 10),
  };
}
