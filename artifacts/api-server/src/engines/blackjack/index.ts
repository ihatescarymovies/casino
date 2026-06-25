import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  BaseGameEngine,
  GameResult,
  GameState,
  type GameRoundData,
} from "../../lib/game-engine";
import { GameRoundError } from "../../lib/errors";
import * as wallet from "../../lib/wallet";
import { sseManager } from "../../lib/sse";
import { logger } from "../../lib/logger";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface Card {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank:
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "10"
    | "J"
    | "Q"
    | "K"
    | "A";
  value: number;
}

export interface BlackjackGameDetails {
  playerHands: Card[][];
  dealerHand: Card[];
  dealerUpCard: Card;
  activeHandIndex: number;
  availableActions: string[];
  isNaturalBlackjack: boolean;
  dealerHasBlackjack: boolean;
  insuranceBet: number;
  resolved: boolean;
  bets: number[];
  deckPosition: number;
}

export type PlayerAction = "hit" | "stand" | "double" | "split" | "insurance";

/* ── Constants ──────────────────────────────────────────────────────── */

const SUITS: Card["suit"][] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Card["rank"][] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

const RANK_VALUES: Record<Card["rank"], number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 10,
  Q: 10,
  K: 10,
  A: 11,
};

/* ── Helpers ────────────────────────────────────────────────────────── */

function createCard(suit: Card["suit"], rank: Card["rank"]): Card {
  return { suit, rank, value: RANK_VALUES[rank] };
}

function buildDecks(deckCount: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push(createCard(suit, rank));
      }
    }
  }
  return cards;
}

function deterministicRandom(
  seed: string,
  nonce: number,
  position: number,
): number {
  const hash = createHash("sha256")
    .update(`${seed}:${nonce}:${position}`)
    .digest("hex");
  return parseInt(hash.slice(0, 8), 16);
}

function shuffleDeck(cards: Card[], seed: string, nonce: number): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const rand = deterministicRandom(seed, nonce, i);
    const j = rand % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function evaluateHand(hand: Card[]): {
  total: number;
  isSoft: boolean;
  isBust: boolean;
} {
  let total = 0;
  let aceCount = 0;

  for (const card of hand) {
    total += card.value;
    if (card.rank === "A") aceCount++;
  }

  let isSoft = false;
  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount--;
  }

  if (aceCount > 0 && total <= 21) {
    isSoft = true;
  }

  return { total, isSoft, isBust: total > 21 };
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && evaluateHand(hand).total === 21;
}

function isPair(hand: Card[]): boolean {
  return hand.length === 2 && hand[0].value === hand[1].value;
}

function dealerShouldHit(hand: Card[], dealerHitsSoft17: boolean): boolean {
  const evalResult = evaluateHand(hand);
  if (evalResult.total > 17) return false;
  if (evalResult.total === 17 && evalResult.isSoft && !dealerHitsSoft17)
    return false;
  if (evalResult.total === 17) return false;
  return true;
}

/* ── Engine ─────────────────────────────────────────────────────────── */

export class BlackjackEngine extends BaseGameEngine {
  readonly gameType = "blackjack";
  readonly config = {
    minBet: 1,
    maxBet: 50000,
    rtp: 0.995,
    rules: {
      decks: 6,
      dealerHitsSoft17: false,
      doubleAfterSplit: true,
      surrender: false,
      insurancePays: 2,
      blackjackPays: 1.5,
    },
  };

