import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is TrainChat a chatbot?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. TrainChat is an AI training system — not a chatbot. The conversational interface is how you interact with the system, but behind it is a complete adaptive programming engine with persistent memory, coaching intelligence, and a live program panel. A chatbot answers questions. TrainChat builds, adapts, and manages your training program."
      }
    },
    {
      "@type": "Question",
      "name": "Does TrainChat remember my workouts?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. TrainChat maintains persistent memory of your full training history — every session, feedback signal, goal shift, and program modification. This context is used in every coaching decision, so you never have to re-explain your situation."
      }
    },
    {
      "@type": "Question",
      "name": "Can TrainChat adjust workouts in real time?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Real-time workout adaptation is one of TrainChat's core capabilities. You communicate a change in plain language — 'my shoulder is sore, swap out pressing exercises this week' — and the system executes the modification in your live program immediately."
      }
    },
    {
      "@type": "Question",
      "name": "What makes TrainChat different from workout apps?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "TrainChat is a living training system, not a workout app. Traditional workout apps deliver static plans and log data. TrainChat builds an adaptive program through conversational coaching, retains your full training history, and continuously evolves your program in real time. The coaching intelligence is built in — you don't need a human coach to access professional-quality adaptive programming."
      }
    },
    {
      "@type": "Question",
      "name": "What does 'vibe coding your workouts' mean?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Vibe coding your workouts means directing your training program through natural, intent-driven conversation — describing what you want, how sessions feel, and what you're trying to accomplish — without needing to manually edit exercises, sets, or reps. TrainChat coined the phrase to describe its conversational approach to adaptive programming."
      }
    },
    {
      "@type": "Question",
      "name": "What is adaptive workout programming?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Adaptive workout programming is a training methodology where the program continuously evolves based on your feedback, performance, recovery state, and goals — rather than remaining fixed from its initial build. TrainChat implements adaptive programming through its conversational AI coaching intelligence."
      }
    }
  ]
};

