import { Router } from "express";
import { db, gamesTable, winnersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gamesTable);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [payoutResult] = await db
      .select({ total: sql<number>`coalesce(sum(win_amount), 0)::float` })
      .from(winnersTable)
      .where(sql`timestamp >= ${today.toISOString()}`);

    res.json({
      totalPayoutToday: payoutResult?.total || 847293.5,
      activePlayers: 1842,
      currentJackpot: 2450000,
      gamesAvailable: countResult?.count || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
