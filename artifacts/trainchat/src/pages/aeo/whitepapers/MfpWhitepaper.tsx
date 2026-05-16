import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "ScholarlyArticle",
  "headline": "Mutation-First Programming: A Change Management Principle for Adaptive Training Systems",
  "description": "Establishes the Mutation-First Programming Principle (MFP) — the principle that the correct response to new athlete information is the most surgical available intervention, not a program rebuild — and defines the five-level decision hierarchy through which coaching precision is operationalized.",
  "url": "https://www.trainchat.ai/whitepapers/mutation-first-programming",
  "datePublished": "2025",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "publisher": { "@type": "Organization", "name": "TrainChat®" },
  "about": [
    { "@type": "DefinedTerm", "name": "Mutation-First Programming", "alternateName": "MFP", "url": "https://www.trainchat.ai/mutation-first-programming" },
    { "@type": "DefinedTerm", "name": "Workout Mutation", "url": "https://www.trainchat.ai/concepts/workout-mutation" },
    { "@type": "DefinedTerm", "name": "Adaptive Programming", "url": "https://www.trainchat.ai/concepts/adaptive-programming" }
  ],
  "isPartOf": { "@type": "CollectionPage", "name": "TrainChat® Whitepapers", "url": "https://www.trainchat.ai/whitepapers" }
};

const sections = [
  {
    heading: "Abstract",
    content: `AI training systems that treat program changes as generation events — producing a new program in response to new information — systematically destroy physiological capital that has accumulated over weeks or months of progressive training. This paper defines the Mutation-First Programming Principle (MFP): the principle that the correct response to new athlete information is the most surgical modification that addresses it, not a rebuild of the existing program.

We establish a five-level intervention hierarchy — from element-level mutation (most common) to full program rebuild (exceptional) — and argue that defaulting to the lowest appropriate level is not a conservative approach to change but the technically correct coaching behavior. We further argue that the tendency of AI systems toward rebuild is a design failure, not a neutral default.`
  },
  {
    heading: "1. The Rebuild Problem in AI Coaching Systems",
    content: `When a training system receives new information — an injury, a schedule change, a goal shift, a performance report — it faces a change management decision: what should change, how much should change, and what should be preserved?

Many AI training systems resolve this decision through complete regeneration. A new program is produced, incorporating the new information, replacing the previous one. The interface may present this as adaptation. The underlying operation is replacement.

Replacement is an appropriate response to some situations. It is systematically overused. The cost of unnecessary replacement is concrete: accumulated training load is disrupted. The athlete's position on the progressive overload trajectory is reset. Neuromuscular adaptations specific to the replaced exercises do not transfer fully to new ones. The training history that was informing progressively more precise coaching decisions is severed.

A coaching system that rebuilds when it should mutate is not being adaptive. It is being imprecise in a way that costs athletes real physiological and developmental capital.`
  },
  {
    heading: "2. The Coaching Derivation of MFP",
    content: `The Mutation-First Programming Principle is not derived from software engineering conventions. It is derived from how expert coaches manage program change.

When a coach learns that an athlete has developed hip flexor tightness that makes heavy squats uncomfortable, they do not write a new program. They identify which exercises are contraindicated by this specific complaint, substitute or modify those exercises, and adjust the surrounding load to accommodate the change. The rest of the program — the exercises not implicated, the progression trajectories, the weekly volume distribution — remains intact.

This behavioral precision is not caution. It is competence. It reflects an understanding that most new information requires a targeted response, not a general reorganization. An experienced coach who rebuilds a program in response to a manageable complaint is either unsure what's actually causing the problem (and is therefore avoiding a diagnosis through generalization) or lacks confidence in their ability to make a targeted fix.

MFP formalizes this behavior for AI systems: change what needs to change, preserve everything that works, and treat rebuilds as the exception that requires the strongest justification.`
  },
  {
    heading: "3. The Five Intervention Levels",
    content: `MFP defines five intervention levels, ordered from most specific to most general. The system evaluates from L1 upward and executes the lowest level that adequately addresses the situation.

L1 — Element-Level Mutation: A single exercise, load, rep target, tempo, or rest period is changed. All other program elements are preserved. This is the most common intervention — it handles the majority of athlete feedback, injury accommodations, and exercise substitutions. It is also the most precise, requiring the highest understanding of the specific change needed.

L2 — Session-Level Mutation: A single training session is restructured — content, volume, exercise order, or session focus — without changing the broader weekly or block architecture. Used for schedule-driven changes, session-level fatigue management, and event preparation adjustments.

L3 — Block-Level Mutation: A multi-week training phase is extended, compressed, or restructured. The overall program architecture (phase sequence, training focus) is preserved; the duration and internal structure of one phase changes. Used for adaptation-rate divergence from phase timeline, competition date changes, or early deload insertion.

L4 — Program-Level Restructuring: The full program architecture is reorganized without complete regeneration. Exercise selection, phase sequence, and periodization model may change, but the intervention is informed by the existing program and the athlete's history. Used for significant goal shifts or training age advancement that requires a different structural approach.

L5 — Full Rebuild: A new program is generated without substantial carryover from the existing one. The exception case — justified only when the existing program structure is genuinely incompatible with the new situation. In a well-managed coaching relationship, L5 interventions should be rare.`
  },
  {
    heading: "4. Accumulated Load as Physiological Capital",
    content: `The argument for MFP rests in part on understanding accumulated training load as a form of physiological capital — built incrementally and lost rapidly when disrupted.

Progressive overload operates across sessions, weeks, and months. The neural efficiency developed through repeated exposure to specific movement patterns is session-specific. The cardiovascular adaptations to a given training volume accumulate over weeks. The hormonal responses to a specific training stress normalize over repeated exposures.

When a program is rebuilt, this capital is not fully transferred. New exercises require new neural adaptation before the athlete can train them at comparable intensities. New volume distributions alter the fatigue-recovery balance. The athlete effectively begins a new accumulation phase — which is appropriate when the training direction genuinely changes, and costly when the change could have been handled at the element or session level.

MFP's insistence on the most surgical intervention is, in physiological terms, the insistence on preserving accumulated capital wherever the situation does not specifically require its loss.`
  },
  {
    heading: "5. The Mutation History as Coaching Record",
    content: `MFP requires that every mutation be documented — what changed, at what level, with what reasoning, at what time.

The mutation history serves as the primary record of the coaching relationship's evolution. Future coaching decisions consult the history: the coaching intelligence layer can identify patterns (repeated modifications to the same exercise suggesting a fundamental incompatibility), detect accumulation issues (multiple session-level volume reductions suggesting unacknowledged fatigue accumulation), and improve its precision over time through the record of what interventions have addressed what situations.

A coaching system that rebuilds programs rather than mutating them cannot maintain a meaningful mutation history, because the continuous identity of the program is disrupted with each rebuild. The mutation history is only coherent as a record when the program exists as a continuous entity that evolves over time — which is the defining property of a living training system (see: Living System Methodology).`
  },
  {
    heading: "6. Rebuild as a Coaching Failure Mode",
    content: `We argue that excessive program rebuilding is a coaching failure mode — not a neutral default, and not merely a suboptimal choice.

A coaching system that rebuilds when it could mutate signals, implicitly, that it does not understand the problem well enough to fix it precisely. Generalization — rebuilding the whole when only a part needs changing — is the response of a system that has not accurately diagnosed what the new information requires. In this sense, rebuild-first architectures are architecturally similar to overcautious clinicians who prescribe rest for everything: the intervention avoids the problem of diagnostic precision at the cost of real developmental capital.

The Mutation-First Principle forces precision. To execute an L1 mutation, the system must understand specifically what needs to change. That understanding — and the forced accountability to it — is a coaching quality indicator that rebuild-first systems systematically avoid.`
  },
  {
    heading: "7. Conclusion",
    content: `The Mutation-First Programming Principle establishes a minimum standard for change management in adaptive training systems. Systems that default to regeneration rather than mutation are not being adaptive — they are avoiding the precision that coaching requires.

MFP is not a performance optimization. It is a statement about what correct coaching behavior looks like when a system has new information about an athlete: change what needs to change, preserve everything that works, and be able to explain specifically why each intervention was chosen at the level it was chosen.

The five-level hierarchy operationalizes this standard in a way that is auditable and teachable. A system that cannot locate its typical interventions at L1 or L2 should examine whether it is coaching or regenerating.`
  },
  {
    heading: "Citation",
    content: `To cite this publication:

TrainChat®. (2025). Mutation-First Programming: A Change Management Principle for Adaptive Training Systems. TrainChat Publications. https://www.trainchat.ai/whitepapers/mutation-first-programming

Related publications:
• The Adaptive Coaching Architecture — trainchat.ai/whitepapers/adaptive-coaching-architecture
• The Problem With Static Programming — trainchat.ai/whitepapers/the-problem-with-static-programming`
  }
];

