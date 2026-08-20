import { Router } from "express";
import { db, gamesTable, winnersTable, gameRoundsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Run all queries in parallel
    const [gamesCount, payoutTotal, activePlayers, jackpotTotal] =
      await Promise.all([
        // Total games available
        db.select({ count: sql<number>`count(*)::int` }).from(gamesTable),

        // Total payouts today (from winners table)
        db
          .select({
            total: sql<number>`coalesce(sum(${winnersTable.winAmount}), 0)::float`,
          })
          .from(winnersTable)
          .where(sql`${winnersTable.timestamp} >= ${todayIso}`),

        // Active players today (distinct users who placed a bet)
        db
          .select({
            count: sql<number>`count(distinct ${gameRoundsTable.userId})::int`,
          })
          .from(gameRoundsTable)
          .where(sql`${gameRoundsTable.createdAt} >= ${todayIso}`),

        // Current jackpot (sum of all game jackpot amounts)
        db
          .select({
            total: sql<number>`coalesce(sum(${gamesTable.jackpotAmount}), 0)::float`,
          })
          .from(gamesTable),
      ]);

    res.json({
      totalPayoutToday: payoutTotal[0]?.total ?? 0,
      activePlayers: activePlayers[0]?.count ?? 0,
      currentJackpot: jackpotTotal[0]?.total ?? 0,
      gamesAvailable: gamesCount[0]?.count ?? 0,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
