import { Router, type Request, type Response } from "express";
import { getPayramClient } from "../lib/payramClient";
import { WebhookHandlers } from "../lib/webhookHandlers";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const DEPOSIT_PACKAGES = [
  {
    id: "starter",
    name: "Starter Pack",
    description: "Get in the game — perfect for new players",
    amountInUSD: 25,
    tier: "starter",
  },
  {
    id: "standard",
    name: "Standard Pack",
    description: "A balanced starting point for regular play",
    amountInUSD: 50,
    tier: "standard",
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

    res.json({ url: checkout.url });
  } catch (err: any) {
    console.error("Checkout error:", err);
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
    console.error("Shareable link error:", err);
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
    const row = rows.rows[0];
    if (!row) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(row);
  } catch (err: any) {
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
    console.error("History error:", err);
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
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    const payload: Record<string, any> = req.body ?? {};
    WebhookHandlers.processPayramWebhook(payload)
      .then(() => res.status(200).json({ received: true }))
      .catch((err: any) => {
        console.error("Webhook error:", err);
        res.status(500).json({ error: "Webhook processing error" });
      });
  } catch (err: any) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook processing error" });
  }
});

export default router;
