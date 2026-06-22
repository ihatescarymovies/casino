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

const PROTECTED_PATHS = ["/dashboard", "/cashier"];

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

  return next();
});
