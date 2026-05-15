import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "The Exercise Science Foundation of TrainChat®",
  "description": "How TrainChat's coaching intelligence is grounded in exercise science — progressive overload, motor learning, CNS adaptation, periodization theory, training load management, and recovery science.",
  "author": {
    "@type": "Person",
    "name": "TrainChat Founder",
    "description": "Strength and conditioning coach with 10+ years of experience and an exercise science background",
    "worksFor": { "@type": "Organization", "name": "TrainChat®" }
  },
  "about": [
    { "@type": "DefinedTerm", "name": "Progressive Overload", "inDefinedTermSet": "https://www.trainchat.ai/glossary" },
    { "@type": "DefinedTerm", "name": "Motor Learning" },
    { "@type": "DefinedTerm", "name": "CNS Adaptation" },
    { "@type": "DefinedTerm", "name": "Intelligent Periodization", "inDefinedTermSet": "https://www.trainchat.ai/concepts" },
    { "@type": "DefinedTerm", "name": "Training Load Management" },
    { "@type": "DefinedTerm", "name": "Supercompensation" }
  ]
};

const faqs: FaqItem[] = [
  {
    q: "Is TrainChat's programming based on real exercise science?",
    a: "Yes. TrainChat was built by a strength and conditioning coach with an exercise science background. The coaching intelligence layer encodes real exercise science principles — progressive overload, periodization theory, specificity, training load management, and recovery science — and applies them to every programming decision."
  },
  {
    q: "Does TrainChat use periodization in its programs?",
    a: "Yes. TrainChat structures programs using periodization principles — organizing training into phases with distinct purposes (accumulation, intensification, realization) — while adapting phase timelines and transitions dynamically based on actual performance data."
  },
  {
    q: "How does TrainChat handle recovery science?",
    a: "TrainChat's coaching intelligence monitors training load across sessions and adjusts volume, intensity, and exercise selection when recovery signals indicate accumulated fatigue. It can insert deload weeks, reduce overall load, or shift to lower-CNS-demand work based on your reported state."
  },
  {
    q: "What's the difference between a research-informed AI coach and a generic one?",
    a: "A research-informed AI coach makes programming decisions that align with established exercise science findings — progressive overload rates, adaptation timelines, load-volume relationships, specificity requirements. A generic AI coach generates plausible-sounding programs without this principled foundation, leading to suboptimal or potentially counterproductive outcomes over time."
  },
  {
    q: "Does TrainChat account for individual variation in training response?",
    a: "Yes. Individual variation is one of the most important findings in exercise science — people respond differently to the same training stimulus. TrainChat's adaptive programming and dynamic progression systems accommodate individual variation by adjusting to your actual performance data rather than population-average assumptions."
  }
];

