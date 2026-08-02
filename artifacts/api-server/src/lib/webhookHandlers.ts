import { verifyApiKey } from "payram";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export class WebhookHandlers {
  /**
   * Verify PayRam webhook authenticity using the SDK's verifyApiKey.
   *
   * PayRam signs webhook requests with an `API-Key` header matching the
   * merchant API key. The SDK's `verifyApiKey` performs the comparison
   * securely. No HMAC or JWT signature is involved.
   *
   * Expected header: `API-Key` (merchant API key).
   * Expected env var: `PAYRAM_API_KEY`.
   */
  static verifyWebhookApiKey(headers: Record<string, unknown>): boolean {
    const expected = process.env.PAYRAM_API_KEY;
    if (!expected) {
      logger.error("PAYRAM_API_KEY is not configured; rejecting webhook");
      return false;
    }
    return verifyApiKey(headers, expected);
  }

  /**
   * Process a verified PayRam webhook payload.
   *
   * Caller MUST verify the signature BEFORE invoking this method.
   * This method performs an idempotent status update: if the session is
   * already in a terminal state (completed/partial), it short-circuits
   * without rewriting filled_amount — preventing double-credit on retries.
   */
  static async processPayramWebhook(
    payload: Record<string, any>,
  ): Promise<void> {
    const { reference_id, status, amount, currency } = payload;

    logger.info(
      { reference_id, status, amount, currency },
      "PayRam webhook received",
    );

    // Idempotency guard: skip if already in terminal state.
    const existing = await db.execute(
      sql`SELECT status FROM payment_sessions WHERE reference_id = ${reference_id} LIMIT 1`,
    );
    const existingStatus = existing.rows[0]?.status as string | undefined;
    if (existingStatus === "completed" || existingStatus === "partial") {
      logger.info(
        { reference_id, existingStatus },
        "Webhook ignored: session already in terminal state",
      );
      return;
    }

    if (status === "FILLED" || status === "OVER_FILLED") {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = 'completed', filled_amount = ${amount ?? null}, filled_currency = ${currency ?? null}, updated_at = NOW()
            WHERE reference_id = ${reference_id}`,
      );
      logger.info({ reference_id }, "Payment marked as completed");
    } else if (status === "PARTIALLY_FILLED") {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = 'partial', filled_amount = ${amount ?? null}, filled_currency = ${currency ?? null}, updated_at = NOW()
            WHERE reference_id = ${reference_id}`,
      );
    } else {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = ${status?.toLowerCase() ?? "unknown"}, updated_at = NOW()
            WHERE reference_id = ${reference_id}`,
      );
    }
  }
}
