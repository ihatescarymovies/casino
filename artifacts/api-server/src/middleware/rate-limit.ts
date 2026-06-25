/**
 * Rate limiting middleware with sliding window algorithm.
 *
 * Provides per-user per-game and per-user global rate limits
 * with standard X-RateLimit-* headers.
 */

import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";

/* ── Types ────────────────────────────────────────────────────────────── */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/* ── In-memory store (per-process; use Redis in production) ─────────── */

const store = new Map<string, RateLimitEntry>();

const GLOBAL_LIMIT: RateLimitConfig = { maxRequests: 100, windowMs: 60_000 };
const PER_GAME_LIMIT: RateLimitConfig = { maxRequests: 10, windowMs: 60_000 };

const MAX_BET_AMOUNT = 1_000_000;
const MIN_BET_AMOUNT = 1;
const MAX_CLIENT_SEED_LENGTH = 256;
const GAME_TYPE_PATTERN = /^[a-zA-Z0-9_-]+$/;

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeKey(userId: string, gameType?: string): string {
  return gameType ? `rate:${userId}:game:${gameType}` : `rate:${userId}:global`;
}

function pruneEntry(
  entry: RateLimitEntry,
  windowMs: number,
  now: number,
): void {
  const cutoff = now - windowMs;
  let i = 0;
  while (i < entry.timestamps.length && entry.timestamps[i] <= cutoff) {
    i++;
  }
  if (i > 0) {
    entry.timestamps.splice(0, i);
  }
}

function checkLimit(
  key: string,
  config: RateLimitConfig,
  now: number,
): {
  entry: RateLimitEntry;
  allowed: boolean;
  remaining: number;
  resetTime: number;
} {
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  pruneEntry(entry, config.windowMs, now);

  const allowed = entry.timestamps.length < config.maxRequests;
  const remaining = Math.max(
    0,
    config.maxRequests - entry.timestamps.length - (allowed ? 1 : 0),
  );

  const resetTime =
    entry.timestamps.length > 0
      ? entry.timestamps[0] + config.windowMs
      : now + config.windowMs;

  if (allowed) {
    entry.timestamps.push(now);
  }

  return { entry, allowed, remaining, resetTime };
}

function setRateLimitHeaders(
  res: Response,
  prefix: string,
  limit: number,
  remaining: number,
  resetTime: number,
): void {
  res.setHeader(`X-RateLimit-${prefix}-Limit`, limit.toString());
  res.setHeader(`X-RateLimit-${prefix}-Remaining`, remaining.toString());
  res.setHeader(
    `X-RateLimit-${prefix}-Reset`,
    Math.ceil(resetTime / 1000).toString(),
  );
}

/* ── Input Validation Hardening ───────────────────────────────────────── */

export function validateBetAmount(amount: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return { valid: false, error: "Bet amount must be a number" };
  }
  if (!Number.isFinite(amount)) {
    return { valid: false, error: "Bet amount must be finite" };
  }
  if (amount < MIN_BET_AMOUNT) {
    return {
      valid: false,
      error: `Bet amount must be at least ${MIN_BET_AMOUNT} cent`,
    };
  }
  if (amount > MAX_BET_AMOUNT) {
    return {
      valid: false,
      error: `Bet amount cannot exceed ${MAX_BET_AMOUNT} cents`,
    };
  }
  if (!Number.isInteger(amount)) {
    return { valid: false, error: "Bet amount must be a whole number" };
  }
  return { valid: true };
}

export function validateClientSeed(seed: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof seed !== "string") {
    return { valid: false, error: "Client seed must be a string" };
  }
  if (seed.length === 0) {
    return { valid: false, error: "Client seed cannot be empty" };
  }
  if (seed.length > MAX_CLIENT_SEED_LENGTH) {
    return {
      valid: false,
      error: `Client seed cannot exceed ${MAX_CLIENT_SEED_LENGTH} characters`,
    };
  }
  if (/[<>"'%;()&+\x00-\x1f\x7f]/.test(seed)) {
    return { valid: false, error: "Client seed contains invalid characters" };
  }
  return { valid: true };
}

export function validateGameType(gameType: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof gameType !== "string") {
    return { valid: false, error: "Game type must be a string" };
  }
  if (gameType.length === 0) {
    return { valid: false, error: "Game type cannot be empty" };
  }
  if (gameType.length > 64) {
    return { valid: false, error: "Game type too long" };
  }
  if (!GAME_TYPE_PATTERN.test(gameType)) {
    return { valid: false, error: "Game type contains invalid characters" };
  }
  return { valid: true };
}

