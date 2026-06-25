import { useState, useCallback, useRef, useEffect } from "react";
import { useGameWallet } from "@/hooks/use-game-wallet";
import { usePlaceBet } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Circle, Loader2, RotateCcw, TrendingUp } from "lucide-react";

interface PlinkoGameProps {
  demo?: boolean;
}

/* ── Multiplier tables (mirrors engine) ─────────────────────────────── */
const MULTIPLIERS: Record<number, Record<string, number[]>> = {
  8: {
    low: [5.5, 2.0, 0.8, 0.3, 0.2, 0.3, 0.8, 2.0, 5.5],
    medium: [13, 4, 0.8, 0.3, 0.2, 0.3, 0.8, 4, 13],
    high: [1000, 20, 3, 0.5, 0.2, 0.5, 3, 20, 1000],
  },
  12: {
    low: [5.5, 2.0, 1.5, 0.8, 0.5, 0.3, 0.2, 0.3, 0.5, 0.8, 1.5, 2.0, 5.5],
    medium: [13, 4, 2, 0.8, 0.5, 0.3, 0.2, 0.3, 0.5, 0.8, 2, 4, 13],
    high: [1000, 20, 10, 3, 1, 0.5, 0.2, 0.5, 1, 3, 10, 20, 1000],
  },
  16: {
    low: [
      5.5, 3.5, 2.0, 1.5, 0.8, 0.5, 0.3, 0.2, 0.2, 0.3, 0.5, 0.8, 1.5, 2.0, 3.5,
      5.5, 16,
    ],
    medium: [
      13, 8, 4, 2, 0.8, 0.5, 0.3, 0.2, 0.2, 0.3, 0.5, 0.8, 2, 4, 8, 13, 29,
    ],
    high: [
      1000, 100, 20, 10, 3, 1, 0.5, 0.2, 0.2, 0.5, 1, 3, 10, 20, 100, 1000, 0,
    ],
  },
};

const VALID_ROWS = [8, 12, 16] as const;
const VALID_RISKS = ["low", "medium", "high"] as const;
type RiskLevel = (typeof VALID_RISKS)[number];
type RowCount = (typeof VALID_ROWS)[number];

/* ── Types ──────────────────────────────────────────────────────────── */
interface BallResult {
  path: ("L" | "R")[];
  landingSlot: number;
  multiplier: number;
  payout: number;
}

interface PlinkoGameDetails {
  rows: number;
  risk: string;
  balls: BallResult[];
  totalPayout: number;
}

