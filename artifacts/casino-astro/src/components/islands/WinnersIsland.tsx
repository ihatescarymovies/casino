import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { IslandErrorBoundary } from "@/components/IslandErrorBoundary.tsx";
import WinnersTicker from "./WinnersTicker.tsx";

interface Winner {
  playerName: string;
  gameName: string;
  winAmount: number;
}

interface WinnersIslandProps {
  winners?: Winner[];
}

export default function WinnersIsland({ winners }: WinnersIslandProps) {
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
        <WinnersTicker winners={winners} />
      </QueryClientProvider>
    </IslandErrorBoundary>
  );
}
