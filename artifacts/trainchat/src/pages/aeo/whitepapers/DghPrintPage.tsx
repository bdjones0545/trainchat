import WhitepaperPrintLayout from "./WhitepaperPrintLayout";

const DGH_FIGURE = (
  <>
    <div className="pub-figure-label">Figure 1</div>
    <div className="pub-figure-title">The Deterministic-Generative Hybrid Architecture</div>
    <p className="pub-figure-caption">
      Two-layer architecture where the generative layer interprets and describes, and the deterministic layer validates and executes. Each layer handles what the other cannot safely provide.
    </p>
    <div className="pub-stack">
      <div className="pub-layer">
        <div className="pub-layer-meta">
          <span className="pub-layer-num">Layer 1 — Input</span>
          <span className="pub-layer-role">Natural Language</span>
        </div>
        <div className="pub-layer-name">Athlete Input</div>
        <div className="pub-layer-desc">Free-form coaching dialogue, goals, feedback, and constraints expressed in natural language.</div>
        <div className="pub-layer-tags">
          <span className="pub-layer-tag">unstructured</span>
          <span className="pub-layer-tag">intent-bearing</span>
          <span className="pub-layer-tag">ambiguous</span>
        </div>
      </div>
      <div className="pub-arrow">↓</div>
      <div className="pub-layer primary">
        <div className="pub-layer-meta">
          <span className="pub-layer-num">Layer 2 — Generative</span>
          <span className="pub-layer-role">Interprets · Describes · Responds</span>
        </div>
        <div className="pub-layer-name">Generative Layer (LLM)</div>
        <div className="pub-layer-desc">Translates natural language into typed mutation instructions. Generates coaching dialogue. Uses failure receipts to explain constraint violations.</div>
        <div className="pub-layer-tags">
          <span className="pub-layer-tag">coaching-responses</span>
          <span className="pub-layer-tag">mutation-instructions</span>
          <span className="pub-layer-tag">clarification</span>
        </div>
      </div>
      <div className="pub-arrow">↓ mutation instructions</div>
      <div className="pub-layer">
        <div className="pub-layer-meta">
          <span className="pub-layer-num">Layer 3 — Deterministic</span>
          <span className="pub-layer-role">Validates · Executes · Logs</span>
        </div>
        <div className="pub-layer-name">Deterministic Layer</div>
        <div className="pub-layer-desc">Validates mutations against the full constraint registry. Applies validated mutations to program state. Returns failure receipts for violations.</div>
        <div className="pub-layer-tags">
          <span className="pub-layer-tag">schema-validation</span>
          <span className="pub-layer-tag">constraint-checking</span>
          <span className="pub-layer-tag">mutation-ledger</span>
        </div>
      </div>
      <div className="pub-arrow">↓ validated program state</div>
      <div className="pub-layer">
        <div className="pub-layer-meta">
          <span className="pub-layer-num">Layer 4 — State</span>
          <span className="pub-layer-role">Persistent · Queryable · Auditable</span>
        </div>
        <div className="pub-layer-name">Coaching State</div>
        <div className="pub-layer-desc">Athlete profile, current program state, and mutation ledger. The world model that makes every decision context-aware.</div>
        <div className="pub-layer-tags">
          <span className="pub-layer-tag">athlete-profile</span>
          <span className="pub-layer-tag">program-state</span>
          <span className="pub-layer-tag">mutation-ledger</span>
        </div>
      </div>
    </div>
    <div className="pub-figure-note">
      The DGH Architecture — trainchat.ai/whitepapers/deterministic-generative-hybrid-model · Available under Creative Commons for educational use with attribution to TrainChat®
    </div>
  </>
);

