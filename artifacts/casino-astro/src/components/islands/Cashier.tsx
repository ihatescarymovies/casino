import { useAuth } from "@workspace/replit-auth-web";
import { useEffect, useState } from "react";
import {
  CreditCard,
  Lock,
  Wallet,
  Bitcoin,
  Building2,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";

type DepositMethod = "card" | "crypto" | "bank";
type Step = "method" | "amount" | "confirm";
type Tab = "deposit" | "withdraw";

const METHODS: {
  id: DepositMethod;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    id: "card",
    label: "Credit / Debit Card",
    description: "Visa, Mastercard, Discover — instant deposit",
    icon: CreditCard,
    color: "from-blue-500/20 to-blue-600/5 border-blue-500/30",
  },
  {
    id: "crypto",
    label: "Cryptocurrency",
    description: "BTC, ETH, USDT — processed in minutes",
    icon: Bitcoin,
    color: "from-amber-500/20 to-amber-600/5 border-amber-500/30",
  },
  {
    id: "bank",
    label: "Bank Transfer",
    description: "ACH / Wire — 1–3 business days",
    icon: Building2,
    color: "from-green-500/20 to-green-600/5 border-green-500/30",
  },
];

const PRESET_AMOUNTS = [1000, 2500, 10000, 25000, 50000, 100000];

const PACKAGE_FOR_CENTS: Record<number, string> = {
  1000: "min-deposit",
  2500: "starter",
  10000: "pro",
  25000: "elite",
  50000: "vip",
  100000: "vip",
};

const PAYOUT_CHAINS: { code: string; label: string; currencies: string[] }[] = [
  { code: "ETH", label: "Ethereum", currencies: ["USDC", "USDT"] },
  { code: "BASE", label: "Base", currencies: ["USDC"] },
  { code: "TRX", label: "Tron", currencies: ["USDT"] },
  { code: "BTC", label: "Bitcoin", currencies: ["USDC", "USDT"] },
];

