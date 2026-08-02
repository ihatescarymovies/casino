import { z } from "zod";

/**
 * Zod schemas for payment request body validation.
 *
 * These schemas replace manual if/else validation in the payment routes,
 * providing structured error messages and type-safe parsing.
 */

// ── Checkout ──────────────────────────────────────────────

export const checkoutBodySchema = z.object({
  priceId: z.string().min(1, "priceId is required"),
});

// ── Shareable Link ────────────────────────────────────────

export const shareableLinkBodySchema = z.object({
  amountInUSD: z
    .number()
    .finite("amountInUSD must be a finite number")
    .min(10, "amountInUSD must be at least 10")
    .max(10000, "amountInUSD must not exceed 10000"),
});

// ── Withdraw ──────────────────────────────────────────────

const SUPPORTED_CHAINS = ["ETH", "BASE", "TRX", "BTC"] as const;
const SUPPORTED_CURRENCIES = ["USDC", "USDT"] as const;

export const withdrawBodySchema = z.object({
  blockchainCode: z.enum(SUPPORTED_CHAINS, {
    errorMap: () => ({ message: "Unsupported blockchain code" }),
  }),
  currencyCode: z.enum(SUPPORTED_CURRENCIES, {
    errorMap: () => ({ message: "Unsupported currency code" }),
  }),
  amountUsd: z
    .number()
    .finite("amountUsd must be a finite number")
    .min(1000, "amountUsd must be at least 1000 (cents)")
    .max(1000000, "amountUsd must not exceed 1000000 (cents)"),
  toAddress: z
    .string()
    .min(20, "Invalid address length")
    .max(64, "Invalid address length"),
});

// ── Validation helper ─────────────────────────────────────

import type { NextFunction, Request, Response } from "express";

export function validateBody<T>(
  schema: z.ZodSchema<T>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map((i) => ({
          field: i.path.join(".") || "body",
          message: i.message,
        })),
      });
      return;
    }
    // Attach parsed body for downstream handlers
    req.body = result.data;
    next();
  };
}
