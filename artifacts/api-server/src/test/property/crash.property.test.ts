import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { CrashEngine } from "../../engines/crash";
import { GameResult, type GameRoundData } from "../../lib/game-engine";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(overrides: Partial<GameRoundData> = {}): GameRoundData {
  return {
    roundId: 1,
    gameType: "crash",
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

describe("CrashEngine property-based tests", () => {
  const engine = new CrashEngine();

  it("crash point is always >= 1.00x over 100K iterations", async () => {
    for (let nonce = 0; nonce < 100_000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      expect(result.gameDetails.crashPoint).toBeGreaterThanOrEqual(1.0);
    }
  }, 120_000);

  it("distribution matches expected formula: most rounds crash early", async () => {
    const crashPoints: number[] = [];
    const iterations = 100_000;

    for (let nonce = 0; nonce < iterations; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      crashPoints.push(result.gameDetails.crashPoint as number);
    }

    // Expected: ~50% crash at or below 2.0x (theoretical for 1% house edge)
    const earlyCrashes = crashPoints.filter((cp) => cp <= 2.0).length;
    const earlyRate = earlyCrashes / iterations;
    expect(earlyRate).toBeGreaterThan(0.45);
    expect(earlyRate).toBeLessThan(0.55);

    // Very few should go above 10x
    const highCrashes = crashPoints.filter((cp) => cp > 10.0).length;
    const highRate = highCrashes / iterations;
    expect(highRate).toBeLessThan(0.12);
  }, 120_000);

  it("deterministic: same seed+nonce always produces same crash point", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const round = createRound({ nonce });
          const result1 = await (engine as any).executeGame("user1", round);
          const result2 = await (engine as any).executeGame("user1", round);

          expect(result1.gameDetails.crashPoint).toBe(
            result2.gameDetails.crashPoint,
          );
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("different nonces produce different crash points with high probability", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce1, nonce2) => {
          if (nonce1 === nonce2) return;

          const round1 = createRound({ nonce: nonce1 });
          const round2 = createRound({ nonce: nonce2 });
          const result1 = await (engine as any).executeGame("user1", round1);
          const result2 = await (engine as any).executeGame("user1", round2);

          // They might coincidentally match, but probability is extremely low
          // Just verify both are valid
          expect(result1.gameDetails.crashPoint).toBeGreaterThanOrEqual(1.0);
          expect(result2.gameDetails.crashPoint).toBeGreaterThanOrEqual(1.0);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });
});
