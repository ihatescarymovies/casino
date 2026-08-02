/**
 * Root provider stack for the mobile app.
 *
 * Wraps the entire app in:
 * 1. React Query QueryClientProvider (for generated hooks)
 * 2. The API initialization (base URL + auth token wiring)
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";

import { initApi } from "@/lib/api-init";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 3,
        refetchOnWindowFocus: false,
      },
    },
  });
}

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const queryClientRef = useRef<QueryClient | null>(null);
  if (queryClientRef.current === null) {
    queryClientRef.current = makeQueryClient();
  }

  // Wire API client base URL + auth token getter on mount
  useEffect(() => {
    initApi();
  }, []);

  return (
    <QueryClientProvider client={queryClientRef.current}>
      {children}
    </QueryClientProvider>
  );
}
