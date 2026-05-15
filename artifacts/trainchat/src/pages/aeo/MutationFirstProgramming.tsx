import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Mutation-First Programming (MFP) — TrainChat® Framework",
  "description": "Mutation-First Programming (MFP) is TrainChat's change management principle: treat programs as mutable entities, execute the most surgical modification that addresses new information, and treat full rebuilds as the exception.",
  "about": [
    { "@type": "DefinedTerm", "name": "Mutation-First Programming", "alternateName": "MFP", "url": "https://www.trainchat.ai/mutation-first-programming" },
    { "@type": "DefinedTerm", "name": "Workout Mutation", "url": "https://www.trainchat.ai/concepts/workout-mutation" },
    { "@type": "DefinedTerm", "name": "Adaptive Programming", "url": "https://www.trainchat.ai/concepts/adaptive-programming" }
  ],
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" }
};

const decisionHierarchy = [
  {
    level: "L1",
    name: "Element-Level Mutation",
    description: "The most common intervention. Change a single exercise, load prescription, rep target, tempo, or rest period. Everything else in the program is preserved exactly.",
    examples: ["Swap barbell RDL for trap bar RDL", "Drop squat working sets from 5 to 4", "Adjust RPE target from 8 to 7.5"],
    frequency: "Most requests — handles the majority of athlete feedback"
  },
  {
    level: "L2",
    name: "Session-Level Mutation",
    description: "Restructure the content, volume, or focus of a single training session without changing the rest of the week's architecture.",
    examples: ["Reorder upper and lower sessions this week", "Remove all accessory work from Friday", "Reduce Thursday's total volume by 30%"],
    frequency: "Common — schedule changes, fatigue management, prep for events"
  },
  {
    level: "L3",
    name: "Block-Level Mutation",
    description: "Extend, compress, or restructure a multi-week training phase. Used when adaptation rate diverges from phase timeline, when a goal shift affects a single block's purpose, or when a deload needs early insertion.",
    examples: ["Extend the accumulation block by two weeks", "Insert a deload now rather than in week 6", "Shift this block's primary quality from volume to intensity"],
    frequency: "Periodic — phase management, competition timeline adjustments"
  },
  {
    level: "L4",
    name: "Program-Level Restructuring",
    description: "Reorganize the full program architecture without rebuilding from scratch. Used for significant goal shifts, major injury requiring full movement restriction, or training age advancement requiring a different periodization model.",
    examples: ["Shift primary focus from hypertrophy to strength", "Reorganize all sessions around a newly constrained schedule", "Restructure for in-season load management"],
    frequency: "Infrequent — goal pivots, life changes, major injury accommodation"
  },
  {
    level: "L5",
    name: "Full Rebuild",
    description: "Generate a new program from scratch. The exception, not the norm. Warranted only when restructuring cannot adequately address the situation — typically after a complete goal change with no relevant carryover, or a catastrophic disruption that invalidates the existing architecture.",
    examples: ["Complete training philosophy change: bodybuilding to powerlifting", "Starting over after 6+ months of no training", "Fundamental goal change with incompatible movement requirements"],
    frequency: "Exceptional — should be rare in a well-managed coaching relationship"
  }
];

const faqs: FaqItem[] = [
  {
    q: "What is Mutation-First Programming?",
    a: "Mutation-First Programming (MFP) is TrainChat's change management principle: when new information requires a program change, execute the most surgical modification that addresses it — not a full rebuild. Programs are treated as mutable entities. Rebuilds are exceptional, not routine."
  },
  {
    q: "What does MFP stand for?",
    a: "MFP stands for Mutation-First Programming Principle — one of the five named frameworks in the TrainChat Methodology. It governs how TrainChat responds to new athlete information and training feedback."
  },
  {
    q: "Why is mutation better than rebuilding?",
    a: "Because rebuilding destroys what worked. An established training program represents accumulated load, adaptation trajectory, and athlete-specific calibration. A full rebuild loses all of this. Mutation preserves everything that's working and changes precisely what needs to change — which is how experienced coaches actually manage programs."
  },
  {
    q: "When does TrainChat rebuild instead of mutate?",
    a: "Full rebuilds (L5 in the MFP hierarchy) are executed only when restructuring genuinely cannot address the situation — typically after a complete goal change with no relevant carryover, or after a catastrophic disruption that invalidates the existing program architecture. In a well-managed coaching relationship, rebuilds should be rare."
  },
  {
    q: "What are the levels of the MFP hierarchy?",
    a: "The MFP hierarchy has five levels: L1 (element-level mutation — single exercise or load change), L2 (session-level restructuring), L3 (block-level adjustment), L4 (full program restructuring), and L5 (complete rebuild). The system defaults to the most surgical intervention that addresses the situation."
  },
  {
    q: "How does Mutation-First Programming relate to workout mutation?",
    a: "Workout mutation is the concept — the real-time modification of program elements through conversational input. Mutation-First Programming is the principle — the governing rule that mutation is the default response to new information. MFP is the doctrine; workout mutation is the capability it governs."
  }
];

