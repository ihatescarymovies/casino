import { verifyApiKey } from "payram";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sseManager } from "./sse";
import {
  recordWebhook,
  recordWalletCredit,
  recordSseBroadcast,
} from "./metrics";

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
    const startNs = process.hrtime.bigint();

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
      // Wrap session update + wallet credit + transaction insert in a single
      // DB transaction with row-level locking. This prevents double-credits
      // on concurrent webhook retries and ensures atomicity.
      let walletCredited = false;
      let creditedAmountCents = 0;

      if (existingRow.user_id) {
        const amountCents = Math.round(existingRow.amount_usd * 100);
        await db.transaction(async (tx) => {
          // 1. Mark the payment session completed — only if not already terminal.
          //    The WHERE guard makes this idempotent under concurrent retries.
          const sessionResult = await tx.execute(
            sql`UPDATE payment_sessions
                SET status = 'completed', filled_amount = ${amount ?? null}, filled_currency = ${currency ?? null}, updated_at = NOW()
                WHERE reference_id = ${reference_id}
                  AND status NOT IN ('completed', 'partial', 'cancelled')`,
          );

          if (sessionResult.rowCount === 0) {
            // Session was already terminal — nothing to credit.
            logger.info(
              { reference_id },
              "Session already terminal inside transaction; skipping wallet credit",
            );
            return;
          }

          // 2. Lock the wallet row to prevent concurrent balance reads.
          const walletResult = await tx.execute(
            sql`SELECT id, balance FROM wallets
                WHERE user_id = ${existingRow.user_id}
                LIMIT 1
                FOR UPDATE`,
          );
          const wallet = walletResult.rows[0] as
            | { id: number; balance: number }
            | undefined;

          if (!wallet) {
            logger.warn(
              { reference_id, userId: existingRow.user_id },
              "Wallet not found; skipping credit",
            );
            return;
          }

          // 3. Credit the wallet and record the transaction atomically.
          const newBalance = wallet.balance + amountCents;
          await tx.execute(
            sql`UPDATE wallets SET balance = ${newBalance}, updated_at = NOW() WHERE id = ${wallet.id}`,
          );
          await tx.execute(
            sql`INSERT INTO transactions (wallet_id, user_id, type, amount, balance_before, balance_after, status, reference_id, description, created_at)
                VALUES (${wallet.id}, ${existingRow.user_id}, 'deposit', ${amountCents}, ${wallet.balance}, ${newBalance}, 'completed', ${reference_id}, 'Deposit via PayRam', NOW())`,
          );

          walletCredited = true;
          creditedAmountCents = amountCents;
        });

        if (walletCredited) {
          logger.info(
            {
              reference_id,
              userId: existingRow.user_id,
              amountCents: creditedAmountCents,
            },
            "Wallet credited for completed deposit",
          );
          recordWalletCredit("success");
        }

        sseManager.broadcast(`payment:${existingRow.user_id}`, "status", {
          reference_id,
          status: "completed",
          amount: existingRow.amount_usd,
        });
        recordSseBroadcast("payment_status");
      } else {
        // No user_id — just mark the session completed (shareable link, etc.)
        await db.execute(
          sql`UPDATE payment_sessions
              SET status = 'completed', filled_amount = ${amount ?? null}, filled_currency = ${currency ?? null}, updated_at = NOW()
              WHERE reference_id = ${reference_id}
                AND status NOT IN ('completed', 'partial', 'cancelled')`,
        );
      }

      logger.info({ reference_id }, "Payment marked as completed");
    } else if (status === "PARTIALLY_FILLED") {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = 'partial', filled_amount = ${amount ?? null}, filled_currency = ${currency ?? null}, updated_at = NOW()
            WHERE reference_id = ${reference_id}
              AND status NOT IN ('completed', 'partial', 'cancelled')`,
      );

      if (existingRow.user_id) {
        sseManager.broadcast(`payment:${existingRow.user_id}`, "status", {
          reference_id,
          status: "partial",
          amount: existingRow.amount_usd,
        });
        recordSseBroadcast("payment_status");
      }
      logger.info({ reference_id }, "Payment marked as partial");
    } else {
      await db.execute(
        sql`UPDATE payment_sessions
            SET status = ${status?.toLowerCase() ?? "unknown"}, updated_at = NOW()
            WHERE reference_id = ${reference_id}
              AND status NOT IN ('completed', 'partial', 'cancelled')`,
      );

      if (existingRow.user_id) {
        sseManager.broadcast(`payment:${existingRow.user_id}`, "status", {
          reference_id,
          status: status?.toLowerCase() ?? "unknown",
        });
        recordSseBroadcast("payment_status");
      }
      logger.info({ reference_id, status }, "Payment status updated");
    }

    logger.info(
      { reference_id, status, processedAt: new Date().toISOString() },
      "PayRam webhook processed",
    );

    const durationNs = process.hrtime.bigint() - startNs;
    const durationSec = Number(durationNs) / 1e9;
    recordWebhook(status ?? "unknown", "success", durationSec);
  }
}
