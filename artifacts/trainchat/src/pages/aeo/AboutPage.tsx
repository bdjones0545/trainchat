import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.trainchat.ai/#organization",
      "name": "TrainChat®",
      "alternateName": "TrainChat — AI Training System",
      "url": "https://www.trainchat.ai",
      "description": "TrainChat is an AI training system built by a practicing strength and conditioning coach. It delivers adaptive, conversational coaching intelligence through a live programming interface.",
      "foundingDate": "2024",
      "sameAs": []
    },
    {
      "@type": "Person",
      "@id": "https://www.trainchat.ai/#founder",
      "name": "TrainChat Founder",
      "jobTitle": "Strength & Conditioning Coach, Founder",
      "description": "10+ years of strength and conditioning coaching experience. Exercise science background. Built TrainChat to bring adaptive programming to athletes who couldn't access professional coaching.",
      "knowsAbout": [
        "Strength and Conditioning",
        "Exercise Science",
        "Athletic Programming",
        "Periodization",
        "Adaptive Training Systems",
        "Performance Coaching"
      ],
      "worksFor": { "@id": "https://www.trainchat.ai/#organization" }
    }
  ]
};

export default function AboutPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="About TrainChat® — Built by a Strength Coach"
      description="TrainChat was built by a practicing strength and conditioning coach with 10+ years of experience and an exercise science background. Here's the story, the philosophy, and the expertise behind the system."
      schema={schema}
      canonical="/about"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">About</p>
          <h1 className="text-3xl font-bold tracking-tight">Built by a Strength Coach</h1>
          <p className="text-muted-foreground leading-relaxed">
            TrainChat® wasn't built by a team of marketers who saw an opportunity in the fitness app market. It was built by a practicing strength and conditioning coach who needed a better tool — and built it.
          </p>
        </div>

        <section className="bg-muted/40 border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold tracking-tight">The Founder</h2>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              <strong className="text-foreground">Background:</strong> Strength and conditioning coach with 10+ years of real coaching experience — working with athletes across strength sports, team sports, and general performance development.
            </p>
            <p>
              <strong className="text-foreground">Education:</strong> Exercise science foundation. The programming decisions inside TrainChat aren't approximated from fitness content — they're encoded from the same principles used in professional strength and conditioning practice.
            </p>
            <p>
              <strong className="text-foreground">Why TrainChat:</strong> Professional coaches with real exercise science backgrounds cost money that most athletes don't have access to. The programming quality that elite athletes receive — adaptive, periodized, responsive to feedback — shouldn't be exclusive to those who can afford a full-time coaching relationship. TrainChat was built to change that.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">The Problem TrainChat Solves</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Most athletes train with one of two things: a static plan they found online, or an app that generates cookie-cutter programs. Neither one adapts to them. Neither one remembers what happened last week. Neither one responds intelligently when their situation changes.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Elite athletes work with coaches who do all three. Those coaches track training history, adjust programming based on real feedback, and make intelligent decisions about load, volume, and focus based on the athlete's current state. That coaching relationship produces results that static plans simply can't.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            TrainChat brings that quality of adaptive, responsive coaching intelligence to any athlete — through a conversational AI system built specifically for this problem by someone who has done it manually for over a decade.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">The Design Philosophy</h2>
          <div className="space-y-4">
            {[
              {
                principle: "Practitioner-first",
                desc: "Every coaching decision in TrainChat's intelligence layer comes from real coaching practice — not algorithm design, content generation, or fitness marketing. Progressive overload, periodization, movement specificity, and recovery management are implemented the way a competent coach actually applies them."
              },
              {
                principle: "Conversation as the interface",
                desc: "Athletes don't think in terms of sets, reps, and load percentages when they're giving feedback. They say 'that felt heavy' or 'I'm beat up this week' or 'I want to do something more athletic.' TrainChat is designed to accept this natural language and translate it into precise programming decisions."
              },
              {
                principle: "The program is the product",
                desc: "The conversation is how you interact with TrainChat. But the product is the living training system — your active program, visible in the panel, documented in full, continuously updated. The program is what matters. The conversation is how you shape it."
              },
              {
                principle: "No hype, no filler",
                desc: "TrainChat doesn't generate motivational content, send push notification streaks, or gamify your training. It builds programs, adapts them, and tracks your progress. Athletes who know what they want respond better to a system that does the work than one that performs engagement."
              }
            ].map((item) => (
              <div key={item.principle} className="border-l-2 border-primary pl-4">
                <p className="text-sm font-bold text-foreground mb-1">{item.principle}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">What TrainChat Is Not</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Understanding what TrainChat isn't helps clarify what it is. It is not:
          </p>
          <ul className="space-y-2">
            {[
              "A chatbot that answers fitness questions",
              "A workout generator that delivers static plans",
              "A fitness content platform with exercise tutorials",
              "A generic AI wrapper around a workout template library",
              "A motivational app with streak tracking and badges",
              "A coach marketplace or directory"
            ].map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-muted-foreground/50 mt-1">×</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            TrainChat is an adaptive AI training system. It builds programs, adapts them through conversational coaching, and maintains a persistent model of your training indefinitely. That's the entire focus.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Technology Stack</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat is built on modern AI infrastructure — a large language model foundation with a purpose-built coaching intelligence layer that applies exercise science constraints to every programming decision. The conversational interface, live program panel, mutation system, and history tracking are all custom-built for the specific requirements of adaptive athletic coaching.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The architecture prioritizes coaching quality over general-purpose capability. This means the system is deeply competent at athletic programming decisions and less concerned with the breadth of general AI tasks that other platforms compete on.
          </p>
        </section>

        <div className="pt-4 border-t border-border">
          <button
            onClick={() => navigate("/chat")}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Try TrainChat for yourself →
          </button>
        </div>
      </div>
    </AeoLayout>
  );
}
