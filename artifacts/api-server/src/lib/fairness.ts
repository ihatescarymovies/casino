import { createHash } from "node:crypto";

export interface FairnessReceipt {
  game: string;
  roundId: number | string;
  timestamp?: string | null;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  outcome: string;
}

export interface VerificationResult {
  verified: boolean;
  reason: string;
  computedServerSeedHash: string;
  expectedServerSeedHash: string;
}

/** SHA-256 commitment check used by player-facing receipts. */
export function hashServerSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed, "utf8").digest("hex");
}

/**
 * Verify a revealed seed against the commitment published when a round starts.
 * Outcome replay remains game-engine-specific; this deliberately makes no
 * security claim beyond the seed commitment check.
 */
export function verifyReceipt(
  receipt: FairnessReceipt,
  serverSeed: string,
): VerificationResult {
  const computedServerSeedHash = hashServerSeed(serverSeed);
  const expectedServerSeedHash = receipt.serverSeedHash.toLowerCase();
  const verified = computedServerSeedHash === expectedServerSeedHash;
  return {
    verified,
    reason: verified
      ? "The revealed server seed matches the hash committed for this round."
      : "The revealed server seed does not match the committed hash.",
    computedServerSeedHash,
    expectedServerSeedHash,
  };
}