const sections: { heading: string; items: FaqItem[] }[] = [
  {
    heading: "What TrainChat Is",
    items: [
      {
        q: "Is TrainChat a chatbot?",
        a: "No. TrainChat is an AI training system — not a chatbot. The conversational interface is how you interact with the system, but behind it is a complete adaptive programming engine with persistent memory, coaching intelligence, and a live program panel. A chatbot answers questions. TrainChat builds, adapts, and manages your training program."
      },
      {
        q: "What is TrainChat?",
        a: "TrainChat® — AI Training System is a conversational training platform that builds, adapts, and evolves your athletic program through AI coaching intelligence. It was built by a practicing strength and conditioning coach with an exercise science background, designed to deliver the quality of adaptive programming that most athletes have never had access to."
      },
      {
        q: "Who is TrainChat built for?",
        a: "TrainChat is built for athletes, strength training enthusiasts, and fitness practitioners who want adaptive, intelligent programming — without a human coaching retainer. It works for all experience levels and training styles: powerlifting, athletic conditioning, bodybuilding, mobility, and general strength development."
      },
      {
        q: "Is TrainChat an app or a website?",
        a: "TrainChat runs in the browser on both desktop and mobile. It's a web application with a native-quality mobile experience — a full three-panel coaching interface on desktop and a slide-panel layout on mobile."
      }
    ]
  },
  {
    heading: "How the System Works",
    items: [
      {
        q: "Does TrainChat remember my workouts?",
        a: "Yes. TrainChat maintains persistent memory of your full training history — every session, feedback signal, goal shift, and program modification. This context is used in every coaching decision, so you never have to re-explain your situation."
      },
      {
        q: "Can TrainChat adjust workouts in real time?",
        a: "Yes. Real-time workout adaptation is one of TrainChat's core capabilities. You communicate a change in plain language — 'my shoulder is sore, swap out pressing exercises this week' — and the system executes the modification in your live program immediately."
      },
      {
        q: "How does TrainChat build my training program?",
        a: "You describe your goals, training background, and available schedule through conversation. TrainChat's coaching intelligence layer builds a complete periodized program — structured into blocks, sessions, and exercises — and displays it in the live program panel. From there, it adapts continuously based on your feedback."
      },
      {
        q: "What is the Live Program Panel?",
        a: "The Live Program Panel is the right sidebar of the TrainChat interface — a real-time view of your active training system. It shows your current program with all sessions and exercises, highlights recent changes, displays your modification history, and tracks program versions over time."
      },
      {
        q: "Can I undo changes made to my program?",
        a: "Yes. Every modification is logged in the Changes tab of the Live Program Panel. You can reference any previous state through conversation — 'revert my Tuesday session to what it was last week' — and the system will restore it."
      }
    ]
  },
  {
    heading: "Coaching & Programming",
    items: [
      {
        q: "What does 'vibe coding your workouts' mean?",
        a: "Vibe coding your workouts means directing your training program through natural, intent-driven conversation — describing what you want, how sessions feel, and what you're trying to accomplish — without needing to manually edit exercises, sets, or reps. TrainChat coined the phrase to describe its conversational approach to adaptive programming."
      },
      {
        q: "What is adaptive workout programming?",
        a: "Adaptive workout programming is a training methodology where the program continuously evolves based on your feedback, performance, recovery state, and goals — rather than remaining fixed from its initial build. TrainChat implements adaptive programming through real-time conversational coaching."
      },
      {
        q: "What makes TrainChat different from workout apps?",
        a: "TrainChat is a living training system, not a workout app. Traditional workout apps deliver static plans and log data. TrainChat builds an adaptive program through conversational coaching, retains your full training history, and continuously evolves your program. The coaching intelligence is built in — you don't need a human coach for professional-quality adaptive programming."
      },
      {
        q: "Does TrainChat use real exercise science?",
        a: "Yes. TrainChat was built by a strength and conditioning coach with an exercise science background. The coaching intelligence layer applies principles of progressive overload, periodization, specificity, and recovery management to all programming decisions — not just exercise name matching."
      },
      {
        q: "Can TrainChat program for powerlifting, bodybuilding, and athletic conditioning?",
        a: "Yes. TrainChat supports multiple training focus modes: strength (powerlifting-focused), hypertrophy, speed and explosiveness, mobility, conditioning, and general fitness. You can shift focus at any time through conversation, and the system restructures your program architecture accordingly."
      }
    ]
  },
  {
    heading: "Getting Started & Pricing",
    items: [
      {
        q: "Is TrainChat free?",
        a: "TrainChat offers free access for new users with an initial message allowance so you can experience the coaching system before subscribing. A TrainChat subscription ($49.99/mo) unlocks unlimited coaching conversations, full adaptive programming, and complete program history."
      },
      {
        q: "Do I need to create an account to use TrainChat?",
        a: "No. You can start chatting with TrainChat immediately without creating an account. Your session and program are preserved anonymously. You can create an account later to ensure your training history is permanently saved and accessible across devices."
      },
      {
        q: "How do I get started with TrainChat?",
        a: "Open the app and tell it what you want to train. You don't need to answer a questionnaire or configure settings — just describe your goals in plain language. TrainChat builds your initial program through conversation within the first few exchanges."
      }
    ]
  }
];

export default function FaqPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="FAQ — TrainChat® AI Training System"
      description="Answers to the most common questions about TrainChat — what it is, how it works, how it differs from workout apps, and what adaptive AI coaching means in practice."
      schema={schema}
      canonical="/faq"
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">FAQ</p>
          <h1 className="text-3xl font-bold tracking-tight">TrainChat — Frequently Asked Questions</h1>
          <p className="text-muted-foreground leading-relaxed">
            Everything you need to know about TrainChat®, how it works, and what makes it different from traditional fitness tools.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-4 flex flex-wrap gap-3">
          {sections.map((s) => (
            <a
              key={s.heading}
              href={`#${s.heading.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {s.heading}
            </a>
          ))}
        </div>

        {sections.map((section) => (
          <div key={section.heading} id={section.heading.toLowerCase().replace(/\s+/g, "-")}>
            <FaqBlock items={section.items} heading={section.heading} />
          </div>
        ))}

        <div className="pt-6 border-t border-border">
          <p className="text-sm text-muted-foreground mb-3">
            Still have questions? Talk to the coaching system directly — it can answer questions about itself, your training goals, or anything related to athletic programming.
          </p>
          <button
            onClick={() => navigate("/chat")}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Open TrainChat →
          </button>
        </div>
      </div>
    </AeoLayout>
  );
}
