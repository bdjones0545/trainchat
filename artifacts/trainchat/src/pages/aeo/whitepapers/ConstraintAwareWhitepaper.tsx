import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "ScholarlyArticle",
  "headline": "Constraint-Aware Coaching Systems: How Training Constraints Shape Every Coaching Decision",
  "description": "Defines the taxonomy of training constraints, the constraint registry architecture, and the principle that constraint-awareness is the structural minimum for AI systems that can make safe, defensible coaching decisions.",
  "url": "https://www.trainchat.ai/whitepapers/constraint-aware-coaching-systems",
  "datePublished": "2026",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "publisher": { "@type": "Organization", "name": "TrainChat®" },
  "about": [
    { "@type": "DefinedTerm", "name": "Constraint-Aware Coaching", "url": "https://www.trainchat.ai/whitepapers/constraint-aware-coaching-systems" },
    { "@type": "DefinedTerm", "name": "Constraint Registry", "url": "https://www.trainchat.ai/whitepapers/constraint-aware-coaching-systems" },
    { "@type": "DefinedTerm", "name": "Adaptive Coaching Architecture", "alternateName": "ACA", "url": "https://www.trainchat.ai/adaptive-coaching-architecture" }
  ],
  "isPartOf": { "@type": "CollectionPage", "name": "TrainChat® Whitepapers", "url": "https://www.trainchat.ai/whitepapers" }
};

