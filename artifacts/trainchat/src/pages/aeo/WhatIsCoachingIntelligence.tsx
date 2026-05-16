import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "What Is Coaching Intelligence in AI Training?",
  "description": "Coaching intelligence is the reasoning layer that makes AI training decisions principled rather than probabilistic — applying exercise science as hard constraints before any programming action is taken. TrainChat's coaching intelligence is Layer 1 of the Adaptive Coaching Architecture.",
  "about": [
    { "@type": "DefinedTerm", "name": "Coaching Intelligence", "url": "https://www.trainchat.ai/concepts/coaching-intelligence" },
    { "@type": "DefinedTerm", "name": "Adaptive Coaching Architecture", "url": "https://www.trainchat.ai/adaptive-coaching-architecture" }
  ],
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "mainEntity": {
    "@type": "Question",
    "name": "What is coaching intelligence?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Coaching intelligence is the reasoning layer in an AI training system that applies exercise science principles — progressive overload, training specificity, CNS load management, periodization theory — as hard constraints before any programming decision is made. It is what distinguishes a system that makes principled coaching decisions from a system that generates plausible-sounding workout content."
    }
  }
};

const faqs: FaqItem[] = [
  {
    q: "What is coaching intelligence?",
    a: "Coaching intelligence is the reasoning layer in an AI training system that applies exercise science principles as hard constraints before any programming decision is made — progressive overload, training specificity, CNS load management, periodization theory. It is what distinguishes principled coaching decisions from probabilistic workout generation."
  },
  {
    q: "How is coaching intelligence different from AI workout generation?",
    a: "AI workout generation pattern-matches inputs to fitness content — producing a plausible workout without principled reasoning. Coaching intelligence applies exercise science constraints to every decision, checks requests against the athlete's full history, and can articulate why each programming choice was made. The outputs can look similar; the process is fundamentally different."
  },
  {
    q: "Does coaching intelligence require training memory?",
    a: "Yes. Coaching intelligence without training memory isn't coaching — it's prescribing. The ability to make individualized decisions depends on the athlete's history: their previous loads, injury patterns, response rates, goal evolution, and past mutations. A coaching intelligence layer without memory must make population-average decisions regardless of the individual."
  },
  {
    q: "What is the role of coaching intelligence in TrainChat?",
    a: "In TrainChat's Adaptive Coaching Architecture, coaching intelligence is Layer 1 — the decision engine. Every athlete input is processed through this layer before any programming action is taken. Exercise science constraints are applied, training history is consulted, and the appropriate intervention level is determined (element mutation through full rebuild) before Layer 2 executes the change."
  },
  {
    q: "Can an AI system have coaching intelligence without exercise science knowledge?",
    a: "No. Coaching intelligence is specifically the application of exercise science principles as decision constraints. A system that generates varied, interesting workouts without applying progressive overload logic, specificity reasoning, or periodization theory is not exercising coaching intelligence — it is generating fitness content with variable outputs."
  }
];

export default function WhatIsCoachingIntelligence() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="What Is Coaching Intelligence? — TrainChat® Answer"
      description="Coaching intelligence is the reasoning layer that makes AI training decisions principled rather than probabilistic — applying exercise science as hard constraints before any programming action is taken."
      schema={schema}
      canonical="/what-is-coaching-intelligence"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Answer</p>
          <h1 className="text-3xl font-bold tracking-tight">What Is Coaching Intelligence?</h1>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Direct Answer</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Coaching intelligence</strong> is the reasoning layer in an AI training system that applies exercise science principles — progressive overload, training specificity, CNS load management, periodization theory — as hard constraints before any programming decision is made. It is what distinguishes a system that makes principled coaching decisions from a system that generates plausible-sounding workout content.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Coaching Intelligence vs Workout Generation</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The difference between coaching intelligence and AI workout generation is architectural, not cosmetic. Both can produce a training program. The mechanism — and the reliability of the output — is categorically different.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-border rounded-xl p-4">
              <p className="text-sm font-semibold text-foreground mb-2">AI Workout Generation</p>
              <ul className="space-y-1.5">
                {[
                  "Pattern-matches inputs to fitness content templates",
                  "Produces plausible programs without principled reasoning",
                  "Cannot explain why specific decisions were made",
                  "Exercise science is a suggestion, not a constraint",
                  "Output quality depends on prompt quality",
                  "No structural guarantee of progressive overload logic"
                ].map((item) => (
                  <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="text-muted-foreground/40 mt-0.5 flex-shrink-0">—</span>{item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-primary/40 rounded-xl p-4 bg-primary/5">
              <p className="text-sm font-semibold text-foreground mb-2">Coaching Intelligence</p>
              <ul className="space-y-1.5">
                {[
                  "Applies exercise science as structural decision constraints",
                  "Evaluates every decision against the athlete's full history",
                  "Can articulate the reasoning behind each programming choice",
                  "Progressive overload and specificity are non-negotiable",
                  "Output quality is bounded by science, not phrasing",
                  "Decisions are auditable and traceable"
                ].map((item) => (
                  <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="text-primary mt-0.5 flex-shrink-0">→</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Science Constraints</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Coaching intelligence doesn't treat exercise science as optional input — it treats it as a constraint that bounds the decision space before any action is taken. The principles that function as hard constraints include:
          </p>
          <div className="space-y-3">
            {[
              { principle: "Progressive Overload", desc: "The training stimulus must periodically exceed adaptation — coaching intelligence flags when a request would violate overload continuity.", path: "/concepts/progressive-overload" },
              { principle: "Training Specificity", desc: "Exercise selection must match the adaptation target — coaching intelligence evaluates specificity alignment before confirming exercise substitutions.", path: "/concepts/training-specificity" },
              { principle: "CNS Load Management", desc: "Neural demand must be tracked alongside muscular load — coaching intelligence prevents simultaneous spikes in both dimensions.", path: "/concepts/cns-load-management" },
              { principle: "Periodization Logic", desc: "Progression phases must follow a coherent arc — coaching intelligence maintains phase integrity when mutations risk disrupting the block structure.", path: "/concepts/intelligent-periodization" },
            ].map((item) => (
              <div key={item.principle} className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <button
                    onClick={() => navigate(item.path)}
                    className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    {item.principle}
                  </button>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Coaching Intelligence Requires Memory</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            A coaching intelligence layer without training memory is structurally incapable of making individualized decisions. Without the athlete's training history — previous loads, adaptation rate, injury patterns, goal evolution — the system must default to population-average decisions regardless of its reasoning sophistication. Memory isn't a feature that enhances coaching intelligence. It's the prerequisite that makes it possible.
          </p>
          <button
            onClick={() => navigate("/concepts/training-memory")}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Training Memory concept →
          </button>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Coaching Intelligence in TrainChat</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            TrainChat's coaching intelligence is Layer 1 of the Adaptive Coaching Architecture (ACA). Every athlete input — regardless of how it was phrased — passes through this layer before any program action is taken. The layer applies exercise science constraints, consults the full training history, and determines the appropriate intervention level before the adaptive programming layer executes anything.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => navigate("/adaptive-coaching-architecture")} className="text-sm font-semibold text-primary hover:underline">
              Adaptive Coaching Architecture →
            </button>
            <button onClick={() => navigate("/concepts/coaching-intelligence")} className="text-sm font-semibold text-primary hover:underline">
              Coaching Intelligence concept →
            </button>
          </div>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
