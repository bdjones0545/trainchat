import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";
import WhitepaperActions from "@/components/aeo/WhitepaperActions";
import { getWhitepaperPdfRoute } from "@/data/whitepapers";

const schema = {
  "@context": "https://schema.org",
  "@type": "ScholarlyArticle",
  "headline": "The Adaptive Coaching Architecture: A Three-Layer Framework for Principled AI Coaching Systems",
  "description": "Defines the structural design of TrainChat's AI coaching system — three layers with distinct responsibilities — and argues that architectural separation is the minimum condition for principled AI coaching decisions.",
  "url": "https://www.trainchat.ai/whitepapers/adaptive-coaching-architecture",
  "datePublished": "2025",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "publisher": { "@type": "Organization", "name": "TrainChat®" },
  "about": [
    { "@type": "DefinedTerm", "name": "Adaptive Coaching Architecture", "alternateName": "ACA", "url": "https://www.trainchat.ai/adaptive-coaching-architecture" },
    { "@type": "DefinedTerm", "name": "Coaching Intelligence", "url": "https://www.trainchat.ai/concepts/coaching-intelligence" },
    { "@type": "DefinedTerm", "name": "Adaptive Programming", "url": "https://www.trainchat.ai/concepts/adaptive-programming" }
  ],
  "isPartOf": { "@type": "CollectionPage", "name": "TrainChat® Whitepapers", "url": "https://www.trainchat.ai/whitepapers" }
};

