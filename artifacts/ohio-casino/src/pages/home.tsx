import { useEffect, useState } from "wouter";
import { Link } from "wouter";
import { useListFeaturedGames, getListFeaturedGamesQueryKey, useListWinners, getListWinnersQueryKey, useGetCasinoStats, getGetCasinoStatsQueryKey } from "@workspace/api-client-react";
import { GameCard, GameCardSkeleton } from "@/components/game-card";
import { formatCurrency } from "@/lib/utils-casino";
import { Button } from "@/components/ui/button";

function JackpotCounter({ value }: { value: number }) {
  // Simple animated counter
  return (
    <div className="font-mono text-5xl md:text-7xl lg:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-primary via-yellow-300 to-yellow-600 drop-shadow-[0_0_25px_rgba(234,179,8,0.5)] tracking-tighter">
      {formatCurrency(value)}
    </div>
  );
}

export function Home() {
  const { data: featuredGames, isLoading: gamesLoading } = useListFeaturedGames({
    query: { queryKey: getListFeaturedGamesQueryKey() }
  });
  
  const { data: winners, isLoading: winnersLoading } = useListWinners({ limit: 10 }, {
    query: { queryKey: getListWinnersQueryKey({ limit: 10 }) }
  });
  
  const { data: stats, isLoading: statsLoading } = useGetCasinoStats({
    query: { queryKey: getGetCasinoStatsQueryKey(), refetchInterval: 30000 }
  });

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.15),transparent_70%)]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay pointer-events-none" />
        
        <div className="container mx-auto px-4 z-10 flex flex-col items-center text-center mt-12 mb-8">
          <Badge className="mb-6 bg-red-500/20 text-red-500 border border-red-500/50 px-4 py-1.5 backdrop-blur-md">
            <span className="relative flex h-2 w-2 mr-2 inline-block">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            LIVE PROGRESSIVE JACKPOT
          </Badge>
          
          <div className="mb-8">
            {statsLoading ? (
              <div className="h-24 w-64 md:w-96 bg-white/5 animate-pulse rounded-lg mx-auto" />
            ) : (
              <JackpotCounter value={stats?.currentJackpot || 14592034} />
            )}
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 max-w-3xl tracking-tight leading-tight">
            Ohio's High-Roller Experience
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10">
            Step into the VIP lounge. Premium games, massive payouts, and non-stop action.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link href="/games">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 h-14 w-full sm:w-auto shadow-[0_0_20px_rgba(234,179,8,0.4)]">
                Play Now
              </Button>
            </Link>
            <Link href="/promotions">
              <Button size="lg" variant="outline" className="text-lg px-8 h-14 w-full sm:w-auto border-white/20 hover:bg-white/5">
                View Promotions
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="w-full mt-auto bg-background/50 backdrop-blur-xl border-t border-white/10 py-6">
          <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="flex flex-col items-center text-center">
              <span className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Total Payout Today</span>
              <span className="text-2xl font-bold text-white">
                {statsLoading ? <div className="h-8 w-24 bg-white/10 animate-pulse rounded" /> : formatCurrency(stats?.totalPayoutToday || 0)}
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Active Players</span>
              <span className="text-2xl font-bold text-white">
                {statsLoading ? <div className="h-8 w-16 bg-white/10 animate-pulse rounded" /> : (stats?.activePlayers?.toLocaleString() || '0')}
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Games Available</span>
              <span className="text-2xl font-bold text-white">
                {statsLoading ? <div className="h-8 w-16 bg-white/10 animate-pulse rounded" /> : (stats?.gamesAvailable?.toLocaleString() || '0')}
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Win Rate</span>
              <span className="text-2xl font-bold text-primary">97.8%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Winners Ticker */}
      <div className="bg-card border-b border-white/5 overflow-hidden flex items-center h-12">
        <div className="bg-primary/10 text-primary px-4 h-full flex items-center font-bold whitespace-nowrap z-10 border-r border-primary/20">
          RECENT WINS
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-8 h-full bg-gradient-to-r from-card to-transparent z-10" />
          <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-card to-transparent z-10" />
          <div className="animate-[marquee_20s_linear_infinite] flex whitespace-nowrap items-center h-full gap-8 px-4">
            {!winnersLoading && winners && winners.map((winner, i) => (
              <div key={`${winner.id}-${i}`} className="flex items-center gap-2">
                <span className="text-white font-medium">{winner.playerName}</span>
                <span className="text-muted-foreground text-sm">won</span>
                <span className="text-primary font-bold">{formatCurrency(winner.winAmount)}</span>
                <span className="text-muted-foreground text-sm">on</span>
                <span className="text-white font-medium">{winner.gameName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Featured Games */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Featured Games</h2>
              <p className="text-muted-foreground">Hand-picked for high rollers.</p>
            </div>
            <Link href="/games" className="text-primary hover:text-primary/80 font-medium hidden sm:block">
              View All Games &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {gamesLoading ? (
              Array.from({ length: 8 }).map((_, i) => <GameCardSkeleton key={i} />)
            ) : featuredGames ? (
              featuredGames.map((game) => (
                <GameCard key={game.id} {...game} />
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-muted-foreground">No games found.</div>
            )}
          </div>
          
          <div className="mt-8 text-center sm:hidden">
            <Link href="/games">
              <Button variant="outline" className="w-full">View All Games</Button>
            </Link>
          </div>
        </div>
      </section>
      
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// Add Badge component locally if not exported from index
function Badge({ children, className, ...props }: any) {
  return <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`} {...props}>{children}</div>
}
