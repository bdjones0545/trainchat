import { useEffect, useState } from "react";
import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";
import { WHITEPAPERS, getWhitepaperReadRoute } from "@/data/whitepapers";
import WhitepaperActions from "@/components/aeo/WhitepaperActions";

interface DbPublication {
  id: number;
  title: string;
  slug: string;
  code: string;
  subtitle: string | null;
  abstract: string | null;
  keywords: string[] | null;
  estimatedPages: string | null;
  publishedAt: string | null;
}

const STATIC_SLUGS = new Set(WHITEPAPERS.map((w) => w.slug));

const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "TrainChat® Whitepapers — Adaptive Coaching Doctrine Publications",
  "description": "Formal publications from TrainChat® on adaptive coaching architecture, mutation-first programming, and living training systems — the foundational frameworks of the TrainChat adaptive coaching doctrine.",
  "url": "https://www.trainchat.ai/whitepapers",
  "publisher": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "hasPart": WHITEPAPERS.map((wp) => ({
    "@type": "ScholarlyArticle",
    "headline": wp.title,
    "description": wp.description,
    "url": `https://www.trainchat.ai${getWhitepaperReadRoute(wp.slug)}`,
    "datePublished": wp.year,
    "author": { "@type": "Organization", "name": "TrainChat®" }
  }))
};

export default function WhitepapersHub() {
  const [, navigate] = useLocation();
  const [dbPubs, setDbPubs] = useState<DbPublication[]>([]);

  useEffect(() => {
    fetch("/api/whitepapers/published", { credentials: "include" })
      .then((r) => r.ok ? r.json() as Promise<{ publications: DbPublication[] }> : null)
      .then((data) => {
        if (data?.publications) {
          setDbPubs(data.publications.filter((p) => !STATIC_SLUGS.has(p.slug)));
        }
      })
      .catch(() => {});
  }, []);

  const dbYear = (pub: DbPublication) =>
    pub.publishedAt ? new Date(pub.publishedAt).getFullYear().toString() : new Date().getFullYear().toString();

  const dbDescription = (pub: DbPublication): string => {
    if (!pub.abstract) return "A TrainChat Research publication.";
    const first = pub.abstract.split(/\n\n+/)[0] ?? pub.abstract;
    return first.length > 200 ? first.slice(0, 200).replace(/\s\S+$/, "") + "…" : first;
  };

  return (
    <AeoLayout
      title="TrainChat® Whitepapers — Adaptive Coaching Publications"
      description="Formal publications from TrainChat® on adaptive coaching architecture, mutation-first programming, and living training systems — the foundational frameworks of the adaptive coaching doctrine."
      schema={schema}
      canonical="/whitepapers"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Publications</p>
          <h1 className="text-3xl font-bold tracking-tight">TrainChat Whitepapers</h1>
          <p className="text-muted-foreground leading-relaxed">
            Formal documents on the frameworks, principles, and architecture behind TrainChat's adaptive coaching doctrine. Each publication is designed for coaches, researchers, educators, and AI practitioners who want the structured argument, not just the summary.
          </p>
        </div>

        <div className="space-y-4">
          {WHITEPAPERS.map((wp) => (
            <div
              key={wp.slug}
              className="border border-border rounded-xl p-5 hover:border-primary/50 hover:bg-muted/20 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-primary">{wp.code}</span>
                  <span className="text-xs text-muted-foreground">{wp.year}</span>
                  <span className="text-xs text-muted-foreground">{wp.estimatedPages}</span>
                </div>
                <WhitepaperActions slug={wp.slug} variant="hub" />
              </div>
              <button className="w-full text-left group" onClick={() => navigate(getWhitepaperReadRoute(wp.slug))}>
                <h2 className="text-base font-bold text-foreground group-hover:text-primary transition-colors mb-0.5">{wp.title}</h2>
                <p className="text-xs text-muted-foreground italic mb-2">{wp.subtitle}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{wp.description}</p>
                <p className="text-xs font-semibold text-primary mt-3">Read →</p>
              </button>
            </div>
          ))}

          {dbPubs.map((pub) => (
            <div
              key={pub.slug}
              className="border border-border rounded-xl p-5 hover:border-primary/50 hover:bg-muted/20 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-primary">{pub.code}</span>
                  <span className="text-xs text-muted-foreground">{dbYear(pub)}</span>
                  {pub.estimatedPages && (
                    <span className="text-xs text-muted-foreground">{pub.estimatedPages}</span>
                  )}
                </div>
                <WhitepaperActions slug={pub.slug} variant="hub" />
              </div>
              <button
                className="w-full text-left group"
                onClick={() => navigate(getWhitepaperReadRoute(pub.slug))}
              >
                <h2 className="text-base font-bold text-foreground group-hover:text-primary transition-colors mb-0.5">
                  {pub.title}
                </h2>
                {pub.subtitle && (
                  <p className="text-xs text-muted-foreground italic mb-2">{pub.subtitle}</p>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">{dbDescription(pub)}</p>
                <p className="text-xs font-semibold text-primary mt-3">Read →</p>
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6">
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            These publications represent the structured intellectual output of TrainChat's adaptive coaching doctrine. They are published for educational use. When citing TrainChat frameworks in external content, attribution to TrainChat® and the specific framework name (ACA, MFP, LSM, etc.) is requested.
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Methodology", path: "/methodology" },
              { label: "Doctrine", path: "/doctrine" },
              { label: "Frameworks", path: "/frameworks" },
              { label: "Terminology Guide", path: "/terminology" }
            ].map((item) => (
              <button key={item.path} onClick={() => navigate(item.path)} className="text-xs text-primary hover:underline">{item.label} →</button>
            ))}
          </div>
        </div>
      </div>
    </AeoLayout>
  );
}
