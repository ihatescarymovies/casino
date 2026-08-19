import { useEffect, useMemo, useState } from "react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/formatters";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Dice1,
  Trophy,
  Gift,
  Receipt,
} from "lucide-react";

interface Transaction {
  id: string;
  date: string;
  type: "deposit" | "withdrawal" | "bet" | "win" | "bonus";
  amount: number;
  status: "completed" | "pending" | "failed";
  description: string;
}

/**
 * Map the DB transaction type (from /api/wallet/history) to the
 * frontend Transaction type.
 */
function mapDbType(
  dbType: string,
): "deposit" | "withdrawal" | "bet" | "win" | "bonus" {
  switch (dbType) {
    case "bet":
      return "bet";
    case "payout":
      return "win";
    case "deposit":
      return "deposit";
    case "withdrawal":
      return "withdrawal";
    case "bonus":
      return "bonus";
    default:
      return "bet";
  }
}

const FILTER_OPTIONS: { label: string; value: Transaction["type"] | "all" }[] =
  [
    { label: "All", value: "all" },
    { label: "Deposits", value: "deposit" },
    { label: "Withdrawals", value: "withdrawal" },
    { label: "Bets", value: "bet" },
    { label: "Wins", value: "win" },
    { label: "Bonuses", value: "bonus" },
  ];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const TYPE_CONFIG: Record<
  Transaction["type"],
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    sign: "+" | "-" | "";
  }
> = {
  deposit: {
    label: "Deposit",
    icon: ArrowDownLeft,
    color: "text-green-400",
    bg: "bg-green-500/10",
    sign: "+",
  },
  withdrawal: {
    label: "Withdrawal",
    icon: ArrowUpRight,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    sign: "-",
  },
  bet: {
    label: "Bet",
    icon: Dice1,
    color: "text-muted-foreground",
    bg: "bg-white/5",
    sign: "-",
  },
  win: {
    label: "Win",
    icon: Trophy,
    color: "text-primary",
    bg: "bg-primary/10",
    sign: "+",
  },
  bonus: {
    label: "Bonus",
    icon: Gift,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    sign: "+",
  },
};

const STATUS_CONFIG: Record<
  Transaction["status"],
  {
    label: string;
    variant:
      | "default"
      | "secondary"
      | "destructive"
      | "outline"
      | "ghost"
      | "link";
  }
> = {
  completed: { label: "Completed", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

export default function Transactions() {
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();
  const [filter, setFilter] = useState<Transaction["type"] | "all">("all");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/wallet/history?limit=100&offset=0", {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      })
      .then((rows) => {
        const mapped: Transaction[] = rows.map((row: Record<string, any>) => ({
          id: String(row.id),
          date: row.created_at ?? new Date().toISOString(),
          type: mapDbType(row.type ?? "bet"),
          amount: Math.abs(Number(row.amount) || 0),
          status: (row.status as Transaction["status"]) ?? "completed",
          description: row.description ?? "",
        }));
        setTransactions(mapped);
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const filteredTransactions = useMemo(() => {
    const sorted = [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    if (filter === "all") return sorted;
    return sorted.filter((t) => t.type === filter);
  }, [filter, transactions]);

  const runningBalances = useMemo(() => {
    let balance = 0;
    const balances: number[] = [];
    for (let i = filteredTransactions.length - 1; i >= 0; i--) {
      const t = filteredTransactions[i];
      if (t.status === "completed") {
        if (t.type === "deposit" || t.type === "win" || t.type === "bonus") {
          balance += t.amount;
        } else if (t.type === "withdrawal" || t.type === "bet") {
          balance -= t.amount;
        }
      }
      balances.unshift(balance);
    }
    return balances;
  }, [filteredTransactions]);

  if (authLoading || (!isAuthenticated && !authLoading)) return null;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex items-center gap-3 mb-2">
          <Receipt className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold text-white">Transaction History</h1>
        </div>
        <div className="bg-card/50 border border-white/5 rounded-2xl backdrop-blur-xl p-10 text-center">
          <p className="text-muted-foreground">Loading transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Receipt className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold text-white">Transaction History</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        View your deposits, withdrawals, bets, wins, and bonuses.
      </p>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {FILTER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(option.value)}
            className={
              filter === option.value
                ? ""
                : "border-white/10 text-muted-foreground hover:text-white hover:border-white/20"
            }
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="bg-card/50 border border-white/5 rounded-2xl backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Date
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Description
                  </th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Amount
                  </th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Status
                  </th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTransactions.map((transaction, index) => {
                  const config = TYPE_CONFIG[transaction.type];
                  const Icon = config.icon;
                  const statusConfig = STATUS_CONFIG[transaction.status];
                  const balance = runningBalances[index] ?? 0;

                  return (
                    <tr
                      key={transaction.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="text-sm text-white">
                          {formatDate(transaction.date)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(transaction.date)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded-lg ${config.bg} flex-shrink-0`}
                          >
                            <Icon className={`h-4 w-4 ${config.color}`} />
                          </div>
                          <span className="text-sm text-white">
                            {config.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-muted-foreground">
                          {transaction.description}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className={`text-sm font-medium ${config.color}`}>
                          {config.sign}
                          {formatCents(transaction.amount)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Badge variant={statusConfig.variant}>
                          {statusConfig.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm font-medium text-white">
                          {formatCents(balance)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filteredTransactions.map((transaction, index) => {
          const config = TYPE_CONFIG[transaction.type];
          const Icon = config.icon;
          const statusConfig = STATUS_CONFIG[transaction.status];
          const balance = runningBalances[index] ?? 0;

          return (
            <div
              key={transaction.id}
              className="bg-card/50 border border-white/5 rounded-2xl backdrop-blur-xl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <span className="text-sm font-medium text-white">
                    {config.label}
                  </span>
                </div>
                <Badge variant={statusConfig.variant}>
                  {statusConfig.label}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">
                    Description
                  </span>
                  <span className="text-sm text-muted-foreground text-right">
                    {transaction.description}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-sm text-white">
                    {formatDate(transaction.date)}{" "}
                    {formatTime(transaction.date)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <span className={`text-sm font-medium ${config.color}`}>
                    {config.sign}
                    {formatCents(transaction.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Balance</span>
                  <span className="text-sm font-medium text-white">
                    {formatCents(balance)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredTransactions.length === 0 && (
        <div className="bg-card border border-white/5 rounded-2xl px-6 py-10 text-center">
          <Receipt className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-white font-medium mb-1">No transactions found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filter to see more results.
          </p>
        </div>
      )}
    </div>
  );
}
