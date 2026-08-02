import { Router } from "express";
import { z } from "zod";
import { verifyReceipt } from "../lib/fairness";
import { rateLimitMiddleware } from "../middleware/rate-limit";

const router = Router();
const receiptSchema = z.object({
  game: z.string().min(1),
  roundId: z.union([z.number(), z.string()]),
  timestamp: z.string().nullable(),
  serverSeedHash: z.string().length(64),
  clientSeed: z.string(),
  nonce: z.number().int(),
  outcome: z.string(),
});

/** Public verifier: it only checks the commitment, never requires login. */
router.post("/verify", rateLimitMiddleware, (req, res) => {
  const parsed = receiptSchema.safeParse(req.body?.receipt);
  const serverSeed = req.body?.serverSeed;
  if (
    !parsed.success ||
    typeof serverSeed !== "string" ||
    serverSeed.length === 0
  ) {
    res
      .status(400)
      .json({
        verified: false,
        error: "A receipt and revealed server seed are required.",
      });
    return;
  }
  const verification = verifyReceipt(parsed.data, serverSeed);
  res.status(200).json(verification);
});

export default router;