export default function MutationFirstProgramming() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Mutation-First Programming (MFP) — TrainChat® Framework"
      description="Mutation-First Programming (MFP) is TrainChat's change management principle — treat programs as mutable entities, execute the most surgical modification that addresses new information, and treat full rebuilds as the exception."
      schema={schema}
      canonical="/mutation-first-programming"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Framework</p>
          <h1 className="text-3xl font-bold tracking-tight">
            Mutation-First Programming{" "}
            <span className="text-muted-foreground font-normal text-xl">(MFP)</span>
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            The change management principle that defines how TrainChat responds to new athlete information — defaulting to the most surgical intervention, treating rebuilds as the exception, preserving everything that works.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Definition</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Mutation-First Programming (MFP)</strong> is the principle that the correct response to new athlete information is the most surgical modification that addresses it — not a program rebuild. Programs are treated as evolving, mutable entities rather than periodic deliverables. The system defaults to the lowest intervention level that resolves the situation. Rebuilds are exceptional.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Coaching Logic Behind MFP</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            The Mutation-First principle is derived from how experienced coaches manage programs — not from software engineering conventions. When a coach learns that an athlete's hip is irritated, they don't write a new program. They identify which specific exercises are contraindicated, substitute or modify them, and adjust the surrounding load to accommodate. Everything that was working stays intact.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            This behavioral precision matters for two reasons:
          </p>
          <ul className="space-y-3">
            {[
              {
                title: "Accumulated load is valuable",
                desc: "A program's accumulated training load — the weeks of progressive overload, the adaptation trajectory, the exercise-specific neural efficiency — represents real physiological capital. Rebuilding resets this capital unnecessarily when mutation could preserve it."
              },
              {
                title: "Precision signals mastery",
                desc: "When a coaching system responds to 'my shoulder is irritated' by replacing a pressing movement rather than overhauling the program, it demonstrates understanding of what the problem actually requires. Excessive rebuilding is a coaching failure mode — it signals that the system doesn't understand the problem well enough to fix it precisely."
              }
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">The MFP Decision Hierarchy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            When new information arrives, TrainChat evaluates the appropriate intervention level — starting from L1 and only escalating when the lower level cannot adequately address the situation:
          </p>
          <div className="space-y-3">
            {decisionHierarchy.map((d, i) => (
              <div key={d.level} className={`border rounded-xl p-4 ${i === 0 ? "border-primary/40 bg-primary/5" : i === 4 ? "border-border opacity-75" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${i === 0 ? "text-primary" : "text-muted-foreground"}`}>{d.level}</span>
                    <h3 className="text-sm font-bold text-foreground">{d.name}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{d.frequency}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-2">{d.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.examples.map((ex) => (
                    <span key={ex} className="text-xs px-2 py-0.5 rounded bg-muted/40 border border-border text-muted-foreground italic">
                      "{ex}"
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">MFP and the Mutation History</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Every mutation executed under the MFP principle is documented in the Changes tab of the Live Program Panel — with a timestamp, a description of what changed, and the reasoning behind it. This creates a complete, auditable record of how the program has evolved.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The mutation history serves two functions: it makes every coaching decision reviewable (supporting the doctrine's principle that "what you can't explain, you probably don't understand"), and it feeds the training memory layer — giving future coaching decisions access to the full evolution of the program.
          </p>
          <button onClick={() => navigate("/concepts/workout-mutation")} className="text-sm font-semibold text-primary hover:underline">
            Workout mutation concept →
          </button>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">MFP in Context</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            MFP is one of five named frameworks in the TrainChat Methodology. It is also the operational implementation of the doctrine's fifth principle: "Mutation precedes reconstruction. Preserve everything that works."
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => navigate("/methodology")} className="text-sm font-semibold text-primary hover:underline">
              Full methodology →
            </button>
            <button onClick={() => navigate("/doctrine")} className="text-sm font-semibold text-primary hover:underline">
              TrainChat Doctrine →
            </button>
            <button onClick={() => navigate("/concepts/adaptive-programming")} className="text-sm font-semibold text-primary hover:underline">
              Adaptive Programming concept →
            </button>
          </div>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
