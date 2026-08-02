import { Router, type Request, type Response } from "express";
import { getPayramClient } from "../lib/payramClient";
import { WebhookHandlers } from "../lib/webhookHandlers";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const WEBHOOK_MAX_RETRIES = 3;
const WEBHOOK_BASE_DELAY_MS = 1000;
const FALLBACK_POLL_DELAY_MS = 60_000;

const TERMINAL_DB_STATUSES = ["completed", "partial", "cancelled"];

function mapPayramStatus(raw?: string): string {
  switch (raw?.toUpperCase()) {
    case "FILLED":
    case "OVER_FILLED":
      return "completed";
    case "PARTIALLY_FILLED":
      return "partial";
    case "CANCELLED":
      return "cancelled";
    default:
      return raw?.toLowerCase() ?? "unknown";
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = WEBHOOK_MAX_RETRIES,
  baseDelayMs = WEBHOOK_BASE_DELAY_MS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

async function fetchPayramPaymentStatus(referenceId: string): Promise<{
  status?: string;
  filled_amount?: string;
  filled_currency?: string;
} | null> {
  const apiUrl = process.env.PAYRAM_API_URL;
  const apiKey = process.env.PAYRAM_API_KEY;
  if (!apiUrl || !apiKey) return null;

  try {
    const res = await fetch(
      `${apiUrl}/api/v1/payment/reference/${referenceId}`,
      { headers: { "API-Key": apiKey } },
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      status?: string;
      filled_amount?: string;
      filled_currency?: string;
    };
  } catch {
    return null;
  }
}

const DEPOSIT_PACKAGES = [
  {
    id: "starter",
    name: "Starter Pack",
    description: "Get in the game — perfect for new players",
    amountInUSD: 25,
    tier: "starter",
  },
  {
    id: "pro",
    name: "Player Pack",
    description: "The most popular deposit for regular players",
    amountInUSD: 100,
    tier: "pro",
  },
  {
    id: "elite",
    name: "High Roller",
    description: "For serious players who mean business",
    amountInUSD: 250,
    tier: "elite",
  },
  {
    id: "vip",
    name: "VIP Bundle",
    description: "Maximum value — exclusive VIP access included",
    amountInUSD: 500,
    tier: "vip",
  },
];

// Soft-launch minimum deposit tier.
const MIN_DEPOSIT_PACKAGE_ID = "min-deposit";
const MIN_DEPOSIT_AMOUNT_USD = 10;

function isAdmin(user: any): boolean {
  // Soft-launch admin gate: explicit role check.
  // Adjust as RBAC matures; for now any user with `role === 'admin'` is allowed.
  return Boolean(user && user.role === "admin");
}

router.get("/deposit-packages", (_req, res) => {
  const packages = DEPOSIT_PACKAGES.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    metadata: { tier: pkg.tier },
    prices: [
      {
        id: pkg.id,
        unitAmount: pkg.amountInUSD * 100,
        currency: "usd",
      },
    ],
  }));
  // Append the $10 minimum tier at the head so Cashier always has the floor.
  res.json([
    {
      id: MIN_DEPOSIT_PACKAGE_ID,
      name: "Quick Deposit",
      description: "Minimum deposit — get started fast",
      metadata: { tier: "starter" },
      prices: [
        {
          id: MIN_DEPOSIT_PACKAGE_ID,
          unitAmount: MIN_DEPOSIT_AMOUNT_USD * 100,
          currency: "usd",
        },
      ],
    },
    ...packages,
  ]);
});

