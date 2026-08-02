import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { DiceEngine } from "../../engines/dice";
import { GameResult, type GameRoundData } from "../../lib/game-engine";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(overrides: Partial<GameRoundData> = {}): GameRoundData {
  return {
    roundId: 1,
    gameType: "dice",
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

describe("DiceEngine property-based tests", () => {
  const engine = new DiceEngine();

  it("payout distribution matches probability for over/under bets over 100K iterations", async () => {
    const betAmount = 100;
    const iterations = Number(process.env.CI_PROPERTY_ITERATIONS ?? 100_000);
    let totalBet = 0;
    let totalPayout = 0;

    for (let nonce = 0; nonce < iterations; nonce++) {
      const round = createRound({
        nonce,
        gameParams: { betType: "over", target: 7 },
      });
      const result = await (engine as any).executeGame("user1", round);
      totalBet += betAmount;
      totalPayout += result.payout;
    }

    const rtp = totalPayout / totalBet;
    // Over 7: 15/36 win probability, payout = 36/15 * 0.97
    // Expected RTP = 0.97
    expect(rtp).toBeGreaterThanOrEqual(0.965);
    expect(rtp).toBeLessThanOrEqual(0.975);
  }, 120_000);

  it("dice sum is always between 2 and 12", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const round = createRound({
            nonce,
            gameParams: { betType: "over", target: 7 },
          });
          const result = await (engine as any).executeGame("user1", round);

          expect(result.gameDetails.sum).toBeGreaterThanOrEqual(2);
          expect(result.gameDetails.sum).toBeLessThanOrEqual(12);
          expect(result.gameDetails.dice).toHaveLength(2);
          expect(result.gameDetails.dice[0]).toBeGreaterThanOrEqual(1);
          expect(result.gameDetails.dice[0]).toBeLessThanOrEqual(6);
          expect(result.gameDetails.dice[1]).toBeGreaterThanOrEqual(1);
          expect(result.gameDetails.dice[1]).toBeLessThanOrEqual(6);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("deterministic: same seed+nonce always produces same dice roll", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const round = createRound({
            nonce,
            gameParams: { betType: "over", target: 7 },
          });
          const result1 = await (engine as any).executeGame("user1", round);
          const result2 = await (engine as any).executeGame("user1", round);

          expect(result1.gameDetails.dice).toEqual(result2.gameDetails.dice);
          expect(result1.gameDetails.sum).toBe(result2.gameDetails.sum);
          expect(result1.payout).toBe(result2.payout);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("exact bet payout matches expected multiplier", async () => {
    const expectedMultipliers: Record<number, number> = {
      2: 30,
      3: 15,
      4: 10,
      5: 6,
      6: 5,
      7: 4,
      8: 5,
      9: 6,
      10: 10,
      11: 15,
      12: 30,
    };

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 2, max: 12 }),
        async (nonce, target) => {
          const round = createRound({
            nonce,
            gameParams: { betType: "exact", target },
          });
          const result = await (engine as any).executeGame("user1", round);

          expect(result.gameDetails.multiplier).toBe(
            expectedMultipliers[target],
          );

          if (result.gameDetails.sum === target) {
            expect(result.result).toBe(GameResult.WIN);
            expect(result.payout).toBe(100 * expectedMultipliers[target]);
          }
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("doubles bet has 5:1 multiplier", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const round = createRound({
            nonce,
            gameParams: { betType: "doubles" },
          });
          const result = await (engine as any).executeGame("user1", round);

          expect(result.gameDetails.multiplier).toBe(5);

          if (result.gameDetails.dice[0] === result.gameDetails.dice[1]) {
            expect(result.result).toBe(GameResult.WIN);
            expect(result.payout).toBe(100 * 5);
          }
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });
});
