import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { GameEngineError } from "../lib/errors";
import { logger } from "../lib/logger";

/**
 * Centralized Express 5 error handler.
 *
 * MUST be registered as the LAST middleware via `app.use()`.
 *
 * Error → Response mapping:
 *   ZodError       → 400  { error, code: "VALIDATION_ERROR", fields }
 *   GameEngineError →     { error }  (uses the error's statusCode)
 *   unknown/500    → 500  { error }  (logged; no stack leak)
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  /* ── Zod validation errors ─────────────────────────────────────── */
  if (err instanceof ZodError) {
    const flat = err.flatten();
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      fields: flat.fieldErrors,
      formErrors: flat.formErrors,
    });
    return;
  }

  /* ── Known application errors ──────────────────────────────────── */
  if (err instanceof GameEngineError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  /* ── Unknown errors — log and return generic 500 ───────────────── */
  if (err instanceof Error) {
    logger.error({ err, message: err.message }, "Unhandled error");
  } else {
    logger.error({ err }, "Unhandled non-Error throw");
  }

  res.status(500).json({ error: "Internal server error" });
}
