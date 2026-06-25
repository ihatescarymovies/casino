import { useState, useCallback, useEffect } from "react";
import { useGameWallet } from "@/hooks/use-game-wallet";
import { usePlaceBet, useVerifyRound } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dices,
  TrendingUp,
  Shield,
  Loader2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface DiceGameProps {
  demo?: boolean;
}

type BetType = "over" | "under" | "exact" | "doubles";

/* ── Dice probability tables (mirrors engine) ───────────────────────── */
const SUM_FREQ: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};
const TOTAL_OUTCOMES = 36;
const RTP = 0.97;

const EXACT_PAYOUT: Record<number, number> = {
  2: 30,
  3: 15,
  4: 10,
  5: 6,
  6: 5,
  7: 4,
  8: 5,
  9: 6,
  10: 10,
  11: 15,
  12: 30,
};

function waysToExceed(target: number): number {
  let ways = 0;
  for (let sum = target + 1; sum <= 12; sum++) ways += SUM_FREQ[sum] ?? 0;
  return ways;
}

function waysToBeBelow(target: number): number {
  let ways = 0;
  for (let sum = 2; sum < target; sum++) ways += SUM_FREQ[sum] ?? 0;
  return ways;
}

function calculateOverUnderPayout(ways: number): number {
  if (ways <= 0) return 0;
  return (TOTAL_OUTCOMES / ways) * RTP;
}

function getPayoutMultiplier(betType: BetType, target: number): number {
  switch (betType) {
    case "over":
      return calculateOverUnderPayout(waysToExceed(target));
    case "under":
      return calculateOverUnderPayout(waysToBeBelow(target));
    case "exact":
      return EXACT_PAYOUT[target] ?? 0;
    case "doubles":
      return 5;
    default:
      return 0;
  }
}

function getTargetRange(betType: BetType): { min: number; max: number } {
  switch (betType) {
    case "over":
      return { min: 2, max: 11 };
    case "under":
      return { min: 3, max: 12 };
    case "exact":
      return { min: 2, max: 12 };
    case "doubles":
      return { min: 0, max: 0 };
  }
}

function getDefaultTarget(betType: BetType): number {
  switch (betType) {
    case "over":
      return 7;
    case "under":
      return 7;
    case "exact":
      return 7;
    case "doubles":
      return 0;
  }
}

