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
import trainingSystemEditRouter from "./training-system-edit";
import trainingSystemDirectionsRouter from "./training-system-directions";
import trainingSystemHistoryRouter from "./training-system-history";
import { exercisesRouter } from "./exercises";
import calibrateRouter from "./calibrate";
import exerciseLogsRouter from "./exercise-logs";
import neuralProfileRouter from "./neural-profile";
import predictionsRouter from "./predictions";
import blockIntelligenceRouter from "./block-intelligence";
import debugRouter from "./debug";
import supportRouter from "./support";
import activeSessionRouter from "./active-session";
import shareMomentsRouter from "./share-moments";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/api/client-error", (req, res): void => {
  const { message, stack, url, userAgent } = req.body ?? {};
  logger.error(
    { message, stack, url, userAgent },
    "client-error: browser rendering crash reported",
  );
  res.json({ ok: true });
});

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
router.use(trainingSystemEditRouter);
router.use(trainingSystemDirectionsRouter);
router.use(trainingSystemHistoryRouter);
router.use("/exercises", exercisesRouter);
router.use(calibrateRouter);
router.use(exerciseLogsRouter);
router.use(neuralProfileRouter);
router.use(predictionsRouter);
router.use(blockIntelligenceRouter);
router.use(debugRouter);
router.use(supportRouter);
router.use(activeSessionRouter);
router.use(shareMomentsRouter);

export default router;
