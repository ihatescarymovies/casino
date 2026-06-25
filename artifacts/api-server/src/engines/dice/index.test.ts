import { describe, it, expect } from "vitest";
import { DiceEngine } from "./index";
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

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("DiceEngine", () => {
  const engine = new DiceEngine();

  it("has correct gameType and config", () => {
    expect(engine.gameType).toBe("dice");
    expect(engine.config.minBet).toBe(1);
    expect(engine.config.maxBet).toBe(100000);
    expect(engine.config.rtp).toBe(0.97);
    expect(engine.config.rules).toMatchObject({
      dice: 2,
      sides: 6,
    });
  });

  it("produces deterministic dice rolls for same seed+nonce", async () => {
    const round = createRound({
      gameParams: { betType: "over", target: 7 },
    });
    const result1 = await (engine as any).executeGame("user1", round);
    const result2 = await (engine as any).executeGame("user1", round);

    expect(result1.gameDetails.dice).toEqual(result2.gameDetails.dice);
    expect(result1.gameDetails.sum).toBe(result2.gameDetails.sum);
    expect(result1.result).toBe(result2.result);
    expect(result1.payout).toBe(result2.payout);
  });

  it("produces different rolls for different nonces", async () => {
    const round1 = createRound({
      nonce: 0,
      gameParams: { betType: "over", target: 7 },
    });
    const round2 = createRound({
      nonce: 1,
      gameParams: { betType: "over", target: 7 },
    });

    const result1 = await (engine as any).executeGame("user1", round1);
    const result2 = await (engine as any).executeGame("user1", round2);

    expect(result1.gameDetails.dice).not.toEqual(result2.gameDetails.dice);
  });

  it("returns correct gameDetails shape", async () => {
    const round = createRound({
      gameParams: { betType: "over", target: 7 },
    });
    const result = await (engine as any).executeGame("user1", round);

    expect(result.gameDetails).toHaveProperty("dice");
    expect(result.gameDetails).toHaveProperty("sum");
    expect(result.gameDetails).toHaveProperty("betType");
    expect(result.gameDetails).toHaveProperty("target");
    expect(result.gameDetails).toHaveProperty("multiplier");
    expect(result.gameDetails).toHaveProperty("won");

    expect(Array.isArray(result.gameDetails.dice)).toBe(true);
    expect(result.gameDetails.dice).toHaveLength(2);
    expect(result.gameDetails.dice[0]).toBeGreaterThanOrEqual(1);
    expect(result.gameDetails.dice[0]).toBeLessThanOrEqual(6);
    expect(result.gameDetails.dice[1]).toBeGreaterThanOrEqual(1);
    expect(result.gameDetails.dice[1]).toBeLessThanOrEqual(6);

    expect(result.gameDetails.sum).toBe(
      result.gameDetails.dice[0] + result.gameDetails.dice[1],
    );
    expect(result.gameDetails.sum).toBeGreaterThanOrEqual(2);
    expect(result.gameDetails.sum).toBeLessThanOrEqual(12);

    expect(typeof result.gameDetails.won).toBe("boolean");
    expect(typeof result.gameDetails.multiplier).toBe("number");
  });

  /* ── Over bets ───────────────────────────────────────────────────── */

  describe("over bets", () => {
    it("wins when sum > target", async () => {
      // Find a nonce that produces sum > 7
      let found = false;
      for (let nonce = 0; nonce < 200; nonce++) {
        const round = createRound({
          nonce,
          gameParams: { betType: "over", target: 7 },
        });
        const result = await (engine as any).executeGame("user1", round);
        if (result.gameDetails.sum > 7) {
          found = true;
          expect(result.result).toBe(GameResult.WIN);
          expect(result.payout).toBeGreaterThan(0);
          expect(result.gameDetails.won).toBe(true);
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("loses when sum <= target", async () => {
      let found = false;
      for (let nonce = 0; nonce < 200; nonce++) {
        const round = createRound({
          nonce,
          gameParams: { betType: "over", target: 7 },
        });
        const result = await (engine as any).executeGame("user1", round);
        if (result.gameDetails.sum <= 7) {
          found = true;
          expect(result.result).toBe(GameResult.LOSE);
          expect(result.payout).toBe(0);
          expect(result.gameDetails.won).toBe(false);
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("calculates correct multiplier for over 7", async () => {
      // Ways to exceed 7: 8(5) + 9(4) + 10(3) + 11(2) + 12(1) = 15
      // multiplier = 36/15 * 0.97 = 2.328
      const round = createRound({
        gameParams: { betType: "over", target: 7 },
      });
      const result = await (engine as any).executeGame("user1", round);
      expect(result.gameDetails.multiplier).toBeCloseTo((36 / 15) * 0.97, 3);
    });

    it("calculates correct multiplier for over 10", async () => {
      // Ways to exceed 10: 11(2) + 12(1) = 3
      // multiplier = 36/3 * 0.97 = 11.64
      const round = createRound({
        gameParams: { betType: "over", target: 10 },
      });
      const result = await (engine as any).executeGame("user1", round);
      expect(result.gameDetails.multiplier).toBeCloseTo((36 / 3) * 0.97, 3);
    });

    it("throws for invalid over target below 2", async () => {
      const round = createRound({
        gameParams: { betType: "over", target: 1 },
      });
      await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
        "Over target must be between 2 and 11",
      );
    });

    it("throws for invalid over target above 11", async () => {
      const round = createRound({
        gameParams: { betType: "over", target: 12 },
      });
      await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
        "Over target must be between 2 and 11",
      );
    });
  });

  /* ── Under bets ────────────────────────────────────────────────────── */

  describe("under bets", () => {
    it("wins when sum < target", async () => {
      let found = false;
      for (let nonce = 0; nonce < 200; nonce++) {
        const round = createRound({
          nonce,
          gameParams: { betType: "under", target: 7 },
        });
        const result = await (engine as any).executeGame("user1", round);
        if (result.gameDetails.sum < 7) {
          found = true;
          expect(result.result).toBe(GameResult.WIN);
          expect(result.payout).toBeGreaterThan(0);
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("loses when sum >= target", async () => {
      let found = false;
      for (let nonce = 0; nonce < 200; nonce++) {
        const round = createRound({
          nonce,
          gameParams: { betType: "under", target: 7 },
        });
        const result = await (engine as any).executeGame("user1", round);
        if (result.gameDetails.sum >= 7) {
          found = true;
          expect(result.result).toBe(GameResult.LOSE);
          expect(result.payout).toBe(0);
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("calculates correct multiplier for under 7", async () => {
      // Ways below 7: 2(1) + 3(2) + 4(3) + 5(4) + 6(5) = 15
      const round = createRound({
        gameParams: { betType: "under", target: 7 },
      });
      const result = await (engine as any).executeGame("user1", round);
      expect(result.gameDetails.multiplier).toBeCloseTo((36 / 15) * 0.97, 3);
    });

    it("throws for invalid under target below 3", async () => {
      const round = createRound({
        gameParams: { betType: "under", target: 2 },
      });
      await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
        "Under target must be between 3 and 12",
      );
    });

    it("throws for invalid under target above 12", async () => {
      const round = createRound({
        gameParams: { betType: "under", target: 13 },
      });
      await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
        "Under target must be between 3 and 12",
      );
    });
  });

  /* ── Exact bets ────────────────────────────────────────────────────── */

  describe("exact bets", () => {
    it("wins when sum equals target", async () => {
      let found = false;
      for (let nonce = 0; nonce < 500; nonce++) {
        const round = createRound({
          nonce,
          gameParams: { betType: "exact", target: 7 },
        });
        const result = await (engine as any).executeGame("user1", round);
        if (result.gameDetails.sum === 7) {
          found = true;
          expect(result.result).toBe(GameResult.WIN);
          expect(result.payout).toBe(100 * 4); // 4:1 for 7
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("loses when sum does not equal target", async () => {
      let found = false;
      for (let nonce = 0; nonce < 100; nonce++) {
        const round = createRound({
          nonce,
          gameParams: { betType: "exact", target: 12 },
        });
        const result = await (engine as any).executeGame("user1", round);
        if (result.gameDetails.sum !== 12) {
          found = true;
          expect(result.result).toBe(GameResult.LOSE);
          expect(result.payout).toBe(0);
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("uses correct payout multipliers for each exact target", async () => {
      const expectedPayouts: Record<number, number> = {
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

      for (const [target, expectedMultiplier] of Object.entries(
        expectedPayouts,
      )) {
        const round = createRound({
          gameParams: { betType: "exact", target: Number(target) },
        });
        const result = await (engine as any).executeGame("user1", round);
        expect(result.gameDetails.multiplier).toBe(expectedMultiplier);
      }
    });

    it("throws for invalid exact target below 2", async () => {
      const round = createRound({
        gameParams: { betType: "exact", target: 1 },
      });
      await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
        "Exact target must be between 2 and 12",
      );
    });

    it("throws for invalid exact target above 12", async () => {
      const round = createRound({
        gameParams: { betType: "exact", target: 13 },
      });
      await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
        "Exact target must be between 2 and 12",
      );
    });
  });

  /* ── Doubles bets ────────────────────────────────────────────────── */

  describe("doubles bets", () => {
    it("wins when both dice are the same", async () => {
      let found = false;
      for (let nonce = 0; nonce < 500; nonce++) {
        const round = createRound({
          nonce,
          gameParams: { betType: "doubles" },
        });
        const result = await (engine as any).executeGame("user1", round);
        if (result.gameDetails.dice[0] === result.gameDetails.dice[1]) {
          found = true;
          expect(result.result).toBe(GameResult.WIN);
          expect(result.payout).toBe(100 * 5); // 5:1
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("loses when dice are different", async () => {
      let found = false;
      for (let nonce = 0; nonce < 200; nonce++) {
        const round = createRound({
          nonce,
          gameParams: { betType: "doubles" },
        });
        const result = await (engine as any).executeGame("user1", round);
        if (result.gameDetails.dice[0] !== result.gameDetails.dice[1]) {
          found = true;
          expect(result.result).toBe(GameResult.LOSE);
          expect(result.payout).toBe(0);
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("uses 5:1 multiplier for doubles", async () => {
      const round = createRound({
        gameParams: { betType: "doubles" },
      });
      const result = await (engine as any).executeGame("user1", round);
      expect(result.gameDetails.multiplier).toBe(5);
    });

    it("returns null target for doubles bet", async () => {
      const round = createRound({
        gameParams: { betType: "doubles" },
      });
      const result = await (engine as any).executeGame("user1", round);
      expect(result.gameDetails.target).toBeNull();
    });
  });

  /* ── Unknown bet type ────────────────────────────────────────────── */

  it("throws for unknown bet type", async () => {
    const round = createRound({
      gameParams: { betType: "invalid", target: 7 },
    });
    await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
      "Unknown bet type: invalid",
    );
  });

  /* ── Payout calculation ───────────────────────────────────────────── */

  it("calculates payout as betAmount × multiplier on win", async () => {
    // Find a winning exact bet on 7
    let found = false;
    for (let nonce = 0; nonce < 500; nonce++) {
      const round = createRound({
        nonce,
        betAmount: 50,
        gameParams: { betType: "exact", target: 7 },
      });
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.won) {
        found = true;
        expect(result.payout).toBe(50 * 4); // betAmount * multiplier
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("returns payout 0 on loss", async () => {
    let found = false;
    for (let nonce = 0; nonce < 100; nonce++) {
      const round = createRound({
        nonce,
        gameParams: { betType: "exact", target: 2 },
      });
      const result = await (engine as any).executeGame("user1", round);
      if (!result.gameDetails.won) {
        found = true;
        expect(result.payout).toBe(0);
        break;
      }
    }
    expect(found).toBe(true);
  });

  /* ── RTP simulation ───────────────────────────────────────────────── */

  it("over/under payout simulation stays near configured RTP", async () => {
    const betAmount = 100;
    const rounds = 5000;
    let totalBet = 0;
    let totalPayout = 0;

    for (let nonce = 0; nonce < rounds; nonce++) {
      const round = createRound({
        nonce,
        betAmount,
        gameParams: { betType: "over", target: 7 },
      });
      const result = await (engine as any).executeGame("user1", round);
      totalBet += betAmount;
      totalPayout += result.payout;
    }

    const rtp = totalPayout / totalBet;
    // Over 7 has 15/36 win probability, payout 36/15 * 0.97
    // Expected RTP should be very close to 0.97
    expect(rtp).toBeGreaterThan(0.92);
    expect(rtp).toBeLessThan(1.02);
  });
});