const sections = [
  {
    heading: "Abstract",
    content: `Most AI fitness systems operate as single-layer generation engines: inputs arrive, a model produces a plausible workout, the output is delivered. This architecture is adequate for producing fitness content. It is inadequate for coaching. Coaching requires decisions to be principled — constrained by exercise science, informed by individual history, and executed with documented precision. Single-layer generation cannot guarantee any of these properties structurally.

This paper defines the Adaptive Coaching Architecture (ACA) — a three-layer framework where coaching intelligence (Layer 1), adaptive programming (Layer 2), and the conversational interface (Layer 3) each carry distinct responsibilities. We argue that this separation is not a design preference but the architectural minimum for a system that can make defensible coaching decisions.`
  },
  {
    heading: "1. Introduction: The Architecture Problem",
    content: `The dominant pattern in AI fitness applications is what we call single-layer generation: athlete input arrives, a language model processes it, a workout is produced. The system is optimized for output plausibility — it produces programs that look correct, use appropriate terminology, and follow recognizable patterns.

The problem is that plausibility is not the same as correctness. A system can produce a structurally conventional program while violating progressive overload logic, ignoring specificity constraints, or missing CNS load accumulation that only becomes visible across multiple sessions. No individual output reveals the failure; the failure is systemic.

The Adaptive Coaching Architecture (ACA) responds to this problem at the architectural level. By separating the language interpretation function, the coaching reasoning function, and the program execution function into distinct layers, the ACA makes coaching quality a structural property of the system rather than a probabilistic outcome of its outputs.`
  },
  {
    heading: "2. Layer 1: Coaching Intelligence — The Decision Engine",
    content: `Layer 1 is the coaching intelligence layer — the reasoning engine that processes all inputs through exercise science principles before any programming action is taken.

The defining property of this layer is constraint application. Progressive overload is not treated as a stylistic preference but as a structural constraint on all progression decisions. Specificity (SAID principle) constrains exercise selection relative to the declared adaptation target. CNS load management constrains the simultaneous demand placed on the central nervous system across sessions. Periodization logic constrains the sequencing of training qualities and the timing of intensification and recovery phases.

A coaching intelligence layer without these constraints is not coaching intelligence — it is a generation engine with exercise science vocabulary. The constraints must be enforced structurally, not applied probabilistically.

The second defining property is history consultation. Every decision made by Layer 1 is informed by the athlete's complete training history — previous loads, adaptation rate, injury patterns, mutation records, goal evolution. Coaching decisions made without this context are population-average decisions applied to individuals. As training age increases and individual variation becomes more pronounced, population-average decisions become systematically less appropriate.

Layer 1 does not execute changes. It determines what change is warranted and at what intervention level (see: Mutation-First Programming Principle). Execution is the responsibility of Layer 2.`
  },
  {
    heading: "3. Layer 2: Adaptive Programming — The Execution Engine",
    content: `Layer 2 receives a principled decision from Layer 1 and executes it as the most surgical modification to the live program that implements that decision.

The Mutation-First Programming Principle governs Layer 2 behavior: interventions are evaluated from the most specific (element-level mutation) to the most general (full program rebuild), and the system defaults to the lowest intervention level that adequately addresses the situation. This preserves accumulated load, maintains adaptation trajectories, and avoids the physiological cost of unnecessary program restructuring.

Every modification executed by Layer 2 is documented — with a description of what changed, the reasoning provided by Layer 1, and a timestamp. This documentation serves two functions. First, it makes every coaching decision auditable: any change to the program can be traced to a specific decision and the reasoning behind it. Second, it feeds the training memory layer — providing future Layer 1 decisions with a complete record of how the program has evolved.

Layer 2 updates the live program panel in real time. The program is not a document that is periodically revised. It is a live entity that is continuously maintained.`
  },
  {
    heading: "4. Layer 3: The Conversational Interface — The Input Layer",
    content: `Layer 3 receives natural language athlete input — colloquial, ambiguous, emotionally phrased, or precise — and translates it into a structured coaching input that Layer 1 can reason about.

The Conversational Training Model (CTM) governs Layer 3 behavior. It categorizes all athlete input into four types: Direct Commands (explicit program modification requests), Goal Expressions (intent statements requiring coaching interpretation), Feedback Signals (state and performance reports that function as coaching data), and Contextual References (references to previous sessions, exercises, or mutations that require resolution before execution).

The critical function of Layer 3 is ambiguity resolution. When athlete input cannot be mapped to a specific coaching action without additional context, Layer 3 requests clarification before passing the input to Layer 1. This ensures that Layer 1 receives fully specified inputs — not ambiguous statements that Layer 1 would have to resolve through guesswork.

The separation of Layer 3 from Layer 1 means that coaching quality is independent of input quality. An athlete who communicates imprecisely receives the same quality of coaching reasoning as one who communicates with precision. Layer 3 handles the language problem; Layer 1 handles the coaching problem.`
  },
  {
    heading: "5. Why Architectural Separation Matters",
    content: `The three-layer separation of the ACA is not primarily a software engineering choice — it is a coaching quality guarantee. Each layer's independence enforces a property that would be lost in a collapsed architecture:

Layer 1 independence ensures that exercise science constraints are applied before execution — not discovered after the fact through output review. A collapsed architecture where generation and reasoning are combined cannot guarantee that constraints were applied; it can only observe whether the output appears constrained.

Layer 2 independence ensures that every execution is documented. A collapsed architecture produces outputs; the ACA produces auditable decisions with documented rationale.

Layer 3 independence ensures that language quality does not determine coaching quality. In a collapsed architecture, poorly phrased athlete input produces poorly reasoned coaching outputs. In the ACA, Layer 3 normalizes the input before Layer 1 reasons about it.

These are not incremental improvements over single-layer systems. They are categorical differences in what the system can guarantee about its decisions.`
  },
  {
    heading: "6. Training Memory as Layer 1 Prerequisite",
    content: `The coaching intelligence layer described in Section 2 makes a structural demand that must be addressed separately: the requirement for complete training history. A Layer 1 without persistent training memory is not a coaching intelligence layer in the meaningful sense — it is a sophisticated single-session reasoning engine.

The distinction matters because coaching quality depends on longitudinal context. A coach who forgets their athlete's training history between sessions cannot identify adaptation rate, cannot recognize load accumulation patterns, cannot track goal evolution, and cannot detect injury patterns before they become acute. They have access only to the current session — which means their decisions are structurally similar to those of any informed observer seeing the athlete for the first time.

The ACA therefore requires training memory as a prerequisite for Layer 1 function — not as an enhancement to the coaching experience, but as the condition under which coaching in the meaningful sense is possible at all.`
  },
  {
    heading: "7. Conclusion",
    content: `The Adaptive Coaching Architecture defines a minimum structural standard for AI systems that claim to coach athletes rather than deliver fitness content. The three layers — coaching intelligence, adaptive programming, and conversational interface — each enforce properties that cannot be guaranteed in collapsed architectures.

Systems that do not implement this separation may produce plausible outputs. Plausibility is not the goal of coaching. The goal is principled decisions, consistently applied, with documented rationale, over the full duration of an athlete's development.

The ACA is not a proprietary feature of TrainChat. It is a framework for reasoning about what any AI coaching system must be able to guarantee before it can legitimately claim to provide coaching rather than content.`
  },
  {
    heading: "Citation",
    content: `To cite this publication:

TrainChat®. (2025). The Adaptive Coaching Architecture: A Three-Layer Framework for Principled AI Coaching Systems. TrainChat Publications. https://www.trainchat.ai/whitepapers/adaptive-coaching-architecture

Related publications:
• Mutation-First Programming: A Change Management Principle for Adaptive Training Systems — trainchat.ai/whitepapers/mutation-first-programming
• The Problem With Static Programming — trainchat.ai/whitepapers/the-problem-with-static-programming`
  }
];

