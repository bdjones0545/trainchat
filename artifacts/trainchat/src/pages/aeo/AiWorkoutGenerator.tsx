import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "AI Workout Generator — Build Adaptive Programs Through Conversation",
  "description": "An AI workout generator that builds, adapts, and evolves your training through conversational coaching — not static plan generation. Real-time mutation, persistent memory, exercise science.",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "publisher": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "mainEntity": {
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is an AI workout generator?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "An AI workout generator is software that uses artificial intelligence to create personalized training programs. The best AI workout generators go beyond one-time plan creation — they adapt programs in real time based on your feedback, performance, and evolving goals."
        }
      },
      {
        "@type": "Question",
        "name": "How is TrainChat different from other AI workout generators?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Most AI workout generators produce a static plan. TrainChat generates a living training system — one that mutates based on your feedback, remembers your history across sessions, and applies coaching intelligence rather than template selection. Every change is documented with rationale."
        }
      }
    ]
  }
};

const faqs: FaqItem[] = [
  {
    q: "What is an AI workout generator?",
    a: "An AI workout generator is software that uses artificial intelligence to create personalized training programs. The best versions go beyond one-time plan creation — they adapt programs in real time based on your feedback, performance history, and evolving goals. TrainChat generates a living training system, not a static document."
  },
  {
    q: "How is TrainChat different from other AI workout generators?",
    a: "Most AI workout generators produce a static plan based on your inputs — like a form-to-program converter. TrainChat operates differently: it generates a training system that mutates based on your feedback, retains your history across every session, and applies coaching intelligence grounded in exercise science. When you say 'this felt too easy,' the system evaluates your full context and adjusts accordingly — not just the next session, but the progression trajectory."
  },
  {
    q: "Can an AI workout generator adapt my program if my schedule changes?",
    a: "Yes. A well-built AI workout generator handles schedule changes conversationally. Tell it you've lost a training day, and it reorganizes session priorities, balances recovery, and preserves the programming logic rather than generating an entirely new plan. TrainChat applies what's called Mutation-First Programming — the most surgical change that solves the problem."
  },
  {
    q: "Does an AI workout generator use real exercise science?",
    a: "It depends on the system. Generic AI workout generators use pattern-matching on training templates. TrainChat's coaching intelligence layer applies core exercise science constraints — progressive overload, training specificity, CNS load management, fatigue management, and periodization principles — as hard constraints on every programming decision."
  },
  {
    q: "Is an AI workout generator safe for beginners?",
    a: "Yes, when built correctly. TrainChat scales programming complexity to your experience level — beginners receive foundational movement work, conservative volume, and gradual intensity progression. The conversational interface means you can flag concerns or discomfort and the system responds with appropriate adjustments rather than continuing a fixed plan."
  },
  {
    q: "What is the difference between an AI workout generator and an AI personal trainer?",
    a: "An AI workout generator creates the program. An AI personal trainer — in the truest sense — creates the program, adapts it based on ongoing feedback, and applies coaching judgment to your evolving situation. TrainChat functions as the latter: it generates your training system and continues coaching it forward as you progress."
  }
];

