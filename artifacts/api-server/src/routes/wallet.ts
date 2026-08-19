/**
 * Wallet routes.
 *
 * GET /api/wallet       — current balance
 * GET /api/wallet/history — paginated transaction history
 */

import { Router, type Request, type Response } from "express";
import { GetWalletHistoryQueryParams } from "@workspace/api-zod";
import { validateQuery } from "../lib/validation";
import { requireAuth } from "../lib/auth-helpers";
import * as wallet from "../lib/wallet";

const router = Router();

/* ── GET /api/wallet — Current balance ──────────────────────────────── */

router.get("/", async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const balanceInfo = await wallet.getBalance(user.id);
  res.status(200).json(balanceInfo);
});

/* ── GET /api/wallet/history — Paginated transaction history ────────── */

router.get(
  "/history",
  validateQuery(GetWalletHistoryQueryParams),
  async (req: Request, res: Response) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const parsed = (req as any).parsedQuery ?? {};
    const limit = Math.min(Math.max(parsed.limit ?? 20, 1), 100);
    const page = Math.max(
      parsed.offset ? Math.floor(parsed.offset / limit) + 1 : 1,
      1,
    );

    const history = await wallet.getTransactionHistory(user.id, page, limit);
    res.status(200).json(history.transactions);
  },
);

export default router;
