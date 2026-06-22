import { useAuth } from "@workspace/replit-auth-web";
import { useEffect, useRef, useState } from "react";
import {
  useListGames,
  getListGamesQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
import { getGameFallbackImage } from "@/lib/game-helpers";

interface DepositSession {
  reference_id: string;
  invoice_id: string;
  amount_usd: number;
  status: string;
  filled_amount: string | null;
  filled_currency: string | null;
  created_at: string;
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

  const { data: hotGames, isLoading: gamesLoading } = useListGames(
    { category: "slots" },
    { query: { queryKey: getListGamesQueryKey({ category: "slots" }) } },
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      login();
    }
  }, [isLoading, isAuthenticated, login]);

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
          value="$500.00"
          sub="Welcome bonus applied"
          color="text-primary"
        />
        <StatCard
          icon={Trophy}
          label="Total Winnings"
          value="$0.00"
          sub="All time"
          color="text-yellow-400"
        />
        <StatCard
          icon={Zap}
          label="Games Played"
          value="0"
          sub="Start playing!"
          color="text-blue-400"
        />
        <StatCard
          icon={Star}
          label="VIP Points"
          value="0 pts"
          sub="Earn on every wager"
          color="text-purple-400"
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
