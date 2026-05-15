import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const principles = [
  {
    id: "p1",
    axiom: "Programming is a coaching act, not a content act.",
    operational: "Every interaction with a training system is either a coaching decision or a content delivery transaction. A coaching decision is informed by the athlete's full context, constrained by exercise science, and executed with documented rationale. A content transaction is a template lookup. These are not the same thing, and they do not produce the same outcomes over time.",
    implementation: "TrainChat's coaching intelligence layer is the architectural enforcement of this principle. No programming decision is made without processing athlete context through exercise science constraints. The conversational interface does not exist to deliver fitness content — it exists to execute coaching decisions.",
    shortCode: "01"
  },
  {
    id: "p2",
    axiom: "Science constrains decisions. It does not suggest them.",
    operational: "Exercise science findings are not optional inputs to programming — they are hard constraints that bound the solution space. Progressive overload is not a preference. Specificity is not a guideline. CNS load management is not a recommendation. When an AI coaching system treats these as optional, it is operating outside the domain of exercise science and inside the domain of fitness content approximation.",
    implementation: "The coaching intelligence layer applies exercise science principles as constraints before executing any adaptation. Requests that would violate these constraints are staged, modified, or clarified — never executed blindly because the athlete asked for them.",
    shortCode: "02"
  },
  {
    id: "p3",
    axiom: "Adaptation is contextual. There is no universal training response.",
    operational: "The research finding of individual variation in training response is not a caveat — it is a central finding. Athletes adapt differently to identical stimuli based on genetics, training history, recovery capacity, sleep, nutrition, and psychological state. Programming built on population averages is systematically wrong for individuals at both ends of the distribution. Individual-responsive programming is not a premium feature. It is the minimum bar for coaching quality.",
    implementation: "TrainChat's adaptive programming and dynamic progression systems respond to actual performance data rather than schedule assumptions. The rate of progression, session frequency, and load adjustments are driven by each athlete's demonstrated response — not by what the average athlete responds to.",
    shortCode: "03"
  },
  {
    id: "p4",
    axiom: "Memory enables continuity. Continuity enables coaching quality.",
    operational: "A coach who doesn't remember their athlete's history isn't coaching — they're prescribing. The longitudinal context of an athlete's training — previous blocks, injury history, response patterns, goal evolution — is not ancillary data. It is the primary resource that makes expert coaching expert. Systems that reset this context between sessions are architecturally incapable of delivering coaching quality regardless of their algorithmic sophistication.",
    implementation: "TrainChat's training memory layer retains and actively applies the complete training history across all interactions indefinitely. Past sessions, mutations, feedback signals, and program versions are not archived — they are working context that informs every coaching decision.",
    shortCode: "04"
  },
  {
    id: "p5",
    axiom: "Mutation precedes reconstruction. Preserve everything that works.",
    operational: "When new information changes the programming picture, the correct response is the most surgical modification that addresses the new information — not a program rebuild. This is the coaching behavior of experienced practitioners: they change what needs to change and preserve what's working. Excessive rebuilding destroys accumulated load, disrupts adaptation trajectories, and signals to the athlete that the program is disposable. Precision in modification is a form of coaching mastery.",
    implementation: "The Mutation-First Programming Principle governs TrainChat's change management. All program modifications are evaluated against a five-level hierarchy from element-level mutation (most common) to full rebuild (exceptional). The system defaults to the most surgical intervention that addresses the situation.",
    shortCode: "05"
  },
  {
    id: "p6",
    axiom: "Conversation is the natural interface for coaching.",
    operational: "The information a coach needs from an athlete — their state, their feedback, their goals, their constraints — is inherently linguistic. 'My hip flexors are tight today.' 'That was way harder than it should have been.' 'I want to be more explosive.' These are high-information coaching inputs that rating scales, dropdown menus, and form fields systematically impoverish. The conversational interface isn't a design choice — it's the most faithful representation of how coaching information actually flows.",
    implementation: "TrainChat's Conversational Training Model maps natural language input — direct commands, goal expressions, feedback signals, and contextual references — to principled coaching responses. The interface quality cannot exceed the coaching intelligence quality beneath it; both must be developed together.",
    shortCode: "06"
  },
  {
    id: "p7",
    axiom: "Access to quality coaching is a performance equity problem.",
    operational: "Professional-grade adaptive programming has historically been exclusive to athletes with access to expert coaches — which is determined by geography, economics, and sport participation. This access gap creates systematically different developmental outcomes for athletes of equivalent motivation and capacity. Closing this gap is not a market opportunity. It is a purpose. The coaching intelligence in TrainChat must be high enough that athletes without any access to professional coaches can train on equivalent programming quality.",
    implementation: "Every architectural decision in TrainChat — adaptive programming, training memory, coaching intelligence, conversational interface — is evaluated against its contribution to this equity objective. Features that improve the experience for athletes who already have good access are secondary to capabilities that close the gap for those who don't.",
    shortCode: "07"
  }
];