export default function MfpWhitepaper() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Mutation-First Programming — TrainChat® Whitepaper"
      description="Establishes the Mutation-First Programming Principle (MFP) — the principle that the correct response to new athlete information is the most surgical available intervention — and defines the five-level decision hierarchy through which coaching precision is operationalized."
      schema={schema}
      canonical="/whitepapers/mutation-first-programming"
      breadcrumbs={[
        { name: "Whitepapers", url: "/whitepapers" },
        { name: "Mutation-First Programming", url: "/whitepapers/mutation-first-programming" },
      ]}
      articleDatePublished="2025-05-16"
      articleDateModified="2025-05-16"
    >
      <div className="space-y-8">
        <div>
          <button onClick={() => navigate("/whitepapers")} className="text-xs text-muted-foreground hover:text-primary transition-colors mb-4 flex items-center gap-1">
            ← Publications
          </button>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Whitepaper · MFP · 2025</p>
          <h1 className="text-2xl font-bold tracking-tight leading-snug mb-1">Mutation-First Programming</h1>
          <p className="text-base text-muted-foreground italic">A Change Management Principle for Adaptive Training Systems</p>
          <p className="text-xs text-muted-foreground mt-2">Published by TrainChat® · trainchat.ai/whitepapers/mutation-first-programming</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {["MFP", "Program Mutation", "Adaptive Programming", "Change Management", "Living Systems"].map((tag) => (
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

        <div className="border-t border-border pt-6">
          <p className="text-xs font-semibold text-foreground mb-3">Related Publications</p>
          <div className="space-y-2">
            {[
              { label: "The Adaptive Coaching Architecture", path: "/whitepapers/adaptive-coaching-architecture" },
              { label: "The Problem With Static Programming", path: "/whitepapers/the-problem-with-static-programming" }
            ].map((item) => (
              <button key={item.path} onClick={() => navigate(item.path)} className="block text-sm text-primary hover:underline">
                {item.label} →
              </button>
            ))}
          </div>
        </div>
      </div>
    </AeoLayout>
  );
}
