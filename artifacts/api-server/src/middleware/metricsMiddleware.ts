import type { Request, Response, NextFunction } from "express";
import { recordHttpRequest } from "../lib/metrics";

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path === "/metrics") {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;
    const route = req.route?.path ?? req.path;
    recordHttpRequest(req.method, route, res.statusCode, durationSec);
  });

  next();
}
