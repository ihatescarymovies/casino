import { createHash, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import { eq } from "drizzle-orm";
import { HashChainError } from "./errors";

/** Default number of hashes to pre-generate per chain. */
export const DEFAULT_CHAIN_SIZE = 1_000_000;

/** Rotation triggers when remaining drops below this fraction. */
export const ROTATION_THRESHOLD = 0.1;

export interface HashResult {
  serverSeed: string;
  serverSeedHash: string;
  nonce: number;
}

export interface ChainStatus {
  chainId: string;
  gameType: string;
  total: number;
  remaining: number;
  percentage: number;
}

export interface VerificationResult {
  verified: boolean;
  computedHash: string;
  expectedHash: string;
}

/** Compute SHA-256 hex digest of a UTF-8 string. */
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Generate a seed string in the required format. */
function generateSeed(
  gameType: string,
  chainId: string,
  index: number,
): string {
  const random = randomBytes(32).toString("hex");
  return `${gameType}:${chainId}:${index}:${random}`;
}

/** Parse a seed string into its components. */
function parseSeedInfo(serverSeed: string): {
  gameType: string;
  chainId: string;
  index: number;
} {
  const parts = serverSeed.split(":");
  if (parts.length !== 4) {
    throw new HashChainError("Invalid seed format");
  }
  return {
    gameType: parts[0],
    chainId: parts[1],
    index: parseInt(parts[2], 10),
  };
}

/** Filter rows by gameType by parsing the embedded seed format. */
function filterByGameType(
  rows: Array<typeof schema.hashChainsTable.$inferSelect>,
  gameType: string,
) {
  return rows.filter((row) => {
    try {
      const info = parseSeedInfo(row.serverSeed);
      return info.gameType === gameType;
    } catch {
      return false;
    }
  });
}

/**
 * Generate a new hash chain for the given game type.
 *
 * Each link in the chain is an independent seed and its SHA-256 hash.
 * `previousHash` links each entry to the previous one so the full chain
 * can be walked backwards for verification.
 *
 * @param gameType   e.g. "slots", "blackjack"
 * @param count      number of hashes to generate (default 1_000_000)
 * @param previousHash optional hash to link as the predecessor of the first seed
 */
export async function generateChain(
  gameType: string,
  count = DEFAULT_CHAIN_SIZE,
  previousHash: string | null = null,
): Promise<{ chainId: string; total: number }> {
  const chainId = randomBytes(16).toString("hex");
  const links: Array<{
    serverSeed: string;
    serverSeedHash: string;
    previousHash: string | null;
    isActive: boolean;
  }> = [];

  let prevHash = previousHash;

  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 50_000 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
    const serverSeed = generateSeed(gameType, chainId, i);
    const serverSeedHash = sha256(serverSeed);

    links.push({
      serverSeed,
      serverSeedHash,
      previousHash: prevHash,
      isActive: true,
    });

    prevHash = serverSeedHash;
  }

  await db.insert(schema.hashChainsTable).values(links);

  return { chainId, total: count };
}

/** Internal: pop the next available hash for a game type. */
async function popHash(gameType: string): Promise<HashResult> {
  const rows = await db
    .select()
    .from(schema.hashChainsTable)
    .where(eq(schema.hashChainsTable.isActive, true));

  const gameTypeRows = filterByGameType(rows, gameType);

  if (gameTypeRows.length === 0) {
    throw new HashChainError("No active hashes available for game type");
  }

  let highestRow = gameTypeRows[0];
  let highestIndex = parseSeedInfo(highestRow.serverSeed).index;

  for (const row of gameTypeRows) {
    const info = parseSeedInfo(row.serverSeed);
    if (info.index > highestIndex) {
      highestIndex = info.index;
      highestRow = row;
    }
  }

  await db
    .update(schema.hashChainsTable)
    .set({ isActive: false })
    .where(eq(schema.hashChainsTable.id, highestRow.id));

  return {
    serverSeed: highestRow.serverSeed,
    serverSeedHash: highestRow.serverSeedHash,
    nonce: highestIndex,
  };
}

