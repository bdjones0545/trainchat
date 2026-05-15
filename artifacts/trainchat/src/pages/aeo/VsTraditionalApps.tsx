import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "TrainChat vs Traditional Workout Apps",
  "description": "Traditional workout apps deliver static plans and log your sets. TrainChat builds and maintains a living, adaptive training system through conversational coaching. Here's why the difference matters.",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" }
};

const faqs: FaqItem[] = [
  {
    q: "What makes TrainChat different from traditional workout apps?",
    a: "Traditional workout apps give you a static plan and a place to log workouts. TrainChat builds a living training system that adapts in real time through conversational coaching — with persistent memory, exercise science-driven programming, and immediate mutation when your needs change."
  },
  {
    q: "Do traditional workout apps use AI?",
    a: "Some traditional apps market AI features, but most use basic algorithms for exercise rotation or simple plan templates. Genuine AI coaching — with persistent memory, conversational input, real-time adaptation, and coaching intelligence — is fundamentally different from these implementations."
  },
  {
    q: "Why do most people stop using traditional workout apps?",
    a: "Static plans don't respond to reality. When you miss sessions, get injured, change goals, or simply need something different — a static plan has no answer. The friction of manual editing, or the mismatch between the plan and your actual situation, causes most people to stop engaging."
  },
  {
    q: "Is TrainChat harder to use than traditional workout apps?",
    a: "No. TrainChat is simpler — you describe what you want in plain language, and the system builds and adapts your program. You don't need to understand exercise programming, select from libraries, or manually configure plans. The conversational interface reduces friction significantly."
  }
];

const traditional = [
  { prob: "Fixed plan delivery", impact: "Becomes inappropriate as your situation changes" },
  { prob: "Manual logging required", impact: "High friction leads to low compliance" },
  { prob: "No memory", impact: "Every session is isolated, no coaching context builds" },
  { prob: "Library-based selection", impact: "Choice paralysis and inconsistent programming" },
  { prob: "No conversational input", impact: "Can't communicate nuance — soreness, energy, intent" },
  { prob: "Scheduled reviews only", impact: "Lag between need and adaptation" },
];

export default function VsTraditionalApps() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="TrainChat vs Traditional Workout Apps"
      description="Traditional workout apps deliver static plans. TrainChat builds a living, adaptive training system through conversational coaching. Here's why the architecture difference produces fundamentally better training outcomes."
      schema={schema}
      canonical="/vs-traditional-apps"
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Comparison</p>
          <h1 className="text-3xl font-bold tracking-tight">TrainChat vs Traditional Workout Apps</h1>
          <p className="text-muted-foreground leading-relaxed">
            Why the architecture of a training tool determines its long-term effectiveness — and what changes when you move from a static plan to a living training system.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Core Distinction</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Traditional workout apps deliver content — plans, exercises, logging interfaces. TrainChat delivers coaching — an adaptive, conversational system that builds and evolves your program based on your actual situation. One is a document. The other is a relationship.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Structural Problems with Traditional Workout Apps</h2>
          <div className="space-y-3">
            {traditional.map((item) => (
              <div key={item.prob} className="flex gap-4">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive/70 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.prob}</p>
                  <p className="text-sm text-muted-foreground">{item.impact}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">How TrainChat Solves Each Problem</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-foreground w-1/2">Traditional App Problem</th>
                  <th className="text-left py-2 font-semibold text-primary w-1/2">TrainChat Solution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["Fixed plan becomes outdated", "Living system adapts continuously through conversation"],
                  ["Manual logging friction", "Natural language feedback — describe, don't log"],
                  ["No session-to-session memory", "Full training history retained and used for every decision"],
                  ["Inconsistent exercise selection", "Goal-driven programming with principled exercise architecture"],
                  ["Can't communicate nuance", "Conversational input handles any feedback in plain language"],
                  ["Delayed adaptation cycle", "Real-time mutation — changes execute immediately"],
                ].map(([prob, sol]) => (
                  <tr key={prob}>
                    <td className="py-2.5 pr-4 text-muted-foreground">{prob}</td>
                    <td className="py-2.5 text-foreground font-medium">{sol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Why This Produces Better Outcomes</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Training outcome quality is directly related to how well a program stays aligned with your actual capacity and goals over time. A static plan starts aligned and drifts further off with every week that passes without adjustment.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            A living training system stays aligned — because it adapts when you communicate, remembers what's working, and applies coaching intelligence to every decision. That alignment is what drives consistent progress instead of stagnation, plateaus, and program abandonment.
          </p>
          <button onClick={() => navigate("/chat")} className="text-sm font-semibold text-primary hover:underline">
            Try TrainChat — free →
          </button>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
