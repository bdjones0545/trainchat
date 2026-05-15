import { useLocation } from "wouter";
import {
  ArrowRight,
  Zap,
  RefreshCw,
  Target,
  Brain,
  Shield,
  ChevronDown,
  Dumbbell,
  Clock,
  BarChart3,
} from "lucide-react";

const LIVE_EDIT_EXAMPLES = [
  {
    prompt: "Swap bench press for incline dumbbell press",
    result: "Exercise updated across all sessions — loads and progressions adjusted",
    tag: "Exercise Swap",
  },
  {
    prompt: "Add more speed work on day 2",
    result: "Speed block inserted with warm-up protocol and effort targets",
    tag: "Session Edit",
  },
  {
    prompt: "Only 20 minutes and dumbbells today",
    result: "Session rebuilt around constraints — full structure preserved",
    tag: "Constraint Fit",
  },
  {
    prompt: "Make this beginner friendly",
    result: "Complexity and load scaled down — progression arc recalibrated",
    tag: "Level Adjust",
  },
];

const DIFFERENTIATORS = [
  {
    icon: <Zap className="w-4 h-4 text-primary" />,
    title: "A real editable system",
    body: "Every response changes an actual training structure — not a PDF, not a template. Your program has sessions, progressions, and logic baked in.",
  },
  {
    icon: <RefreshCw className="w-4 h-4 text-primary" />,
    title: "Live updates, every edit",
    body: "Tell the coach to change something. Watch it update in the right panel instantly. No regenerating, no copy-pasting — the system just changes.",
  },
  {
    icon: <BarChart3 className="w-4 h-4 text-primary" />,
    title: "Continuity over time",
    body: "Your program evolves with you. Save it, come back, adjust it. The system remembers what you built and adapts as your goals shift.",
  },
  {
    icon: <Brain className="w-4 h-4 text-primary" />,
    title: "Built around your constraints",
    body: "Equipment limits, time windows, injuries, schedule gaps — tell the coach and it rebuilds around them. No manual workaround required.",
  },
];

const TRUST_POINTS = [
  {
    icon: <Shield className="w-4 h-4 text-primary/70" />,
    title: "Evidence-based structure",
    body: "Programs are built on established periodization principles — progressive overload, appropriate volume management, and recovery integration.",
  },
  {
    icon: <Target className="w-4 h-4 text-primary/70" />,
    title: "Goal-specific architecture",
    body: "Whether you're training for hypertrophy, strength, power, or athleticism, the program structure reflects the actual demands of your goal.",
  },
  {
    icon: <Clock className="w-4 h-4 text-primary/70" />,
    title: "Adapts as you go",
    body: "Real training doesn't stay the same. Injury, travel, schedule changes — your system adjusts in real time rather than falling apart.",
  },
];

interface AnonymousConversionFloorProps {
  onCreateAccount: () => void;
}

