import { useAuth } from "@workspace/replit-auth-web";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "txn-001",
    date: "2026-06-22T14:30:00Z",
    type: "deposit",
    amount: 50000,
    status: "completed",
    description: "Credit Card Deposit",
  },
  {
    id: "txn-002",
    date: "2026-06-21T18:45:00Z",
    type: "bet",
    amount: 2500,
    status: "completed",
    description: "Slots — Mega Fortune",
  },
  {
    id: "txn-003",
    date: "2026-06-21T19:02:00Z",
    type: "win",
    amount: 12500,
    status: "completed",
    description: "Slots — Mega Fortune",
  },
  {
    id: "txn-004",
    date: "2026-06-20T10:15:00Z",
    type: "withdrawal",
    amount: 20000,
    status: "pending",
    description: "Bank Transfer",
  },
  {
    id: "txn-005",
    date: "2026-06-19T22:30:00Z",
    type: "bet",
    amount: 5000,
    status: "completed",
    description: "Blackjack — Table 7",
  },
  {
    id: "txn-006",
    date: "2026-06-19T22:45:00Z",
    type: "win",
    amount: 7500,
    status: "completed",
    description: "Blackjack — Table 7",
  },
  {
    id: "txn-007",
    date: "2026-06-18T09:00:00Z",
    type: "bonus",
    amount: 10000,
    status: "completed",
    description: "Welcome Bonus",
  },
  {
    id: "txn-008",
    date: "2026-06-17T16:20:00Z",
    type: "deposit",
    amount: 25000,
    status: "completed",
    description: "Crypto Deposit (BTC)",
  },
  {
    id: "txn-009",
    date: "2026-06-16T20:00:00Z",
    type: "bet",
    amount: 10000,
    status: "failed",
    description: "Roulette — European",
  },
  {
    id: "txn-010",
    date: "2026-06-15T11:30:00Z",
    type: "win",
    amount: 50000,
    status: "completed",
    description: "Progressive Jackpot — Divine Fortune",
  },
  {
    id: "txn-011",
    date: "2026-06-14T14:00:00Z",
    type: "withdrawal",
    amount: 15000,
    status: "completed",
    description: "PayPal",
  },
  {
    id: "txn-012",
    date: "2026-06-13T21:15:00Z",
    type: "bet",
    amount: 3000,
    status: "completed",
    description: "Poker — Texas Hold'em",
  },
  {
    id: "txn-013",
    date: "2026-06-12T08:45:00Z",
    type: "bonus",
    amount: 5000,
    status: "completed",
    description: "Weekly Reload Bonus",
  },
  {
    id: "txn-014",
    date: "2026-06-11T17:30:00Z",
    type: "deposit",
    amount: 100000,
    status: "completed",
    description: "Bank Wire",
  },
  {
    id: "txn-015",
    date: "2026-06-10T13:00:00Z",
    type: "win",
    amount: 2200,
    status: "completed",
    description: "Baccarat — VIP Room",
  },
];

const FILTER_OPTIONS: { label: string; value: Transaction["type"] | "all" }[] =
  [
    { label: "All", value: "all" },
    { label: "Deposits", value: "deposit" },
    { label: "Withdrawals", value: "withdrawal" },
    { label: "Bets", value: "bet" },
    { label: "Wins", value: "win" },
    { label: "Bonuses", value: "bonus" },
  ];

function formatUSD(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const [filter, setFilter] = useState<Transaction["type"] | "all">("all");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const filteredTransactions = useMemo(() => {
    const sorted = [...MOCK_TRANSACTIONS].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    if (filter === "all") return sorted;
    return sorted.filter((t) => t.type === filter);
  }, [filter]);

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
                          {formatUSD(transaction.amount)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Badge variant={statusConfig.variant}>
                          {statusConfig.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm font-medium text-white">
                          {formatUSD(balance)}
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
                    {formatUSD(transaction.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Balance</span>
                  <span className="text-sm font-medium text-white">
                    {formatUSD(balance)}
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
