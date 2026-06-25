import { describe, it, expect } from "vitest";
import {
  RouletteEngine,
  EUROPEAN_WHEEL,
  RED_NUMBERS,
  BLACK_NUMBERS,
  type RouletteBet,
} from "./index";
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

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("RouletteEngine", () => {
  const engine = new RouletteEngine();

  it("has correct gameType and config", () => {
    expect(engine.gameType).toBe("roulette");
    expect(engine.config.minBet).toBe(1);
    expect(engine.config.maxBet).toBe(100000);
    expect(engine.config.rtp).toBe(0.973);
    expect(engine.config.rules).toMatchObject({
      wheel: "european",
      numbers: 37,
    });
  });

  it("European wheel has 37 numbers", () => {
    expect(EUROPEAN_WHEEL).toHaveLength(37);
    expect(new Set(EUROPEAN_WHEEL).size).toBe(37);
    expect(EUROPEAN_WHEEL[0]).toBe(0);
  });

  it("red and black sets partition non-zero numbers", () => {
    expect(RED_NUMBERS.size).toBe(18);
    expect(BLACK_NUMBERS.size).toBe(18);
    for (const n of RED_NUMBERS) {
      expect(BLACK_NUMBERS.has(n)).toBe(false);
      expect(n).not.toBe(0);
    }
    for (const n of BLACK_NUMBERS) {
      expect(RED_NUMBERS.has(n)).toBe(false);
      expect(n).not.toBe(0);
    }
  });

  it("produces deterministic results for same seed+nonce", async () => {
    const bets: RouletteBet[] = [{ type: "red", numbers: [], amount: 100 }];
    const round = createRound({}, bets);
    const result1 = await (engine as any).executeGame("user1", round);
    const result2 = await (engine as any).executeGame("user1", round);

    expect(result1.result).toBe(result2.result);
    expect(result1.payout).toBe(result2.payout);
    expect(result1.gameDetails.winningNumber).toBe(
      result2.gameDetails.winningNumber,
    );
  });

  it("produces different winning numbers for different nonces", async () => {
    const bets: RouletteBet[] = [{ type: "red", numbers: [], amount: 100 }];
    const round1 = createRound({ nonce: 0 }, bets);
    const round2 = createRound({ nonce: 1 }, bets);

    const result1 = await (engine as any).executeGame("user1", round1);
    const result2 = await (engine as any).executeGame("user1", round2);

    expect(result1.gameDetails.winningNumber).not.toBe(
      result2.gameDetails.winningNumber,
    );
  });

  /* ── Individual Bet Type Tests ───────────────────────────────────── */

  it("straight bet wins when number matches", async () => {
    // Force winning number = 17 by finding a seed that produces it
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "straight", numbers: [17], amount: 50 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.winningNumber === 17) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(50 * 36); // 35:1 profit + stake
        expect(result.gameDetails.betResults[0].won).toBe(true);
        expect(result.gameDetails.betResults[0].payout).toBe(1800);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("straight bet loses when number does not match", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "straight", numbers: [17], amount: 50 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.winningNumber !== 17) {
        found = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
        expect(result.gameDetails.betResults[0].won).toBe(false);
        expect(result.gameDetails.betResults[0].payout).toBe(0);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("split bet wins when either number matches", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "split", numbers: [17, 20], amount: 40 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.winningNumber === 17) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(40 * 18); // 17:1 profit + stake
        break;
      }
      if (result.gameDetails.winningNumber === 20) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(40 * 18);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("street bet wins when any of 3 numbers match", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "street", numbers: [1, 2, 3], amount: 30 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if ([1, 2, 3].includes(result.gameDetails.winningNumber)) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(30 * 12); // 11:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("corner bet wins when any of 4 numbers match", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "corner", numbers: [1, 2, 4, 5], amount: 20 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if ([1, 2, 4, 5].includes(result.gameDetails.winningNumber)) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(20 * 9); // 8:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("line bet wins when any of 6 numbers match", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "line", numbers: [1, 2, 3, 4, 5, 6], amount: 10 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if ([1, 2, 3, 4, 5, 6].includes(result.gameDetails.winningNumber)) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(10 * 6); // 5:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("column bet wins for correct column", async () => {
    // Column 1: numbers 1,4,7,10,13,16,19,22,25,28,31,34 (mod 3 === 1)
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "column", numbers: [1], amount: 25 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn !== 0 && wn % 3 === 1) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(25 * 3); // 2:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("column bet loses for 0", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "column", numbers: [1], amount: 25 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.winningNumber === 0) {
        found = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("dozen bet wins for correct dozen", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "dozen", numbers: [1], amount: 30 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn >= 1 && wn <= 12) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(30 * 3); // 2:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("dozen bet loses for 0", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "dozen", numbers: [1], amount: 30 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.winningNumber === 0) {
        found = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("red bet wins on red numbers", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "red", numbers: [], amount: 100 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (RED_NUMBERS.has(result.gameDetails.winningNumber)) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(100 * 2); // 1:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("red bet loses on black and 0", async () => {
    let foundBlack = false;
    let foundZero = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "red", numbers: [], amount: 100 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (BLACK_NUMBERS.has(wn) && !foundBlack) {
        foundBlack = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
      }
      if (wn === 0 && !foundZero) {
        foundZero = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
      }
      if (foundBlack && foundZero) break;
    }
    expect(foundBlack).toBe(true);
    expect(foundZero).toBe(true);
  });

  it("black bet wins on black numbers", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "black", numbers: [], amount: 100 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (BLACK_NUMBERS.has(result.gameDetails.winningNumber)) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(100 * 2); // 1:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("odd bet wins on odd numbers (not 0)", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "odd", numbers: [], amount: 50 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn !== 0 && wn % 2 === 1) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(50 * 2); // 1:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("odd bet loses on even and 0", async () => {
    let foundEven = false;
    let foundZero = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "odd", numbers: [], amount: 50 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn !== 0 && wn % 2 === 0 && !foundEven) {
        foundEven = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
      }
      if (wn === 0 && !foundZero) {
        foundZero = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
      }
      if (foundEven && foundZero) break;
    }
    expect(foundEven).toBe(true);
    expect(foundZero).toBe(true);
  });

  it("even bet wins on even numbers (not 0)", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "even", numbers: [], amount: 50 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn !== 0 && wn % 2 === 0) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(50 * 2); // 1:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("high bet wins on 19-36", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "high", numbers: [], amount: 75 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn >= 19) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(75 * 2); // 1:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("high bet loses on 0-18", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "high", numbers: [], amount: 75 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn >= 0 && wn <= 18) {
        found = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("low bet wins on 1-18", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "low", numbers: [], amount: 60 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn >= 1 && wn <= 18) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(60 * 2); // 1:1 profit + stake
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("low bet loses on 0 and 19-36", async () => {
    let foundZero = false;
    let foundHigh = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [{ type: "low", numbers: [], amount: 60 }];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn === 0 && !foundZero) {
        foundZero = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
      }
      if (wn >= 19 && !foundHigh) {
        foundHigh = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
      }
      if (foundZero && foundHigh) break;
    }
    expect(foundZero).toBe(true);
    expect(foundHigh).toBe(true);
  });

  /* ── Multiple Bets ───────────────────────────────────────────────── */

  it("multiple bets: one wins, one loses", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "straight", numbers: [17], amount: 10 },
        { type: "red", numbers: [], amount: 20 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      // Find a case where 17 wins (straight) but red loses (17 is red, so this won't happen)
      // Instead find where straight loses but red wins
      if (wn !== 17 && RED_NUMBERS.has(wn)) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(20 * 2); // only red wins
        expect(result.gameDetails.betResults[0].won).toBe(false);
        expect(result.gameDetails.betResults[1].won).toBe(true);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("multiple bets: both win", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "straight", numbers: [17], amount: 10 },
        { type: "odd", numbers: [], amount: 20 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.winningNumber === 17) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(10 * 36 + 20 * 2); // both win
        expect(result.gameDetails.betResults[0].won).toBe(true);
        expect(result.gameDetails.betResults[1].won).toBe(true);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("multiple bets: all lose", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "straight", numbers: [17], amount: 10 },
        { type: "black", numbers: [], amount: 20 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      const wn = result.gameDetails.winningNumber;
      if (wn !== 17 && !BLACK_NUMBERS.has(wn)) {
        // wn is not 17 and not black => must be red or 0
        found = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
        expect(result.gameDetails.betResults[0].won).toBe(false);
        expect(result.gameDetails.betResults[1].won).toBe(false);
        break;
      }
    }
    expect(found).toBe(true);
  });

  /* ── Game Details Shape ──────────────────────────────────────────── */

  it("returns correct gameDetails shape", async () => {
    const bets: RouletteBet[] = [{ type: "red", numbers: [], amount: 100 }];
    const round = createRound({}, bets);
    const result = await (engine as any).executeGame("user1", round);

    expect(result.gameDetails).toHaveProperty("winningNumber");
    expect(result.gameDetails).toHaveProperty("betResults");
    expect(result.gameDetails).toHaveProperty("totalBet");
    expect(result.gameDetails).toHaveProperty("totalPayout");

    expect(typeof result.gameDetails.winningNumber).toBe("number");
    expect(result.gameDetails.winningNumber).toBeGreaterThanOrEqual(0);
    expect(result.gameDetails.winningNumber).toBeLessThanOrEqual(36);

    expect(Array.isArray(result.gameDetails.betResults)).toBe(true);
    expect(result.gameDetails.betResults).toHaveLength(1);

    const betResult = result.gameDetails.betResults[0];
    expect(betResult).toHaveProperty("type");
    expect(betResult).toHaveProperty("numbers");
    expect(betResult).toHaveProperty("amount");
    expect(betResult).toHaveProperty("won");
    expect(betResult).toHaveProperty("payout");

    expect(result.gameDetails.totalBet).toBe(100);
    expect(result.gameDetails.totalPayout).toBe(result.payout);
  });

  /* ── House Edge / RTP ───────────────────────────────────────────── */

  it("straight bet RTP is approximately 97.3% over many spins", async () => {
    const betAmount = 10;
    const spins = 20000;
    let totalBet = 0;
    let totalPayout = 0;

    for (let nonce = 0; nonce < spins; nonce++) {
      const bets: RouletteBet[] = [
        { type: "straight", numbers: [17], amount: betAmount },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      totalBet += betAmount;
      totalPayout += result.payout;
    }

    const rtp = totalPayout / totalBet;
    // European roulette RTP = 36/37 ≈ 0.973 for all bets
    // Straight bet has high variance; allow ±3% tolerance
    expect(rtp).toBeGreaterThan(0.94);
    expect(rtp).toBeLessThan(1.0);
  });

  it("even-money bet RTP is approximately 97.3% over many spins", async () => {
    const betAmount = 10;
    const spins = 5000;
    let totalBet = 0;
    let totalPayout = 0;

    for (let nonce = 0; nonce < spins; nonce++) {
      const bets: RouletteBet[] = [
        { type: "red", numbers: [], amount: betAmount },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      totalBet += betAmount;
      totalPayout += result.payout;
    }

    const rtp = totalPayout / totalBet;
    expect(rtp).toBeGreaterThan(0.95);
    expect(rtp).toBeLessThan(0.99);
  });

  /* ── Edge Cases ──────────────────────────────────────────────────── */

  it("empty bets array returns LOSE with zero payout", async () => {
    const round = createRound({}, []);
    const result = await (engine as any).executeGame("user1", round);

    expect(result.result).toBe(GameResult.LOSE);
    expect(result.payout).toBe(0);
    expect(result.gameDetails.betResults).toHaveLength(0);
    expect(result.gameDetails.totalBet).toBe(0);
    expect(result.gameDetails.totalPayout).toBe(0);
  });

  it("0 loses all outside bets", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "red", numbers: [], amount: 10 },
        { type: "black", numbers: [], amount: 10 },
        { type: "odd", numbers: [], amount: 10 },
        { type: "even", numbers: [], amount: 10 },
        { type: "high", numbers: [], amount: 10 },
        { type: "low", numbers: [], amount: 10 },
        { type: "column", numbers: [1], amount: 10 },
        { type: "dozen", numbers: [1], amount: 10 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.winningNumber === 0) {
        found = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
        for (const br of result.gameDetails.betResults) {
          expect(br.won).toBe(false);
          expect(br.payout).toBe(0);
        }
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("0 can win a straight bet on 0", async () => {
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const bets: RouletteBet[] = [
        { type: "straight", numbers: [0], amount: 50 },
      ];
      const round = createRound({ nonce }, bets);
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.winningNumber === 0) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(50 * 36);
        expect(result.gameDetails.betResults[0].won).toBe(true);
        break;
      }
    }
    expect(found).toBe(true);
  });
});
