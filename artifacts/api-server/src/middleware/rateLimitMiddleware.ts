import rateLimit from "express-rate-limit";

/**
 * Rate limits for sensitive payment endpoints.
 *
 * Limits are per-IP, per-window. Authenticated user identity is NOT used
 * as a key so that requests behind a shared NAT (e.g. office) are still
 * individually throttled by IP.
 *
 * Values chosen to be restrictive enough to block brute-force / scripting
 * attacks while allowing legitimate use.
 */
export const checkoutLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checkout attempts. Please try again later." },
  skip: () => process.env.NODE_ENV === "test",
});

export const shareableLinkLimiter = rateLimit({
  windowMs: 60_000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many shareable link requests. Please try again later.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

export const withdrawLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many withdrawal attempts. Please try again later." },
  skip: () => process.env.NODE_ENV === "test",
});

export const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many webhook requests." },
  skip: () => process.env.NODE_ENV === "test",
});

/** General API rate limit for all other routes. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  skip: () => process.env.NODE_ENV === "test",
});