router.post("/checkout", async (req: any, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { priceId } = req.body;
    if (!priceId) {
      res.status(400).json({ error: "priceId required" });
      return;
    }

    const isMin = priceId === MIN_DEPOSIT_PACKAGE_ID;
    const pkg = isMin
      ? { id: MIN_DEPOSIT_PACKAGE_ID, amountInUSD: MIN_DEPOSIT_AMOUNT_USD }
      : DEPOSIT_PACKAGES.find((p) => p.id === priceId);
    if (!pkg) {
      res.status(400).json({ error: "Invalid package" });
      return;
    }

    const payram = getPayramClient();
    const user = req.user;

    const checkout = await payram.payments.initiatePayment({
      customerEmail: user.email ?? undefined,
      customerId: String(user.id),
      amountInUSD: pkg.amountInUSD,
    });

    await db.execute(
      sql`INSERT INTO payment_sessions (reference_id, invoice_id, user_id, amount_usd, status, created_at, updated_at)
          VALUES (${checkout.reference_id}, ${checkout.reference_id}, ${user.id}, ${pkg.amountInUSD}, 'open', NOW(), NOW())
          ON CONFLICT (reference_id) DO NOTHING`,
    );

    // Schedule a fallback poll 60s after checkout creation. If the webhook
    // was missed or lost, this ensures payment status eventually converges.
    const refId = checkout.reference_id;
    setTimeout(async () => {
      try {
        const remote = await fetchPayramPaymentStatus(refId);
        if (!remote) return;
        const dbStatus = mapPayramStatus(remote.status);
        if (!TERMINAL_DB_STATUSES.includes(dbStatus)) return;
        await db.execute(
          sql`UPDATE payment_sessions
              SET status = ${dbStatus}, updated_at = NOW()
              WHERE reference_id = ${refId} AND status NOT IN ('completed', 'partial', 'cancelled')`,
        );
        logger.info(
          { reference_id: refId, status: remote.status },
          "Fallback poll updated payment status",
        );
      } catch (err) {
        logger.error({ err, reference_id: refId }, "Fallback poll failed");
      }
    }, FALLBACK_POLL_DELAY_MS);

    res.json({ url: checkout.url });
  } catch (err: any) {
    logger.error({ err }, "Checkout error");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/shareable-link", async (req: any, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isAdmin(req.user)) {
      res.status(403).json({ error: "Admin role required" });
      return;
    }

    const { amountInUSD } = req.body ?? {};
    const amount = Number(amountInUSD);
    if (
      !Number.isFinite(amount) ||
      amount < MIN_DEPOSIT_AMOUNT_USD ||
      amount > 10000
    ) {
      res.status(400).json({
        error: `amountInUSD must be between ${MIN_DEPOSIT_AMOUNT_USD} and 10000`,
      });
      return;
    }

    const payram = getPayramClient();
    const checkout = await payram.payments.initiatePayment({
      // Shareable link is user-agnostic; use placeholder customer fields.
      // The PayRam backend accepts these for anonymous/shareable checkout sessions.
      customerEmail: `shareable-link@casino.local`,
      customerId: `shareable-link-${Date.now()}`,
      amountInUSD: amount,
    });

    // Persist with user_id=NULL and special reference_id prefix for traceability.
    await db.execute(
      sql`INSERT INTO payment_sessions (reference_id, invoice_id, user_id, amount_usd, status, created_at, updated_at)
          VALUES (${checkout.reference_id}, ${checkout.reference_id}, NULL, ${amount}, 'open', NOW(), NOW())
          ON CONFLICT (reference_id) DO NOTHING`,
    );

    res.json({ url: checkout.url, reference_id: checkout.reference_id });
  } catch (err: any) {
    logger.error({ err }, "Shareable link error");
    res.status(500).json({ error: "Failed to create shareable link" });
  }
});

router.get("/status/:referenceId", async (req: any, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const rows = await db.execute(
      sql`SELECT reference_id, status, filled_amount, filled_currency, amount_usd, updated_at
          FROM payment_sessions
          WHERE reference_id = ${req.params.referenceId}
            AND (user_id = ${req.user.id} OR user_id IS NULL)
          LIMIT 1`,
    );
    const row = rows.rows[0] as Record<string, any> | undefined;
    if (!row) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!TERMINAL_DB_STATUSES.includes(row.status)) {
      const remote = await fetchPayramPaymentStatus(
        String(req.params.referenceId),
      );
      if (remote?.status) {
        const dbStatus = mapPayramStatus(remote.status);
        if (dbStatus !== row.status) {
          await db.execute(
            sql`UPDATE payment_sessions SET status = ${dbStatus}, updated_at = NOW()
                WHERE reference_id = ${req.params.referenceId}`,
          );
          row.status = dbStatus;
        }
      }
    }

    res.json(row);
  } catch (err: any) {
    logger.error({ err }, "Status fetch error");
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

router.get("/history", async (req: any, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const rows = await db.execute(
      sql`SELECT reference_id, amount_usd, status, filled_amount, filled_currency, created_at
          FROM payment_sessions
          WHERE user_id = ${req.user.id}
          ORDER BY created_at DESC
          LIMIT 20`,
    );
    res.json(rows.rows);
  } catch (err: any) {
    logger.error({ err }, "History error");
    res.status(500).json({ error: "Failed to fetch deposit history" });
  }
});

