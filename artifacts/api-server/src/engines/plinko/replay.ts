import { createHash } from "node:crypto";
import { GameResult } from "../../lib/game-engine";
import { MULTIPLIERS } from "./index";
export interface PlinkoReplayInput {
  clientSeed: string;
  serverSeedHash: string;
  nonce: number;
  betAmount: number;
  gameParams?: { rows?: number; risk?: string; balls?: number };
}
export function replayPlinko(i: PlinkoReplayInput) {
  const { rows = 16, risk = "medium", balls = 1 } = i.gameParams ?? {};
  if (
    ![8, 12, 16].includes(rows) ||
    !["low", "medium", "high"].includes(risk) ||
    !Number.isInteger(balls) ||
    balls < 1 ||
    balls > 10
  )
    throw new Error("Invalid Plinko parameters");
  const out = [];
  let totalPayout = 0;
  for (let b = 0; b < balls; b++) {
    const h = createHash("sha256")
      .update(`${i.clientSeed}:${i.serverSeedHash}:${i.nonce}:${b}`)
      .digest("hex");
    const path = [];
    let slot = 0;
    for (let x = 0; x < rows; x++) {
      const bit = (parseInt(h[Math.floor(x / 4)], 16) >> (3 - (x % 4))) & 1;
      path.push(bit ? "R" : "L");
      slot += bit;
    }
    const multiplier = MULTIPLIERS[rows][risk][slot];
    const payout = (i.betAmount / balls) * multiplier;
    out.push({ path, landingSlot: slot, multiplier, payout });
    totalPayout += payout;
  }
  return {
    result: totalPayout > 0 ? GameResult.WIN : GameResult.LOSE,
    payout: totalPayout,
    gameDetails: { rows, risk, balls: out, totalPayout },
  };
}
