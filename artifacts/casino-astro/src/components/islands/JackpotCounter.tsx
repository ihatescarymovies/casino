import {
  useGetCasinoStats,
  getGetCasinoStatsQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/formatters";

interface JackpotCounterProps {
  initialAmount?: number;
}

export default function JackpotCounter({ initialAmount }: JackpotCounterProps) {
  const { data: stats, isError } = useGetCasinoStats({
    query: {
      queryKey: getGetCasinoStatsQueryKey(),
      refetchInterval: 30000,
      // Only attempt the query on the client; skip during SSR
      enabled: typeof window !== "undefined",
    },
  });

  const amount =
    !isError && stats?.currentJackpot != null
      ? stats.currentJackpot
      : (initialAmount ?? 0);

  return (
    <div className="data-display animate-amber-pulse text-5xl md:text-7xl lg:text-8xl tracking-tighter">
      {formatCurrency(amount)}
    </div>
  );
}
