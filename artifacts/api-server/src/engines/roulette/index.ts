import { createHash } from "node:crypto";
import {
  BaseGameEngine,
  GameResult,
  type GameRoundData,
} from "../../lib/game-engine";

/* ── European Roulette Wheel ────────────────────────────────────────── */

/** Standard European single-zero wheel order */
export const EUROPEAN_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

/** Red numbers on a European roulette wheel */
export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

/** Black numbers on a European roulette wheel */
export const BLACK_NUMBERS = new Set(
  EUROPEAN_WHEEL.filter((n) => n !== 0 && !RED_NUMBERS.has(n)),
);

/* ── Bet Types & Payouts ────────────────────────────────────────────── */

export type RouletteBetType =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "line"
  | "column"
  | "dozen"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "high"
  | "low";

export interface RouletteBet {
  type: RouletteBetType;
  numbers: number[];
  amount: number;
}

/** Total return multipliers (profit + stake back) for each bet type */
const TOTAL_RETURN_MULTIPLIERS: Record<RouletteBetType, number> = {
  straight: 36, // 35:1 profit + 1 stake
  split: 18, // 17:1 profit + 1 stake
  street: 12, // 11:1 profit + 1 stake
  corner: 9, // 8:1 profit + 1 stake
  line: 6, // 5:1 profit + 1 stake
  column: 3, // 2:1 profit + 1 stake
  dozen: 3, // 2:1 profit + 1 stake
  red: 2, // 1:1 profit + 1 stake
  black: 2, // 1:1 profit + 1 stake
  odd: 2, // 1:1 profit + 1 stake
  even: 2, // 1:1 profit + 1 stake
  high: 2, // 1:1 profit + 1 stake
  low: 2, // 1:1 profit + 1 stake
};

/* ── Deterministic RNG ──────────────────────────────────────────────── */

function generateWinningNumber(clientSeed: string, nonce: number): number {
  const hash = createHash("sha256")
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");
  const rand = parseInt(hash.slice(0, 8), 16);
  return rand % 37;
}

/* ── Bet Evaluation ───────────────────────────────────────────────── */

function evaluateBet(bet: RouletteBet, winningNumber: number): boolean {
  switch (bet.type) {
    case "straight":
      return bet.numbers.includes(winningNumber);

    case "split":
      return bet.numbers.includes(winningNumber);

    case "street":
      return bet.numbers.includes(winningNumber);

    case "corner":
      return bet.numbers.includes(winningNumber);

    case "line":
      return bet.numbers.includes(winningNumber);

    case "column": {
      if (winningNumber === 0) return false;
      // Columns: 1st = 1,4,7... (mod 3 === 1), 2nd = 2,5,8... (mod 3 === 2), 3rd = 3,6,9... (mod 3 === 0)
      const col = winningNumber % 3;
      const targetCol = bet.numbers[0] % 3;
      return col === targetCol;
    }

    case "dozen": {
      if (winningNumber === 0) return false;
      const dozen = winningNumber <= 12 ? 1 : winningNumber <= 24 ? 2 : 3;
      return bet.numbers.includes(dozen);
    }

    case "red":
      return RED_NUMBERS.has(winningNumber);

    case "black":
      return BLACK_NUMBERS.has(winningNumber);

    case "odd":
      return winningNumber !== 0 && winningNumber % 2 === 1;

    case "even":
      return winningNumber !== 0 && winningNumber % 2 === 0;

    case "high":
      return winningNumber >= 19;

    case "low":
      return winningNumber >= 1 && winningNumber <= 18;

    default:
      return false;
  }
}

/* ── Engine ─────────────────────────────────────────────────────────── */

export class RouletteEngine extends BaseGameEngine {
  readonly gameType = "roulette";
  readonly config = {
    minBet: 1,
    maxBet: 100000,
    rtp: 0.973,
    instant: true,
    rules: {
      wheel: "european",
      numbers: 37,
    },
  };

  protected async executeGame(
    _userId: string,
    round: GameRoundData,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails: Record<string, unknown>;
  }> {
    const winningNumber = generateWinningNumber(
      `${round.clientSeed}:${round.serverSeedHash}`,
      round.nonce,
    );

    // Parse bets from gameParams
    const gameParams = round.gameParams as { bets?: RouletteBet[] } | undefined;
    const bets: RouletteBet[] = gameParams?.bets ?? [];

    const betResults: {
      type: RouletteBetType;
      numbers: number[];
      amount: number;
      won: boolean;
      payout: number;
    }[] = [];

    let totalPayout = 0;
    let totalBet = 0;

    for (const bet of bets) {
      totalBet += bet.amount;
      const won = evaluateBet(bet, winningNumber);
      const payout = won ? bet.amount * TOTAL_RETURN_MULTIPLIERS[bet.type] : 0;
      if (won) {
        totalPayout += payout;
      }

      betResults.push({
        type: bet.type,
        numbers: bet.numbers,
        amount: bet.amount,
        won,
        payout,
      });
    }

    return {
      result: totalPayout > 0 ? GameResult.WIN : GameResult.LOSE,
      payout: totalPayout,
      gameDetails: {
        winningNumber,
        betResults,
        totalBet,
        totalPayout,
      },
    };
  }
}
