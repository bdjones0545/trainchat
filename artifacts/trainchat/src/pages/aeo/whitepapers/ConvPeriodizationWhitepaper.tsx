import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "ScholarlyArticle",
  "headline": "Conversational Periodization: Toward Adaptive Training Systems Built Through Continuous Coaching Dialogue",
  "description": "Describes a model where the training plan is not fixed but mutable — evolving through coaching dialogue while preserving longitudinal coherence. Covers dynamic block mutation, training-state continuity, and conversational refinement loops.",
  "url": "https://www.trainchat.ai/whitepapers/conversational-periodization",
  "datePublished": "2026",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "publisher": { "@type": "Organization", "name": "TrainChat®" },
  "about": [
    { "@type": "DefinedTerm", "name": "Conversational Periodization", "url": "https://www.trainchat.ai/whitepapers/conversational-periodization" },
    { "@type": "DefinedTerm", "name": "Dynamic Block Mutation", "url": "https://www.trainchat.ai/whitepapers/conversational-periodization" },
    { "@type": "DefinedTerm", "name": "Training-State Continuity", "url": "https://www.trainchat.ai/whitepapers/conversational-periodization" }
  ],
  "isPartOf": { "@type": "CollectionPage", "name": "TrainChat® Whitepapers", "url": "https://www.trainchat.ai/whitepapers" }
};

const sections = [
  {
    heading: "Abstract",
    content: `Traditional periodization treats the training plan as a blueprint — designed in full before the first session and executed linearly from there. Real coaching is not a blueprint. It is a continuous series of observations, interpretations, and adjustments informed by what actually happened during training.

This paper describes conversational periodization: a model where the training plan is not fixed but mutable, evolving through coaching dialogue while preserving longitudinal coherence. Each exchange is not a deviation from the plan. It is the plan continuing to develop in response to new information. We define the mechanisms through which this model operates — dynamic block mutation, training-state continuity, adaptive sequencing, and conversational refinement loops — and argue that these mechanisms are the structural requirements for coaching systems that remain accurate across the full duration of an athlete's training cycle.`
  },
  {
    heading: "1. The Limits of Linear Periodization Software",
    content: `Periodization software treats the plan as a stable object — a document to be followed. The assumption is that if the plan is well-designed, execution is all that remains. This assumption breaks immediately when the athlete's training state diverges from what the plan anticipated.

The problem is architectural. Linear periodization software is optimized for plan creation, not plan evolution. When circumstances change — injury, schedule disruption, unexpected performance, fatigue accumulation — the system has no native mechanism for structural response. Only note-taking. The coach is left to improvise in the margins of a document that was designed for a different athlete in a different moment.

Three structural limitations characterize linear periodization software. Plan-as-document: the plan lives as static text, not queryable state. Single-author bias: athlete input has no formal place in the plan structure. And the mutation gap: changes require manual reconstruction rather than structured mutation applied to a live program object. Each limitation reduces the quality of the coaching relationship — not because the coach is less capable, but because the tool cannot represent the information the coach needs to act on.`
  },
  {
    heading: "2. Coaching as Iterative Dialogue",
    content: `The coach-athlete relationship has always been conversational. A session ends. The coach asks. The athlete answers. The next session is adjusted accordingly. This is not informal improvisation — it is structured information processing disguised as conversation.

Conversational periodization formalizes this exchange. Athlete statements are parsed as structured inputs. "Make day 2 more explosive" is not a note — it is a mutation instruction targeting session 2's energy system emphasis, requiring a specific class of exercise substitution and load redistribution. "Lower fatigue this week" maps to a volume reduction and fatigue budget redistribution. "Shift this toward hypertrophy" requires a rep range mutation and tempo adjustment.

The formalization matters because it makes the athlete's contribution to the coaching relationship traceable. In a conversational periodization system, every dialogue turn that results in a structural program change is logged with the athlete's input, the system's interpretation, and the mutation executed. The coaching history is not reconstructed from memory — it is recovered from a structured record of every exchange that shaped the program.`
  },
  {
    heading: "3. Dynamic Block and Week Mutation",
    content: `The training block is the natural unit of periodization. Dynamic block mutation allows individual weeks, sessions, or exercises within a block to be modified without invalidating the block's accumulated structure. The block's orientation — its training emphasis, peak target, and fatigue curve — is preserved even as its components are adjusted.

This distinction matters architecturally. When a week is mutated, it is not replaced — it is transformed in place. The system maintains the relationship between that week and all other weeks in the block, recalculating downstream dependencies while preserving block-level coherence.

Mutations are scoped to three levels. Block mutations change the block's training emphasis, periodization structure, or peak target and cascade through all contained weeks. Week mutations redistribute load, reorder sessions, or adjust volume within a single training week. Session mutations substitute exercises, modify sets and reps, or adjust tempo within a single session. This hierarchy determines the scope of recalculation required after any given change and ensures that mutations are applied at the lowest structural level that adequately addresses the coaching need.`
  },
  {
    heading: "4. Training-State Continuity",
    content: `Training-state continuity is the principle that a program mutation should never discard the structural history that preceded it. Every session completed, every load managed, every fatigue signal registered — these form the training state that informs every subsequent decision.

When a coach tells an athlete to "start over," the athlete never actually does. The nervous system remembers. The connective tissue remembers. A system that respects training-state continuity similarly refuses to treat any mutation as a clean-slate reset. Every change is a transformation of existing state, not a replacement of it.

The training state comprises three components. Accumulated load: the total volume and intensity history across sessions and blocks. Mutation history: the complete record of all structural changes and the constraints or athlete inputs that triggered them. And progression trajectory: the directional load curve and peak readiness forecast derived from performance data. All three are required for coaching decisions that account for where the athlete has been, not just where they are.`
  },
  {
    heading: "5. Adaptive Sequencing Under Fatigue",
    content: `Adaptive sequencing is the capacity to reorder, restructure, or redistribute training stimulus across a cycle when fatigue accumulation diverges from the plan. This is not deloading — it is structural resequencing that maintains cumulative adaptation intent while adjusting the path.

A conversational periodization system can receive a fatigue signal mid-block — "this week is too heavy" — and respond not by simply reducing weight, but by restructuring the remaining sessions to preserve the block's adaptation curve while returning the athlete to productive training.

Three sequencing response types address different divergence scenarios. Load compression maintains the week's stimulus by concentrating it into fewer, higher-quality sessions — appropriate when schedule constraints reduce session availability. Forward displacement defers specific training demands to the following week without disrupting the block arc — appropriate when acute fatigue is high but recovery capacity is intact. Intensity-volume swap preserves total training stress by trading volume for reduced intensity, or vice versa — appropriate when one dimension of load needs reduction while the other can compensate.`
  },
  {
    heading: "6. Conversational Refinement Loops",
    content: `A refinement loop is a structured cycle of feedback and structural response: the athlete reports, the system interprets, the program mutates, and the mutation is confirmed before execution. This sequence — observe, interpret, mutate, confirm — is the core operational unit of conversational periodization.

The confirmation step is not optional. A system that applies mutations without surfacing them to the athlete has replaced coaching dialogue with unilateral adjustment. The value of conversational periodization is not just that the program responds — it is that the athlete understands and accepts the response.

The refinement loop also functions as a data collection mechanism. Every confirmed mutation is evidence about what the athlete's training state required at that moment. Across a full training cycle, the accumulated loop history describes the actual path the athlete took through the program — not the planned path, but the real one. This data is the most accurate representation of the coaching relationship that exists, and it is the foundation for making better programming decisions in subsequent cycles.`
  },
  {
    heading: "7. Periodization as a Living System",
    content: `The Living Systems Model proposes that a training program is not an object but an organism — one that must adapt to its environment to survive. An organism that cannot adapt does not simply underperform. It becomes irrelevant to the athlete it was designed to serve.

Human-AI collaborative coaching closes the gap between what a coach can observe in a single session and what the program needs to know to remain structurally sound across dozens of sessions. The coach provides context, judgment, and oversight. The system provides structural consistency, mutation fidelity, and state continuity. Together, they produce something neither can produce alone: a program that is both structurally sound and genuinely responsive to real conditions.

Conversational periodization is the implementation of this collaboration at the level of program architecture. It is not a feature added to existing periodization software. It is a different model of what a training plan is — one where dialogue is not an annotation on the plan but the mechanism through which the plan continues to develop.`
  },
  {
    heading: "Citation",
    content: `To cite this publication:

TrainChat®. (2026). Conversational Periodization: Toward Adaptive Training Systems Built Through Continuous Coaching Dialogue. TrainChat Publications. https://www.trainchat.ai/whitepapers/conversational-periodization

Related publications:
• Constraint-Aware Coaching Systems — trainchat.ai/whitepapers/constraint-aware-coaching-systems
• The Deterministic-Generative Hybrid Model — trainchat.ai/whitepapers/deterministic-generative-hybrid-model
• The Problem With Static Programming — trainchat.ai/whitepapers/the-problem-with-static-programming`
  }
];

