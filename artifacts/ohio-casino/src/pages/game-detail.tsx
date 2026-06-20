import { useParams, Link } from "wouter";
import { useGetGame, getGetGameQueryKey, useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GameCard } from "@/components/game-card";
import { getGameFallbackImage, formatCurrency } from "@/lib/utils-casino";

export function GameDetail() {
  const { id } = useParams();
  const gameId = parseInt(id || "0", 10);
  
  const { data: game, isLoading } = useGetGame(gameId, {
    query: { queryKey: getGetGameQueryKey(gameId), enabled: !!gameId }
  });

  // Fetch related games from the same category
  const categoryParam = game?.category ? { category: game.category } : {};
  const { data: relatedGames } = useListGames(categoryParam, {
    query: { queryKey: getListGamesQueryKey(categoryParam), enabled: !!game?.category }
  });

  const filteredRelatedGames = relatedGames?.filter(g => g.id !== gameId).slice(0, 4) || [];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 animate-pulse">
        <div className="h-8 w-32 bg-white/5 rounded mb-8" />
        <div className="flex flex-col lg:flex-row gap-12">
          <div className="lg:w-2/3 aspect-[16/9] bg-white/5 rounded-2xl" />
          <div className="lg:w-1/3 flex flex-col gap-6">
            <div className="h-12 w-3/4 bg-white/5 rounded" />
            <div className="h-6 w-1/2 bg-white/5 rounded" />
            <div className="h-24 w-full bg-white/5 rounded" />
            <div className="h-14 w-full bg-white/10 rounded mt-4" />
          </div>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="container mx-auto px-4 py-32 text-center flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-white mb-4">Game Not Found</h2>
        <p className="text-muted-foreground mb-8">The game you're looking for doesn't exist or is currently unavailable.</p>
        <Link href="/games">
          <Button>Back to Games</Button>
        </Link>
      </div>
    );
  }

  const image = game.imageUrl || getGameFallbackImage(game.category);

  return (
    <div className="container mx-auto px-4 py-12 flex flex-col gap-12">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/games" className="hover:text-white transition-colors">Games</Link>
        <span>/</span>
        <span className="capitalize">{game.category}</span>
        <span>/</span>
        <span className="text-white font-medium">{game.name}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-12">
        {/* Game Window Placeholder */}
        <div className="lg:w-2/3 flex flex-col gap-6">
          <div className="relative aspect-[16/9] bg-black rounded-2xl overflow-hidden border border-white/10 group flex items-center justify-center">
            <img src={image} alt={game.name} className="absolute inset-0 w-full h-full object-cover opacity-40 blur-[2px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            
            <div className="relative z-10 flex flex-col items-center text-center p-6 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl max-w-md w-full">
              <h2 className="text-3xl font-bold text-white mb-2">{game.name}</h2>
              <p className="text-primary font-medium mb-8 uppercase tracking-wider">{game.provider}</p>
              
              <Button size="lg" className="w-full text-xl h-16 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_30px_rgba(234,179,8,0.5)]">
                PLAY FOR REAL
              </Button>
              <Button variant="ghost" className="w-full mt-2 text-muted-foreground hover:text-white">
                Try Demo Version
              </Button>
            </div>
          </div>

          <div className="prose prose-invert max-w-none">
            <h3 className="text-xl font-bold text-white mb-4">About {game.name}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {game.description || `Experience the thrill of ${game.name}, a premium ${game.category} game by ${game.provider}. Featuring stunning graphics, smooth gameplay, and exciting mechanics designed for high rollers.`}
            </p>
          </div>
        </div>

        {/* Game Info Sidebar */}
        <aside className="lg:w-1/3 flex flex-col gap-6">
          <div className="bg-card border border-white/5 rounded-2xl p-6 flex flex-col gap-6">
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                {game.isHot && <Badge variant="destructive" className="border-none shadow-[0_0_10px_rgba(220,38,38,0.8)]">HOT</Badge>}
                {game.isNew && <Badge className="bg-blue-500 border-none shadow-[0_0_10px_rgba(59,130,246,0.8)]">NEW</Badge>}
                {game.isFeatured && <Badge className="bg-primary text-primary-foreground border-none shadow-[0_0_10px_rgba(234,179,8,0.8)]">FEATURED</Badge>}
                <Badge variant="outline" className="uppercase tracking-wider">{game.category}</Badge>
              </div>
              
              <h1 className="text-4xl font-black text-white tracking-tight mb-2">{game.name}</h1>
              <p className="text-lg text-muted-foreground">by {game.provider}</p>
            </div>

            {game.jackpotAmount && (
              <div className="bg-black/50 border border-primary/30 rounded-xl p-4 text-center">
                <span className="block text-xs font-bold text-primary uppercase tracking-widest mb-1">Current Jackpot</span>
                <span className="block text-3xl font-black text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
                  {formatCurrency(game.jackpotAmount)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/20 border border-white/5 rounded-lg p-4">
                <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">RTP</span>
                <span className="block text-xl font-bold text-white">{game.rtp}%</span>
              </div>
              <div className="bg-black/20 border border-white/5 rounded-lg p-4">
                <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Volatility</span>
                <span className="block text-xl font-bold text-white">High</span>
              </div>
              <div className="bg-black/20 border border-white/5 rounded-lg p-4">
                <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Min Bet</span>
                <span className="block text-xl font-bold text-white">{game.minBet ? formatCurrency(game.minBet) : '$1'}</span>
              </div>
              <div className="bg-black/20 border border-white/5 rounded-lg p-4">
                <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">Max Bet</span>
                <span className="block text-xl font-bold text-white">{game.maxBet ? formatCurrency(game.maxBet) : '$5,000'}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Related Games */}
      {filteredRelatedGames.length > 0 && (
        <section className="pt-12 border-t border-white/10 mt-12">
          <h2 className="text-2xl font-bold text-white mb-8">More {game.category} Games</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredRelatedGames.map(relatedGame => (
              <GameCard key={relatedGame.id} {...relatedGame} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
