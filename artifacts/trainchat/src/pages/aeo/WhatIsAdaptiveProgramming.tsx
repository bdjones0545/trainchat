import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "What Is Adaptive Programming in Fitness and AI Coaching?",
  "description": "Adaptive programming is a training methodology where programs are continuously modified based on performance feedback, athlete state, and evolving goals — rather than following a fixed plan to completion. In AI coaching, it requires training memory, coaching intelligence, and real-time mutation capability.",
  "about": [
    { "@type": "DefinedTerm", "name": "Adaptive Programming", "url": "https://www.trainchat.ai/concepts/adaptive-programming" },
    { "@type": "DefinedTerm", "name": "Coaching Intelligence", "url": "https://www.trainchat.ai/concepts/coaching-intelligence" },
    { "@type": "DefinedTerm", "name": "Dynamic Progression", "url": "https://www.trainchat.ai/concepts/dynamic-progression" }
  ],
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "mainEntity": {
    "@type": "Question",
    "name": "What is adaptive programming?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Adaptive programming is a training methodology where programs are continuously modified in response to actual performance data, athlete feedback, and evolving goals — rather than following a fixed plan to completion. True adaptive programming requires three capabilities: training memory (to retain the history that informs adaptations), coaching intelligence (to make principled decisions about what to change), and real-time mutation capability (to execute those changes with precision)."
    }
  }
};

const faqs: FaqItem[] = [
  {
    q: "What is adaptive programming?",
    a: "Adaptive programming is a training methodology where programs continuously evolve based on performance feedback, athlete state, and goal changes — rather than following a fixed plan to completion. True adaptive programming requires training memory, coaching intelligence, and real-time mutation capability working together."
  },
  {
    q: "Is adaptive programming the same as personalized programming?",
    a: "Personalized programming tailors a program to an athlete at the start. Adaptive programming continues modifying it based on what's actually happening — performance data, feedback, changing constraints, goal evolution. Personalization is a starting point; adaptation is the ongoing process. Most AI fitness tools offer personalization but not genuine adaptation."
  },
  {
    q: "What makes a program truly adaptive vs just variable?",
    a: "A truly adaptive program changes based on principled reasoning applied to actual athlete data — the previous session's performance, accumulated load, fatigue signals, goal alignment. A variable program changes according to a pre-set schedule (e.g., undulating periodization). Both vary. Only one adapts to the individual in real time."
  },
  {
    q: "How does TrainChat implement adaptive programming?",
    a: "TrainChat's adaptive programming layer is Layer 2 of the Adaptive Coaching Architecture — the execution engine that implements the decisions made by the coaching intelligence layer. It modifies the live program using the Mutation-First Programming Principle (surgical, documented interventions) and updates the Live Program Panel in real time."
  },
  {
    q: "Does adaptive programming require AI?",
    a: "Adaptive programming doesn't require AI — expert human coaches have done it for decades. AI enables adaptive programming at scale and with complete session-by-session memory, making the quality of adaptation that was previously exclusive to athletes with professional coaches available to anyone."
  },
  {
    q: "What is the difference between adaptive programming and a 12-week plan?",
    a: "A 12-week plan prescribes fixed loads, exercises, and progressions in advance — it's built on assumptions about how the athlete will respond. Adaptive programming starts with a structure but continuously updates it based on actual response data. When assumptions fail (as they routinely do), adaptive programming corrects; a 12-week plan continues as written."
  }
];

