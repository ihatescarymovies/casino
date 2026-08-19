import { useState, useEffect, useRef, useCallback } from "react";
import { useGameWallet } from "@/hooks/use-game-wallet";
import { usePlaceBet } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatCents } from "@/lib/formatters";
import {
  Loader2,
  TrendingUp,
  AlertTriangle,
  Users,
  History,
  Zap,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface CrashTick {
  multiplier: number;
  elapsed: number;
}

interface CrashCrashed {
  crashPoint: number;
  busted: string[];
}

interface CrashCashedOut {
  userId: string;
  roundId: number;
  multiplier: number;
  payout: number;
}

interface PlayerBet {
  userId: string;
  betAmount: number;
  cashedOutAt?: number;
}

interface RoundHistoryEntry {
  crashPoint: number;
  timestamp: number;
}

interface GraphPoint {
  time: number;
  multiplier: number;
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function formatMultiplier(m: number): string {
  return `${m.toFixed(2)}x`;
}

function generateClientSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ─── Component ───────────────────────────────────────────────────── */

interface CrashGameProps {
  demo?: boolean;
}

export default function CrashGame({ demo = false }: CrashGameProps) {
  const { toast } = useToast();

  /* Game state */
  const [status, setStatus] = useState<"waiting" | "running" | "crashed">(
    "waiting",
  );
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [graphData, setGraphData] = useState<GraphPoint[]>([]);
  const [history, setHistory] = useState<RoundHistoryEntry[]>([]);
  const [playerBets, setPlayerBets] = useState<PlayerBet[]>([]);

  /* Betting state */
  const [betAmount, setBetAmount] = useState<string>("100");
  const [autoCashOut, setAutoCashOut] = useState<string>("");
  const [hasBet, setHasBet] = useState(false);
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [cashOutMultiplier, setCashOutMultiplier] = useState<number | null>(
    null,
  );
  const [pendingBet, setPendingBet] = useState(false);

  /* Refs */
  const esRef = useRef<EventSource | null>(null);
  const autoCashOutRef = useRef<number | null>(null);
  const currentRoundIdRef = useRef<number | null>(null);
  const statusRef = useRef(status);
  const multiplierRef = useRef(multiplier);
  const hasBetRef = useRef(hasBet);
  const hasCashedOutRef = useRef(hasCashedOut);

  /* Keep refs in sync */
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    multiplierRef.current = multiplier;
  }, [multiplier]);
  useEffect(() => {
    hasBetRef.current = hasBet;
  }, [hasBet]);
  useEffect(() => {
    hasCashedOutRef.current = hasCashedOut;
  }, [hasCashedOut]);
  useEffect(() => {
    const val = parseFloat(autoCashOut);
    autoCashOutRef.current = !Number.isNaN(val) && val > 1 ? val : null;
  }, [autoCashOut]);

  /* API hooks */
  const placeBet = usePlaceBet();
  const { data: wallet } = useGameWallet(demo);
  const balance = wallet?.balance ?? 0;

  /* ─── SSE Connection ────────────────────────────────────────────── */

  useEffect(() => {
    const url = `${API_BASE_URL}/api/events?gameType=crash`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onmessage = (event) => {
      if (!event.data || event.data.startsWith(":keepalive")) return;
      try {
        const msg = JSON.parse(event.data);
        handleSSEEvent(msg);
      } catch {
        // Ignore malformed SSE messages
      }
    };

    es.onerror = () => {
      // Auto-reconnect handled by browser; show toast on first error only
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const handleSSEEvent = useCallback(
    (msg: { eventType: string; data: Record<string, unknown> }) => {
      switch (msg.eventType) {
        case "crash:tick": {
          const tick = msg.data as unknown as CrashTick;
          setStatus("running");
          setMultiplier(tick.multiplier);
          setGraphData((prev) => {
            const next = [
              ...prev,
              { time: tick.elapsed, multiplier: tick.multiplier },
            ];
            return next.slice(-120); // Keep last 120 points
          });

          // Auto cash-out
          const target = autoCashOutRef.current;
          if (
            target &&
            hasBetRef.current &&
            !hasCashedOutRef.current &&
            tick.multiplier >= target
          ) {
            handleCashOut();
          }
          break;
        }

        case "crash:crashed": {
          const crashed = msg.data as unknown as CrashCrashed;
          setStatus("crashed");
          setMultiplier(crashed.crashPoint);
          setCrashPoint(crashed.crashPoint);
          setGraphData((prev) => [
            ...prev,
            {
              time: prev.length > 0 ? prev[prev.length - 1].time + 0.1 : 0,
              multiplier: crashed.crashPoint,
            },
          ]);
          setHistory((prev) =>
            [
              { crashPoint: crashed.crashPoint, timestamp: Date.now() },
              ...prev,
            ].slice(0, 10),
          );

          if (hasBetRef.current && !hasCashedOutRef.current) {
            toast({
              title: "Crashed!",
              description: `Busted at ${formatMultiplier(crashed.crashPoint)}`,
            });
          }

          // Reset bet state after a delay
          setTimeout(() => {
            setHasBet(false);
            setHasCashedOut(false);
            setCashOutMultiplier(null);
            setGraphData([]);
            setStatus("waiting");
            setMultiplier(1.0);
            setCrashPoint(null);
            setPlayerBets([]);
          }, 3000);
          break;
        }

        case "crash:cashed_out": {
          const co = msg.data as unknown as CrashCashedOut;
          setPlayerBets((prev) =>
            prev.map((p) =>
              p.userId === co.userId ? { ...p, cashedOutAt: co.multiplier } : p,
            ),
          );
          break;
        }

        case "round_update": {
          // New round starting
          if (msg.data.status === "betting") {
            setStatus("waiting");
            setMultiplier(1.0);
            setGraphData([]);
            setHasCashedOut(false);
            setCashOutMultiplier(null);
            setCrashPoint(null);
            setPlayerBets([]);
          }
          break;
        }
      }
    },
    [toast],
  );

  /* ─── Betting ───────────────────────────────────────────────────── */

  async function handlePlaceBet() {
    const amount = Math.round(parseFloat(betAmount) * 100);
    if (!amount || amount <= 0) {
      toast({
        title: "Invalid bet amount",
        description: "Enter a valid amount in dollars.",
      });
      return;
    }
    if (amount > balance && !demo) {
      toast({
        title: "Insufficient balance",
        description: "Add funds to continue playing.",
      });
      return;
    }

    setPendingBet(true);
    const seed = generateClientSeed();

    try {
      const res = await placeBet.mutateAsync({
        data: {
          gameType: "crash",
          betAmount: amount,
          clientSeed: seed,
          gameParams: { autoCashOut: autoCashOutRef.current, demo },
        },
      });

      currentRoundIdRef.current = res.roundId;
      setHasBet(true);
      setHasCashedOut(false);
      setCashOutMultiplier(null);
      setPlayerBets((prev) => [...prev, { userId: "you", betAmount: amount }]);

      toast({
        title: "Bet placed",
        description: `${formatCents(amount)} on Crash`,
      });
    } catch (err) {
      toast({
        title: "Bet failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPendingBet(false);
    }
  }

  /* ─── Cash Out ────────────────────────────────────────────────────── */

  async function handleCashOut() {
    const rid = currentRoundIdRef.current;
    if (!rid || !hasBetRef.current || hasCashedOutRef.current) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/rounds/${rid}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "cashout" }),
      });

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Cash-out failed" }));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setHasCashedOut(true);
      setCashOutMultiplier(data.multiplier ?? multiplierRef.current);

      toast({
        title: "Cashed Out!",
        description: `Locked in at ${formatMultiplier(data.multiplier ?? multiplierRef.current)} — Payout: ${formatCents(data.payout ?? 0)}`,
      });
    } catch (err) {
      // If endpoint doesn't exist yet, show graceful error
      toast({
        title: "Cash-out unavailable",
        description:
          err instanceof Error
            ? err.message
            : "The cash-out endpoint is not yet available.",
      });
    }
  }

  /* ─── Graph rendering ───────────────────────────────────────────── */

  function renderGraph() {
    if (graphData.length < 2) {
      return (
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.5"
          />
          <text
            x="50"
            y="25"
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize="4"
          >
            Waiting for next round...
          </text>
        </svg>
      );
    }

    const maxTime = Math.max(...graphData.map((d) => d.time), 1);
    const maxMult = Math.max(...graphData.map((d) => d.multiplier), 2);
    const points = graphData
      .map((d) => {
        const x = (d.time / maxTime) * 100;
        const y = 50 - (d.multiplier / maxMult) * 45;
        return `${x},${y}`;
      })
      .join(" ");

    const isCrashed = status === "crashed";
    const lineColor = isCrashed ? "#ef4444" : "#22c55e";

    return (
      <svg
        viewBox="0 0 100 50"
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {[1, 2, 3, 4, 5].map((m) => (
          <line
            key={m}
            x1="0"
            y1={50 - (m / maxMult) * 45}
            x2="100"
            y2={50 - (m / maxMult) * 45}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="0.3"
          />
        ))}
        {/* Area under curve */}
        <polygon
          points={`0,50 ${points} 100,50`}
          fill={isCrashed ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)"}
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Current point */}
        {!isCrashed && (
          <circle
            cx={(graphData[graphData.length - 1].time / maxTime) * 100}
            cy={
              50 - (graphData[graphData.length - 1].multiplier / maxMult) * 45
            }
            r="1.2"
            fill={lineColor}
            className="animate-pulse"
          />
        )}
      </svg>
    );
  }

  /* ─── JSX ─────────────────────────────────────────────────────────── */

  const multiplierColor =
    status === "crashed"
      ? "text-red-500"
      : multiplier >= 2
        ? "text-green-400"
        : multiplier >= 1.5
          ? "text-yellow-400"
          : "text-white";

  return (
    <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
      {/* Demo banner */}
      {demo && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 uppercase tracking-wider">
            Demo Mode
          </span>
          <p className="text-xs text-muted-foreground mt-1">
            Playing with virtual funds — no real money involved.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Crash</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Cash out before the crash — 99% RTP
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="text-lg sm:text-xl font-bold text-primary">
            {formatCents(balance)}
          </p>
        </div>
      </div>

      {/* Multiplier display */}
      <div className="mb-4 sm:mb-6">
        <div
          className={`
            relative overflow-hidden rounded-2xl border
            ${
              status === "crashed"
                ? "bg-red-950/20 border-red-500/30"
                : status === "running"
                  ? "bg-green-950/20 border-green-500/30"
                  : "bg-card/50 border-white/5"
            }
            p-6 sm:p-10 text-center transition-colors duration-300
          `}
        >
          {/* Background pulse for running */}
          {status === "running" && (
            <div className="absolute inset-0 bg-green-500/5 animate-pulse" />
          )}

          <div className="relative">
            <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wider mb-1">
              {status === "waiting"
                ? "Next Round In"
                : status === "running"
                  ? "Current Multiplier"
                  : "Crashed At"}
            </p>
            <p
              className={`
                text-5xl sm:text-7xl font-black tabular-nums tracking-tight
                transition-colors duration-200
                ${multiplierColor}
              `}
            >
              {formatMultiplier(multiplier)}
            </p>
            {status === "crashed" && crashPoint && (
              <p className="text-sm text-red-400 mt-2 flex items-center justify-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Round crashed at {formatMultiplier(crashPoint)}
              </p>
            )}
            {hasCashedOut && cashOutMultiplier && (
              <p className="text-sm text-green-400 mt-2 flex items-center justify-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Cashed out at {formatMultiplier(cashOutMultiplier)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Graph */}
      <div className="mb-4 sm:mb-6 h-32 sm:h-40 bg-card/30 border border-white/5 rounded-xl overflow-hidden">
        {renderGraph()}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
        {/* Bet amount */}
        <div className="bg-card/50 border border-white/5 rounded-xl p-3 sm:p-4">
          <label className="block text-xs text-muted-foreground mb-2 uppercase tracking-wider">
            Bet Amount (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">
              $
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              disabled={hasBet || status === "running"}
              className="w-full pl-7 pr-3 py-2.5 bg-card/50 border border-white/10 rounded-lg text-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              placeholder="1.00"
            />
          </div>
        </div>

        {/* Auto cash-out */}
        <div className="bg-card/50 border border-white/5 rounded-xl p-3 sm:p-4">
          <label className="block text-xs text-muted-foreground mb-2 uppercase tracking-wider">
            Auto Cash-Out
          </label>
          <div className="relative">
            <input
              type="number"
              min="1.01"
              step="0.01"
              value={autoCashOut}
              onChange={(e) => setAutoCashOut(e.target.value)}
              disabled={hasBet || status === "running"}
              className="w-full pl-3 pr-8 py-2.5 bg-card/50 border border-white/10 rounded-lg text-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              placeholder="e.g. 2.00"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">
              x
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mb-4 sm:mb-6">
        {!hasBet ? (
          <Button
            onClick={handlePlaceBet}
            disabled={pendingBet || status === "running"}
            className="w-full h-14 sm:h-16 text-lg font-black btn btn-primary shadow-[0_0_20px_rgba(234,179,8,0.3)]"
          >
            {pendingBet ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Placing Bet...
              </>
            ) : (
              "PLACE BET"
            )}
          </Button>
        ) : (
          <Button
            onClick={handleCashOut}
            disabled={
              hasCashedOut || status === "crashed" || status === "waiting"
            }
            className={`
              w-full h-14 sm:h-16 text-lg font-black
              ${
                hasCashedOut || status === "crashed"
                  ? "btn btn-secondary opacity-50 cursor-not-allowed"
                  : "btn bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)]"
              }
            `}
          >
            {hasCashedOut ? (
              "CASHED OUT"
            ) : status === "crashed" ? (
              "BUSTED"
            ) : (
              <>
                <TrendingUp className="h-5 w-5 mr-2" />
                CASH OUT @ {formatMultiplier(multiplier)}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Player bets */}
      {playerBets.length > 0 && (
        <div className="mb-4 sm:mb-6 bg-card/30 border border-white/5 rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-white">Active Bets</h3>
          </div>
          <div className="space-y-2">
            {playerBets.map((pb, i) => (
              <div
                key={`${pb.userId}-${i}`}
                className="flex items-center justify-between text-xs sm:text-sm"
              >
                <span className="text-muted-foreground">
                  {pb.userId === "you" ? "You" : pb.userId}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium">
                    {formatCents(pb.betAmount)}
                  </span>
                  {pb.cashedOutAt ? (
                    <span className="text-green-400 font-semibold">
                      {formatMultiplier(pb.cashedOutAt)}
                    </span>
                  ) : status === "crashed" ? (
                    <span className="text-red-400 font-semibold">Busted</span>
                  ) : (
                    <span className="text-muted-foreground">In game</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Round history */}
      <div className="bg-card/30 border border-white/5 rounded-xl p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-white">Round History</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {history.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              No rounds yet
            </span>
          ) : (
            history.map((h, i) => (
              <div
                key={`${h.crashPoint}-${i}`}
                className={`
                  px-2.5 py-1 rounded-md text-xs font-bold
                  ${
                    h.crashPoint < 2
                      ? "bg-red-950/40 text-red-400 border border-red-500/20"
                      : h.crashPoint < 5
                        ? "bg-yellow-950/40 text-yellow-400 border border-yellow-500/20"
                        : "bg-green-950/40 text-green-400 border border-green-500/20"
                  }
                `}
              >
                {formatMultiplier(h.crashPoint)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