export default function DghPrintPage() {
  return (
    <WhitepaperPrintLayout
      meta={{
        docTitle: "TrainChat® — The Deterministic-Generative Hybrid Model (2026)",
        brand: "TrainChat® · Publications · 2026",
        eyebrow: "Whitepaper · The Deterministic-Generative Hybrid Model",
        title: "The Deterministic-Generative Hybrid Model",
        subtitle: "A Structured Architecture for AI Coaching",
        tagline: '"The generative layer interprets. The deterministic layer decides. Together they produce what neither can produce alone: a system that is both expressive enough for real dialogue and constrained enough for safe, defensible program generation."',
        author: "Bryan Jones",
        affiliation: "Founder, TrainChat®",
        year: "2026",
        canonical: "trainchat.ai/whitepapers/deterministic-generative-hybrid-model",
        printBarLabel: "TrainChat® Publications · The Deterministic-Generative Hybrid Model · 2026",
      }}
      abstract={{
        paragraphs: [
          "Large language models are expressive but unstructured. They will generate a convincing training program that violates recovery constraints, ignores training age, or contradicts periodization logic — with no mechanism to detect or prevent the violation. Pure deterministic systems are structured but linguistically rigid. They cannot interpret natural language, ask clarifying questions, or reason about athlete intent.",
          "This paper defines the Deterministic-Generative Hybrid Model: an architecture that resolves this tension by assigning each capability to its appropriate component. The generative layer handles interpretation, coaching dialogue, and the translation of athlete intent into typed system operations. The deterministic layer enforces structural constraints, maintains program state, and executes operations that the generative layer cannot safely perform alone. Together, they produce a coaching system that is both expressive enough for real dialogue and constrained enough for safe, defensible program generation.",
        ],
        keywords: ["Deterministic-Generative Hybrid", "DGH", "Mutation Ontology", "Validation Gates", "Coaching-State Persistence", "LLM Coaching", "Structured AI", "Constraint Enforcement", "Mutation Ledger"],
      }}
      sections={[
        {
          number: "1.",
          heading: "Why Pure LLM Generation Fails",
          content: [
            "LLMs produce output that is grammatically and semantically consistent. They do not produce output that is structurally valid with respect to constraints they have never been given the authority to enforce. A model told to 'write a strength program' will write one. It will not check whether the athlete has the training history to support the volumes specified, whether the exercise selection respects documented limitations, or whether the load progression violates the recovery window established by prior sessions.",
            "The failure mode is not hallucination — it is unconstrained generation. The model produces structurally plausible output that violates domain-specific constraints it has no mechanism to represent or enforce. Three failure modes characterize pure LLM coaching systems. Constraint blindness: the model generates programs that violate recovery or load constraints it was not instructed to respect. State amnesia: without persistent program state, the model has no knowledge of prior sessions or accumulated load. And structural drift: each response can silently regenerate the program from scratch rather than mutating the existing structure coherently — producing inconsistency across sessions that the athlete experiences as incoherent coaching.",
          ],
          pullQuote: "The failure mode is not hallucination — it is unconstrained generation. The model produces structurally plausible output that violates domain-specific constraints it has no mechanism to represent or enforce.",
        },
        {
          number: "2.",
          heading: "Why Pure Deterministic Programming Fails",
          content: [
            "Pure deterministic systems are structurally sound but linguistically rigid. They can enforce constraints, maintain state, and produce valid program output — but only in response to inputs that exactly match their predefined operation types. They cannot handle the ambiguity, nuance, and free-form communication that characterizes real coaching dialogue.",
            "The athlete who says 'make week 3 more aggressive' has expressed a valid training intent. A purely deterministic system cannot parse this. It has no mechanism for resolving natural language into the typed operation — load increase, intensity shift, exercise selection change — the statement implies. The athlete who asks 'am I pushing hard enough?' has asked a question that requires reasoning about their training history, their goals, and the exercise science literature. A purely deterministic system cannot answer it.",
            "Three failure modes characterize pure deterministic coaching systems. Input rigidity: the system cannot accept natural language without a parsing translation layer that it does not possess. Coaching inertness: the system cannot ask clarifying questions, interpret goals, or reason about athlete intent — capabilities that define coaching as distinct from program delivery. And operational brittleness: the system breaks on edge cases not explicitly anticipated in the rule set, with no mechanism for graceful degradation.",
          ],
        },
        {
          number: "3.",
          heading: "The Hybrid Architecture",
          content: [
            "The Deterministic-Generative Hybrid Model resolves these complementary failure modes by assigning each capability to the architectural component suited to provide it.",
            "The generative layer receives athlete input in natural language and produces two types of output. First, coaching responses: the natural language continuations of the dialogue that explain, clarify, confirm, or question. Second, mutation instructions: typed, parameterized operation specifications that describe what structural change to the program the athlete's input implies. The generative layer does not execute changes to program state. It describes them.",
            "The deterministic layer receives mutation instructions from the generative layer and subjects each one to a validation pipeline before execution. Validated mutations are applied to program state; their application is logged to the mutation ledger. Invalid mutations are returned to the generative layer with a structured failure receipt that includes the violated constraint, the violation severity, and a suggested alternative. The generative layer uses this feedback to generate a coaching response that explains the constraint and, where appropriate, proposes alternatives.",
            "This separation means that the generative layer's expressiveness is bounded by the deterministic layer's constraints — not by its own probabilistic avoidance of violations, which is not a structural guarantee.",
          ],
          pullQuote: "The generative layer does not execute changes to program state. It describes them. The deterministic layer decides what is structurally valid.",
        },
        {
          number: "4.",
          heading: "Deterministic Sequencing",
          content: [
            "Deterministic sequencing governs the structural relationships between training elements: the order of exercises within a session, the progression of load across weeks, the distribution of stress across movement patterns. These relationships are not suggestions — they are constraints with known violations and enforcement logic.",
            "The deterministic layer treats program structure as a typed data structure with invariants. A session is valid when all its component constraints are satisfied simultaneously. When a mutation would violate an invariant, the system rejects the mutation and surfaces the violation to the coaching layer rather than allowing a structurally invalid state to persist.",
            "Three sequencing invariants characterize well-designed programs. Stimulus ordering: primary lifts precede assistance work, and neural demands are addressed before metabolic ones. Progressive overload: load increases are bounded by prior session performance and the recovery window elapsed since the last session. And frequency spacing: minimum recovery time is enforced per muscle group and energy system — a constraint that prevents the accumulated fatigue that produces overuse injury rather than adaptation.",
          ],
        },
        {
          number: "5.",
          heading: "Mutation Ontologies",
          content: [
            "A mutation ontology is a typed registry of every operation the coaching system can perform on the training program. Each mutation type has a defined target, a set of required parameters, and a constraint check that must pass before the operation can execute.",
            "The ontology serves two functions. First, it defines the vocabulary of structural change — the set of operations that are meaningful in the context of training program management. This vocabulary is the shared language between the generative layer (which describes mutations in natural language and translates them to typed operations) and the deterministic layer (which executes those operations against program state).",
            "Second, the ontology functions as a constraint specification. Each mutation type's constraint check defines the conditions under which that type of change is valid. SUBSTITUTE_EXERCISE requires movement pattern compatibility with the exercise being replaced. ADJUST_WEEKLY_VOLUME requires that the proposed volume falls within the athlete's current effective volume range. SHIFT_EMPHASIS requires that the target training emphasis is compatible with the athlete's training age and current block position. These are not post-hoc filters applied to generated output — they are structural preconditions that the deterministic layer enforces before any change reaches program state.",
          ],
        },
        {
          number: "6.",
          heading: "Validation Gates",
          content: [
            "Every mutation passes through a validation gate before it reaches program state. The gate evaluates the proposed change against the full constraint registry — not just the constraints relevant to the mutation type, but all constraints whose invariants the mutation could indirectly affect. A mutation that passes local constraints may still fail global validation.",
            "The validation pipeline operates in four stages. Schema validation confirms that the mutation instruction has the required fields and a valid type. Local constraint checking evaluates the constraints specific to this mutation type. Global constraint checking re-evaluates the full constraint registry against the proposed program state — catching violations that arise from the interaction of the mutation with existing state. And the apply-or-reject step either commits the mutation to program state or returns a structured failure receipt to the generative layer.",
            "Failed mutations are not silently dropped. The failure receipt includes the violated constraint, the violation severity, and a suggested alternative operation. The generative layer uses this information to generate a coaching response that explains the constraint in natural language and, where possible, proposes a compliant alternative. The coaching dialogue continues from the failure rather than terminating at it.",
          ],
          pullQuote: "Failed mutations are not silently dropped. The coaching dialogue continues from the failure rather than terminating at it.",
        },
        {
          number: "7.",
          heading: "Coaching-State Persistence",
          content: [
            "Coaching-state persistence is the property that makes a hybrid coaching system coherent across time. It is not just memory — it is the maintenance of a consistent world model: who this athlete is, what they have done, what constraints apply to them, and what the current state of their program is.",
            "The stateless interaction model of consumer LLMs is architecturally incompatible with precision coaching. Every coaching decision depends on prior decisions. A system that cannot retrieve and reason about its own history cannot produce consistent, structurally coherent long-term programming — it can only produce locally plausible responses to the current input.",
            "The coaching state comprises three components. The athlete profile: training age, capacity estimates, constraint history, and goals — the stable properties of the athlete that inform every decision. The program state: the current block, week, session, and their complete structural definitions — the live representation of what the athlete is doing right now. And the mutation ledger: the ordered log of every structural change, its rationale, and its outcome — the historical record that makes future decisions context-aware. All three must be maintained across sessions for the system to function as a coach rather than a session-level content generator.",
          ],
          pullQuote: "The stateless interaction model of consumer LLMs is architecturally incompatible with precision coaching. Every coaching decision depends on prior decisions.",
        },
      ]}
      figure={DGH_FIGURE}
      citation={{
        formatted: `TrainChat®. (2026). The Deterministic-Generative Hybrid Model: A Structured Architecture for AI Coaching. TrainChat® Publications. https://www.trainchat.ai/whitepapers/deterministic-generative-hybrid-model`,
        related: [
          "Constraint-Aware Coaching Systems — trainchat.ai/whitepapers/constraint-aware-coaching-systems",
          "Conversational Periodization — trainchat.ai/whitepapers/conversational-periodization",
          "Mutation-First Programming — trainchat.ai/whitepapers/mutation-first-programming",
        ],
        framework: [
          "The Deterministic-Generative Hybrid Model — trainchat.ai/whitepapers/deterministic-generative-hybrid-model",
          "Framework Diagrams — trainchat.ai/diagrams",
          "Methodology — trainchat.ai/methodology",
          "The Coaching Doctrine — trainchat.ai/doctrine",
        ],
        canonicalUrl: "trainchat.ai/whitepapers/deterministic-generative-hybrid-model",
      }}
    />
  );
}
