import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import promotionsRouter from "./promotions";
import winnersRouter from "./winners";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/games", gamesRouter);
router.use("/promotions", promotionsRouter);
router.use("/winners", winnersRouter);
router.use("/stats", statsRouter);

export default router;
