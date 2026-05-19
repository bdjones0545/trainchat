import { Router, type IRouter } from "express";
import { db, whitepaperPublicationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/**
 * GET /api/whitepapers/published/:slug
 * Returns a single published whitepaper by slug.
 * Used by the frontend DynamicWhitepaperPage and DynamicPrintPage.
 */
router.get("/whitepapers/published/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params as { slug: string };

  const [pub] = await db
    .select()
    .from(whitepaperPublicationsTable)
    .where(eq(whitepaperPublicationsTable.slug, slug));

  if (!pub) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (pub.status !== "published") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ publication: pub });
});

/**
 * GET /api/whitepapers/published
 * Returns all published whitepapers (for hub + sitemap).
 */
router.get("/whitepapers/published", async (_req, res): Promise<void> => {
  const pubs = await db
    .select({
      id: whitepaperPublicationsTable.id,
      title: whitepaperPublicationsTable.title,
      slug: whitepaperPublicationsTable.slug,
      code: whitepaperPublicationsTable.code,
      subtitle: whitepaperPublicationsTable.subtitle,
      abstract: whitepaperPublicationsTable.abstract,
      keywords: whitepaperPublicationsTable.keywords,
      estimatedPages: whitepaperPublicationsTable.estimatedPages,
      publishedAt: whitepaperPublicationsTable.publishedAt,
      createdAt: whitepaperPublicationsTable.createdAt,
    })
    .from(whitepaperPublicationsTable)
    .where(eq(whitepaperPublicationsTable.status, "published"));

  res.json({ publications: pubs });
});

export default router;
