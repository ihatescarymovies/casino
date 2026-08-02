import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { RouletteEngine, type RouletteBet } from "../../engines/roulette";
import { GameResult, type GameRoundData } from "../../lib/game-engine";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(
  overrides: Partial<GameRoundData> = {},
  bets: RouletteBet[] = [],
): GameRoundData {
  return {
    roundId: 1,
    gameType: "roulette",
    betAmount: 100,
    clientSeed: "test-seed",
    serverSeedHash: "test-hash",
    nonce: 0,
    state: "in_progress" as any,
    result: "pending" as any,
    payout: 0,
    gameParams: { bets },
    ...overrides,
  };
}

/* ── Property-based tests ───────────────────────────────────────────── */

describe("RouletteEngine property-based tests", () => {
  const engine = new RouletteEngine();

  it("house edge is within ±0.5% of 2.7% (RTP ~97.3%) over 100K iterations", async () => {
    const betAmount = 10;
    const iterations = Number(process.env.CI_PROPERTY_ITERATIONS ?? 100_000);
    let totalBet = 0;
    let totalPayout = 0;

    for (let nonce = 0; nonce < iterations; nonce++) {
      const bets: RouletteBet[] = [
        { type: "red", numbers: [], amount: betAmount },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      totalBet += betAmount;
      totalPayout += result.payout;
    }

    const rtp = totalPayout / totalBet;
    // European roulette RTP = 36/37 ≈ 0.973, house edge = 1/37 ≈ 2.7%
    expect(rtp).toBeGreaterThanOrEqual(0.968);
    expect(rtp).toBeLessThanOrEqual(0.978);
  }, 120_000);

  it("winning number is always between 0 and 36 inclusive", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const bets: RouletteBet[] = [
            { type: "red", numbers: [], amount: 10 },
          ];
          const round = createRound({ nonce }, bets);
          const result = await (engine as any).executeGame("user1", round);

          expect(result.gameDetails.winningNumber).toBeGreaterThanOrEqual(0);
          expect(result.gameDetails.winningNumber).toBeLessThanOrEqual(36);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("deterministic: same seed+nonce always produces same winning number", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const bets: RouletteBet[] = [
            { type: "red", numbers: [], amount: 10 },
          ];
          const round = createRound({ nonce }, bets);
          const result1 = await (engine as any).executeGame("user1", round);
          const result2 = await (engine as any).executeGame("user1", round);

          expect(result1.gameDetails.winningNumber).toBe(
            result2.gameDetails.winningNumber,
          );
          expect(result1.payout).toBe(result2.payout);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("straight bet RTP converges to ~97.3% over many spins", async () => {
    const betAmount = 10;
    const iterations = Number(process.env.CI_PROPERTY_ITERATIONS ?? 50_000);
    let totalBet = 0;
    let totalPayout = 0;

    for (let nonce = 0; nonce < iterations; nonce++) {
      const bets: RouletteBet[] = [
        { type: "straight", numbers: [17], amount: betAmount },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      totalBet += betAmount;
      totalPayout += result.payout;
    }

    const rtp = totalPayout / totalBet;
    // Straight bet RTP = 35/37 ≈ 0.9459 (payout 35:1, win prob 1/37)
    expect(rtp).toBeGreaterThanOrEqual(0.93);
    expect(rtp).toBeLessThanOrEqual(0.96);
  }, 120_000);
});
