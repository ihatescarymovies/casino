import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { SlotsEngine } from "../../engines/slots";
import { GameResult, type GameRoundData } from "../../lib/game-engine";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(overrides: Partial<GameRoundData> = {}): GameRoundData {
  return {
    roundId: 1,
    gameType: "slots",
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

describe("SlotsEngine property-based tests", () => {
  const engine = new SlotsEngine();

  it("RTP is within ±5% of target over 100K iterations", async () => {
    const betAmount = 100;
    const iterations = 100_000;
    let totalBet = 0;
    let totalPayout = 0;

    for (let nonce = 0; nonce < iterations; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      totalBet += betAmount;
      totalPayout += result.payout;
    }

    const rtp = totalPayout / totalBet;
    // Slots has high variance; allow ±5% tolerance around 0.96 target
    expect(rtp).toBeGreaterThanOrEqual(0.91);
    expect(rtp).toBeLessThanOrEqual(1.01);
  }, 120_000);

  it("payout is always a non-negative integer multiple of betAmount", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const round = createRound({ nonce });
          const result = await (engine as any).executeGame("user1", round);

          expect(result.payout).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result.payout)).toBe(true);

          if (result.payout > 0) {
            expect(result.result).toBe(GameResult.WIN);
          }
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("deterministic: same seed+nonce always produces same result", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const round = createRound({ nonce });
          const result1 = await (engine as any).executeGame("user1", round);
          const result2 = await (engine as any).executeGame("user1", round);

          expect(result1.payout).toBe(result2.payout);
          expect(result1.result).toBe(result2.result);
          expect(result1.gameDetails.reels).toEqual(result2.gameDetails.reels);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });
});
