import type { Request, Response, NextFunction } from "express";

/**
 * Security headers middleware for the API server.
 *
 * The Astro frontend already sets these headers for page routes via config.ts,
 * but the API server is directly accessible on :3000 and needs its own headers
 * for defense-in-depth when requests bypass the Astro proxy.
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0"); // Modern browsers: disable legacy XSS auditor in favor of CSP
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  // No CSP for API server — it returns JSON, not HTML.
  // Cache-Control for API responses (prevent storing sensitive data)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
}
