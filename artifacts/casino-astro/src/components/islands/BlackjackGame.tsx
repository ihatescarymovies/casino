import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameWallet } from "@/hooks/use-game-wallet";
import {
  usePlaceBet,
  useGetRound,
  useVerifyRound,
  type BetRequest,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/formatters";
import {
  Loader2,
  ShieldCheck,
  ShieldX,
  Coins,
  Info,
  Hand,
  Swords,
  Split,
  CircleDollarSign,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/config";

interface BlackjackGameProps {
  demo?: boolean;
}

/* ── Types ──────────────────────────────────────────────────────── */
interface Card {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank: string;
}

interface GameActionResponse {
  result: string;
  payout: number;
  gameDetails?: {
    playerHands?: Card[][];
    dealerHand?: Card[];
    availableActions?: string[];
    resolved?: boolean;
  };
}

/* ── Constants ────────────────────────────────────────────────────── */
const CHIP_VALUES = [100, 500, 1000, 2500, 5000, 10000];

const SUIT_ICONS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const SUIT_COLORS: Record<string, string> = {
  hearts: "text-red-400",
  diamonds: "text-red-400",
  clubs: "text-white",
  spades: "text-white",
};

/* ── Helpers ────────────────────────────────────────────────────── */
function generateClientSeed(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getCsrfToken(): string | undefined {
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("csrf-token="))
    ?.split("=")[1];
}

/* ── Card Component ─────────────────────────────────────────────── */
function CardView({
  card,
  faceDown = false,
  small = false,
}: {
  card?: Card;
  faceDown?: boolean;
  small?: boolean;
}) {
  if (faceDown) {
    return (
      <div
        className={`relative rounded-lg border-2 border-white/20 bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center select-none ${
          small ? "w-10 h-14 sm:w-12 sm:h-16" : "w-14 h-20 sm:w-20 sm:h-28"
        }`}
      >
        <div
          className={`rounded-md bg-primary/20 ${
            small ? "w-6 h-8" : "w-8 h-12 sm:w-12 sm:h-16"
          }`}
        />
      </div>
    );
  }

  const suitIcon = card ? (SUIT_ICONS[card.suit] ?? "?") : "?";
  const colorClass = card
    ? (SUIT_COLORS[card.suit] ?? "text-white")
    : "text-white";

  return (
    <div
      className={`relative rounded-lg border border-white/20 bg-card flex flex-col items-center justify-center select-none shadow-md ${
        small ? "w-10 h-14 sm:w-12 sm:h-16" : "w-14 h-20 sm:w-20 sm:h-28"
      }`}
    >
      <span
        className={`font-bold ${
          small ? "text-sm" : "text-lg sm:text-2xl"
        } ${colorClass}`}
      >
        {card?.rank ?? "?"}
      </span>
      <span
        className={`${small ? "text-xs" : "text-sm sm:text-lg"} ${colorClass}`}
      >
        {suitIcon}
      </span>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function BlackjackGame({ demo = false }: BlackjackGameProps) {
  const [betAmount, setBetAmount] = useState(1000);
  const [customBet, setCustomBet] = useState("");
  const [gameState, setGameState] = useState<
    "betting" | "dealing" | "playing" | "resolved"
  >("betting");
  const [roundId, setRoundId] = useState<number | null>(null);
  const [clientSeed, setClientSeed] = useState("");
  const [serverSeedHash, setServerSeedHash] = useState("");
  const [lastResult, setLastResult] = useState<{
    result: string;
    payout: number;
    newBalance: number;
  } | null>(null);
  const [playerHands, setPlayerHands] = useState<Card[][]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [dealerRevealed, setDealerRevealed] = useState(false);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [activeHandIndex] = useState(0);
  const [isPair, setIsPair] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifySeed, setVerifySeed] = useState("");
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean;
    computedHash: string;
    expectedHash: string;
  } | null>(null);

  const actionAbortRef = useRef<AbortController | null>(null);

  const effectiveBet = customBet
    ? Math.max(1, Math.round(parseFloat(customBet) * 100))
    : betAmount;

  const { data: wallet } = useGameWallet(demo);
  const placeBet = usePlaceBet();
  const { data: roundData } = useGetRound(roundId ?? 0, {
    query: {
      queryKey: [`/api/rounds/${roundId ?? 0}`],
      enabled: !!roundId && gameState !== "betting",
      refetchInterval: gameState === "playing" ? 2000 : false,
    },
  });
  const verifyRound = useVerifyRound();

  /* ── Parse round data for card state ────────────────────────────── */
  useEffect(() => {
    if (!roundData) return;

    // Try to parse details if present (future API enhancement)
    const details = (roundData as unknown as Record<string, unknown>)
      .details as Record<string, unknown> | undefined;

    if (details) {
      const pHands = details.playerHands as Card[][] | undefined;
      const dHand = details.dealerHand as Card[] | undefined;
      const actions = details.availableActions as string[] | undefined;
      const resolved = details.resolved as boolean | undefined;

      if (pHands) setPlayerHands(pHands);
      if (dHand) setDealerHand(dHand);
      if (actions) setAvailableActions(actions);
      if (resolved !== undefined) {
        setDealerRevealed(resolved);
        if (resolved) setGameState("resolved");
      }
    }

    // State machine based on result
    if (roundData.result === "PENDING") {
      setGameState("playing");
      setDealerRevealed(false);
    } else if (
      roundData.result === "WIN" ||
      roundData.result === "LOSE" ||
      roundData.result === "PUSH" ||
      roundData.result === "BLACKJACK"
    ) {
      setGameState("resolved");
      setDealerRevealed(true);
      setAvailableActions([]);
    }
  }, [roundData]);

  /* ── Generate deterministic demo cards ────────────────────────── */
  const generateDemoCards = useCallback(
    (seed: string, forPlayer: boolean): Card[] => {
      const suits: Card["suit"][] = ["hearts", "diamonds", "clubs", "spades"];
      const ranks = [
        "A",
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
      ];
      const hash = Array.from(seed + (forPlayer ? "p" : "d")).reduce(
        (a, c) => a + c.charCodeAt(0),
        0,
      );
      const cards: Card[] = [];
      for (let i = 0; i < (forPlayer ? 2 : 2); i++) {
        const suitIdx = (hash + i * 7) % suits.length;
        const rankIdx = (hash + i * 13 + 3) % ranks.length;
        cards.push({ suit: suits[suitIdx], rank: ranks[rankIdx] });
      }
      return cards;
    },
    [],
  );

  /* ── Deal handler ─────────────────────────────────────────────── */
  async function handleDeal() {
    if (gameState !== "betting") return;
    if (effectiveBet < 1) {
      setErrorMsg("Minimum bet is 1 cent.");
      return;
    }
    if (!demo && wallet && wallet.balance < effectiveBet) {
      setErrorMsg("Insufficient balance.");
      return;
    }

    const seed = generateClientSeed();
    setClientSeed(seed);
    setRoundId(null);
    setLastResult(null);
    setErrorMsg(null);
    setGameState("dealing");
    setPlayerHands([]);
    setDealerHand([]);
    setDealerRevealed(false);
    setAvailableActions([]);

    try {
      const payload: BetRequest = {
        gameType: "blackjack",
        betAmount: effectiveBet,
        clientSeed: seed,
        gameParams: { demo },
      };

      const res = await placeBet.mutateAsync({ data: payload });
      setRoundId(res.roundId);
      setServerSeedHash(res.serverSeedHash);
      setLastResult({
        result: res.result,
        payout: res.payout,
        newBalance: res.newBalance,
      });

      // Generate visual cards for display (not game logic)
      const pCards = generateDemoCards(seed + res.serverSeedHash, true);
      const dCards = generateDemoCards(seed + res.serverSeedHash, false);
      setPlayerHands([pCards]);
      setDealerHand(dCards);
      setIsPair(pCards.length === 2 && pCards[0].rank === pCards[1].rank);

      if (res.result === "PENDING") {
        setGameState("playing");
        setAvailableActions([
          "hit",
          "stand",
          "double",
          ...(isPair ? ["split"] : []),
        ]);
      } else {
        setGameState("resolved");
        setDealerRevealed(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deal failed";
      setErrorMsg(msg);
      setGameState("betting");
    }
  }

  /* ── Action handler ───────────────────────────────────────────── */
  async function handleAction(action: "hit" | "stand" | "double" | "split") {
    if (!roundId || gameState !== "playing") return;

    setErrorMsg(null);
    actionAbortRef.current?.abort();
    const controller = new AbortController();
    actionAbortRef.current = controller;

    try {
      const csrf = getCsrfToken();
      const res = await fetch(`${API_BASE_URL}/api/rounds/${roundId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ action, handIndex: activeHandIndex }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : `Action failed (${res.status})`,
        );
      }

      const data = (await res.json()) as GameActionResponse;

      // Update visual state from response
      if (data.gameDetails) {
        if (data.gameDetails.playerHands) {
          setPlayerHands(data.gameDetails.playerHands);
        }
        if (data.gameDetails.dealerHand) {
          setDealerHand(data.gameDetails.dealerHand);
        }
        if (data.gameDetails.availableActions) {
          setAvailableActions(data.gameDetails.availableActions);
        }
        if (data.gameDetails.resolved) {
          setGameState("resolved");
          setDealerRevealed(true);
        }
      }

      setLastResult({
        result: data.result,
        payout: data.payout,
        newBalance: wallet?.balance ?? 0,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Action failed";
      setErrorMsg(msg);
    }
  }

  /* ── Provably fair verify ─────────────────────────────────────── */
  async function handleVerify() {
    if (!roundId || !verifySeed) return;
    try {
      const res = await verifyRound.mutateAsync({
        id: roundId,
        data: { roundId, serverSeed: verifySeed },
      });
      setVerifyResult(res);
    } catch (err) {
      setVerifyResult({
        verified: false,
        computedHash: "",
        expectedHash: serverSeedHash,
      });
    }
  }

  /* ── Derived UI state ─────────────────────────────────────────── */
  const currentPlayerHand = playerHands[activeHandIndex] ?? [];
  const canSplit =
    gameState === "playing" &&
    currentPlayerHand.length === 2 &&
    currentPlayerHand[0]?.rank === currentPlayerHand[1]?.rank;

  const resultOverlay = useMemo(() => {
    if (gameState !== "resolved" || !lastResult) return null;
    const isWin = lastResult.payout > 0 && lastResult.result === "WIN";
    const isPush =
      lastResult.result === "PUSH" ||
      (lastResult.payout > 0 && lastResult.result !== "WIN");
    const isBlackjack = lastResult.result === "BLACKJACK";

    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="glass-strong rounded-2xl px-8 py-6 text-center animate-pulse-glow">
          {isBlackjack ? (
            <>
              <h3 className="text-3xl font-black text-gradient-gold mb-2">
                BLACKJACK!
              </h3>
              <p className="text-xl text-white font-bold">
                {formatCents(lastResult.payout)}
              </p>
            </>
          ) : isWin ? (
            <>
              <h3 className="text-3xl font-black text-green-400 mb-2">WIN</h3>
              <p className="text-xl text-white font-bold">
                +{formatCents(lastResult.payout)}
              </p>
            </>
          ) : isPush ? (
            <>
              <h3 className="text-3xl font-black text-primary mb-2">PUSH</h3>
              <p className="text-lg text-white">Bet returned</p>
            </>
          ) : (
            <>
              <h3 className="text-3xl font-black text-red-400 mb-2">LOSE</h3>
              <p className="text-lg text-muted-foreground">
                Better luck next hand
              </p>
            </>
          )}
          <Button
            onClick={() => {
              setGameState("betting");
              setRoundId(null);
              setLastResult(null);
              setPlayerHands([]);
              setDealerHand([]);
              setDealerRevealed(false);
              setAvailableActions([]);
            }}
            className="mt-4"
          >
            Play Again
          </Button>
        </div>
      </div>
    );
  }, [gameState, lastResult]);

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* DEMO MODE banner */}
      {demo && (
        <div className="mb-4 rounded-lg bg-warning/20 border border-warning/40 px-4 py-2 text-center">
          <span className="text-warning font-bold tracking-wider uppercase text-sm">
            DEMO MODE — No real money
          </span>
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-red-400 flex items-center gap-2">
          <Info className="h-4 w-4 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="casino-card p-4 sm:p-6 mb-4 relative overflow-hidden min-h-[400px] flex flex-col">
        {resultOverlay}

        {/* Dealer area */}
        <div className="flex-1 flex flex-col items-center justify-start mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="secondary" className="text-xs">
              Dealer
            </Badge>
            {dealerRevealed && dealerHand.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {dealerHand.length} cards
              </span>
            )}
          </div>
          <div className="flex gap-2 justify-center">
            {dealerHand.length > 0 ? (
              <>
                <CardView card={dealerHand[0]} />
                <CardView
                  card={dealerRevealed ? dealerHand[1] : undefined}
                  faceDown={!dealerRevealed}
                />
                {dealerRevealed &&
                  dealerHand
                    .slice(2)
                    .map((card, i) => <CardView key={i} card={card} />)}
              </>
            ) : (
              <>
                <div className="w-14 h-20 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-white/10" />
                <div className="w-14 h-20 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-white/10" />
              </>
            )}
          </div>
        </div>

        {/* Player area */}
        <div className="flex flex-col items-center justify-end">
          {playerHands.length > 1 && (
            <div className="flex gap-4 mb-2">
              {playerHands.map((_, i) => (
                <Badge
                  key={i}
                  variant={i === activeHandIndex ? "default" : "secondary"}
                  className="text-xs"
                >
                  Hand {i + 1}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2 justify-center mb-4">
            {currentPlayerHand.length > 0 ? (
              currentPlayerHand.map((card, i) => (
                <CardView key={i} card={card} />
              ))
            ) : (
              <>
                <div className="w-14 h-20 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-white/10" />
                <div className="w-14 h-20 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-white/10" />
              </>
            )}
          </div>

          {/* Action buttons */}
          {gameState === "playing" && (
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                onClick={() => handleAction("hit")}
                disabled={!availableActions.includes("hit")}
                variant="outline"
                className="min-w-[80px]"
              >
                <Hand className="h-4 w-4 mr-1" />
                Hit
              </Button>
              <Button
                onClick={() => handleAction("stand")}
                disabled={!availableActions.includes("stand")}
                variant="outline"
                className="min-w-[80px]"
              >
                <Swords className="h-4 w-4 mr-1" />
                Stand
              </Button>
              <Button
                onClick={() => handleAction("double")}
                disabled={!availableActions.includes("double")}
                variant="outline"
                className="min-w-[80px]"
              >
                <CircleDollarSign className="h-4 w-4 mr-1" />
                Double
              </Button>
              <Button
                onClick={() => handleAction("split")}
                disabled={!canSplit || !availableActions.includes("split")}
                variant="outline"
                className="min-w-[80px]"
              >
                <Split className="h-4 w-4 mr-1" />
                Split
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bet controls */}
      {gameState === "betting" && (
        <div className="casino-card p-4 sm:p-6 mb-4">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Place Your Bet
          </h3>

          {/* Chip selector */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
            {CHIP_VALUES.map((cents) => {
              const selected = betAmount === cents && !customBet;
              return (
                <button
                  key={cents}
                  type="button"
                  onClick={() => {
                    setBetAmount(cents);
                    setCustomBet("");
                  }}
                  className={`relative py-4 rounded-full border-4 text-center font-black transition-all ${
                    selected
                      ? "bg-primary/20 border-primary text-primary shadow-[0_0_16px_rgba(234,179,8,0.4)] scale-110"
                      : "bg-card/50 border-white/10 text-white hover:border-primary/50 hover:scale-105"
                  }`}
                >
                  <span className="text-sm sm:text-base">
                    {formatCents(cents)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom bet */}
          <div className="mb-6">
            <label className="block text-sm text-muted-foreground mb-2">
              Or enter custom amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                $
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={customBet}
                onChange={(e) => setCustomBet(e.target.value)}
                className="w-full pl-8 pr-4 py-3 bg-card/50 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Deal button */}
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Bet: </span>
              <span className="text-white font-bold text-lg">
                {formatCents(effectiveBet)}
              </span>
            </div>
            <Button
              onClick={handleDeal}
              disabled={placeBet.isPending || effectiveBet < 1}
              className="h-12 px-8 text-lg font-bold shadow-[0_0_16px_rgba(234,179,8,0.3)]"
            >
              {placeBet.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>Deal</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Game info bar */}
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="text-sm">
          <span className="text-muted-foreground">Balance: </span>
          <span className="text-white font-bold">
            {demo
              ? formatCents(10000)
              : wallet
                ? formatCents(wallet.balance)
                : "—"}
          </span>
        </div>
        {lastResult && gameState !== "betting" && (
          <Badge
            variant={
              lastResult.result === "WIN" || lastResult.result === "BLACKJACK"
                ? "default"
                : "destructive"
            }
            className="text-xs"
          >
            {lastResult.result}
            {lastResult.payout > 0 && ` ${formatCents(lastResult.payout)}`}
          </Badge>
        )}
      </div>

      {/* Provably Fair panel */}
      <div className="casino-card p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-white">Provably Fair</h3>
        </div>

        {serverSeedHash ? (
          <div className="space-y-3">
            <div className="bg-card/50 border border-white/5 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">
                Server Seed Hash
              </p>
              <code className="text-xs text-primary break-all font-mono">
                {serverSeedHash}
              </code>
            </div>
            <div className="bg-card/50 border border-white/5 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Client Seed</p>
              <code className="text-xs text-primary break-all font-mono">
                {clientSeed}
              </code>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setVerifyOpen((v) => !v)}
                className="btn btn-secondary text-sm"
              >
                {verifyOpen ? "Hide" : "Verify Fairness"}
              </button>
            </div>

            {verifyOpen && (
              <div className="bg-card/50 border border-white/5 rounded-lg p-3 space-y-2">
                <label className="block text-sm text-muted-foreground">
                  Enter revealed server seed to verify:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verifySeed}
                    onChange={(e) => setVerifySeed(e.target.value)}
                    placeholder="Revealed server seed..."
                    className="flex-1 px-3 py-2 bg-background border border-white/10 rounded-md text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifyRound.isPending || !verifySeed}
                    className="btn btn-primary text-sm"
                  >
                    {verifyRound.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {verifyResult && (
                  <div
                    className={`flex items-center gap-2 text-sm ${
                      verifyResult.verified ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {verifyResult.verified ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <ShieldX className="h-4 w-4" />
                    )}
                    {verifyResult.verified
                      ? "Verified — hash matches!"
                      : "Verification failed — hash mismatch."}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Deal a hand to generate a provably fair round. The server seed hash
            will be displayed here.
          </p>
        )}
      </div>
    </div>
  );
}
