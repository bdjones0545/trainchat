import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "TrainChat® for Coaches — AI Coaching Intelligence for Strength & Conditioning Professionals",
  "description": "How strength and conditioning coaches can use TrainChat's AI coaching intelligence — for their own programming, understanding the technology, or supplementing their coaching practice.",
  "audience": {
    "@type": "Audience",
    "audienceType": "Strength and Conditioning Coaches, Personal Trainers, Sports Performance Professionals"
  },
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" }
};

const faqs: FaqItem[] = [
  {
    q: "Can coaches use TrainChat for their clients?",
    a: "TrainChat is currently designed as a direct athlete-facing tool — athletes use it to manage their own training system. Coaches can use it to understand what adaptive AI coaching looks like in practice, explore programming frameworks, or use it for their own personal training."
  },
  {
    q: "Is TrainChat's coaching philosophy compatible with professional S&C?",
    a: "Yes. TrainChat was built by a practicing strength and conditioning coach. Its coaching intelligence applies the same principles — progressive overload, periodization, specificity, CNS load management — that professional S&C practice is founded on."
  },
  {
    q: "What can coaches learn from TrainChat's approach?",
    a: "TrainChat's conversational programming interface, adaptive program mutation system, and real-time load management framework offer a useful model for how AI will increasingly support coaching practice. Understanding the technology helps coaches position themselves effectively as AI tools become more prevalent in the field."
  },
  {
    q: "Does TrainChat replace strength coaches?",
    a: "No. TrainChat delivers AI coaching intelligence for programming and adaptation. It doesn't replace the relationship-based elements of great coaching — motivation, technique assessment, real-world context, and the trust a coach builds with an athlete over time. The tools serve different functions."
  },
  {
    q: "Is the programming in TrainChat sound enough for professional athletes?",
    a: "TrainChat's programming is grounded in professional-grade exercise science — the same principles that govern elite S&C practice. The adaptive intelligence and conversational interface make it highly capable for serious athletes training independently. Elite professionals with access to dedicated coaching teams are a different use case."
  }
];

export default function ForCoachesPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="TrainChat® for Coaches — AI Coaching Intelligence"
      description="How strength and conditioning coaches relate to TrainChat — the exercise science foundation, the coaching intelligence model, and the AI training philosophy built by a practitioner."
      schema={schema}
      canonical="/for-coaches"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">For Coaches</p>
          <h1 className="text-3xl font-bold tracking-tight">TrainChat for Coaches</h1>
          <p className="text-muted-foreground leading-relaxed">
            TrainChat was built by a strength and conditioning coach. Its coaching intelligence encodes the same exercise science principles that professional coaching practice is built on. Here's how it relates to coaching work.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Built by a Practitioner</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            TrainChat's founder is a strength and conditioning coach with 10+ years of real-world athlete coaching experience and an exercise science background. The coaching intelligence layer reflects how an experienced S&C coach actually reasons about training — not how fitness content approximates it.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">The Coaching Intelligence Model</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            TrainChat's coaching intelligence applies the decision-making framework of professional strength coaching through AI. The system reasons about:
          </p>
          <div className="space-y-3">
            {[
              {
                title: "Programming architecture",
                desc: "Periodized block design — accumulation, intensification, realization — with appropriate volume and intensity progressions for the stated goal and timeline."
              },
              {
                title: "Load management",
                desc: "Monitoring acute and chronic training load, managing fatigue accumulation, and inserting recovery periods at appropriate times based on athlete feedback rather than fixed schedules."
              },
              {
                title: "Exercise science application",
                desc: "Progressive overload, specificity, CNS demand management, movement pattern balance, and individual variation accommodation — the foundational principles that professional S&C is built on."
              },
              {
                title: "Adaptive decision-making",
                desc: "When circumstances change — injury, schedule disruption, performance plateau, goal shift — the system makes coaching decisions informed by the full training context, not just the current session."
              },
              {
                title: "Context retention",
                desc: "Persistent memory of the athlete's full history enables coaching decisions that build on what came before — the same longitudinal awareness that distinguishes experienced coaches from template dispensers."
              }
            ].map((item) => (
              <div key={item.title} className="border-l-2 border-primary/30 pl-4">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Where AI Coaching Excels vs Where Human Coaching Excels</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-foreground w-1/3">Dimension</th>
                  <th className="text-left py-2 pr-4 font-semibold text-primary w-1/3">AI Coaching (TrainChat)</th>
                  <th className="text-left py-2 font-semibold text-muted-foreground w-1/3">Human Coaching</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["Availability", "24/7, instant response", "Scheduled sessions"],
                  ["Programming consistency", "Perfectly consistent", "Variable by workload"],
                  ["Load history tracking", "Complete, automated", "Depends on logging quality"],
                  ["Real-time adaptation", "Immediate conversational execution", "Requires coach availability"],
                  ["Technique assessment", "Not available", "Core coaching capability"],
                  ["Motivational relationship", "Limited", "Core human coaching element"],
                  ["Real-world nuance reading", "Text-based only", "In-person observation"],
                  ["Cost accessibility", "Fraction of coaching retainer", "High, limits access"],
                  ["Research application", "Encoded, consistent", "Varies by coach education"],
                  ["Long-term memory", "Infinite, searchable", "Human memory limitations"],
                ].map(([dim, ai, human]) => (
                  <tr key={dim}>
                    <td className="py-2.5 pr-4 text-muted-foreground">{dim}</td>
                    <td className="py-2.5 pr-4 text-foreground font-medium">{ai}</td>
                    <td className="py-2.5 text-muted-foreground">{human}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Access Problem TrainChat Solves</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Quality strength and conditioning coaching is expensive and geographically limited. Athletes outside elite sport environments typically have two options: generic apps or expensive coaching relationships. Neither delivers adaptive, periodized programming at an accessible price point.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat was built to solve this. The coaching intelligence it delivers — adaptive programming, load management, conversational adjustment — was previously exclusive to athletes with access to professional coaches. TrainChat makes it broadly accessible.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            This is a democratization problem that exercise science professionals should care about. Better programming access produces better health outcomes at scale.
          </p>
          <button onClick={() => navigate("/about")} className="text-sm font-semibold text-primary hover:underline">
            Read about TrainChat's origin →
          </button>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Exercise Science Foundation</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            TrainChat's coaching intelligence is built on the same research base that professional S&C education covers — progressive overload, periodization theory, motor learning, CNS adaptation, training load management, and recovery science. The research foundation page documents how each domain is applied.
          </p>
          <button onClick={() => navigate("/research")} className="text-sm font-semibold text-primary hover:underline">
            Read the exercise science foundation →
          </button>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
