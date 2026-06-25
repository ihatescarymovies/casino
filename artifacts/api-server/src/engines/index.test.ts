import { describe, it, expect } from "vitest";
import { EngineRegistry } from "./index";
import type { GameEngine, GameConfig, GameRoundData } from "../lib/game-engine";

/* ── Mock Engine ────────────────────────────────────────────────────── */

const mockConfig: GameConfig = {
  minBet: 100,
  maxBet: 10000,
  rtp: 0.96,
  rules: {},
};

function createMockEngine(gameType: string): GameEngine {
  return {
    gameType,
    config: { ...mockConfig },
    async placeBet() {
      return {
        roundId: 1,
        gameType,
        betAmount: 500,
        clientSeed: "test-seed",
        serverSeedHash: "abc123",
        nonce: 0,
        state: "bet_placed" as any,
        result: "pending" as any,
        payout: 0,
      };
    },
    async handleAction() {
      return {
        result: "win" as any,
        payout: 0,
        gameDetails: {},
      };
    },
  };
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("EngineRegistry", () => {
  it("registers and retrieves an engine", () => {
    const registry = new EngineRegistry();
    const engine = createMockEngine("slots");
    registry.registerEngine(engine);
    expect(registry.getEngine("slots")).toBe(engine);
  });

  it("is case-insensitive on lookup", () => {
    const registry = new EngineRegistry();
    const engine = createMockEngine("blackjack");
    registry.registerEngine(engine);
    expect(registry.getEngine("BLACKJACK")).toBe(engine);
    expect(registry.getEngine("BlackJack")).toBe(engine);
  });

  it("lists registered engines", () => {
    const registry = new EngineRegistry();
    registry.registerEngine(createMockEngine("slots"));
    registry.registerEngine(createMockEngine("blackjack"));
    const list = registry.listEngines();
    expect(list).toContain("slots");
    expect(list).toContain("blackjack");
    expect(list.length).toBe(2);
  });

  it("throws on duplicate registration", () => {
    const registry = new EngineRegistry();
    registry.registerEngine(createMockEngine("slots"));
    expect(() => registry.registerEngine(createMockEngine("slots"))).toThrow(
      "Engine already registered",
    );
  });

  it("throws on get for nonexistent engine", () => {
    const registry = new EngineRegistry();
    expect(() => registry.getEngine("nonexistent")).toThrow(
      "No engine registered",
    );
  });
});