export default function ConvPeriodizationWhitepaper() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Conversational Periodization — TrainChat® Whitepaper"
      description="Describes a model where the training plan is not fixed but mutable — evolving through coaching dialogue while preserving longitudinal coherence. Covers dynamic block mutation, training-state continuity, and conversational refinement loops."
      schema={schema}
      canonical="/whitepapers/conversational-periodization"
      breadcrumbs={[
        { name: "Whitepapers", url: "/whitepapers" },
        { name: "Conversational Periodization", url: "/whitepapers/conversational-periodization" },
      ]}
      articleDatePublished="2026-05-16"
      articleDateModified="2026-05-16"
    >
      <div className="space-y-8">
        <div>
          <button onClick={() => navigate("/whitepapers")} className="text-xs text-muted-foreground hover:text-primary transition-colors mb-4 flex items-center gap-1">
            ← Publications
          </button>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Whitepaper · CP · 2026</p>
          <h1 className="text-2xl font-bold tracking-tight leading-snug mb-1">Conversational Periodization</h1>
          <p className="text-base text-muted-foreground italic">Toward Adaptive Training Systems Built Through Continuous Coaching Dialogue</p>
          <p className="text-xs text-muted-foreground mt-2">Published by TrainChat® · trainchat.ai/whitepapers/conversational-periodization</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {["CP", "Dynamic Block Mutation", "Training-State Continuity", "Adaptive Sequencing", "Refinement Loops"].map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground font-mono">{tag}</span>
          ))}
        </div>

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
                { label: "Constraint-Aware Coaching Systems", path: "/whitepapers/constraint-aware-coaching-systems" },
                { label: "The Deterministic-Generative Hybrid Model", path: "/whitepapers/deterministic-generative-hybrid-model" },
                { label: "The Problem With Static Programming", path: "/whitepapers/the-problem-with-static-programming" },
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