/* ── Dice face component ────────────────────────────────────────────── */
function DieFace({ value, rolling }: { value: number; rolling?: boolean }) {
  const dotPositions: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  const positions = dotPositions[value] ?? [];

  return (
    <div
      className={`relative w-16 h-16 md:w-20 md:h-20 rounded-xl bg-white shadow-lg flex items-center justify-center transition-transform ${
        rolling ? "animate-dice-roll" : ""
      }`}
    >
      <div className="grid grid-cols-3 grid-rows-3 gap-1 w-10 h-10 md:w-12 md:h-12">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className={`rounded-full ${
              positions.includes(i + 1) ? "bg-neutral-900" : "bg-transparent"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export default function DiceGame({ demo = false }: DiceGameProps) {
  const { toast } = useToast();
  const [betType, setBetType] = useState<BetType>("over");
  const [target, setTarget] = useState(7);
  const [betAmount, setBetAmount] = useState(100); // cents
  const [rolling, setRolling] = useState(false);
  const [lastResult, setLastResult] = useState<{
    dice: [number, number];
    sum: number;
    won: boolean;
    payout: number;
    roundId: number;
  } | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [serverSeed, setServerSeed] = useState("");

  const placeBet = usePlaceBet();
  const verifyRound = useVerifyRound();
  const { data: wallet } = useGameWallet(demo);

  const range = getTargetRange(betType);
  const multiplier = getPayoutMultiplier(betType, target);

  useEffect(() => {
    setTarget(getDefaultTarget(betType));
  }, [betType]);

  const handleRoll = useCallback(async () => {
    if (rolling) return;
    setRolling(true);
    setLastResult(null);

    try {
      const clientSeed = crypto.randomUUID();
      const gameParams: Record<string, unknown> =
        betType === "doubles" ? { betType, demo } : { betType, target, demo };

      const res = await placeBet.mutateAsync({
        data: {
          gameType: "dice",
          betAmount,
          clientSeed,
          gameParams,
        },
      });

      // Parse result details from the response
      const resultDetails = JSON.parse(res.result || "{}") as {
        dice?: [number, number];
        sum?: number;
        won?: boolean;
        multiplier?: number;
      };

      const dice: [number, number] = resultDetails.dice ?? [1, 1];
      const sum = resultDetails.sum ?? 2;
      const won = resultDetails.won ?? false;

      setLastResult({
        dice,
        sum,
        won,
        payout: res.payout,
        roundId: res.roundId,
      });

      toast({
        title: won ? "You won!" : "You lost",
        description: `Rolled ${dice[0]} + ${dice[1]} = ${sum}. ${won ? `Payout: $${(res.payout / 100).toFixed(2)}` : "Better luck next time!"}`,
        variant: won ? "default" : "destructive",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Roll failed";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRolling(false);
    }
  }, [betType, target, betAmount, rolling, placeBet, toast]);

  const handleVerify = useCallback(async () => {
    if (!lastResult) return;
    try {
      const res = await verifyRound.mutateAsync({
        id: lastResult.roundId,
        data: { roundId: lastResult.roundId, serverSeed },
      });
      toast({
        title: res.verified ? "Verified" : "Verification failed",
        description: res.verified
          ? "This round is provably fair."
          : "Hash mismatch detected.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }, [lastResult, serverSeed, verifyRound, toast]);

  const presetAmounts = [100, 500, 1000, 5000, 10000];

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Demo banner */}
      {demo && (
        <div className="mb-4 px-4 py-2 rounded-xl bg-warning/20 border border-warning/30 text-warning text-sm font-bold text-center">
          DEMO MODE — No real money involved
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Dices className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Dice</h2>
          <p className="text-sm text-muted-foreground">
            Roll two dice. Predict the outcome.
          </p>
        </div>
      </div>

      {/* Dice display */}
      <div className="bg-card border border-white/5 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-center gap-6 mb-4">
          {lastResult && !rolling ? (
            <>
              <DieFace value={lastResult.dice[0]} />
              <DieFace value={lastResult.dice[1]} />
            </>
          ) : (
            <>
              <DieFace
                value={rolling ? Math.floor(Math.random() * 6) + 1 : 1}
                rolling={rolling}
              />
              <DieFace
                value={rolling ? Math.floor(Math.random() * 6) + 1 : 1}
                rolling={rolling}
              />
            </>
          )}
        </div>

        {lastResult && !rolling && (
          <div className="text-center">
            <div className="text-3xl font-black text-white mb-1">
              {lastResult.sum}
            </div>
            <div
              className={`text-sm font-medium ${
                lastResult.won ? "text-success" : "text-destructive"
              }`}
            >
              {lastResult.won
                ? `Win! +$${(lastResult.payout / 100).toFixed(2)}`
                : "Loss"}
            </div>
          </div>
        )}
      </div>

      {/* Bet type selector */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
        <label className="block text-sm text-muted-foreground mb-3">
          Bet Type
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(
            [
              { id: "over" as BetType, label: "Over", icon: ChevronUp },
              { id: "under" as BetType, label: "Under", icon: ChevronDown },
              { id: "exact" as BetType, label: "Exact", icon: Dices },
              { id: "doubles" as BetType, label: "Doubles", icon: Dices },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setBetType(id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                betType === id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/50 text-muted-foreground border-white/10 hover:border-primary/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Target slider (hidden for doubles) */}
      {betType !== "doubles" && (
        <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm text-muted-foreground">Target</label>
            <span className="text-lg font-bold text-primary">{target}</span>
          </div>
          <input
            type="range"
            min={range.min}
            max={range.max}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{range.min}</span>
            <span>{range.max}</span>
          </div>
        </div>
      )}

      {/* Bet amount */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
        <label className="block text-sm text-muted-foreground mb-3">
          Bet Amount
        </label>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {presetAmounts.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => setBetAmount(cents)}
              className={`py-2 rounded-xl border text-sm font-medium transition-all ${
                betAmount === cents
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/50 text-white border-white/10 hover:border-primary/50"
              }`}
            >
              ${(cents / 100).toFixed(0)}
            </button>
          ))}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
            $
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={Math.round(betAmount / 100)}
            onChange={(e) =>
              setBetAmount(Math.max(1, Number(e.target.value) || 0) * 100)
            }
            className="w-full pl-7 pr-4 py-2.5 bg-muted/50 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Payout preview */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Potential Payout
            </span>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-white">
              ${((betAmount * multiplier) / 100).toFixed(2)}
            </div>
            <div className="text-xs text-primary">
              {multiplier.toFixed(2)}x multiplier
            </div>
          </div>
        </div>
      </div>

      {/* Roll button */}
      <Button
        onClick={handleRoll}
        disabled={rolling || placeBet.isPending}
        className="w-full h-12 text-base font-bold shadow-[0_0_12px_rgba(234,179,8,0.3)]"
      >
        {rolling || placeBet.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Dices className="h-5 w-5 mr-2" />
            Roll Dice
          </>
        )}
      </Button>

      {/* Provably fair verification */}
      {lastResult && (
        <div className="mt-6 bg-card border border-white/5 rounded-2xl p-4">
          <button
            type="button"
            onClick={() => setVerifyOpen(!verifyOpen)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors w-full"
          >
            <Shield className="h-4 w-4 text-primary" />
            <span>Provably Fair Verification</span>
            {verifyOpen ? (
              <ChevronUp className="h-4 w-4 ml-auto" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-auto" />
            )}
          </button>

          {verifyOpen && (
            <div className="mt-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                Round ID:{" "}
                <span className="text-white">{lastResult.roundId}</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter server seed..."
                  value={serverSeed}
                  onChange={(e) => setServerSeed(e.target.value)}
                  className="w-full px-4 py-2.5 bg-muted/50 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <Button
                onClick={handleVerify}
                disabled={!serverSeed || verifyRound.isPending}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {verifyRound.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Verify Round
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Last result quick replay */}
      {lastResult && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleRoll}
            disabled={rolling || placeBet.isPending}
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-hover transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Roll Again
          </button>
        </div>
      )}

      <style>{`
        @keyframes dice-roll {
          0% { transform: rotate(0deg) translateX(0); }
          20% { transform: rotate(72deg) translateX(-8px); }
          40% { transform: rotate(144deg) translateX(8px); }
          60% { transform: rotate(216deg) translateX(-6px); }
          80% { transform: rotate(288deg) translateX(6px); }
          100% { transform: rotate(360deg) translateX(0); }
        }
        .animate-dice-roll {
          animation: dice-roll 0.6s ease-in-out;
        }
      `}</style>
    </div>
  );
}
