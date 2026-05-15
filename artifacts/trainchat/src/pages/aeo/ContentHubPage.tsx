import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const videoSeries = [
  {
    series: "What Is Adaptive AI Training?",
    description: "The foundational educational series explaining adaptive training systems — what they are, why they exist, and why they produce better outcomes than static plans.",
    videos: [
      {
        title: "What Is Adaptive Programming? The Complete Explanation",
        description: "A complete explanation of adaptive programming — the training methodology where programs continuously evolve based on feedback, performance, and goals rather than remaining fixed from their initial build.",
        keywords: ["adaptive programming", "AI training", "workout adaptation", "living training system"],
        duration: "PT8M"
      },
      {
        title: "Why Static Workout Plans Fail (And What to Use Instead)",
        description: "An honest look at why static training plans become misaligned over time — and how adaptive programming solves the structural problems that cause most athletes to abandon structure entirely.",
        keywords: ["static workout plans", "workout app problems", "adaptive training", "AI fitness coaching"],
        duration: "PT7M"
      },
      {
        title: "What Is a Living Training System?",
        description: "Defining the concept of a living training system — a program that maintains persistent memory, adapts in real time, and evolves continuously rather than expiring at the end of a block.",
        keywords: ["living training system", "adaptive programming", "TrainChat", "AI training system"],
        duration: "PT6M"
      },
      {
        title: "Training Memory: Why Your Workout App Forgets You",
        description: "Explaining training memory — what it means for an AI coaching system to remember your full training history — and why it changes the quality of every programming decision.",
        keywords: ["training memory", "AI coaching", "workout tracking", "adaptive training"],
        duration: "PT5M"
      }
    ]
  },
  {
    series: "Coaching Intelligence Explained",
    description: "Deep-dives into the exercise science principles that define coaching intelligence — what separates a coaching AI from a workout generator.",
    videos: [
      {
        title: "Coaching Intelligence vs AI Workout Generation — The Real Difference",
        description: "The technical and practical difference between AI that generates workouts and AI with coaching intelligence — what coaching intelligence means, what it decides, and why it produces fundamentally different outcomes.",
        keywords: ["coaching intelligence", "AI workout generator", "AI strength coach", "adaptive programming"],
        duration: "PT9M"
      },
      {
        title: "Progressive Overload Explained — The Foundation of All Training Progress",
        description: "A practitioner's explanation of progressive overload — what it is, how it works biologically, and why most workout apps implement it incorrectly or not at all.",
        keywords: ["progressive overload", "strength training principles", "training adaptation", "exercise science"],
        duration: "PT8M"
      },
      {
        title: "Periodization Explained for Serious Athletes",
        description: "How periodization organizes training into structured phases — accumulation, intensification, realization — and how intelligent periodization applies these principles dynamically rather than on a fixed calendar.",
        keywords: ["periodization", "training phases", "intelligent periodization", "strength programming"],
        duration: "PT10M"
      },
      {
        title: "CNS Fatigue: Why Heavy Training Days Require More Recovery Than You Think",
        description: "An exercise science explanation of CNS (central nervous system) fatigue — how high-demand training affects neural recovery, and why this matters for session spacing and load management.",
        keywords: ["CNS fatigue", "training recovery", "strength training science", "workout programming"],
        duration: "PT7M"
      }
    ]
  },
  {
    series: "Vibe Code Your Workouts",
    description: "The category-defining series around TrainChat's core concept — directing training through intent-driven conversation.",
    videos: [
      {
        title: "Vibe Code Your Workouts — What It Means and Why It Works",
        description: "Defining the concept of vibe coding your workouts — directing an AI training system through natural, intent-driven conversation rather than manual programming. Where the phrase comes from and what it means in practice.",
        keywords: ["vibe code your workouts", "conversational training", "AI fitness coaching", "TrainChat"],
        duration: "PT6M"
      },
      {
        title: "How to Talk to Your AI Coach: Natural Language Training",
        description: "A practical demonstration of how conversational training works — what to say, how the system interprets intent, and what gets executed in the live program panel.",
        keywords: ["conversational training", "AI coach", "adaptive workout", "TrainChat demo"],
        duration: "PT8M"
      },
      {
        title: "Real-Time Workout Mutation: Changing Your Program Mid-Session",
        description: "Demonstrating workout mutation — how to modify specific exercises, sessions, or blocks through conversational input without rebuilding the entire program.",
        keywords: ["workout mutation", "real-time adaptation", "adaptive programming", "AI workout"],
        duration: "PT7M"
      }
    ]
  },
  {
    series: "AI Fitness Comparisons",
    description: "Honest, practitioner-led comparisons of different approaches to AI fitness — what each tool does, where each excels, and what separates genuine AI coaching from marketing language.",
    videos: [
      {
        title: "TrainChat vs ChatGPT for Workouts — Why a Dedicated System Wins",
        description: "An honest comparison of using ChatGPT for workouts versus a dedicated AI training system — what ChatGPT can and cannot do for programming, and what the architectural differences mean in practice.",
        keywords: ["TrainChat vs ChatGPT", "AI workout app", "ChatGPT workout", "best AI fitness app"],
        duration: "PT8M"
      },
      {
        title: "AI Fitness Coaching vs Personal Training — The Real Comparison",
        description: "A practitioner's honest comparison of AI coaching intelligence versus human personal training — what each does better, what neither can replace, and how to think about the choice.",
        keywords: ["AI coaching vs personal trainer", "AI fitness coaching", "strength coach AI", "personal training"],
        duration: "PT10M"
      },
      {
        title: "The Worst AI Fitness Apps: What to Avoid and Why",
        description: "A framework for evaluating AI fitness tools — identifying apps that use AI as a marketing label without real adaptive capability, and what genuine AI coaching systems do differently.",
        keywords: ["best AI workout app", "AI fitness app review", "adaptive workout app", "AI coaching"],
        duration: "PT7M"
      }
    ]
  },
  {
    series: "The Founder's Coaching Philosophy",
    description: "Direct content from TrainChat's founder — a practicing S&C coach explaining training philosophy, exercise science principles, and the thinking behind the product.",
    videos: [
      {
        title: "Why I Built TrainChat — A Coach's Perspective on AI and Athletic Programming",
        description: "The founding story of TrainChat — why a practicing strength and conditioning coach built an AI training system, what problem it solves, and what it means for athlete access to quality coaching.",
        keywords: ["TrainChat founder", "AI training system", "adaptive programming", "strength coach"],
        duration: "PT12M"
      },
      {
        title: "What 10 Years of Coaching Athletes Taught Me About Effective Programming",
        description: "Practitioner-first content from TrainChat's founder — the lessons from a decade of real-world strength and conditioning coaching that shaped the coaching intelligence layer in TrainChat.",
        keywords: ["strength coaching", "athletic programming", "exercise science", "coaching philosophy"],
        duration: "PT15M"
      },
      {
        title: "The Training Principles That Actually Drive Long-Term Progress",
        description: "An evidence-based explanation of the training principles that consistently produce long-term athletic development — progressive overload, specificity, periodization, individual variation, and recovery management.",
        keywords: ["training principles", "progressive overload", "long-term fitness progress", "strength training"],
        duration: "PT10M"
      }
    ]
  }
];

