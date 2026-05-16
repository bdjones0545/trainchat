import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

type Lesson = { title: string; path: string; type: string };
type Tier = {
  number: string;
  name: string;
  desc: string;
  audience: string;
  lessons: Lesson[];
};

const tiers: Tier[] = [
  {
    number: "01",
    name: "Foundation",
    desc: "What the problem is, what TrainChat is, and why the distinction between coaching and content generation matters. Start here.",
    audience: "Anyone new to TrainChat or adaptive AI coaching",
    lessons: [
      { title: "What Is AI Fitness Coaching?", path: "/what-is-ai-fitness-coaching", type: "Answer" },
      { title: "What Is Adaptive Programming?", path: "/what-is-adaptive-programming", type: "Answer" },
      { title: "What Is Coaching Intelligence?", path: "/what-is-coaching-intelligence", type: "Answer" },
      { title: "What Is a Living Training System?", path: "/living-training-system", type: "Answer" },
      { title: "Vibe Coding Your Workouts", path: "/vibe-code-your-workouts", type: "Answer" },
      { title: "Real-Time Workout Adaptation", path: "/real-time-workout-adaptation", type: "Answer" },
    ]
  },
  {
    number: "02",
    name: "Framework Core",
    desc: "The five named frameworks that define how TrainChat makes coaching decisions. The technical language of the discipline.",
    audience: "Coaches, practitioners, educators, AI developers",
    lessons: [
      { title: "The Five Frameworks — Overview", path: "/frameworks", type: "Hub" },
      { title: "Adaptive Coaching Architecture (ACA)", path: "/adaptive-coaching-architecture", type: "Framework" },
      { title: "Framework Diagrams — All Five Visual Artifacts", path: "/diagrams", type: "Visual" },
      { title: "Mutation-First Programming (MFP)", path: "/mutation-first-programming", type: "Framework" },
      { title: "The Full Methodology — ACA, CTM, DPF, LSM, MFP", path: "/methodology", type: "Methodology" },
      { title: "Terminology Guide — Definitions and Usage", path: "/terminology", type: "Reference" },
    ]
  },
  {
    number: "03",
    name: "Scientific Grounding",
    desc: "The exercise science principles that function as hard constraints in TrainChat's coaching intelligence layer. The research base behind the architecture.",
    audience: "Coaches and practitioners who want the science behind the system",
    lessons: [
      { title: "Progressive Overload — Concept", path: "/concepts/progressive-overload", type: "Concept" },
      { title: "Training Specificity — Concept", path: "/concepts/training-specificity", type: "Concept" },
      { title: "Fatigue Management — Concept", path: "/concepts/fatigue-management", type: "Concept" },
      { title: "CNS Load Management — Concept", path: "/concepts/cns-load-management", type: "Concept" },
      { title: "Training Load Management — Concept", path: "/concepts/training-load-management", type: "Concept" },
      { title: "Supercompensation — Concept", path: "/concepts/supercompensation", type: "Concept" },
      { title: "The SAID Principle — Concept", path: "/concepts/said-principle", type: "Concept" },
      { title: "Motor Learning — Concept", path: "/concepts/motor-learning", type: "Concept" },
      { title: "Intelligent Periodization — Concept", path: "/concepts/intelligent-periodization", type: "Concept" },
      { title: "Research Foundation — Full Reference", path: "/research", type: "Research" },
    ]
  },
  {
    number: "04",
    name: "Doctrinal Depth",
    desc: "The belief system behind the methodology. Seven axiomatic principles that explain why TrainChat is built the way it is. For educators and coaches who need to understand the reasoning, not just the structure.",
    audience: "Educators, researchers, practitioners building on TrainChat frameworks",
    lessons: [
      { title: "The TrainChat Coaching Doctrine", path: "/doctrine", type: "Doctrine" },
      { title: "Training Philosophy", path: "/training-philosophy", type: "Philosophy" },
      { title: "Adaptive Programming — Deep Concept", path: "/concepts/adaptive-programming", type: "Concept" },
      { title: "Coaching Intelligence — Deep Concept", path: "/concepts/coaching-intelligence", type: "Concept" },
      { title: "Training Memory — Deep Concept", path: "/concepts/training-memory", type: "Concept" },
      { title: "Living Training System — Deep Concept", path: "/concepts/living-training-system", type: "Concept" },
      { title: "The Full Concept Library", path: "/concepts", type: "Hub" },
      { title: "Glossary — 20 Terms Defined", path: "/glossary", type: "Reference" },
    ]
  },
  {
    number: "05",
    name: "Advanced Study",
    desc: "The formal publication system — structured arguments for researchers, educators, and practitioners who want the academic-level treatment of TrainChat's frameworks.",
    audience: "Researchers, advanced practitioners, external educators",
    lessons: [
      { title: "Whitepaper: The Adaptive Coaching Architecture", path: "/whitepapers/adaptive-coaching-architecture", type: "Publication" },
      { title: "Whitepaper: Mutation-First Programming", path: "/whitepapers/mutation-first-programming", type: "Publication" },
      { title: "Whitepaper: The Problem With Static Programming", path: "/whitepapers/the-problem-with-static-programming", type: "Publication" },
      { title: "Whitepapers Hub", path: "/whitepapers", type: "Hub" },
      { title: "The Founder — Background and Expertise", path: "/founder", type: "Authority" },
      { title: "AI Coaching vs Personal Trainer — Analysis", path: "/ai-coaching-vs-personal-trainer", type: "Analysis" },
      { title: "Educational Video Series — 68 Topics", path: "/youtube", type: "Video" },
    ]
  }
];