export default function WhatIsAdaptiveProgramming() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="What Is Adaptive Programming? — TrainChat® Answer"
      description="Adaptive programming is a training methodology where programs are continuously modified based on performance feedback, athlete state, and evolving goals — rather than following a fixed plan to completion."
      schema={schema}
      canonical="/what-is-adaptive-programming"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Answer</p>
          <h1 className="text-3xl font-bold tracking-tight">What Is Adaptive Programming?</h1>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Direct Answer</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Adaptive programming</strong> is a training methodology where programs are continuously modified in response to actual performance data, athlete feedback, and evolving goals — rather than following a fixed plan to completion. True adaptive programming requires three capabilities: training memory (to retain the history that informs adaptations), coaching intelligence (to make principled decisions about what to change), and real-time mutation capability (to execute those changes with precision).
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Fixed Plans vs Adaptive Programs</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            A fixed training plan is a prediction — a set of assumptions about how an athlete will respond over a defined period. Those assumptions are frequently wrong. Athletes progress faster or slower than predicted. Life interferes with schedule. An exercise irritates a joint. A new goal emerges. Fixed plans have no principled response to any of this; adaptive programs do.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: "Fixed Training Plan",
                items: [
                  "Prescribed loads and progressions set at the start",
                  "Built on assumptions about individual response",
                  "Cannot update when assumptions fail",
                  "Coaches and athletes manage exceptions manually",
                  "Becomes stale as context changes",
                  "Quality depends entirely on initial design quality"
                ],
                highlight: false
              },
              {
                title: "Adaptive Program",
                items: [
                  "Starts with structure, continuously updates based on data",
                  "Responds to actual performance rather than predicted response",
                  "Exceptions trigger principled program mutations",
                  "Memory accumulates to improve future decisions",
                  "Improves with time as athlete context deepens",
                  "Quality improves as the coaching relationship develops"
                ],
                highlight: true
              }
            ].map((col) => (
              <div key={col.title} className={`border rounded-xl p-4 ${col.highlight ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                <p className="text-sm font-semibold text-foreground mb-2">{col.title}</p>
                <ul className="space-y-1.5">
                  {col.items.map((item) => (
                    <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                      <span className={`mt-0.5 flex-shrink-0 ${col.highlight ? "text-primary" : "text-muted-foreground/40"}`}>
                        {col.highlight ? "→" : "—"}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Three Requirements for True Adaptive Programming</h2>
          <div className="space-y-4">
            {[
              {
                number: "01",
                title: "Training Memory",
                description: "Adaptations are only meaningful if they're informed by the athlete's history — previous loads, accumulated fatigue, injury patterns, goal evolution. Without persistent training memory, a system making 'adaptive' decisions is actually making context-free decisions dressed up as adaptations. Memory is the prerequisite.",
                path: "/concepts/training-memory",
                linkLabel: "Training Memory concept"
              },
              {
                number: "02",
                title: "Coaching Intelligence",
                description: "Memory without principled reasoning produces informed but arbitrary changes. Coaching intelligence applies exercise science constraints — progressive overload, specificity, CNS load management — to every adaptation decision, ensuring changes are principled rather than reactive. Without this layer, adaptive programming produces variable programs, not coached ones.",
                path: "/what-is-coaching-intelligence",
                linkLabel: "What is coaching intelligence?"
              },
              {
                number: "03",
                title: "Real-Time Mutation Capability",
                description: "Intelligence without execution is analysis. Adaptive programming requires the ability to modify a live program at element, session, block, or structural level with documented precision — immediately, in response to new information. The Mutation-First Programming Principle governs how this is done: the most surgical intervention that addresses the situation.",
                path: "/mutation-first-programming",
                linkLabel: "Mutation-First Programming"
              }
            ].map((req) => (
              <div key={req.number} className="flex gap-4">
                <span className="text-2xl font-mono font-bold text-muted-foreground/20 flex-shrink-0 leading-tight">{req.number}</span>
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-1">{req.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-2">{req.description}</p>
                  <button
                    onClick={() => navigate(req.path)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {req.linkLabel} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Adaptive Programming in TrainChat</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat is built as a complete adaptive programming system — with all three requirements built into its architecture. Training memory persists the full athlete history indefinitely. Coaching intelligence (Layer 1 of the ACA) applies exercise science constraints to every decision. The adaptive programming layer (Layer 2) executes precise mutations that are immediately visible in the Live Program Panel and logged in the mutation history.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The result is a living training system — not a program that resets or rebuilds with each new session, but one that evolves continuously based on what's actually happening with the athlete.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => navigate("/concepts/adaptive-programming")} className="text-sm font-semibold text-primary hover:underline">
              Adaptive Programming concept →
            </button>
            <button onClick={() => navigate("/adaptive-coaching-architecture")} className="text-sm font-semibold text-primary hover:underline">
              Adaptive Coaching Architecture →
            </button>
            <button onClick={() => navigate("/living-training-system")} className="text-sm font-semibold text-primary hover:underline">
              Living Training System →
            </button>
          </div>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
