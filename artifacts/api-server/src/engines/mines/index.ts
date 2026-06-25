import { createHash } from "node:crypto";
import {
  BaseGameEngine,
  GameResult,
  GameState,
  type GameRoundData,
} from "../../lib/game-engine";
import { GameRoundError } from "../../lib/errors";
import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import { eq } from "drizzle-orm";
import * as wallet from "../../lib/wallet";
import { sseManager } from "../../lib/sse";
import { logger } from "../../lib/logger";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface MinesGameDetails {
  mineCount: number;
  gridSize: number;
  totalTiles: number;
  safeTiles: number;
  currentMultiplier: number;
  revealedTiles: Array<{ tile: number; isMine: boolean }>;
  minesNotRevealed: boolean;
}

interface ActiveMinesRound {
  roundId: number;
  userId: string;
  betAmount: number;
  minePositions: Set<number>;
  revealedTiles: Set<number>;
  state: GameState;
  serverSeedHash: string;
  nonce: number;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function deterministicRng(
  serverSeedHash: string,
  nonce: number,
  position: number,
): number {
  const hash = createHash("sha256")
    .update(`${serverSeedHash}:${nonce}:mines:${position}`)
    .digest("hex");
  const intValue = parseInt(hash.slice(0, 8), 16);
  return intValue / 0xffffffff;
}

function placeMines(
  gridSize: number,
  mineCount: number,
  serverSeedHash: string,
  nonce: number,
): Set<number> {
  const totalTiles = gridSize * gridSize;
  const tiles = Array.from({ length: totalTiles }, (_, i) => i);

  // Fisher-Yates shuffle seeded by hash chain
  for (let i = tiles.length - 1; i > 0; i--) {
    const rand = deterministicRng(serverSeedHash, nonce, i);
    const j = Math.floor(rand * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  return new Set(tiles.slice(0, mineCount));
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - i + 1)) / i;
  }
  return result;
}

function calculateMultiplier(
  revealedSafeCount: number,
  totalTiles: number,
  mineCount: number,
  rtp: number,
): number {
  const safeTiles = totalTiles - mineCount;
  const prob =
    combination(safeTiles, revealedSafeCount) /
    combination(totalTiles, revealedSafeCount);
  return rtp / prob;
}

/* ── Engine ─────────────────────────────────────────────────────────── */

export class MinesEngine extends BaseGameEngine {
  readonly gameType = "mines";
  readonly config = {
    minBet: 1,
    maxBet: 100000,
    rtp: 0.97,
    rules: {
      gridSize: 5,
      maxMines: 24,
      minMines: 1,
    },
  };

  private activeRounds = new Map<number, ActiveMinesRound>();

  async placeBet(params: {
    userId: string;
    betAmount: number;
    clientSeed: string;
    gameParams?: Record<string, unknown>;
  }): Promise<GameRoundData> {
    const roundData = await super.placeBet(params);

    const gp = params.gameParams ?? {};
    const mineCount = (gp.mineCount as number) ?? 5;
    const minMines = this.config.rules.minMines as number;
    const maxMines = this.config.rules.maxMines as number;
    if (mineCount < minMines || mineCount > maxMines) {
      throw new GameRoundError(
        `Mine count must be between ${minMines} and ${maxMines}, got ${mineCount}`,
        400,
      );
    }

    const gridSize = this.config.rules.gridSize as number;
    const totalTiles = gridSize * gridSize;
    const minePositions = placeMines(
      gridSize,
      mineCount,
      roundData.serverSeedHash,
      roundData.nonce,
    );

    this.activeRounds.set(roundData.roundId, {
      roundId: roundData.roundId,
      userId: params.userId,
      betAmount: params.betAmount,
      minePositions,
      revealedTiles: new Set(),
      state: GameState.IN_PROGRESS,
      serverSeedHash: roundData.serverSeedHash,
      nonce: roundData.nonce,
    });

    const gameDetails: MinesGameDetails = {
      mineCount,
      gridSize,
      totalTiles,
      safeTiles: totalTiles - mineCount,
      currentMultiplier: 1.0,
      revealedTiles: [],
      minesNotRevealed: true,
    };

    await db
      .update(schema.gameRoundsTable)
      .set({
        details: gameDetails as unknown as Record<string, unknown>,
      })
      .where(eq(schema.gameRoundsTable.id, roundData.roundId));

    return roundData;
  }

