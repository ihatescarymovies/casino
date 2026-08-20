/**
 * Canonical payout chain definitions.
 *
 * Single source of truth for both:
 *   - Backend: withdrawal validation in payments.ts
 *   - Frontend: chain selector in Cashier.tsx
 *
 * Keep this file in sync with the Payram-supported chains.
 */

export interface PayoutChain {
  /** Chain code sent to Payram API (e.g. "ETH") */
  code: string;
  /** Human-readable label for UI display */
  label: string;
  /** Supported stablecoin currencies on this chain */
  currencies: string[];
}

/** Ordered list of supported payout chains. */
export const PAYOUT_CHAINS: PayoutChain[] = [
  { code: "ETH", label: "Ethereum", currencies: ["USDC", "USDT"] },
  { code: "BASE", label: "Base", currencies: ["USDC"] },
  { code: "TRX", label: "Tron", currencies: ["USDT"] },
  { code: "BTC", label: "Bitcoin", currencies: ["USDC", "USDT"] },
];

/**
 * Map from chain code → supported currencies.
 * Use this for server-side validation (O(1) lookup).
 */
export const SUPPORTED_PAYOUT_CHAINS: Record<string, string[]> =
  Object.fromEntries(PAYOUT_CHAINS.map((c) => [c.code, c.currencies]));
