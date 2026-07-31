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
    <div className="font-mono text-5xl md:text-7xl lg:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-primary via-yellow-300 to-yellow-600 drop-shadow-[0_0_25px_rgba(234,179,8,0.5)] tracking-tighter animate-pulse-glow">
      {formatCurrency(amount)}
    </div>
  );
}