function formatUSD(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

export default function Cashier() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();

  const [tab, setTab] = useState<Tab>("deposit");
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<DepositMethod | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [withdrawChain, setWithdrawChain] = useState("ETH");
  const [withdrawCurrency, setWithdrawCurrency] = useState("USDC");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const selectedAmount =
    amount ??
    (customAmount ? Math.round(parseFloat(customAmount) * 100) : null);

  function selectMethod(id: DepositMethod) {
    setMethod(id);
    setAmount(null);
    setCustomAmount("");
    setError(null);
    setStep("amount");
  }

  function selectPreset(cents: number) {
    setAmount(cents);
    setCustomAmount("");
  }

  function handleCustomChange(value: string) {
    setCustomAmount(value);
    setAmount(null);
  }

  function goBack() {
    setError(null);
    if (step === "confirm") setStep("amount");
    else if (step === "amount") setStep("method");
  }

  function switchTab(newTab: Tab) {
    setTab(newTab);
    setStep("method");
    setMethod(null);
    setAmount(null);
    setCustomAmount("");
    setError(null);
    setSuccess(false);
    setWithdrawAddress("");
    setWithdrawAmount("");
  }

  async function handleDeposit() {
    if (!selectedAmount || selectedAmount < 1000) {
      setError("Minimum deposit is $10.00");
      return;
    }
    if (selectedAmount > 1000000) {
      setError("Maximum single deposit is $10,000.00");
      return;
    }

    const priceId = PACKAGE_FOR_CENTS[selectedAmount];
    if (!priceId) {
      setError("Please choose one of the listed deposit amounts.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const csrfToken = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("csrf-token="))
        ?.split("=")[1];

      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleWithdraw() {
    const cents = Math.round(parseFloat(withdrawAmount) * 100);
    if (!withdrawAddress.trim()) {
      setError("Enter a destination wallet address");
      return;
    }
    if (!Number.isFinite(cents) || cents < 1000) {
      setError("Minimum withdrawal is $10.00");
      return;
    }
    if (cents > 1_000_000) {
      setError("Maximum single withdrawal is $10,000.00");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const csrfToken = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("csrf-token="))
        ?.split("=")[1];

      const res = await fetch("/api/payments/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          blockchainCode: withdrawChain,
          currencyCode: withdrawCurrency,
          amountUsd: cents,
          toAddress: withdrawAddress.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Withdrawal failed");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  if (authLoading || (!isAuthenticated && !authLoading)) return null;

  if (success) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center py-20">
          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
            <Check className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {tab === "deposit" ? "Deposit Submitted" : "Withdrawal Submitted"}
          </h2>
          <p className="text-muted-foreground mb-8">
            {tab === "deposit" ? (
              <>
                Your deposit of {formatUSD(selectedAmount ?? 0)} is being
                processed. Funds will appear in your account shortly.
              </>
            ) : (
              <>
                Your withdrawal of{" "}
                {formatUSD(Math.round(parseFloat(withdrawAmount) * 100) || 0)}{" "}
                via {withdrawChain}/{withdrawCurrency} is being processed.
                You'll receive your crypto at the address provided.
              </>
            )}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSuccess(false);
              setStep("method");
              setMethod(null);
              setAmount(null);
              setCustomAmount("");
              setWithdrawAddress("");
              setWithdrawAmount("");
            }}
          >
            {tab === "deposit"
              ? "Make Another Deposit"
              : "Make Another Withdrawal"}
          </button>
        </div>
      </div>
    );
  }

  const chainConfig = PAYOUT_CHAINS.find((c) => c.code === withdrawChain);

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <Wallet className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold text-white">Cashier</h1>
        </div>
        <p className="text-muted-foreground">
          {tab === "deposit"
            ? "Add funds to your Charter & Oak account and start playing instantly."
            : "Withdraw your winnings to your crypto wallet via PayRam."}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-8 bg-card border border-white/5 rounded-lg px-4 py-3">
        <Lock className="h-4 w-4 text-primary flex-shrink-0" />
        <span>
          All transactions are encrypted and processed securely via PayRam.
          Charter & Oak never stores your payment details.
        </span>
      </div>

      <div className="flex gap-2 mb-8">
        <button
          type="button"
          onClick={() => switchTab("deposit")}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors ${
            tab === "deposit"
              ? "bg-primary text-primary-foreground"
              : "bg-card/50 text-muted-foreground border border-white/10 hover:text-white"
          }`}
        >
          <ArrowDownToLine className="h-5 w-5" />
          Deposit
        </button>
        <button
          type="button"
          onClick={() => switchTab("withdraw")}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors ${
            tab === "withdraw"
              ? "bg-primary text-primary-foreground"
              : "bg-card/50 text-muted-foreground border border-white/10 hover:text-white"
          }`}
        >
          <ArrowUpFromLine className="h-5 w-5" />
          Withdraw
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {tab === "deposit" && (
        <>
          <div className="flex items-center gap-2 mb-8 text-sm">
            {(["method", "amount", "confirm"] as Step[]).map((s, i) => {
              const labels = ["Method", "Amount", "Confirm"];
              const isActive = step === s;
              const isPast =
                (s === "method" && step !== "method") ||
                (s === "amount" && step === "confirm");
              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : isPast
                          ? "bg-primary/20 text-primary border-primary/40"
                          : "bg-card text-muted-foreground border-white/10"
                    }`}
                  >
                    {isPast ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <span
                    className={
                      isActive
                        ? "text-white font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {labels[i]}
                  </span>
                  {i < 2 && <div className="w-8 h-px bg-white/10 mx-1" />}
                </div>
              );
            })}
          </div>

          {step === "method" && (
            <div>
              <h2 className="text-xl font-bold text-white mb-4">
                Choose Deposit Method
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {METHODS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`bg-gradient-to-br ${m.color} border rounded-2xl p-6 text-left hover:scale-[1.02] focus-within:scale-[1.02] transition-transform group`}
                      onClick={() => selectMethod(m.id)}
                      aria-label={`Deposit via ${m.label}`}
                    >
                      <div className="p-2.5 rounded-xl bg-white/5 inline-block mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-1">
                        {m.label}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {m.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "amount" && (
            <div>
              <h2 className="text-xl font-bold text-white mb-4">
                Select Amount
              </h2>

              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                {PRESET_AMOUNTS.map((cents) => {
                  const selected = amount === cents;
                  return (
                    <button
                      key={cents}
                      type="button"
                      className={`py-3 px-4 rounded-xl border text-center font-bold transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary shadow-[0_0_12px_rgba(234,179,8,0.3)]"
                          : "bg-card/50 text-white border-white/10 hover:border-primary/50"
                      }`}
                      onClick={() => selectPreset(cents)}
                    >
                      {formatUSD(cents)}
                    </button>
                  );
                })}
              </div>

              <div className="mb-8">
                <label
                  htmlFor="custom-amount"
                  className="block text-sm text-muted-foreground mb-2"
                >
                  Or enter a custom amount (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                    $
                  </span>
                  <input
                    id="custom-amount"
                    type="number"
                    min="10"
                    max="10000"
                    step="1"
                    placeholder="0.00"
                    value={customAmount}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-card/50 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors"
                  onClick={goBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary flex items-center gap-2"
                  disabled={!selectedAmount || selectedAmount < 1000}
                  onClick={() => {
                    if (selectedAmount && selectedAmount >= 1000) {
                      setError(null);
                      setStep("confirm");
                    }
                  }}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">
                Confirm Deposit
              </h2>

              <div className="bg-card/50 border border-white/5 rounded-2xl p-6 backdrop-blur-xl mb-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Method</span>
                    <span className="text-white font-medium">
                      {METHODS.find((m) => m.id === method)?.label ?? "—"}
                    </span>
                  </div>
                  <div className="h-px bg-white/5" />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-2xl font-black text-primary drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]">
                      {formatUSD(selectedAmount ?? 0)}
                    </span>
                  </div>
                  <div className="h-px bg-white/5" />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Processing</span>
                    <span className="text-green-400 text-sm font-medium">
                      Instant
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors"
                  onClick={goBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary flex items-center gap-2 shadow-[0_0_12px_rgba(234,179,8,0.3)] font-bold min-w-[160px] justify-center"
                  disabled={processing}
                  onClick={handleDeposit}
                  aria-busy={processing}
                >
                  {processing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Confirm Deposit
                      <Check className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "withdraw" && (
        <div>
          <h2 className="text-xl font-bold text-white mb-6">
            Withdraw to Crypto Wallet
          </h2>

          <div className="bg-card/50 border border-white/5 rounded-2xl p-6 backdrop-blur-xl mb-8 space-y-6">
            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                Blockchain
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {PAYOUT_CHAINS.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    className={`py-3 px-4 rounded-xl border font-bold transition-colors ${
                      withdrawChain === c.code
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card/50 text-white border-white/10 hover:border-primary/50"
                    }`}
                    onClick={() => {
                      setWithdrawChain(c.code);
                      setWithdrawCurrency(c.currencies[0]);
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                Currency
              </label>
              <div className="grid grid-cols-2 gap-3">
                {chainConfig?.currencies.map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    className={`py-3 px-4 rounded-xl border font-bold transition-colors ${
                      withdrawCurrency === cur
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card/50 text-white border-white/10 hover:border-primary/50"
                    }`}
                    onClick={() => setWithdrawCurrency(cur)}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="withdraw-address"
                className="block text-sm text-muted-foreground mb-2"
              >
                Destination Wallet Address
              </label>
              <input
                id="withdraw-address"
                type="text"
                placeholder="0x... or your wallet address"
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="withdraw-amount"
                className="block text-sm text-muted-foreground mb-2"
              >
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                  $
                </span>
                <input
                  id="withdraw-amount"
                  type="number"
                  min="10"
                  max="10000"
                  step="1"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 bg-card/50 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Min $10 · Max $10,000 · {withdrawCurrency} sent 1:1 with USD
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Funds are sent on-chain — verify your address carefully.
            </p>
            <button
              type="button"
              className="btn btn-primary flex items-center gap-2 shadow-[0_0_12px_rgba(234,179,8,0.3)] font-bold min-w-[160px] justify-center"
              disabled={
                processing || !withdrawAddress.trim() || !withdrawAmount
              }
              onClick={handleWithdraw}
              aria-busy={processing}
            >
              {processing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Confirm Withdrawal
                  <Check className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center mt-10">
        Must be 21+. Gambling problem? Call{" "}
        <span className="text-white font-bold">1-800-589-9966</span>.
      </p>
    </div>
  );
}
