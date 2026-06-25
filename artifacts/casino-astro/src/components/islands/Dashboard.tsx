import { useAuth } from "@workspace/replit-auth-web";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useListGames,
  getListGamesQueryKey,
  useGetWallet,
  getGetWalletQueryKey,
  useListRounds,
  getListRoundsQueryKey,
  useVerifyRound,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { features } from "@/lib/config";
import {
  Trophy,
  Zap,
  Star,
  TrendingUp,
  Shield,
  LogOut,
  Crown,
  Wallet,
  CheckCircle2,
  Clock,
  AlertCircle,
  CircleDot,
  RefreshCw,
  Heart,
  Dices,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { getGameFallbackImage } from "@/lib/game-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FAVORITES_KEY = "cno-favorites";

function loadFavorites(): Set<string> {
  try {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(FAVORITES_KEY)
        : null;
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persistFavorites(favs: Set<string>): void {
  try {
    window.localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify(Array.from(favs)),
    );
  } catch {}
}

function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() =>
    loadFavorites(),
  );

  const toggle = useCallback((gameId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      persistFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (gameId: string) => favorites.has(gameId),
    [favorites],
  );

  return { favorites, toggle, isFavorite };
}

interface DepositSession {
  reference_id: string;
  invoice_id: string;
  amount_usd: number;
  status: string;
  filled_amount: string | null;
  filled_currency: string | null;
  created_at: string;
}

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function relativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-card border border-white/5 rounded-xl p-5 flex items-start gap-4 hover:border-primary/20 transition-colors">
      <div className={`p-2 rounded-lg bg-white/5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Completed
        </span>
      );
    case "partial":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-400">
          <AlertCircle className="h-3.5 w-3.5" /> Partial
        </span>
      );
    case "open":
    case "verifying":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-400">
          <Clock className="h-3.5 w-3.5" /> Pending
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <CircleDot className="h-3.5 w-3.5" /> {status}
        </span>
      );
  }
}

const PENDING_STATUSES = new Set(["open", "verifying", "partial"]);
const POLL_INTERVAL_MS = 10_000;

export default function Dashboard() {
  const { user, isLoading, isAuthenticated, logout, login } = useAuth();
  const [deposits, setDeposits] = useState<DepositSession[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const depositsRef = useRef<DepositSession[]>([]);
  const { toast } = useToast();
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();

  const [roundsOffset, setRoundsOffset] = useState(0);
  const [allRounds, setAllRounds] = useState<
    Array<{
      id: number;
      gameType: string;
      betAmount: number;
      payout: number;
      result?: string | null;
      serverSeedHash: string;
      clientSeed: string;
      nonce: number;
      verified: boolean;
      createdAt: string;
    }>
  >([]);
  const [verifyInputs, setVerifyInputs] = useState<Record<number, string>>({});
  const [expandedVerify, setExpandedVerify] = useState<Set<number>>(new Set());

  const { data: hotGames, isLoading: gamesLoading } = useListGames(
    { category: "slots" },
    { query: { queryKey: getListGamesQueryKey({ category: "slots" }) } },
  );

  const { data: wallet, isLoading: walletLoading } = useGetWallet({
    query: { queryKey: getGetWalletQueryKey() },
  });

  const { data: rounds, isLoading: roundsLoading } = useListRounds(
    { limit: 10, offset: roundsOffset },
    {
      query: {
        queryKey: getListRoundsQueryKey({ limit: 10, offset: roundsOffset }),
      },
    },
  );

  const verifyRoundMutation = useVerifyRound({
    mutation: {
      onSuccess: (data, variables) => {
        toast({
          title: data.verified ? "Round verified" : "Verification failed",
          description: data.verified
            ? "This round's fairness has been cryptographically verified."
            : "The provided server seed does not match the hash.",
        });
        // Update local verified status if successful
        if (data.verified) {
          setAllRounds((prev) =>
            prev.map((r) =>
              r.id === variables.id ? { ...r, verified: true } : r,
            ),
          );
        }
      },
      onError: () => {
        toast({
          title: "Verification error",
          description: "Unable to verify round. Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      login();
    }
  }, [isLoading, isAuthenticated, login]);

  useEffect(() => {
    if (rounds) {
      if (roundsOffset === 0) {
        setAllRounds(rounds);
      } else {
        setAllRounds((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const newRounds = rounds.filter((r) => !existingIds.has(r.id));
          return [...prev, ...newRounds];
        });
      }
    }
  }, [rounds, roundsOffset]);

  const fetchHistory = async () => {
    const r = await fetch("/api/payments/history", {
      credentials: "include",
    });
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchHistory()
      .then((data) => {
        setDeposits(data);
        depositsRef.current = data;
        setDepositsLoading(false);
      })
      .catch(() => setDepositsLoading(false));
  }, [isAuthenticated]);

  useEffect(() => {
    const hasPending = deposits.some((d) => PENDING_STATUSES.has(d.status));
    if (!hasPending || !isAuthenticated) return;

    setIsPolling(true);
    const interval = setInterval(async () => {
      try {
        const updated = await fetchHistory();
        const prev = depositsRef.current;

        for (const session of updated) {
          const old = prev.find((p) => p.reference_id === session.reference_id);
          if (
            old &&
            PENDING_STATUSES.has(old.status) &&
            (session.status === "completed" || session.status === "over_filled")
          ) {
            toast({
              title: "Deposit confirmed!",
              description: `Your $${session.amount_usd} deposit has been received${
                session.filled_currency ? ` in ${session.filled_currency}` : ""
              }.`,
            });
          }
        }

        depositsRef.current = updated;
        setDeposits(updated);

        if (!updated.some((d) => PENDING_STATUSES.has(d.status))) {
          setIsPolling(false);
          clearInterval(interval);
        }
      } catch {
        // silently ignore poll errors
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [deposits, isAuthenticated, toast]);

  const handleLoadMore = () => {
    setRoundsOffset((prev) => prev + 10);
  };

  const handleVerify = (roundId: number) => {
    const serverSeed = verifyInputs[roundId]?.trim();
    if (!serverSeed) {
      toast({
        title: "Server seed required",
        description: "Please enter the server seed to verify this round.",
      });
      return;
    }
    verifyRoundMutation.mutate({
      id: roundId,
      data: { roundId, serverSeed },
    });
  };

  const toggleVerifyExpand = (roundId: number) => {
    setExpandedVerify((prev) => {
      const next = new Set(prev);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
  };

  const totalWagered = allRounds.reduce((sum, r) => sum + r.betAmount, 0);
  const totalWon = allRounds.reduce((sum, r) => sum + r.payout, 0);
  const netProfit = totalWon - totalWagered;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex items-center gap-4 mb-10">
          <div className="h-16 w-16 rounded-full bg-white/5 animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-40 bg-white/5 animate-pulse rounded" />
            <div className="h-4 w-56 bg-white/5 animate-pulse rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-white/5 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.trim() || "P";
  const displayName = user.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : (user.email ?? "Player");

  const totalDeposited = deposits
    .filter((d) => d.status === "completed" || d.status === "partial")
    .reduce((sum, d) => sum + (d.amount_usd ?? 0), 0);

  const balanceValue = walletLoading
    ? "..."
    : wallet
      ? formatCents(wallet.balance)
      : "$0.00";

  const gamesPlayed = allRounds.length;

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-10">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/40 shadow-[0_0_20px_rgba(234,179,8,0.25)]">
            <span className="text-xl font-bold text-primary">{initials}</span>
          </div>
          <Crown className="absolute -bottom-1 -right-1 h-5 w-5 text-primary drop-shadow-[0_0_4px_rgba(234,179,8,0.8)]" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{displayName}</h1>
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/20 text-primary border border-primary/30">
              Gold Member
            </span>
          </div>
          {user.email && (
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Welcome back — Ohio's high-roller lounge is open.
          </p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="text-muted-foreground hover:text-destructive flex items-center gap-1.5 text-sm"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard
          icon={TrendingUp}
          label="Account Balance"
          value={balanceValue}
          sub={walletLoading ? "Loading..." : "Real-time balance"}
          color="text-primary"
        />
        <StatCard
          icon={Trophy}
          label="Total Winnings"
          value={gamesPlayed > 0 ? formatCents(totalWon) : "$0.00"}
          sub={gamesPlayed > 0 ? `${gamesPlayed} rounds played` : "All time"}
          color="text-yellow-400"
        />
        <StatCard
          icon={Zap}
          label="Games Played"
          value={String(gamesPlayed)}
          sub={gamesPlayed > 0 ? "Keep playing!" : "Start playing!"}
          color="text-blue-400"
        />
        <StatCard
          icon={Star}
          label="Net Profit/Loss"
          value={gamesPlayed > 0 ? formatCents(netProfit) : "$0.00"}
          sub={
            netProfit > 0
              ? "You're up!"
              : netProfit < 0
                ? "Down for now"
                : "Break even"
          }
          color={netProfit >= 0 ? "text-emerald-400" : "text-red-400"}
        />
      </div>

      {/* Active Bonus Banner */}
      <div className="rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border border-primary/20 p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary flex-shrink-0" />
          <div>
            <p className="font-bold text-white">Welcome Bonus Active</p>
            <p className="text-sm text-muted-foreground">
              200% match on first deposit up to $2,000 + 100 Free Spins.{" "}
              <span className="text-primary">30x wagering requirement.</span>
            </p>
          </div>
        </div>
        <a
          href="/promotions"
          className="btn btn-primary shadow-[0_0_12px_rgba(234,179,8,0.3)] flex-shrink-0"
        >
          View All Bonuses
        </a>
      </div>

      {/* Wallet Overview */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <Wallet className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-white">Wallet Overview</h2>
        </div>
        <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5 divide-y md:divide-y-0">
            <div className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Current Balance
              </p>
              <p className="text-xl font-bold text-white mt-1">
                {walletLoading ? (
                  <span className="inline-block h-6 w-20 bg-white/5 animate-pulse rounded" />
                ) : wallet ? (
                  formatCents(wallet.balance)
                ) : (
                  "$0.00"
                )}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Total Wagered
              </p>
              <p className="text-xl font-bold text-white mt-1">
                {roundsLoading && allRounds.length === 0 ? (
                  <span className="inline-block h-6 w-20 bg-white/5 animate-pulse rounded" />
                ) : (
                  formatCents(totalWagered)
                )}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Total Won
              </p>
              <p className="text-xl font-bold text-white mt-1">
                {roundsLoading && allRounds.length === 0 ? (
                  <span className="inline-block h-6 w-20 bg-white/5 animate-pulse rounded" />
                ) : (
                  formatCents(totalWon)
                )}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Net P/L
              </p>
              <p
                className={`text-xl font-bold mt-1 ${
                  netProfit >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {roundsLoading && allRounds.length === 0 ? (
                  <span className="inline-block h-6 w-20 bg-white/5 animate-pulse rounded" />
                ) : (
                  formatCents(netProfit)
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bet History */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Dices className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-white">Bet History</h2>
            {allRounds.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {allRounds.length} round{allRounds.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {roundsLoading && allRounds.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-white/5 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : allRounds.length === 0 ? (
          <div className="bg-card border border-white/5 rounded-xl px-6 py-10 text-center">
            <Dices className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-white font-medium mb-1">No bets yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Place your first bet to see your history here.
            </p>
            <a href="/games" className="btn btn-primary">
              Browse Games
            </a>
          </div>
        ) : (
          <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/5 text-xs text-muted-foreground uppercase tracking-wider">
              <div className="col-span-2">Game</div>
              <div className="col-span-2">Bet</div>
              <div className="col-span-2">Payout</div>
              <div className="col-span-2">Result</div>
              <div className="col-span-2">Time</div>
              <div className="col-span-2 text-right">Status</div>
            </div>
            <div className="divide-y divide-white/5">
              {allRounds.map((round) => {
                const profit = round.payout - round.betAmount;
                const isWin = round.payout > 0;
                const isVerifyPending = verifyRoundMutation.isPending;
                const isVerifyingThisRound =
                  verifyRoundMutation.variables?.id === round.id &&
                  isVerifyPending;

                return (
                  <div
                    key={round.id}
                    className="px-5 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Mobile layout */}
                    <div className="md:hidden space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">
                          {capitalize(round.gameType)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(round.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Bet:</span>
                        <span className="text-white">
                          {formatCents(round.betAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Payout:</span>
                        <span
                          className={
                            isWin ? "text-emerald-400" : "text-red-400"
                          }
                        >
                          {formatCents(round.payout)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        {round.verified ? (
                          <Badge
                            variant="default"
                            className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            <Clock className="h-3 w-3 mr-1" /> Pending
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleVerifyExpand(round.id)}
                          className="text-primary hover:text-primary/80 text-xs flex items-center gap-1"
                        >
                          {expandedVerify.has(round.id) ? (
                            <>
                              <ChevronUp className="h-3 w-3" /> Hide
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" /> Verify
                            </>
                          )}
                        </button>
                      </div>
                      {expandedVerify.has(round.id) && (
                        <div className="pt-2 border-t border-white/5 space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Server Seed Hash:{" "}
                            <span className="font-mono text-white">
                              {round.serverSeedHash.slice(0, 16)}...
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Client Seed:{" "}
                            <span className="font-mono text-white">
                              {round.clientSeed}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Enter server seed..."
                              value={verifyInputs[round.id] ?? ""}
                              onChange={(e) =>
                                setVerifyInputs((prev) => ({
                                  ...prev,
                                  [round.id]: e.target.value,
                                }))
                              }
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleVerify(round.id)}
                              disabled={isVerifyingThisRound}
                            >
                              {isVerifyingThisRound ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : null}
                              Verify
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-2">
                        <span className="text-sm font-medium text-white">
                          {capitalize(round.gameType)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-white">
                          {formatCents(round.betAmount)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span
                          className={`text-sm font-medium ${
                            isWin ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {formatCents(round.payout)}
                          {profit !== 0 && (
                            <span className="text-xs ml-1 text-muted-foreground">
                              ({profit > 0 ? "+" : ""}
                              {formatCents(profit)})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-white">
                          {round.result ? capitalize(round.result) : "Pending"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(round.createdAt)}
                        </span>
                      </div>
                      <div className="col-span-2 text-right flex items-center justify-end gap-2">
                        {round.verified ? (
                          <Badge
                            variant="default"
                            className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            <Clock className="h-3 w-3 mr-1" /> Pending
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleVerifyExpand(round.id)}
                          className="text-primary hover:text-primary/80 text-xs flex items-center gap-1"
                        >
                          {expandedVerify.has(round.id) ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Desktop verify expand */}
                    {expandedVerify.has(round.id) && (
                      <div className="hidden md:block mt-3 pt-3 border-t border-white/5">
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-4 text-xs text-muted-foreground">
                            Server Seed Hash:{" "}
                            <span className="font-mono text-white">
                              {round.serverSeedHash}
                            </span>
                          </div>
                          <div className="col-span-3 text-xs text-muted-foreground">
                            Client Seed:{" "}
                            <span className="font-mono text-white">
                              {round.clientSeed}
                            </span>
                          </div>
                          <div className="col-span-3">
                            <input
                              type="text"
                              placeholder="Enter server seed..."
                              value={verifyInputs[round.id] ?? ""}
                              onChange={(e) =>
                                setVerifyInputs((prev) => ({
                                  ...prev,
                                  [round.id]: e.target.value,
                                }))
                              }
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                            />
                          </div>
                          <div className="col-span-2 text-right">
                            <Button
                              size="sm"
                              onClick={() => handleVerify(round.id)}
                              disabled={isVerifyingThisRound}
                            >
                              {isVerifyingThisRound ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : null}
                              Verify
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {rounds && rounds.length === 10 && (
              <div className="px-5 py-4 border-t border-white/5 text-center">
                <Button
                  variant="ghost"
                  onClick={handleLoadMore}
                  disabled={roundsLoading}
                >
                  {roundsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deposit History */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-white">Deposit History</h2>
            {isPolling && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Checking…
              </span>
            )}
          </div>
          <a
            href="/cashier"
            className="text-primary hover:text-primary/80 text-sm"
          >
            + Add Funds
          </a>
        </div>

        {depositsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 bg-white/5 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : deposits.length === 0 ? (
          <div className="bg-card border border-white/5 rounded-xl px-6 py-10 text-center">
            <Wallet className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-white font-medium mb-1">No deposits yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Make your first deposit to claim your welcome bonus.
            </p>
            <a href="/cashier" className="btn btn-primary">
              Deposit Now
            </a>
          </div>
        ) : (
          <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
            {totalDeposited > 0 && (
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Total deposited
                </span>
                <span className="text-sm font-bold text-primary">
                  ${totalDeposited.toLocaleString()}
                </span>
              </div>
            )}
            <div className="divide-y divide-white/5" aria-live="polite">
              {deposits.map((dep) => {
                const date = new Date(dep.created_at);
                const dateStr = date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                const timeStr = date.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={dep.reference_id}
                    className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/5">
                        <Wallet className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          ${dep.amount_usd} Deposit
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dateStr} · {timeStr}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <StatusBadge status={dep.status} />
                      {dep.filled_amount && dep.filled_currency && (
                        <p className="text-xs text-muted-foreground">
                          {dep.filled_amount} {dep.filled_currency}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* My Favorites */}
      {features.favorites && favorites.size > 0 && hotGames && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500 fill-red-500" />
              <h2 className="text-lg font-bold text-white">My Favorites</h2>
              <span className="text-xs text-muted-foreground">
                {favorites.size} game{favorites.size !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {hotGames
              .filter((g) => favorites.has(String(g.id)))
              .map((game) => (
                <a
                  key={game.id}
                  href={`/games/${game.id}`}
                  className="group block"
                >
                  <div className="casino-card relative overflow-hidden transition-all duration-300 hover:scale-[1.02]">
                    <div className="aspect-[4/3] w-full overflow-hidden relative">
                      <img
                        src={
                          game.imageUrl || getGameFallbackImage(game.category)
                        }
                        alt={game.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite(String(game.id));
                        }}
                        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
                        aria-label="Unfavorite"
                      >
                        <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                      </button>
                      <div className="absolute bottom-0 left-0 w-full p-3">
                        <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wider">
                          {game.category}
                        </p>
                        <h3 className="text-sm font-bold text-white leading-tight truncate">
                          {game.name}
                        </h3>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Recommended Games */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Recommended For You</h2>
          <a
            href="/games"
            className="text-primary hover:text-primary/80 text-sm"
          >
            View All Games
          </a>
        </div>

        {gamesLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-48 bg-white/5 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {hotGames?.slice(0, 4).map((game) => (
              <a
                key={game.id}
                href={`/games/${game.id}`}
                className="group block"
              >
                <div className="casino-card relative overflow-hidden transition-all duration-300 hover:scale-[1.02]">
                  <div className="aspect-[4/3] w-full overflow-hidden relative">
                    <img
                      src={game.imageUrl || getGameFallbackImage(game.category)}
                      alt={game.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80" />
                    {features.favorites && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite(String(game.id));
                          toast({
                            title: isFavorite(String(game.id))
                              ? "Removed from favorites"
                              : "Added to favorites",
                            description: game.name,
                          });
                        }}
                        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
                        aria-label={
                          isFavorite(String(game.id))
                            ? "Unfavorite"
                            : "Favorite"
                        }
                      >
                        <Heart
                          className={`h-4 w-4 transition-colors ${
                            isFavorite(String(game.id))
                              ? "fill-red-500 text-red-500"
                              : "text-white/70 hover:text-white"
                          }`}
                        />
                      </button>
                    )}
                    <div className="absolute bottom-0 left-0 w-full p-3">
                      <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wider">
                        {game.category}
                      </p>
                      <h3 className="text-sm font-bold text-white leading-tight truncate">
                        {game.name}
                      </h3>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
