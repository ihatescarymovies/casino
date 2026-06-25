import { useState, useCallback } from "react";
import { useGameWallet } from "@/hooks/use-game-wallet";
import { usePlaceBet } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bomb, Gem, Loader2, RotateCcw, DollarSign } from "lucide-react";

interface MinesGameProps {
  demo?: boolean;
}

/* ── Types ──────────────────────────────────────────────────────────── */
interface RevealedTile {
  tile: number;
  isMine: boolean;
}

interface MinesGameDetails {
  mineCount: number;
  gridSize: number;
  totalTiles: number;
  safeTiles: number;
  currentMultiplier: number;
  revealedTiles: RevealedTile[];
  minesNotRevealed: boolean;
}

interface ActionResponse {
  result: string;
  payout: number;
  multiplier?: number;
  gameDetails: MinesGameDetails;
}

const GRID_SIZE = 5;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
const MINE_PRESETS = [1, 3, 5, 10, 24];

export default function MinesGame({ demo = false }: MinesGameProps) {
  const { toast } = useToast();
  const [mineCount, setMineCount] = useState(5);
  const [betAmount, setBetAmount] = useState(100);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [gameState, setGameState] = useState<
    "idle" | "playing" | "won" | "lost"
  >("idle");
  const [revealedTiles, setRevealedTiles] = useState<Set<number>>(new Set());
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [payout, setPayout] = useState(0);
  const [hitMine, setHitMine] = useState<number | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  const placeBet = usePlaceBet();
  const { data: wallet } = useGameWallet(demo);

  const startGame = useCallback(async () => {
    setGameState("playing");
    setRevealedTiles(new Set());
    setCurrentMultiplier(1.0);
    setPayout(0);
    setHitMine(null);

    try {
      const clientSeed = crypto.randomUUID();
      const res = await placeBet.mutateAsync({
        data: {
          gameType: "mines",
          betAmount,
          clientSeed,
          gameParams: { mineCount, demo },
        },
      });

      setRoundId(res.roundId);

      toast({
        title: "Game started",
        description: `Find gems, avoid ${mineCount} mines!`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start game";
      toast({ title: "Error", description: message, variant: "destructive" });
      setGameState("idle");
    }
  }, [mineCount, betAmount, placeBet, toast]);

  const handleReveal = useCallback(
    async (tile: number) => {
      if (gameState !== "playing" || !roundId || processingAction) return;
      if (revealedTiles.has(tile)) return;

      setProcessingAction(true);

      try {
        const csrfToken = document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("csrf-token="))
          ?.split("=")[1];

        const res = await fetch(
          `${API_BASE_URL}/api/rounds/${roundId}/action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ action: "reveal", tile }),
          },
        );

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as ActionResponse;
        const details = data.gameDetails;

        setRevealedTiles(new Set(details.revealedTiles.map((t) => t.tile)));
        setCurrentMultiplier(details.currentMultiplier);

        if (data.result === "lose") {
          setGameState("lost");
          setHitMine(tile);
          setPayout(0);
          toast({
            title: "Boom!",
            description: "You hit a mine. Better luck next time!",
            variant: "destructive",
          });
        } else {
          setCurrentMultiplier(data.multiplier ?? details.currentMultiplier);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Reveal failed";
        toast({ title: "Error", description: message, variant: "destructive" });
      } finally {
        setProcessingAction(false);
      }
    },
    [gameState, roundId, revealedTiles, processingAction, toast],
  );

  const handleCashout = useCallback(async () => {
    if (gameState !== "playing" || !roundId || processingAction) return;
    if (revealedTiles.size === 0) {
      toast({
        title: "Cannot cash out",
        description: "Reveal at least one safe tile first.",
        variant: "destructive",
      });
      return;
    }

    setProcessingAction(true);

    try {
      const csrfToken = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("csrf-token="))
        ?.split("=")[1];

      const res = await fetch(`${API_BASE_URL}/api/rounds/${roundId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ action: "cashout" }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as ActionResponse;

      setGameState("won");
      setPayout(data.payout);
      setCurrentMultiplier(data.multiplier ?? 1);

      toast({
        title: "Cashed out!",
        description: `You won $${(data.payout / 100).toFixed(2)}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cashout failed";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setProcessingAction(false);
    }
  }, [gameState, roundId, revealedTiles, processingAction, toast]);

  const resetGame = useCallback(() => {
    setGameState("idle");
    setRoundId(null);
    setRevealedTiles(new Set());
    setCurrentMultiplier(1.0);
    setPayout(0);
    setHitMine(null);
  }, []);

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
          <Bomb className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Mines</h2>
          <p className="text-sm text-muted-foreground">
            Find gems, avoid mines. Cash out anytime.
          </p>
        </div>
      </div>

      {/* Game status / multiplier */}
      {gameState === "playing" && (
        <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Current Multiplier
              </div>
              <div className="text-2xl font-black text-primary">
                {currentMultiplier.toFixed(2)}x
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">
                Potential Win
              </div>
              <div className="text-lg font-bold text-white">
                ${((betAmount * currentMultiplier) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {(gameState === "won" || gameState === "lost") && (
        <div
          className={`rounded-2xl p-4 mb-4 text-center ${
            gameState === "won"
              ? "bg-success/10 border border-success/30"
              : "bg-destructive/10 border border-destructive/30"
          }`}
        >
          <div
            className={`text-2xl font-black mb-1 ${
              gameState === "won" ? "text-success" : "text-destructive"
            }`}
          >
            {gameState === "won"
              ? `+$${(payout / 100).toFixed(2)}`
              : "You hit a mine!"}
          </div>
          <div className="text-sm text-muted-foreground">
            {gameState === "won"
              ? `Cashed out at ${currentMultiplier.toFixed(2)}x`
              : "Better luck next time"}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: TOTAL_TILES }, (_, i) => {
            const isRevealed = revealedTiles.has(i);
            const isHitMine = hitMine === i;
            const isGameOver = gameState === "won" || gameState === "lost";

            return (
              <button
                key={i}
                type="button"
                onClick={() => handleReveal(i)}
                disabled={
                  gameState !== "playing" || isRevealed || processingAction
                }
                className={`aspect-square rounded-xl flex items-center justify-center text-2xl transition-all ${
                  isRevealed
                    ? isHitMine
                      ? "bg-destructive/20 border-2 border-destructive"
                      : "bg-success/20 border-2 border-success"
                    : isGameOver
                      ? "bg-muted/30 border border-white/5 opacity-60"
                      : "bg-muted/50 border border-white/10 hover:border-primary/50 hover:bg-muted active:scale-95"
                }`}
              >
                {isRevealed ? (
                  isHitMine ? (
                    <Bomb className="h-6 w-6 text-destructive" />
                  ) : (
                    <Gem className="h-6 w-6 text-success" />
                  )
                ) : (
                  <span className="text-muted-foreground/30 text-sm font-bold">
                    {i + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      {gameState === "idle" && (
        <>
          {/* Mine count selector */}
          <div className="bg-card border border-white/5 rounded-2xl p-4 mb-4">
            <label className="block text-sm text-muted-foreground mb-3">
              Mine Count
            </label>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {MINE_PRESETS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setMineCount(count)}
                  className={`py-2 rounded-xl border text-sm font-medium transition-all ${
                    mineCount === count
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card/50 text-white border-white/10 hover:border-primary/50"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={1}
              max={24}
              value={mineCount}
              onChange={(e) => setMineCount(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>1 mine</span>
              <span>{mineCount} mines</span>
              <span>24 mines</span>
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

          <Button
            onClick={startGame}
            disabled={placeBet.isPending}
            className="w-full h-12 text-base font-bold shadow-[0_0_12px_rgba(234,179,8,0.3)]"
          >
            {placeBet.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Bomb className="h-5 w-5 mr-2" />
                Start Game
              </>
            )}
          </Button>
        </>
      )}

      {gameState === "playing" && (
        <div className="flex gap-3">
          <Button
            onClick={handleCashout}
            disabled={processingAction || revealedTiles.size === 0}
            className="flex-1 h-12 text-base font-bold bg-success hover:bg-success/80 text-success-foreground"
          >
            {processingAction ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <DollarSign className="h-5 w-5 mr-2" />
                Cash Out
              </>
            )}
          </Button>
        </div>
      )}

      {(gameState === "won" || gameState === "lost") && (
        <Button
          onClick={resetGame}
          className="w-full h-12 text-base font-bold"
          variant="outline"
        >
          <RotateCcw className="h-5 w-5 mr-2" />
          Play Again
        </Button>
      )}
    </div>
  );
}
