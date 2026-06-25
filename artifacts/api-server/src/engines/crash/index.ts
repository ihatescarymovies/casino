import { createHash } from "node:crypto";
import {
  BaseGameEngine,
  GameState,
  GameResult,
  type GameRoundData,
} from "../../lib/game-engine";
import { sseManager } from "../../lib/sse";
import { GameRoundError } from "../../lib/errors";
import * as wallet from "../../lib/wallet";
import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";

/* ── Types ──────────────────────────────────────────────────────────── */

interface CrashPlayer {
  userId: string;
  roundId: number;
  betAmount: number;
  cashedOut: boolean;
  cashOutMultiplier?: number;
  payout: number;
}

interface ActiveCrashRound {
  crashPoint: number;
  startedAt: number;
  tickIntervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
  elapsedMs: number;
  currentMultiplier: number;
  state: GameState;
  serverSeedHash: string;
  nonce: number;
  players: Map<number, CrashPlayer>;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function deterministicRng(serverSeedHash: string, nonce: number): number {
  const hash = createHash("sha256")
    .update(`${serverSeedHash}:${nonce}:crash`)
    .digest("hex");
  const intValue = parseInt(hash.slice(0, 8), 16);
  return intValue / 0xffffffff;
}

function calculateCrashPoint(rngValue: number): number {
  return Math.max(1.0, 0.99 / (1 - rngValue));
}

function calculateMultiplier(elapsedMs: number): number {
  const elapsedSec = elapsedMs / 1000;
  return 1 + elapsedSec ** 2;
}

/* ── Engine ─────────────────────────────────────────────────────────── */

export class CrashEngine extends BaseGameEngine {
  readonly gameType = "crash";
  readonly config = {
    minBet: 1,
    maxBet: 500000,
    rtp: 0.99,
    rules: {
      tickIntervalMs: 100,
      houseEdge: 0.01,
    },
  };

  private activeRound: ActiveCrashRound | null = null;
  private lastCrashInfo: { crashPoint: number; crashedAt: number } | null =
    null;

  /**
   * Game-specific execution: determines the crash point only.
   * Crash is async — the round stays IN_PROGRESS until the tick loop crashes.
   */
  protected async executeGame(
    _userId: string,
    round: GameRoundData,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails: Record<string, unknown>;
  }> {
    const rngValue = deterministicRng(round.serverSeedHash, round.nonce);
    const crashPoint = calculateCrashPoint(rngValue);

    return {
      result: GameResult.PENDING,
      payout: 0,
      gameDetails: {
        crashPoint,
        tickIntervalMs: this.config.rules.tickIntervalMs,
        startedAt: Date.now(),
      },
    };
  }

  /**
   * Start a new crash round.
   * Determines the crash point deterministically and begins the tick loop.
   */
  async startRound(
    roundId: number,
    serverSeedHash: string,
    nonce: number,
  ): Promise<void> {
    if (this.activeRound?.state === GameState.IN_PROGRESS) {
      throw new GameRoundError("A round is already in progress", 409);
    }

    const rngValue = deterministicRng(serverSeedHash, nonce);
    const crashPoint = calculateCrashPoint(rngValue);

    this.lastCrashInfo = null;

    this.activeRound = {
      crashPoint,
      startedAt: Date.now(),
      tickIntervalMs: this.config.rules.tickIntervalMs as number,
      timer: null,
      elapsedMs: 0,
      currentMultiplier: 1.0,
      state: GameState.IN_PROGRESS,
      serverSeedHash,
      nonce,
      players: new Map(),
    };

    // Add the initiating player if their roundId is known
    if (roundId > 0) {
      const [round] = await db
        .select()
        .from(schema.gameRoundsTable)
        .where(eq(schema.gameRoundsTable.id, roundId));

      if (round) {
        this.activeRound.players.set(roundId, {
          userId: round.userId,
          roundId,
          betAmount: round.betAmount,
          cashedOut: false,
          payout: 0,
        });
      }
    }

    this.startTickLoop();

    logger.info(
      { crashPoint, roundId, serverSeedHash, nonce },
      "Crash round started",
    );
  }

  /**
   * Place a bet and add the player to the active crash round.
   */
  async placeBet(params: {
    userId: string;
    betAmount: number;
    clientSeed: string;
    gameParams?: Record<string, unknown>;
  }): Promise<GameRoundData> {
    const roundData = await super.placeBet(params);

    // If no active round, start one with this player's seed
    if (!this.activeRound || this.activeRound.state !== GameState.IN_PROGRESS) {
      await this.startRound(
        roundData.roundId,
        roundData.serverSeedHash,
        roundData.nonce,
      );
    }

    // Add player to active round
    this.activeRound!.players.set(roundData.roundId, {
      userId: params.userId,
      roundId: roundData.roundId,
      betAmount: params.betAmount,
      cashedOut: false,
      payout: 0,
    });

    return roundData;
  }

