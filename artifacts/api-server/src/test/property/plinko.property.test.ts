import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  PlinkoEngine,
  generateBallPath,
  getMultiplier,
  MULTIPLIERS,
} from "../../engines/plinko";
import { GameResult, type GameRoundData } from "../../lib/game-engine";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(overrides: Partial<GameRoundData> = {}): GameRoundData {
  return {
    roundId: 1,
    gameType: "plinko",
    betAmount: 100,
    clientSeed: "test-seed",
    serverSeedHash: "test-hash",
    nonce: 0,
    state: "in_progress" as any,
    result: "pending" as any,
    payout: 0,
    ...overrides,
  };
}

/* ── Property-based tests ───────────────────────────────────────────── */

describe("PlinkoEngine property-based tests", () => {
  const engine = new PlinkoEngine();

  it("slot distribution matches binomial over 100K balls", async () => {
    const rows = 16;
    const iterations = Number(process.env.CI_PROPERTY_ITERATIONS ?? 100_000);
    const slotCounts = new Map<number, number>();

    for (let nonce = 0; nonce < iterations; nonce++) {
      const { landingSlot } = generateBallPath("seed", nonce, 0, rows);
      slotCounts.set(landingSlot, (slotCounts.get(landingSlot) ?? 0) + 1);
    }

    // For a fair binomial distribution with n=16, p=0.5:
    // - Center slots (8) should have highest frequency
    // - Edge slots (0, 16) should have lowest frequency
    const centerSlot = 8;
    const edgeSlots = [0, 16];

    const centerCount = slotCounts.get(centerSlot) ?? 0;
    for (const edge of edgeSlots) {
      const edgeCount = slotCounts.get(edge) ?? 0;
      expect(centerCount).toBeGreaterThan(edgeCount);
    }

    // All slots should have some hits (with 100K iterations)
    for (let slot = 0; slot <= rows; slot++) {
      expect(slotCounts.has(slot)).toBe(true);
      expect(slotCounts.get(slot)).toBeGreaterThan(0);
    }
  }, 120_000);

  it("landing slot is always between 0 and rows inclusive", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom(8, 12, 16),
        async (nonce, rows) => {
          const { landingSlot } = generateBallPath("seed", nonce, 0, rows);
          expect(landingSlot).toBeGreaterThanOrEqual(0);
          expect(landingSlot).toBeLessThanOrEqual(rows);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("deterministic: same seed+nonce+ballIndex always produces same path", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom(8, 12, 16),
        async (nonce, rows) => {
          const result1 = generateBallPath("seed", nonce, 0, rows);
          const result2 = generateBallPath("seed", nonce, 0, rows);

          expect(result1.path).toEqual(result2.path);
          expect(result1.landingSlot).toBe(result2.landingSlot);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("RTP converges to ~96% over many balls", async () => {
    const betAmount = 100;
    const iterations = Number(process.env.CI_PROPERTY_ITERATIONS ?? 100_000);
    let totalBet = 0;
    let totalPayout = 0;

    for (let nonce = 0; nonce < iterations; nonce++) {
      const round = createRound({
        nonce,
        betAmount,
        gameParams: { rows: 16, risk: "medium", balls: 1 },
      });
      const result = await (engine as any).executeGame("user1", round);
      totalBet += betAmount;
      totalPayout += result.payout;
    }

    const rtp = totalPayout / totalBet;
    expect(rtp).toBeGreaterThanOrEqual(0.955);
    expect(rtp).toBeLessThanOrEqual(0.965);
  }, 120_000);

  it("multiplier table is symmetric", async () => {
    for (const [rows, risks] of Object.entries(MULTIPLIERS)) {
      for (const [risk, multipliers] of Object.entries(risks)) {
        const len = multipliers.length;
        for (let i = 0; i < len / 2; i++) {
          expect(multipliers[i]).toBe(multipliers[len - 1 - i]);
        }
      }
    }
  });

  it("path length always equals row count", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom(8, 12, 16),
        async (nonce, rows) => {
          const { path } = generateBallPath("seed", nonce, 0, rows);
          expect(path).toHaveLength(rows);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });
});