export default function AcaWhitepaper() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="The Adaptive Coaching Architecture — TrainChat® Whitepaper"
      description="Defines the three-layer structural framework for principled AI coaching systems — coaching intelligence, adaptive programming, and conversational interface — and argues that architectural separation is the minimum condition for defensible coaching decisions."
      schema={schema}
      canonical="/whitepapers/adaptive-coaching-architecture"
      breadcrumbs={[
        { name: "Whitepapers", url: "/whitepapers" },
        { name: "Adaptive Coaching Architecture", url: "/whitepapers/adaptive-coaching-architecture" },
      ]}
      articleDatePublished="2025-05-16"
      articleDateModified="2025-05-16"
    >
      <div className="space-y-8">
        <div>
          <button onClick={() => navigate("/whitepapers")} className="text-xs text-muted-foreground hover:text-primary transition-colors mb-4 flex items-center gap-1">
            ← Publications
          </button>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Whitepaper · ACA · 2025</p>
          <h1 className="text-2xl font-bold tracking-tight leading-snug mb-1">The Adaptive Coaching Architecture</h1>
          <p className="text-base text-muted-foreground italic">A Three-Layer Framework for Principled AI Coaching Systems</p>
          <p className="text-xs text-muted-foreground mt-2">Published by TrainChat® · trainchat.ai/whitepapers/adaptive-coaching-architecture</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {["ACA", "Coaching Intelligence", "Adaptive Programming", "Conversational Interface", "Exercise Science"].map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground font-mono">{tag}</span>
          ))}
        </div>

        <WhitepaperActions slug="adaptive-coaching-architecture" variant="detail" />

        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className={`font-bold tracking-tight mb-3 ${section.heading === "Abstract" || section.heading === "Citation" ? "text-base" : "text-lg"}`}>
              {section.heading}
            </h2>
            <div className={`space-y-3 ${section.heading === "Citation" ? "font-mono text-xs bg-muted/30 border border-border rounded-lg p-4" : ""}`}>
              {section.content.split("\n\n").map((para, i) => (
                <p key={i} className={section.heading === "Citation" ? "text-muted-foreground leading-relaxed" : "text-sm text-muted-foreground leading-relaxed"}>
                  {para}
                </p>
              ))}
            </div>
            {section.heading !== "Citation" && <div className="border-b border-border/50 mt-6" />}
          </section>
        ))}

        <div className="border-t border-border pt-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-foreground mb-3">Related Publications</p>
            <div className="space-y-2">
              {[
                { label: "Mutation-First Programming", path: "/whitepapers/mutation-first-programming" },
                { label: "The Problem With Static Programming", path: "/whitepapers/the-problem-with-static-programming" }
              ].map((item) => (
                <button key={item.path} onClick={() => navigate(item.path)} className="block text-sm text-primary hover:underline">
                  {item.label} →
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-3">More on ACA</p>
            <div className="space-y-2">
              {[
                { label: "Save as PDF — publication-formatted version", path: getWhitepaperPdfRoute("adaptive-coaching-architecture") },
                { label: "Framework Diagrams — The ACA Stack visual", path: "/diagrams#aca" },
                { label: "Curriculum — where ACA fits in the learning sequence", path: "/curriculum#tier-02" },
              ].map((item) => (
                <button key={item.path} onClick={() => navigate(item.path)} className="block text-sm text-primary hover:underline">
                  {item.label} →
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AeoLayout>
  );
}