export default function AnonymousConversionFloor({ onCreateAccount }: AnonymousConversionFloorProps) {
  const [, setLocation] = useLocation();

  function handleCTA() {
    setLocation("/register?from=conversion-floor");
    onCreateAccount();
  }

  return (
    <div className="bg-background border-t border-border/60">
      {/* Scroll hint */}
      <div className="flex flex-col items-center justify-center py-5 border-b border-border/40 gap-1.5">
        <ChevronDown className="w-4 h-4 text-muted-foreground/40 animate-bounce" style={{ animationDuration: "2s" }} />
        <p className="text-[11px] text-muted-foreground/40 tracking-wide uppercase font-medium">
          About your system
        </p>
      </div>

      {/* Section 2 — What You're Building */}
      <section className="px-6 py-14 md:py-20 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary/70">
            What you're building
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-4">
          Build your training system live — with an AI performance architect
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          This isn't a fitness chatbot. It's a live coaching system where you describe your goal, equipment, schedule, and constraints — and the program updates in real time. Every message you send changes an actual training structure.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Real editable sessions", sub: "not a generic template" },
            { label: "Live program updates", sub: "right panel changes instantly" },
            { label: "Saves your history", sub: "create an account to keep it" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <p className="text-sm font-semibold text-foreground mb-0.5">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-border/50 max-w-3xl mx-auto" />

      {/* Section 3 — How Live Edits Work */}
      <section className="px-6 py-14 md:py-20 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary/70">
            How live edits work
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-2">
          Say it. The system changes.
        </h2>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          Every edit you send is a live instruction. Your program updates immediately — no regenerating from scratch, no losing context.
        </p>
        <div className="space-y-3">
          {LIVE_EDIT_EXAMPLES.map((ex) => (
            <div
              key={ex.prompt}
              className="rounded-xl border border-border bg-card px-4 py-4 flex flex-col sm:flex-row sm:items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
                    {ex.tag}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground mb-1.5">
                  "{ex.prompt}"
                </p>
                <div className="flex items-start gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 mt-1" />
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    {ex.result}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/50 text-center mt-5">
          These edits happen on a real training structure — not a text document
        </p>
      </section>

      {/* Divider */}
      <div className="h-px bg-border/50 max-w-3xl mx-auto" />

      {/* Section 4 — Why It Feels Different */}
      <section className="px-6 py-14 md:py-20 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary/70">
            Why it feels different
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-2">
          Not an AI chat. A live coaching system.
        </h2>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          Generic AI fitness tools generate text. TrainChat® builds and maintains a real program structure — with sessions, progressions, and logic — that you can adjust in real time.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DIFFERENTIATORS.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border bg-card px-5 py-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-border/50 max-w-3xl mx-auto" />

      {/* Section 5 — Trust / Authority */}
      <section className="px-6 py-14 md:py-20 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-primary/70">
            How it's built
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-2">
          Designed for performance. Built on principles.
        </h2>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          TrainChat® applies real coaching philosophy — not generic fitness content. Every program it builds reflects how actual performance coaches think about training load, adaptation, and continuity.
        </p>
        <div className="space-y-3 mb-8">
          {TRUST_POINTS.map((pt) => (
            <div
              key={pt.title}
              className="flex items-start gap-3 rounded-xl border border-border bg-card px-5 py-4"
            >
              <div className="w-7 h-7 rounded-lg bg-muted/40 border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                {pt.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">{pt.title}</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{pt.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Coaching philosophy note */}
        <div className="rounded-xl border border-primary/15 bg-primary/5 px-5 py-4">
          <div className="flex items-start gap-3">
            <Dumbbell className="w-4 h-4 text-primary/60 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-muted-foreground/80 leading-relaxed">
              <span className="font-semibold text-foreground">Built for real athletes.</span>{" "}
              Whether you're training for strength, hypertrophy, speed, or general fitness — your program is structured around how adaptation actually works, not what looks good on paper.
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-border/50 max-w-3xl mx-auto" />

      {/* Section 6 — Save Your System (Primary CTA) */}
      <section className="px-6 py-14 md:py-20 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-green-400/70">
            Save your system
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-3">
          You're already building something real. Keep it.
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed mb-8">
          Create a free account to save your program, preserve your system, and continue evolving your training. Everything you've built stays exactly where you left it.
        </p>

        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-4">
            Free account includes
          </p>
          <div className="space-y-3 mb-6">
            {[
              "Your full training system — saved and preserved",
              "Unlimited program edits and refinements",
              "Session history and continuity across devices",
              "Live updates every time you chat with the coach",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-green-400/15 border border-green-400/30 flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                </div>
                <p className="text-sm text-foreground">{item}</p>
              </div>
            ))}
          </div>
          <button
            onClick={handleCTA}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-primary/20"
          >
            Create Free Account
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-[11px] text-muted-foreground/40 text-center mt-3">
            No credit card required · Keep everything you've built
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleCTA}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-card border border-border text-foreground font-medium text-sm rounded-xl hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all duration-150"
          >
            Save My System
          </button>
          <button
            onClick={handleCTA}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-card border border-border text-foreground font-medium text-sm rounded-xl hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all duration-150"
          >
            Keep Building
          </button>
        </div>
      </section>

      {/* Footer bar */}
      <div className="border-t border-border/40 px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 max-w-3xl mx-auto">
        <p className="text-[11px] text-muted-foreground/40">
          TrainChat® · Your training system, always evolving
        </p>
        <button
          onClick={handleCTA}
          className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          Create free account →
        </button>
      </div>
    </div>
  );
}