  async placeBet(params: {
    userId: string;
    betAmount: number;
    clientSeed: string;
    gameParams?: Record<string, unknown>;
  }): Promise<GameRoundData> {
    const roundData = await super.placeBet(params);

    const seed = `${params.clientSeed}:${roundData.serverSeedHash}`;
    const deck = shuffleDeck(
      buildDecks(this.config.rules.decks),
      seed,
      roundData.nonce,
    );

    const playerHand: Card[] = [deck[0], deck[2]];
    const dealerHand: Card[] = [deck[1], deck[3]];

    const playerHasBlackjack = isBlackjack(playerHand);
    const dealerHasBlackjack = isBlackjack(dealerHand);

    let result = GameResult.PENDING;
    let payout = 0;
    let availableActions: string[] = [];
    let resolved = false;

    if (playerHasBlackjack && dealerHasBlackjack) {
      result = GameResult.WIN;
      payout = roundData.betAmount;
      resolved = true;
    } else if (playerHasBlackjack) {
      result = GameResult.WIN;
      payout = Math.floor(
        roundData.betAmount * ((1 + this.config.rules.blackjackPays) as number),
      );
      resolved = true;
    } else if (dealerHasBlackjack) {
      result = GameResult.LOSE;
      payout = 0;
      resolved = true;
    } else {
      availableActions = ["hit", "stand", "double"];
      if (isPair(playerHand)) {
        availableActions.push("split");
      }
      if (dealerHand[0].rank === "A") {
        availableActions.push("insurance");
      }
    }

    const gameDetails: BlackjackGameDetails = {
      playerHands: [playerHand],
      dealerHand: resolved ? dealerHand : [dealerHand[0]],
      dealerUpCard: dealerHand[0],
      activeHandIndex: 0,
      availableActions,
      isNaturalBlackjack: playerHasBlackjack,
      dealerHasBlackjack,
      insuranceBet: 0,
      resolved,
      bets: [roundData.betAmount],
      deckPosition: 4,
    };

    await db
      .update(schema.gameRoundsTable)
      .set({
        details: gameDetails as unknown as Record<string, unknown>,
      })
      .where(eq(schema.gameRoundsTable.id, roundData.roundId));

    return roundData;
  }

  /**
   * Execute the initial deal for a blackjack round.
   * Deals 2 cards to player (face up) and 2 to dealer (1 up, 1 down).
   * Checks for natural blackjack and resolves immediately if found.
   */
  protected async executeGame(
    _userId: string,
    round: GameRoundData,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails: Record<string, unknown>;
  }> {
    const seed = `${round.clientSeed}:${round.serverSeedHash}`;
    const deck = shuffleDeck(
      buildDecks(this.config.rules.decks),
      seed,
      round.nonce,
    );

    // Deal initial cards: player, dealer, player, dealer
    const playerHand: Card[] = [deck[0], deck[2]];
    const dealerHand: Card[] = [deck[1], deck[3]];

    const playerHasBlackjack = isBlackjack(playerHand);
    const dealerHasBlackjack = isBlackjack(dealerHand);

    let result = GameResult.PENDING;
    let payout = 0;
    let availableActions: string[] = [];
    let resolved = false;

    if (playerHasBlackjack && dealerHasBlackjack) {
      // Both have blackjack — push (return bet)
      result = GameResult.WIN;
      payout = round.betAmount;
      resolved = true;
    } else if (playerHasBlackjack) {
      // Player natural blackjack pays 1.5x
      result = GameResult.WIN;
      payout = Math.floor(
        round.betAmount * (1 + this.config.rules.blackjackPays),
      );
      resolved = true;
    } else if (dealerHasBlackjack) {
      // Dealer blackjack — player loses
      result = GameResult.LOSE;
      payout = 0;
      resolved = true;
    } else {
      // Normal play — determine available actions
      availableActions = ["hit", "stand", "double"];
      if (isPair(playerHand)) {
        availableActions.push("split");
      }
      if (dealerHand[0].rank === "A") {
        availableActions.push("insurance");
      }
    }

    const gameDetails: BlackjackGameDetails = {
      playerHands: [playerHand],
      dealerHand: resolved ? dealerHand : [dealerHand[0]],
      dealerUpCard: dealerHand[0],
      activeHandIndex: 0,
      availableActions,
      isNaturalBlackjack: playerHasBlackjack,
      dealerHasBlackjack,
      insuranceBet: 0,
      resolved,
      bets: [round.betAmount],
      deckPosition: 4,
    };

    return {
      result,
      payout,
      gameDetails: gameDetails as unknown as Record<string, unknown>,
    };
  }