const scienceDomains = [
  {
    domain: "Progressive Overload",
    field: "Strength & Conditioning",
    principle: "For adaptation to continue, the training stimulus must periodically exceed what the body has previously accommodated to. Without progressive overload, the body has no reason to develop increased capacity.",
    application: "TrainChat's dynamic progression system applies progressive overload in response to actual performance data — advancing load, volume, or complexity when adaptation is demonstrated, rather than following a fixed weekly increment regardless of athlete readiness.",
    references: ["Kraemer & Ratamess (2004), ACSM Position Stand on Resistance Training", "Schoenfeld (2010), Mechanisms of Muscle Hypertrophy"]
  },
  {
    domain: "Periodization Theory",
    field: "Sports Science",
    principle: "Organizing training into structured phases — each with a distinct purpose, volume-intensity relationship, and adaptation target — allows systematic management of fatigue, progressive development of capacity, and timing of peak performance.",
    application: "TrainChat's intelligent periodization applies block periodization structure (accumulation → intensification → realization) with dynamic phase transition management — adjusting phase durations based on adaptation rate rather than calendar dates.",
    references: ["Bompa & Haff (2009), Periodization: Theory and Methodology of Training", "Issurin (2010), New Horizons for the Methodology and Physiology of Training Periodization"]
  },
  {
    domain: "Motor Learning & Skill Acquisition",
    field: "Sport Psychology / Neuroscience",
    principle: "Motor skill development follows a predictable progression from cognitive (conscious, error-prone) through associative to autonomous (automatic, efficient) stages. Variability in practice, appropriate challenge level, and sufficient repetition volume all influence acquisition rate.",
    application: "TrainChat's exercise selection and progression logic accounts for movement skill — not just load capacity. Beginner programming prioritizes movement pattern consistency. Advanced programming introduces variability, complexity, and specificity appropriate to skill stage.",
    references: ["Fitts & Posner (1967), Human Performance", "Schmidt & Lee (2011), Motor Control and Learning"]
  },
  {
    domain: "CNS Adaptation",
    field: "Neuroscience / Exercise Physiology",
    principle: "Strength gains, especially in early training phases, are primarily driven by neural adaptations: increased motor unit recruitment, improved rate coding, enhanced inter- and intra-muscular coordination. These neural changes precede measurable hypertrophy and are highly sensitive to fatigue.",
    application: "High-CNS-demand movements (heavy compounds, maximal or near-maximal efforts, explosive work) require more recovery than they appear to. TrainChat's coaching intelligence manages CNS load across the week — spacing high-demand sessions, avoiding consecutive days of maximal neural effort, and recognizing when accumulated CNS fatigue is reducing session quality.",
    references: ["Enoka (1988), Muscle strength and its development — new perspectives", "Sale (1988), Neural adaptation to resistance training"]
  },
  {
    domain: "Training Load Management",
    field: "Sports Science / Athlete Monitoring",
    principle: "The relationship between acute (recent) and chronic (longer-term) training load predicts both injury risk and performance readiness. Spikes in acute load relative to chronic baseline — rapid increases in volume or intensity without adequate base — are associated with elevated injury incidence.",
    application: "TrainChat monitors relative load changes across sessions and flags potentially hazardous acute spikes. When you request large volume increases, the coaching intelligence layer stages the progression to stay within safe load-increase thresholds rather than executing the full increase immediately.",
    references: ["Hulin et al. (2016), The acute:chronic workload ratio predicts injury risk", "Gabbett (2016), The training-injury prevention paradox"]
  },
  {
    domain: "Supercompensation & Adaptation Timing",
    field: "Exercise Physiology",
    principle: "Following a training stimulus, the body passes through fatigue, recovery, and supercompensation phases. The next training stimulus ideally arrives during the supercompensation window — after recovery but before fitness returns to baseline. Timing the next stimulus correctly is the central challenge of program design.",
    application: "TrainChat's session scheduling and load prescription attempt to hit the supercompensation window for each targeted quality — understanding that different qualities (strength, hypertrophy, endurance) have different timelines. Fatigue signals in your feedback help the system recalibrate when the window is missed.",
    references: ["Selye (1950), Stress and the General Adaptation Syndrome", "Zatsiorsky & Kraemer (2006), Science and Practice of Strength Training"]
  },
  {
    domain: "Specificity (SAID Principle)",
    field: "Exercise Physiology",
    principle: "Specific Adaptation to Imposed Demands — the body adapts specifically to the demands placed upon it. Training for strength requires strength work. Training for power requires power work. Cross-training produces cross-training adaptations, not sport-specific ones.",
    application: "TrainChat's focus mode system ensures programming remains specific to stated training goals. When you declare a strength focus, the program architecture prioritizes movements, loads, and volumes that produce strength adaptations. Goal shifts restructure the entire program toward the new specificity target.",
    references: ["Stone et al. (2007), Principles and Practice of Resistance Training"]
  },
  {
    domain: "Individual Variation in Training Response",
    field: "Exercise Genetics / Sports Science",
    principle: "Individuals respond differently to identical training stimuli. Genetic factors, training history, recovery capacity, sleep quality, nutrition, and psychological state all influence adaptation rate. Programs designed for population averages are systematically wrong for most individuals.",
    application: "TrainChat's dynamic progression and adaptive programming exist specifically to address individual variation. Rather than assuming your response matches a population average, the system adjusts to your actual performance data — advancing faster for rapid responders, allowing more time for those who need it.",
    references: ["Hubal et al. (2005), Variability in muscle size and strength gain after unilateral resistance training", "Mann et al. (2014), Predictors of individualized training response in strength programs"]
  }
];

