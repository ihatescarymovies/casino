/**
 * Game engine interface, abstract base class, and shared types.
 *
 * Each game type (slots, blackjack, roulette, etc.) implements the
 * GameEngine interface.  BaseGameEngine provides common bet placement
 * and round resolution logic.
 */

import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { sseManager } from "./sse";
import { GameRoundError } from "./errors";
import * as wallet from "./wallet";
import * as hashChain from "./hash-chain";
import { logger } from "./logger";

/* ── Enums ──────────────────────────────────────────────────────────── */

export enum GameState {
  IDLE = "idle",
  BET_PLACED = "bet_placed",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
}

export enum GameResult {
  WIN = "win",
  LOSE = "lose",
  PENDING = "pending",
  CASHED_OUT = "cashed_out",
}

/* ── Types ──────────────────────────────────────────────────────────── */

export interface GameConfig {
  minBet: number;
  maxBet: number;
  rtp: number;
  rules: Record<string, unknown>;
}

export interface GameRoundData {
  roundId: number;
  gameType: string;
  betAmount: number;
  clientSeed: string;
  serverSeedHash: string;
  nonce: number;
  state: GameState;
  result: GameResult;
  payout: number;
  gameParams?: Record<string, unknown>;
}

/* ── Engine Interface ───────────────────────────────────────────────── */

export interface GameEngine {
  readonly gameType: string;
  readonly config: GameConfig;

  /**
   * Place a bet and start a game round.
   * Returns round metadata without the final resolved result.
   */
  placeBet(params: {
    userId: string;
    betAmount: number;
    clientSeed: string;
    gameParams?: Record<string, unknown>;
  }): Promise<GameRoundData>;

  /**
   * Handle a player action on an existing round.
   * Used for interactive games (blackjack, mines, crash).
   */
  handleAction(
    roundId: number,
    action: string,
    params?: Record<string, unknown>,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails?: Record<string, unknown>;
  }>;
}

/* ── Abstract Base Class ────────────────────────────────────────────── */

export abstract class BaseGameEngine implements GameEngine {
  abstract readonly gameType: string;
  abstract readonly config: GameConfig;

  async placeBet(params: {
    userId: string;
    betAmount: number;
    clientSeed: string;
    gameParams?: Record<string, unknown>;
  }): Promise<GameRoundData> {
    const { userId, betAmount, clientSeed, gameParams } = params;

    // 1. Validate bet amount against config
    if (betAmount < this.config.minBet) {
      throw new GameRoundError(
        `Bet amount ${betAmount} is below minimum ${this.config.minBet}`,
      );
    }
    if (betAmount > this.config.maxBet) {
      throw new GameRoundError(
        `Bet amount ${betAmount} exceeds maximum ${this.config.maxBet}`,
      );
    }

    // 2. Debit wallet (throws InsufficientFunds if insufficient)
    // Skip wallet debit for demo mode — demo wallet is already debited by route
    const isDemo = gameParams?.demo === true;
    if (!isDemo) {
      const roundIdPlaceholder = `${this.gameType}_${userId}_${Date.now()}`;
      await wallet.placeBet(
        userId,
        betAmount,
        this.gameType,
        roundIdPlaceholder,
      );
    }

    // 3. Get next hash from the provably-fair hash chain
    const hashResult = await hashChain.getNextHash(this.gameType);

    // 4. Create round in DB
    const [round] = await db
      .insert(schema.gameRoundsTable)
      .values({
        userId,
        gameType: this.gameType,
        betAmount,
        payout: 0,
        status: "pending",
        result: GameResult.PENDING,
        serverSeedHash: hashResult.serverSeedHash,
        clientSeed,
        nonce: hashResult.nonce,
        details: gameParams ?? null,
      })
      .returning();

    // 5. Return round data (pending result — engine will resolve)
    return {
      roundId: round.id,
      gameType: this.gameType,
      betAmount,
      clientSeed,
      serverSeedHash: hashResult.serverSeedHash,
      nonce: hashResult.nonce,
      state: GameState.BET_PLACED,
      result: GameResult.PENDING,
      payout: 0,
      gameParams,
    };
  }

  /**
   * Handle a player action on an existing round.
   * Override in subclasses for interactive games.
   */
  async handleAction(
    _roundId: number,
    _action: string,
    _params?: Record<string, unknown>,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails?: Record<string, unknown>;
  }> {
    throw new GameRoundError("This game does not support actions", 400);
  }

  /**
   * Game-specific execution logic.
   * Each concrete engine implements this to run the actual game.
   */
  protected abstract executeGame(
    userId: string,
    round: GameRoundData,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails: Record<string, unknown>;
  }>;

  /**
   * Resolve a round after the game completes.
   * Updates the DB record, credits payout if won, and broadcasts via SSE.
   */
  async resolveRound(roundId: number): Promise<GameRoundData> {
    const [round] = await db
      .select()
      .from(schema.gameRoundsTable)
      .where(eq(schema.gameRoundsTable.id, roundId));

    if (!round) {
      throw new GameRoundError(`Round ${roundId} not found`, 404);
    }

    if (round.result !== GameResult.PENDING) {
      throw new GameRoundError(
        `Round ${roundId} already resolved (${round.result})`,
        409,
      );
    }

    // Execute game logic
    const gameResult = await this.executeGame(round.userId, {
      roundId: round.id,
      gameType: round.gameType,
      betAmount: round.betAmount,
      clientSeed: round.clientSeed ?? "",
      serverSeedHash: round.serverSeedHash ?? "",
      nonce: round.nonce ?? 0,
      state: GameState.IN_PROGRESS,
      result: GameResult.PENDING,
      payout: 0,
      gameParams: (round.details as Record<string, unknown>) ?? undefined,
    });

    // Update round in DB
    const [updated] = await db
      .update(schema.gameRoundsTable)
      .set({
        status: "completed",
        result: gameResult.result,
        payout: gameResult.payout,
        details: gameResult.gameDetails,
      })
      .where(eq(schema.gameRoundsTable.id, roundId))
      .returning();

    // Credit payout if win
    if (
      gameResult.result === GameResult.WIN ||
      gameResult.result === GameResult.CASHED_OUT
    ) {
      await wallet.creditPayout(
        round.userId,
        gameResult.payout,
        round.gameType,
        String(roundId),
      );
    }

    // Broadcast via SSE
    sseManager.broadcast(round.gameType, "round_update", {
      roundId,
      state: GameState.RESOLVED,
      result: gameResult.result,
      payout: gameResult.payout,
    });

    logger.info(
      {
        roundId,
        gameType: round.gameType,
        result: gameResult.result,
        payout: gameResult.payout,
      },
      "Round resolved",
    );

    return {
      roundId: updated.id,
      gameType: updated.gameType,
      betAmount: updated.betAmount,
      clientSeed: updated.clientSeed ?? "",
      serverSeedHash: updated.serverSeedHash ?? "",
      nonce: updated.nonce ?? 0,
      state: GameState.RESOLVED,
      result: (updated.result as GameResult) ?? GameResult.LOSE,
      payout: updated.payout,
    };
  }

  /**
   * Get the new wallet balance after a bet or payout.
   */
  protected async getBalanceAfter(userId: string): Promise<number> {
    const balanceInfo = await wallet.getBalance(userId);
    return balanceInfo.balance;
  }
}

export default BaseGameEngine;
