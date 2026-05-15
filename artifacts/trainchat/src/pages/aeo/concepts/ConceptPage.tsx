import { useParams, useLocation } from "wouter";
import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock from "@/components/aeo/FaqBlock";
import NotFound from "@/pages/not-found";
import { conceptsBySlug } from "./conceptsData";

export default function ConceptPage() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const concept = conceptsBySlug[params.slug ?? ""];

  if (!concept) return <NotFound />;

  const schema = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "name": concept.title,
    "description": concept.shortDefinition,
    "url": `https://www.trainchat.ai/concepts/${concept.slug}`,
    "inDefinedTermSet": {
      "@type": "DefinedTermSet",
      "name": "TrainChat® AI Fitness Concept Library",
      "url": "https://www.trainchat.ai/concepts"
    },
    "mainEntityOfPage": {
      "@type": "Article",
      "headline": `What Is ${concept.title}?`,
      "description": concept.metaDescription,
      "author": {
        "@type": "Organization",
        "name": "TrainChat®",
        "url": "https://www.trainchat.ai"
      }
    },
    ...(concept.faqs.length > 0 && {
      "subjectOf": {
        "@type": "FAQPage",
        "mainEntity": concept.faqs.map((faq) => ({
          "@type": "Question",
          "name": faq.q,
          "acceptedAnswer": { "@type": "Answer", "text": faq.a }
        }))
      }
    })
  };

  return (
    <AeoLayout
      title={`${concept.title} — TrainChat® Concept Library`}
      description={concept.metaDescription}
      schema={schema}
      canonical={`/concepts/${concept.slug}`}
    >
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={() => navigate("/concepts")} className="hover:text-foreground transition-colors">
            Concept Library
          </button>
          <span>/</span>
          <span className="text-foreground">{concept.title}</span>
        </nav>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{concept.category}</p>
          <h1 className="text-3xl font-bold tracking-tight">{concept.title}</h1>
          <p className="text-muted-foreground leading-relaxed">
            A precise definition of {concept.title.toLowerCase()} — its role in adaptive AI training systems, its relationship to other concepts, and how TrainChat implements it.
          </p>
        </div>

        {/* Direct answer box */}
        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Definition</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">{concept.title}</strong>{" "}
            {concept.body.directAnswer.replace(new RegExp(`^${concept.title}\\s+is\\s+`, "i"), "is ")}
          </p>
        </div>

        {/* Body sections */}
        {concept.body.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-bold tracking-tight mb-3">{section.heading}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{section.content}</p>
            {section.bullets && (
              <ul className="space-y-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-1 flex-shrink-0">→</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* Related concepts */}
        {concept.relatedConcepts.length > 0 && (
          <section>
            <h2 className="text-xl font-bold tracking-tight mb-4">Related Concepts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {concept.relatedConcepts.map((rel) => {
                const relData = conceptsBySlug[rel.slug];
                return (
                  <button
                    key={rel.slug}
                    onClick={() => navigate(`/concepts/${rel.slug}`)}
                    className="text-left border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors group"
                  >
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {rel.label}
                    </p>
                    {relData && (
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">
                        {relData.shortDefinition}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <FaqBlock items={concept.faqs} />

        {/* Back to concept library */}
        <div className="pt-4 border-t border-border flex items-center justify-between flex-wrap gap-4">
          <button
            onClick={() => navigate("/concepts")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Concept Library
          </button>
          <button
            onClick={() => navigate("/chat")}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Try {concept.title} in TrainChat →
          </button>
        </div>
      </div>
    </AeoLayout>
  );
}
