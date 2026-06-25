/**
 * Game rounds routes.
 *
 * POST /api/rounds    — place a bet and start a round
 * GET  /api/rounds    — paginated list of the user's rounds
 * GET  /api/rounds/:id — single round detail
 * POST /api/rounds/:id — handle interactive game actions (blackjack, mines, crash)
 * POST /api/rounds/:id/verify — verify round fairness
 */

import { Router, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import {
  PlaceBetBody,
  ListRoundsQueryParams,
  VerifyRoundBody,
} from "@workspace/api-zod";
import { validate, validateQuery } from "../lib/validation";
import {
  rateLimitMiddleware,
  validateBetRequest,
} from "../middleware/rate-limit";
import { engineRegistry } from "../engines";
import * as hashChain from "../lib/hash-chain";
import { GameRoundError } from "../lib/errors";
import * as wallet from "../lib/wallet";
import * as demoWallet from "../lib/demo-wallet";

const router = Router();

/* ── Helpers ────────────────────────────────────────────────────────── */

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.user.id;
}

/* ── POST /api/rounds — Place a bet ────────────────────────────────── */

router.post(
  "/",
  validateBetRequest,
  rateLimitMiddleware,
  validate(PlaceBetBody),
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { gameType, betAmount, clientSeed, gameParams } = req.body;
    const isDemo = gameParams?.demo === true;

    const engine = engineRegistry.getEngine(gameType);

    // Route to demo or real wallet based on demo flag
    let roundData;
    let balanceInfo;

    if (isDemo) {
      // Demo mode: use demo wallet
      const demoBetResult = await demoWallet.placeDemoBet(
        userId,
        betAmount,
        gameType,
        `demo-round-${Date.now()}`,
      );

      roundData = await engine.placeBet({
        userId,
        betAmount,
        clientSeed,
        gameParams,
      });

      // Update round with demo flag
      await db
        .update(schema.gameRoundsTable)
        .set({ isDemo: true, payout: roundData.payout })
        .where(eq(schema.gameRoundsTable.id, roundData.roundId));

      balanceInfo = { balance: demoBetResult.balanceAfter };
    } else {
      // Real mode: use real wallet (engine.placeBet debits wallet internally)
      roundData = await engine.placeBet({
        userId,
        betAmount,
        clientSeed,
        gameParams,
      });

      const balanceAfter = await wallet.getBalance(userId);
      balanceInfo = { balance: balanceAfter.balance };
    }

    res.status(200).json({
      roundId: roundData.roundId,
      serverSeedHash: roundData.serverSeedHash,
      result: roundData.result,
      payout: roundData.payout,
      newBalance: balanceInfo.balance,
      demo: isDemo,
    });
  },
);

/* ── GET /api/rounds — Paginated list ───────────────────────────────── */

router.get(
  "/",
  validateQuery(ListRoundsQueryParams),
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const limit = Math.min(
      Math.max((req as any).parsedQuery?.limit ?? 20, 1),
      100,
    );
    const offset = Math.max((req as any).parsedQuery?.offset ?? 0, 0);

    const rounds = await db
      .select()
      .from(schema.gameRoundsTable)
      .where(eq(schema.gameRoundsTable.userId, userId))
      .orderBy(desc(schema.gameRoundsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.status(200).json(rounds);
  },
);

/* ── GET /api/rounds/:id — Single round detail ─────────────────────── */

router.get("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rawId = req.params.id;
  const roundId = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (Number.isNaN(roundId)) {
    res.status(400).json({ error: "Invalid round ID" });
    return;
  }

  const [round] = await db
    .select()
    .from(schema.gameRoundsTable)
    .where(eq(schema.gameRoundsTable.id, roundId));

  if (!round) {
    throw new GameRoundError(`Round ${roundId} not found`, 404);
  }

  if (round.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.status(200).json(round);
});

/* ── POST /api/rounds/:id — Handle interactive game actions ────────── */

router.post("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rawId = req.params.id;
  const roundId = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (Number.isNaN(roundId)) {
    res.status(400).json({ error: "Invalid round ID" });
    return;
  }

  const { action, ...restBody } = req.body;
  const { gameParams, ...actionParams } = restBody;

  // Get round details
  const [round] = await db
    .select()
    .from(schema.gameRoundsTable)
    .where(eq(schema.gameRoundsTable.id, roundId));

  if (!round) {
    throw new GameRoundError(`Round ${roundId} not found`, 404);
  }

  if (round.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (round.status !== "pending") {
    res.status(400).json({ error: "Round already completed" });
    return;
  }
  const engine = engineRegistry.getEngine(round.gameType);

  const result = await engine.handleAction(roundId, action, {
    ...actionParams,
    ...gameParams,
  });

  if (result.payout > 0) {
    if (round.isDemo) {
      await demoWallet.creditDemoBalance(
        userId,
        result.payout,
        round.gameType,
        roundId.toString(),
      );
    } else {
      await wallet.creditBalance(
        userId,
        result.payout,
        round.gameType,
        roundId.toString(),
      );
    }
  }

  await db
    .update(schema.gameRoundsTable)
    .set({
      status: result.result === "pending" ? "pending" : "completed",
      result: result.result,
      payout: result.payout,
    })
    .where(eq(schema.gameRoundsTable.id, roundId));

  const balanceInfo = round.isDemo
    ? await demoWallet.getDemoBalance(userId)
    : await wallet.getBalance(userId);

  res.status(200).json({
    roundId,
    result: result.result,
    payout: result.payout,
    newBalance: balanceInfo.balance,
    demo: round.isDemo,
    gameDetails: result.gameDetails,
  });
});

/* ── POST /api/rounds/:id/verify — Verify fairness ─────────────────── */

router.post(
  "/:id/verify",
  validate(VerifyRoundBody),
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { serverSeed, roundId } = req.body;

    const [round] = await db
      .select()
      .from(schema.gameRoundsTable)
      .where(eq(schema.gameRoundsTable.id, roundId));

    if (!round) {
      throw new GameRoundError(`Round ${roundId} not found`, 404);
    }

    if (round.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const verification = await hashChain.verifyRound(serverSeed);

    // Update round's verified flag
    await db
      .update(schema.gameRoundsTable)
      .set({ verified: verification.verified })
      .where(eq(schema.gameRoundsTable.id, roundId));

    res.status(200).json(verification);
  },
);

export default router;
