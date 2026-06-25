import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BlackjackEngine,
  evaluateHand,
  isBlackjack,
  type Card,
  type BlackjackGameDetails,
} from "./index";
import { GameResult, type GameRoundData } from "../../lib/game-engine";

vi.mock("../../lib/wallet", () => ({
  placeBet: vi.fn(() =>
    Promise.resolve({
      transactionId: 1,
      balanceBefore: 1000,
      balanceAfter: 900,
    }),
  ),
  creditPayout: vi.fn(() =>
    Promise.resolve({
      transactionId: 2,
      balanceBefore: 900,
      balanceAfter: 1000,
    }),
  ),
}));

/* ── Helpers ────────────────────────────────────────────────────────── */

function createRound(overrides: Partial<GameRoundData> = {}): GameRoundData {
  return {
    roundId: 1,
    gameType: "blackjack",
    betAmount: 100,
    clientSeed: "test-seed",
    serverSeedHash: "test-hash",
    nonce: 0,
    state: "in_progress" as any,
    result: "pending" as any,
    payout: 0,
    ...overrides,
  };
}

function createCard(
  suit: Card["suit"],
  rank: Card["rank"],
  value: number,
): Card {
  return { suit, rank, value };
}

function createGameDetails(
  overrides: Partial<BlackjackGameDetails> = {},
): BlackjackGameDetails {
  return {
    playerHands: [
      [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
    ],
    dealerHand: [createCard("clubs", "7", 7)],
    dealerUpCard: createCard("clubs", "7", 7),
    activeHandIndex: 0,
    availableActions: ["hit", "stand", "double"],
    isNaturalBlackjack: false,
    dealerHasBlackjack: false,
    insuranceBet: 0,
    resolved: false,
    bets: [100],
    deckPosition: 4,
    ...overrides,
  };
}

/* ── evaluateHand ───────────────────────────────────────────────────── */

describe("evaluateHand", () => {
  it("calculates hard totals correctly", () => {
    const hand = [createCard("hearts", "10", 10), createCard("spades", "8", 8)];
    expect(evaluateHand(hand).total).toBe(18);
    expect(evaluateHand(hand).isSoft).toBe(false);
    expect(evaluateHand(hand).isBust).toBe(false);
  });

  it("counts Ace as 11 in soft hand", () => {
    const hand = [createCard("hearts", "A", 11), createCard("spades", "7", 7)];
    expect(evaluateHand(hand).total).toBe(18);
    expect(evaluateHand(hand).isSoft).toBe(true);
  });

  it("counts Ace as 1 when it would bust", () => {
    const hand = [
      createCard("hearts", "A", 11),
      createCard("spades", "10", 10),
      createCard("clubs", "10", 10),
    ];
    expect(evaluateHand(hand).total).toBe(21);
    expect(evaluateHand(hand).isSoft).toBe(false); // Ace counted as 1 = hard hand
  });

  it("detects bust", () => {
    const hand = [
      createCard("hearts", "10", 10),
      createCard("spades", "9", 9),
      createCard("clubs", "5", 5),
    ];
    expect(evaluateHand(hand).isBust).toBe(true);
  });

  it("handles multiple Aces", () => {
    const hand = [
      createCard("hearts", "A", 11),
      createCard("spades", "A", 11),
      createCard("clubs", "9", 9),
    ];
    expect(evaluateHand(hand).total).toBe(21);
    expect(evaluateHand(hand).isSoft).toBe(true);
  });
});

/* ── isBlackjack ──────────────────────────────────────────────────────── */

describe("isBlackjack", () => {
  it("returns true for Ace + 10-value", () => {
    const hand = [createCard("hearts", "A", 11), createCard("spades", "K", 10)];
    expect(isBlackjack(hand)).toBe(true);
  });

  it("returns true for Ace + 10", () => {
    const hand = [
      createCard("hearts", "A", 11),
      createCard("spades", "10", 10),
    ];
    expect(isBlackjack(hand)).toBe(true);
  });

  it("returns false for non-blackjack 21", () => {
    const hand = [
      createCard("hearts", "9", 9),
      createCard("spades", "7", 7),
      createCard("clubs", "5", 5),
    ];
    expect(isBlackjack(hand)).toBe(false);
  });

  it("returns false for non-21", () => {
    const hand = [createCard("hearts", "10", 10), createCard("spades", "8", 8)];
    expect(isBlackjack(hand)).toBe(false);
  });
});

/* ── BlackjackEngine.executeGame ──────────────────────────────────────── */

describe("BlackjackEngine.executeGame", () => {
  const engine = new BlackjackEngine();

  it("has correct gameType and config", () => {
    expect(engine.gameType).toBe("blackjack");
    expect(engine.config.minBet).toBe(1);
    expect(engine.config.maxBet).toBe(50000);
    expect(engine.config.rtp).toBe(0.995);
    expect(engine.config.rules).toMatchObject({
      decks: 6,
      dealerHitsSoft17: false,
      doubleAfterSplit: true,
      surrender: false,
      insurancePays: 2,
      blackjackPays: 1.5,
    });
  });

  it("produces deterministic initial deal for same seed+nonce", async () => {
    const round = createRound();
    const result1 = await (engine as any).executeGame("user1", round);
    const result2 = await (engine as any).executeGame("user1", round);

    expect(result1.result).toBe(result2.result);
    expect(result1.payout).toBe(result2.payout);
    expect(result1.gameDetails.playerHands).toEqual(
      result2.gameDetails.playerHands,
    );
    expect(result1.gameDetails.dealerUpCard).toEqual(
      result2.gameDetails.dealerUpCard,
    );
  });

  it("produces different deals for different nonces", async () => {
    const round1 = createRound({ nonce: 0 });
    const round2 = createRound({ nonce: 1 });

    const result1 = await (engine as any).executeGame("user1", round1);
    const result2 = await (engine as any).executeGame("user1", round2);

    expect(result1.gameDetails.playerHands).not.toEqual(
      result2.gameDetails.playerHands,
    );
  });

  it("returns correct gameDetails shape for initial deal", async () => {
    const round = createRound();
    const result = await (engine as any).executeGame("user1", round);

    expect(result.gameDetails).toHaveProperty("playerHands");
    expect(result.gameDetails).toHaveProperty("dealerHand");
    expect(result.gameDetails).toHaveProperty("dealerUpCard");
    expect(result.gameDetails).toHaveProperty("availableActions");
    expect(result.gameDetails).toHaveProperty("isNaturalBlackjack");
    expect(result.gameDetails).toHaveProperty("dealerHasBlackjack");
    expect(result.gameDetails).toHaveProperty("resolved");
    expect(result.gameDetails).toHaveProperty("bets");
    expect(result.gameDetails).toHaveProperty("deckPosition");

    expect(result.gameDetails.playerHands).toHaveLength(1);
    expect(result.gameDetails.playerHands[0]).toHaveLength(2);
    expect(result.gameDetails.bets).toEqual([100]);
    expect(result.gameDetails.deckPosition).toBe(4);
  });

  it("offers insurance when dealer shows Ace", async () => {
    // Scan nonces to find one where dealer up card is Ace
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      if (
        result.gameDetails.dealerUpCard.rank === "A" &&
        !result.gameDetails.resolved
      ) {
        found = true;
        expect(result.gameDetails.availableActions).toContain("insurance");
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("offers split when player has a pair", async () => {
    // Scan nonces to find one where player has a pair
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      if (!result.gameDetails.resolved) {
        const hand = result.gameDetails.playerHands[0];
        if (hand[0].value === hand[1].value) {
          found = true;
          expect(result.gameDetails.availableActions).toContain("split");
          break;
        }
      }
    }
    expect(found).toBe(true);
  });
});

/* ── BlackjackEngine action methods ─────────────────────────────────── */

describe("BlackjackEngine.handleHit", () => {
  const engine = new BlackjackEngine();

  it("deals one card and stays pending if not bust", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "6", 6)],
      ],
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "6", 6),
      createCard("clubs", "7", 7),
      createCard("diamonds", "A", 11),
      createCard("hearts", "3", 3), // hit card
    ];

    const result = (engine as any).handleHit(gameDetails, deck, 4, 100);

    expect(result.resolved).toBe(false);
    expect(gameDetails.playerHands[0]).toHaveLength(3);
    expect(gameDetails.playerHands[0][2]).toEqual(createCard("hearts", "3", 3));
    expect(result.nextCardIndex).toBe(5);
  });

  it("resolves when player busts on last hand", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "9", 9)],
      ],
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "9", 9),
      createCard("clubs", "7", 7),
      createCard("diamonds", "A", 11),
      createCard("hearts", "5", 5), // hit card — busts (10+9+5=24)
    ];

    const result = (engine as any).handleHit(gameDetails, deck, 4, 100);

    expect(result.resolved).toBe(true);
    expect(result.result).toBe(GameResult.LOSE);
  });

  it("moves to next hand when current hand busts and more hands exist", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "9", 9)],
        [createCard("clubs", "8", 8), createCard("diamonds", "7", 7)],
      ],
      activeHandIndex: 0,
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "9", 9),
      createCard("clubs", "8", 8),
      createCard("diamonds", "7", 7),
      createCard("hearts", "5", 5), // hit card — busts first hand
    ];

    const result = (engine as any).handleHit(gameDetails, deck, 4, 100);

    expect(result.resolved).toBe(false);
    expect(gameDetails.activeHandIndex).toBe(1);
  });
});

