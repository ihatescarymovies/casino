import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListGames, getListGamesQueryKey, useListWinners, getListWinnersQueryKey } from "@workspace/api-client-react";
import { GameCard } from "@/components/game-card";
import {
  Trophy,
  Zap,
  Star,
  TrendingUp,
  Shield,
  LogOut,
  Crown,
} from "lucide-react";
import { motion } from "framer-motion";

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

export function Dashboard() {
  const { user, isLoading, isAuthenticated, logout, login } = useAuth();
  const [, navigate] = useLocation();

  const { data: hotGames, isLoading: gamesLoading } = useListGames(
    { category: "slots" },
    { query: { queryKey: getListGamesQueryKey({ category: "slots" }) } }
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      login();
    }
  }, [isLoading, isAuthenticated, login]);

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