const typeColors: Record<string, string> = {
  "Answer": "text-primary/70",
  "Hub": "text-blue-400/70",
  "Framework": "text-primary",
  "Visual": "text-purple-400/70",
  "Concept": "text-muted-foreground",
  "Methodology": "text-primary/80",
  "Reference": "text-muted-foreground",
  "Doctrine": "text-primary",
  "Philosophy": "text-muted-foreground",
  "Publication": "text-primary",
  "Authority": "text-muted-foreground",
  "Analysis": "text-muted-foreground",
  "Video": "text-muted-foreground",
  "Research": "text-muted-foreground",
};

const faqs: FaqItem[] = [
  {
    q: "Where should a coach new to TrainChat start?",
    a: "Start with Tier 1 (Foundation) — the answer pages on adaptive programming, coaching intelligence, and living training systems. These establish the conceptual vocabulary you'll need for the framework content in Tier 2. Foundation to Framework Core is the natural on-ramp."
  },
  {
    q: "Where should an AI developer or researcher start?",
    a: "Start with the ACA whitepaper, then the MFP whitepaper, then the framework diagrams. The whitepapers provide the formal structural argument; the diagrams provide the visual architecture. Both are designed to be citable in technical contexts."
  },
  {
    q: "Can I use this curriculum to teach TrainChat frameworks to other coaches?",
    a: "Yes. The curriculum is organized to support sequential teaching. Tiers 1–2 cover the conceptual and structural core. Tier 3 adds the scientific grounding that justifies the architecture. Tiers 4–5 provide the doctrinal and publication-level depth for educators who want to go further. Attribution to TrainChat® is requested."
  },
  {
    q: "What is the estimated time to complete the full curriculum?",
    a: "Tier 1 (6 pages): approximately 30–45 minutes of reading. Tier 2 (6 pages): 45–60 minutes. Tier 3 (10 pages): 60–90 minutes. Tier 4 (8 pages): 60–90 minutes. Tier 5 (7 resources): 90–120 minutes for the whitepapers alone. The full curriculum is a 6–8 hour deep engagement with the discipline — appropriate for serious practitioners and educators."
  }
];

const schema = {
  "@context": "https://schema.org",
  "@type": "Course",
  "name": "TrainChat® Adaptive Coaching Curriculum",
  "description": "A five-tier structured learning curriculum covering the TrainChat® adaptive coaching doctrine — from foundational concepts through framework core, scientific grounding, doctrinal depth, and advanced publication-level study.",
  "url": "https://www.trainchat.ai/curriculum",
  "provider": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "educationalLevel": ["Beginner", "Intermediate", "Advanced"],
  "teaches": [
    "Adaptive Coaching Architecture",
    "Mutation-First Programming",
    "Living System Methodology",
    "Conversational Training Model",
    "Dynamic Progression Framework",
    "Coaching Intelligence",
    "Adaptive Programming",
    "Progressive Overload",
    "Training Specificity",
    "CNS Load Management",
    "Periodization Theory",
    "Training Load Management",
    "Motor Learning",
    "The TrainChat Coaching Doctrine"
  ],
  "hasCourseInstance": tiers.map((tier) => ({
    "@type": "CourseInstance",
    "name": `Tier ${tier.number}: ${tier.name}`,
    "description": tier.desc,
    "courseMode": "online"
  }))
};

