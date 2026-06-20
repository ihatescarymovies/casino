import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { GameCard } from "@/components/game-card";
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
} from "lucide-react";
import { motion } from "framer-motion";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

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
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-white/5 rounded-xl p-5 flex items-start gap-4 hover:border-primary/20 transition-colors"
    >
      <div className={`p-2 rounded-lg bg-white/5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </motion.div>
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

export function Dashboard() {
  const { user, isLoading, isAuthenticated, logout, login } = useAuth();
  const [, navigate] = useLocation();
  const [deposits, setDeposits] = useState<DepositSession[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(true);

  const { data: hotGames, isLoading: gamesLoading } = useListGames(
    { category: "slots" },
    { query: { queryKey: getListGamesQueryKey({ category: "slots" }) } }
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      login();
    }
  }, [isLoading, isAuthenticated, login]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`${BASE_URL}/api/payments/history`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setDeposits(Array.isArray(data) ? data : []);
        setDepositsLoading(false);
      })
      .catch(() => setDepositsLoading(false));
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex items-center gap-4 mb-10">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
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
  const displayName =
    user.firstName
      ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
      : user.email ?? "Player";

  const totalDeposited = deposits
    .filter((d) => d.status === "completed" || d.status === "partial")
    .reduce((sum, d) => sum + (d.amount_usd ?? 0), 0);

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-10"
      >
        <div className="relative">
          <Avatar className="h-16 w-16 ring-2 ring-primary/40 shadow-[0_0_20px_rgba(234,179,8,0.25)]">
            <AvatarImage src={user.profileImageUrl ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Crown className="absolute -bottom-1 -right-1 h-5 w-5 text-primary drop-shadow-[0_0_4px_rgba(234,179,8,0.8)]" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{displayName}</h1>
            <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
              Gold Member
            </Badge>
          </div>
          {user.email && (
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Welcome back — Ohio's high-roller lounge is open.
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-muted-foreground hover:text-destructive flex items-center gap-1.5"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </Button>
      </motion.div>

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
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border border-primary/20 p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
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
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_12px_rgba(234,179,8,0.3)] flex-shrink-0"
          onClick={() => navigate("/promotions")}
        >
          View All Bonuses
        </Button>
      </motion.div>

      {/* Deposit History */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mb-10"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-white">Deposit History</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary/80"
            onClick={() => navigate("/cashier")}
          >
            + Add Funds
          </Button>
        </div>

        {depositsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : deposits.length === 0 ? (
          <div className="bg-card border border-white/5 rounded-xl px-6 py-10 text-center">
            <Wallet className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-white font-medium mb-1">No deposits yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Make your first deposit to claim your welcome bonus.
            </p>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate("/cashier")}
            >
              Deposit Now
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
            {totalDeposited > 0 && (
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Total deposited</span>
                <span className="text-sm font-bold text-primary">${totalDeposited.toLocaleString()}</span>
              </div>
            )}
            <div className="divide-y divide-white/5">
              {deposits.map((dep, i) => {
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
                  <motion.div
                    key={dep.reference_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
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
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>

      {/* Recommended Games */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Recommended For You</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary/80"
            onClick={() => navigate("/games")}
          >
            View All Games
          </Button>
        </div>

        {gamesLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {hotGames?.slice(0, 4).map((game, i) => (
              <GameCard key={game.id} game={game} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
