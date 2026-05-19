import { useEffect, useState } from "react";
import { useParams } from "wouter";
import WhitepaperPrintLayout from "./WhitepaperPrintLayout";

// ─── Local types (mirrors DB JSON shapes) ─────────────────────────────────────

interface Section {
  number: string;
  heading: string;
  content: string[];
  pullQuote?: string;
}

interface CitationBlock {
  formatted: string;
  related: string[];
  framework?: string[];
  canonicalUrl: string;
}

interface Publication {
  id: number;
  title: string;
  slug: string;
  code: string;
  subtitle: string | null;
  abstract: string | null;
  bodyJson: Section[] | null;
  keywords: string[] | null;
  estimatedPages: string | null;
  publishedAt: string | null;
  citationsJson: CitationBlock | null;
  seoMetadataJson: {
    metaTitle: string;
    metaDescription: string;
    ogTitle: string;
    ogDescription: string;
  } | null;
}

export default function DynamicPrintPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [pub, setPub] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/whitepapers/published/${slug}`, { credentials: "include" })
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json() as Promise<{ publication: Publication }>;
      })
      .then((data) => {
        if (data?.publication) setPub(data.publication);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui", color: "#666" }}>
        Loading…
      </div>
    );
  }

  if (notFound || !pub) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
        <p>Publication not found.</p>
        <a href="/whitepapers">← Back to Whitepapers</a>
      </div>
    );
  }

  const year = pub.publishedAt
    ? new Date(pub.publishedAt).getFullYear().toString()
    : new Date().getFullYear().toString();

  const abstractParagraphs = pub.abstract
    ? pub.abstract.split(/\n\n+/).filter(Boolean)
    : ["No abstract available."];

  const sections: Section[] = pub.bodyJson ?? [];

  const meta = {
    docTitle: `${pub.title} — TrainChat`,
    brand: "TrainChat®",
    eyebrow: `WHITEPAPER · ${pub.code} · ${year}`,
    title: pub.title,
    subtitle: pub.subtitle ?? "",
    tagline: "TrainChat Research Series",
    author: "TrainChat Research",
    affiliation: "TrainChat®",
    year,
    canonical: `trainchat.ai/whitepapers/${pub.slug}`,
    printBarLabel: `${pub.code} — ${pub.title}`,
  };

  const abstract = {
    paragraphs: abstractParagraphs,
    keywords: pub.keywords ?? [],
  };

  const citation: CitationBlock = pub.citationsJson ?? {
    formatted: `TrainChat Research. (${year}). ${pub.title}. TrainChat Research Series. https://trainchat.ai/whitepapers/${pub.slug}`,
    related: [],
    canonicalUrl: `https://trainchat.ai/whitepapers/${pub.slug}`,
  };

  return (
    <WhitepaperPrintLayout
      meta={meta}
      abstract={abstract}
      sections={sections}
      citation={citation}
    />
  );
}