  protected async executeGame(
    _userId: string,
    round: GameRoundData,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails: Record<string, unknown>;
  }> {
    const params = (round.gameParams ?? {}) as { mineCount?: number };
    const mineCount = params.mineCount ?? 5;

    // Validate mine count
    const minMines = this.config.rules.minMines as number;
    const maxMines = this.config.rules.maxMines as number;
    if (mineCount < minMines || mineCount > maxMines) {
      throw new GameRoundError(
        `Mine count must be between ${minMines} and ${maxMines}, got ${mineCount}`,
        400,
      );
    }

    const gridSize = this.config.rules.gridSize as number;
    const totalTiles = gridSize * gridSize;

    // Place mines deterministically
    const minePositions = placeMines(
      gridSize,
      mineCount,
      round.serverSeedHash,
      round.nonce,
    );

    // Store active round
    this.activeRounds.set(round.roundId, {
      roundId: round.roundId,
      userId: _userId,
      betAmount: round.betAmount,
      minePositions,
      revealedTiles: new Set(),
      state: GameState.IN_PROGRESS,
      serverSeedHash: round.serverSeedHash,
      nonce: round.nonce,
    });

    return {
      result: GameResult.PENDING,
      payout: 0,
      gameDetails: {
        mineCount,
        gridSize,
        totalTiles,
        safeTiles: totalTiles - mineCount,
        currentMultiplier: 1.0,
        revealedTiles: [],
        minesNotRevealed: true,
      },
    };
  }

