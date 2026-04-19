import { Router, type IRouter } from "express";
import { db, shareMomentAuditTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const AuditBody = z.object({
  momentType: z.string(),
  triggerSource: z.string(),
  dataSource: z.string().optional(),
  shareCardGenerated: z.boolean().default(false),
  shareActionUsed: z.string().optional(),
  captionGenerated: z.boolean().default(false),
});

router.post("/share-moments/audit", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.session.userId as number;
    const body = AuditBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { momentType, triggerSource, dataSource, shareCardGenerated, shareActionUsed, captionGenerated } = body.data;

    await db.insert(shareMomentAuditTable).values({
      userId,
      momentType,
      triggerSource,
      dataSource: dataSource ?? null,
      shareCardGenerated,
      shareActionUsed: shareActionUsed ?? null,
      captionGenerated,
    });

    logger.info({ userId, momentType, triggerSource, shareActionUsed }, "[ShareMomentAudit] logged");
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "[ShareMomentAudit] failed to log");
    res.status(500).json({ error: "Failed to log share moment" });
  }
});

export default router;