  /**
   * Handle a player action on an existing blackjack round.
   * Fetches the round from DB, processes the action, and updates the round.
   */
  async handleAction(
    roundId: number,
    action: string,
    _params?: Record<string, unknown>,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails: Record<string, unknown>;
  }> {
    const playerAction = action as PlayerAction;
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

    const gameDetails = round.details as unknown as BlackjackGameDetails;
    if (!gameDetails || gameDetails.resolved) {
      throw new GameRoundError(
        `Round ${roundId} is not in a playable state`,
        400,
      );
    }

    const seed = `${round.clientSeed}:${round.serverSeedHash}`;
    const deck = shuffleDeck(
      buildDecks(this.config.rules.decks),
      seed,
      round.nonce ?? 0,
    );
    let nextCardIndex = gameDetails.deckPosition;

    let actionResult: {
      result: GameResult;
      payout: number;
      resolved: boolean;
      nextCardIndex: number;
    };

    switch (action) {
      case "hit":
        actionResult = this.handleHit(
          gameDetails,
          deck,
          nextCardIndex,
          round.betAmount,
        );
        break;
      case "stand":
        actionResult = this.handleStand(
          gameDetails,
          deck,
          nextCardIndex,
          round.betAmount,
        );
        break;
      case "double":
        actionResult = await this.handleDouble(
          gameDetails,
          deck,
          nextCardIndex,
          round.betAmount,
          round.userId,
          roundId,
        );
        break;
      case "split":
        actionResult = await this.handleSplit(
          gameDetails,
          deck,
          nextCardIndex,
          round.betAmount,
          round.userId,
          roundId,
        );
        break;
      case "insurance":
        actionResult = await this.handleInsurance(
          gameDetails,
          round.betAmount,
          round.userId,
          roundId,
        );
        break;
      default:
        throw new GameRoundError(`Invalid action: ${action}`, 400);
    }

    let { result, payout, resolved } = actionResult;
    nextCardIndex = actionResult.nextCardIndex;
    gameDetails.deckPosition = nextCardIndex;

    // Update gameDetails
    gameDetails.resolved = resolved;
    if (resolved) {
      gameDetails.availableActions = [];
      // Reveal dealer hole card and full hand
      const holeCard = deck[3];
      let dealerHand = [gameDetails.dealerUpCard, holeCard];
      while (
        dealerShouldHit(
          dealerHand,
          this.config.rules.dealerHitsSoft17 as boolean,
        )
      ) {
        dealerHand.push(deck[nextCardIndex]);
        nextCardIndex++;
      }
      gameDetails.dealerHand = dealerHand;
      gameDetails.dealerHasBlackjack = isBlackjack(dealerHand);
      gameDetails.deckPosition = nextCardIndex;
    } else {
      // Update available actions for current hand
      this.updateAvailableActions(gameDetails);
    }

    // Update round in DB
    await db
      .update(schema.gameRoundsTable)
      .set({
        result,
        payout,
        details: gameDetails as unknown as Record<string, unknown>,
      })
      .where(eq(schema.gameRoundsTable.id, roundId));

    // Credit payout if win
    if (result === GameResult.WIN || result === GameResult.CASHED_OUT) {
      await wallet.creditPayout(
        round.userId,
        payout,
        round.gameType,
        String(roundId),
      );
    }

    // Broadcast via SSE
    sseManager.broadcast(round.gameType, "round_update", {
      roundId,
      state: resolved ? GameState.RESOLVED : GameState.IN_PROGRESS,
      result,
      payout,
    });

    logger.info(
      { roundId, gameType: round.gameType, action, result, payout },
      "Blackjack action processed",
    );

    return {
      result,
      payout,
      gameDetails: gameDetails as unknown as Record<string, unknown>,
    };
  }

  /* ── Action Handlers ──────────────────────────────────────────────── */

