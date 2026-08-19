import { useCallback, useEffect, useRef, useState } from "react";
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
  Sparkles,
  Info,
} from "lucide-react";

interface SlotsGameProps {
  demo?: boolean;
}

/* ── Symbol mapping ───────────────────────────────────────────────── */
const SYMBOL_MAP: Record<string, string> = {
  DIAMOND: "💎",
  SEVEN: "7️⃣",
  BELL: "🔔",
  CHERRY: "🍒",
  LEMON: "🍋",
  ORANGE: "🍊",
  A: "A",
  K: "K",
  Q: "Q",
  J: "J",
  "10": "10",
  WILD: "🃏",
  STAR: "🌟",
  BLANK: "",
};

const SYMBOL_KEYS = Object.keys(SYMBOL_MAP).filter(
  (k) => k !== "BLANK" && k !== "WILD" && k !== "STAR",
);

/* ── 20 payline patterns (row index per reel) ─────────────────────── */
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

const BET_PER_LINE_OPTIONS = [1, 5, 10, 25, 50, 100, 250, 500];

/* ── Helpers ──────────────────────────────────────────────────────── */
function generateClientSeed(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getRandomSymbol(): string {
  const key = SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)];
  return SYMBOL_MAP[key] ?? "?";
}

/* ── Component ────────────────────────────────────────────────────── */
export default function SlotsGame({ demo = false }: SlotsGameProps) {
  const [activePaylines, setActivePaylines] = useState<Set<number>>(
    () => new Set(Array.from({ length: 20 }, (_, i) => i)),
  );
  const [betPerLine, setBetPerLine] = useState(10);
  const [isSpinning, setIsSpinning] = useState(false);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [clientSeed, setClientSeed] = useState("");
  const [serverSeedHash, setServerSeedHash] = useState("");
  const [lastResult, setLastResult] = useState<{
    result: string;
    payout: number;
    newBalance: number;
  } | null>(null);
  const [freeSpins, setFreeSpins] = useState(0);
  const [showFreeSpinsOverlay, setShowFreeSpinsOverlay] = useState(false);
  const [reelSymbols, setReelSymbols] = useState<string[][]>(() =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => getRandomSymbol()),
    ),
  );
  const [winningPaylines, setWinningPaylines] = useState<Set<number>>(
    new Set(),
  );
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifySeed, setVerifySeed] = useState("");
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean;
    computedHash: string;
    expectedHash: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reelTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const totalBet = betPerLine * activePaylines.size;

  const { data: wallet } = useGameWallet(demo);
  const placeBet = usePlaceBet();
  const { data: roundData } = useGetRound(roundId ?? 0, {
    query: {
      queryKey: [`/api/rounds/${roundId ?? 0}`],
      enabled: !!roundId && !isSpinning,
    },
  });
  const verifyRound = useVerifyRound();

  /* ── Spin animation helpers ─────────────────────────────────────── */
  const startSpinAnimation = useCallback(() => {
    setIsSpinning(true);
    setWinningPaylines(new Set());
    setLastResult(null);
    setErrorMsg(null);

    // Randomize symbols rapidly during spin
    const interval = setInterval(() => {
      setReelSymbols(
        Array.from({ length: 5 }, () =>
          Array.from({ length: 3 }, () => getRandomSymbol()),
        ),
      );
    }, 80);

    // Stop each reel with staggered delay
    const stopDelays = [600, 900, 1200, 1500, 1800];
    stopDelays.forEach((delay) => {
      const timer = setTimeout(() => {
        // This reel stops; we keep the others spinning visually
        // In practice, we just let the interval run until all stop
      }, delay);
      reelTimersRef.current.push(timer);
    });

    // Clear interval after all reels stop
    const clearTimer = setTimeout(() => {
      clearInterval(interval);
    }, 2000);
    reelTimersRef.current.push(clearTimer);

    return interval;
  }, []);

  const clearSpinTimers = useCallback(() => {
    reelTimersRef.current.forEach(clearTimeout);
    reelTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearSpinTimers();
  }, [clearSpinTimers]);

  /* ── Handle spin result ───────────────────────────────────────── */
  useEffect(() => {
    if (!roundData || isSpinning) return;

    // Derive a deterministic display from the round data for visual consistency
    const seed = `${roundData.clientSeed}:${roundData.serverSeedHash}`;
    const derivedSymbols: string[][] = [];
    for (let r = 0; r < 5; r++) {
      const col: string[] = [];
      for (let row = 0; row < 3; row++) {
        // Simple deterministic hash for visual display only
        const hash = Array.from(seed + r + row).reduce(
          (a, c) => a + c.charCodeAt(0),
          0,
        );
        const idx = hash % SYMBOL_KEYS.length;
        col.push(SYMBOL_MAP[SYMBOL_KEYS[idx]] ?? "?");
      }
      derivedSymbols.push(col);
    }
    setReelSymbols(derivedSymbols);

    // Highlight paylines on win
    if (roundData.result === "WIN" && roundData.payout > 0) {
      const active = Array.from(activePaylines);
      const winCount = Math.min(
        Math.max(1, Math.floor(roundData.payout / (betPerLine * 10))),
        active.length,
      );
      const winners = new Set(active.slice(0, winCount));
      setWinningPaylines(winners);
    } else {
      setWinningPaylines(new Set());
    }
  }, [roundData, isSpinning, activePaylines, betPerLine]);

  /* ── Spin handler ─────────────────────────────────────────────── */
  async function handleSpin() {
    if (isSpinning) return;
    if (totalBet < 1) {
      setErrorMsg("Bet amount must be at least 1 cent.");
      return;
    }
    if (!demo && wallet && wallet.balance < totalBet) {
      setErrorMsg("Insufficient balance.");
      return;
    }

    const seed = generateClientSeed();
    setClientSeed(seed);
    setRoundId(null);
    setLastResult(null);
    setErrorMsg(null);

    const interval = startSpinAnimation();

    try {
      const payload: BetRequest = {
        gameType: "slots",
        betAmount: totalBet,
        clientSeed: seed,
        gameParams: {
          paylines: Array.from(activePaylines),
          demo,
        },
      };

      const res = await placeBet.mutateAsync({ data: payload });
      setRoundId(res.roundId);
      setServerSeedHash(res.serverSeedHash);
      setLastResult({
        result: res.result,
        payout: res.payout,
        newBalance: res.newBalance,
      });

      // Free spins detection (visual only — server is authority)
      if (res.result === "WIN" && res.payout > totalBet * 5) {
        setFreeSpins((prev) => prev + 10);
        setShowFreeSpinsOverlay(true);
        setTimeout(() => setShowFreeSpinsOverlay(false), 3000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Spin failed";
      setErrorMsg(msg);
    } finally {
      clearInterval(interval);
      clearSpinTimers();
      setIsSpinning(false);
    }
  }

  /* ── Payline toggle ───────────────────────────────────────────── */
  function togglePayline(index: number) {
    setActivePaylines((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        if (next.size > 1) next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function setAllPaylines(active: boolean) {
    if (active) {
      setActivePaylines(new Set(Array.from({ length: 20 }, (_, i) => i)));
    } else {
      setActivePaylines(new Set([1])); // keep middle line
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

      {/* Free spins overlay */}
      {showFreeSpinsOverlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="glass-strong rounded-2xl px-8 py-6 text-center animate-pulse-glow">
            <Sparkles className="h-10 w-10 text-primary mx-auto mb-2" />
            <h3 className="text-2xl font-bold text-gradient-gold mb-1">
              Free Spins!
            </h3>
            <p className="text-white font-medium">{freeSpins} remaining</p>
          </div>
        </div>
      )}

      {/* Result overlay */}
      {lastResult && !isSpinning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
          <Badge
            variant={lastResult.payout > 0 ? "default" : "destructive"}
            className={`text-sm px-4 py-1.5 font-bold ${
              lastResult.payout > 0
                ? "bg-primary/20 text-primary border-primary/40"
                : ""
            }`}
          >
            {lastResult.payout > 0
              ? `WIN ${formatCents(lastResult.payout)}`
              : lastResult.result}
          </Badge>
        </div>
      )}

      {/* Reel grid */}
      <div className="casino-card p-4 sm:p-6 mb-4 relative overflow-hidden">
        {/* Payline SVG overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {Array.from(winningPaylines).map((pi) => {
            const line = PAYLINES[pi];
            if (!line) return null;
            const points = line
              .map((row, reel) => {
                const x = (reel + 0.5) * (100 / 5);
                const y = (row + 0.5) * (100 / 3);
                return `${x},${y}`;
              })
              .join(" ");
            return (
              <polyline
                key={pi}
                points={points}
                fill="none"
                stroke="rgba(234,179,8,0.8)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-pulse-glow"
              />
            );
          })}
        </svg>

        <div className="grid grid-cols-5 gap-1 sm:gap-2 relative z-0">
          {reelSymbols.map((col, reelIndex) =>
            col.map((symbol, rowIndex) => {
              const isWinning = Array.from(winningPaylines).some((pi) => {
                const line = PAYLINES[pi];
                return line && line[reelIndex] === rowIndex;
              });
              return (
                <div
                  key={`${reelIndex}-${rowIndex}`}
                  className={`aspect-square flex items-center justify-center rounded-lg text-2xl sm:text-4xl font-bold transition-all duration-300 select-none ${
                    isSpinning
                      ? "bg-muted/50 blur-[1px]"
                      : isWinning
                        ? "bg-primary/20 border-2 border-primary/60 shadow-[0_0_12px_rgba(234,179,8,0.4)]"
                        : "bg-card/80 border border-white/5"
                  }`}
                >
                  <span
                    className={
                      isSpinning
                        ? "opacity-70"
                        : isWinning
                          ? "text-gradient-gold scale-110 transition-transform"
                          : "text-white"
                    }
                  >
                    {symbol || "·"}
                  </span>
                </div>
              );
            }),
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="casino-card p-4 sm:p-6 mb-4">
        {/* Error */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-red-400 flex items-center gap-2">
            <Info className="h-4 w-4 flex-shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Bet per line */}
        <div className="mb-4">
          <label className="block text-sm text-muted-foreground mb-2">
            Bet Per Line
          </label>
          <div className="flex flex-wrap gap-2">
            {BET_PER_LINE_OPTIONS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setBetPerLine(amount)}
                className={`px-3 py-1.5 rounded-md text-sm font-bold transition-colors ${
                  betPerLine === amount
                    ? "bg-primary text-primary-foreground"
                    : "bg-card/50 text-white border border-white/10 hover:border-primary/50"
                }`}
              >
                {formatCents(amount)}
              </button>
            ))}
          </div>
        </div>

        {/* Paylines */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-muted-foreground">
              Active Paylines:{" "}
              <span className="text-white font-bold">
                {activePaylines.size}
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAllPaylines(true)}
                className="text-xs text-primary hover:text-primary/80 underline"
              >
                All 20
              </button>
              <button
                type="button"
                onClick={() => setAllPaylines(false)}
                className="text-xs text-muted-foreground hover:text-white underline"
              >
                1 Line
              </button>
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {PAYLINES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => togglePayline(i)}
                className={`h-7 rounded text-xs font-bold transition-colors ${
                  activePaylines.has(i)
                    ? "bg-primary/30 text-primary border border-primary/50"
                    : "bg-card/50 text-muted-foreground border border-white/5 hover:border-white/20"
                }`}
                aria-label={`Toggle payline ${i + 1}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Total bet + Spin */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-3 bg-card/50 border border-white/5 rounded-xl px-4 py-3">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total Bet</p>
              <p className="text-lg font-black text-white">
                {formatCents(totalBet)}
              </p>
            </div>
          </div>

          <Button
            onClick={handleSpin}
            disabled={isSpinning || placeBet.isPending}
            className="flex-1 w-full sm:w-auto h-14 text-lg font-bold shadow-[0_0_16px_rgba(234,179,8,0.3)]"
          >
            {isSpinning || placeBet.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                SPIN
              </>
            )}
          </Button>

          <div className="flex items-center gap-3 bg-card/50 border border-white/5 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-lg font-black text-white">
                {demo
                  ? formatCents(10000)
                  : wallet
                    ? formatCents(wallet.balance)
                    : "—"}
              </p>
            </div>
          </div>
        </div>
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
            Spin to generate a provably fair round. The server seed hash will be
            displayed here.
          </p>
        )}
      </div>
    </div>
  );
}
