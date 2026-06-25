import { createHash } from "node:crypto";
import {
  BaseGameEngine,
  GameResult,
  type GameRoundData,
} from "../../lib/game-engine";

const SYMBOL_TABLE = [
  { symbol: "DIAMOND", payout: { 3: 50, 4: 200, 5: 1000 } },
  { symbol: "SEVEN", payout: { 3: 25, 4: 100, 5: 500 } },
  { symbol: "BELL", payout: { 3: 15, 4: 50, 5: 250 } },
  { symbol: "CHERRY", payout: { 3: 10, 4: 30, 5: 150 } },
  { symbol: "LEMON", payout: { 3: 8, 4: 25, 5: 100 } },
  { symbol: "ORANGE", payout: { 3: 6, 4: 20, 5: 80 } },
  { symbol: "A", payout: { 3: 4, 4: 10, 5: 50 } },
  { symbol: "K", payout: { 3: 3, 4: 8, 5: 40 } },
  { symbol: "Q", payout: { 3: 2, 4: 6, 5: 30 } },
  { symbol: "J", payout: { 3: 2, 4: 5, 5: 25 } },
  { symbol: "10", payout: { 3: 1, 4: 4, 5: 20 } },
];

const WILD_SYMBOL = "WILD";
const SCATTER_SYMBOL = "STAR";
const BLANK_SYMBOL = "BLANK";

const PAYOUT_MAP = new Map<string, Record<string, number>>(
  SYMBOL_TABLE.map((s) => [s.symbol, s.payout]),
);

function buildReel(symbols: string[]): string[] {
  const length = 65;
  const reel = new Array(length).fill(BLANK_SYMBOL);
  const step = length / symbols.length;
  for (let i = 0; i < symbols.length; i++) {
    const pos = Math.floor(i * step);
    reel[pos] = symbols[i];
  }
  return reel;
}

const BASE_REELS: string[][] = [
  buildReel([
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
  buildReel([
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
  buildReel([
    "WILD",
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
  buildReel([
    "WILD",
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
  buildReel([
    "WILD",
    "WILD",
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
];

const FREE_REELS: string[][] = [
  buildReel([
    "WILD",
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
  buildReel([
    "WILD",
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
  buildReel([
    "WILD",
    "WILD",
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
  buildReel([
    "WILD",
    "WILD",
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
  buildReel([
    "WILD",
    "WILD",
    "WILD",
    "WILD",
    "10",
    "10",
    "10",
    "J",
    "J",
    "J",
    "Q",
    "Q",
    "Q",
    "K",
    "K",
    "K",
    "A",
    "A",
    "A",
    "ORANGE",
    "ORANGE",
    "ORANGE",
    "LEMON",
    "LEMON",
    "LEMON",
    "CHERRY",
    "CHERRY",
    "CHERRY",
    "BELL",
    "BELL",
    "BELL",
    "SEVEN",
    "SEVEN",
    "SEVEN",
    "DIAMOND",
    "DIAMOND",
    "DIAMOND",
  ]),
];

const PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 0, 1, 0],
  [1, 0, 1, 0, 1],
  [2, 1, 2, 1, 2],
  [0, 0, 1, 1, 2],
  [2, 2, 1, 1, 0],
  [1, 2, 1, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [1, 0, 2, 0, 1],
  [1, 2, 0, 2, 1],
  [0, 0, 2, 2, 0],
];

function seededRandom(
  seed: string,
  nonce: number,
  reel: number,
  pos: number,
): number {
  const hash = createHash("sha256")
    .update(`${seed}:${nonce}:${reel}:${pos}`)
    .digest("hex");
  return parseInt(hash.slice(0, 8), 16);
}

export class SlotsEngine extends BaseGameEngine {
  readonly gameType = "slots";
  readonly config = {
    minBet: 1,
    maxBet: 100000,
    rtp: 0.96,
    rules: {
      reels: 5,
      rows: 3,
      paylines: 20,
      volatility: "medium",
    },
  };

  protected async executeGame(
    _userId: string,
    round: GameRoundData,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails: Record<string, unknown>;
  }> {
    const seed = `${round.clientSeed}:${round.serverSeedHash}`;
    const isFreeSpin = false;
    const reels = isFreeSpin ? FREE_REELS : BASE_REELS;
    const multiplier = isFreeSpin ? 2 : 1;

    const visibleReels: string[][] = [];
    for (let r = 0; r < reels.length; r++) {
      const strip = reels[r];
      const rand = seededRandom(seed, round.nonce, r, 0);
      const start = rand % strip.length;
      const visible: string[] = [];
      for (let row = 0; row < 3; row++) {
        const idx = (start + row) % strip.length;
        const scatterRand = seededRandom(seed, round.nonce, r, row + 1);
        if (scatterRand % 64 === 0) {
          visible.push(SCATTER_SYMBOL);
        } else {
          visible.push(strip[idx]);
        }
      }
      visibleReels.push(visible);
    }

    const paylineWins: {
      line: number;
      symbol: string;
      count: number;
      payout: number;
    }[] = [];

    for (let p = 0; p < PAYLINES.length; p++) {
      const line = PAYLINES[p];
      const symbols = line.map((row, reel) => visibleReels[reel][row]);
      const win = this.evaluatePayline(symbols);
      if (win) {
        paylineWins.push({
          line: p + 1,
          symbol: win.symbol,
          count: win.count,
          payout: win.payout * round.betAmount * multiplier,
        });
      }
    }

    let scatterCount = 0;
    for (let r = 0; r < 5; r++) {
      for (let row = 0; row < 3; row++) {
        if (visibleReels[r][row] === SCATTER_SYMBOL) {
          scatterCount++;
        }
      }
    }
    const freeSpinsAwarded = !isFreeSpin && scatterCount >= 3 ? 10 : 0;

    const totalWin = paylineWins.reduce((sum, w) => sum + w.payout, 0);

    return {
      result: totalWin > 0 ? GameResult.WIN : GameResult.LOSE,
      payout: totalWin,
      gameDetails: {
        reels: visibleReels,
        paylines: paylineWins,
        totalWin,
        freeSpinsAwarded,
        freeSpinsMultiplier: multiplier,
        isFreeSpin,
      },
    };
  }

  private evaluatePayline(symbols: string[]): {
    symbol: string;
    count: number;
    payout: number;
  } | null {
    if (symbols.length !== 5) return null;

    let effectiveSymbol: string | null = null;
    for (const sym of symbols) {
      if (
        sym !== WILD_SYMBOL &&
        sym !== SCATTER_SYMBOL &&
        sym !== BLANK_SYMBOL
      ) {
        effectiveSymbol = sym;
        break;
      }
    }
    if (!effectiveSymbol) {
      effectiveSymbol = "DIAMOND";
    }

    let count = 0;
    for (const sym of symbols) {
      if (sym === effectiveSymbol || sym === WILD_SYMBOL) {
        count++;
      } else {
        break;
      }
    }

    if (count < 3) return null;

    const payoutTable = PAYOUT_MAP.get(effectiveSymbol);
    if (!payoutTable || !payoutTable[count]) return null;

    return {
      symbol: effectiveSymbol,
      count,
      payout: payoutTable[count],
    };
  }
}
