/**
 * Wallet routes.
 *
 * GET /api/wallet       — current balance
 * GET /api/wallet/history — paginated transaction history
 */

import { Router, type Request, type Response } from "express";
import { GetWalletHistoryQueryParams } from "@workspace/api-zod";
import { validateQuery } from "../lib/validation";
import * as wallet from "../lib/wallet";

const router = Router();

/* ── Helpers ────────────────────────────────────────────────────────── */

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.user.id;
}

/* ── GET /api/wallet — Current balance ──────────────────────────────── */

router.get("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const balanceInfo = await wallet.getBalance(userId);
  res.status(200).json(balanceInfo);
});

/* ── GET /api/wallet/history — Paginated transaction history ────────── */

router.get(
  "/history",
  validateQuery(GetWalletHistoryQueryParams),
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const parsed = (req as any).parsedQuery ?? {};
    const limit = Math.min(Math.max(parsed.limit ?? 20, 1), 100);
    const page = Math.max(
      parsed.offset ? Math.floor(parsed.offset / limit) + 1 : 1,
      1,
    );

    const history = await wallet.getTransactionHistory(userId, page, limit);
    res.status(200).json(history.transactions);
  },
);

export default router;
