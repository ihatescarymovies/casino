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

const PROTECTED_PATHS = ["/dashboard", "/cashier", "/profile"];

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

export const onRequest = defineMiddleware(async (context, next) => {
  const user = await getAuthUser(context.request);
  context.locals.user = user;

  const pathname = new URL(context.request.url).pathname;
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