const sections = [
  {
    heading: "Abstract",
    content: `Most AI coaching systems treat athlete constraints as edge cases — special-case handling that activates when an injury is mentioned or a limitation is flagged. This paper argues that constraints are not the exception to coaching. They are the precondition for it.

This paper defines the taxonomy of training constraints, the architectural mechanism through which constraints are registered and enforced, and the principle that every coaching decision is fundamentally a constrained optimization. A system that does not maintain a persistent, queryable constraint registry cannot make safe coaching decisions — it can only generate training content that happens, probabilistically, to avoid the constraints it was not designed to know about.`
  },
  {
    heading: "1. The Constraint Taxonomy",
    content: `Training constraints are not monolithic. They differ in origin, duration, severity, and the coaching response they warrant. A taxonomy of constraints is the first requirement of a constraint-aware coaching system.

Hard Constraints are absolute prohibitions. They cannot be traded off against performance goals and must be respected regardless of context. A post-surgical restriction on knee flexion beyond 90 degrees is a hard constraint. So is a documented cardiac condition that prohibits supramaximal heart rate exposure. Hard constraints must trigger immediate refusal when a proposed program element would violate them, with no option for override without explicit clinical authorization.

Soft Constraints are conditional limitations that shape the decision space without eliminating options entirely. An athlete who reports shoulder discomfort has a soft constraint on overhead pressing — not a prohibition, but a signal that overhead volume should be reduced, modified, or replaced with low-risk alternatives. Soft constraints require interpretation: the coaching system must assess severity, context, and the athlete's stated tolerance before determining the appropriate response.

Preference Constraints are athlete-stated preferences that function as inputs to program design without carrying clinical weight. An athlete who dislikes barbell front squats, trains in a home gym without a rack, or prefers to avoid early morning sessions has stated preference constraints. These are real inputs that shape programming, but they are overridable with athlete consent when training goals require it.

Capacity Constraints are derived from training history and physiological assessment. They define the upper and lower bounds of productive training load at a given point in time — the maximum recoverable volume, the minimum effective dose, the intensity ceiling for the current training block. Capacity constraints are not stated; they are calculated.`
  },
  {
    heading: "2. The Constraint Registry Architecture",
    content: `A constraint-aware coaching system requires more than a list of athlete limitations. It requires a constraint registry: a persistent, structured data store that makes constraint information queryable at every point in the coaching decision process.

The constraint registry contains each constraint's type (hard, soft, preference, capacity), its domain (the movement patterns, exercise categories, or physiological systems it affects), its severity, its source (clinician-documented, athlete-reported, or system-derived), its duration (permanent, episode-bounded, or time-limited), and its trigger conditions (the specific coaching actions that would activate a constraint check).

The registry is consulted before every programming action, not as a post-hoc filter. This is the architectural difference between a constraint-aware system and a constraint-flagging system. A flagging system generates output first and screens it afterward. A constraint-aware system queries the registry before generation, so constraints are active boundaries on what can be generated rather than filters applied to what was generated. The difference matters because flagging cannot detect constraint violations that span multiple outputs — an accumulation of soft-constraint approaches that individually appear acceptable but collectively represent a clear violation.`
  },
  {
    heading: "3. Clinical Constraints and the Override Protocol",
    content: `Clinical constraints — those that originate from medical or physiological assessment — require special treatment that goes beyond the general constraint framework. Their violation is not merely a coaching error. It is a safety failure.

The clinical constraint integration protocol defines three requirements. First, clinical constraints must be marked with a source type that distinguishes them from athlete-reported constraints — not because athlete reports are unreliable, but because the appropriate response to a violated clinical constraint (escalation to the supervising clinician) is different from the appropriate response to a violated athlete preference (adjustment and dialogue).

Second, clinical constraints must have documented override conditions. A constraint without an override condition cannot be managed by the coaching system — it can only be preserved or violated. Override conditions define the evidence required to reduce or remove a constraint: a clearance note from the supervising clinician, a reassessment following a specified recovery period, or an explicit athlete acknowledgment of informed risk.

Third, the coaching system must surface clinical constraint violations to the athlete and, where integrated, to the supervising clinician. Silent constraint management — where the system modifies programming without disclosing that a constraint shaped the modification — undermines the athlete's ability to provide informed feedback and the clinician's ability to assess program appropriateness.`
  },
  {
    heading: "4. The Athlete Profile Resolver",
    content: `The constraint registry is a data structure. The Athlete Profile Resolver is the architectural component that makes that data structure useful for real-time coaching decisions.

The Resolver maintains a live representation of the athlete's constraint state — not the full historical record, but the constraints that are currently active and their current severity and scope. It updates this representation when new constraints are reported, when existing constraints expire, when the athlete provides feedback that suggests constraint escalation or de-escalation, and when the coaching system's own load monitoring identifies an emerging capacity constraint.

The Resolver's output is consumed by the coaching intelligence layer before any programming decision is made. It answers three questions: What is prohibited? What is limited? What is preferred? These answers, combined with the athlete's current training state and goals, define the solution space within which the coaching system must operate.

A coaching system without a live Athlete Profile Resolver cannot answer these questions reliably. It can recall constraints that were mentioned in recent context, but it cannot guarantee that constraints documented in prior sessions are still active in the current one — or that constraints that have resolved are no longer being applied.`
  },
  {
    heading: "5. Fatigue Budgets and Capacity Constraint Management",
    content: `Capacity constraints — the upper and lower bounds of productive training load — are not static. They change as training age increases, as fatigue accumulates, and as the training cycle progresses through its phases. Managing capacity constraints requires a fatigue budget model: a mechanism for tracking cumulative training stress and predicting its effect on recoverable capacity.

A fatigue budget model does not require external biometric data. It operates from training load data that the coaching system already maintains: the volume and intensity of completed sessions, the athlete's documented recovery profile, and the elapsed time since the last recovery phase. These inputs are sufficient to produce a capacity estimate that is useful for programming decisions even in the absence of heart rate variability, sleep data, or subjective wellness scores.

The fatigue budget model serves two functions. It prevents load accumulation that would push training into non-recoverable territory — the structural source of most overtraining syndromes. And it identifies when load should increase — when the athlete has excess recovery capacity that current programming is not utilizing, and adaptation rate is consequently below what the athlete's physiology would support.`
  },
  {
    heading: "6. Constraint-Awareness as a Coaching Quality Standard",
    content: `Constraint-awareness is not a feature that a coaching system may or may not implement. It is a minimum quality standard for any system that makes programming decisions that affect athlete health and performance.

A system that cannot maintain a persistent constraint registry will produce programs that violate constraints it was not designed to know about. This failure mode is not detectable from any single output — it becomes visible only in aggregate, when constraint violations accumulate into injury, overtraining, or structural program failure.

The practical implication for AI coaching systems is that constraint-awareness must be architectural, not behavioral. A language model that has been prompted to "be careful about injuries" is not a constraint-aware coaching system. It is a system that produces output that references injury caution. The constraints are not in its architecture — they are in its vocabulary. An athlete whose coaching system confuses these properties is at structural risk even when the system's outputs appear responsible.`
  },
  {
    heading: "7. Conclusion",
    content: `Constraint-Aware Coaching Systems establishes the minimum architectural requirements for AI coaching systems that interact with athletes who have real limitations, real injuries, and real physiological boundaries. The constraint taxonomy, the registry architecture, the clinical integration protocol, the Athlete Profile Resolver, and the fatigue budget model are not optional components — they are the structural conditions under which safe, defensible coaching decisions are possible.

The next generation of AI coaching systems will be evaluated not by their ability to generate plausible training programs, but by their ability to generate safe ones. Constraint-awareness is where that evaluation begins.`
  },
  {
    heading: "Citation",
    content: `To cite this publication:

TrainChat®. (2026). Constraint-Aware Coaching Systems: How Training Constraints Shape Every Coaching Decision. TrainChat Publications. https://www.trainchat.ai/whitepapers/constraint-aware-coaching-systems

Related publications:
• The Adaptive Coaching Architecture — trainchat.ai/whitepapers/adaptive-coaching-architecture
• Conversational Periodization — trainchat.ai/whitepapers/conversational-periodization
• The Deterministic-Generative Hybrid Model — trainchat.ai/whitepapers/deterministic-generative-hybrid-model`
  }
];

