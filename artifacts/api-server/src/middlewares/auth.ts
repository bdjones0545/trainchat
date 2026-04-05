import { type Request, type Response, type NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({
      error: "Your session has expired. Please sign in again.",
      reason: "session_expired",
    });
    return;
  }
  next();
}