/**
 * Get the next hash from the active chain.
 *
 * Auto-generates a chain on first use and auto-rotates when the
 * remaining supply drops below the rotation threshold.
 */
export async function getNextHash(gameType: string): Promise<HashResult> {
  try {
    await getChainStatus(gameType);
  } catch (err) {
    if (
      err instanceof HashChainError &&
      err.message.includes("No chain found")
    ) {
      await generateChain(gameType);
    } else {
      throw err;
    }
  }

  const result = await popHash(gameType);

  try {
    const status = await getChainStatus(gameType);
    if (status.percentage < ROTATION_THRESHOLD) {
      await rotateChain(gameType);
    }
  } catch {
    /* rotation race condition — safe to ignore */
  }

  return result;
}

/**
 * Verify that a revealed server seed matches its previously published hash.
 *
 * @param serverSeed The revealed seed string
 */
export async function verifyRound(
  serverSeed: string,
): Promise<VerificationResult> {
  const computedHash = sha256(serverSeed);

  const rows = await db
    .select()
    .from(schema.hashChainsTable)
    .where(eq(schema.hashChainsTable.serverSeed, serverSeed));

  if (rows.length === 0) {
    return { verified: false, computedHash, expectedHash: "" };
  }

  const expectedHash = rows[0].serverSeedHash;

  return {
    verified: computedHash === expectedHash,
    computedHash,
    expectedHash,
  };
}

/**
 * Get the current status of a game type's hash chain.
 */
export async function getChainStatus(gameType: string): Promise<ChainStatus> {
  const rows = await db.select().from(schema.hashChainsTable);

  const gameTypeRows = filterByGameType(rows, gameType);

  if (gameTypeRows.length === 0) {
    throw new HashChainError("No chain found for game type");
  }

  const total = gameTypeRows.length;
  const remaining = gameTypeRows.filter((r) => r.isActive).length;
  const activeRows = gameTypeRows.filter((r) => r.isActive);
  const chainId = parseSeedInfo(
    activeRows.length > 0
      ? activeRows[0].serverSeed
      : gameTypeRows[0].serverSeed,
  ).chainId;

  return {
    chainId,
    gameType,
    total,
    remaining,
    percentage: total > 0 ? remaining / total : 0,
  };
}

/**
 * Rotate the hash chain for a game type.
 *
 * Deactivates the old chain and generates a new one linked to the
 * previous chain's final hash. Only rotates when remaining supply
 * is below the threshold.
 */
export async function rotateChain(
  gameType: string,
): Promise<{ chainId: string; total: number }> {
  const status = await getChainStatus(gameType);

  if (status.percentage >= ROTATION_THRESHOLD) {
    throw new HashChainError("Chain does not need rotation");
  }

  // Find the last hash of the old chain (highest index).
  const oldRows = await db
    .select()
    .from(schema.hashChainsTable)
    .where(eq(schema.hashChainsTable.isActive, true));

  const oldGameTypeRows = filterByGameType(oldRows, gameType);

  let lastHash: string | null = null;
  let maxIndex = -1;
  for (const row of oldGameTypeRows) {
    const info = parseSeedInfo(row.serverSeed);
    if (info.index > maxIndex) {
      maxIndex = info.index;
      lastHash = row.serverSeedHash;
    }
  }

  // Deactivate old chain rows.
  for (const row of oldGameTypeRows) {
    await db
      .update(schema.hashChainsTable)
      .set({ isActive: false })
      .where(eq(schema.hashChainsTable.id, row.id));
  }

  // Generate new chain linked to the old chain's last hash.
  const newChain = await generateChain(gameType, DEFAULT_CHAIN_SIZE, lastHash);

  return newChain;
}
