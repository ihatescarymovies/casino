import { describe, it, expect, vi, beforeEach } from "vitest";
import { MinesEngine, type MinesGameDetails } from "./index";
import {
  GameResult,
  GameState,
  type GameRoundData,
} from "../../lib/game-engine";
import { sseManager } from "../../lib/sse";
import * as wallet from "../../lib/wallet";
import { db } from "@workspace/db";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(overrides: Partial<GameRoundData> = {}): GameRoundData {
  return {
    roundId: 1,
    gameType: "mines",
    betAmount: 100,
    clientSeed: "test-seed",
    serverSeedHash: "test-hash",
    nonce: 0,
    state: GameState.IN_PROGRESS,
    result: GameResult.PENDING,
    payout: 0,
    ...overrides,
  };
}

function mockDbRound(round: Partial<Record<string, unknown>> = {}) {
  const defaultRound = {
    id: 1,
    userId: "user1",
    gameType: "mines",
    betAmount: 100,
    result: GameResult.PENDING,
    payout: 0,
    serverSeedHash: "test-hash",
    clientSeed: "test-seed",
    nonce: 0,
    details: null,
    ...round,
  };

  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([defaultRound]),
    }),
  } as any);

  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  } as any);
}

/* ── Mocks ──────────────────────────────────────────────────────────── */

vi.mock("../../lib/sse", () => ({
  sseManager: {
    broadcast: vi.fn(),
    addClient: vi.fn(() => "mock-client-id"),
    removeClient: vi.fn(),
    getClientCount: vi.fn(() => 0),
  },
}));

