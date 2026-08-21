import {
  useListWinners,
  getListWinnersQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/formatters";

interface Winner {
  playerName: string;
  gameName: string;
  winAmount: number;
}

interface WinnersTickerProps {
  winners?: Winner[];
}

export default function WinnersTicker({ winners }: WinnersTickerProps) {
  const { data: fetchedWinners } = useListWinners(
    { limit: 10 },
    {
      query: {
        queryKey: getListWinnersQueryKey({ limit: 10 }),
        refetchInterval: 15000,
      },
    },
  );

  const displayWinners = fetchedWinners ?? winners ?? [];

  if (displayWinners.length === 0) {
    return (
      <div className="flex whitespace-nowrap items-center h-full gap-8 px-4 text-muted-foreground">
        No recent wins
      </div>
    );
  }

  // Duplicate items for seamless loop
  const items = [...displayWinners, ...displayWinners];

  return (
    <div className="flex whitespace-nowrap items-center h-full gap-8 px-4 animate-marquee">
      {items.map((winner, i) => (
        <div
          key={`${winner.playerName}-${i}`}
          className="flex items-center gap-2"
        >
          <span className="text-foreground font-medium">{winner.playerName}</span>
          <span className="text-muted-foreground text-sm">won</span>
          <span className="text-primary font-bold">
            {formatCurrency(winner.winAmount)}
          </span>
          <span className="text-muted-foreground text-sm">on</span>
          <span className="text-foreground font-medium">{winner.gameName}</span>
        </div>
      ))}
    </div>
  );
}
