import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { IslandErrorBoundary } from "@/components/IslandErrorBoundary.tsx";
import JackpotCounter from "./JackpotCounter.tsx";

interface JackpotIslandProps {
  initialAmount?: number;
}

export default function JackpotIsland({ initialAmount }: JackpotIslandProps) {
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
        <JackpotCounter initialAmount={initialAmount} />
      </QueryClientProvider>
    </IslandErrorBoundary>
  );
}