const allVideos = videoSeries.flatMap((s) => s.videos);

const videoSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "TrainChat® Educational Video Content",
  "description": "Semantic video content series covering adaptive programming, coaching intelligence, conversational training, and AI fitness coaching — produced by TrainChat's founder.",
  "url": "https://www.trainchat.ai/content",
  "numberOfItems": allVideos.length,
  "itemListElement": allVideos.map((v, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "item": {
      "@type": "VideoObject",
      "name": v.title,
      "description": v.description,
      "keywords": v.keywords.join(", "),
      "duration": v.duration,
      "author": {
        "@type": "Organization",
        "name": "TrainChat®",
        "url": "https://www.trainchat.ai"
      },
      "publisher": {
        "@type": "Organization",
        "name": "TrainChat®",
        "url": "https://www.trainchat.ai"
      }
    }
  }))
};

export default function ContentHubPage() {
  const [, navigate] = useLocation();

  const totalVideos = videoSeries.reduce((sum, s) => sum + s.videos.length, 0);

  return (
    <AeoLayout
      title="TrainChat® Content Hub — AI Training Education"
      description="Educational video content from TrainChat — adaptive programming, coaching intelligence, conversational training, and AI fitness coaching explained by a practicing strength and conditioning coach."
      schema={videoSchema}
      canonical="/content"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Content Hub</p>
          <h1 className="text-3xl font-bold tracking-tight">Educational Content</h1>
          <p className="text-muted-foreground leading-relaxed">
            {totalVideos} topics across {videoSeries.length} content series — covering adaptive programming, coaching intelligence, conversational training, and the exercise science behind TrainChat. Content produced by a practicing strength and conditioning coach.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">About This Content</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All content is produced by TrainChat's founder — a strength and conditioning coach with 10+ years of athlete coaching experience and an exercise science background. The goal is to explain adaptive AI training clearly and accurately, without the marketing layer that makes most fitness content useless.
          </p>
        </div>

        {videoSeries.map((series) => (
          <section key={series.series}>
            <div className="mb-4">
              <h2 className="text-xl font-bold tracking-tight">{series.series}</h2>
              <p className="text-sm text-muted-foreground mt-1">{series.description}</p>
            </div>
            <div className="space-y-3">
              {series.videos.map((video) => (
                <div key={video.title} className="border border-border rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted/50 border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-lg">▶</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground leading-snug">{video.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1">{video.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {video.keywords.slice(0, 3).map((kw) => (
                          <span key={kw} className="text-xs px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="border-t border-border pt-6">
          <h2 className="text-xl font-bold tracking-tight mb-4">Related Resources</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: "Concept Library", desc: "Deep-dive definitions of every core concept", path: "/concepts" },
              { title: "AI Fitness Glossary", desc: "20+ terms defined for practitioners", path: "/glossary" },
              { title: "Exercise Science Foundation", desc: "The research base behind TrainChat", path: "/research" },
              { title: "FAQ", desc: "Answers to the most common questions", path: "/faq" },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="text-left border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors group"
              >
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AeoLayout>
  );
}
