// ─── Research Discovery Service ───────────────────────────────────────────────
//
// Automated pipeline that searches peer-reviewed paper sources (PubMed,
// Semantic Scholar, Crossref), normalises results, deduplicates, stores them
// as candidates, and runs the Librarian Agent for pre-screening.
//
// Safety invariant: candidates NEVER become retrievable by the Coach without
//   1. Librarian evaluation (status: pending_admin)
//   2. Explicit admin approval (creates research_documents row, is_active = true)
//
// Invoked by:
//   - POST /api/admin/research/discovery/run  (manual trigger)
//   - Startup schedule check when RESEARCH_DISCOVERY_ENABLED=true
//
// Logs:
//   [ResearchDiscovery] run started
//   [ResearchDiscovery] source search complete
//   [ResearchDiscovery] candidate stored
//   [ResearchDiscovery] duplicate skipped
//   [ResearchDiscovery] librarian reviewed
//   [ResearchDiscovery] run complete
//   [ResearchDiscovery] error

import { db, researchDocumentsTable, researchPaperCandidatesTable, researchDiscoveryRunsTable } from "@workspace/db";
import type { ResearchCategory } from "@workspace/db";
import { eq, or, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { captureWithTags } from "../lib/sentry";
import { reviewResearchCandidate } from "./research-librarian-agent";
import type { ResearchCandidate } from "./research-librarian-agent";

// ─── Config ──────────────────────────────────────────────────────────────────

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const SEMANTIC_SCHOLAR_BASE = "https://api.semanticscholar.org/graph/v1";
const CROSSREF_BASE = "https://api.crossref.org";

const MAX_RESULTS_PER_QUERY = 8;
const REQUEST_DELAY_MS = 500;

// ─── Discovery Query Definitions ─────────────────────────────────────────────

interface DiscoveryQuery {
  query: string;
  label: string;
  category: ResearchCategory;
}

const DISCOVERY_QUERIES: DiscoveryQuery[] = [
  // Hypertrophy
  { query: "resistance training hypertrophy meta-analysis", label: "Hypertrophy", category: "strength_conditioning" },
  { query: "muscle hypertrophy volume frequency resistance training", label: "Hypertrophy", category: "strength_conditioning" },
  // Strength
  { query: "resistance training strength progression meta-analysis", label: "Strength", category: "strength_conditioning" },
  { query: "strength training periodization systematic review", label: "Strength", category: "strength_conditioning" },
  // Speed / Power
  { query: "sprint acceleration training systematic review", label: "Speed/Power", category: "sport_performance" },
  { query: "plyometric training meta-analysis athletes", label: "Speed/Power", category: "sport_performance" },
  { query: "force velocity profiling sprint athletes", label: "Speed/Power", category: "sport_performance" },
  // Tendon / Overuse
  { query: "patellar tendinopathy exercise systematic review", label: "Tendon", category: "medical_rehab" },
  { query: "Achilles tendinopathy loading systematic review", label: "Tendon", category: "medical_rehab" },
  { query: "tendon rehabilitation resistance training review", label: "Tendon", category: "medical_rehab" },
  // Knee / Return to Training
  { query: "ACL return to sport criteria systematic review", label: "Knee/RTT", category: "medical_rehab" },
  { query: "patellofemoral pain exercise therapy systematic review", label: "Knee", category: "medical_rehab" },
  { query: "knee pain return to sport strength training", label: "Knee", category: "medical_rehab" },
  // Conditioning
  { query: "high intensity interval training endurance systematic review", label: "Conditioning", category: "strength_conditioning" },
  { query: "concurrent training interference meta-analysis", label: "Conditioning", category: "strength_conditioning" },
  { query: "zone 2 endurance training adaptations", label: "Conditioning", category: "recovery_wellness" },
  // Recovery / Fatigue
  { query: "HRV training readiness systematic review", label: "Recovery", category: "recovery_wellness" },
  { query: "resistance training recovery fatigue monitoring", label: "Recovery", category: "recovery_wellness" },
  { query: "sleep recovery athletic performance review", label: "Recovery", category: "recovery_wellness" },
  // Youth / Older Adults
  { query: "youth resistance training systematic review", label: "Youth", category: "strength_conditioning" },
  { query: "older adults resistance training meta-analysis", label: "Older Adults", category: "strength_conditioning" },
];

// ─── Raw Paper Shape ──────────────────────────────────────────────────────────

interface RawPaper {
  title: string;
  authors: string;
  year: number | null;
  journal: string | null;
  doi: string | null;
  pubmedId: string | null;
  semanticScholarId: string | null;
  abstract: string | null;
  sourceUrl: string | null;
  sourceApi: string;
  citationCount: number | null;
  publicationTypes: string[];
  discoveryQuery: string;
  category: ResearchCategory;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractXmlText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null;
}

function extractXmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) results.push(text);
  }
  return results;
}

