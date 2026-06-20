import { useState } from "react";
import { useListGames, getListGamesQueryKey, useListGameCategories, getListGameCategoriesQueryKey } from "@workspace/api-client-react";
import { GameCard, GameCardSkeleton } from "@/components/game-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function Games() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: categories, isLoading: categoriesLoading } = useListGameCategories({
    query: { queryKey: getListGameCategoriesQueryKey() }
  });

  const queryParams = selectedCategory === "all" ? {} : { category: selectedCategory };
  const { data: games, isLoading: gamesLoading } = useListGames(queryParams, {
    query: { queryKey: getListGamesQueryKey(queryParams) }
  });

  const filteredGames = games?.filter(game => 
    game.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    game.provider.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-12 flex flex-col gap-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/10 pb-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Casino Lobby</h1>
          <p className="text-muted-foreground text-lg">Find your next big win from our selection of premium games.</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search games or providers..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card/50 border-white/10 focus-visible:ring-primary h-12"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Nav */}
        <aside className="lg:w-64 shrink-0">
          <div className="sticky top-24 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-4">Categories</h3>
            <Button
              variant="ghost"
              className={`justify-start h-12 px-4 ${selectedCategory === "all" ? "bg-white/10 text-white font-bold" : "text-muted-foreground hover:text-white"}`}
              onClick={() => setSelectedCategory("all")}
            >
              All Games
            </Button>
            
            {categoriesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 w-full bg-white/5 rounded-md animate-pulse my-1" />
              ))
            ) : categories ? (
              categories.map(cat => (
                <Button
                  key={cat.name}
                  variant="ghost"
                  className={`justify-between h-12 px-4 ${selectedCategory === cat.name ? "bg-white/10 text-white font-bold border-l-2 border-primary rounded-l-none" : "text-muted-foreground hover:text-white"}`}
                  onClick={() => setSelectedCategory(cat.name)}
                >
                  <span className="capitalize">{cat.name}</span>
                  <span className="text-xs bg-white/5 px-2 py-1 rounded-full text-muted-foreground">{cat.count}</span>
                </Button>
              ))
            ) : null}
          </div>
        </aside>

        {/* Main Grid */}
        <main className="flex-1">
          {gamesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 12 }).map((_, i) => <GameCardSkeleton key={i} />)}
            </div>
          ) : filteredGames && filteredGames.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredGames.map(game => (
                <GameCard key={game.id} {...game} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 text-center border border-white/5 rounded-xl bg-card/30 border-dashed">
              <h3 className="text-xl font-bold text-white mb-2">No games found</h3>
              <p className="text-muted-foreground mb-6">Try adjusting your search or category filter.</p>
              <Button variant="outline" onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}>
                Clear Filters
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
