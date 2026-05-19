import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "ScholarlyArticle",
  "headline": "The Deterministic-Generative Hybrid Model: A Structured Architecture for AI Coaching",
  "description": "Defines the hybrid architecture that combines deterministic structural logic with generative language intelligence to produce AI coaching systems that are both expressive and structurally trustworthy. Covers mutation ontologies, validation gates, and coaching-state persistence.",
  "url": "https://www.trainchat.ai/whitepapers/deterministic-generative-hybrid-model",
  "datePublished": "2026",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "publisher": { "@type": "Organization", "name": "TrainChat®" },
  "about": [
    { "@type": "DefinedTerm", "name": "Deterministic-Generative Hybrid Model", "url": "https://www.trainchat.ai/whitepapers/deterministic-generative-hybrid-model" },
    { "@type": "DefinedTerm", "name": "Mutation Ontology", "url": "https://www.trainchat.ai/whitepapers/deterministic-generative-hybrid-model" },
    { "@type": "DefinedTerm", "name": "Validation Gates", "url": "https://www.trainchat.ai/whitepapers/deterministic-generative-hybrid-model" }
  ],
  "isPartOf": { "@type": "CollectionPage", "name": "TrainChat® Whitepapers", "url": "https://www.trainchat.ai/whitepapers" }
};

