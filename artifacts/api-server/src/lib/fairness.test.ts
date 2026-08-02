import { describe, expect, it } from "vitest";
import { hashServerSeed, verifyReceipt } from "./fairness";

describe("fairness receipts", () => {
  const serverSeed = "fixture-server-seed";
  const receipt = {
    game: "dice",
    roundId: 42,
    timestamp: "2026-01-01T00:00:00.000Z",
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: "player-fixture",
    nonce: 7,
    outcome: "win",
  };
  it("accepts a known-good deterministic fixture", () => {
    expect(verifyReceipt(receipt, serverSeed)).toMatchObject({
      verified: true,
      expectedServerSeedHash: receipt.serverSeedHash,
    });
  });
  it("rejects a tampered seed", () => {
    expect(verifyReceipt(receipt, "tampered-seed").verified).toBe(false);
  });
  it("rejects a tampered commitment", () => {
    expect(
      verifyReceipt({ ...receipt, serverSeedHash: "0".repeat(64) }, serverSeed)
        .verified,
    ).toBe(false);
  });
});
