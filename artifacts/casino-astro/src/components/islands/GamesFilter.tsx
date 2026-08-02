import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useGetWallet } from "@workspace/api-client-react";
import type { Game } from "@workspace/api-client-react";
import { filterGamesByCategory, filterGamesBySearch } from "@/lib/game-helpers";
import { getGameFallbackImage } from "@/lib/game-helpers";

interface GamesFilterProps {
  categories: Array<{ name: string; count: number }>;
  games: Game[];
}

type SortOption = "name-asc" | "name-desc" | "hot-first" | "new-first";

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function GameCardReact({ game }: { game: Game }) {
  const { data: wallet, isLoading: walletLoading } = useGetWallet();
  const image = game.imageUrl || getGameFallbackImage(game.category);

  const balanceLabel = walletLoading
    ? "Balance loading..."
    : wallet
      ? `Balance ${formatCents(wallet.balance)}`
      : "Balance unavailable";

  return (
    <div className="group block">
      <div className="casino-card relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(234,179,8,0.15)] hover:border-primary/50 cursor-pointer">
        <div className="aspect-[4/3] w-full overflow-hidden relative">
          <img
            src={image}
            alt={game.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {game.isHot && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-destructive text-destructive-foreground shadow-[0_0_10px_rgba(220,38,38,0.8)] border-none">
                HOT
              </span>
            )}
            {game.isNew && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.8)] border-none">
                NEW
              </span>
            )}
            {game.isFeatured && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground shadow-[0_0_10px_rgba(234,179,8,0.8)] border-none">
                FEATURED
              </span>
            )}
          </div>

          <div className="absolute bottom-0 left-0 w-full p-4 transform translate-y-2 group-hover:translate-y-0 transition-transform">
            <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wider">
              {game.category}
            </p>
            <h3 className="text-lg font-bold text-white leading-tight truncate">
              {game.name}
            </h3>
            <p className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity delay-100">
              {game.provider}
            </p>
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 bg-black/40 backdrop-blur-[2px] gap-3">
            <div className="flex flex-col items-center gap-1">
              <a
                href={`/games/${game.id}?mode=real`}
                className="bg-primary text-primary-foreground font-bold px-6 py-2 rounded-full transform scale-90 group-hover:scale-100 transition-transform duration-300 shadow-[0_0_20px_rgba(234,179,8,0.6)] text-sm"
              >
                PLAY NOW
              </a>
              <span className="text-[11px] text-white/80">{balanceLabel}</span>
            </div>
            <a
              href={`/games/${game.id}?mode=demo`}
              className="bg-white/10 text-white font-bold px-6 py-2 rounded-full transform scale-90 group-hover:scale-100 transition-transform duration-300 border border-white/20 hover:bg-white/20 text-sm"
            >
              FREE PLAY
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GamesFilter({ categories, games }: GamesFilterProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  const providers = useMemo(() => {
    const unique = Array.from(new Set(games.map((g) => g.provider)));
    return unique.sort();
  }, [games]);

  const filteredGames = useMemo(() => {
    let filtered = filterGamesBySearch(
      filterGamesByCategory(games, selectedCategory),
      debouncedQuery,
    );

    if (selectedProvider !== "all") {
      filtered = filtered.filter((g) => g.provider === selectedProvider);
    }

    switch (sortBy) {
      case "name-asc":
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
      case "name-desc":
        return filtered.sort((a, b) => b.name.localeCompare(a.name));
      case "hot-first":
        return filtered.sort((a, b) => (b.isHot ? 1 : 0) - (a.isHot ? 1 : 0));
      case "new-first":
        return filtered.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
      default:
        return filtered;
    }
  }, [games, selectedCategory, debouncedQuery, selectedProvider, sortBy]);

  const hasActiveFilters =
    selectedCategory !== "all" ||
    searchQuery !== "" ||
    selectedProvider !== "all" ||
    sortBy !== "name-asc";

  function clearAllFilters() {
    setSelectedCategory("all");
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedProvider("all");
    setSortBy("name-asc");
  }

  return (
    <div className="casino-lobby flex flex-col lg:flex-row gap-8">
      {/* Sidebar */}
      <aside className="lg:w-64 shrink-0">
        <div className="sticky top-24 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-4">
            Categories
          </h2>
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`justify-start h-12 px-4 text-left rounded-md transition-colors ${
              selectedCategory === "all"
                ? "bg-white/10 text-white font-bold"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            }`}
          >
            All Games
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setSelectedCategory(cat.name)}
              className={`justify-between h-12 px-4 text-left rounded-md transition-colors flex items-center ${
                selectedCategory === cat.name
                  ? "bg-white/10 text-white font-bold border-l-2 border-primary rounded-l-none"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="capitalize">{cat.name}</span>
              <span className="text-xs bg-white/5 px-2 py-1 rounded-full text-muted-foreground">
                {cat.count}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Grid */}
      <main className="flex-1">
        {/* Search + Filters Row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search games or providers"
              placeholder="Search games or providers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-card/50 border border-white/10 rounded-md text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary h-12"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedQuery("");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <select
            aria-label="Filter by provider"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="h-12 px-4 bg-card/50 border border-white/10 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer min-w-[140px]"
          >
            <option value="all">All Providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <div className="relative">
            <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <select
              aria-label="Sort games"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-12 pl-10 pr-4 bg-card/50 border border-white/10 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer min-w-[140px]"
            >
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="hot-first">Hot First</option>
              <option value="new-first">New First</option>
            </select>
          </div>
        </div>

        {/* Active filter count + clear */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mb-4 text-sm">
            <span className="text-muted-foreground">
              {filteredGames.length} game{filteredGames.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-primary hover:text-primary/80 underline underline-offset-2"
            >
              Clear all filters
            </button>
          </div>
        )}

        {filteredGames.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredGames.map((game) => (
              <GameCardReact key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-white/5 rounded-xl bg-card/30 border-dashed">
            <h3 className="text-xl font-bold text-white mb-2">
              No games found
            </h3>
            <p className="text-muted-foreground mb-6">
              Try adjusting your search or category filter.
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="btn btn-secondary"
            >
              Clear Filters
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
