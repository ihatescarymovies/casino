/**
 * Demo wallet routes.
 *
 * GET  /api/demo/wallet        — current demo balance
 * POST /api/demo/wallet/reset  — reset demo wallet to $100
 * GET  /api/demo/wallet/history — paginated demo transaction history
 */

import { Router, type Request, type Response } from "express";
import * as demoWallet from "../lib/demo-wallet";

const router = Router();

/* ── Helpers ────────────────────────────────────────────────────────── */

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ demo: true, error: "Unauthorized" });
    return null;
  }
  return req.user.id;
}

/* ── GET /api/demo/wallet — Current demo balance ──────────────────── */

router.get("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const balanceInfo = await demoWallet.getDemoBalance(userId);
  res.status(200).json(balanceInfo);
});

/* ── POST /api/demo/wallet/reset — Reset demo wallet ───────────────── */

router.post("/reset", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const result = await demoWallet.resetDemoWallet(userId);
  res.status(200).json(result);
});

/* ── GET /api/demo/wallet/history — Paginated transaction history ── */

router.get("/history", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rawLimit = parseInt(req.query.limit as string, 10);
  const rawOffset = parseInt(req.query.offset as string, 10);

  const limit = Number.isNaN(rawLimit)
    ? 20
    : Math.min(Math.max(rawLimit, 1), 100);
  const page =
    Number.isNaN(rawOffset) || rawOffset < 0
      ? 1
      : Math.floor(rawOffset / limit) + 1;

  const history = await demoWallet.getDemoTransactionHistory(
    userId,
    page,
    limit,
  );
  res.status(200).json(history);
});

export default router;
