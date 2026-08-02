/**
 * Centralized configuration for the Charter & Oak mobile app.
 *
 * Mirrors the web app's `src/lib/config.ts` but uses Expo Constants
 * and environment variables instead of `import.meta.env`.
 */

import Constants from "expo-constants";

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Base URL of the backend API server.
 *
 * Priority order:
 * 1. `EXPO_PUBLIC_API_BASE_URL` env var (set in app.json `expo.extra` or .env)
 * 2. Expo Constants `expoConfig.extra.apiBaseUrl`
 * 3. `http://localhost:3000` fallback for local development
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl ??
  "http://localhost:3000";

// ---------------------------------------------------------------------------
// App metadata
// ---------------------------------------------------------------------------

export const app = {
  name: "Charter & Oak",
  scheme: "charteroak",
} as const;

// ---------------------------------------------------------------------------
// Features (mirrors web config)
// ---------------------------------------------------------------------------

export const features = {
  favorites: true,
  depositPolling: true,
  showVipBadge: true,
  biometricAuth: false,
} as const;

// ---------------------------------------------------------------------------
// Cashier (mirrors web config)
// ---------------------------------------------------------------------------

export const cashier = {
  presetAmounts: [2500, 5000, 10000, 25000, 50000, 100000] as const, // in cents
  minAmountCents: 500, // $5.00
  maxAmountCents: 1_000_000, // $10,000.00
  pollIntervalMs: 10_000,
} as const;

// ---------------------------------------------------------------------------
// Rate limit (informational — enforced server-side)
// ---------------------------------------------------------------------------

export const rateLimit = {
  apiLimit: 30,
  windowMs: 60_000,
} as const;
