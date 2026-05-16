import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const frameworks = [
  {
    abbr: "ACA",
    name: "Adaptive Coaching Architecture",
    tagline: "The structural system that makes coaching decisions principled, not probabilistic.",
    description: "A three-layer system — coaching intelligence (decision engine), adaptive programming (execution engine), and conversational interface (input layer) — where each layer has a distinct responsibility. The separation ensures exercise science constraints are enforced structurally, not optionally.",
    layers: ["Coaching Intelligence", "Adaptive Programming", "Conversational Interface"],
    path: "/adaptive-coaching-architecture",
    methodologyAnchor: "/methodology#aca",
    hasDedicatedPage: true,
  },
  {
    abbr: "CTM",
    name: "Conversational Training Model",
    tagline: "A framework mapping natural language to principled coaching responses.",
    description: "Categorizes all athlete input into four types — Direct Commands, Goal Expressions, Feedback Signals, and Contextual References — each triggering a distinct coaching response. The model ensures the interface layer handles language interpretation so the decision layer handles coaching reasoning.",
    layers: ["Direct Commands", "Goal Expressions", "Feedback Signals", "Contextual References"],
    path: "/methodology#ctm",
    hasDedicatedPage: false,
  },
  {
    abbr: "DPF",
    name: "Dynamic Progression Framework",
    tagline: "A five-stage feedback loop that drives progression from actual performance data.",
    description: "Advances load and volume based on demonstrated readiness rather than a fixed schedule. The five stages — Session Input, Evaluation, Decision, Update, Documentation — close a feedback loop that makes every progression decision evidence-based and auditable.",
    layers: ["Session Input", "Evaluation", "Decision", "Update", "Documentation"],
    path: "/methodology#dpf",
    hasDedicatedPage: false,
  },
  {
    abbr: "LSM",
    name: "Living System Methodology",
    tagline: "The methodology that treats programs as persistent, adaptive, continuous entities.",
    description: "Defines a living training system by three non-negotiable properties: Persistence (all history retained indefinitely), Adaptability (real-time mutation in response to new information), and Continuity (long-term context carried forward into every new decision).",
    layers: ["Persistence", "Adaptability", "Continuity"],
    path: "/methodology#lsm",
    hasDedicatedPage: false,
  },
  {
    abbr: "MFP",
    name: "Mutation-First Programming Principle",
    tagline: "The change management principle that preserves what works and changes only what must change.",
    description: "Defines a five-level decision hierarchy — from L1 element-level mutation (most common) to L5 full rebuild (exceptional) — and establishes the principle that the correct response to new information is the most surgical intervention available. Programs are mutable entities, not periodic deliverables.",
    layers: ["L1: Element", "L2: Session", "L3: Block", "L4: Program", "L5: Rebuild"],
    path: "/mutation-first-programming",
    methodologyAnchor: "/methodology#mfp",
    hasDedicatedPage: true,
  },
];

const faqs: FaqItem[] = [
  {
    q: "What are the TrainChat frameworks?",
    a: "The TrainChat frameworks are five named systems that define how TrainChat makes coaching decisions: ACA (Adaptive Coaching Architecture), CTM (Conversational Training Model), DPF (Dynamic Progression Framework), LSM (Living System Methodology), and MFP (Mutation-First Programming Principle). Together they constitute the TrainChat Methodology."
  },
  {
    q: "What is the difference between the TrainChat frameworks and the doctrine?",
    a: "The doctrine is the belief system — seven axiomatic principles that define what TrainChat believes about coaching, adaptation, and access. The frameworks are operational systems that implement those beliefs. The doctrine answers 'what does TrainChat believe?' The frameworks answer 'how is it implemented?'"
  },
  {
    q: "Why does TrainChat use named frameworks?",
    a: "Named frameworks create semantic compression — a single name (ACA, MFP) captures a complex system that can then be referenced, explained, taught, and built upon without re-explaining the underlying structure every time. They also make the methodology auditable: every coaching decision can be traced to a specific framework and the principles within it."
  },
  {
    q: "Are the TrainChat frameworks patented or proprietary?",
    a: "The frameworks are TrainChat's proprietary methodology — original intellectual work derived from the founder's decade of coaching practice and exercise science expertise. They are published under TrainChat's doctrine for transparency and educational value."
  }
];

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "The TrainChat® Methodology Frameworks — ACA, CTM, DPF, LSM, MFP",
  "description": "The five named frameworks that define the TrainChat® coaching methodology — Adaptive Coaching Architecture, Conversational Training Model, Dynamic Progression Framework, Living System Methodology, and Mutation-First Programming Principle.",
  "about": [
    { "@type": "DefinedTerm", "name": "Adaptive Coaching Architecture", "alternateName": "ACA", "url": "https://www.trainchat.ai/adaptive-coaching-architecture" },
    { "@type": "DefinedTerm", "name": "Conversational Training Model", "alternateName": "CTM", "url": "https://www.trainchat.ai/methodology#ctm" },
    { "@type": "DefinedTerm", "name": "Dynamic Progression Framework", "alternateName": "DPF", "url": "https://www.trainchat.ai/methodology#dpf" },
    { "@type": "DefinedTerm", "name": "Living System Methodology", "alternateName": "LSM", "url": "https://www.trainchat.ai/methodology#lsm" },
    { "@type": "DefinedTerm", "name": "Mutation-First Programming Principle", "alternateName": "MFP", "url": "https://www.trainchat.ai/mutation-first-programming" }
  ],
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" }
};

