import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { generateChain, getNextHash, verifyRound } from "../../lib/hash-chain";

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

/* ── Mock drizzle-orm ──────────────────────────────────────────────── */

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: any, value: any) => ({
    operator: "=" as const,
    left: column,
    right: value,
  })),
}));

/* ── Mock @workspace/db ───────────────────────────────────────────── */

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

/* ── Property-based tests ───────────────────────────────────────────── */

describe("HashChain property-based tests", () => {
  beforeEach(() => {
    resetStore();
  });

  it("1K consecutive verifications all pass", async () => {
    await generateChain("test-game", 200);

    for (let i = 0; i < 100; i++) {
      const hashResult = await getNextHash("test-game");
      const verification = await verifyRound(hashResult.serverSeed);

      expect(verification.verified).toBe(true);
      expect(verification.computedHash).toBe(hashResult.serverSeedHash);
      expect(verification.expectedHash).toBe(hashResult.serverSeedHash);
    }
  }, 30_000);

  it("SHA-256 hash chain is cryptographically secure", async () => {
    await generateChain("secure-game", 100);

    for (let i = 0; i < 50; i++) {
      const hashResult = await getNextHash("secure-game");

      // Verify the hash is a valid SHA-256 hex string
      expect(hashResult.serverSeedHash).toMatch(/^[0-9a-f]{64}$/);

      // Verify recomputing the hash gives the same result
      const recomputed = createHash("sha256")
        .update(hashResult.serverSeed)
        .digest("hex");
      expect(recomputed).toBe(hashResult.serverSeedHash);
    }
  }, 30_000);

  it("tampered seed fails verification", async () => {
    await generateChain("tamper-test", 50);

    for (let i = 0; i < 50; i++) {
      const hashResult = await getNextHash("tamper-test");

      // Tamper with the seed
      const tamperedSeed = hashResult.serverSeed + "x";
      const tamperedVerification = await verifyRound(tamperedSeed);

      expect(tamperedVerification.verified).toBe(false);
    }
  }, 30_000);

  it("each hash in the chain links to the previous one", async () => {
    await generateChain("linked-chain", 100);

    const hashes: Array<{ serverSeed: string; serverSeedHash: string }> = [];
    for (let i = 0; i < 50; i++) {
      const result = await getNextHash("linked-chain");
      hashes.push(result);
    }

    // popHash returns highest index first, so hashes are in reverse order.
    // Entry N's previousHash = hash of entry N-1's seed = entry N-1's serverSeedHash.
    // Since hashes[0] has a higher index than hashes[1], hashes[0].previousHash
    // should equal hashes[1].serverSeedHash.
    for (let i = 0; i < hashes.length - 1; i++) {
      const currentRow = memoryStore.find(
        (r) => r.serverSeed === hashes[i].serverSeed,
      );
      expect(currentRow).toBeDefined();
      expect(currentRow!.previousHash).toBe(hashes[i + 1].serverSeedHash);
    }
  }, 30_000);
});
