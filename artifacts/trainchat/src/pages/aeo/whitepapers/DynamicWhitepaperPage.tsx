import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import AeoLayout from "@/components/aeo/AeoLayout";
import WhitepaperActions from "@/components/aeo/WhitepaperActions";

// ─── Local types (mirrors DB JSON shapes, no DB package import in frontend) ────

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
}

export default function DynamicWhitepaperPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [, navigate] = useLocation();

  const [pub, setPub] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);

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

  const year = pub?.publishedAt
    ? new Date(pub.publishedAt).getFullYear().toString()
    : new Date().getFullYear().toString();

  const pageTitle = pub ? `${pub.title} — TrainChat` : "Whitepaper — TrainChat";
  const pageDescription = pub?.subtitle ?? "A TrainChat Research publication.";

  if (loading) {
    return (
      <AeoLayout title="Loading… — TrainChat" description="TrainChat Research publication.">
        <div className="max-w-2xl mx-auto px-4 py-12 text-muted-foreground text-sm">
          Loading…
        </div>
      </AeoLayout>
    );
  }

  if (notFound || !pub) {
    return (
      <AeoLayout title="Not Found — TrainChat" description="Publication not found.">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <p className="text-sm text-muted-foreground mb-4">Publication not found.</p>
          <button onClick={() => navigate("/whitepapers")} className="text-sm text-primary hover:underline">
            ← Back to Whitepapers
          </button>
        </div>
      </AeoLayout>
    );
  }

  const abstractParagraphs = pub.abstract
    ? pub.abstract.split(/\n\n+/).filter(Boolean)
    : [];

  const sections: Section[] = pub.bodyJson ?? [];

  return (
    <AeoLayout
      title={pageTitle}
      description={pageDescription}
      canonical={`https://trainchat.ai/whitepapers/${pub.slug}`}
      ogTitle={pub.title}
      ogDescription={pub.subtitle ?? undefined}
    >
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <button
          onClick={() => navigate("/whitepapers")}
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          ← Publications
        </button>

        <div className="space-y-3">
          <p className="text-xs font-mono text-primary tracking-wider uppercase">
            WHITEPAPER · {pub.code} · {year}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{pub.title}</h1>
          {pub.subtitle && (
            <p className="text-base text-muted-foreground italic">{pub.subtitle}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Published by TrainChat® · trainchat.ai/whitepapers/{pub.slug}
          </p>
        </div>

        {pub.keywords && pub.keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pub.keywords.map((tag: string) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground font-mono"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <WhitepaperActions slug={pub.slug} variant="detail" />

        {abstractParagraphs.length > 0 && (
          <section>
            <h2 className="font-bold tracking-tight mb-3 text-base">Abstract</h2>
            <div className="space-y-3">
              {abstractParagraphs.map((p: string, i: number) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          </section>
        )}

        {sections.map((section: Section) => (
          <section key={section.number}>
            <h2 className="font-bold tracking-tight mb-3 text-lg">
              {section.number} {section.heading}
            </h2>
            {section.pullQuote && (
              <blockquote className="border-l-2 border-primary pl-4 mb-4 italic text-sm text-muted-foreground">
                {section.pullQuote}
              </blockquote>
            )}
            <div className="space-y-3">
              {section.content.map((paragraph: string, i: number) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        {pub.citationsJson && (
          <section>
            <h2 className="font-bold tracking-tight mb-3 text-base">Citation</h2>
            <div className="bg-muted/30 rounded p-3 space-y-2">
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                {pub.citationsJson.formatted}
              </p>
              {pub.citationsJson.related && pub.citationsJson.related.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Related: </span>
                  {pub.citationsJson.related.join(", ")}
                </p>
              )}
            </div>
          </section>
        )}

        <div className="pt-4 border-t border-border">
          <button
            onClick={() => navigate("/whitepapers")}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            ← All Publications
          </button>
        </div>
      </div>
    </AeoLayout>
  );
}
