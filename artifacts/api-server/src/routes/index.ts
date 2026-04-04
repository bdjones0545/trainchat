import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import conversationsRouter from "./conversations";
import programsRouter from "./programs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(conversationsRouter);
router.use(programsRouter);

export default router;