  /**
   * Handle player actions during an active round.
   */
  async handleAction(
    roundId: number,
    action: string,
    _params?: Record<string, unknown>,
  ): Promise<{
    result: GameResult;
    payout: number;
    success?: boolean;
    multiplier?: number;
    gameDetails?: Record<string, unknown>;
  }> {
    if (!this.activeRound || this.activeRound.state !== GameState.IN_PROGRESS) {
      if (this.lastCrashInfo) {
        throw new GameRoundError("Round has already crashed", 409);
      }
      throw new GameRoundError("No active round in progress", 400);
    }

    const player = this.activeRound.players.get(roundId);
    if (!player) {
      throw new GameRoundError("Player not found in active round", 404);
    }

    if (player.cashedOut) {
      throw new GameRoundError("Already cashed out", 409);
    }

    if (this.activeRound.currentMultiplier >= this.activeRound.crashPoint) {
      throw new GameRoundError("Round has already crashed", 409);
    }

    if (action === "cashout") {
      player.cashedOut = true;
      player.cashOutMultiplier = this.activeRound.currentMultiplier;
      player.payout = Math.round(
        player.betAmount * this.activeRound.currentMultiplier,
      );

      // Credit payout
      await wallet.creditPayout(
        player.userId,
        player.payout,
        this.gameType,
        String(roundId),
      );

      // Update DB round
      await db
        .update(schema.gameRoundsTable)
        .set({
          result: GameResult.CASHED_OUT,
          payout: player.payout,
          details: {
            crashPoint: this.activeRound.crashPoint,
            cashOutMultiplier: Number(player.cashOutMultiplier.toFixed(2)),
            cashedOut: true,
          },
        })
        .where(eq(schema.gameRoundsTable.id, roundId));

      // Broadcast cash-out event
      sseManager.broadcast(this.gameType, "crash:cashed_out", {
        userId: player.userId,
        roundId,
        multiplier: Number(player.cashOutMultiplier.toFixed(2)),
        payout: player.payout,
      });

      logger.info(
        {
          userId: player.userId,
          roundId,
          multiplier: player.cashOutMultiplier,
          payout: player.payout,
        },
        "Player cashed out",
      );

      return {
        result: GameResult.CASHED_OUT,
        payout: player.payout,
        success: true,
        multiplier: Number(player.cashOutMultiplier.toFixed(2)),
        gameDetails: {
          crashPoint: this.activeRound.crashPoint,
          cashOutMultiplier: Number(player.cashOutMultiplier.toFixed(2)),
          cashedOut: true,
        },
      };
    }

    throw new GameRoundError(`Unknown action: ${action}`, 400);
  }

  /**
   * Get the current state of the active round (for SSE subscribers).
   */
  getActiveRound(): {
    crashPoint: number;
    currentMultiplier: number;
    elapsedMs: number;
    state: GameState;
    playerCount: number;
  } | null {
    if (!this.activeRound) return null;
    return {
      crashPoint: this.activeRound.crashPoint,
      currentMultiplier: this.activeRound.currentMultiplier,
      elapsedMs: this.activeRound.elapsedMs,
      state: this.activeRound.state,
      playerCount: this.activeRound.players.size,
    };
  }

  /**
   * For testability: inject a custom active round state.
   */
  _setActiveRound(round: ActiveCrashRound | null): void {
    this.activeRound = round;
  }

  /**
   * For testability: access the active round directly.
   */
  _getActiveRound(): ActiveCrashRound | null {
    return this.activeRound;
  }

  /* ── Private ──────────────────────────────────────────────────────── */

  private startTickLoop(): void {
    if (!this.activeRound) return;

    const interval = this.activeRound.tickIntervalMs;
    this.activeRound.timer = setInterval(() => {
      this.tick();
    }, interval);
  }

  private tick(): void {
    if (!this.activeRound) return;

    this.activeRound.elapsedMs += this.activeRound.tickIntervalMs;
    this.activeRound.currentMultiplier = calculateMultiplier(
      this.activeRound.elapsedMs,
    );

    // Broadcast tick to all connected clients
    sseManager.broadcast(this.gameType, "crash:tick", {
      multiplier: Number(this.activeRound.currentMultiplier.toFixed(2)),
      elapsed: this.activeRound.elapsedMs,
    });

    // Check if we've reached the crash point
    if (this.activeRound.currentMultiplier >= this.activeRound.crashPoint) {
      this.crash();
    }
  }

  private async crash(): Promise<void> {
    if (!this.activeRound) return;

    this.stopTickLoop();
    this.activeRound.state = GameState.RESOLVED;

    // Broadcast crash event
    sseManager.broadcast(this.gameType, "crash:crashed", {
      crashPoint: this.activeRound.crashPoint,
      busted: true,
    });

    // Resolve all non-cashed-out players as losers
    for (const [roundId, player] of this.activeRound.players) {
      if (!player.cashedOut) {
        // Broadcast first (synchronous), then update DB
        sseManager.broadcast(this.gameType, "round_update", {
          roundId,
          state: GameState.RESOLVED,
          result: GameResult.LOSE,
          payout: 0,
        });

        await db
          .update(schema.gameRoundsTable)
          .set({
            result: GameResult.LOSE,
            payout: 0,
            details: {
              crashPoint: this.activeRound.crashPoint,
              finalMultiplier: Number(
                this.activeRound.currentMultiplier.toFixed(2),
              ),
              cashedOut: false,
            },
          })
          .where(eq(schema.gameRoundsTable.id, roundId));
      }
    }

    logger.info(
      {
        crashPoint: this.activeRound.crashPoint,
        playerCount: this.activeRound.players.size,
      },
      "Crash round ended",
    );

    this.lastCrashInfo = {
      crashPoint: this.activeRound.crashPoint,
      crashedAt: Date.now(),
    };
    this.activeRound = null;
  }

  private stopTickLoop(): void {
    if (this.activeRound?.timer) {
      clearInterval(this.activeRound.timer);
      this.activeRound.timer = null;
    }
  }
}
