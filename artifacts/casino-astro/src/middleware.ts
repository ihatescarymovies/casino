import { defineMiddleware } from "astro:middleware";

const API_BASE_URL = "http://localhost:3000";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthUserEnvelope {
  user: AuthUser | null;
}

const PROTECTED_PATHS = ["/dashboard", "/cashier", "/profile", "/transactions"];

async function getAuthUser(request: Request): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        accept: "application/json",
      },
    });

    if (!response.ok) return null;

    const data: AuthUserEnvelope = await response.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}

// --- Rate limiting (sliding window, per-IP, in-memory) ---

interface RateBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateBucket>();

const PAGE_LIMIT = 60; // requests per minute for page routes
const API_LIMIT = 30; // requests per minute for /api/ routes
const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

function isRateLimited(ip: string, pathname: string): boolean {
  const isApi = pathname.startsWith("/api/");
  const limit = isApi ? API_LIMIT : PAGE_LIMIT;
  const now = Date.now();
  const key = `${ip}:${isApi ? "api" : "page"}`;

  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    rateLimitStore.forEach((bucket, k) => {
      bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);
      if (bucket.timestamps.length === 0) rateLimitStore.delete(k);
    });
    lastCleanup = now;
  }

  let bucket = rateLimitStore.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitStore.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);

  if (bucket.timestamps.length >= limit) return true;

  bucket.timestamps.push(now);
  return false;
}

// --- Security headers ---

const SECURITY_HEADERS: Record<string, string> = {
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

// --- Middleware ---

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;

  const isHealthCheck = pathname === "/api/health";
  const isStaticAsset =
    pathname.startsWith("/_astro/") || pathname.startsWith("/favicon");

  if (!isHealthCheck && !isStaticAsset) {
    const ip = getClientIp(context.request);
    if (isRateLimited(ip, pathname)) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Content-Type": "text/plain",
          ...SECURITY_HEADERS,
        },
      });
    }
  }

  const user = await getAuthUser(context.request);
  context.locals.user = user;

  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isProtected && !user) {
    return context.redirect(
      `/api/login?returnTo=${encodeURIComponent(pathname)}`,
    );
  }

  const response = await next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
});
