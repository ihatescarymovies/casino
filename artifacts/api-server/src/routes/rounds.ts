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
import { createHash, timingSafeEqual } from "node:crypto";
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
import type { GameRoundData } from "../lib/game-engine";
import * as wallet from "../lib/wallet";
import * as demoWallet from "../lib/demo-wallet";
import { verifyReceipt } from "../lib/fairness";

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

      // Auto-resolve instant games (slots, dice, plinko, roulette)
      // so the round status is "completed" before the client verifies fairness.
      let resolvedData: GameRoundData | undefined;
      if (engine.config.instant) {
        resolvedData = await engine.resolveRound(roundData.roundId);
      }

      const balanceAfter = await wallet.getBalance(userId);
      balanceInfo = { balance: balanceAfter.balance };
      roundData = resolvedData ?? roundData;
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

  res.status(200).json({
    ...round,
    receipt:
      round.status === "completed"
        ? {
            game: round.gameType,
            roundId: round.id,
            timestamp: round.createdAt?.toISOString() ?? null,
            serverSeedHash: round.serverSeedHash,
            clientSeed: round.clientSeed,
            nonce: round.nonce,
            outcome: round.result,
            details: round.details,
            payout: round.payout,
          }
        : null,
  });
});

/* ── GET /api/rounds/:id/receipt — player-facing fairness receipt ───── */
router.get("/:id/receipt", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const roundId = Number(req.params.id);
  if (!Number.isInteger(roundId)) {
    res.status(400).json({ error: "Invalid round ID" });
    return;
  }
  const [round] = await db
    .select()
    .from(schema.gameRoundsTable)
    .where(eq(schema.gameRoundsTable.id, roundId));
  if (!round) {
    res.status(404).json({ error: "Round not found" });
    return;
  }
  if (round.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (round.status !== "completed") {
    res.status(409).json({ error: "Receipt is available after settlement" });
    return;
  }
  res.status(200).json({
    game: round.gameType,
    roundId: round.id,
    timestamp: round.createdAt?.toISOString() ?? null,
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    outcome: round.result,
    details: round.details,
    payout: round.payout,
  });
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

/* ── GET /api/rounds/:id/fairness — Sanitized fairness data ─────────── */
router.get("/:id/fairness", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const roundId = Number(req.params.id);
  if (!Number.isSafeInteger(roundId) || roundId < 1) {
    res.status(400).json({ error: "Invalid round ID" });
    return;
  }
  const [round] = await db
    .select()
    .from(schema.gameRoundsTable)
    .where(eq(schema.gameRoundsTable.id, roundId));
  if (!round) throw new GameRoundError(`Round ${roundId} not found`, 404);
  if (round.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [chain] = round.serverSeedHash
    ? await db
        .select()
        .from(schema.hashChainsTable)
        .where(eq(schema.hashChainsTable.serverSeedHash, round.serverSeedHash))
    : [];
  const resolved = round.status !== "pending" && round.result !== "pending";
  res.status(200).json({
    roundId: round.id,
    gameType: round.gameType,
    status: round.status,
    demo: round.isDemo ?? false,
    commitment: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    chain: chain ? { id: chain.id, previousHash: chain.previousHash } : null,
    serverSeed: resolved ? (chain?.serverSeed ?? null) : null,
    params: round.details,
    result: resolved ? round.result : null,
    payout: resolved ? round.payout : null,
    algorithm: { name: "commitment-sha256", version: "1", replay: false },
  });
});

/* ── POST /api/rounds/:id/verify — Verify fairness ─────────────────── */
router.post(
  "/:id/verify",
  validate(VerifyRoundBody),
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const roundId = Number(req.params.id); // URL is canonical; body roundId is ignored.
    if (!Number.isSafeInteger(roundId) || roundId < 1) {
      res.status(400).json({ error: "Invalid round ID" });
      return;
    }
    const [round] = await db
      .select()
      .from(schema.gameRoundsTable)
      .where(eq(schema.gameRoundsTable.id, roundId));
    if (!round) throw new GameRoundError(`Round ${roundId} not found`, 404);
    if (round.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { serverSeed } = req.body;
    if (
      typeof serverSeed !== "string" ||
      serverSeed.length < 1 ||
      serverSeed.length > 128
    ) {
      res.status(400).json({ error: "Invalid server seed" });
      return;
    }
    const computedHash = createHash("sha256")
      .update(serverSeed, "utf8")
      .digest("hex");
    const expectedHash = round.serverSeedHash ?? "";
    const commitmentMatch =
      computedHash.length === expectedHash.length &&
      timingSafeEqual(Buffer.from(computedHash), Buffer.from(expectedHash));
    const [chain] = await db
      .select()
      .from(schema.hashChainsTable)
      .where(eq(schema.hashChainsTable.serverSeed, serverSeed));
    // Hash-chain seeds are encoded as gameType:chainId:index:random. The
    // round's nonce is assigned from that index in game-engine.ts; it is not
    // a value embedded in the seed as an independent game-round nonce.
    const seedParts = chain?.serverSeed.split(":");
    const parsedIndex = seedParts?.length === 4 ? Number(seedParts[2]) : NaN;
    const fieldMatches = {
      game: seedParts?.length === 4 && seedParts[0] === round.gameType,
      nonce:
        Number.isSafeInteger(parsedIndex) && parsedIndex === (round.nonce ?? 0),
    };
    const chainMatch = Boolean(chain && chain.serverSeedHash === expectedHash);
    const verified =
      commitmentMatch && chainMatch && fieldMatches.game && fieldMatches.nonce;
    await db
      .update(schema.gameRoundsTable)
      .set({ verified })
      .where(eq(schema.gameRoundsTable.id, roundId));
    res.status(200).json({
      verified,
      commitmentMatch,
      chainMatch,
      fieldMatches,
      computedHash,
      expectedHash,
      replay: { implemented: false, resultMatch: null, payoutMatch: null },
      warnings: [
        "Commitment and encoded game/index checks passed; deterministic game replay is not implemented yet.",
        "The database does not persist the encoded chain ID on the round, so chain ID continuity is not validated.",
      ],
    });
  },
);

export default router;
