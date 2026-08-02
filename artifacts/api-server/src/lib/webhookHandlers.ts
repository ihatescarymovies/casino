import { verifyApiKey } from "payram";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sseManager } from "./sse";

export class WebhookHandlers {
  static verifyWebhookApiKey(headers: Record<string, unknown>): boolean {
    const expected = process.env.PAYRAM_API_KEY;
    if (!expected) {
      logger.error("PAYRAM_API_KEY is not configured; rejecting webhook");
      return false;
    }
    return verifyApiKey(headers, expected);
  }

  static async processPayramWebhook(
    payload: Record<string, any>,
  ): Promise<void> {
    const { reference_id, status, amount, currency } = payload;
    const receivedAt = new Date().toISOString();

    logger.info(
      { reference_id, status, amount, currency, receivedAt },
      "PayRam webhook received",
    );

    const existing = await db.execute(
      sql`SELECT status, user_id, amount_usd FROM payment_sessions WHERE reference_id = ${reference_id} LIMIT 1`,
    );
    const existingRow = existing.rows[0] as
      | { status: string; user_id: string | null; amount_usd: number }
      | undefined;

    if (!existingRow) {
      logger.warn({ reference_id }, "Webhook for unknown reference_id");
      return;
    }

    const existingStatus = existingRow.status;
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

      if (existingRow.user_id) {
        const amountCents = Math.round(existingRow.amount_usd * 100);
        const walletRows = await db.execute(
          sql`SELECT id, balance FROM wallets WHERE user_id = ${existingRow.user_id} LIMIT 1`,
        );
        const wallet = walletRows.rows[0] as
          | { id: number; balance: number }
          | undefined;

        if (wallet) {
          const newBalance = wallet.balance + amountCents;
          await db.execute(
            sql`UPDATE wallets SET balance = ${newBalance}, updated_at = NOW() WHERE id = ${wallet.id}`,
          );
          await db.execute(
            sql`INSERT INTO transactions (wallet_id, user_id, type, amount, balance_before, balance_after, status, reference_id, description, created_at)
                VALUES (${wallet.id}, ${existingRow.user_id}, 'deposit', ${amountCents}, ${wallet.balance}, ${newBalance}, 'completed', ${reference_id}, 'Deposit via PayRam', NOW())`,
          );
          logger.info(
            {
              reference_id,
              userId: existingRow.user_id,
              amountCents,
              newBalance,
            },
            "Wallet credited for completed deposit",
          );
        }

        sseManager.broadcast(`payment:${existingRow.user_id}`, "status", {
          reference_id,
          status: "completed",
          amount: existingRow.amount_usd,
        });
      }

      logger.info({ reference_id }, "Payment marked as completed");
    } else if (status === "PARTIALLY_FILLED") {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = 'partial', filled_amount = ${amount ?? null}, filled_currency = ${currency ?? null}, updated_at = NOW()
            WHERE reference_id = ${reference_id}`,
      );

      if (existingRow.user_id) {
        sseManager.broadcast(`payment:${existingRow.user_id}`, "status", {
          reference_id,
          status: "partial",
          amount: existingRow.amount_usd,
        });
      }
      logger.info({ reference_id }, "Payment marked as partial");
    } else {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = ${status?.toLowerCase() ?? "unknown"}, updated_at = NOW()
            WHERE reference_id = ${reference_id}`,
      );

      if (existingRow.user_id) {
        sseManager.broadcast(`payment:${existingRow.user_id}`, "status", {
          reference_id,
          status: status?.toLowerCase() ?? "unknown",
        });
      }
      logger.info({ reference_id, status }, "Payment status updated");
    }

    logger.info(
      { reference_id, status, processedAt: new Date().toISOString() },
      "PayRam webhook processed",
    );
  }
}
