import { describe, it, expect } from "vitest";
import {
  PlinkoEngine,
  MULTIPLIERS,
  generateBallPath,
  getMultiplier,
} from "./index";
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

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("PlinkoEngine", () => {
  const engine = new PlinkoEngine();

  it("has correct gameType and config", () => {
    expect(engine.gameType).toBe("plinko");
    expect(engine.config.minBet).toBe(1);
    expect(engine.config.maxBet).toBe(100000);
    expect(engine.config.rtp).toBe(0.96);
    expect(engine.config.rules).toMatchObject({
      rows: [8, 12, 16],
      risks: ["low", "medium", "high"],
    });
  });

  /* ── Path determination ──────────────────────────────────────────── */

  it("produces deterministic path for same seed+nonce+ballIndex", () => {
    const result1 = generateBallPath("seed", 0, 0, 16);
    const result2 = generateBallPath("seed", 0, 0, 16);

    expect(result1.path).toEqual(result2.path);
    expect(result1.landingSlot).toBe(result2.landingSlot);
  });

  it("produces different paths for different nonces", () => {
    const result1 = generateBallPath("seed", 0, 0, 16);
    const result2 = generateBallPath("seed", 1, 0, 16);

    expect(result1.path).not.toEqual(result2.path);
  });

  it("produces different paths for different ball indices", () => {
    const result1 = generateBallPath("seed", 0, 0, 16);
    const result2 = generateBallPath("seed", 0, 1, 16);

    expect(result1.path).not.toEqual(result2.path);
  });

  /* ── Slot mapping ────────────────────────────────────────────────── */

  it("landing slot equals count of R deflections", () => {
    const result = generateBallPath("seed", 0, 0, 8);
    const rightCount = result.path.filter((d) => d === "R").length;
    expect(result.landingSlot).toBe(rightCount);
    expect(result.landingSlot).toBeGreaterThanOrEqual(0);
    expect(result.landingSlot).toBeLessThanOrEqual(8);
  });

  it("path length equals row count", () => {
    for (const rows of [8, 12, 16]) {
      const result = generateBallPath("seed", 0, 0, rows);
      expect(result.path).toHaveLength(rows);
    }
  });

  it("path contains only L or R", () => {
    const result = generateBallPath("seed", 0, 0, 16);
    for (const dir of result.path) {
      expect(["L", "R"]).toContain(dir);
    }
  });

  /* ── Risk levels ─────────────────────────────────────────────────── */

  describe("risk level multipliers", () => {
    it("uses correct 16-row low-risk multipliers", () => {
      const expected = [
        55, 14, 7, 4, 2.5, 1.5, 1.0, 0.5, 0.51, 0.5, 1.0, 1.5, 2.5, 4, 7, 14,
        55,
      ];
      for (let slot = 0; slot <= 16; slot++) {
        expect(getMultiplier(16, "low", slot)).toBe(expected[slot]);
      }
    });

    it("uses correct 16-row medium-risk multipliers", () => {
      const expected = [
        150, 40, 15, 5, 3, 1.5, 0.8, 0.5, 0.3, 0.5, 0.8, 1.5, 3, 5, 15, 40, 150,
      ];
      for (let slot = 0; slot <= 16; slot++) {
        expect(getMultiplier(16, "medium", slot)).toBe(expected[slot]);
      }
    });

    it("uses correct 16-row high-risk multipliers", () => {
      const expected = [
        1000, 80, 25, 8, 3, 1.2, 0.6, 0.4, 0.25, 0.4, 0.6, 1.2, 3, 8, 25, 80,
        1000,
      ];
      for (let slot = 0; slot <= 16; slot++) {
        expect(getMultiplier(16, "high", slot)).toBe(expected[slot]);
      }
    });

    it("uses correct 8-row low-risk multipliers", () => {
      const expected = [5.5, 2.0, 0.8, 0.3, 0.2, 0.3, 0.8, 2.0, 5.5];
      for (let slot = 0; slot <= 8; slot++) {
        expect(getMultiplier(8, "low", slot)).toBe(expected[slot]);
      }
    });

    it("uses correct 12-row medium-risk multipliers", () => {
      const expected = [43, 15, 8, 4, 2.2, 1.2, 0.6, 1.2, 2.2, 4, 8, 15, 43];
      for (let slot = 0; slot <= 12; slot++) {
        expect(getMultiplier(12, "medium", slot)).toBe(expected[slot]);
      }
    });

    it("throws for invalid rows", () => {
      expect(() => getMultiplier(10, "low", 0)).toThrow(
        "No multiplier table for rows=10 risk=low",
      );
    });

    it("throws for invalid risk", () => {
      expect(() => getMultiplier(16, "extreme", 0)).toThrow(
        "No multiplier table for rows=16 risk=extreme",
      );
    });

    it("throws for invalid slot", () => {
      expect(() => getMultiplier(16, "low", -1)).toThrow(
        "Invalid landing slot -1",
      );
      expect(() => getMultiplier(16, "low", 17)).toThrow(
        "Invalid landing slot 17",
      );
    });
  });

  /* ── Multi-ball ──────────────────────────────────────────────────── */

  it("computes multiple balls with independent paths", async () => {
    const round = createRound({
      betAmount: 100,
      gameParams: { rows: 16, risk: "medium", balls: 3 },
    });
    const result = await (engine as any).executeGame("user1", round);

    expect(result.gameDetails.balls).toHaveLength(3);

    const slots = result.gameDetails.balls.map((b: any) => b.landingSlot);
    const multipliers = result.gameDetails.balls.map((b: any) => b.multiplier);
    const payouts = result.gameDetails.balls.map((b: any) => b.payout);

    // Each ball should have a valid slot
    for (const slot of slots) {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThanOrEqual(16);
    }

    // Per-ball payout = betPerBall × multiplier
    const betPerBall = 100 / 3;
    for (let i = 0; i < 3; i++) {
      expect(payouts[i]).toBeCloseTo(betPerBall * multipliers[i], 10);
    }

    // Total payout = sum of per-ball payouts
    const totalPayout = payouts.reduce((a: number, b: number) => a + b, 0);
    expect(result.gameDetails.totalPayout).toBeCloseTo(totalPayout, 10);
    expect(result.payout).toBeCloseTo(totalPayout, 10);
  });

  it("returns WIN when totalPayout > 0", async () => {
    // Find a nonce that produces at least one winning ball
    let found = false;
    for (let nonce = 0; nonce < 200; nonce++) {
      const round = createRound({
        nonce,
        betAmount: 100,
        gameParams: { rows: 16, risk: "medium", balls: 1 },
      });
      const result = await (engine as any).executeGame("user1", round);
      if (result.payout > 0) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.gameDetails.totalPayout).toBeGreaterThan(0);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("returns LOSE when totalPayout is 0", async () => {
    const round = createRound({
      nonce: 0,
      betAmount: 100,
      gameParams: { rows: 16, risk: "high", balls: 1 },
    });
    const result = await (engine as any).executeGame("user1", round);
    if (result.gameDetails.totalPayout === 0) {
      expect(result.result).toBe(GameResult.LOSE);
    } else {
      expect(result.result).toBe(GameResult.WIN);
    }
  });

  /* ── Validation ──────────────────────────────────────────────────── */

  it("throws for invalid rows", async () => {
    const round = createRound({
      gameParams: { rows: 10, risk: "medium", balls: 1 },
    });
    await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
      "Invalid rows: 10",
    );
  });

  it("throws for invalid risk", async () => {
    const round = createRound({
      gameParams: { rows: 16, risk: "extreme", balls: 1 },
    });
    await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
      "Invalid risk: extreme",
    );
  });

  it("throws for balls below 1", async () => {
    const round = createRound({
      gameParams: { rows: 16, risk: "medium", balls: 0 },
    });
    await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
      "Invalid balls: 0",
    );
  });

  it("throws for balls above 10", async () => {
    const round = createRound({
      gameParams: { rows: 16, risk: "medium", balls: 11 },
    });
    await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
      "Invalid balls: 11",
    );
  });

  it("throws for non-integer balls", async () => {
    const round = createRound({
      gameParams: { rows: 16, risk: "medium", balls: 2.5 },
    });
    await expect((engine as any).executeGame("user1", round)).rejects.toThrow(
      "Invalid balls: 2.5",
    );
  });

  /* ── gameDetails shape ───────────────────────────────────────────── */

  it("returns correct gameDetails shape", async () => {
    const round = createRound({
      gameParams: { rows: 16, risk: "medium", balls: 2 },
    });
    const result = await (engine as any).executeGame("user1", round);

    expect(result.gameDetails).toHaveProperty("rows");
    expect(result.gameDetails).toHaveProperty("risk");
    expect(result.gameDetails).toHaveProperty("balls");
    expect(result.gameDetails).toHaveProperty("totalPayout");

    expect(typeof result.gameDetails.rows).toBe("number");
    expect(typeof result.gameDetails.risk).toBe("string");
    expect(Array.isArray(result.gameDetails.balls)).toBe(true);
    expect(result.gameDetails.balls).toHaveLength(2);

    const ball = result.gameDetails.balls[0];
    expect(ball).toHaveProperty("path");
    expect(ball).toHaveProperty("landingSlot");
    expect(ball).toHaveProperty("multiplier");
    expect(ball).toHaveProperty("payout");

    expect(Array.isArray(ball.path)).toBe(true);
    expect(typeof ball.landingSlot).toBe("number");
    expect(typeof ball.multiplier).toBe("number");
    expect(typeof ball.payout).toBe("number");
  });

  /* ── Defaults ────────────────────────────────────────────────────── */

  it("uses default params when not provided", async () => {
    const round = createRound({ gameParams: {} });
    const result = await (engine as any).executeGame("user1", round);

    expect(result.gameDetails.rows).toBe(16);
    expect(result.gameDetails.risk).toBe("medium");
    expect(result.gameDetails.balls).toHaveLength(1);
  });
});