export function validateGameParams(params: unknown): {
  valid: boolean;
  error?: string;
} {
  if (params === undefined || params === null) {
    return { valid: true };
  }
  if (typeof params !== "object") {
    return { valid: false, error: "Game params must be an object" };
  }
  const obj = params as Record<string, unknown>;
  // Reject objects with non-standard prototypes (prototype pollution defense)
  if (Object.getPrototypeOf(obj) !== Object.prototype) {
    return { valid: false, error: "Invalid game params" };
  }
  const keys = Object.keys(obj);
  if (keys.length > 50) {
    return { valid: false, error: "Too many game parameters" };
  }
  for (const key of keys) {
    if (typeof key !== "string" || key.length > 128) {
      return { valid: false, error: "Invalid parameter key" };
    }
    const value = obj[key];
    if (value === undefined) continue;
    const valueType = typeof value;
    if (
      valueType !== "string" &&
      valueType !== "number" &&
      valueType !== "boolean" &&
      valueType !== "object"
    ) {
      return { valid: false, error: `Parameter '${key}' has invalid type` };
    }
    if (valueType === "string" && (value as string).length > 1024) {
      return { valid: false, error: `Parameter '${key}' value too long` };
    }
    // Recursively validate nested objects
    if (valueType === "object" && !Array.isArray(value)) {
      const nestedResult = validateGameParams(value);
      if (!nestedResult.valid) {
        return nestedResult;
      }
    }
    // Validate array elements (allow any JSON-valid values)
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const el = value[i];
        if (el === null || el === undefined) continue;
        const elType = typeof el;
        if (elType === "object" && !Array.isArray(el)) {
          const elResult = validateGameParams(el);
          if (!elResult.valid) return elResult;
        }
      }
    }
  }
  return { valid: true };
}

export function validateBetRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const body = req.body;

  const gameTypeResult = validateGameType(body?.gameType);
  if (!gameTypeResult.valid) {
    logger.warn(
      { path: req.path, error: gameTypeResult.error },
      "Game type validation failed",
    );
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      fields: { gameType: gameTypeResult.error },
    });
    return;
  }

  const betAmountResult = validateBetAmount(body?.betAmount);
  if (!betAmountResult.valid) {
    logger.warn(
      { path: req.path, error: betAmountResult.error },
      "Bet amount validation failed",
    );
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      fields: { betAmount: betAmountResult.error },
    });
    return;
  }

  const clientSeedResult = validateClientSeed(body?.clientSeed);
  if (!clientSeedResult.valid) {
    logger.warn(
      { path: req.path, error: clientSeedResult.error },
      "Client seed validation failed",
    );
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      fields: { clientSeed: clientSeedResult.error },
    });
    return;
  }

  const gameParamsResult = validateGameParams(body?.gameParams);
  if (!gameParamsResult.valid) {
    logger.warn(
      { path: req.path, error: gameParamsResult.error },
      "Game params validation failed",
    );
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      fields: { gameParams: gameParamsResult.error },
    });
    return;
  }

  next();
}

/* ── Constant-Time Hash Comparison ─────────────────────────────────────── */

export function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    const dummy = Buffer.alloc(bufA.length, 0);
    timingSafeEqual(bufA, dummy);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

export function verifyClientSeedHash(
  clientSeed: string,
  expectedHash: string,
): boolean {
  return constantTimeCompare(clientSeed, expectedHash);
}

/* ── Public API ──────────────────────────────────────────────────────── */

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.user?.id;

  if (!userId) {
    next();
    return;
  }

  const now = Date.now();
  const gameType: string | undefined = req.body?.gameType;

  const globalKey = makeKey(userId);
  const globalResult = checkLimit(globalKey, GLOBAL_LIMIT, now);

  setRateLimitHeaders(
    res,
    "Global",
    GLOBAL_LIMIT.maxRequests,
    globalResult.remaining,
    globalResult.resetTime,
  );

  if (!globalResult.allowed) {
    logger.warn({ userId, path: req.path }, "Global rate limit exceeded");
    res.status(429).json({
      error: "Too many requests",
      code: "RATE_LIMIT_GLOBAL",
      retryAfter: Math.ceil((globalResult.resetTime - now) / 1000),
    });
    return;
  }

  if (gameType) {
    const gameKey = makeKey(userId, gameType);
    const gameResult = checkLimit(gameKey, PER_GAME_LIMIT, now);

    setRateLimitHeaders(
      res,
      "Game",
      PER_GAME_LIMIT.maxRequests,
      gameResult.remaining,
      gameResult.resetTime,
    );

    if (!gameResult.allowed) {
      logger.warn(
        { userId, gameType, path: req.path },
        "Per-game rate limit exceeded",
      );
      res.status(429).json({
        error: "Too many requests for this game",
        code: "RATE_LIMIT_GAME",
        retryAfter: Math.ceil((gameResult.resetTime - now) / 1000),
      });
      return;
    }
  } else {
    setRateLimitHeaders(
      res,
      "Game",
      PER_GAME_LIMIT.maxRequests,
      PER_GAME_LIMIT.maxRequests,
      now + PER_GAME_LIMIT.windowMs,
    );
  }

  logger.debug({ userId, gameType, path: req.path }, "Rate limit check passed");
  next();
}
