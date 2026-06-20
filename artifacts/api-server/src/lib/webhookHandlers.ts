import { logger } from "./logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export class WebhookHandlers {
  static async processPayramWebhook(payload: Record<string, any>): Promise<void> {
    const { reference_id, status, amount, currency } = payload;

    logger.info({ reference_id, status, amount, currency }, "PayRam webhook received");

    if (status === "FILLED" || status === "OVER_FILLED") {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = 'completed', filled_amount = ${amount ?? null}, filled_currency = ${currency ?? null}, updated_at = NOW()
            WHERE reference_id = ${reference_id}`
      );
      logger.info({ reference_id }, "Payment marked as completed");
    } else if (status === "PARTIALLY_FILLED") {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = 'partial', filled_amount = ${amount ?? null}, filled_currency = ${currency ?? null}, updated_at = NOW()
            WHERE reference_id = ${reference_id}`
      );
    } else {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = ${status?.toLowerCase() ?? "unknown"}, updated_at = NOW()
            WHERE reference_id = ${reference_id}`
      );
    }
  }
}
