import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Training Philosophy — The Principles Behind TrainChat",
  "description": "The coaching philosophy and training principles behind TrainChat — written by the founder, a practicing strength and conditioning coach. Practitioner-first, evidence-based, performance-focused.",
  "author": {
    "@type": "Person",
    "@id": "https://www.trainchat.ai/#founder",
    "name": "TrainChat Founder",
    "jobTitle": "Strength & Conditioning Coach",
    "worksFor": { "@type": "Organization", "name": "TrainChat®" }
  },
  "about": [
    { "@type": "DefinedTerm", "name": "Adaptive Programming" },
    { "@type": "DefinedTerm", "name": "Coaching Intelligence" },
    { "@type": "DefinedTerm", "name": "Training Philosophy" },
    { "@type": "DefinedTerm", "name": "Progressive Overload" }
  ]
};

const faqs: FaqItem[] = [
  {
    q: "What is TrainChat's training philosophy?",
    a: "TrainChat's training philosophy is practitioner-first and evidence-based: that effective programming requires genuine coaching intelligence applied to individual circumstances, not templates applied to average inputs. The system is designed to behave like an experienced coach who knows you — adapting precisely, documenting every change, and building on long-term context."
  },
  {
    q: "What does 'practitioner-first' mean in the context of AI coaching?",
    a: "Practitioner-first means the system was designed from real coaching experience, not from fitness content trends or user engagement optimization. The programming decisions TrainChat makes are grounded in how experienced strength and conditioning coaches actually reason — which requires exercise science knowledge, not just pattern matching."
  },
  {
    q: "Does TrainChat prioritize performance or aesthetics?",
    a: "TrainChat is performance-oriented by default — it focuses on developing athletic capacity, whether that's strength, power, endurance, or general fitness. Aesthetic goals are valid and fully supported, but the programming philosophy approaches them through a performance lens: build capacity, manage load intelligently, progress consistently."
  },
  {
    q: "Why did a strength coach build TrainChat instead of a tech company?",
    a: "Because the problem isn't software — it's coaching knowledge. Every athlete deserves access to adaptive, intelligent programming. That access has historically been limited by geography, cost, and coach availability. A strength coach building the system ensures the coaching intelligence is real, not approximated from fitness content."
  }
];

const principles = [
  {
    number: "01",
    title: "Programming is a coaching act, not a content act",
    body: "Most fitness apps produce content — programs, plans, workouts — and deliver them. This is publishing, not coaching. Coaching involves an ongoing relationship with the athlete's actual situation: their goals today, their capacity this week, their history over the past three months. TrainChat is designed as a coaching system, not a content delivery system. The program is a living entity maintained through that relationship.",
  },
  {
    number: "02",
    title: "Science should constrain decisions, not suggest them",
    body: "Exercise science findings aren't optional input for good programming — they're hard constraints. Progressive overload isn't a feature to toggle on. Specificity isn't a preference. CNS load management isn't a nice-to-have. The principles that govern how the body adapts to training stimuli should constrain every programming decision the system makes. When they're treated as suggestions, programming quality degrades into high-sounding plausibility.",
  },
  {
    number: "03",
    title: "Adaptation is individual, not average",
    body: "Population-average programming is systematically wrong for most individuals. The athlete who responds quickly to volume is held back by a schedule designed for someone who doesn't. The one who needs more time is pushed into overreaching by a plan that assumes faster adaptation. Every individual variation accommodation in TrainChat — dynamic progression, adaptive load management, feedback-informed mutation — exists because average programming fails the athletes at both ends of the distribution.",
  },
  {
    number: "04",
    title: "Long-term context produces better decisions than current state alone",
    body: "A good coach remembers. They remember that your knee bothered you four months ago. That you thrived on three heavy lower body days when your schedule allowed it. That your last peaking block ended with a PR and two weeks of accumulated fatigue. This longitudinal context shapes every coaching decision they make — and it's exactly what most training tools lack. Training memory isn't a feature. It's the prerequisite for intelligent coaching.",
  },
  {
    number: "05",
    title: "Change what needs changing. Preserve everything else.",
    body: "The temptation when a program isn't working is to rebuild it. This is usually wrong. When one thing needs to change, the correct response is changing that one thing — precisely, with rationale, leaving the rest intact. The Mutation-First Programming Principle exists because excessive program rebuilding is a coaching failure mode: it loses accumulated load, disrupts adaptation trajectories, and signals to the athlete that their program is disposable. Precise mutation signals mastery.",
  },
  {
    number: "06",
    title: "Access to quality coaching is a performance equity problem",
    body: "Athletes with access to professional strength and conditioning coaches have a structural advantage over those who don't. Not because of motivation or work ethic — because their programming is better. More adaptive, more informed, more consistently aligned with their actual capacity and goals. The access gap is a performance equity problem. TrainChat exists, specifically, to close it. The quality of coaching intelligence in the system has to be high enough that athletes without any access to professionals can train on the same programming quality as those who do.",
  },
  {
    number: "07",
    title: "Conversation is the natural interface for coaching",
    body: "Coaching conversations have always been the mechanism through which athletes communicate their state and coaches adjust their approach. 'My hip is tight today.' 'That set was a grind.' 'I want to focus more on explosiveness this block.' These are the real inputs that good coaching runs on. Translating them into dropdown menus, rating scales, and configuration forms loses most of the information. Conversation preserves it. The conversational interface in TrainChat isn't a novelty — it's the most natural interface possible for coaching.",
  },
  {
    number: "08",
    title: "What you can't explain, you probably don't understand",
    body: "Every coaching decision should be explainable. Why this exercise? Why this load? Why now? If the system can't provide a clear rationale, the decision quality is in doubt. TrainChat logs every mutation with its rationale — not as an audit trail feature, but as a quality signal. Explainability forces precision. It prevents the kind of drift that produces plausible-sounding programs disconnected from the athlete's actual situation.",
  }
];

export default function TrainingPhilosophyPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Training Philosophy — The Principles Behind TrainChat"
      description="The coaching philosophy behind TrainChat — eight principles from a practicing strength and conditioning coach. Practitioner-first, evidence-based, performance-focused, built to close the access gap in quality coaching."
      schema={schema}
      canonical="/training-philosophy"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Philosophy</p>
          <h1 className="text-3xl font-bold tracking-tight">Training Philosophy</h1>
          <p className="text-muted-foreground leading-relaxed">
            Eight principles behind TrainChat — written by the founder. Not startup values. Coaching principles that shaped every architectural decision in the system.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">From the Founder</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            I spent a decade coaching athletes before building TrainChat. These aren't principles I derived from product strategy — they're the things I believed as a coach that I couldn't find in any existing training tool. Building TrainChat was the attempt to build the tool that matched the coaching I thought athletes deserved.
          </p>
        </div>

        <div className="space-y-10">
          {principles.map((p) => (
            <section key={p.number} className="space-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-bold text-muted-foreground/40 font-mono flex-shrink-0">{p.number}</span>
                <h2 className="text-xl font-bold tracking-tight leading-snug">{p.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed pl-6">{p.body}</p>
            </section>
          ))}
        </div>

        <section className="border-t border-border pt-6">
          <h2 className="text-xl font-bold tracking-tight mb-4">Where the Philosophy Lives in Practice</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "The TrainChat Methodology", desc: "The frameworks that implement these principles", path: "/methodology" },
              { label: "Exercise Science Foundation", desc: "The research base behind the decisions", path: "/research" },
              { label: "Concept Library", desc: "The terminology the philosophy generates", path: "/concepts" },
              { label: "About TrainChat", desc: "The product built on these principles", path: "/about" },
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