describe("BlackjackEngine.handleStand", () => {
  const engine = new BlackjackEngine();

  it("moves to next hand when more hands exist", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
        [createCard("clubs", "9", 9), createCard("diamonds", "7", 7)],
      ],
      activeHandIndex: 0,
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "8", 8),
      createCard("clubs", "9", 9),
      createCard("diamonds", "7", 7),
    ];

    const result = (engine as any).handleStand(gameDetails, deck, 4, 100);

    expect(result.resolved).toBe(false);
    expect(gameDetails.activeHandIndex).toBe(1);
  });

  it("resolves against dealer on last hand", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
      ],
      dealerHand: [createCard("clubs", "6", 6)],
      dealerUpCard: createCard("clubs", "6", 6),
    });
    const deck: Card[] = [
      createCard("hearts", "10", 10),
      createCard("spades", "8", 8),
      createCard("clubs", "6", 6),
      createCard("diamonds", "10", 10), // hole card
      createCard("hearts", "7", 7), // dealer hit
    ];

    const result = (engine as any).handleStand(gameDetails, deck, 4, 100);

    expect(result.resolved).toBe(true);
  });
});

describe("BlackjackEngine.handleDouble", () => {
  const engine = new BlackjackEngine();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("doubles bet and deals exactly one card", async () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "6", 6)],
      ],
      bets: [100],
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "6", 6),
      createCard("clubs", "7", 7),
      createCard("diamonds", "A", 11),
      createCard("hearts", "3", 3), // double card
    ];

    const result = await (engine as any).handleDouble(
      gameDetails,
      deck,
      4,
      100,
      "user1",
      1,
    );

    expect(result.resolved).toBe(true);
    expect(gameDetails.bets[0]).toBe(200);
    expect(gameDetails.playerHands[0]).toHaveLength(3);
    expect(gameDetails.playerHands[0][2]).toEqual(createCard("hearts", "3", 3));
  });
});