function extractXmlAttr(xml: string, tag: string, attr: string, attrValue: string): string | null {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']${attrValue}["'][^>]*>([^<]*)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// ─── PubMed Source ────────────────────────────────────────────────────────────

async function searchPubMed(dq: DiscoveryQuery): Promise<RawPaper[]> {
  const email = process.env.PUBMED_EMAIL ?? "research@trainchat.app";
  const apiKey = process.env.PUBMED_API_KEY ?? "";

  try {
    // Step 1: Search for IDs
    const searchParams = new URLSearchParams({
      db: "pubmed",
      term: `(${dq.query}) AND (systematic review[pt] OR meta-analysis[pt] OR review[pt])`,
      retmax: String(MAX_RESULTS_PER_QUERY),
      retmode: "json",
      email,
      ...(apiKey ? { api_key: apiKey } : {}),
    });
    const searchRes = await fetch(`${PUBMED_BASE}/esearch.fcgi?${searchParams}`);
    if (!searchRes.ok) throw new Error(`PubMed esearch HTTP ${searchRes.status}`);
    const searchJson = (await searchRes.json()) as {
      esearchresult?: { idlist?: string[] };
    };
    const ids: string[] = searchJson.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    await sleep(REQUEST_DELAY_MS);

    // Step 2: Fetch abstracts via XML
    const fetchParams = new URLSearchParams({
      db: "pubmed",
      id: ids.join(","),
      rettype: "xml",
      retmode: "xml",
      email,
      ...(apiKey ? { api_key: apiKey } : {}),
    });
    const fetchRes = await fetch(`${PUBMED_BASE}/efetch.fcgi?${fetchParams}`);
    if (!fetchRes.ok) throw new Error(`PubMed efetch HTTP ${fetchRes.status}`);
    const xml = await fetchRes.text();

    return parsePubMedXml(xml, dq);
  } catch (err: any) {
    logger.warn({ err: err.message, query: dq.query }, "[ResearchDiscovery] PubMed search error");
    return [];
  }
}

function parsePubMedXml(xml: string, dq: DiscoveryQuery): RawPaper[] {
  const articleBlocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/gi) ?? [];
  const papers: RawPaper[] = [];

  for (const block of articleBlocks) {
    try {
      const title = extractXmlText(block, "ArticleTitle") ?? "";
      if (!title) continue;

      // Abstract — may be structured with multiple <AbstractText> sections
      const abstractParts = extractXmlAll(block, "AbstractText");
      const abstract = abstractParts.join(" ").trim() || null;

      // PMID
      const pmidBlock = block.match(/<MedlineCitation[^>]*>[\s\S]*?<PMID[^>]*>(\d+)<\/PMID>/i);
      const pubmedId = pmidBlock ? pmidBlock[1] : null;

      // DOI
      const doi = extractXmlAttr(block, "ArticleId", "IdType", "doi");

      // Journal
      const journal = extractXmlText(block, "Title") ?? null; // Journal <Title>

      // Year — try various locations
      let year: number | null = null;
      const pubDateBlock = block.match(/<PubDate>[\s\S]*?<\/PubDate>/i)?.[0] ?? "";
      const yearStr = extractXmlText(pubDateBlock, "Year");
      if (yearStr) year = parseInt(yearStr, 10) || null;

      // Authors
      const lastNames = extractXmlAll(block, "LastName").slice(0, 5);
      const authors = lastNames.length > 0
        ? lastNames.join(", ") + (lastNames.length === 5 ? " et al." : "")
        : "Unknown Authors";

      // Publication types
      const pubTypes = extractXmlAll(block, "PublicationType");

      // Source URL
      const sourceUrl = pubmedId ? `https://pubmed.ncbi.nlm.nih.gov/${pubmedId}/` : null;

      papers.push({
        title,
        authors,
        year,
        journal,
        doi,
        pubmedId,
        semanticScholarId: null,
        abstract,
        sourceUrl,
        sourceApi: "pubmed",
        citationCount: null,
        publicationTypes: pubTypes,
        discoveryQuery: dq.query,
        category: dq.category,
      });
    } catch {
      continue;
    }
  }

  return papers;
}