/**
 * PayRam webhook receiver.
 *
 * Contract:
 *   - Method: POST (PayRam sends signed POST bodies, not query params).
 *   - Signature header: `x-payram-signature` (hex HMAC-SHA256 of raw body).
 *   - Verification uses `PAYRAM_WEBHOOK_SECRET` env var.
 *
 * NOTE: PayRam authenticates webhooks with an `API-Key` header matching the
 * merchant API key (verified via the SDK's verifyApiKey). No raw-body HMAC
 * is needed, but we still read the stream directly to avoid express.json()
 * interference on this route.
 */
router.post("/payram-webhook", (req: Request, res: Response) => {
  try {
    if (!WebhookHandlers.verifyWebhookApiKey(req.headers)) {
      logger.warn(
        { headers: req.headers },
        "Webhook rejected: invalid API key",
      );
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    const payload: Record<string, any> = req.body ?? {};
    logger.info(
      { reference_id: payload.reference_id, status: payload.status },
      "Webhook received",
    );
    withRetry(() => WebhookHandlers.processPayramWebhook(payload))
      .then(() => {
        logger.info(
          { reference_id: payload.reference_id },
          "Webhook processed",
        );
        res.status(200).json({ received: true });
      })
      .catch((err: any) => {
        logger.error(
          { err, reference_id: payload.reference_id },
          "Webhook processing failed after retries",
        );
        res.status(500).json({ error: "Webhook processing error" });
      });
  } catch (err: any) {
    logger.error({ err }, "Webhook handler error");
    res.status(500).json({ error: "Webhook processing error" });
  }
});

const WITHDRAWAL_MIN_CENTS = 1000;
const WITHDRAWAL_MAX_CENTS = 1_000_000;

const SUPPORTED_PAYOUT_CHAINS: Record<string, string[]> = {
  ETH: ["USDC", "USDT"],
  BASE: ["USDC"],
  TRX: ["USDT"],
  BTC: ["USDC", "USDT"],
};

function isValidAddress(addr: string): boolean {
  if (!addr || addr.length < 20 || addr.length > 64) return false;
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return true;
  if (/^[13T][0-9a-zA-Z]{25,47}$/.test(addr)) return true;
  return false;
}

router.post("/withdraw", async (req: any, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { blockchainCode, currencyCode, amountUsd, toAddress } =
      req.body ?? {};
    const chain = String(blockchainCode ?? "").toUpperCase();
    const currency = String(currencyCode ?? "").toUpperCase();
    const amountCents = Math.round(Number(amountUsd));

    if (!chain || !currency || !amountUsd || !toAddress) {
      res.status(400).json({
        error:
          "blockchainCode, currencyCode, amountUsd, and toAddress are required",
      });
      return;
    }
    if (
      !SUPPORTED_PAYOUT_CHAINS[chain] ||
      !SUPPORTED_PAYOUT_CHAINS[chain].includes(currency)
    ) {
      res
        .status(400)
        .json({ error: `Unsupported chain/currency: ${chain}/${currency}` });
      return;
    }
    if (
      !Number.isFinite(amountCents) ||
      amountCents < WITHDRAWAL_MIN_CENTS ||
      amountCents > WITHDRAWAL_MAX_CENTS
    ) {
      res.status(400).json({
        error: `amountUsd must be between $${WITHDRAWAL_MIN_CENTS / 100} and $${WITHDRAWAL_MAX_CENTS / 100}`,
      });
      return;
    }
    if (!isValidAddress(String(toAddress))) {
      res.status(400).json({ error: "Invalid destination wallet address" });
      return;
    }

    const user = req.user;

    const walletRows = await db.execute(
      sql`SELECT id, balance FROM wallets WHERE user_id = ${user.id} LIMIT 1`,
    );
    const wallet = walletRows.rows[0] as
      | { id: number; balance: number }
      | undefined;
    if (!wallet || wallet.balance < amountCents) {
      res.status(402).json({ error: "Insufficient balance" });
      return;
    }

    const tokenAmount = String(amountCents / 100);

    const payram = getPayramClient();
    const payout = await payram.payouts.createPayout({
      email: user.email ?? `user-${user.id}@casino.local`,
      blockchainCode: chain as any,
      currencyCode: currency as any,
      amount: tokenAmount,
      toAddress: String(toAddress),
      customerID: String(user.id),
    });

    await db.execute(
      sql`INSERT INTO withdrawal_requests (user_id, payout_id, blockchain_code, currency_code, amount_usd, to_address, status, tx_hash, fee, created_at, updated_at)
          VALUES (${user.id}, ${payout.id ?? null}, ${chain}, ${currency}, ${amountCents}, ${String(toAddress)}, ${payout.status ?? "pending"}, ${payout.txHash ?? null}, ${payout.fee ?? null}, NOW(), NOW())`,
    );

    const newBalance = wallet.balance - amountCents;
    await db.execute(
      sql`UPDATE wallets SET balance = ${newBalance}, updated_at = NOW() WHERE id = ${wallet.id}`,
    );
    await db.execute(
      sql`INSERT INTO transactions (wallet_id, user_id, type, amount, balance_before, balance_after, status, reference_id, description, created_at)
          VALUES (${wallet.id}, ${user.id}, 'withdrawal', ${-amountCents}, ${wallet.balance}, ${newBalance}, 'completed', ${String(payout.id ?? "")}, 'Crypto withdrawal via PayRam', NOW())`,
    );

    res.json({
      id: payout.id,
      status: payout.status ?? "pending",
      amountUsd: amountCents,
      blockchainCode: chain,
      currencyCode: currency,
      toAddress,
      txHash: payout.txHash ?? null,
    });
  } catch (err: any) {
    logger.error({ err }, "Withdrawal error");
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

router.get("/withdrawals", async (req: any, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const rows = await db.execute(
      sql`SELECT id, payout_id, blockchain_code, currency_code, amount_usd, to_address, status, tx_hash, fee, failure_reason, created_at, updated_at
          FROM withdrawal_requests
          WHERE user_id = ${req.user.id}
          ORDER BY created_at DESC
          LIMIT 20`,
    );
    res.json(rows.rows);
  } catch (err: any) {
    logger.error({ err }, "Withdrawal history error");
    res.status(500).json({ error: "Failed to fetch withdrawal history" });
  }
});

router.get("/withdrawals/:id", async (req: any, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const rows = await db.execute(
      sql`SELECT id, payout_id, blockchain_code, currency_code, amount_usd, to_address, status, tx_hash, fee, failure_reason, created_at, updated_at
          FROM withdrawal_requests
          WHERE id = ${req.params.id} AND user_id = ${req.user.id}
          LIMIT 1`,
    );
    const row = rows.rows[0] as Record<string, any> | undefined;
    if (!row) {
      res.status(404).json({ error: "Withdrawal not found" });
      return;
    }

    if (
      row.payout_id &&
      !["completed", "failed", "rejected"].includes(row.status)
    ) {
      try {
        const payram = getPayramClient();
        const payout = await payram.payouts.getPayoutById(
          Number(row.payout_id),
        );
        if (payout.status && payout.status !== row.status) {
          await db.execute(
            sql`UPDATE withdrawal_requests SET status = ${payout.status}, tx_hash = ${payout.txHash ?? null}, updated_at = NOW() WHERE id = ${row.id}`,
          );
          row.status = payout.status;
          row.tx_hash = payout.txHash ?? null;
        }
      } catch {
        /* best-effort */
      }
    }

    res.json(row);
  } catch (err: any) {
    logger.error({ err }, "Withdrawal status error");
    res.status(500).json({ error: "Failed to fetch withdrawal status" });
  }
});

export default router;
