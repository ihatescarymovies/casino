import { createHash } from "node:crypto";
import { GameRoundError } from "../../lib/errors";
import { GameResult } from "../../lib/game-engine";

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
const seededDice = (seed: string, nonce: number): [number, number] => {
  const hash = createHash("sha256").update(`${seed}:${nonce}`).digest("hex");
  return [
    (parseInt(hash.slice(0, 8), 16) % 6) + 1,
    (parseInt(hash.slice(8, 16), 16) % 6) + 1,
  ];
};
export interface DiceReplayInput {
  clientSeed: string;
  serverSeedHash: string;
  nonce: number;
  betAmount: number;
  gameParams?: { betType?: string; target?: number };
}
export function replayDice(input: DiceReplayInput) {
  const { betType = "over", target = 7 } = input.gameParams ?? {};
  const [die1, die2] = seededDice(
    `${input.clientSeed}:${input.serverSeedHash}`,
    input.nonce,
  );
  const sum = die1 + die2;
  let won = false;
  let multiplier = 0;
  if (betType === "over") {
    if (target < 2 || target > 11)
      throw new GameRoundError(
        `Over target must be between 2 and 11, got ${target}`,
        400,
      );
    const ways = Object.entries(SUM_FREQ)
      .filter(([s]) => Number(s) > target)
      .reduce((n, [, v]) => n + v, 0);
    multiplier = (36 / ways) * 0.97;
    won = sum > target;
  } else if (betType === "under") {
    if (target < 3 || target > 12)
      throw new GameRoundError(
        `Under target must be between 3 and 12, got ${target}`,
        400,
      );
    const ways = Object.entries(SUM_FREQ)
      .filter(([s]) => Number(s) < target)
      .reduce((n, [, v]) => n + v, 0);
    multiplier = (36 / ways) * 0.97;
    won = sum < target;
  } else if (betType === "exact") {
    if (target < 2 || target > 12)
      throw new GameRoundError(
        `Exact target must be between 2 and 12, got ${target}`,
        400,
      );
    multiplier = EXACT_PAYOUT[target] ?? 0;
    won = sum === target;
  } else if (betType === "doubles") {
    multiplier = 5;
    won = die1 === die2;
  } else
    throw new GameRoundError(
      `Unknown bet type: ${betType}. Must be one of: over, under, exact, doubles`,
      400,
    );
  const payout = won ? input.betAmount * multiplier : 0;
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