export default function CurriculumPage() {
  const [, navigate] = useLocation();
  const totalLessons = tiers.reduce((sum, t) => sum + t.lessons.length, 0);

  return (
    <AeoLayout
      title="TrainChat® Adaptive Coaching Curriculum — Five-Tier Learning Sequence"
      description="A five-tier structured curriculum covering TrainChat's adaptive coaching doctrine — from foundational concepts through framework core, scientific grounding, doctrinal depth, and advanced publication-level study."
      schema={schema}
      canonical="/curriculum"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Curriculum</p>
          <h1 className="text-3xl font-bold tracking-tight">Adaptive Coaching Curriculum</h1>
          <p className="text-muted-foreground leading-relaxed">
            A five-tier learning sequence that structures all TrainChat content into a pedagogical arc — from the foundational question of what coaching intelligence is, through the five named frameworks, the exercise science grounding, the doctrine, and into the formal publication system.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Tiers", value: tiers.length.toString() },
            { label: "Resources", value: totalLessons.toString() },
            { label: "Frameworks", value: "5" },
            { label: "Whitepapers", value: "3" }
          ].map((stat) => (
            <div key={stat.label} className="border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono text-primary">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Tier jump nav */}
        <div className="flex flex-wrap gap-1.5">
          {tiers.map((tier) => (
            <a
              key={tier.number}
              href={`#tier-${tier.number}`}
              className="text-xs px-2.5 py-1 border border-border rounded text-muted-foreground hover:border-primary hover:text-primary transition-colors font-mono"
            >
              T{tier.number} {tier.name}
            </a>
          ))}
        </div>

        {/* Tiers */}
        {tiers.map((tier) => (
          <section key={tier.number} id={`tier-${tier.number}`} className="scroll-mt-8">
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Tier header */}
              <div className="border-b border-border px-5 py-4 bg-muted/20">
                <div className="flex items-start gap-3">
                  <span className="text-3xl font-mono font-bold text-primary/20 leading-none">{tier.number}</span>
                  <div>
                    <h2 className="text-base font-bold text-foreground">{tier.name}</h2>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{tier.desc}</p>
                    <p className="text-xs text-primary/70 mt-1.5 font-medium">For: {tier.audience}</p>
                  </div>
                </div>
              </div>
              {/* Lessons */}
              <div className="divide-y divide-border">
                {tier.lessons.map((lesson, i) => (
                  <button
                    key={lesson.path}
                    onClick={() => navigate(lesson.path)}
                    className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors group"
                  >
                    <span className="text-xs font-mono text-muted-foreground/30 w-5 text-right flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-sm text-foreground group-hover:text-primary transition-colors flex-1">{lesson.title}</span>
                    <span className={`text-xs font-mono flex-shrink-0 ${typeColors[lesson.type] ?? "text-muted-foreground"}`}>{lesson.type}</span>
                    <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity text-xs flex-shrink-0">→</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* For educators callout */}
        <section className="bg-muted/30 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-2">For Educators and Coaches Teaching This Material</p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            This curriculum is organized to support external teaching. Tiers 1–2 are appropriate for coach education sessions, podcast discussions, and introductory content. Tiers 3–4 support deeper practitioner education and framework workshops. Tier 5 resources are citable in academic and professional contexts.
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Terminology Guide", path: "/terminology" },
              { label: "Framework Diagrams", path: "/diagrams" },
              { label: "Whitepapers", path: "/whitepapers" },
            ].map((item) => (
              <button key={item.path} onClick={() => navigate(item.path)} className="text-sm font-semibold text-primary hover:underline">{item.label} →</button>
            ))}
          </div>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