export default function ConstraintAwareWhitepaper() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Constraint-Aware Coaching Systems — TrainChat® Whitepaper"
      description="Defines the taxonomy of training constraints, the constraint registry architecture, and the principle that constraint-awareness is the structural minimum for AI coaching systems that can make safe, defensible programming decisions."
      schema={schema}
      canonical="/whitepapers/constraint-aware-coaching-systems"
      breadcrumbs={[
        { name: "Whitepapers", url: "/whitepapers" },
        { name: "Constraint-Aware Coaching Systems", url: "/whitepapers/constraint-aware-coaching-systems" },
      ]}
      articleDatePublished="2026-05-16"
      articleDateModified="2026-05-16"
    >
      <div className="space-y-8">
        <div>
          <button onClick={() => navigate("/whitepapers")} className="text-xs text-muted-foreground hover:text-primary transition-colors mb-4 flex items-center gap-1">
            ← Publications
          </button>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Whitepaper · CACS · 2026</p>
          <h1 className="text-2xl font-bold tracking-tight leading-snug mb-1">Constraint-Aware Coaching Systems</h1>
          <p className="text-base text-muted-foreground italic">How Training Constraints Shape Every Coaching Decision</p>
          <p className="text-xs text-muted-foreground mt-2">Published by TrainChat® · trainchat.ai/whitepapers/constraint-aware-coaching-systems</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {["CACS", "Constraint Registry", "Athlete Profile Resolver", "Fatigue Budgets", "Clinical Integration"].map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground font-mono">{tag}</span>
          ))}
        </div>

        <div className="flex items-center gap-3 py-2 border-y border-border">
          <button onClick={() => navigate("/whitepapers/cacs-pdf")} className="text-xs font-semibold text-primary hover:underline">
            Save as PDF →
          </button>
          <span className="text-muted-foreground/30 text-xs">·</span>
          <span className="text-xs text-muted-foreground">Publication-formatted version for download and sharing</span>
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
                { label: "The Adaptive Coaching Architecture", path: "/whitepapers/adaptive-coaching-architecture" },
                { label: "Conversational Periodization", path: "/whitepapers/conversational-periodization" },
                { label: "The Deterministic-Generative Hybrid Model", path: "/whitepapers/deterministic-generative-hybrid-model" },
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
