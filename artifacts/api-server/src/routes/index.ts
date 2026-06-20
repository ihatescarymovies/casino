import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import gamesRouter from "./games";
import promotionsRouter from "./promotions";
import winnersRouter from "./winners";
import statsRouter from "./stats";
import stripeRouter from "./stripe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/games", gamesRouter);
router.use("/promotions", promotionsRouter);
router.use("/winners", winnersRouter);
router.use("/stats", statsRouter);
router.use("/payments", stripeRouter);

export default router;