// ─── Semantic Scholar Source ──────────────────────────────────────────────────

async function searchSemanticScholar(dq: DiscoveryQuery): Promise<RawPaper[]> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY ?? "";
  const headers: Record<string, string> = {
    "User-Agent": "TrainChat-ResearchDiscovery/1.0 (research@trainchat.app)",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const params = new URLSearchParams({
      query: dq.query,
      fields: "title,authors,year,abstract,externalIds,citationCount,publicationTypes,venue,journal",
      limit: String(MAX_RESULTS_PER_QUERY),
    });
    const res = await fetch(`${SEMANTIC_SCHOLAR_BASE}/paper/search?${params}`, { headers });
    if (!res.ok) {
      if (res.status === 429) {
        logger.warn({ query: dq.query }, "[ResearchDiscovery] Semantic Scholar rate limited");
        return [];
      }
      throw new Error(`Semantic Scholar HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: {
        paperId: string;
        title: string;
        authors?: { name: string }[];
        year?: number;
        abstract?: string;
        externalIds?: { DOI?: string; PubMed?: string };
        citationCount?: number;
        publicationTypes?: string[];
        venue?: string;
        journal?: { name?: string };
      }[];
    };

    const papers: RawPaper[] = [];
    for (const p of json.data ?? []) {
      if (!p.title) continue;
      const authorNames = (p.authors ?? []).slice(0, 5).map((a) => a.name);
      const doi = p.externalIds?.DOI ?? null;
      const pubmedId = p.externalIds?.PubMed ?? null;
      const journal = p.journal?.name ?? p.venue ?? null;

      papers.push({
        title: p.title,
        authors: authorNames.length > 0
          ? authorNames.join(", ") + (authorNames.length === 5 ? " et al." : "")
          : "Unknown Authors",
        year: p.year ?? null,
        journal,
        doi,
        pubmedId,
        semanticScholarId: p.paperId,
        abstract: p.abstract ?? null,
        sourceUrl: `https://www.semanticscholar.org/paper/${p.paperId}`,
        sourceApi: "semantic_scholar",
        citationCount: p.citationCount ?? null,
        publicationTypes: p.publicationTypes ?? [],
        discoveryQuery: dq.query,
        category: dq.category,
      });
    }
    return papers;
  } catch (err: any) {
    logger.warn({ err: err.message, query: dq.query }, "[ResearchDiscovery] Semantic Scholar search error");
    return [];
  }
}

// ─── Crossref Enrichment ──────────────────────────────────────────────────────