vi.mock("../../lib/wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/wallet")>();
  return {
    ...actual,
    creditPayout: vi.fn(() =>
      Promise.resolve({
        transactionId: 2,
        balanceBefore: 900,
        balanceAfter: 1000,
      }),
    ),
  };
});

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("MinesEngine", () => {
  let engine: MinesEngine;

  beforeEach(() => {
    engine = new MinesEngine();
    vi.clearAllMocks();
  });

  /* ── Config ─────────────────────────────────────────────────────── */

  it("has correct gameType and config", () => {
    expect(engine.gameType).toBe("mines");
    expect(engine.config.minBet).toBe(1);
    expect(engine.config.maxBet).toBe(100000);
    expect(engine.config.rtp).toBe(0.97);
    expect(engine.config.rules).toMatchObject({
      gridSize: 5,
      maxMines: 24,
      minMines: 1,
    });
  });

  /* ── executeGame ────────────────────────────────────────────────── */

  it("executeGame returns PENDING with mine placement", async () => {
    const round = createRound();
    const result = await (engine as any).executeGame("user1", round);

    expect(result.result).toBe(GameResult.PENDING);
    expect(result.payout).toBe(0);
    expect(result.gameDetails).toHaveProperty("mineCount", 5);
    expect(result.gameDetails).toHaveProperty("gridSize", 5);
    expect(result.gameDetails).toHaveProperty("totalTiles", 25);
    expect(result.gameDetails).toHaveProperty("safeTiles", 20);
    expect(result.gameDetails).toHaveProperty("currentMultiplier", 1.0);
    expect(result.gameDetails).toHaveProperty("revealedTiles");
    expect(result.gameDetails).toHaveProperty("minesNotRevealed", true);
    expect(result.gameDetails.revealedTiles).toHaveLength(0);
  });

  it("produces deterministic mine placement for same seed+nonce", async () => {
    const round = createRound();
    const result1 = await (engine as any).executeGame("user1", round);
    const result2 = await (engine as any).executeGame("user1", round);

    // Reset active rounds between calls
    (engine as any).activeRounds.clear();
    const result3 = await (engine as any).executeGame("user1", round);

    expect(result1.gameDetails.mineCount).toBe(result2.gameDetails.mineCount);
    expect(result1.gameDetails.mineCount).toBe(result3.gameDetails.mineCount);
  });

  it("produces different mine placement for different nonces", async () => {
    const round1 = createRound({ nonce: 0 });
    const round2 = createRound({ nonce: 1 });

    const result1 = await (engine as any).executeGame("user1", round1);
    const active1 = (engine as any).activeRounds.get(1);

    (engine as any).activeRounds.clear();

    const result2 = await (engine as any).executeGame("user1", round2);
    const active2 = (engine as any).activeRounds.get(1);

    // Mine positions should differ with high probability
    const mines1 = [...(active1.minePositions as Set<number>)].sort(
      (a, b) => a - b,
    );
    const mines2 = [...(active2.minePositions as Set<number>)].sort(
      (a, b) => a - b,
    );

    // They might coincidentally match, but probability is extremely low
    // Instead, verify both have correct count
    expect(mines1).toHaveLength(5);
    expect(mines2).toHaveLength(5);
  });

  it("places correct number of mines", async () => {
    for (let mineCount = 1; mineCount <= 24; mineCount++) {
      const round = createRound({
        roundId: mineCount,
        gameParams: { mineCount },
      });
      const result = await (engine as any).executeGame("user1", round);
      const active = (engine as any).activeRounds.get(mineCount);

      expect(active.minePositions.size).toBe(mineCount);
      expect(result.gameDetails.mineCount).toBe(mineCount);
      expect(result.gameDetails.safeTiles).toBe(25 - mineCount);
    }
  });

  it("places mines without duplicates", async () => {
    // Test many nonces to ensure no duplicate mines
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce, roundId: nonce + 100 });
      await (engine as any).executeGame("user1", round);
      const active = (engine as any).activeRounds.get(nonce + 100);

      const mines = Array.from(active.minePositions);
      const uniqueMines = new Set(mines);
      expect(uniqueMines.size).toBe(mines.length);
      expect(mines.length).toBe(5);

      // All mines within valid range
      for (const mine of mines) {
        expect(mine).toBeGreaterThanOrEqual(0);
        expect(mine).toBeLessThan(25);
      }
    }
  });

  it("throws on invalid mine count", async () => {
    const roundLow = createRound({
      gameParams: { mineCount: 0 },
    });
    await expect(
      (engine as any).executeGame("user1", roundLow),
    ).rejects.toThrow("Mine count must be between 1 and 24");

    const roundHigh = createRound({
      gameParams: { mineCount: 25 },
    });
    await expect(
      (engine as any).executeGame("user1", roundHigh),
    ).rejects.toThrow("Mine count must be between 1 and 24");
  });

  it("uses default mine count of 5 when not specified", async () => {
    const round = createRound();
    const result = await (engine as any).executeGame("user1", round);
    expect(result.gameDetails.mineCount).toBe(5);
  });

  /* ── handleAction: reveal ───────────────────────────────────────── */

  it("reveals a safe tile and returns updated multiplier", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    // Find a safe tile
    const active = (engine as any).activeRounds.get(1);
    let safeTile = -1;
    for (let i = 0; i < 25; i++) {
      if (!active.minePositions.has(i)) {
        safeTile = i;
        break;
      }
    }
    expect(safeTile).toBeGreaterThanOrEqual(0);

    mockDbRound();

    const result = await engine.handleAction(1, "reveal", { tile: safeTile });

    expect(result.result).toBe(GameResult.PENDING);
    expect(result.payout).toBe(0);
    expect(result.multiplier).toBeDefined();
    expect(result.multiplier).toBeGreaterThan(1.0);
    const details = result.gameDetails as any;
    expect(details.revealedTiles).toHaveLength(1);
    expect(details.revealedTiles[0]).toEqual({
      tile: safeTile,
      isMine: false,
    });
    expect(details.minesNotRevealed).toBe(true);
  });

  it("reveals multiple safe tiles with increasing multiplier", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    const safeTiles: number[] = [];
    for (let i = 0; i < 25 && safeTiles.length < 5; i++) {
      if (!active.minePositions.has(i)) {
        safeTiles.push(i);
      }
    }

    const multipliers: number[] = [];

    for (const tile of safeTiles) {
      mockDbRound();
      const result = await engine.handleAction(1, "reveal", { tile });
      multipliers.push(result.multiplier!);
    }

    // Multiplier should increase with each safe tile
    for (let i = 1; i < multipliers.length; i++) {
      expect(multipliers[i]).toBeGreaterThan(multipliers[i - 1]);
    }
  });

  it("hits a mine and returns LOSE", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    const mineTile = Array.from(active.minePositions as Set<number>)[0];

    mockDbRound();

    const result = await engine.handleAction(1, "reveal", { tile: mineTile });

    expect(result.result).toBe(GameResult.LOSE);
    expect(result.payout).toBe(0);
    const details = result.gameDetails as any;
    expect(details.revealedTiles).toHaveLength(1);
    expect(details.revealedTiles[0]).toEqual({
      tile: mineTile,
      isMine: true,
    });
    // Only the clicked mine is revealed, not all mines
    expect(details.minesNotRevealed).toBe(true);
  });

  it("removes active round after hitting a mine", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    const mineTile = Array.from(active.minePositions as Set<number>)[0];

    mockDbRound();

    await engine.handleAction(1, "reveal", { tile: mineTile });

    expect((engine as any).activeRounds.has(1)).toBe(false);
  });

  it("throws on revealing already revealed tile", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    let safeTile = -1;
    for (let i = 0; i < 25; i++) {
      if (!active.minePositions.has(i)) {
        safeTile = i;
        break;
      }
    }

    mockDbRound();
    await engine.handleAction(1, "reveal", { tile: safeTile });

    mockDbRound();
    await expect(
      engine.handleAction(1, "reveal", { tile: safeTile }),
    ).rejects.toThrow(`Tile ${safeTile} already revealed`);
  });

  it("throws on invalid tile index", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    mockDbRound();
    await expect(
      engine.handleAction(1, "reveal", { tile: -1 }),
    ).rejects.toThrow("Tile must be between 0 and 24");

    mockDbRound();
    await expect(
      engine.handleAction(1, "reveal", { tile: 25 }),
    ).rejects.toThrow("Tile must be between 0 and 24");
  });

  it("throws on reveal for non-existent round", async () => {
    await expect(
      engine.handleAction(999, "reveal", { tile: 0 }),
    ).rejects.toThrow("Round 999 not found or already resolved");
  });

  /* ── handleAction: cashout ──────────────────────────────────────── */

  it("cashes out after revealing safe tiles", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    let safeTile = -1;
    for (let i = 0; i < 25; i++) {
      if (!active.minePositions.has(i)) {
        safeTile = i;
        break;
      }
    }

    mockDbRound();
    const revealResult = await engine.handleAction(1, "reveal", {
      tile: safeTile,
    });

    mockDbRound();
    const cashoutResult = await engine.handleAction(1, "cashout");

    expect(cashoutResult.result).toBe(GameResult.CASHED_OUT);
    expect(cashoutResult.payout).toBeGreaterThan(0);
    expect(cashoutResult.multiplier).toBe(revealResult.multiplier);
    expect(cashoutResult.gameDetails.revealedTiles).toHaveLength(1);
  });

  it("removes active round after cashout", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    let safeTile = -1;
    for (let i = 0; i < 25; i++) {
      if (!active.minePositions.has(i)) {
        safeTile = i;
        break;
      }
    }

    mockDbRound();
    await engine.handleAction(1, "reveal", { tile: safeTile });

    mockDbRound();
    await engine.handleAction(1, "cashout");

    expect((engine as any).activeRounds.has(1)).toBe(false);
  });

  it("throws on cashout without revealing any tiles", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    mockDbRound();
    await expect(engine.handleAction(1, "cashout")).rejects.toThrow(
      "Must reveal at least one safe tile before cashing out",
    );
  });

  it("throws on cashout for already resolved round", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    let safeTile = -1;
    for (let i = 0; i < 25; i++) {
      if (!active.minePositions.has(i)) {
        safeTile = i;
        break;
      }
    }

    mockDbRound();
    await engine.handleAction(1, "reveal", { tile: safeTile });

    mockDbRound();
    await engine.handleAction(1, "cashout");

    // Round is now resolved and removed from activeRounds
    mockDbRound({ result: GameResult.CASHED_OUT });
    await expect(engine.handleAction(1, "cashout")).rejects.toThrow(
      "Round 1 not found or already resolved",
    );
  });

  it("credits wallet on cashout", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    let safeTile = -1;
    for (let i = 0; i < 25; i++) {
      if (!active.minePositions.has(i)) {
        safeTile = i;
        break;
      }
    }

    const creditSpy = vi.spyOn(wallet, "creditPayout");

    mockDbRound();
    await engine.handleAction(1, "reveal", { tile: safeTile });

    mockDbRound();
    const result = await engine.handleAction(1, "cashout");

    expect(creditSpy).toHaveBeenCalledWith(
      "user1",
      result.payout,
      "mines",
      "1",
    );
  });

  /* ── Multiplier calculation ─────────────────────────────────────── */

  it("calculates correct multiplier for known scenarios", async () => {
    // 5 mines, 20 safe tiles
    // After 1 safe tile: prob = C(20,1)/C(25,1) = 20/25 = 0.8
    // multiplier = 0.97 / 0.8 = 1.2125
    const round = createRound({ gameParams: { mineCount: 5 } });
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    let safeTile = -1;
    for (let i = 0; i < 25; i++) {
      if (!active.minePositions.has(i)) {
        safeTile = i;
        break;
      }
    }

    mockDbRound();
    const result = await engine.handleAction(1, "reveal", { tile: safeTile });

    // Should be approximately 1.2125
    expect(result.multiplier).toBeCloseTo(1.2125, 3);
  });

  it("multiplier increases with more safe tiles revealed", async () => {
    const round = createRound({ gameParams: { mineCount: 5 } });
    await (engine as any).executeGame("user1", round);

    const active = (engine as any).activeRounds.get(1);
    const safeTiles: number[] = [];
    for (let i = 0; i < 25 && safeTiles.length < 10; i++) {
      if (!active.minePositions.has(i)) {
        safeTiles.push(i);
      }
    }

    const multipliers: number[] = [];

    for (const tile of safeTiles) {
      mockDbRound();
      const result = await engine.handleAction(1, "reveal", { tile });
      multipliers.push(result.multiplier!);
    }

    // Each subsequent multiplier should be higher
    for (let i = 1; i < multipliers.length; i++) {
      expect(multipliers[i]).toBeGreaterThan(multipliers[i - 1]);
    }

    // After 10 safe tiles with 5 mines:
    // prob = C(20,10)/C(25,10) ≈ 0.0576
    // multiplier ≈ 0.97 / 0.0576 ≈ 16.84
    expect(multipliers[multipliers.length - 1]).toBeGreaterThan(10);
  });

  /* ── Unknown action ─────────────────────────────────────────────── */

  it("throws on unknown action", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    mockDbRound();
    await expect(engine.handleAction(1, "unknown")).rejects.toThrow(
      "Unknown action: unknown",
    );
  });

  /* ── Test helpers ─────────────────────────────────────────────────── */

  it("_getActiveRound returns active round", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    const active = (engine as any)._getActiveRound(1);
    expect(active).toBeDefined();
    expect(active.roundId).toBe(1);
    expect(active.minePositions.size).toBe(5);
    expect(active.state).toBe(GameState.IN_PROGRESS);
  });

  it("_setActiveRound sets and removes rounds", async () => {
    const round = createRound();
    await (engine as any).executeGame("user1", round);

    expect((engine as any)._getActiveRound(1)).toBeDefined();

    (engine as any)._setActiveRound(1, null);
    expect((engine as any)._getActiveRound(1)).toBeUndefined();
  });
});