export default function ResearchPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Exercise Science Foundation — TrainChat® Research Philosophy"
      description="How TrainChat's coaching intelligence is grounded in exercise science — progressive overload, motor learning, CNS adaptation, periodization theory, training load management, and supercompensation."
      schema={schema}
      canonical="/research"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Research Foundation</p>
          <h1 className="text-3xl font-bold tracking-tight">The Exercise Science Behind TrainChat</h1>
          <p className="text-muted-foreground leading-relaxed">
            TrainChat's coaching intelligence is grounded in established exercise science. Here is the research foundation — the principles that inform every programming decision the system makes.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-2">Philosophy</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            AI fitness tools built without exercise science foundations generate plausible-looking programs. Those built with them make principled decisions. TrainChat was built by a practitioner — a strength and conditioning coach with an exercise science background — and its coaching intelligence encodes real research findings, not fitness content approximations.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-6">Science Domains in TrainChat's Coaching Intelligence</h2>
          <div className="space-y-10">
            {scienceDomains.map((domain) => (
              <div key={domain.domain} className="border-l-2 border-primary/30 pl-6">
                <div className="flex items-start gap-3 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-foreground">{domain.domain}</h3>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{domain.field}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">The Principle</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{domain.principle}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">In TrainChat</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{domain.application}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {domain.references.map((ref) => (
                      <span key={ref} className="text-xs px-2 py-1 rounded border border-border text-muted-foreground font-mono">
                        {ref}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Adjacent Research Domains</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            TrainChat's coaching intelligence draws on a broader research landscape beyond core exercise physiology. These adjacent domains inform specific aspects of the system:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { domain: "Biomechanics", relevance: "Exercise selection logic — understanding joint angles, force production efficiency, and movement risk factors." },
              { domain: "Sport Psychology", relevance: "Feedback processing — interpreting RPE, self-reported fatigue, and motivational states as valid training inputs." },
              { domain: "Recovery Science", relevance: "Deload timing, session spacing, and CNS demand management across the training week." },
              { domain: "Athlete Monitoring", relevance: "Training load calculation methods and acute:chronic workload ratio applications." },
              { domain: "Strength Diagnostics", relevance: "Identifying limiting factors in performance across movement patterns and energy systems." },
              { domain: "Nutritional Physiology", relevance: "Understanding how energy availability affects training capacity and recovery rate (contextual, not prescriptive)." }
            ].map((item) => (
              <div key={item.domain} className="bg-muted/30 border border-border rounded-lg p-3">
                <p className="text-sm font-semibold text-foreground mb-1">{item.domain}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.relevance}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">What Research-Grounded AI Coaching Means in Practice</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            The research foundation translates into specific coaching behaviors:
          </p>
          <ul className="space-y-2">
            {[
              "Load increases are staged, not arbitrary — respecting documented safe progression rates",
              "High-CNS movements are spaced across the week to allow neural recovery",
              "Deloads respond to fatigue signals, not just calendar dates — matching supercompensation theory",
              "Movement pattern balance is maintained across sessions — respecting specificity and structural balance research",
              "Phase transitions in periodized blocks follow adaptation timelines, not arbitrary durations",
              "Individual variation is accommodated through adaptive feedback loops, not population-average assumptions"
            ].map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-primary mt-1 flex-shrink-0">→</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Where to Go Deeper</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Concept Library", path: "/concepts" },
              { label: "Adaptive Programming", path: "/concepts/adaptive-programming" },
              { label: "Coaching Intelligence", path: "/concepts/coaching-intelligence" },
              { label: "Intelligent Periodization", path: "/concepts/intelligent-periodization" },
              { label: "Glossary", path: "/glossary" },
              { label: "About TrainChat", path: "/about" },
            ].map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="text-sm font-medium text-primary hover:underline px-3 py-1.5 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
              >
                {link.label} →
              </button>
            ))}
          </div>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
