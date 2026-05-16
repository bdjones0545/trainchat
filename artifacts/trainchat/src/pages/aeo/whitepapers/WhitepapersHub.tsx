import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";
import { publications } from "@/data/publications";

const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "TrainChat® Whitepapers — Adaptive Coaching Doctrine Publications",
  "description": "Formal publications from TrainChat® on adaptive coaching architecture, mutation-first programming, and living training systems — the foundational frameworks of the TrainChat adaptive coaching doctrine.",
  "url": "https://www.trainchat.ai/whitepapers",
  "publisher": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "hasPart": publications.map((p) => ({
    "@type": "ScholarlyArticle",
    "headline": p.title,
    "description": p.description,
    "url": `https://www.trainchat.ai${p.path}`,
    "datePublished": p.year,
    "author": { "@type": "Organization", "name": "TrainChat®" }
  }))
};

export default function WhitepapersHub() {
  const [, navigate] = useLocation();

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
          {publications.map((pub) => (
            <div
              key={pub.path}
              className="border border-border rounded-xl p-5 hover:border-primary/50 hover:bg-muted/20 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-primary">{pub.abbr}</span>
                  <span className="text-xs text-muted-foreground">{pub.year}</span>
                  <span className="text-xs text-muted-foreground">{pub.pages}</span>
                </div>
                {"pdfPath" in pub && pub.pdfPath && (
                  <button
                    onClick={() => navigate(pub.pdfPath!)}
                    className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors flex-shrink-0 border border-border rounded px-2 py-0.5 hover:border-primary"
                  >
                    Save as PDF
                  </button>
                )}
              </div>
              <button className="w-full text-left group" onClick={() => navigate(pub.path)}>
                <h2 className="text-base font-bold text-foreground group-hover:text-primary transition-colors mb-0.5">{pub.title}</h2>
                <p className="text-xs text-muted-foreground italic mb-2">{pub.subtitle}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{pub.description}</p>
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
