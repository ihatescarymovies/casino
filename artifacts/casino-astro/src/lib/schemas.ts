/**
 * Zod validation schemas for API inputs and form data.
 * Centralized here so both server routes and client components
 * can share the same validation rules.
 */

import { z } from "zod";

// --- Deposit / Checkout ---

export const depositMethodSchema = z.enum(["card", "crypto", "bank"]);

export const checkoutRequestSchema = z.object({
  amount: z
    .number()
    .int("Amount must be an integer (cents)")
    .min(500, "Minimum deposit is $5.00")
    .max(1_000_000, "Maximum single deposit is $10,000.00"),
  method: depositMethodSchema,
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

// --- Game ID param ---

export const gameIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Game ID must be a positive integer")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),
});

// --- Pagination ---

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// --- Health check query (future extensibility) ---

export const healthCheckQuerySchema = z.object({
  verbose: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

// --- Validation helper ---

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map((issue) => issue.message);
  return { success: false, errors };
}
