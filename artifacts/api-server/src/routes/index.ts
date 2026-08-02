import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import gamesRouter from "./games";
import promotionsRouter from "./promotions";
import winnersRouter from "./winners";
import statsRouter from "./stats";
import paymentsRouter from "./payments";
import eventsRouter from "./events";
import roundsRouter from "./rounds";
import walletRouter from "./wallet";
import demoWalletRouter from "./demo-wallet";
import fairnessRouter from "./fairness";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/games", gamesRouter);
router.use("/promotions", promotionsRouter);
router.use("/winners", winnersRouter);
router.use("/stats", statsRouter);
router.use("/payments", paymentsRouter);
router.use("/", eventsRouter);
router.use("/rounds", roundsRouter);
router.use("/wallet", walletRouter);
router.use("/demo/wallet", demoWalletRouter);
router.use("/fairness", fairnessRouter);

export default router;
