import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Adaptive Coaching Architecture (ACA) — TrainChat® Framework",
  "description": "The Adaptive Coaching Architecture (ACA) is TrainChat's three-layer AI coaching system — coaching intelligence, adaptive programming, and conversational interface working together to make principled, context-aware training decisions.",
  "about": [
    { "@type": "DefinedTerm", "name": "Adaptive Coaching Architecture", "alternateName": "ACA", "url": "https://www.trainchat.ai/adaptive-coaching-architecture" },
    { "@type": "DefinedTerm", "name": "Coaching Intelligence", "url": "https://www.trainchat.ai/concepts/coaching-intelligence" },
    { "@type": "DefinedTerm", "name": "Adaptive Programming", "url": "https://www.trainchat.ai/concepts/adaptive-programming" }
  ],
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" }
};

const faqs: FaqItem[] = [
  {
    q: "What is the Adaptive Coaching Architecture?",
    a: "The Adaptive Coaching Architecture (ACA) is TrainChat's three-layer AI coaching system. Layer 1 (coaching intelligence) applies exercise science principles to every decision. Layer 2 (adaptive programming) executes principled modifications to the live program. Layer 3 (conversational interface) translates natural language input into structured coaching actions for layer 1 to process."
  },
  {
    q: "What does ACA stand for?",
    a: "ACA stands for Adaptive Coaching Architecture — one of the five named frameworks in the TrainChat Methodology. It describes the structural design of TrainChat's coaching system and how its three layers interact."
  },
  {
    q: "Why does the ACA separate the interface from the decision layer?",
    a: "Separating the interface layer from the decision layer means coaching quality does not depend on how well or poorly the athlete phrases their request. The conversational interface handles natural language interpretation; the coaching intelligence layer handles exercise science reasoning. Athletes get principled coaching decisions regardless of whether their input is precise, colloquial, or ambiguous."
  },
  {
    q: "How does the Adaptive Coaching Architecture differ from how other AI fitness apps work?",
    a: "Most AI fitness apps operate as a single layer — inputs are pattern-matched against fitness content and outputs are generated. The ACA is three distinct layers with different responsibilities: coaching intelligence that applies exercise science constraints, adaptive programming that executes mutations, and a conversational layer that handles language interpretation. The separation ensures decisions are principled rather than probabilistic."
  },
  {
    q: "What is coaching intelligence in the ACA?",
    a: "Coaching intelligence is layer 1 of the Adaptive Coaching Architecture — the decision-making engine that processes all input through exercise science principles (progressive overload, specificity, CNS load management, periodization theory) before any programming action is taken. It is what separates the ACA from systems that generate plausible-sounding programs without principled reasoning."
  }
];

