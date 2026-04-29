/**
 * Mutation Audit Receipt Routes
 *
 * GET /api/mutation-audit-receipts
 *   Returns recent mutation audit receipts for the authenticated user's
 *   active training system. Supports optional `?limit=` param.
 *
 * GET /api/mutation-audit-receipts/:id
 *   Returns a single receipt by ID (ownership-gated).
 *
 * GET /api/mutation-audit-receipts/failed
 *   Returns receipts where verificationStatus is "failed" — useful for
 *   surfacing mutations that didn't land.
 */

import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { getActiveTrainingSystem } from "../lib/training-system-service";
import {
  getReceiptsForSystem,
  getReceiptsForUser,
  getReceiptById,
  getFailedReceiptsForUser,
} from "../lib/mutation-audit-receipt-service";
import { logger } from "../lib/logger";

const router = Router();

// ─── GET /api/mutation-audit-receipts ─────────────────────────────────────────

router.get(
  "/api/mutation-audit-receipts",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    const limit = Math.min(Number(req.query.limit ?? 20), 100);

    try {
      const activeSystem = await getActiveTrainingSystem(userId);

      if (!activeSystem) {
        res.json({ receipts: [] });
        return;
      }

      const receipts = await getReceiptsForSystem(activeSystem.id, limit);

      res.json({
        receipts,
        trainingSystemId: activeSystem.id,
        count: receipts.length,
      });
    } catch (err) {
      logger.error(
        { err, userId },
        "[MutationAuditReceipts] GET /api/mutation-audit-receipts failed",
      );
      res.status(500).json({ error: "Failed to load audit receipts." });
    }
  },
);

// ─── GET /api/mutation-audit-receipts/failed ──────────────────────────────────

router.get(
  "/api/mutation-audit-receipts/failed",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    const limit = Math.min(Number(req.query.limit ?? 10), 50);

    try {
      const receipts = await getFailedReceiptsForUser(userId, limit);
      res.json({ receipts, count: receipts.length });
    } catch (err) {
      logger.error(
        { err, userId },
        "[MutationAuditReceipts] GET /api/mutation-audit-receipts/failed failed",
      );
      res.status(500).json({ error: "Failed to load failed receipts." });
    }
  },
);

// ─── GET /api/mutation-audit-receipts/:id ────────────────────────────────────

router.get(
  "/api/mutation-audit-receipts/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    const id = Number(req.params.id);

    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: "Invalid receipt ID." });
      return;
    }

    try {
      const receipt = await getReceiptById(id);

      if (!receipt) {
        res.status(404).json({ error: "Receipt not found." });
        return;
      }

      // Ownership guard — users can only view their own receipts
      if (receipt.userId !== userId) {
        res.status(403).json({ error: "Access denied." });
        return;
      }

      res.json({ receipt });
    } catch (err) {
      logger.error(
        { err, userId, receiptId: id },
        "[MutationAuditReceipts] GET /api/mutation-audit-receipts/:id failed",
      );
      res.status(500).json({ error: "Failed to load receipt." });
    }
  },
);

export default router;