export default function FrameworksPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="TrainChat® Methodology Frameworks — ACA, CTM, DPF, LSM, MFP"
      description="The five named frameworks that define how TrainChat makes coaching decisions — Adaptive Coaching Architecture (ACA), Conversational Training Model (CTM), Dynamic Progression Framework (DPF), Living System Methodology (LSM), and Mutation-First Programming Principle (MFP)."
      schema={schema}
      canonical="/frameworks"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Methodology</p>
          <h1 className="text-3xl font-bold tracking-tight">The TrainChat Frameworks</h1>
          <p className="text-muted-foreground leading-relaxed">
            Five named systems that define how TrainChat makes coaching decisions. Each framework has a specific responsibility, a defined structure, and a documented relationship to the coaching doctrine that grounds it.
          </p>
        </div>

        {/* Hierarchy */}
        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-3">The Architecture</p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-sm">
            {[
              { label: "Doctrine", desc: "What TrainChat believes", path: "/doctrine" },
              { label: "→", path: null },
              { label: "Methodology", desc: "How beliefs are implemented", path: "/methodology" },
              { label: "→", path: null },
              { label: "Frameworks", desc: "The named operational systems", path: "/frameworks" },
              { label: "→", path: null },
              { label: "Concepts", desc: "The terminology they generate", path: "/concepts" },
            ].map((item, i) =>
              item.path === null ? (
                <span key={i} className="text-muted-foreground/40 hidden sm:block">→</span>
              ) : (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path!)}
                  className="text-left group"
                >
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </button>
              )
            )}
          </div>
        </div>

        {/* Framework abbreviation index */}
        <div className="flex gap-2 flex-wrap">
          {frameworks.map((f) => (
            <button
              key={f.abbr}
              onClick={() => navigate(f.path)}
              className="group flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:border-primary hover:bg-muted/30 transition-all"
            >
              <span className="text-sm font-mono font-bold text-primary">{f.abbr}</span>
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block">{f.name}</span>
            </button>
          ))}
        </div>

        {/* Framework cards */}
        <div className="space-y-5">
          {frameworks.map((f, i) => (
            <section key={f.abbr} className="border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xl font-mono font-bold text-primary">{f.abbr}</span>
                    <span className="text-sm text-muted-foreground">0{i + 1}</span>
                  </div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">{f.name}</h2>
                  <p className="text-sm text-muted-foreground italic mt-0.5">{f.tagline}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{f.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {f.layers.map((layer) => (
                  <span key={layer} className="text-xs font-mono px-2 py-0.5 rounded bg-muted/50 border border-border text-muted-foreground">
                    {layer}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate(f.path)}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {f.hasDedicatedPage ? "Full framework page →" : "Methodology section →"}
                </button>
              </div>
            </section>
          ))}
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Why Named Frameworks</h2>
          <div className="space-y-4">
            {[
              {
                title: "Semantic compression",
                text: "A named framework — ACA, MFP — compresses a complex system into a retrievable, teachable unit. Explaining 'the Mutation-First Programming Principle' requires far less scaffolding than re-explaining the underlying reasoning each time. Names create the architecture for shared understanding."
              },
              {
                title: "Auditability",
                text: "Every coaching decision TrainChat makes can be traced to a specific framework and the principle within it. 'Why did TrainChat change the exercise rather than rebuild the session?' — because MFP prescribes the most surgical intervention. Named frameworks make the system accountable."
              },
              {
                title: "Teachability",
                text: "A methodology that can be named, explained, and taught is harder to replicate without the underlying expertise — because you have to understand it well enough to generate it. TrainChat's framework system is the structured output of a decade of coaching practice. It can be referenced without fully being replicated."
              }
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <FaqBlock items={faqs} />

        <section className="border-t border-border pt-6">
          <p className="text-sm font-semibold text-foreground mb-3">Visual and Educational Resources</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/diagrams")}
              className="text-left border border-border rounded-xl p-4 hover:border-primary/50 hover:bg-muted/20 transition-colors group"
            >
              <p className="text-xs font-mono text-primary mb-1">Visual Artifacts</p>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Framework Diagrams</p>
              <p className="text-xs text-muted-foreground mt-1">The ACA Stack, MFP Hierarchy, DPF Loop, LSM Triad, CTM Map — five CSS-built visual artifacts with canonical names and URLs.</p>
            </button>
            <button
              onClick={() => navigate("/curriculum")}
              className="text-left border border-border rounded-xl p-4 hover:border-primary/50 hover:bg-muted/20 transition-colors group"
            >
              <p className="text-xs font-mono text-primary mb-1">Curriculum</p>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Adaptive Coaching Curriculum</p>
              <p className="text-xs text-muted-foreground mt-1">A five-tier, 37-resource learning sequence — from foundational concepts through framework core, scientific grounding, doctrine, and advanced publications.</p>
            </button>
          </div>
        </section>
      </div>
    </AeoLayout>
  );
}