describe("BlackjackEngine.handleSplit", () => {
  const engine = new BlackjackEngine();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("splits a pair into two hands", async () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "8", 8), createCard("spades", "8", 8)],
      ],
      bets: [100],
    });
    const deck = [
      createCard("hearts", "8", 8),
      createCard("spades", "8", 8),
      createCard("clubs", "7", 7),
      createCard("diamonds", "A", 11),
      createCard("hearts", "3", 3), // first split card
      createCard("clubs", "5", 5), // second split card
    ];

    const result = await (engine as any).handleSplit(
      gameDetails,
      deck,
      4,
      100,
      "user1",
      1,
    );

    expect(result.resolved).toBe(false);
    expect(gameDetails.playerHands).toHaveLength(2);
    expect(gameDetails.bets).toEqual([100, 100]);
    expect(gameDetails.playerHands[0]).toEqual([
      createCard("hearts", "8", 8),
      createCard("hearts", "3", 3),
    ]);
    expect(gameDetails.playerHands[1]).toEqual([
      createCard("spades", "8", 8),
      createCard("clubs", "5", 5),
    ]);
  });

  it("throws when hand is not a pair", async () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
      ],
    });
    const deck: Card[] = [];

    await expect(
      (engine as any).handleSplit(gameDetails, deck, 4, 100, "user1", 1),
    ).rejects.toThrow("Cannot split");
  });
});

