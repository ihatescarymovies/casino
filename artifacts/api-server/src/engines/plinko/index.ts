import { createHash } from "node:crypto";
import {
  BaseGameEngine,
  GameResult,
  type GameRoundData,
} from "../../lib/game-engine";
import { GameRoundError } from "../../lib/errors";

/* ── Multiplier tables ──────────────────────────────────────────────── */

/**
 * Symmetric multiplier tables for each row count and risk level.
 * Array length = rows + 1. Index = landing slot (0 = all left, rows = all right).
 * Higher multipliers at edges (low probability), lower in center.
 */
export const MULTIPLIERS: Record<number, Record<string, number[]>> = {
  8: {
    low: [5.5, 2.0, 0.8, 0.3, 0.2, 0.3, 0.8, 2.0, 5.5],
    medium: [13, 4, 2, 1, 0.4, 1, 2, 4, 13],
    high: [29, 8, 3, 1, 0.2, 1, 3, 8, 29],
  },
  12: {
    low: [33, 12, 6, 3.5, 2, 1.2, 0.6, 1.2, 2, 3.5, 6, 12, 33],
    medium: [43, 15, 8, 4, 2.2, 1.2, 0.6, 1.2, 2.2, 4, 8, 15, 43],
    high: [170, 35, 15, 7, 3.5, 1.5, 0.6, 1.5, 3.5, 7, 15, 35, 170],
  },
  16: {
    low: [
      55, 14, 7, 4, 2.5, 1.5, 1.0, 0.5, 0.51, 0.5, 1.0, 1.5, 2.5, 4, 7, 14, 55,
    ],
    medium: [
      150, 40, 15, 5, 3, 1.5, 0.8, 0.5, 0.3, 0.5, 0.8, 1.5, 3, 5, 15, 40, 150,
    ],
    high: [
      1000, 80, 25, 8, 3, 1.2, 0.6, 0.4, 0.25, 0.4, 0.6, 1.2, 3, 8, 25, 80,
      1000,
    ],
  },
};

const VALID_ROWS = [8, 12, 16] as const;
const VALID_RISKS = ["low", "medium", "high"] as const;
const MAX_BALLS = 10;

/* ── Helpers ────────────────────────────────────────────────────────── */

/**
 * Generate a deterministic ball path from the hash chain seed.
 * Each bit in the hash determines left (0) or right (1) at each peg row.
 * Landing slot = count of right deflections.
 */
export function generateBallPath(
  seed: string,
  nonce: number,
  ballIndex: number,
  rows: number,
): { path: ("L" | "R")[]; landingSlot: number } {
  const hash = createHash("sha256")
    .update(`${seed}:${nonce}:${ballIndex}`)
    .digest("hex");

  const path: ("L" | "R")[] = [];
  let rightCount = 0;

  for (let i = 0; i < rows; i++) {
    const hexCharIndex = Math.floor(i / 4);
    const bitIndex = 3 - (i % 4); // MSB first within each hex char

    const hexValue = parseInt(hash[hexCharIndex], 16);
    const bit = (hexValue >> bitIndex) & 1;

    if (bit === 1) {
      path.push("R");
      rightCount++;
    } else {
      path.push("L");
    }
  }

  return { path, landingSlot: rightCount };
}

export function getMultiplier(
  rows: number,
  risk: string,
  slot: number,
): number {
  const table = MULTIPLIERS[rows]?.[risk];
  if (!table) {
    throw new GameRoundError(
      `No multiplier table for rows=${rows} risk=${risk}`,
    );
  }
  if (slot < 0 || slot >= table.length) {
    throw new GameRoundError(
      `Invalid landing slot ${slot} for ${rows} rows (max ${table.length - 1})`,
    );
  }
  return table[slot];
}

/* ── Engine ─────────────────────────────────────────────────────────── */

export class PlinkoEngine extends BaseGameEngine {
  readonly gameType = "plinko";
  readonly config = {
    minBet: 1,
    maxBet: 100000,
    rtp: 0.96,
    rules: {
      rows: [8, 12, 16],
      risks: ["low", "medium", "high"],
    },
  };

  async placeBet(params: {
    userId: string;
    betAmount: number;
    clientSeed: string;
    gameParams?: Record<string, unknown>;
  }): Promise<GameRoundData> {
    const gp = params.gameParams ?? {};
    if (gp.rows !== undefined) {
      const rows = gp.rows as number;
      if (!(VALID_ROWS as readonly number[]).includes(rows)) {
        throw new GameRoundError(
          `Invalid rows: ${rows}. Must be one of: ${VALID_ROWS.join(", ")}`,
          400,
        );
      }
    }
    if (gp.risk !== undefined) {
      const risk = gp.risk as string;
      if (!(VALID_RISKS as readonly string[]).includes(risk)) {
        throw new GameRoundError(
          `Invalid risk: ${risk}. Must be one of: ${VALID_RISKS.join(", ")}`,
          400,
        );
      }
    }
    return super.placeBet(params);
  }

  protected async executeGame(
    _userId: string,
    round: GameRoundData,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails: Record<string, unknown>;
  }> {
    const seed = `${round.clientSeed}:${round.serverSeedHash}`;

    const params = (round.gameParams ?? {}) as {
      rows?: number;
      risk?: string;
      balls?: number;
    };

    const rows = params.rows ?? 16;
    const risk = params.risk ?? "medium";
    const balls = params.balls ?? 1;

    // Validate params
    if (!VALID_ROWS.includes(rows as (typeof VALID_ROWS)[number])) {
      throw new GameRoundError(
        `Invalid rows: ${rows}. Must be one of: ${VALID_ROWS.join(", ")}`,
        400,
      );
    }
    if (!VALID_RISKS.includes(risk as (typeof VALID_RISKS)[number])) {
      throw new GameRoundError(
        `Invalid risk: ${risk}. Must be one of: ${VALID_RISKS.join(", ")}`,
        400,
      );
    }
    if (!Number.isInteger(balls) || balls < 1 || balls > MAX_BALLS) {
      throw new GameRoundError(
        `Invalid balls: ${balls}. Must be an integer between 1 and ${MAX_BALLS}`,
        400,
      );
    }

    const betPerBall = round.betAmount / balls;

    const ballResults: Array<{
      path: ("L" | "R")[];
      landingSlot: number;
      multiplier: number;
      payout: number;
    }> = [];

    let totalPayout = 0;

    for (let ballIndex = 0; ballIndex < balls; ballIndex++) {
      const { path, landingSlot } = generateBallPath(
        seed,
        round.nonce,
        ballIndex,
        rows,
      );
      const multiplier = getMultiplier(rows, risk, landingSlot);
      const payout = betPerBall * multiplier;

      ballResults.push({
        path,
        landingSlot,
        multiplier,
        payout,
      });

      totalPayout += payout;
    }

    return {
      result: totalPayout > 0 ? GameResult.WIN : GameResult.LOSE,
      payout: totalPayout,
      gameDetails: {
        rows,
        risk,
        balls: ballResults,
        totalPayout,
      },
    };
  }
}