  private handleHit(
    gameDetails: BlackjackGameDetails,
    deck: Card[],
    nextCardIndex: number,
    betAmount: number,
  ): {
    result: GameResult;
    payout: number;
    resolved: boolean;
    nextCardIndex: number;
  } {
    const handIndex = gameDetails.activeHandIndex;
    const hand = gameDetails.playerHands[handIndex];

    // Deal one card
    hand.push(deck[nextCardIndex]);
    nextCardIndex++;

    const evalResult = evaluateHand(hand);

    if (evalResult.isBust) {
      // Hand busted — check if there are more hands to play
      if (handIndex < gameDetails.playerHands.length - 1) {
        gameDetails.activeHandIndex++;
        return {
          result: GameResult.PENDING,
          payout: 0,
          resolved: false,
          nextCardIndex,
        };
      }
      return this.resolveAgainstDealer(
        gameDetails,
        deck,
        nextCardIndex,
        betAmount,
      );
    }

    // 5-card Charlie: 5 cards without busting = automatic win
    if (hand.length >= 5) {
      if (handIndex < gameDetails.playerHands.length - 1) {
        gameDetails.activeHandIndex++;
        return {
          result: GameResult.PENDING,
          payout: 0,
          resolved: false,
          nextCardIndex,
        };
      }
      return this.resolveAgainstDealer(
        gameDetails,
        deck,
        nextCardIndex,
        betAmount,
      );
    }

    return {
      result: GameResult.PENDING,
      payout: 0,
      resolved: false,
      nextCardIndex,
    };
  }

  private handleStand(
    gameDetails: BlackjackGameDetails,
    deck: Card[],
    nextCardIndex: number,
    betAmount: number,
  ): {
    result: GameResult;
    payout: number;
    resolved: boolean;
    nextCardIndex: number;
  } {
    const handIndex = gameDetails.activeHandIndex;

    if (handIndex < gameDetails.playerHands.length - 1) {
      // Move to next hand
      gameDetails.activeHandIndex++;
      return {
        result: GameResult.PENDING,
        payout: 0,
        resolved: false,
        nextCardIndex,
      };
    }

    // All hands stood, resolve against dealer
    return this.resolveAgainstDealer(
      gameDetails,
      deck,
      nextCardIndex,
      betAmount,
    );
  }

  private async handleDouble(
    gameDetails: BlackjackGameDetails,
    deck: Card[],
    nextCardIndex: number,
    betAmount: number,
    userId: string,
    roundId: number,
  ): Promise<{
    result: GameResult;
    payout: number;
    resolved: boolean;
    nextCardIndex: number;
  }> {
    const handIndex = gameDetails.activeHandIndex;

    // Double the bet for this hand
    gameDetails.bets[handIndex] *= 2;

    // Debit additional bet amount
    await wallet.placeBet(userId, betAmount, this.gameType, String(roundId));

    // Deal exactly one card
    gameDetails.playerHands[handIndex].push(deck[nextCardIndex]);
    nextCardIndex++;

    if (handIndex < gameDetails.playerHands.length - 1) {
      gameDetails.activeHandIndex++;
      return {
        result: GameResult.PENDING,
        payout: 0,
        resolved: false,
        nextCardIndex,
      };
    }

    return this.resolveAgainstDealer(
      gameDetails,
      deck,
      nextCardIndex,
      betAmount,
    );
  }

  private async handleSplit(
    gameDetails: BlackjackGameDetails,
    deck: Card[],
    nextCardIndex: number,
    betAmount: number,
    userId: string,
    roundId: number,
  ): Promise<{
    result: GameResult;
    payout: number;
    resolved: boolean;
    nextCardIndex: number;
  }> {
    const handIndex = gameDetails.activeHandIndex;
    const hand = gameDetails.playerHands[handIndex];

    if (!isPair(hand)) {
      throw new GameRoundError("Cannot split: hand is not a pair", 400);
    }

    // Debit additional bet for split hand
    await wallet.placeBet(userId, betAmount, this.gameType, String(roundId));

    // Split into two hands
    const card1 = hand[0];
    const card2 = hand[1];

    gameDetails.playerHands[handIndex] = [card1, deck[nextCardIndex]];
    nextCardIndex++;
    gameDetails.playerHands.splice(handIndex + 1, 0, [
      card2,
      deck[nextCardIndex],
    ]);
    nextCardIndex++;
    gameDetails.bets.splice(handIndex + 1, 0, betAmount);

    // Check for blackjack on split hands (pays 1:1, not 1.5:1)
    // If last hand has blackjack after split, resolve against dealer
    const lastIndex = gameDetails.playerHands.length - 1;
    if (isBlackjack(gameDetails.playerHands[lastIndex])) {
      return this.resolveAgainstDealer(
        gameDetails,
        deck,
        nextCardIndex,
        betAmount,
      );
    }

    return {
      result: GameResult.PENDING,
      payout: 0,
      resolved: false,
      nextCardIndex,
    };
  }

