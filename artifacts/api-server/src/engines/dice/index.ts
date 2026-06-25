import { createHash } from "node:crypto";
import {
  BaseGameEngine,
  GameResult,
  type GameRoundData,
} from "../../lib/game-engine";
import { GameRoundError } from "../../lib/errors";

/* ── Dice probability tables ─────────────────────────────────────────── */

/** Frequency of each sum when rolling 2 six-sided dice (36 total outcomes) */
const SUM_FREQ: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

const TOTAL_OUTCOMES = 36;

/** Fixed payout multipliers for exact-sum bets */
const EXACT_PAYOUT: Record<number, number> = {
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

const DOUBLES_PAYOUT = 5;

/* ── Helpers ────────────────────────────────────────────────────────── */

function seededDice(seed: string, nonce: number): [number, number] {
  const hash = createHash("sha256").update(`${seed}:${nonce}`).digest("hex");
  const die1 = (parseInt(hash.slice(0, 8), 16) % 6) + 1;
  const die2 = (parseInt(hash.slice(8, 16), 16) % 6) + 1;
  return [die1, die2];
}

function waysToExceed(target: number): number {
  let ways = 0;
  for (let sum = target + 1; sum <= 12; sum++) {
    ways += SUM_FREQ[sum] ?? 0;
  }
  return ways;
}

function waysToBeBelow(target: number): number {
  let ways = 0;
  for (let sum = 2; sum < target; sum++) {
    ways += SUM_FREQ[sum] ?? 0;
  }
  return ways;
}

function calculateOverUnderPayout(ways: number, rtp: number): number {
  if (ways <= 0) return 0;
  return (TOTAL_OUTCOMES / ways) * rtp;
}

/* ── Engine ─────────────────────────────────────────────────────────── */

export class DiceEngine extends BaseGameEngine {
  readonly gameType = "dice";
  readonly config = {
    minBet: 1,
    maxBet: 100000,
    rtp: 0.97,
    rules: {
      dice: 2,
      sides: 6,
    },
  };

  async placeBet(params: {
    userId: string;
    betAmount: number;
    clientSeed: string;
    gameParams?: Record<string, unknown>;
  }): Promise<GameRoundData> {
    const gp = params.gameParams ?? {};
    const betType = (gp.betType as string) ?? "over";
    const validBetTypes = ["over", "under", "exact", "doubles"];
    if (!validBetTypes.includes(betType)) {
      throw new GameRoundError(
        `Unknown bet type: ${betType}. Must be one of: ${validBetTypes.join(", ")}`,
        400,
      );
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
    const [die1, die2] = seededDice(seed, round.nonce);
    const sum = die1 + die2;

    const params = (round.gameParams ?? {}) as {
      betType?: string;
      target?: number;
    };
    const betType = params.betType ?? "over";
    const target = params.target ?? 7;

    let won = false;
    let multiplier = 0;

    switch (betType) {
      case "over": {
        if (target < 2 || target > 11) {
          throw new GameRoundError(
            `Over target must be between 2 and 11, got ${target}`,
            400,
          );
        }
        const ways = waysToExceed(target);
        multiplier = calculateOverUnderPayout(ways, this.config.rtp);
        won = sum > target;
        break;
      }
      case "under": {
        if (target < 3 || target > 12) {
          throw new GameRoundError(
            `Under target must be between 3 and 12, got ${target}`,
            400,
          );
        }
        const ways = waysToBeBelow(target);
        multiplier = calculateOverUnderPayout(ways, this.config.rtp);
        won = sum < target;
        break;
      }
      case "exact": {
        if (target < 2 || target > 12) {
          throw new GameRoundError(
            `Exact target must be between 2 and 12, got ${target}`,
            400,
          );
        }
        multiplier = EXACT_PAYOUT[target] ?? 0;
        won = sum === target;
        break;
      }
      case "doubles": {
        multiplier = DOUBLES_PAYOUT;
        won = die1 === die2;
        break;
      }
      default: {
        throw new GameRoundError(
          `Unknown bet type: ${betType}. Must be one of: over, under, exact, doubles`,
          400,
        );
      }
    }

    const payout = won ? round.betAmount * multiplier : 0;

    return {
      result: won ? GameResult.WIN : GameResult.LOSE,
      payout,
      gameDetails: {
        dice: [die1, die2],
        sum,
        betType,
        target: betType === "doubles" ? null : target,
        multiplier,
        won,
      },
    };
  }
}
