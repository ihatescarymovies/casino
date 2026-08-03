import { GameRoundError } from "../../lib/errors";
import type { GameResult } from "../../lib/game-engine";
import { SlotsEngine } from "./index";
export interface SlotsReplayInput {
  clientSeed: string;
  serverSeedHash: string;
  nonce: number;
  betAmount: number;
  gameParams?: Record<string, unknown>;
}
/** Replays the canonical instant slots calculation without wallet/database effects. */
export async function replaySlots(i: SlotsReplayInput): Promise<{
  result: GameResult;
  payout: number;
  gameDetails: Record<string, unknown>;
}> {
  if (!Number.isFinite(i.betAmount) || i.betAmount < 0)
    throw new GameRoundError("Invalid bet amount", 400);
  return (new SlotsEngine() as any).executeGame("replay", {
    roundId: 0,
    gameType: "slots",
    betAmount: i.betAmount,
    clientSeed: i.clientSeed,
    serverSeedHash: i.serverSeedHash,
    nonce: i.nonce,
    state: "in_progress",
    result: "pending",
    payout: 0,
    gameParams: i.gameParams,
  });
}
