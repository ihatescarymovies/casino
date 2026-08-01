import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { IslandErrorBoundary } from "@/components/IslandErrorBoundary.tsx";
import Dashboard from "./Dashboard.tsx";

export default function DashboardIsland() {
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
        <Dashboard />
      </QueryClientProvider>
    </IslandErrorBoundary>
  );
}