/* ── Peg board SVG ──────────────────────────────────────────────────── */
function PegBoard({
  rows,
  ballPath,
  landingSlot,
  animating,
}: {
  rows: number;
  ballPath?: ("L" | "R")[];
  landingSlot?: number;
  animating?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);

  const width = 320;
  const height = 360;
  const paddingX = 24;
  const paddingY = 32;
  const pegRadius = 3;
  const ballRadius = 6;

  const boardWidth = width - paddingX * 2;
  const boardHeight = height - paddingY * 2;

  // Generate peg positions
  const pegs: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    const pegsInRow = row + 3;
    const rowWidth = (row / (rows - 1)) * boardWidth * 0.85;
    const startX = (width - rowWidth) / 2;
    for (let col = 0; col < pegsInRow; col++) {
      const x =
        pegsInRow === 1
          ? width / 2
          : startX + (col / (pegsInRow - 1)) * rowWidth;
      const y = paddingY + (row / rows) * boardHeight * 0.85;
      pegs.push({ x, y });
    }
  }

  // Slot positions at bottom
  const slotCount = rows + 1;
  const slotWidth = boardWidth / (slotCount - 1);
  const slots: { x: number; y: number }[] = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push({
      x: paddingX + i * slotWidth,
      y: height - paddingY + 16,
    });
  }

  // Animate ball
  useEffect(() => {
    if (!animating || !ballPath) {
      setBallPos(null);
      return;
    }

    // Start at top center
    let currentX = width / 2;
    let currentY = 8;
    setBallPos({ x: currentX, y: currentY });

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Drop to first peg row
    const dropToFirst = setTimeout(() => {
      currentY = paddingY;
      setBallPos({ x: currentX, y: currentY });
    }, 100);
    timeouts.push(dropToFirst);

    // Bounce through pegs
    ballPath.forEach((dir, idx) => {
      const timeout = setTimeout(
        () => {
          const row = idx + 1;
          const pegsInRow = row + 3;
          const rowWidth = (row / (rows - 1)) * boardWidth * 0.85;
          const startX = (width - rowWidth) / 2;

          // Find nearest peg
          let pegCol = Math.floor(pegsInRow / 2);
          if (dir === "R") pegCol += 1;
          if (dir === "L") pegCol -= 1;
          pegCol = Math.max(0, Math.min(pegsInRow - 1, pegCol));

          currentX =
            pegsInRow === 1
              ? width / 2
              : startX + (pegCol / (pegsInRow - 1)) * rowWidth;
          currentY = paddingY + (row / rows) * boardHeight * 0.85;

          setBallPos({ x: currentX, y: currentY });
        },
        150 + idx * 180,
      );
      timeouts.push(timeout);
    });

    // Drop to slot
    const dropToSlot = setTimeout(
      () => {
        if (landingSlot !== undefined) {
          currentX = slots[landingSlot]?.x ?? width / 2;
          currentY = height - paddingY + 16;
          setBallPos({ x: currentX, y: currentY });
        }
      },
      150 + ballPath.length * 180 + 200,
    );
    timeouts.push(dropToSlot);

    // Clear ball after animation
    const clearBall = setTimeout(
      () => {
        setBallPos(null);
      },
      150 + ballPath.length * 180 + 800,
    );
    timeouts.push(clearBall);

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [
    animating,
    ballPath,
    landingSlot,
    rows,
    width,
    paddingY,
    boardWidth,
    slots,
  ]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      style={{ maxHeight: 360 }}
    >
      {/* Background */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={12}
        fill="oklch(0.16 0.01 260)"
        stroke="oklch(0.28 0.01 260)"
        strokeWidth={1}
      />

      {/* Slots */}
      {slots.map((slot, i) => {
        const m = MULTIPLIERS[rows as RowCount];
        const risk = VALID_RISKS.find((r) => r === "medium") ?? "medium";
        const mult = m?.[risk]?.[i] ?? 0;
        const isEdge = i <= 1 || i >= slots.length - 2;
        const isCenter = i === Math.floor(slots.length / 2);

        return (
          <g key={`slot-${i}`}>
            <rect
              x={slot.x - slotWidth / 2 + 2}
              y={slot.y - 14}
              width={slotWidth - 4}
              height={28}
              rx={4}
              fill={
                isEdge
                  ? "oklch(0.55 0.22 25 / 0.3)"
                  : isCenter
                    ? "oklch(0.75 0.16 85 / 0.15)"
                    : "oklch(0.22 0.01 260)"
              }
              stroke={
                isEdge
                  ? "oklch(0.55 0.22 25 / 0.5)"
                  : isCenter
                    ? "oklch(0.75 0.16 85 / 0.4)"
                    : "oklch(0.28 0.01 260)"
              }
              strokeWidth={1}
            />
            <text
              x={slot.x}
              y={slot.y + 4}
              textAnchor="middle"
              fill={
                isEdge
                  ? "oklch(0.55 0.22 25)"
                  : isCenter
                    ? "oklch(0.75 0.16 85)"
                    : "oklch(0.65 0.01 260)"
              }
              fontSize={10}
              fontWeight={600}
            >
              {mult}x
            </text>
          </g>
        );
      })}

      {/* Pegs */}
      {pegs.map((peg, i) => (
        <circle
          key={`peg-${i}`}
          cx={peg.x}
          cy={peg.y}
          r={pegRadius}
          fill="oklch(0.45 0.12 50)"
        />
      ))}

      {/* Ball */}
      {ballPos && (
        <circle
          cx={ballPos.x}
          cy={ballPos.y}
          r={ballRadius}
          fill="oklch(0.75 0.16 85)"
          style={{
            filter: "drop-shadow(0 0 4px oklch(0.75 0.16 85 / 0.6))",
            transition: "all 0.15s ease-out",
          }}
        />
      )}
    </svg>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export default function PlinkoGame({ demo = false }: PlinkoGameProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RowCount>(16);
  const [risk, setRisk] = useState<RiskLevel>("medium");
  const [balls, setBalls] = useState(1);
  const [betAmount, setBetAmount] = useState(100);
  const [dropping, setDropping] = useState(false);
  const [lastResult, setLastResult] = useState<{
    balls: BallResult[];
    totalPayout: number;
  } | null>(null);

  const placeBet = usePlaceBet();
  const { data: wallet } = useGameWallet(demo);

  const handleDrop = useCallback(async () => {
    if (dropping) return;
    setDropping(true);
    setLastResult(null);

    try {
      const clientSeed = crypto.randomUUID();
      const res = await placeBet.mutateAsync({
        data: {
          gameType: "plinko",
          betAmount,
          clientSeed,
          gameParams: { rows, risk, balls, demo },
        },
      });

      // Parse result
      const details = JSON.parse(res.result || "{}") as PlinkoGameDetails;

      setLastResult({
        balls: details.balls ?? [],
        totalPayout: details.totalPayout ?? res.payout,
      });

      const won = res.payout > 0;
      toast({
        title: won ? "You won!" : "No win this time",
        description: `Total payout: $${(res.payout / 100).toFixed(2)}`,
        variant: won ? "default" : "destructive",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Drop failed";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      // Keep dropping state for animation duration
      setTimeout(() => setDropping(false), 2000);
    }
  }, [rows, risk, balls, betAmount, dropping, placeBet, toast]);

  const presetAmounts = [100, 500, 1000, 5000, 10000];
  const currentMultipliers = MULTIPLIERS[rows]?.[risk] ?? [];

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
          <Circle className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Plinko</h2>
          <p className="text-sm text-muted-foreground">
            Drop the ball and watch it bounce.
          </p>
        </div>
      </div>

      {/* Peg board */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
        <PegBoard
          rows={rows}
          ballPath={
            lastResult?.balls[0]?.path ??
            (dropping ? Array.from({ length: rows }, () => "R") : undefined)
          }
          landingSlot={lastResult?.balls[0]?.landingSlot}
          animating={dropping}
        />
      </div>

      {/* Last result */}
      {lastResult && !dropping && (
        <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Last Drop</span>
            <span
              className={`text-lg font-bold ${
                lastResult.totalPayout > 0 ? "text-success" : "text-destructive"
              }`}
            >
              {lastResult.totalPayout > 0
                ? `+$${(lastResult.totalPayout / 100).toFixed(2)}`
                : "Loss"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lastResult.balls.map((ball, i) => (
              <div
                key={i}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  ball.payout > 0
                    ? "bg-success/20 text-success border border-success/30"
                    : "bg-muted text-muted-foreground border border-white/10"
                }`}
              >
                Ball {i + 1}: {ball.multiplier}x
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row selector */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
        <label className="block text-sm text-muted-foreground mb-3">Rows</label>
        <div className="grid grid-cols-3 gap-2">
          {VALID_ROWS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRows(r)}
              className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                rows === r
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/50 text-white border-white/10 hover:border-primary/50"
              }`}
            >
              {r} Rows
            </button>
          ))}
        </div>
      </div>

      {/* Risk selector */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
        <label className="block text-sm text-muted-foreground mb-3">
          Risk Level
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: "low" as RiskLevel, label: "Low", color: "text-success" },
              {
                id: "medium" as RiskLevel,
                label: "Medium",
                color: "text-warning",
              },
              {
                id: "high" as RiskLevel,
                label: "High",
                color: "text-destructive",
              },
            ] as const
          ).map(({ id, label, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => setRisk(id)}
              className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                risk === id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/50 text-white border-white/10 hover:border-primary/50"
              }`}
            >
              <span className={risk !== id ? color : ""}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Balls selector */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm text-muted-foreground">Balls</label>
          <span className="text-lg font-bold text-primary">{balls}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={balls}
          onChange={(e) => setBalls(Number(e.target.value))}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>1</span>
          <span>10</span>
        </div>
      </div>

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

      {/* Multiplier table */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm text-muted-foreground">
            Multiplier Table ({rows} rows, {risk} risk)
          </span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {currentMultipliers.map((mult, i) => {
            const isEdge = i <= 1 || i >= currentMultipliers.length - 2;
            const isCenter = i === Math.floor(currentMultipliers.length / 2);
            return (
              <div
                key={i}
                className={`text-center py-1.5 rounded-lg text-xs font-bold ${
                  isEdge
                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                    : isCenter
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-muted text-muted-foreground border border-white/5"
                }`}
              >
                {mult}x
              </div>
            );
          })}
        </div>
      </div>

      {/* Drop button */}
      <Button
        onClick={handleDrop}
        disabled={dropping || placeBet.isPending}
        className="w-full h-12 text-base font-bold shadow-[0_0_12px_rgba(234,179,8,0.3)]"
      >
        {dropping || placeBet.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Circle className="h-5 w-5 mr-2" />
            Drop {balls > 1 ? `${balls} Balls` : "Ball"}
          </>
        )}
      </Button>

      {/* Replay */}
      {lastResult && !dropping && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleDrop}
            disabled={dropping || placeBet.isPending}
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-hover transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Drop Again
          </button>
        </div>
      )}
    </div>
  );
}
