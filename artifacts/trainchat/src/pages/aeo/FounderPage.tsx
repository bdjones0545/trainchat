import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const expertiseAreas = [
  {
    domain: "Adaptive Training Systems",
    description: "The design and implementation of training systems that update in real time based on performance feedback, athlete state, and goal evolution — rather than following fixed program templates to completion."
  },
  {
    domain: "Coaching Intelligence",
    description: "The exercise science reasoning layer that makes AI coaching decisions principled rather than probabilistic — applying progressive overload, specificity, CNS load management, and periodization theory as structural constraints."
  },
  {
    domain: "Periodization Theory",
    description: "The multi-week and multi-phase organization of training stress and recovery — linear, undulating, block, and conjugate models — and when each is appropriate given the athlete's training age, schedule, and goal."
  },
  {
    domain: "Motor Learning and Skill Acquisition",
    description: "How the nervous system acquires, refines, and automates movement skills through practice — and why skill acquisition stage must inform exercise selection, not just physiological load capacity."
  },
  {
    domain: "Training Load Management",
    description: "The monitoring and control of accumulated training stress — acute:chronic workload ratio, CNS load management, session density, and deload architecture — to keep athletes training in the optimal adaptation window."
  },
  {
    domain: "AI Coaching System Design",
    description: "The architectural decisions required to build AI systems that behave like coaches — memory persistence, mutation-first change management, conversational interfaces, and science-constrained decision engines."
  }
];

const contentSeries = [
  {
    title: "The Frameworks Series",
    description: "Structured explanations of each named TrainChat framework — ACA, CTM, DPF, LSM, MFP — in whiteboard, lecture, and conversational formats.",
    episodes: ["What Is the Adaptive Coaching Architecture?", "Mutation-First Programming: The Coaching Logic", "Dynamic Progression: Why Fixed Increments Fail", "Living Training Systems Explained", "The Conversational Training Model"]
  },
  {
    title: "The Doctrine Series",
    description: "The seven axiomatic principles behind TrainChat's coaching beliefs — explored individually with coaching examples, research grounding, and architectural implications.",
    episodes: ["Programming Is a Coaching Act", "Science Should Constrain, Not Suggest", "Adaptation Is Contextual", "Memory Enables Continuity", "Mutation Before Reconstruction", "Conversation as Interface", "Coaching Access as Equity"]
  },
  {
    title: "The Exercise Science Series",
    description: "Research-grounded explanations of the principles that ground TrainChat's coaching intelligence — for coaches and athletes who want to understand the science, not just the system.",
    episodes: ["Motor Learning and Exercise Selection", "CNS Load Management", "Supercompensation and Periodization", "The SAID Principle in Practice", "Progressive Overload Done Right", "Fatigue vs Overreaching vs Overtraining"]
  },
  {
    title: "Coaching Intelligence vs AI Generation",
    description: "The technical and practical difference between systems that generate plausible workouts and systems with genuine coaching intelligence — and why the architecture matters for athlete outcomes.",
    episodes: ["The Architecture Problem", "Why Memory Is Non-Negotiable", "How Science Becomes a Constraint", "What Makes a Decision Layer", "Mutation vs Rebuild: The Coaching Test"]
  }
];

const faqs: FaqItem[] = [
  {
    q: "Who built TrainChat?",
    a: "TrainChat was built by a strength and conditioning coach with 10+ years of field experience and an exercise science academic background. The founder built TrainChat to bring adaptive programming quality to athletes who couldn't access professional coaching — and to build the coaching tool they had always wanted to use themselves."
  },
  {
    q: "What is the founder's coaching philosophy?",
    a: "The coaching philosophy is formalized in the TrainChat Coaching Doctrine — seven axiomatic principles including 'programming is a coaching act, not a content act', 'science constrains decisions rather than suggesting them', and 'access to quality coaching is a performance equity problem'. These are not positioning statements. They are the actual beliefs that shaped TrainChat's architecture."
  },
  {
    q: "What expertise does the TrainChat founder bring to AI coaching?",
    a: "The founder brings combined expertise in strength and conditioning practice, exercise science research literacy, periodization theory, motor learning, training load management, and the design of AI systems for coaching contexts. The TrainChat methodology — ACA, CTM, DPF, LSM, MFP — is the structured output of this expertise applied to AI system design."
  },
  {
    q: "Where can I learn from the TrainChat founder?",
    a: "The founder's educational content is available through TrainChat's YouTube channel, the published methodology and doctrine pages at trainchat.ai, and through the concept library, research foundation, and training philosophy sections of the site."
  }
];

