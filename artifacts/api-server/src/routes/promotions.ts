import { Router } from "express";
import { db, promotionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const promotions = await db.select().from(promotionsTable);
    res.json(promotions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch promotions" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [promo] = await db
      .select()
      .from(promotionsTable)
      .where(eq(promotionsTable.id, id));
    if (!promo) return res.status(404).json({ error: "Promotion not found" });
    res.json(promo);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch promotion" });
  }
});

export default router;