async function enrichWithCrossref(doi: string): Promise<{ journal?: string; year?: number; authors?: string } | null> {
  try {
    const res = await fetch(`${CROSSREF_BASE}/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": "TrainChat-ResearchDiscovery/1.0 (research@trainchat.app)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      message?: {
        "container-title"?: string[];
        "published-print"?: { "date-parts"?: number[][] };
        "published-online"?: { "date-parts"?: number[][] };
        author?: { given?: string; family?: string }[];
      };
    };
    const msg = json.message;
    if (!msg) return null;

    const journal = msg["container-title"]?.[0] ?? undefined;
    const dateParts =
      msg["published-print"]?.["date-parts"]?.[0] ??
      msg["published-online"]?.["date-parts"]?.[0];
    const year = dateParts?.[0] ?? undefined;
    const authorList = (msg.author ?? [])
      .slice(0, 5)
      .map((a) => [a.given, a.family].filter(Boolean).join(" "))
      .filter(Boolean);
    const authors = authorList.length > 0
      ? authorList.join(", ") + (msg.author && msg.author.length > 5 ? " et al." : "")
      : undefined;

    return { journal, year, authors };
  } catch {
    return null;
  }
}

// ─── Deduplication ───────────────────────────────────────────────────────────

interface DeduplicationResult {
  isDuplicate: boolean;
  duplicateOfDocumentId?: number;
  reason?: string;
}

async function checkDuplicate(paper: RawPaper): Promise<DeduplicationResult> {
  // 1. Check research_documents (approved library)
  if (paper.doi) {
    const [existing] = await db
      .select({ id: researchDocumentsTable.id })
      .from(researchDocumentsTable)
      .where(eq(researchDocumentsTable.doi, paper.doi))
      .limit(1);
    if (existing) return { isDuplicate: true, duplicateOfDocumentId: existing.id, reason: "doi_in_library" };
  }

  // 2. Check candidates table — DOI
  if (paper.doi) {
    const [existing] = await db
      .select({ id: researchPaperCandidatesTable.id })
      .from(researchPaperCandidatesTable)
      .where(eq(researchPaperCandidatesTable.doi, paper.doi))
      .limit(1);
    if (existing) return { isDuplicate: true, reason: "doi_in_candidates" };
  }

  // 3. Check candidates table — PubMed ID
  if (paper.pubmedId) {
    const [existing] = await db
      .select({ id: researchPaperCandidatesTable.id })
      .from(researchPaperCandidatesTable)
      .where(eq(researchPaperCandidatesTable.pubmedId, paper.pubmedId))
      .limit(1);
    if (existing) return { isDuplicate: true, reason: "pubmed_id_in_candidates" };
  }

  // 4. Check candidates table — Semantic Scholar ID
  if (paper.semanticScholarId) {
    const [existing] = await db
      .select({ id: researchPaperCandidatesTable.id })
      .from(researchPaperCandidatesTable)
      .where(eq(researchPaperCandidatesTable.semanticScholarId, paper.semanticScholarId))
      .limit(1);
    if (existing) return { isDuplicate: true, reason: "ss_id_in_candidates" };
  }

  // 5. Normalised title match against candidates
  const normalised = normalizeTitle(paper.title);
  const [byTitle] = await db
    .select({ id: researchPaperCandidatesTable.id, title: researchPaperCandidatesTable.title })
    .from(researchPaperCandidatesTable)
    .where(sql`lower(regexp_replace(${researchPaperCandidatesTable.title}, '[^a-z0-9 ]', '', 'gi')) = ${normalised}`)
    .limit(1);
  if (byTitle) return { isDuplicate: true, reason: "title_normalised_in_candidates" };

  return { isDuplicate: false };
}

// ─── Candidate Filters ────────────────────────────────────────────────────────

function shouldSkipPaper(paper: RawPaper): string | null {
  if (!paper.abstract || paper.abstract.trim().length < 80) return "no_abstract";
  if (!paper.doi && !paper.pubmedId && !paper.semanticScholarId) return "no_identifier";
  if (!paper.title || paper.title.trim().length < 10) return "no_title";

  const lowerTitle = paper.title.toLowerCase();
  if (
    lowerTitle.includes("retraction") ||
    lowerTitle.includes("erratum") ||
    lowerTitle.includes("correction in")
  ) {
    return "retracted";
  }

  // Skip pure supplement/nutrition papers unless relevant
  const nutritionOnlyKeywords = [
    "protein supplement", "creatine supplement", "caffeine supplementation",
    "vitamin d supplement", "omega 3 supplement",
  ];
  if (nutritionOnlyKeywords.some((kw) => lowerTitle.includes(kw))) {
    return "supplement_only";
  }

  return null;
}

// ─── Run Statistics ───────────────────────────────────────────────────────────

interface RunStats {
  candidatesFound: number;
  candidatesStored: number;
  duplicatesSkipped: number;
  librarianReviewed: number;
  approvedSuggested: number;
  needsReview: number;
  rejected: number;
  errors: string[];
}

// ─── Main Discovery Orchestrator ──────────────────────────────────────────────

export interface DiscoveryRunResult {
  runId: number;
  status: "completed" | "failed";
  stats: RunStats;
  duration: number;
}

export async function runDiscovery(opts?: {
  queries?: DiscoveryQuery[];
  skipLibrarian?: boolean;
}): Promise<DiscoveryRunResult> {
  const startedAt = Date.now();
  const queries = opts?.queries ?? DISCOVERY_QUERIES;
  const skipLibrarian = opts?.skipLibrarian ?? false;

  logger.info(
    { queryCount: queries.length, skipLibrarian },
    "[ResearchDiscovery] run started",
  );

  const stats: RunStats = {
    candidatesFound: 0,
    candidatesStored: 0,
    duplicatesSkipped: 0,
    librarianReviewed: 0,
    approvedSuggested: 0,
    needsReview: 0,
    rejected: 0,
    errors: [],
  };

  // Create run record
  const [runRow] = await db
    .insert(researchDiscoveryRunsTable)
    .values({
      status: "running",
      source: "pubmed,semantic_scholar",
      querySet: queries.map((q) => q.query),
    })
    .returning();
  const runId = runRow.id;

  try {
    // ── Phase 1: Search all sources ────────────────────────────────────────────
    const storedCandidateIds: number[] = [];

    for (const dq of queries) {
      await sleep(REQUEST_DELAY_MS);

      // Search PubMed
      const pubmedPapers = await searchPubMed(dq);
      logger.info(
        { query: dq.query, count: pubmedPapers.length },
        "[ResearchDiscovery] source search complete",
      );

      await sleep(REQUEST_DELAY_MS);

      // Search Semantic Scholar
      const ssPapers = await searchSemanticScholar(dq);
      logger.info(
        { query: dq.query, count: ssPapers.length },
        "[ResearchDiscovery] source search complete",
      );

      const allPapers = [...pubmedPapers, ...ssPapers];
      stats.candidatesFound += allPapers.length;

      for (const paper of allPapers) {
        try {
          // Apply pre-filters
          const skipReason = shouldSkipPaper(paper);
          if (skipReason) {
            logger.debug({ title: paper.title, reason: skipReason }, "[ResearchDiscovery] candidate filtered");
            continue;
          }

          // Enrich with Crossref if DOI available
          if (paper.doi) {
            await sleep(200);
            const enriched = await enrichWithCrossref(paper.doi);
            if (enriched) {
              if (enriched.journal && !paper.journal) paper.journal = enriched.journal;
              if (enriched.year && !paper.year) paper.year = enriched.year;
              if (enriched.authors && paper.authors === "Unknown Authors") paper.authors = enriched.authors;
            }
          }

          // Prefer papers from last 10 years (but don't discard older foundational work)
          const currentYear = new Date().getFullYear();
          const paperYear = paper.year ?? currentYear;
          const isOlderThan10Years = paperYear < currentYear - 10;

          // Deduplicate
          const dupCheck = await checkDuplicate(paper);
          if (dupCheck.isDuplicate) {
            logger.info(
              { title: paper.title, reason: dupCheck.reason },
              "[ResearchDiscovery] duplicate skipped",
            );
            stats.duplicatesSkipped++;
            continue;
          }

          // Store candidate
          const [inserted] = await db
            .insert(researchPaperCandidatesTable)
            .values({
              title: paper.title,
              authors: paper.authors,
              year: paper.year,
              journal: paper.journal,
              doi: paper.doi,
              pubmedId: paper.pubmedId,
              semanticScholarId: paper.semanticScholarId,
              abstract: paper.abstract,
              sourceUrl: paper.sourceUrl,
              sourceApi: paper.sourceApi,
              category: paper.category,
              discoveryQuery: paper.discoveryQuery,
              citationCount: paper.citationCount,
              publicationTypes: paper.publicationTypes,
              status: "discovered",
              warningFlags: isOlderThan10Years ? ["old_evidence"] : [],
            })
            .returning();

          logger.info(
            { id: inserted.id, title: paper.title },
            "[ResearchDiscovery] candidate stored",
          );
          stats.candidatesStored++;
          storedCandidateIds.push(inserted.id);
        } catch (err: any) {
          logger.error({ err: err.message, title: paper.title }, "[ResearchDiscovery] error storing candidate");
          captureWithTags(err, { subsystem: "research_discovery", feature: "store_candidate" });
          stats.errors.push(`store_error: ${paper.title.substring(0, 60)} — ${err.message}`);
        }
      }
    }

    // ── Phase 2: Librarian evaluation ─────────────────────────────────────────
    if (!skipLibrarian && storedCandidateIds.length > 0) {
      logger.info(
        { count: storedCandidateIds.length },
        "[ResearchDiscovery] starting librarian review",
      );

      for (const candidateId of storedCandidateIds) {
        try {
          const [candidate] = await db
            .select()
            .from(researchPaperCandidatesTable)
            .where(eq(researchPaperCandidatesTable.id, candidateId));

          if (!candidate) continue;

          const librarianInput: ResearchCandidate = {
            title: candidate.title,
            authors: candidate.authors ?? undefined,
            year: candidate.year ?? undefined,
            source: candidate.sourceApi ?? "unknown",
            journal: candidate.journal ?? undefined,
            url: candidate.sourceUrl ?? undefined,
            doi: candidate.doi ?? undefined,
            abstract: candidate.abstract ?? undefined,
            category: candidate.category,
          };

          const outcome = await reviewResearchCandidate(librarianInput);

          if (!outcome.ok || !outcome.result) {
            stats.errors.push(`librarian_error: candidate#${candidateId} — ${outcome.error ?? "no result"}`);
            continue;
          }

          const result = outcome.result;
          let newStatus: "librarian_reviewed" | "pending_admin" | "rejected";

          if (result.recommendation === "reject") {
            newStatus = "rejected";
            stats.rejected++;
          } else {
            newStatus = "pending_admin";
            if (result.recommendation === "approve") stats.approvedSuggested++;
            else stats.needsReview++;
          }

          await db
            .update(researchPaperCandidatesTable)
            .set({
              status: newStatus,
              librarianRecommendation: result.recommendation,
              trustLevel: result.trustLevel === "reject" ? "supporting" : result.trustLevel,
              confidence: result.confidence,
              warningFlags: result.warningFlags,
              librarianNotes: result.adminNotes,
              updatedAt: new Date(),
            })
            .where(eq(researchPaperCandidatesTable.id, candidateId));

          logger.info(
            { candidateId, recommendation: result.recommendation },
            "[ResearchDiscovery] librarian reviewed",
          );
          stats.librarianReviewed++;

          await sleep(300);
        } catch (err: any) {
          logger.error({ err: err.message, candidateId }, "[ResearchDiscovery] librarian error");
          captureWithTags(err, { subsystem: "research_discovery", feature: "librarian_review" });
          stats.errors.push(`librarian_error: candidate#${candidateId} — ${err.message}`);
        }
      }
    }

    // ── Finalise run record ────────────────────────────────────────────────────
    await db
      .update(researchDiscoveryRunsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        candidatesFound: stats.candidatesFound,
        candidatesStored: stats.candidatesStored,
        duplicatesSkipped: stats.duplicatesSkipped,
        librarianReviewed: stats.librarianReviewed,
        approvedSuggested: stats.approvedSuggested,
        needsReview: stats.needsReview,
        rejected: stats.rejected,
        errors: stats.errors,
      })
      .where(eq(researchDiscoveryRunsTable.id, runId));

    const duration = Date.now() - startedAt;
    logger.info({ runId, duration, stats }, "[ResearchDiscovery] run complete");

    return { runId, status: "completed", stats, duration };
  } catch (err: any) {
    logger.error({ err: err.message, runId }, "[ResearchDiscovery] run failed");
    captureWithTags(err, { subsystem: "research_discovery", feature: "run_fatal" });
    stats.errors.push(`fatal: ${err.message}`);

    await db
      .update(researchDiscoveryRunsTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        errors: stats.errors,
        candidatesFound: stats.candidatesFound,
        candidatesStored: stats.candidatesStored,
      })
      .where(eq(researchDiscoveryRunsTable.id, runId));

    return { runId, status: "failed", stats, duration: Date.now() - startedAt };
  }
}

