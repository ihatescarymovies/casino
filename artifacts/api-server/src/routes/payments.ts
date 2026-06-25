import { Router } from "express";
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
  res.json(packages);
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

    const pkg = DEPOSIT_PACKAGES.find((p) => p.id === priceId);
    if (!pkg) {
      res.status(400).json({ error: "Invalid package" });
      return;
    }

    const payram = getPayramClient();
    const user = req.user;

    const invoiceId = `deposit_${user.id}_${Date.now()}`;

    const checkout = await payram.payments.initiatePayment({
      customerEmail: user.email ?? undefined,
      customerId: String(user.id),
      amountInUSD: pkg.amountInUSD,
    });

    await db.execute(
      sql`INSERT INTO payment_sessions (reference_id, invoice_id, user_id, amount_usd, status, created_at, updated_at)
          VALUES (${checkout.reference_id}, ${invoiceId}, ${user.id}, ${pkg.amountInUSD}, 'open', NOW(), NOW())
          ON CONFLICT (reference_id) DO NOTHING`,
    );

    res.json({ url: checkout.url });
  } catch (err: any) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
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
            AND user_id = ${req.user.id}
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
      sql`SELECT reference_id, invoice_id, amount_usd, status, filled_amount, filled_currency, created_at
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

router.get("/payram-webhook", async (req, res) => {
  try {
    await WebhookHandlers.processPayramWebhook(
      req.query as Record<string, any>,
    );
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook processing error" });
  }
});

export default router;