  private async handleInsurance(
    gameDetails: BlackjackGameDetails,
    betAmount: number,
    userId: string,
    roundId: number,
  ): Promise<{
    result: GameResult;
    payout: number;
    resolved: boolean;
    nextCardIndex: number;
  }> {
    const insuranceBet = Math.floor(betAmount / 2);
    gameDetails.insuranceBet = insuranceBet;

    // Debit insurance bet
    await wallet.placeBet(userId, insuranceBet, this.gameType, String(roundId));

    // Insurance does not resolve the round immediately
    return {
      result: GameResult.PENDING,
      payout: 0,
      resolved: false,
      nextCardIndex: gameDetails.deckPosition,
    };
  }

  /* ── Resolution ─────────────────────────────────────────────────────── */

  private resolveAgainstDealer(
    gameDetails: BlackjackGameDetails,
    deck: Card[],
    nextCardIndex: number,
    _betAmount: number,
  ): {
    result: GameResult;
    payout: number;
    resolved: boolean;
    nextCardIndex: number;
  } {
    // Reconstruct full dealer hand: up card + hole card (deck[3]) + hits
    const holeCard = deck[3];
    let dealerHand = [gameDetails.dealerUpCard, holeCard];

    // Dealer plays
    while (
      dealerShouldHit(dealerHand, this.config.rules.dealerHitsSoft17 as boolean)
    ) {
      dealerHand.push(deck[nextCardIndex]);
      nextCardIndex++;
    }

    gameDetails.dealerHand = dealerHand;

    const dealerEval = evaluateHand(dealerHand);
    const dealerBust = dealerEval.isBust;
    const dealerTotal = dealerEval.total;

    let totalPayout = 0;
    let allBust = true;
    let anyWin = false;

    for (let i = 0; i < gameDetails.playerHands.length; i++) {
      const hand = gameDetails.playerHands[i];
      const handBet = gameDetails.bets[i];
      const playerEval = evaluateHand(hand);

      if (playerEval.isBust) {
        continue;
      }

      allBust = false;

      if (dealerBust || playerEval.total > dealerTotal) {
        // Player wins — return bet + win amount
        totalPayout += handBet * 2;
        anyWin = true;
      } else if (playerEval.total === dealerTotal) {
        // Push — return bet
        totalPayout += handBet;
      }
    }

    // Insurance payout
    if (gameDetails.insuranceBet > 0 && isBlackjack(dealerHand)) {
      totalPayout +=
        gameDetails.insuranceBet *
        (1 + (this.config.rules.insurancePays as number));
    }

    const finalResult = totalPayout > 0 ? GameResult.WIN : GameResult.LOSE;

    return {
      result: finalResult,
      payout: totalPayout,
      resolved: true,
      nextCardIndex,
    };
  }

  private updateAvailableActions(gameDetails: BlackjackGameDetails): void {
    const handIndex = gameDetails.activeHandIndex;
    const hand = gameDetails.playerHands[handIndex];
    const evalResult = evaluateHand(hand);

    if (evalResult.isBust) {
      gameDetails.availableActions = [];
      return;
    }

    const actions: string[] = ["hit", "stand"];

    // Can double on first two cards only
    if (hand.length === 2) {
      actions.push("double");
    }

    // Can split on first two cards if pair
    if (hand.length === 2 && isPair(hand)) {
      actions.push("split");
    }

    gameDetails.availableActions = actions;
  }
}
