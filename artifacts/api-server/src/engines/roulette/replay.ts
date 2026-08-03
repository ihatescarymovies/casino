import { createHash } from "node:crypto";
import { GameResult } from "../../lib/game-engine";
import type { RouletteBet, RouletteBetType } from "./index";
export interface RouletteReplayInput {
  clientSeed: string;
  serverSeedHash: string;
  nonce: number;
  betAmount: number;
  gameParams?: { bets?: RouletteBet[] };
}
const returns: Record<RouletteBetType, number> = {
  straight: 36,
  split: 18,
  street: 12,
  corner: 9,
  line: 6,
  column: 3,
  dozen: 3,
  red: 2,
  black: 2,
  odd: 2,
  even: 2,
  high: 2,
  low: 2,
};
const red = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const black = new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);
function win(b: RouletteBet, n: number) {
  switch (b.type) {
    case "straight":
    case "split":
    case "street":
    case "corner":
    case "line":
      return b.numbers.includes(n);
    case "column":
      return n !== 0 && n % 3 === b.numbers[0] % 3;
    case "dozen":
      return n !== 0 && b.numbers.includes(n <= 12 ? 1 : n <= 24 ? 2 : 3);
    case "red":
      return red.has(n);
    case "black":
      return black.has(n);
    case "odd":
      return n !== 0 && n % 2 === 1;
    case "even":
      return n !== 0 && n % 2 === 0;
    case "high":
      return n >= 19;
    case "low":
      return n >= 1 && n <= 18;
  }
}
export function replayRoulette(i: RouletteReplayInput) {
  const h = createHash("sha256")
    .update(`${i.clientSeed}:${i.serverSeedHash}:${i.nonce}`)
    .digest("hex");
  const n = parseInt(h.slice(0, 8), 16) % 37;
  const bets = i.gameParams?.bets ?? [];
  let totalPayout = 0,
    totalBet = 0;
  const betResults = bets.map((b) => {
    totalBet += b.amount;
    const won = win(b, n);
    const payout = won ? b.amount * returns[b.type] : 0;
    totalPayout += payout;
    return { ...b, won, payout };
  });
  return {
    result: totalPayout > 0 ? GameResult.WIN : GameResult.LOSE,
    payout: totalPayout,
    gameDetails: { winningNumber: n, betResults, totalBet, totalPayout },
  };
}
