import { useState, useCallback, useRef } from "react";
import { useGameWallet } from "@/hooks/use-game-wallet";
import { usePlaceBet, useVerifyRound } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface RouletteBet {
  type: string;
  amount: number;
  number?: number;
  numbers?: number[];
  column?: number;
  dozen?: number;
}

interface PlacedChip {
  id: string;
  bet: RouletteBet;
}

interface HistoryEntry {
  number: number;
  timestamp: number;
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const CHIP_VALUES = [1, 5, 10, 25, 100];

const NUMBER_GRID = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

/* ─── Helpers ─────────────────────────────────────────────────────── */

function getNumberColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  if (RED_NUMBERS.has(n)) return "red";
  return "black";
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function generateClientSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ─── Component ───────────────────────────────────────────────────── */

interface RouletteGameProps {
  demo?: boolean;
}

export default function RouletteGame({ demo = false }: RouletteGameProps) {
  const { toast } = useToast();
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [selectedChipValue, setSelectedChipValue] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [serverSeedHash, setServerSeedHash] = useState<string | null>(null);
  const [clientSeed, setClientSeed] = useState<string>(generateClientSeed());
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [serverSeedInput, setServerSeedInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean;
    computedHash: string;
    expectedHash: string;
  } | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const wheelRef = useRef<HTMLDivElement>(null);

  const placeBet = usePlaceBet();
  const verifyRound = useVerifyRound();
  const { data: wallet } = useGameWallet(demo);

  const totalBet = chips.reduce((sum, c) => sum + c.bet.amount, 0);
  const balance = wallet?.balance ?? 0;

  /* ─── Betting ─────────────────────────────────────────────────────── */

  const placeChip = useCallback(
    (bet: RouletteBet) => {
      if (spinning) return;
      const id = `${bet.type}-${bet.number ?? bet.numbers?.join("-") ?? bet.column ?? bet.dozen ?? ""}-${Date.now()}`;
      setChips((prev) => [
        ...prev,
        { id, bet: { ...bet, amount: selectedChipValue } },
      ]);
    },
    [spinning, selectedChipValue],
  );

  const clearBoard = useCallback(() => {
    if (spinning) return;
    setChips([]);
  }, [spinning]);

  const handleNumberClick = useCallback(
    (num: number) => {
      placeChip({ type: "straight", number: num, amount: selectedChipValue });
    },
    [placeChip, selectedChipValue],
  );

  /* ─── Spin ────────────────────────────────────────────────────────── */

  async function handleSpin() {
    if (chips.length === 0) {
      toast({
        title: "Place a bet first",
        description: "Click on the board to place chips.",
      });
      return;
    }
    if (totalBet > balance && !demo) {
      toast({
        title: "Insufficient balance",
        description: "Add funds to continue playing.",
      });
      return;
    }

    setSpinning(true);
    setResult(null);
    setVerifyResult(null);

    const seed = generateClientSeed();
    setClientSeed(seed);

    const bets: RouletteBet[] = chips.map((c) => c.bet);

    try {
      const res = await placeBet.mutateAsync({
        data: {
          gameType: "roulette",
          betAmount: totalBet,
          clientSeed: seed,
          gameParams: { bets, demo },
        },
      });

      setRoundId(res.roundId);
      setServerSeedHash(res.serverSeedHash);

      // Animate wheel
      const winningNumber = parseInt(res.result, 10);
      const targetIndex = WHEEL_ORDER.indexOf(winningNumber);
      const baseRotation = 360 * 5; // 5 full spins
      const segmentAngle = 360 / WHEEL_ORDER.length;
      const targetRotation =
        baseRotation + targetIndex * segmentAngle + segmentAngle / 2;
      setWheelRotation(targetRotation);

      // Wait for animation
      await new Promise((r) => setTimeout(r, 3500));

      setResult(winningNumber);
      setHistory((prev) =>
        [{ number: winningNumber, timestamp: Date.now() }, ...prev].slice(
          0,
          10,
        ),
      );

      if (res.payout > 0) {
        toast({
          title: `Win! ${winningNumber}`,
          description: `Payout: ${formatCents(res.payout)}`,
        });
      } else {
        toast({
          title: `${winningNumber}`,
          description: "Better luck next time.",
        });
      }
    } catch (err) {
      toast({
        title: "Spin failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSpinning(false);
      setChips([]);
    }
  }

  /* ─── Verification ──────────────────────────────────────────────── */

  async function handleVerify() {
    if (!roundId || !serverSeedInput) return;
    try {
      const res = await verifyRound.mutateAsync({
        id: roundId,
        data: { roundId, serverSeed: serverSeedInput },
      });
      setVerifyResult(res);
    } catch (err) {
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  /* ─── Render helpers ────────────────────────────────────────────── */

  function NumberCell({ num }: { num: number }) {
    const color = getNumberColor(num);
    const cellChips = chips.filter(
      (c) => c.bet.type === "straight" && c.bet.number === num,
    );

    return (
      <button
        type="button"
        onClick={() => handleNumberClick(num)}
        disabled={spinning}
        className={`
          relative flex items-center justify-center
          h-8 sm:h-10 md:h-12
          text-xs sm:text-sm font-bold
          border border-white/10
          transition-all duration-150
          ${
            color === "red"
              ? "bg-red-700/80 hover:bg-red-600 text-white"
              : color === "black"
                ? "bg-neutral-900/80 hover:bg-neutral-800 text-white"
                : "bg-emerald-600/80 hover:bg-emerald-500 text-white"
          }
          ${spinning ? "opacity-70 cursor-not-allowed" : "cursor-pointer hover:scale-105 hover:z-10"}
        `}
        aria-label={`Bet on ${num}`}
      >
        {num}
        {cellChips.length > 0 && (
          <div className="absolute -top-1.5 -right-1.5 z-20">
            <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-primary border-2 border-white shadow-md flex items-center justify-center text-[8px] sm:text-[10px] text-primary-foreground font-black">
              {cellChips.length}
            </div>
          </div>
        )}
      </button>
    );
  }

  function OutsideBetButton({
    label,
    bet,
    className = "",
  }: {
    label: string;
    bet: RouletteBet;
    className?: string;
  }) {
    const cellChips = chips.filter((c) => {
      if (c.bet.type !== bet.type) return false;
      if (
        bet.type === "red" ||
        bet.type === "black" ||
        bet.type === "even" ||
        bet.type === "odd" ||
        bet.type === "high" ||
        bet.type === "low"
      )
        return true;
      if (bet.type === "column") return c.bet.column === bet.column;
      if (bet.type === "dozen") return c.bet.dozen === bet.dozen;
      return false;
    });

    return (
      <button
        type="button"
        onClick={() => placeChip(bet)}
        disabled={spinning}
        className={`
          relative flex items-center justify-center
          px-2 py-2 sm:py-3
          text-xs sm:text-sm font-semibold
          border border-white/10
          transition-all duration-150
          ${spinning ? "opacity-70 cursor-not-allowed" : "cursor-pointer hover:scale-[1.02] hover:z-10"}
          ${className}
        `}
      >
        {label}
        {cellChips.length > 0 && (
          <div className="absolute -top-1.5 -right-1.5 z-20">
            <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-primary border-2 border-white shadow-md flex items-center justify-center text-[8px] sm:text-[10px] text-primary-foreground font-black">
              {cellChips.length}
            </div>
          </div>
        )}
      </button>
    );
  }

  /* ─── JSX ─────────────────────────────────────────────────────────── */

  return (
    <div className="w-full max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
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
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            European Roulette
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Single-zero wheel — 97.3% RTP
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="text-lg sm:text-xl font-bold text-primary">
            {formatCents(balance)}
          </p>
        </div>
      </div>

      {/* Wheel visualization */}
      <div className="flex justify-center mb-6 sm:mb-8">
        <div className="relative w-48 h-48 sm:w-64 sm:h-64">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-primary/30 shadow-[0_0_30px_rgba(217,169,58,0.15)]" />
          {/* Wheel numbers */}
          <div
            ref={wheelRef}
            className="absolute inset-2 rounded-full transition-transform duration-[3000ms] ease-out"
            style={{ transform: `rotate(${wheelRotation}deg)` }}
          >
            {WHEEL_ORDER.map((num, i) => {
              const angle = (i / WHEEL_ORDER.length) * 360;
              const color = getNumberColor(num);
              return (
                <div
                  key={num}
                  className="absolute inset-0"
                  style={{ transform: `rotate(${angle}deg)` }}
                >
                  <div
                    className={`
                      absolute top-0 left-1/2 -translate-x-1/2
                      w-5 h-5 sm:w-6 sm:h-6 rounded-full
                      flex items-center justify-center
                      text-[9px] sm:text-[10px] font-bold
                      ${color === "red" ? "bg-red-600" : color === "black" ? "bg-neutral-950" : "bg-emerald-600"}
                      text-white border border-white/20
                    `}
                  >
                    {num}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Center hub */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-card border-2 border-primary/40 flex items-center justify-center shadow-lg">
              {result !== null ? (
                <span
                  className={`text-xl sm:text-2xl font-black ${
                    getNumberColor(result) === "red"
                      ? "text-red-400"
                      : getNumberColor(result) === "black"
                        ? "text-white"
                        : "text-emerald-400"
                  }`}
                >
                  {result}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">SPIN</span>
              )}
            </div>
          </div>
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[12px] border-l-transparent border-r-transparent border-t-primary drop-shadow-lg" />
          </div>
        </div>
      </div>

      {/* History strip */}
      <div className="mb-4 sm:mb-6">
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
          Last Results
        </p>
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2">
          {history.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              No spins yet
            </span>
          ) : (
            history.map((h, i) => (
              <div
                key={`${h.number}-${i}`}
                className={`
                  flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full
                  flex items-center justify-center
                  text-xs sm:text-sm font-bold text-white
                  ${
                    getNumberColor(h.number) === "red"
                      ? "bg-red-600"
                      : getNumberColor(h.number) === "black"
                        ? "bg-neutral-900 border border-white/20"
                        : "bg-emerald-600"
                  }
                `}
              >
                {h.number}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chip selector */}
      <div className="mb-4 sm:mb-6">
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
          Chip Value
        </p>
        <div className="flex gap-2">
          {CHIP_VALUES.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setSelectedChipValue(val)}
              className={`
                h-9 w-9 sm:h-10 sm:w-10 rounded-full
                flex items-center justify-center
                text-xs sm:text-sm font-bold
                border-2 transition-all
                ${
                  selectedChipValue === val
                    ? "bg-primary border-white text-primary-foreground scale-110 shadow-[0_0_12px_rgba(234,179,8,0.4)]"
                    : "bg-card border-white/20 text-white hover:border-primary/50"
                }
              `}
            >
              {val}
            </button>
          ))}
        </div>
      </div>

      {/* Betting board */}
      <div className="mb-4 sm:mb-6 bg-card/50 border border-white/5 rounded-xl p-2 sm:p-4 overflow-x-auto">
        <div className="min-w-[320px]">
          {/* Zero + Number grid */}
          <div className="flex">
            {/* Zero column */}
            <div className="flex flex-col mr-1">
              <button
                type="button"
                onClick={() => handleNumberClick(0)}
                disabled={spinning}
                className={`
                  flex-1 flex items-center justify-center
                  w-8 sm:w-10
                  text-xs sm:text-sm font-bold text-white
                  bg-emerald-600/80 hover:bg-emerald-500
                  border border-white/10 rounded-l-lg
                  ${spinning ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                0
                {chips.filter(
                  (c) => c.bet.type === "straight" && c.bet.number === 0,
                ).length > 0 && (
                  <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2">
                    <div className="h-4 w-4 rounded-full bg-primary border border-white text-[8px] text-primary-foreground font-black flex items-center justify-center">
                      {
                        chips.filter(
                          (c) =>
                            c.bet.type === "straight" && c.bet.number === 0,
                        ).length
                      }
                    </div>
                  </div>
                )}
              </button>
            </div>

            {/* Number grid */}
            <div className="flex-1 grid grid-cols-12 gap-px">
              {NUMBER_GRID.map((row, rowIdx) =>
                row.map((num, colIdx) => {
                  const isLastCol = colIdx === 11;
                  const isFirstRow = rowIdx === 0;
                  return (
                    <div
                      key={num}
                      className={`
                        ${isLastCol && isFirstRow ? "rounded-tr-lg" : ""}
                        ${isLastCol && rowIdx === 2 ? "rounded-br-lg" : ""}
                      `}
                    >
                      <NumberCell num={num} />
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          {/* 2to1 columns */}
          <div className="flex mt-1">
            <div className="w-8 sm:w-10 mr-1" />
            <div className="flex-1 grid grid-cols-3 gap-px">
              {[1, 2, 3].map((col) => (
                <OutsideBetButton
                  key={`2to1-${col}`}
                  label="2to1"
                  bet={{
                    type: "column",
                    column: col,
                    amount: selectedChipValue,
                  }}
                  className="bg-card/50 hover:bg-muted text-muted-foreground hover:text-white"
                />
              ))}
            </div>
          </div>

          {/* Dozens */}
          <div className="flex mt-1">
            <div className="w-8 sm:w-10 mr-1" />
            <div className="flex-1 grid grid-cols-3 gap-px">
              {[
                { label: "1st 12", dozen: 1 },
                { label: "2nd 12", dozen: 2 },
                { label: "3rd 12", dozen: 3 },
              ].map((d) => (
                <OutsideBetButton
                  key={`dozen-${d.dozen}`}
                  label={d.label}
                  bet={{
                    type: "dozen",
                    dozen: d.dozen,
                    amount: selectedChipValue,
                  }}
                  className="bg-card/50 hover:bg-muted text-muted-foreground hover:text-white"
                />
              ))}
            </div>
          </div>

          {/* Even money bets */}
          <div className="flex mt-1">
            <div className="w-8 sm:w-10 mr-1" />
            <div className="flex-1 grid grid-cols-6 gap-px">
              <OutsideBetButton
                label="1-18"
                bet={{ type: "low", amount: selectedChipValue }}
                className="bg-card/50 hover:bg-muted text-muted-foreground hover:text-white rounded-bl-lg"
              />
              <OutsideBetButton
                label="Even"
                bet={{ type: "even", amount: selectedChipValue }}
                className="bg-card/50 hover:bg-muted text-muted-foreground hover:text-white"
              />
              <OutsideBetButton
                label="Red"
                bet={{ type: "red", amount: selectedChipValue }}
                className="bg-red-900/30 hover:bg-red-800/50 text-red-300 hover:text-white"
              />
              <OutsideBetButton
                label="Black"
                bet={{ type: "black", amount: selectedChipValue }}
                className="bg-neutral-900/50 hover:bg-neutral-800/70 text-neutral-300 hover:text-white"
              />
              <OutsideBetButton
                label="Odd"
                bet={{ type: "odd", amount: selectedChipValue }}
                className="bg-card/50 hover:bg-muted text-muted-foreground hover:text-white"
              />
              <OutsideBetButton
                label="19-36"
                bet={{ type: "high", amount: selectedChipValue }}
                className="bg-card/50 hover:bg-muted text-muted-foreground hover:text-white rounded-br-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Total bet + actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Total Bet:</span>
          <span className="text-lg font-bold text-primary">
            {formatCents(totalBet)}
          </span>
          {chips.length > 0 && (
            <button
              type="button"
              onClick={clearBoard}
              disabled={spinning}
              className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
        <Button
          onClick={handleSpin}
          disabled={spinning || chips.length === 0}
          className="w-full sm:w-auto min-w-[140px] btn btn-primary shadow-[0_0_16px_rgba(234,179,8,0.3)]"
        >
          {spinning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Spinning...
            </>
          ) : (
            "SPIN"
          )}
        </Button>
      </div>

      {/* Provably Fair */}
      <div className="bg-card/30 border border-white/5 rounded-xl p-3 sm:p-4">
        <button
          type="button"
          onClick={() => setVerifyOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-white hover:text-primary transition-colors w-full"
        >
          <Shield className="h-4 w-4" />
          Provably Fair
          <Info className="h-3 w-3 text-muted-foreground ml-auto" />
        </button>

        {verifyOpen && (
          <div className="mt-3 space-y-3">
            {roundId && serverSeedHash && (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Round ID:</span>
                  <span className="text-white font-mono">{roundId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client Seed:</span>
                  <span className="text-white font-mono truncate max-w-[200px]">
                    {clientSeed}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Server Seed Hash:
                  </span>
                  <span className="text-white font-mono truncate max-w-[200px]">
                    {serverSeedHash}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Enter revealed server seed..."
                value={serverSeedInput}
                onChange={(e) => setServerSeedInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-card/50 border border-white/10 rounded-lg text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button
                onClick={handleVerify}
                disabled={verifyRound.isPending || !roundId || !serverSeedInput}
                className="btn btn-secondary text-xs"
              >
                {verifyRound.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Verify
                  </>
                )}
              </Button>
            </div>

            {verifyResult && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  verifyResult.verified
                    ? "bg-success/10 border border-success/30 text-success"
                    : "bg-destructive/10 border border-destructive/30 text-destructive"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  {verifyResult.verified ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {verifyResult.verified ? "Verified" : "Verification Failed"}
                </div>
                <div className="font-mono space-y-0.5">
                  <p>Computed: {verifyResult.computedHash}</p>
                  <p>Expected: {verifyResult.expectedHash}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
