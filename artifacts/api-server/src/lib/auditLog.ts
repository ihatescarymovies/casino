import { logger } from "./logger";

export interface AuditEntry {
  userId: string | undefined;
  action: string;
  ip: string | undefined;
  result: "success" | "failed" | "denied";
  details?: Record<string, unknown>;
}

/**
 * Structured audit logger for sensitive payment-related actions.
 * Uses the existing Pino logger so audit events flow through the same
 * transport as application logs, but tagged with `audit: true` for
 * easy filtering and downstream forwarding to a SIEM.
 */
export function auditLog(entry: AuditEntry): void {
  logger.info(
    {
      audit: true,
      userId: entry.userId,
      action: entry.action,
      ip: entry.ip,
      result: entry.result,
      details: entry.details,
      timestamp: new Date().toISOString(),
    },
    `AUDIT: ${entry.action} ${entry.result}`,
  );
}

/** Helper to extract client IP from Express request, accounting for proxy headers. */
export function getClientIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim();
  }
  return req.ip;
}