// ─── Startup Auto-Schedule ────────────────────────────────────────────────────
//
// When RESEARCH_DISCOVERY_ENABLED=true the service checks on startup whether
// a discovery run is overdue (> 7 days since last completed run). If so it
// kicks off a background run. The check is also repeated every 24 hours.
//
// For a full cron expression ("0 6 * * 1" etc.) integrate an external
// scheduler or use a cron service to hit POST /api/admin/research/discovery/run.

export function startDiscoveryScheduler(): void {
  const enabled = process.env.RESEARCH_DISCOVERY_ENABLED === "true";
  if (!enabled) {
    logger.info("[ResearchDiscovery] scheduler disabled (RESEARCH_DISCOVERY_ENABLED != true)");
    return;
  }

  const checkAndRun = async () => {
    try {
      const [lastRun] = await db
        .select({ completedAt: researchDiscoveryRunsTable.completedAt, status: researchDiscoveryRunsTable.status })
        .from(researchDiscoveryRunsTable)
        .where(eq(researchDiscoveryRunsTable.status, "completed"))
        .orderBy(desc(researchDiscoveryRunsTable.completedAt))
        .limit(1);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const isOverdue = !lastRun?.completedAt || lastRun.completedAt < sevenDaysAgo;

      if (isOverdue) {
        logger.info("[ResearchDiscovery] scheduled run triggered (overdue)");
        runDiscovery().catch((err: Error) => {
          logger.error({ err: err.message }, "[ResearchDiscovery] scheduled run error");
          captureWithTags(err, { subsystem: "research_discovery", feature: "scheduled_run" });
        });
      }
    } catch (err: any) {
      logger.error({ err: err.message }, "[ResearchDiscovery] scheduler check error");
      captureWithTags(err, { subsystem: "research_discovery", feature: "scheduler_check" });
    }
  };

  // Run check once on startup (after 60s to let server stabilise)
  setTimeout(checkAndRun, 60_000);

  // Repeat every 24 hours
  setInterval(checkAndRun, 24 * 60 * 60 * 1000);

  logger.info("[ResearchDiscovery] scheduler started (weekly check)");
}