export default function AdaptiveCoachingArchitecture() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Adaptive Coaching Architecture (ACA) — TrainChat® Framework"
      description="The Adaptive Coaching Architecture (ACA) is TrainChat's three-layer AI coaching system — coaching intelligence processes decisions through exercise science principles, adaptive programming executes mutations, and the conversational interface translates natural language into coaching actions."
      schema={schema}
      canonical="/adaptive-coaching-architecture"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Framework</p>
          <h1 className="text-3xl font-bold tracking-tight">
            Adaptive Coaching Architecture{" "}
            <span className="text-muted-foreground font-normal text-xl">(ACA)</span>
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            The structural framework of TrainChat's AI coaching system — three layers working together to make every programming decision principled, context-aware, and immediately executable.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Definition</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">The Adaptive Coaching Architecture (ACA)</strong> is a three-layer AI coaching system in which coaching intelligence (Layer 1) processes all input through exercise science constraints, adaptive programming (Layer 2) executes principled program modifications, and the conversational interface (Layer 3) translates natural language into structured coaching inputs that Layer 1 can act on.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-5">The Three Layers</h2>
          <div className="space-y-4">
            {[
              {
                layer: "Layer 1",
                name: "Coaching Intelligence",
                role: "Decision Engine",
                description: "The reasoning layer. Every input — regardless of how it was phrased, regardless of what the athlete asked for — is processed through exercise science principles before any programming action is taken. Progressive overload, specificity, CNS load management, periodization theory, and individual variation accommodation all operate here as constraints, not suggestions.",
                keyBehaviors: [
                  "Evaluates requests against the athlete's full training history",
                  "Applies exercise science constraints before executing mutations",
                  "Distinguishes between requests that warrant mutation vs. rebuild",
                  "Flags potentially hazardous load spikes before they're executed",
                  "Manages periodization phase logic and transition timing"
                ],
                path: "/concepts/coaching-intelligence",
                borderColor: "border-primary"
              },
              {
                layer: "Layer 2",
                name: "Adaptive Programming",
                role: "Execution Engine",
                description: "The action layer. Once the coaching intelligence layer has made a principled decision, adaptive programming executes the most surgical modification to the live program that implements that decision. Changes are precise, targeted, and logged with rationale. The program's overall structure is preserved unless the decision specifically requires restructuring.",
                keyBehaviors: [
                  "Executes mutations at element, session, block, or program level",
                  "Maintains program coherence across all modifications",
                  "Logs every change with timestamp and rationale",
                  "Updates the live program panel in real time",
                  "Maintains mutation history for future context resolution"
                ],
                path: "/concepts/adaptive-programming",
                borderColor: "border-border"
              },
              {
                layer: "Layer 3",
                name: "Conversational Interface",
                role: "Input Layer",
                description: "The language layer. Natural language input — colloquial, ambiguous, emotional, or precise — is interpreted and translated into structured coaching inputs that Layer 1 can reason about. Context resolution handles references to previous sessions, past exercises, and prior mutations. Ambiguous requests are clarified before reaching the decision layer.",
                keyBehaviors: [
                  "Interprets direct commands, goal expressions, and feedback signals",
                  "Resolves deictic references: 'undo that', 'same for Tuesday'",
                  "Identifies ambiguity and requests clarification before execution",
                  "Maintains conversation context across the session",
                  "Passes structured, resolved inputs to Layer 1"
                ],
                path: "/concepts/conversational-training",
                borderColor: "border-border"
              }
            ].map((layer) => (
              <div key={layer.layer} className={`border ${layer.borderColor} rounded-xl p-5`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">{layer.layer}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary">{layer.role}</span>
                    </div>
                    <h3 className="text-base font-bold text-foreground">{layer.name}</h3>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{layer.description}</p>
                <ul className="space-y-1 mb-3">
                  {layer.keyBehaviors.map((b) => (
                    <li key={b} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="text-primary flex-shrink-0">→</span>{b}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate(layer.path)}
                  className="text-xs text-primary hover:underline"
                >
                  Full concept definition →
                </button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Why Layered Architecture Matters</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Most AI fitness systems collapse all three functions into a single operation: the input arrives, a model generates a response, the response is delivered. This works adequately for generating plausible workouts. It fails for coaching, because coaching requires the decisions to be principled in ways that single-step generation cannot guarantee.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            The ACA's three-layer separation means:
          </p>
          <ul className="space-y-2">
            {[
              "Coaching quality is independent of phrasing quality — Layer 3 handles language before Layer 1 handles decisions",
              "Exercise science constraints are enforced structurally — they cannot be bypassed by how a request is worded",
              "Every change is documented in Layer 2 — no mutation occurs without a record",
              "Ambiguity is resolved before execution — Layer 3 flags unclear requests rather than guessing",
              "The coaching intelligence can improve independently of the interface — architectural separation enables component-level refinement"
            ].map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-primary mt-1 flex-shrink-0">→</span>{item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">ACA in Context</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The ACA is one of five named frameworks in the TrainChat Methodology. It operates alongside the Conversational Training Model (CTM), Dynamic Progression Framework (DPF), Living System Methodology (LSM), and Mutation-First Programming Principle (MFP).
          </p>
          <button
            onClick={() => navigate("/methodology")}
            className="text-sm font-semibold text-primary hover:underline"
          >
            View all five frameworks →
          </button>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