const sections = [
  {
    heading: "Abstract",
    content: `Large language models are expressive but unstructured. They will generate a convincing training program that violates recovery constraints, ignores training age, or contradicts periodization logic — with no mechanism to detect or prevent the violation. Pure deterministic systems are structured but linguistically rigid. They cannot interpret natural language, ask clarifying questions, or reason about athlete intent.

This paper defines the Deterministic-Generative Hybrid Model: an architecture that resolves this tension by assigning each capability to its appropriate component. The generative layer handles interpretation, coaching dialogue, and the translation of athlete intent into typed system operations. The deterministic layer enforces structural constraints, maintains program state, and executes operations that the generative layer cannot safely perform alone. Together, they produce a coaching system that is both expressive enough for real dialogue and constrained enough for safe, defensible program generation.`
  },
  {
    heading: "1. Why Pure LLM Generation Fails",
    content: `LLMs produce output that is grammatically and semantically consistent. They do not produce output that is structurally valid with respect to constraints they have never been given the authority to enforce. A model told to "write a strength program" will write one. It will not check whether the athlete has the training history to support the volumes specified, whether the exercise selection respects documented limitations, or whether the load progression violates the recovery window established by prior sessions.

The failure mode is not hallucination — it is unconstrained generation. The model produces structurally plausible output that violates domain-specific constraints it has no mechanism to represent or enforce. Three failure modes characterize pure LLM coaching systems. Constraint blindness: the model generates programs that violate recovery or load constraints it was not instructed to respect. State amnesia: without persistent program state, the model has no knowledge of prior sessions or accumulated load. And structural drift: each response can silently regenerate the program from scratch rather than mutating the existing structure coherently — producing inconsistency across sessions that the athlete experiences as incoherent coaching.`
  },
  {
    heading: "2. Why Pure Deterministic Programming Fails",
    content: `Pure deterministic systems are structurally sound but linguistically rigid. They can enforce constraints, maintain state, and produce valid program output — but only in response to inputs that exactly match their predefined operation types. They cannot handle the ambiguity, nuance, and free-form communication that characterizes real coaching dialogue.

The athlete who says "make week 3 more aggressive" has expressed a valid training intent. A purely deterministic system cannot parse this. It has no mechanism for resolving natural language into the typed operation — load increase, intensity shift, exercise selection change — the statement implies. The athlete who asks "am I pushing hard enough?" has asked a question that requires reasoning about their training history, their goals, and the exercise science literature. A purely deterministic system cannot answer it.

Three failure modes characterize pure deterministic coaching systems. Input rigidity: the system cannot accept natural language without a parsing translation layer that it does not possess. Coaching inertness: the system cannot ask clarifying questions, interpret goals, or reason about athlete intent — capabilities that define coaching as distinct from program delivery. And operational brittleness: the system breaks on edge cases not explicitly anticipated in the rule set, with no mechanism for graceful degradation.`
  },
  {
    heading: "3. The Hybrid Architecture",
    content: `The Deterministic-Generative Hybrid Model resolves these complementary failure modes by assigning each capability to the architectural component suited to provide it.

The generative layer receives athlete input in natural language and produces two types of output. First, coaching responses: the natural language continuations of the dialogue that explain, clarify, confirm, or question. Second, mutation instructions: typed, parameterized operation specifications that describe what structural change to the program the athlete's input implies. The generative layer does not execute changes to program state. It describes them.

The deterministic layer receives mutation instructions from the generative layer and subjects each one to a validation pipeline before execution. Validated mutations are applied to program state; their application is logged to the mutation ledger. Invalid mutations are returned to the generative layer with a structured failure receipt that includes the violated constraint, the violation severity, and a suggested alternative. The generative layer uses this feedback to generate a coaching response that explains the constraint and, where appropriate, proposes alternatives.

This separation means that the generative layer's expressiveness is bounded by the deterministic layer's constraints — not by its own probabilistic avoidance of violations, which is not a structural guarantee.`
  },
  {
    heading: "4. Deterministic Sequencing",
    content: `Deterministic sequencing governs the structural relationships between training elements: the order of exercises within a session, the progression of load across weeks, the distribution of stress across movement patterns. These relationships are not suggestions — they are constraints with known violations and enforcement logic.

The deterministic layer treats program structure as a typed data structure with invariants. A session is valid when all its component constraints are satisfied simultaneously. When a mutation would violate an invariant, the system rejects the mutation and surfaces the violation to the coaching layer rather than allowing a structurally invalid state to persist.

Three sequencing invariants characterize well-designed programs. Stimulus ordering: primary lifts precede assistance work, and neural demands are addressed before metabolic ones — a session that inverts this order degrades the quality of the primary stimulus. Progressive overload: load increases are bounded by prior session performance and the recovery window elapsed since the last session — a constraint that prevents both overreaching and underloading. And frequency spacing: minimum recovery time is enforced per muscle group and energy system — a constraint that prevents the accumulated fatigue that produces overuse injury rather than adaptation.`
  },
  {
    heading: "5. Mutation Ontologies",
    content: `A mutation ontology is a typed registry of every operation the coaching system can perform on the training program. Each mutation type has a defined target, a set of required parameters, and a constraint check that must pass before the operation can execute.

The ontology serves two functions. First, it defines the vocabulary of structural change — the set of operations that are meaningful in the context of training program management. This vocabulary is the shared language between the generative layer (which describes mutations in natural language and translates them to typed operations) and the deterministic layer (which executes those operations against program state).

Second, the ontology functions as a constraint specification. Each mutation type's constraint check defines the conditions under which that type of change is valid. SUBSTITUTE_EXERCISE requires movement pattern compatibility with the exercise being replaced. ADJUST_WEEKLY_VOLUME requires that the proposed volume falls within the athlete's current effective volume range. SHIFT_EMPHASIS requires that the target training emphasis is compatible with the athlete's training age and current block position. These are not post-hoc filters applied to generated output — they are structural preconditions that the deterministic layer enforces before any change reaches program state.`
  },
  {
    heading: "6. Validation Gates",
    content: `Every mutation passes through a validation gate before it reaches program state. The gate evaluates the proposed change against the full constraint registry — not just the constraints relevant to the mutation type, but all constraints whose invariants the mutation could indirectly affect. A mutation that passes local constraints may still fail global validation.

The validation pipeline operates in four stages. Schema validation confirms that the mutation instruction has the required fields and a valid type — a structural check that catches malformed output from the generative layer before it reaches constraint evaluation. Local constraint checking evaluates the constraints specific to this mutation type. Global constraint checking re-evaluates the full constraint registry against the proposed program state — catching violations that arise from the interaction of the mutation with existing state rather than from the mutation itself. And the apply-or-reject step either commits the mutation to program state or returns a structured failure receipt to the generative layer.

Failed mutations are not silently dropped. The failure receipt includes the violated constraint, the violation severity, and a suggested alternative operation. The generative layer uses this information to generate a coaching response that explains the constraint in natural language and, where possible, proposes a compliant alternative. The coaching dialogue continues from the failure rather than terminating at it.`
  },
  {
    heading: "7. Coaching-State Persistence",
    content: `Coaching-state persistence is the property that makes a hybrid coaching system coherent across time. It is not just memory — it is the maintenance of a consistent world model: who this athlete is, what they have done, what constraints apply to them, and what the current state of their program is.

The stateless interaction model of consumer LLMs is architecturally incompatible with precision coaching. Every coaching decision depends on prior decisions. A system that cannot retrieve and reason about its own history cannot produce consistent, structurally coherent long-term programming — it can only produce locally plausible responses to the current input.

The coaching state comprises three components. The athlete profile: training age, capacity estimates, constraint history, and goals — the stable properties of the athlete that inform every decision. The program state: the current block, week, session, and their complete structural definitions — the live representation of what the athlete is doing right now. And the mutation ledger: the ordered log of every structural change, its rationale, and its outcome — the historical record that makes future decisions context-aware. All three must be maintained across sessions for the system to function as a coach rather than a session-level content generator.`
  },
  {
    heading: "Citation",
    content: `To cite this publication:

TrainChat®. (2026). The Deterministic-Generative Hybrid Model: A Structured Architecture for AI Coaching. TrainChat Publications. https://www.trainchat.ai/whitepapers/deterministic-generative-hybrid-model

Related publications:
• Constraint-Aware Coaching Systems — trainchat.ai/whitepapers/constraint-aware-coaching-systems
• Conversational Periodization — trainchat.ai/whitepapers/conversational-periodization
• Mutation-First Programming — trainchat.ai/whitepapers/mutation-first-programming`
  }
];

