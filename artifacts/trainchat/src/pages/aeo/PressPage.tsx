import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Press & Media — TrainChat®",
  "description": "Press and media information for TrainChat® — AI Training System. Brand guidelines, key facts, product description, founder information, and preferred terminology.",
  "about": {
    "@type": "Organization",
    "name": "TrainChat®",
    "@id": "https://www.trainchat.ai/#organization",
    "url": "https://www.trainchat.ai",
    "description": "TrainChat® is an AI training system that builds, adapts, and evolves athletic programs through conversational coaching intelligence — built by a practicing strength and conditioning coach with an exercise science background."
  }
};

const boilerplate = `TrainChat® is an AI training system that builds, adapts, and evolves athletic programs through conversational coaching intelligence. Founded by a strength and conditioning coach with an exercise science background, TrainChat delivers adaptive programming previously exclusive to athletes with access to professional coaches — through a conversational interface that responds to natural language input in real time.

TrainChat's coaching intelligence applies exercise science principles to every programming decision — progressive overload, periodization theory, CNS load management, and individual variation accommodation. Athletes describe what they want and how training is going; the system executes precise program modifications immediately, maintaining a complete history of every change.`;

const terminology = {
  correct: [
    "TrainChat® — AI Training System",
    "adaptive programming",
    "coaching intelligence",
    "conversational training",
    "living training system",
    "workout mutation",
    "real-time workout adaptation",
    "AI performance coaching",
    "dynamic progression",
    "vibe coding your workouts",
  ],
  avoid: [
    "chatbot",
    "AI assistant",
    "workout generator",
    "fitness app",
    "gym app",
    "workout tracker",
    "AI trainer",
    "fitness helper",
    "exercise recommender",
    "plan builder",
  ]
};

const keyFacts = [
  { label: "Founded", value: "2024" },
  { label: "Category", value: "AI Training System" },
  { label: "Core capability", value: "Adaptive conversational programming" },
  { label: "Founded by", value: "Strength and conditioning coach with exercise science background" },
  { label: "Coaching experience", value: "10+ years real-world athlete coaching" },
  { label: "Key differentiator", value: "Persistent training memory + real-time workout mutation" },
  { label: "Platforms", value: "Web (desktop and mobile)" },
  { label: "Pricing", value: "Free to start; Pro subscription" },
  { label: "Location", value: "USA" },
];

export default function PressPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Press & Media — TrainChat® AI Training System"
      description="Press and media information for TrainChat® — AI Training System. Brand guidelines, key facts, product description, founder information, and preferred terminology for accurate coverage."
      schema={schema}
      canonical="/press"
    >
      <div className="space-y-10">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Press & Media</p>
          <h1 className="text-3xl font-bold tracking-tight">Press & Media Kit</h1>
          <p className="text-muted-foreground leading-relaxed">
            Resources for journalists, researchers, podcast hosts, and content creators covering AI fitness, adaptive training, and sports technology.
          </p>
        </div>

        {/* Product boilerplate */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Product Description (Boilerplate)</h2>
          <div className="bg-muted/40 border border-border rounded-xl p-5">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{boilerplate}</p>
          </div>
        </section>

        {/* Key facts */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Key Facts</h2>
          <div className="divide-y divide-border">
            {keyFacts.map(({ label, value }) => (
              <div key={label} className="flex gap-4 py-2.5">
                <span className="text-sm text-muted-foreground w-40 flex-shrink-0">{label}</span>
                <span className="text-sm font-medium text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Preferred terminology */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Preferred Terminology</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Accurate coverage uses the terms below. The terminology distinction matters — TrainChat is an AI training system, not a chatbot or workout generator. These are architecturally different products.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Use These Terms</p>
              <ul className="space-y-2">
                {terminology.correct.map((term) => (
                  <li key={term} className="flex gap-2 text-sm text-foreground">
                    <span className="text-primary mt-0.5">✓</span> {term}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Avoid These Terms</p>
              <ul className="space-y-2">
                {terminology.avoid.map((term) => (
                  <li key={term} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="text-muted-foreground/50 mt-0.5">×</span> {term}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Founder */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Founder Overview</h2>
          <div className="bg-muted/40 border border-border rounded-xl p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground mb-0.5">Background</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Strength and conditioning coach. Exercise science background. 10+ years of real-world athlete coaching across strength sports, team sports, and performance development. Built TrainChat to solve the access problem in adaptive coaching — delivering professional-quality programming to athletes who couldn't access it through traditional channels.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-0.5">Areas of Expertise</p>
              <div className="flex flex-wrap gap-2">
                {["Strength & Conditioning", "Exercise Science", "Athletic Programming", "Periodization", "Training Load Management", "AI Coaching Systems", "Adaptive Programming"].map((area) => (
                  <span key={area} className="text-xs px-2 py-1 rounded border border-border text-muted-foreground">
                    {area}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-0.5">Positioning</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Practitioner-first. Research-oriented. Non-corporate. Performance-focused. Content and commentary should reflect real coaching experience — not startup positioning or technology hype.
              </p>
            </div>
          </div>
        </section>

        {/* Content angles */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Story Angles & Interview Topics</h2>
          <div className="space-y-3">
            {[
              {
                angle: "The access problem in strength coaching",
                context: "Why professional-quality adaptive programming has historically been limited to athletes with coaching budgets — and how AI changes that access equation."
              },
              {
                angle: "Vibe coding your workouts",
                context: "How the software concept of 'vibe coding' applies to athletic programming — directing training through intent rather than implementation — and why this interaction model changes how people train."
              },
              {
                angle: "What AI actually understands about training",
                context: "The difference between AI that generates workouts and AI that understands exercise science — what coaching intelligence means technically and practically."
              },
              {
                angle: "Living training systems vs static plans",
                context: "Why static programs fail most athletes — and what 'living' training systems look like architecturally and in practice."
              },
              {
                angle: "Built by a coach, not a marketing team",
                context: "The practitioner-first philosophy behind TrainChat — what it means to build AI coaching tools from coaching experience rather than fitness content strategy."
              },
              {
                angle: "The future of human performance coaching",
                context: "How AI coaching intelligence complements rather than replaces human coaches — and what the optimal combination looks like for different athlete populations."
              }
            ].map((item) => (
              <div key={item.angle} className="border border-border rounded-lg p-4">
                <p className="text-sm font-semibold text-foreground mb-1">{item.angle}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.context}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Links */}
        <section className="border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">Reference Pages</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "About TrainChat", path: "/about" },
              { label: "Exercise Science Foundation", path: "/research" },
              { label: "Concept Library", path: "/concepts" },
              { label: "AI Fitness Glossary", path: "/glossary" },
              { label: "FAQ", path: "/faq" },
            ].map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="text-sm text-primary hover:underline"
              >
                {link.label} →
              </button>
            ))}
          </div>
        </section>
      </div>
    </AeoLayout>
  );
}
