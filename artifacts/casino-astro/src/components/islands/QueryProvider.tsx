import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        // Don't retry on SSR — the API may not be available
        retry: typeof window === "undefined" ? 0 : 3,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

function getQueryClient() {
  // SSR: always create a fresh client (isolated per request)
  if (typeof window === "undefined") return makeQueryClient();
  // Browser: reuse the same client across the app lifetime
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}

interface QueryProviderProps {
  children: ReactNode;
}

export default function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
