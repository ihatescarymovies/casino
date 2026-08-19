import type { Request, Response } from "express";
import type { AuthUser } from "@workspace/api-zod";

/**
 * Shared auth guard for route handlers.
 *
 * Returns the authenticated user object, or sends a 401 and returns null.
 * Import this instead of re-declaring requireAuth in each route file.
 *
 * @param extraBody - Optional extra fields merged into the 401 response
 *                    (e.g. `{ demo: true }` for demo-wallet routes).
 */
export function requireAuth(
  req: Request,
  res: Response,
  extraBody?: Record<string, unknown>,
): AuthUser | null {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Unauthorized", ...extraBody });
    return null;
  }
  return req.user;
}
