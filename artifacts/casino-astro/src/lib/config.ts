const isProduction =
  typeof import.meta !== "undefined"
    ? ((import.meta as { env?: { PROD?: boolean } }).env?.PROD ?? false)
    : process.env.NODE_ENV === "production";

export const API_BASE_URL =
  (typeof import.meta !== "undefined"
    ? (import.meta as { env?: { API_BASE_URL?: string } }).env?.API_BASE_URL
    : process.env.API_BASE_URL) ?? "http://localhost:3000";

export const rateLimit = {
  pageLimit: 60,
  apiLimit: 30,
  windowMs: 60_000,
  cleanupIntervalMs: 5 * 60_000,
} as const;

export const csrf = {
  cookieName: "csrf-token",
  headerName: "x-csrf-token",
  tokenLength: 32,
  cookieAttributes: isProduction
    ? "Path=/; SameSite=Lax; HttpOnly; Secure"
    : "Path=/; SameSite=Lax; HttpOnly",
} as const;

export const securityHeaders: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "on",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' http://localhost:3000",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

export const features = {
  favorites: true,
  depositPolling: true,
  showVipBadge: true,
} as const;

export const cashier = {
  presetAmounts: [2500, 5000, 10000, 25000, 50000, 100000] as const, // in cents
  minAmountCents: 500, // $5.00
  maxAmountCents: 100_000_00, // $100,000.00
  pollIntervalMs: 10_000,
} as const;

export const app = {
  name: "Charter & Oak",
  isProduction,
} as const;