export default function DetGenHybridWhitepaper() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="The Deterministic-Generative Hybrid Model — TrainChat® Whitepaper"
      description="Defines the hybrid architecture combining deterministic structural logic with generative language intelligence to produce AI coaching systems that are both expressive and structurally trustworthy. Covers mutation ontologies, validation gates, and coaching-state persistence."
      schema={schema}
      canonical="/whitepapers/deterministic-generative-hybrid-model"
      breadcrumbs={[
        { name: "Whitepapers", url: "/whitepapers" },
        { name: "The Deterministic-Generative Hybrid Model", url: "/whitepapers/deterministic-generative-hybrid-model" },
      ]}
      articleDatePublished="2026-05-16"
      articleDateModified="2026-05-16"
    >
      <div className="space-y-8">
        <div>
          <button onClick={() => navigate("/whitepapers")} className="text-xs text-muted-foreground hover:text-primary transition-colors mb-4 flex items-center gap-1">
            ← Publications
          </button>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Whitepaper · DGH · 2026</p>
          <h1 className="text-2xl font-bold tracking-tight leading-snug mb-1">The Deterministic-Generative Hybrid Model</h1>
          <p className="text-base text-muted-foreground italic">A Structured Architecture for AI Coaching</p>
          <p className="text-xs text-muted-foreground mt-2">Published by TrainChat® · trainchat.ai/whitepapers/deterministic-generative-hybrid-model</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {["DGH", "Mutation Ontologies", "Validation Gates", "Coaching-State Persistence", "Hybrid Architecture"].map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground font-mono">{tag}</span>
          ))}
        </div>

        <div className="flex items-center gap-3 py-2 border-y border-border">
          <button onClick={() => navigate("/whitepapers/dgh-pdf")} className="text-xs font-semibold text-primary hover:underline">
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
                { label: "Constraint-Aware Coaching Systems", path: "/whitepapers/constraint-aware-coaching-systems" },
                { label: "Conversational Periodization", path: "/whitepapers/conversational-periodization" },
                { label: "Mutation-First Programming", path: "/whitepapers/mutation-first-programming" },
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