const schema = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "mainEntity": {
    "@type": "Person",
    "@id": "https://www.trainchat.ai/#founder",
    "name": "TrainChat Founder",
    "jobTitle": "Strength & Conditioning Coach, AI Coaching System Designer",
    "description": "Strength and conditioning coach with 10+ years of field experience and an exercise science academic background. Creator of the TrainChat Coaching Doctrine, the TrainChat Methodology (ACA, CTM, DPF, LSM, MFP), and the adaptive AI training system that embodies both.",
    "url": "https://www.trainchat.ai/founder",
    "sameAs": ["https://www.trainchat.ai"],
    "knowsAbout": [
      "Adaptive Training Systems",
      "Coaching Intelligence",
      "Periodization Theory",
      "Motor Learning",
      "Training Load Management",
      "CNS Load Management",
      "Progressive Overload",
      "AI Coaching System Design",
      "Strength and Conditioning",
      "Exercise Science",
      "Athletic Programming",
      "Conversational Training",
      "Mutation-First Programming",
      "Adaptive Coaching Architecture",
      "Living Training Systems",
      "Performance Adaptation",
      "Supercompensation",
      "SAID Principle",
      "Fatigue Management",
      "Training Specificity"
    ],
    "hasCredential": {
      "@type": "EducationalOccupationalCredential",
      "credentialCategory": "degree",
      "educationalLevel": "Exercise Science"
    },
    "worksFor": { "@id": "https://www.trainchat.ai/#organization" },
    "founder": { "@id": "https://www.trainchat.ai/#organization" },
    "knowsLanguage": "en",
    "hasOccupation": {
      "@type": "Occupation",
      "name": "Strength & Conditioning Coach",
      "description": "Practicing strength and conditioning coach specializing in adaptive programming systems, periodization, and the application of exercise science to individual athlete development."
    }
  }
};

export default function FounderPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="TrainChat® Founder — Strength Coach, Adaptive Coaching Architect"
      description="The founder of TrainChat® — a strength and conditioning coach with 10+ years of field experience and an exercise science background who built the adaptive AI coaching system to bring professional-grade programming to every athlete."
      schema={schema}
      canonical="/founder"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Founder</p>
          <h1 className="text-3xl font-bold tracking-tight">The TrainChat Founder</h1>
          <p className="text-muted-foreground leading-relaxed">
            Strength and conditioning coach with 10+ years of field experience and an exercise science academic background. Built TrainChat to bring adaptive programming quality to every athlete — not just those with access to professional coaching.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-2">From the Founder</p>
          <blockquote className="text-sm text-muted-foreground leading-relaxed italic border-l-2 border-primary pl-4">
            "I spent a decade coaching athletes before building TrainChat. The best programming I could give someone — adaptive, memory-informed, science-constrained, specific to their goals and their history — was reserved for athletes I coached directly. The tool that could do this for everyone didn't exist. Building it wasn't a product decision. It was an obligation."
          </blockquote>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Areas of Expertise</h2>
          <div className="space-y-3">
            {expertiseAreas.map((area) => (
              <div key={area.domain} className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{area.domain}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{area.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Intellectual Output</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The founder's coaching experience and exercise science background produced three layers of intellectual work that together define TrainChat as a system:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "The Doctrine", desc: "Seven axiomatic coaching principles", path: "/doctrine" },
              { label: "The Methodology", desc: "Five named operational frameworks", path: "/methodology" },
              { label: "The Concept Library", desc: "17 defined exercise science terms", path: "/concepts" },
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

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Educational Content Series</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The founder teaches adaptive coaching in four educational series — covering the frameworks, the doctrine, the exercise science foundations, and the AI architecture decisions that make coaching intelligence possible.
          </p>
          <div className="space-y-4">
            {contentSeries.map((series) => (
              <div key={series.title} className="border border-border rounded-xl p-4">
                <h3 className="text-sm font-bold text-foreground mb-1">{series.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{series.description}</p>
                <div className="space-y-1">
                  {series.episodes.map((ep) => (
                    <div key={ep} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="text-primary flex-shrink-0">→</span>
                      <span className="italic">"{ep}"</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate("/youtube")}
            className="mt-3 text-sm font-semibold text-primary hover:underline"
          >
            Full video series →
          </button>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Teaching Philosophy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            The founder teaches the way a practitioner explains — grounded in what they've actually seen work and fail with real athletes, then supported by the research that explains why. The principle comes first. The paper comes second.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This is the same philosophy embedded in the TrainChat Doctrine: "What you can't explain, you probably don't understand." If the system can't articulate why it made a coaching decision, it's not coaching — it's pattern-matching. The educational content holds the same standard.
          </p>
        </section>

        <section className="border-t border-border pt-6">
          <h2 className="text-base font-semibold text-foreground mb-3">Related</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Training Philosophy", path: "/training-philosophy" },
              { label: "The Doctrine", path: "/doctrine" },
              { label: "Research Foundation", path: "/research" },
              { label: "About TrainChat", path: "/about" },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="text-sm text-primary hover:underline"
              >
                {item.label} →
              </button>
            ))}
          </div>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