// ─── Approve Candidate → Create Research Document ─────────────────────────────

export async function approveCandidateAsDocument(candidateId: number): Promise<{
  ok: boolean;
  documentId?: number;
  error?: string;
}> {
  const [candidate] = await db
    .select()
    .from(researchPaperCandidatesTable)
    .where(eq(researchPaperCandidatesTable.id, candidateId));

  if (!candidate) return { ok: false, error: "Candidate not found" };
  if (candidate.status === "approved") return { ok: false, error: "Already approved" };
  if (candidate.status === "rejected") return { ok: false, error: "Candidate was rejected" };

  try {
    // Map trust level (reject → supporting for storage safety)
    const trustLevel =
      candidate.trustLevel === "reject" || !candidate.trustLevel ? "supporting" :
      (candidate.trustLevel as "gold" | "high" | "supporting");

    const confidence =
      (candidate.confidence as "strong" | "moderate" | "limited" | "conflicting" | null) ?? "moderate";

    // Create research_documents row — inactive until after Librarian chunks
    const [doc] = await db
      .insert(researchDocumentsTable)
      .values({
        title: candidate.title,
        authors: candidate.authors,
        year: candidate.year,
        source: candidate.sourceApi ?? "discovery",
        journal: candidate.journal,
        url: candidate.sourceUrl,
        doi: candidate.doi,
        category: candidate.category,
        abstract: candidate.abstract,
        topicTags: [],
        populationTags: [],
        trustLevel,
        confidence,
        status: "approved",
        isActive: true,
        librarianRecommendation: candidate.librarianRecommendation as "approve" | "reject" | "needs_review" | null,
        warningFlags: candidate.warningFlags,
        librarianAdminNotes: candidate.librarianNotes,
        lastReviewedAt: new Date(),
      })
      .returning();

    // Mark candidate approved
    await db
      .update(researchPaperCandidatesTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(researchPaperCandidatesTable.id, candidateId));

    logger.info(
      { candidateId, documentId: doc.id },
      "[ResearchDiscovery] candidate approved — document created",
    );

    return { ok: true, documentId: doc.id };
  } catch (err: any) {
    logger.error({ err: err.message, candidateId }, "[ResearchDiscovery] approve error");
    return { ok: false, error: err.message };
  }
}

// ─── Reject Candidate ─────────────────────────────────────────────────────────

export async function rejectCandidate(candidateId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await db
      .update(researchPaperCandidatesTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(researchPaperCandidatesTable.id, candidateId))
      .returning({ id: researchPaperCandidatesTable.id });

    if (result.length === 0) return { ok: false, error: "Candidate not found" };

    logger.info({ candidateId }, "[ResearchDiscovery] candidate rejected");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
