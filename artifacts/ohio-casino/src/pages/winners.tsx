import { useListWinners, getListWinnersQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils-casino";

export function Winners() {
  const { data: winners, isLoading } = useListWinners({ limit: 50 }, {
    query: { queryKey: getListWinnersQueryKey({ limit: 50 }), refetchInterval: 15000 }
  });

  return (
    <div className="container mx-auto px-4 py-12 flex flex-col gap-12 max-w-5xl">
      <div className="text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">Hall of Winners</h1>
        <p className="text-xl text-muted-foreground">Real players. Real money. Are you next?</p>
      </div>

      <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-6 border-b border-white/10 bg-black/40 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <div className="col-span-5 md:col-span-4">Player</div>
          <div className="col-span-4 hidden md:block">Game</div>
          <div className="col-span-4 md:col-span-2 text-right">Win Amount</div>
          <div className="col-span-3 md:col-span-2 text-right hidden sm:block">Time</div>
        </div>

        <div className="divide-y divide-white/5">
          {isLoading ? (
            Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="grid grid-cols-12 gap-4 p-6 items-center animate-pulse">
                <div className="col-span-5 md:col-span-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5" />
                  <div className="h-5 w-24 bg-white/5 rounded" />
                </div>
                <div className="col-span-4 hidden md:block">
                  <div className="h-5 w-32 bg-white/5 rounded" />
                </div>
                <div className="col-span-4 md:col-span-2 flex justify-end">
                  <div className="h-6 w-20 bg-white/10 rounded" />
                </div>
                <div className="col-span-3 md:col-span-2 flex justify-end hidden sm:flex">
                  <div className="h-5 w-16 bg-white/5 rounded" />
                </div>
              </div>
            ))
          ) : winners && winners.length > 0 ? (
            winners.map((winner) => {
              // Format time like "2 mins ago", "1 hour ago"
              const winTime = new Date(winner.timestamp);
              const now = new Date();
              const diffMs = now.getTime() - winTime.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMins / 60);
              
              let timeStr = "";
              if (diffMins < 1) timeStr = "Just now";
              else if (diffMins < 60) timeStr = `${diffMins}m ago`;
              else if (diffHours < 24) timeStr = `${diffHours}h ago`;
              else timeStr = winTime.toLocaleDateString();

              return (
                <div key={winner.id} className="grid grid-cols-12 gap-4 p-6 items-center hover:bg-white/[0.02] transition-colors">
                  <div className="col-span-7 sm:col-span-5 md:col-span-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold border border-primary/30 flex-shrink-0">
                      {winner.playerName.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-white truncate">{winner.playerName}</span>
                  </div>
                  
                  <div className="col-span-4 hidden md:flex items-center">
                    <span className="text-muted-foreground truncate">{winner.gameName}</span>
                  </div>
                  
                  <div className="col-span-5 sm:col-span-4 md:col-span-2 text-right">
                    <span className="text-xl font-bold text-primary drop-shadow-[0_0_5px_rgba(234,179,8,0.3)]">
                      {formatCurrency(winner.winAmount)}
                    </span>
                  </div>
                  
                  <div className="col-span-3 md:col-span-2 text-right hidden sm:block">
                    <span className="text-sm text-muted-foreground">{timeStr}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-muted-foreground">No recent winners found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
