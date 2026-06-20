import { Router } from "express";
import { db, winnersTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const winners = await db
      .select()
      .from(winnersTable)
      .orderBy(desc(winnersTable.timestamp))
      .limit(limit);
    const serialized = winners.map((w) => ({
      ...w,
      timestamp: w.timestamp.toISOString(),
    }));
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch winners" });
  }
});

export default router;