  async handleAction(
    roundId: number,
    action: string,
    params?: Record<string, unknown>,
  ): Promise<{
    result: GameResult;
    payout: number;
    multiplier?: number;
    gameDetails: Record<string, unknown>;
  }> {
    const activeRound = this.activeRounds.get(roundId);
    if (!activeRound) {
      throw new GameRoundError(
        `Round ${roundId} not found or already resolved`,
        404,
      );
    }

    if (activeRound.state !== GameState.IN_PROGRESS) {
      throw new GameRoundError(`Round ${roundId} is not in progress`, 409);
    }

    const [round] = await db
      .select()
      .from(schema.gameRoundsTable)
      .where(eq(schema.gameRoundsTable.id, roundId));

    if (!round) {
      throw new GameRoundError(`Round ${roundId} not found in database`, 404);
    }

    if (round.result !== GameResult.PENDING) {
      throw new GameRoundError(
        `Round ${roundId} already resolved (${round.result})`,
        409,
      );
    }

    const gridSize = this.config.rules.gridSize as number;
    const totalTiles = gridSize * gridSize;

    if (action === "reveal") {
      const tile = params?.tile as number | undefined;
      if (tile === undefined || tile < 0 || tile >= totalTiles) {
        throw new GameRoundError(
          `Tile must be between 0 and ${totalTiles - 1}, got ${tile}`,
          400,
        );
      }

      if (activeRound.revealedTiles.has(tile)) {
        throw new GameRoundError(`Tile ${tile} already revealed`, 409);
      }

      activeRound.revealedTiles.add(tile);
      const isMine = activeRound.minePositions.has(tile);

      const revealedSafeCount = Array.from(activeRound.revealedTiles).filter(
        (t) => !activeRound.minePositions.has(t),
      ).length;

      const currentMultiplier = calculateMultiplier(
        revealedSafeCount,
        totalTiles,
        activeRound.minePositions.size,
        this.config.rtp,
      );

      if (isMine) {
        // Hit a mine — LOSE
        activeRound.state = GameState.RESOLVED;

        const gameDetails: MinesGameDetails = {
          mineCount: activeRound.minePositions.size,
          gridSize,
          totalTiles,
          safeTiles: totalTiles - activeRound.minePositions.size,
          currentMultiplier: 0,
          revealedTiles: Array.from(activeRound.revealedTiles).map((t) => ({
            tile: t,
            isMine: activeRound.minePositions.has(t),
          })),
          minesNotRevealed: true,
        };

        await db
          .update(schema.gameRoundsTable)
          .set({
            result: GameResult.LOSE,
            payout: 0,
            details: gameDetails as unknown as Record<string, unknown>,
          })
          .where(eq(schema.gameRoundsTable.id, roundId));

        sseManager.broadcast(this.gameType, "round_update", {
          roundId,
          state: GameState.RESOLVED,
          result: GameResult.LOSE,
          payout: 0,
        });

        this.activeRounds.delete(roundId);

        logger.info(
          {
            roundId,
            gameType: this.gameType,
            tile,
            result: GameResult.LOSE,
          },
          "Mines round resolved — hit mine",
        );

        return {
          result: GameResult.LOSE,
          payout: 0,
          gameDetails: gameDetails as unknown as Record<string, unknown>,
        };
      }

      // Safe tile — update game details
      const gameDetails: MinesGameDetails = {
        mineCount: activeRound.minePositions.size,
        gridSize,
        totalTiles,
        safeTiles: totalTiles - activeRound.minePositions.size,
        currentMultiplier: Number(currentMultiplier.toFixed(4)),
        revealedTiles: Array.from(activeRound.revealedTiles).map((t) => ({
          tile: t,
          isMine: activeRound.minePositions.has(t),
        })),
        minesNotRevealed: true,
      };

      await db
        .update(schema.gameRoundsTable)
        .set({
          details: gameDetails as unknown as Record<string, unknown>,
        })
        .where(eq(schema.gameRoundsTable.id, roundId));

      return {
        result: GameResult.PENDING,
        payout: 0,
        multiplier: Number(currentMultiplier.toFixed(4)),
        gameDetails: gameDetails as unknown as Record<string, unknown>,
      };
    }

    if (action === "cashout") {
      const revealedSafeCount = Array.from(activeRound.revealedTiles).filter(
        (t) => !activeRound.minePositions.has(t),
      ).length;

      if (revealedSafeCount === 0) {
        throw new GameRoundError(
          "Must reveal at least one safe tile before cashing out",
          400,
        );
      }

      const currentMultiplier = calculateMultiplier(
        revealedSafeCount,
        totalTiles,
        activeRound.minePositions.size,
        this.config.rtp,
      );

      const payout = Math.round(round.betAmount * currentMultiplier);

      activeRound.state = GameState.RESOLVED;

      const gameDetails: MinesGameDetails = {
        mineCount: activeRound.minePositions.size,
        gridSize,
        totalTiles,
        safeTiles: totalTiles - activeRound.minePositions.size,
        currentMultiplier: Number(currentMultiplier.toFixed(4)),
        revealedTiles: Array.from(activeRound.revealedTiles).map((t) => ({
          tile: t,
          isMine: activeRound.minePositions.has(t),
        })),
        minesNotRevealed: true,
      };

      // Credit payout
      await wallet.creditPayout(
        round.userId,
        payout,
        this.gameType,
        String(roundId),
      );

      await db
        .update(schema.gameRoundsTable)
        .set({
          result: GameResult.CASHED_OUT,
          payout,
          details: gameDetails as unknown as Record<string, unknown>,
        })
        .where(eq(schema.gameRoundsTable.id, roundId));

      sseManager.broadcast(this.gameType, "round_update", {
        roundId,
        state: GameState.RESOLVED,
        result: GameResult.CASHED_OUT,
        payout,
      });

      this.activeRounds.delete(roundId);

      logger.info(
        {
          roundId,
          gameType: this.gameType,
          payout,
          multiplier: currentMultiplier,
        },
        "Mines round resolved — cashed out",
      );

      return {
        result: GameResult.CASHED_OUT,
        payout,
        multiplier: Number(currentMultiplier.toFixed(4)),
        gameDetails: gameDetails as unknown as Record<string, unknown>,
      };
    }

    throw new GameRoundError(`Unknown action: ${action}`, 400);
  }

  /* ── Test helpers ───────────────────────────────────────────────────── */

  _getActiveRound(roundId: number): ActiveMinesRound | undefined {
    return this.activeRounds.get(roundId);
  }

  _setActiveRound(roundId: number, round: ActiveMinesRound | null): void {
    if (round === null) {
      this.activeRounds.delete(roundId);
    } else {
      this.activeRounds.set(roundId, round);
    }
  }
}
