import { Router } from "express";
import { storage } from "../lib/storage";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router = Router();

router.get("/deposit-packages", async (_req, res) => {
  try {
    const rows = await storage.listProductsWithPrices(true);
    const productsMap = new Map<string, any>();
    for (const row of rows as any[]) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: row.product_metadata,
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unitAmount: row.unit_amount,
          currency: row.currency,
        });
      }
    }
    res.json(Array.from(productsMap.values()));
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch deposit packages" });
  }
});

router.post("/checkout", async (req: any, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: "priceId required" });

    const stripe = await getUncachableStripeClient();
    const user = req.user;

    let customerId: string | undefined;
    const existing = await db.execute(
      sql`SELECT stripe_customer_id FROM users WHERE id = ${user.id}`
    );
    customerId = (existing.rows[0] as any)?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId: user.id },
      });
      await db.execute(
        sql`UPDATE users SET stripe_customer_id = ${customer.id} WHERE id = ${user.id}`
      );
      customerId = customer.id;
    }

    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${baseUrl}/dashboard?deposit=success`,
      cancel_url: `${baseUrl}/cashier`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

export default router;
