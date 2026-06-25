import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CrashEngine } from "./index";
import {
  GameResult,
  GameState,
  type GameRoundData,
} from "../../lib/game-engine";
import { sseManager } from "../../lib/sse";
import * as wallet from "../../lib/wallet";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(overrides: Partial<GameRoundData> = {}): GameRoundData {
  return {
    roundId: 1,
    gameType: "crash",
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
        transactionId: 999,
        balanceBefore: 1000,
        balanceAfter: 1100,
      }),
    ),
  };
});

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("CrashEngine", () => {
  let engine: CrashEngine;

  beforeEach(() => {
    engine = new CrashEngine();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /* ── Config ─────────────────────────────────────────────────────── */

  it("has correct gameType and config", () => {
    expect(engine.gameType).toBe("crash");
    expect(engine.config.minBet).toBe(1);
    expect(engine.config.maxBet).toBe(500000);
    expect(engine.config.rtp).toBe(0.99);
    expect(engine.config.rules).toMatchObject({
      tickIntervalMs: 100,
      houseEdge: 0.01,
    });
  });

  /* ── executeGame / Crash Point ──────────────────────────────────── */

  it("executeGame returns PENDING with crash point", async () => {
    const round = createRound();
    const result = await (engine as any).executeGame("user1", round);

    expect(result.result).toBe(GameResult.PENDING);
    expect(result.payout).toBe(0);
    expect(result.gameDetails).toHaveProperty("crashPoint");
    expect(result.gameDetails).toHaveProperty("tickIntervalMs", 100);
    expect(result.gameDetails).toHaveProperty("startedAt");
    expect(typeof result.gameDetails.crashPoint).toBe("number");
    expect(result.gameDetails.crashPoint).toBeGreaterThanOrEqual(1.0);
  });

  it("produces deterministic crash point for same seed+nonce", async () => {
    const round = createRound();
    const result1 = await (engine as any).executeGame("user1", round);
    const result2 = await (engine as any).executeGame("user1", round);

    expect(result1.gameDetails.crashPoint).toBe(result2.gameDetails.crashPoint);
  });

  it("produces different crash points for different nonces", async () => {
    const round1 = createRound({ nonce: 0 });
    const round2 = createRound({ nonce: 1 });

    const result1 = await (engine as any).executeGame("user1", round1);
    const result2 = await (engine as any).executeGame("user1", round2);

    expect(result1.gameDetails.crashPoint).not.toBe(
      result2.gameDetails.crashPoint,
    );
  });

  it("crash point is always >= 1.0", async () => {
    // Test many nonces to ensure crash point never drops below 1.0
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      expect(result.gameDetails.crashPoint).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("crash point follows exponential distribution (most rounds crash early)", async () => {
    const crashPoints: number[] = [];
    const sampleSize = 5000;

    for (let nonce = 0; nonce < sampleSize; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      crashPoints.push(result.gameDetails.crashPoint as number);
    }

    // Most rounds should crash at or below 2.0x
    const earlyCrashes = crashPoints.filter((cp) => cp <= 2.0).length;
    const earlyCrashRate = earlyCrashes / sampleSize;
    expect(earlyCrashRate).toBeGreaterThan(0.4); // At least 40% crash at or below 2x

    // Very few rounds should go above 10x
    const highCrashes = crashPoints.filter((cp) => cp > 10.0).length;
    const highCrashRate = highCrashes / sampleSize;
    expect(highCrashRate).toBeLessThan(0.12); // Less than 12% go above 10x
  });

  /* ── startRound ─────────────────────────────────────────────────── */

  it("startRound creates an active round with correct crash point", async () => {
    await engine.startRound(1, "test-hash", 0);
    const active = (engine as any).activeRound;

    expect(active).not.toBeNull();
    expect(active.state).toBe(GameState.IN_PROGRESS);
    expect(active.crashPoint).toBeGreaterThanOrEqual(1.0);
    expect(active.tickIntervalMs).toBe(100);
    expect(active.currentMultiplier).toBe(1.0);
    expect(active.elapsedMs).toBe(0);
    expect(active.timer).not.toBeNull();

    // Clean up
    (engine as any).stopTickLoop();
  });

  it("throws if starting a round while one is in progress", async () => {
    await engine.startRound(1, "test-hash", 0);

    await expect(engine.startRound(2, "test-hash", 1)).rejects.toThrow(
      "A round is already in progress",
    );

    // Clean up
    (engine as any).stopTickLoop();
  });

  /* ── Tick Loop / SSE ────────────────────────────────────────────── */

  it("broadcasts tick events on each interval", async () => {
    vi.useFakeTimers();
    const broadcastSpy = vi.spyOn(sseManager, "broadcast");

    await engine.startRound(1, "test-hash", 0);

    // Advance by one tick interval
    vi.advanceTimersByTime(100);

    expect(broadcastSpy).toHaveBeenCalledWith(
      "crash",
      "crash:tick",
      expect.objectContaining({
        multiplier: expect.any(Number),
        elapsed: expect.any(Number),
      }),
    );

    // Advance by another tick
    vi.advanceTimersByTime(100);

    const tickCalls = broadcastSpy.mock.calls.filter(
      ([, eventName]) => eventName === "crash:tick",
    );
    expect(tickCalls.length).toBeGreaterThanOrEqual(2);

    // Verify multiplier increases over time
    const firstTick = tickCalls[0][2] as {
      multiplier: number;
      elapsed: number;
    };
    const secondTick = tickCalls[1][2] as {
      multiplier: number;
      elapsed: number;
    };
    expect(secondTick.multiplier).toBeGreaterThan(firstTick.multiplier);

    // Clean up
    (engine as any).stopTickLoop();
  });

  it("multiplier increases parabolically over time", async () => {
    vi.useFakeTimers();
    const broadcastSpy = vi.spyOn(sseManager, "broadcast");

    await engine.startRound(1, "test-hash", 0);

    // After 100ms: multiplier ≈ 1.01
    vi.advanceTimersByTime(100);
    let tickCalls = broadcastSpy.mock.calls.filter(
      ([, eventName]) => eventName === "crash:tick",
    );
    let firstMultiplier = (tickCalls[0][2] as { multiplier: number })
      .multiplier;
    expect(firstMultiplier).toBeGreaterThanOrEqual(1.0);
    expect(firstMultiplier).toBeLessThan(1.05);

    // After 500ms total: multiplier ≈ 1.25
    vi.advanceTimersByTime(400);
    tickCalls = broadcastSpy.mock.calls.filter(
      ([, eventName]) => eventName === "crash:tick",
    );
    const laterMultiplier = (
      tickCalls[tickCalls.length - 1][2] as { multiplier: number }
    ).multiplier;
    expect(laterMultiplier).toBeGreaterThan(1.2);

    // Clean up
    (engine as any).stopTickLoop();
  });

  /* ── Crash / Auto-resolve ───────────────────────────────────────── */

  it("crashes when multiplier reaches crash point", async () => {
    vi.useFakeTimers();
    const broadcastSpy = vi.spyOn(sseManager, "broadcast");

    // Use a seed that produces a low crash point (close to 1.0)
    // We need to find a nonce that gives crashPoint ≈ 1.0-1.5
    let lowCrashNonce = -1;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      const cp = result.gameDetails.crashPoint as number;
      if (cp >= 1.0 && cp <= 1.5) {
        lowCrashNonce = nonce;
        break;
      }
    }
    expect(lowCrashNonce).toBeGreaterThanOrEqual(0);

    await engine.startRound(1, "test-hash", lowCrashNonce);
    const active = (engine as any).activeRound;
    const crashPoint = active.crashPoint as number;

    // Advance time until crash
    // At 100ms: multiplier = 1.01, 200ms: 1.04, 300ms: 1.09, 400ms: 1.16, 500ms: 1.25
    // For crashPoint ≈ 1.2-1.5, we need ~400-600ms
    vi.advanceTimersByTime(2000);

    // Should have broadcast crash:crashed
    const crashCalls = broadcastSpy.mock.calls.filter(
      ([, eventName]) => eventName === "crash:crashed",
    );
    expect(crashCalls.length).toBe(1);

    const crashData = crashCalls[0][2] as {
      crashPoint: number;
      busted: boolean;
    };
    expect(crashData.busted).toBe(true);
    expect(crashData.crashPoint).toBe(crashPoint);

    // Active round should be cleared
    expect((engine as any).activeRound).toBeNull();
  });

  /* ── Cash-out ───────────────────────────────────────────────────── */

  it("allows cash-out during active round", async () => {
    vi.useFakeTimers();
    const broadcastSpy = vi.spyOn(sseManager, "broadcast");
    const creditSpy = vi.spyOn(wallet, "creditPayout");

    // Use a seed with a high crash point so we have time to cash out
    let highCrashNonce = -1;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      const cp = result.gameDetails.crashPoint as number;
      if (cp > 5.0) {
        highCrashNonce = nonce;
        break;
      }
    }
    expect(highCrashNonce).toBeGreaterThanOrEqual(0);

    await engine.startRound(1, "test-hash", highCrashNonce);

    // Inject a player manually
    const active = (engine as any).activeRound;
    active.players.set(1, {
      userId: "user1",
      roundId: 1,
      betAmount: 100,
      cashedOut: false,
      payout: 0,
    });

    // Advance a bit so multiplier > 1.0
    vi.advanceTimersByTime(300);

    const result = await engine.handleAction(1, "cashout");

    expect(result.success).toBe(true);
    expect(result.multiplier).toBeDefined();
    expect(result.payout).toBeDefined();
    expect(result.payout).toBeGreaterThan(100); // payout > bet amount since multiplier > 1

    // Verify wallet credit
    expect(creditSpy).toHaveBeenCalledWith(
      "user1",
      expect.any(Number),
      "crash",
      "1",
    );

    // Verify broadcast
    const cashoutCalls = broadcastSpy.mock.calls.filter(
      ([, eventName]) => eventName === "crash:cashed_out",
    );
    expect(cashoutCalls.length).toBe(1);
    const cashoutData = cashoutCalls[0][2] as {
      userId: string;
      roundId: number;
      multiplier: number;
      payout: number;
    };
    expect(cashoutData.userId).toBe("user1");
    expect(cashoutData.roundId).toBe(1);
    expect(cashoutData.multiplier).toBe(result.multiplier);
    expect(cashoutData.payout).toBe(result.payout);

    // Clean up
    (engine as any).stopTickLoop();
  });

  it("throws on cash-out when no active round", async () => {
    await expect(engine.handleAction(1, "cashout")).rejects.toThrow(
      "No active round in progress",
    );
  });

  it("throws on cash-out for unknown round", async () => {
    await engine.startRound(1, "test-hash", 0);

    await expect(engine.handleAction(999, "cashout")).rejects.toThrow(
      "Player not found in active round",
    );

    // Clean up
    (engine as any).stopTickLoop();
  });

  it("throws on double cash-out", async () => {
    vi.useFakeTimers();

    // Find a high crash point nonce
    let highCrashNonce = -1;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      if ((result.gameDetails.crashPoint as number) > 5.0) {
        highCrashNonce = nonce;
        break;
      }
    }
    expect(highCrashNonce).toBeGreaterThanOrEqual(0);

    await engine.startRound(1, "test-hash", highCrashNonce);

    const active = (engine as any).activeRound;
    active.players.set(1, {
      userId: "user1",
      roundId: 1,
      betAmount: 100,
      cashedOut: false,
      payout: 0,
    });

    vi.advanceTimersByTime(300);

    // First cash-out succeeds
    await engine.handleAction(1, "cashout");

    // Second cash-out fails
    await expect(engine.handleAction(1, "cashout")).rejects.toThrow(
      "Already cashed out",
    );

    // Clean up
    (engine as any).stopTickLoop();
  });

  it("throws on cash-out after crash", async () => {
    vi.useFakeTimers();

    // Find a low crash point nonce
    let lowCrashNonce = -1;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      const cp = result.gameDetails.crashPoint as number;
      if (cp >= 1.0 && cp <= 1.5) {
        lowCrashNonce = nonce;
        break;
      }
    }
    expect(lowCrashNonce).toBeGreaterThanOrEqual(0);

    await engine.startRound(1, "test-hash", lowCrashNonce);

    const active = (engine as any).activeRound;
    active.players.set(1, {
      userId: "user1",
      roundId: 1,
      betAmount: 100,
      cashedOut: false,
      payout: 0,
    });

    // Advance past crash point
    vi.advanceTimersByTime(2000);

    // Flush microtasks so crash() async completion runs
    await vi.runAllTicks();

    // Should have crashed
    await expect(engine.handleAction(1, "cashout")).rejects.toThrow(
      "Round has already crashed",
    );
  });

  /* ── Multi-player ───────────────────────────────────────────────── */

  it("tracks multiple players in active round", async () => {
    vi.useFakeTimers();

    let highCrashNonce = -1;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      if ((result.gameDetails.crashPoint as number) > 10.0) {
        highCrashNonce = nonce;
        break;
      }
    }
    expect(highCrashNonce).toBeGreaterThanOrEqual(0);

    await engine.startRound(1, "test-hash", highCrashNonce);

    const active = (engine as any).activeRound;
    active.players.set(1, {
      userId: "user1",
      roundId: 1,
      betAmount: 100,
      cashedOut: false,
      payout: 0,
    });
    active.players.set(2, {
      userId: "user2",
      roundId: 2,
      betAmount: 200,
      cashedOut: false,
      payout: 0,
    });
    active.players.set(3, {
      userId: "user3",
      roundId: 3,
      betAmount: 150,
      cashedOut: false,
      payout: 0,
    });

    expect(active.players.size).toBe(3);

    // Clean up
    (engine as any).stopTickLoop();
  });

  it("resolves non-cashed-out players as losers on crash", async () => {
    vi.useFakeTimers();
    const broadcastSpy = vi.spyOn(sseManager, "broadcast");

    // Find a low crash point
    let lowCrashNonce = -1;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      const cp = result.gameDetails.crashPoint as number;
      if (cp >= 1.0 && cp <= 1.5) {
        lowCrashNonce = nonce;
        break;
      }
    }
    expect(lowCrashNonce).toBeGreaterThanOrEqual(0);

    await engine.startRound(1, "test-hash", lowCrashNonce);

    const active = (engine as any).activeRound;
    active.players.set(1, {
      userId: "user1",
      roundId: 1,
      betAmount: 100,
      cashedOut: false,
      payout: 0,
    });
    active.players.set(2, {
      userId: "user2",
      roundId: 2,
      betAmount: 200,
      cashedOut: false,
      payout: 0,
    });

    // Let it crash
    vi.advanceTimersByTime(2000);

    // Flush microtasks so crash() async completion runs
    await vi.runAllTicks();

    // Should broadcast crash:crashed
    const crashCalls = broadcastSpy.mock.calls.filter(
      ([, eventName]) => eventName === "crash:crashed",
    );
    expect(crashCalls.length).toBe(1);

    // Both players should have lost (no cash-out)
    // The crash method updates DB and broadcasts round_update for each
    const roundUpdateCalls = broadcastSpy.mock.calls.filter(
      ([, eventName]) => eventName === "round_update",
    );
    expect(roundUpdateCalls.length).toBe(2);

    for (const call of roundUpdateCalls) {
      const data = call[2] as { result: string; payout: number };
      expect(data.result).toBe(GameResult.LOSE);
      expect(data.payout).toBe(0);
    }
  });

  /* ── getActiveRound ─────────────────────────────────────────────── */

  it("getActiveRound returns null when no active round", () => {
    expect(engine.getActiveRound()).toBeNull();
  });

  it("getActiveRound returns round state when active", async () => {
    vi.useFakeTimers();
    await engine.startRound(1, "test-hash", 0);

    const state = engine.getActiveRound();
    expect(state).not.toBeNull();
    expect(state!.crashPoint).toBeGreaterThanOrEqual(1.0);
    expect(state!.currentMultiplier).toBe(1.0);
    expect(state!.elapsedMs).toBe(0);
    expect(state!.state).toBe(GameState.IN_PROGRESS);
    expect(state!.playerCount).toBe(0);

    // Clean up
    (engine as any).stopTickLoop();
  });

  /* ── Unknown action ─────────────────────────────────────────────── */

  it("throws on unknown action", async () => {
    vi.useFakeTimers();
    await engine.startRound(1, "test-hash", 0);

    const active = (engine as any).activeRound;
    active.players.set(1, {
      userId: "user1",
      roundId: 1,
      betAmount: 100,
      cashedOut: false,
      payout: 0,
    });

    await expect(engine.handleAction(1, "unknown")).rejects.toThrow(
      "Unknown action: unknown",
    );

    // Clean up
    (engine as any).stopTickLoop();
  });
});
