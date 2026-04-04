import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import conversationsRouter from "./conversations";
import programsRouter from "./programs";
import readinessRouter from "./readiness";
import sessionFeedbackRouter from "./session-feedback";
import memoriesRouter from "./memories";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(conversationsRouter);
router.use(programsRouter);
router.use(readinessRouter);
router.use(sessionFeedbackRouter);
router.use(memoriesRouter);
router.use(insightsRouter);

export default router;
