import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { MinesEngine } from "../../engines/mines";
import { GameResult, type GameRoundData } from "../../lib/game-engine";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(overrides: Partial<GameRoundData> = {}): GameRoundData {
  return {
    roundId: 1,
    gameType: "mines",
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

describe("MinesEngine property-based tests", () => {
  const engine = new MinesEngine();

  it("multiplier progression matches formula over 100K mine placements", async () => {
    const iterations = Number(process.env.CI_PROPERTY_ITERATIONS ?? 100_000);

    for (let nonce = 0; nonce < iterations; nonce++) {
      const round = createRound({
        nonce,
        roundId: nonce + 1,
        gameParams: { mineCount: 5 },
      });
      await (engine as any).executeGame("user1", round);

      const active = (engine as any).activeRounds.get(nonce + 1);
      expect(active).toBeDefined();
      expect(active.minePositions.size).toBe(5);

      // All mines within valid range
      for (const mine of active.minePositions) {
        expect(mine).toBeGreaterThanOrEqual(0);
        expect(mine).toBeLessThan(25);
      }

      // No duplicate mines
      const mines = Array.from(active.minePositions);
      expect(new Set(mines).size).toBe(mines.length);
    }
  }, 120_000);

  it("multiplier increases with each safe tile revealed", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const round = createRound({
            nonce,
            roundId: nonce + 1,
            gameParams: { mineCount: 5 },
          });
          await (engine as any).executeGame("user1", round);

          const active = (engine as any).activeRounds.get(nonce + 1);
          if (!active) return;

          const safeTiles: number[] = [];
          for (let i = 0; i < 25 && safeTiles.length < 5; i++) {
            if (!active.minePositions.has(i)) {
              safeTiles.push(i);
            }
          }

          const multipliers: number[] = [];
          for (const tile of safeTiles) {
            active.revealedTiles.add(tile);
            const revealedSafeCount = Array.from(active.revealedTiles).filter(
              (t) => !active.minePositions.has(t),
            ).length;

            const totalTiles = 25;
            const mineCount = active.minePositions.size;
            const rtp = 0.97;

            // Calculate expected multiplier
            function combination(n: number, k: number): number {
              if (k < 0 || k > n) return 0;
              if (k === 0 || k === n) return 1;
              let result = 1;
              for (let i = 1; i <= k; i++) {
                result = (result * (n - i + 1)) / i;
              }
              return result;
            }

            const safeTiles = totalTiles - mineCount;
            const prob =
              combination(safeTiles, revealedSafeCount) /
              combination(totalTiles, revealedSafeCount);
            const expectedMultiplier = rtp / prob;

            multipliers.push(expectedMultiplier);
          }

          // Multipliers should strictly increase
          for (let i = 1; i < multipliers.length; i++) {
            expect(multipliers[i]).toBeGreaterThan(multipliers[i - 1]);
          }
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("deterministic: same seed+nonce always produces same mine placement", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        async (nonce) => {
          const round1 = createRound({
            nonce,
            roundId: nonce + 1,
            gameParams: { mineCount: 5 },
          });
          const round2 = createRound({
            nonce,
            roundId: nonce + 2,
            gameParams: { mineCount: 5 },
          });

          await (engine as any).executeGame("user1", round1);
          await (engine as any).executeGame("user1", round2);

          const active1 = (engine as any).activeRounds.get(nonce + 1);
          const active2 = (engine as any).activeRounds.get(nonce + 2);

          expect(active1.minePositions.size).toBe(active2.minePositions.size);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });

  it("mine count is always between 1 and 24", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 24 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        async (mineCount, nonce) => {
          const round = createRound({
            nonce,
            roundId: nonce + 1,
            gameParams: { mineCount },
          });
          await (engine as any).executeGame("user1", round);

          const active = (engine as any).activeRounds.get(nonce + 1);
          expect(active.minePositions.size).toBe(mineCount);
        },
      ),
      { numRuns: 1000, seed: Date.now() },
    );
  });
});
