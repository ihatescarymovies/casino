import { Router } from "express";
import { db, promotionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const promotions = await db.select().from(promotionsTable);
    res.json(promotions);
  } catch (err) {
    logger.error({ err }, "Failed to fetch promotions");
    res.status(500).json({ error: "Failed to fetch promotions" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid promotion ID" });
      return;
    }
    const [promo] = await db
      .select()
      .from(promotionsTable)
      .where(eq(promotionsTable.id, id));
    if (!promo) {
      res.status(404).json({ error: "Promotion not found" });
      return;
    }
    res.json(promo);
  } catch (err) {
    logger.error({ err }, "Failed to fetch promotion");
    res.status(500).json({ error: "Failed to fetch promotion" });
  }
});

export default router;
