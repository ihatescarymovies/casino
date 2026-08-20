import { Router } from "express";
import { db, gamesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { category, featured } = req.query;
    let query = db.select().from(gamesTable);
    const conditions = [];
    if (category) conditions.push(eq(gamesTable.category, category as string));
    if (featured === "true") conditions.push(eq(gamesTable.isFeatured, true));
    const games = conditions.length
      ? await db
          .select()
          .from(gamesTable)
          .where(and(...conditions))
      : await query;
    res.json(games);
  } catch (err) {
    logger.error({ err }, "Failed to fetch games");
    res.status(500).json({ error: "Failed to fetch games" });
  }
});

router.get("/categories", async (_req, res) => {
  try {
    const games = await db.select().from(gamesTable);
    const categoryMap: Record<string, number> = {};
    for (const g of games) {
      categoryMap[g.category] = (categoryMap[g.category] || 0) + 1;
    }
    const iconMap: Record<string, string> = {
      slots: "Zap",
      blackjack: "Layers",
      roulette: "Circle",
      poker: "Spade",
      sports: "Trophy",
      live: "Radio",
    };
    const categories = Object.entries(categoryMap).map(([name, count]) => ({
      name,
      count,
      iconName: iconMap[name] || "Star",
    }));
    res.json(categories);
  } catch (err) {
    logger.error({ err }, "Failed to fetch categories");
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.get("/featured", async (_req, res) => {
  try {
    const games = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.isFeatured, true));
    res.json(games);
  } catch (err) {
    logger.error({ err }, "Failed to fetch featured games");
    res.status(500).json({ error: "Failed to fetch featured games" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid game ID" });
      return;
    }
    const [game] = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.id, id));
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(game);
  } catch (err) {
    logger.error({ err }, "Failed to fetch game");
    res.status(500).json({ error: "Failed to fetch game" });
  }
});

export default router;