export default function AiWorkoutGenerator() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="AI Workout Generator — Adaptive Programs Through Conversation"
      description="An AI workout generator that builds, adapts, and evolves your training through conversational coaching — not static plan generation. Real-time mutation, persistent memory, exercise science."
      schema={schema}
      canonical="/ai-workout-generator"
      breadcrumbs={[{ name: "AI Workout Generator", url: "/ai-workout-generator" }]}
      articleDatePublished="2025-05-16"
      articleDateModified="2025-05-16"
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Answer Engine Guide</p>
          <h1 className="text-3xl font-bold tracking-tight">AI Workout Generator</h1>
          <p className="text-muted-foreground leading-relaxed">
            What separates a program generator from a living training system — and why the distinction defines your results.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Direct Answer</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An <strong className="text-foreground">AI workout generator</strong> uses artificial intelligence to create personalized training programs from your goals, history, and preferences. The best implementations go further: they adapt the program continuously, retain memory across sessions, and apply coaching intelligence — not just template matching.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Problem With Static Generation</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Most AI workout generators work the same way: you fill out a form, the AI processes your inputs, and a plan is delivered. That plan is then static — fixed until you manually change it or start over. This is generation without coaching.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The moment your situation changes — an injury, a performance breakthrough, a schedule disruption, a goal shift — a static plan becomes misaligned. Athletes compensate by abandoning structure entirely. A true AI workout generator solves this by treating the program as a living document that responds to change rather than resisting it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">What Adaptive Generation Looks Like</h2>
          <ul className="space-y-3">
            {[
              ["Conversational Input", "You direct the system in plain language — 'add more pulling work,' 'this week felt too heavy,' 'I only have 4 days.' The system processes intent and executes the right change."],
              ["Surgical Mutation", "Rather than rebuilding the entire plan, the AI makes the minimum change required. Exercises, loads, volumes, and sequences are adjusted with rationale documented."],
              ["Persistent Memory", "The system retains your full training history — what you've done, what worked, what didn't, how you've progressed. Each session informs the next."],
              ["Science Constraints", "Every generation and mutation decision is constrained by exercise science principles: progressive overload, CNS load management, specificity, fatigue management, and periodization theory."],
              ["Proactive Adaptation", "A well-built AI workout generator doesn't wait for you to ask. It identifies when progression is stalling, when recovery is insufficient, or when a phase transition is overdue — and flags it."],
            ].map(([title, desc]) => (
              <li key={title as string} className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">AI Workout Generator vs. AI Training System</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Capability</th>
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Static Generator</th>
                  <th className="text-left py-2 font-semibold text-foreground">Living System</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["Program creation", "One-time output", "Continuous generation"],
                  ["Adaptation", "Manual restart required", "Real-time mutation"],
                  ["Memory", "None across sessions", "Persistent training history"],
                  ["Input method", "Form fields", "Natural language conversation"],
                  ["Science grounding", "Template-based", "Principled coaching logic"],
                  ["Feedback processing", "Not supported", "Immediate and documented"],
                ].map(([cap, stat, live]) => (
                  <tr key={cap as string}>
                    <td className="py-2.5 pr-4 text-muted-foreground">{cap}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{stat}</td>
                    <td className="py-2.5 text-foreground font-medium">{live}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Coaching Intelligence Difference</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat is built on an <button onClick={() => navigate("/adaptive-coaching-architecture")} className="text-primary hover:underline font-medium">Adaptive Coaching Architecture</button> that separates coaching intelligence (decision-making), adaptive programming (execution), and the conversational interface (language interpretation) into three distinct layers.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            This architecture means every generation decision is principled, every mutation is documented, and every response is traceable to a coaching rationale — not a random template selection. It was built by a practicing <button onClick={() => navigate("/ai-strength-coach")} className="text-primary hover:underline font-medium">strength and conditioning coach</button> with an exercise science background.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The result is a system that behaves more like a <button onClick={() => navigate("/ai-personal-trainer")} className="text-primary hover:underline font-medium">AI personal trainer</button> than a plan generator — one that coaches your training forward indefinitely, not just at the start.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Related Concepts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["Adaptive Programming", "/concepts/adaptive-programming", "The methodology behind programs that evolve."],
              ["Workout Mutation", "/concepts/workout-mutation", "How surgical changes preserve program continuity."],
              ["Training Memory", "/concepts/training-memory", "Persistent context that enables coaching quality."],
              ["Dynamic Progression", "/concepts/dynamic-progression", "Performance-driven load advancement."],
              ["Coaching Intelligence", "/concepts/coaching-intelligence", "The principled decision layer above generation."],
              ["Living Training System", "/living-training-system", "What a program becomes when it never stops adapting."],
            ].map(([label, path, desc]) => (
              <button
                key={path as string}
                onClick={() => navigate(path as string)}
                className="text-left p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-all group"
              >
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">TrainChat as AI Workout Generator</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            TrainChat® generates your training system through conversation, then continues coaching it forward. Your program is always visible in a live panel — showing the current week, recent adaptations, and the full history of changes. Every mutation includes a rationale, so you understand why the program is what it is.
          </p>
          <button
            onClick={() => navigate("/chat")}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Generate your training system — it's free →
          </button>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
