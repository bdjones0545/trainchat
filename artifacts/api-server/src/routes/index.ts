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
import stripeRouter from "./stripe";
import sessionLogsRouter from "./session-logs";
import streakRouter from "./streak";
import adminRouter from "./admin";
import guestRouter from "./guest";
import trainingSystemRouter from "./training-system";

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
router.use(stripeRouter);
router.use(sessionLogsRouter);
router.use(streakRouter);
router.use(adminRouter);
router.use(guestRouter);
router.use(trainingSystemRouter);

export default router;