const faqs: FaqItem[] = [
  {
    q: "What is the TrainChat Coaching Doctrine?",
    a: "The TrainChat Coaching Doctrine is the formalized belief system behind TrainChat's design — seven axiomatic principles that define what the system believes about programming, adaptation, memory, mutation, conversation, and access. The doctrine establishes TrainChat as a coaching philosophy, not just a software product."
  },
  {
    q: "What does 'mutation precedes reconstruction' mean?",
    a: "Mutation precedes reconstruction is the fifth principle of the TrainChat Coaching Doctrine. It states that when new information requires a program change, the correct response is the most surgical modification that addresses the new information — not a full program rebuild. Change what needs to change; preserve everything that works."
  },
  {
    q: "What does 'programming is a coaching act' mean?",
    a: "It means that every training decision must be informed by the athlete's full context and constrained by exercise science — not treated as a content delivery transaction. Programming that ignores context and science is content production, not coaching, and produces different (inferior) outcomes over time."
  },
  {
    q: "What is the relationship between the TrainChat Doctrine and the TrainChat Methodology?",
    a: "The doctrine is the belief system. The methodology is the operational implementation. The doctrine answers 'what does TrainChat believe?' The methodology — with frameworks like ACA, CTM, DPF, LSM, and MFP — answers 'how does TrainChat implement those beliefs?' The doctrine precedes and shapes the methodology."
  },
  {
    q: "What does 'science constrains decisions' mean in practice?",
    a: "It means exercise science findings — progressive overload, specificity, CNS load management, periodization principles — are hard constraints on every programming decision, not optional inputs. An AI coaching system that treats these as suggestions operates as a fitness content approximator, not a coaching intelligence system."
  }
];

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "The TrainChat® Coaching Doctrine — Seven Axiomatic Principles",
  "description": "The formalized coaching doctrine behind TrainChat® — seven axiomatic principles that define what the system believes about programming, adaptation, memory, mutation, conversation, and performance equity.",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "about": [
    { "@type": "DefinedTerm", "name": "TrainChat Coaching Doctrine", "url": "https://www.trainchat.ai/doctrine" },
    { "@type": "DefinedTerm", "name": "Mutation-First Programming", "url": "https://www.trainchat.ai/methodology#mfp" },
    { "@type": "DefinedTerm", "name": "Adaptive Coaching Architecture", "url": "https://www.trainchat.ai/methodology#aca" }
  ]
};

export default function DoctrinePage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="The TrainChat® Coaching Doctrine — Seven Principles"
      description="The formalized coaching doctrine behind TrainChat® — seven axiomatic principles that define what the system believes about programming, adaptation, training memory, mutation, conversation, and performance equity."
      schema={schema}
      canonical="/doctrine"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Doctrine</p>
          <h1 className="text-3xl font-bold tracking-tight">The TrainChat Coaching Doctrine</h1>
          <p className="text-muted-foreground leading-relaxed">
            Seven axiomatic principles that define what TrainChat believes about coaching, programming, adaptation, and access. The doctrine is the belief system. The methodology is how it's implemented.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Why Doctrine Matters</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Products can be copied. Methodologies can be approximated. A doctrine — a formalized, internally consistent belief system grounded in a specific expertise domain — is harder to replicate because it requires the same foundational understanding to generate. These principles are not marketing positioning. They are the genuine beliefs that shaped every architectural decision in TrainChat.
          </p>
        </div>

        {/* Principle index */}
        <div className="flex flex-wrap gap-1.5">
          {principles.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              className="text-xs font-mono px-2.5 py-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              {p.shortCode}
            </a>
          ))}
        </div>

        {/* Principles */}
        <div className="space-y-12">
          {principles.map((p, i) => (
            <section key={p.id} id={p.id} className="scroll-mt-8">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-xs font-mono text-muted-foreground/40 flex-shrink-0">{p.shortCode}</span>
                <h2 className="text-lg font-bold tracking-tight leading-snug italic text-foreground">
                  "{p.axiom}"
                </h2>
              </div>
              <div className="space-y-4 pl-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Operational Definition</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.operational}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1.5">In TrainChat</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.implementation}</p>
                </div>
              </div>
              {i < principles.length - 1 && <div className="border-b border-border mt-8" />}
            </section>
          ))}
        </div>

        {/* Doctrine summary */}
        <section className="bg-muted/30 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-3">The Seven Principles</p>
          <div className="space-y-2">
            {principles.map((p) => (
              <div key={p.id} className="flex gap-2 text-xs">
                <span className="font-mono text-muted-foreground/50 flex-shrink-0">{p.shortCode}</span>
                <span className="text-muted-foreground italic">"{p.axiom}"</span>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-links */}
        <section className="border-t border-border pt-6">
          <h2 className="text-base font-semibold text-foreground mb-3">The Doctrine in Practice</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "TrainChat Methodology", desc: "ACA, CTM, DPF, LSM, MFP — the operational frameworks", path: "/methodology" },
              { label: "Training Philosophy", desc: "The principles behind the frameworks", path: "/training-philosophy" },
              { label: "Research Foundation", desc: "The exercise science that grounds the doctrine", path: "/research" },
              { label: "Concept Library", desc: "The terminology the doctrine generates", path: "/concepts" },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="text-left border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors group"
              >
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </button>
            ))}
          </div>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