describe("BlackjackEngine.handleInsurance", () => {
  const engine = new BlackjackEngine();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sets insurance bet to half original bet", async () => {
    const gameDetails = createGameDetails({
      insuranceBet: 0,
      deckPosition: 4,
    });

    const result = await (engine as any).handleInsurance(
      gameDetails,
      100,
      "user1",
      1,
    );

    expect(result.resolved).toBe(false);
    expect(gameDetails.insuranceBet).toBe(50);
    expect(result.nextCardIndex).toBe(4);
  });
});

/* ── BlackjackEngine.resolveAgainstDealer ───────────────────────────── */

describe("BlackjackEngine.resolveAgainstDealer", () => {
  const engine = new BlackjackEngine();

  it("player wins when dealer busts", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
      ],
      dealerUpCard: createCard("clubs", "6", 6),
      bets: [100],
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "8", 8),
      createCard("clubs", "6", 6),
      createCard("diamonds", "10", 10), // hole card
      createCard("hearts", "6", 6), // dealer hit → 22, busts
    ];

    const result = (engine as any).resolveAgainstDealer(
      gameDetails,
      deck,
      4,
      100,
    );

    expect(result.resolved).toBe(true);
    expect(result.result).toBe(GameResult.WIN);
    expect(result.payout).toBe(200); // bet + win
  });

  it("player loses when dealer has higher total", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "7", 7)],
      ],
      dealerUpCard: createCard("clubs", "10", 10),
      bets: [100],
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "7", 7),
      createCard("clubs", "10", 10),
      createCard("diamonds", "9", 9), // hole card → dealer has 19
    ];

    const result = (engine as any).resolveAgainstDealer(
      gameDetails,
      deck,
      4,
      100,
    );

    expect(result.resolved).toBe(true);
    expect(result.result).toBe(GameResult.LOSE);
    expect(result.payout).toBe(0);
  });

  it("push when totals are equal", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
      ],
      dealerUpCard: createCard("clubs", "10", 10),
      bets: [100],
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "8", 8),
      createCard("clubs", "10", 10),
      createCard("diamonds", "8", 8), // hole card → dealer has 18
    ];

    const result = (engine as any).resolveAgainstDealer(
      gameDetails,
      deck,
      4,
      100,
    );

    expect(result.resolved).toBe(true);
    expect(result.result).toBe(GameResult.WIN); // WIN with payout = bet means push
    expect(result.payout).toBe(100); // bet returned
  });

  it("pays insurance when dealer has blackjack", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
      ],
      dealerUpCard: createCard("clubs", "A", 11),
      bets: [100],
      insuranceBet: 50,
    });
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "8", 8),
      createCard("clubs", "A", 11),
      createCard("diamonds", "10", 10), // hole card → dealer blackjack
    ];

    const result = (engine as any).resolveAgainstDealer(
      gameDetails,
      deck,
      4,
      100,
    );

    expect(result.resolved).toBe(true);
    expect(result.payout).toBe(150); // insurance: 50 * (1 + 2) = 150
  });

  it("handles multiple split hands", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)], // 18
        [createCard("clubs", "9", 9), createCard("diamonds", "7", 7)], // 16
      ],
      dealerUpCard: createCard("clubs", "6", 6),
      bets: [100, 100],
    });
    // Dealer: 6 + 10 (hole at deck[3]) = 16 → hit 5 (deck[4]) → 21
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "8", 8),
      createCard("clubs", "9", 9),
      createCard("diamonds", "10", 10), // hole card at index 3 → dealer 16
      createCard("spades", "5", 5), // hit at index 4 → dealer 21
    ];

    const result = (engine as any).resolveAgainstDealer(
      gameDetails,
      deck,
      4,
      100,
    );

    expect(result.resolved).toBe(true);
    // Hand 0: 18 vs 21 → lose
    // Hand 1: 16 vs 21 → lose
    expect(result.result).toBe(GameResult.LOSE);
    expect(result.payout).toBe(0);
  });
});

/* ── BlackjackEngine natural blackjack scenarios ──────────────────────── */

