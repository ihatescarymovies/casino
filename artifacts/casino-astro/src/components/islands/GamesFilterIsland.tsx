import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { IslandErrorBoundary } from "@/components/IslandErrorBoundary.tsx";
import GamesFilter from "./GamesFilter.tsx";
import type { Game } from "@workspace/api-client-react";

interface Category {
  name: string;
  count: number;
}

interface GamesFilterIslandProps {
  categories: Category[];
  games: Game[];
}

export default function GamesFilterIsland({
  categories,
  games,
}: GamesFilterIslandProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <IslandErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GamesFilter categories={categories} games={games} />
      </QueryClientProvider>
    </IslandErrorBoundary>
  );
}
