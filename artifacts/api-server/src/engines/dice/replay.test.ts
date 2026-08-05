import { describe, expect, it } from "vitest";
import { GameResult } from "../../lib/game-engine";
import { replayDice, type DiceReplayInput } from "./replay";

const goldenInput: DiceReplayInput = {
  clientSeed: "golden-client",
  serverSeedHash: "golden-server-hash",
  nonce: 17,
  betAmount: 100,
  gameParams: { betType: "exact", target: 2 },
};

describe("replayDice", () => {
  it("replays the golden vector with exact dice, result, and payout", () => {
    expect(replayDice(goldenInput)).toEqual({
      result: GameResult.WIN,
      payout: 3000,
      gameDetails: {
        dice: [1, 1],
        sum: 2,
        betType: "exact",
        target: 2,
        multiplier: 30,
        won: true,
      },
    });
  });

  it.each([
    ["client seed", { clientSeed: "tampered-client" }],
    ["server seed hash", { serverSeedHash: "tampered-server-hash" }],
    ["nonce", { nonce: 18 }],
    ["bet parameters", { gameParams: { betType: "exact", target: 12 } }],
  ])("rejects a tampered %s receipt", (_label, tamper) => {
    const tampered = replayDice({ ...goldenInput, ...tamper });
    expect(tampered).not.toEqual(replayDice(goldenInput));
  });
});