describe("BlackjackEngine natural blackjack", () => {
  const engine = new BlackjackEngine();

  it("resolves immediately when player has natural blackjack", async () => {
    // Force a natural blackjack by using a known seed
    // We need to find a nonce where player gets blackjack
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      if (result.gameDetails.isNaturalBlackjack) {
        found = true;
        expect(result.result).toBe(GameResult.WIN);
        expect(result.payout).toBe(250); // 100 * 2.5 = 250
        expect(result.gameDetails.resolved).toBe(true);
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("resolves as push when both have blackjack", async () => {
    // This is extremely rare with random seeds, so we test via resolveAgainstDealer
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "A", 11), createCard("spades", "K", 10)],
      ],
      dealerUpCard: createCard("clubs", "A", 11),
      isNaturalBlackjack: true,
      bets: [100],
    });
    const deck = [
      createCard("hearts", "A", 11),
      createCard("spades", "K", 10),
      createCard("clubs", "A", 11),
      createCard("diamonds", "K", 10), // hole card → dealer blackjack
    ];

    const result = (engine as any).resolveAgainstDealer(
      gameDetails,
      deck,
      4,
      100,
    );

    expect(result.resolved).toBe(true);
    expect(result.payout).toBe(100); // push — bet returned
  });

  it("player loses when dealer has blackjack and player does not", async () => {
    // Find a nonce where dealer has blackjack but player doesn't
    let found = false;
    for (let nonce = 0; nonce < 1000; nonce++) {
      const round = createRound({ nonce });
      const result = await (engine as any).executeGame("user1", round);
      if (
        result.gameDetails.dealerHasBlackjack &&
        !result.gameDetails.isNaturalBlackjack
      ) {
        found = true;
        expect(result.result).toBe(GameResult.LOSE);
        expect(result.payout).toBe(0);
        expect(result.gameDetails.resolved).toBe(true);
        break;
      }
    }
    expect(found).toBe(true);
  });
});

/* ── BlackjackEngine dealer play ────────────────────────────────────── */

describe("BlackjackEngine dealer play", () => {
  const engine = new BlackjackEngine();

  it("dealer stands on soft 17", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
      ],
      dealerUpCard: createCard("clubs", "A", 11),
      bets: [100],
    });
    // Dealer: A + 6 = soft 17 → should stand (dealerHitsSoft17: false)
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "8", 8),
      createCard("clubs", "A", 11),
      createCard("diamonds", "6", 6), // hole card → soft 17
    ];

    const result = (engine as any).resolveAgainstDealer(
      gameDetails,
      deck,
      4,
      100,
    );

    expect(result.resolved).toBe(true);
    expect(gameDetails.dealerHand).toHaveLength(2); // no hit
  });

  it("dealer hits until 17+", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "8", 8)],
      ],
      dealerUpCard: createCard("clubs", "5", 5),
      bets: [100],
    });
    // Dealer: 5 + 9 = 14 → hit → 16 → hit → 18
    const deck = [
      createCard("hearts", "10", 10),
      createCard("spades", "8", 8),
      createCard("clubs", "5", 5),
      createCard("diamonds", "9", 9), // hole card → 14
      createCard("hearts", "2", 2), // hit → 16
      createCard("spades", "2", 2), // hit → 18
    ];

    const result = (engine as any).resolveAgainstDealer(
      gameDetails,
      deck,
      4,
      100,
    );

    expect(result.resolved).toBe(true);
    expect(gameDetails.dealerHand).toHaveLength(4);
  });
});

/* ── BlackjackEngine.updateAvailableActions ─────────────────────────── */

describe("BlackjackEngine.updateAvailableActions", () => {
  const engine = new BlackjackEngine();

  it("offers hit and stand on normal hand", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "10", 10), createCard("spades", "6", 6)],
      ],
    });

    (engine as any).updateAvailableActions(gameDetails);

    expect(gameDetails.availableActions).toContain("hit");
    expect(gameDetails.availableActions).toContain("stand");
    expect(gameDetails.availableActions).toContain("double");
    expect(gameDetails.availableActions).not.toContain("split");
  });

  it("offers split on pair", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [createCard("hearts", "8", 8), createCard("spades", "8", 8)],
      ],
    });

    (engine as any).updateAvailableActions(gameDetails);

    expect(gameDetails.availableActions).toContain("split");
  });

  it("removes all actions on bust", () => {
    const gameDetails = createGameDetails({
      playerHands: [
        [
          createCard("hearts", "10", 10),
          createCard("spades", "9", 9),
          createCard("clubs", "5", 5),
        ],
      ],
    });

    (engine as any).updateAvailableActions(gameDetails);

    expect(gameDetails.availableActions).toEqual([]);
  });
});
