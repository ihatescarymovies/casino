import { useAuth } from "@workspace/replit-auth-web";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Shield, CreditCard, Trophy, Lock } from "lucide-react";

interface DepositPackage {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: { id: string; unitAmount: number; currency: string }[];
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatAmount(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

const PACKAGE_ICONS: Record<string, React.ElementType> = {
  starter: Zap,
  pro: Trophy,
  elite: Shield,
  vip: CreditCard,
};

const PACKAGE_COLORS: Record<string, string> = {
  starter: "from-blue-500/20 to-blue-600/5 border-blue-500/30",
  pro: "from-primary/20 to-primary/5 border-primary/30",
  elite: "from-purple-500/20 to-purple-600/5 border-purple-500/30",
  vip: "from-red-500/20 to-red-600/5 border-red-500/30",
};

export function Cashier() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const [, navigate] = useLocation();
  const [packages, setPackages] = useState<DepositPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      login();
    }
  }, [authLoading, isAuthenticated, login]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`${BASE_URL}/api/payments/deposit-packages`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setPackages(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load deposit packages. Please try again.");
        setLoading(false);
      });
  }, [isAuthenticated]);

  const handleDeposit = async (priceId: string) => {
    setCheckingOut(priceId);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to start checkout.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCheckingOut(null);
    }
  };

  if (authLoading || (!isAuthenticated && !authLoading)) return null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <div className="flex items-center gap-3 mb-2">
          <CreditCard className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold text-white">Cashier</h1>
        </div>
        <p className="text-muted-foreground">
          Add funds to your Charter &amp; Oak account and start playing instantly.
        </p>
      </motion.div>

      {/* Security badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-8 bg-card border border-white/5 rounded-lg px-4 py-3">
        <Lock className="h-4 w-4 text-primary flex-shrink-0" />
        <span>All transactions are encrypted and processed securely via PayRam. Charter &amp; Oak never stores your payment details.</span>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium text-white mb-2">Deposit packages coming soon</p>
          <p className="text-sm">Check back shortly — we're loading up the vault.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {packages.map((pkg, i) => {
            const tier = pkg.metadata?.tier ?? Object.keys(PACKAGE_ICONS)[i % 4];
            const Icon = PACKAGE_ICONS[tier] ?? Zap;
            const colorClass = PACKAGE_COLORS[tier] ?? PACKAGE_COLORS.starter;
            const price = pkg.prices[0];
            const isPopular = tier === "pro";

            return (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className={`relative bg-gradient-to-br ${colorClass} border rounded-2xl p-6 flex flex-col gap-4 hover:scale-[1.02] transition-transform`}
              >
                {isPopular && (
                  <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground text-xs font-bold px-2">
                    Most Popular
                  </Badge>
                )}
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-white/5">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
                    {pkg.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{pkg.description}</p>
                    )}
                  </div>
                </div>

                {price ? (
                  <>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black text-primary drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]">
                        {formatAmount(price.unitAmount)}
                      </span>
                      <span className="text-muted-foreground text-sm mb-1">one-time</span>
                    </div>
                    <Button
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_12px_rgba(234,179,8,0.3)] font-bold"
                      onClick={() => handleDeposit(price.id)}
                      disabled={!!checkingOut}
                    >
                      {checkingOut === price.id ? "Redirecting..." : `Deposit ${formatAmount(price.unitAmount)}`}
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">Pricing not available.</p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center mt-8">
        Must be 21+. Gambling problem? Call <span className="text-white font-bold">1-800-589-9966</span>.
      </p>
    </div>
  );
}
