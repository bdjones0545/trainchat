import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Administrative authorization always requires an authenticated account and
 * an explicit, server-side email allowlist entry. Missing configuration fails
 * closed. Shared header secrets are intentionally not accepted.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const adminEmails = configuredAdminEmails();
  if (adminEmails.size === 0) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user?.email || !adminEmails.has(user.email.toLowerCase())) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
