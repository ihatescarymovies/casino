import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";

/**
 * Express middleware factory that validates `req.body` against a Zod schema.
 *
 * On success the typed (parsed) body is written back to `req.body` so that
 * downstream handlers can rely on the coerced/transformed shape.
 *
 * On failure a 400 response is returned with the flattened field errors.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const { fieldErrors, formErrors } = (result.error as ZodError).flatten();
      res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        fields: fieldErrors,
        formErrors,
      });
      return;
    }
    req.body = result.data as T;
    next();
  };
}

/**
 * Express middleware factory that validates `req.query` against a Zod schema.
 *
 * Works identically to `validate` but operates on query parameters.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const { fieldErrors, formErrors } = (result.error as ZodError).flatten();
      res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        fields: fieldErrors,
        formErrors,
      });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).parsedQuery = result.data;
    next();
  };
}
