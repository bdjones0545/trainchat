import { useState } from "react";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface IntelligenceChain {
  id: string;
  label: string;
  sport: string;
  icon: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  steps: Array<{
    label: string;
    value: string;
    detail: string;
    isHighlight?: boolean;
  }>;
}

const CHAINS: IntelligenceChain[] = [
  {
    id: "acceleration",
    label: "Acceleration Deficit",
    sport: "Football / Soccer",
    icon: "⚡",
    accentColor: "rgb(251,191,36)",
    accentBg: "rgba(251,191,36,0.10)",
    accentBorder: "rgba(251,191,36,0.25)",
    steps: [
      {
        label: "Assessment",
        value: "10-Yard Sprint — 1.78s",
        detail: "Result falls in the 'below average' normative band. NFL combine average is 1.55s.",
        isHighlight: true,
      },
      {
        label: "Limiting Factor",
        value: "Horizontal Force Production Deficit",
        detail: "Slow 10-yard time directly indicates an inability to apply force horizontally during the critical first 3 strides.",
      },
      {
        label: "Priority Quality",
        value: "Acceleration (Score: 95)",
        detail: "Ranked #1 priority quality given the assessed deficit and sport demands of football.",
      },
      {
        label: "Training Method",
        value: "Resisted Sprint Training (Confidence: 92%)",
        detail: "External resistance overloads horizontal force application — the primary driver of sprint acceleration.",
      },
      {
        label: "Exercise Selection",
        value: "Heavy Resisted Sprint 20m",
        detail: "3×4 × 20m @ 10–15% body weight sled load. Selected because it directly loads the limiting factor.",
        isHighlight: true,
      },
      {
        label: "Expected Adaptation",
        value: "Faster 10-yard time, improved horizontal impulse",
        detail: "Within 6–10 weeks of consistent resisted sprint work, athletes typically improve 10-yard times by 0.05–0.12s.",
      },
    ],
  },
  {
    id: "reactive",
    label: "Reactive Strength Gap",
    sport: "Basketball / Track",
    icon: "💥",
    accentColor: "rgb(248,113,113)",
    accentBg: "rgba(248,113,113,0.10)",
    accentBorder: "rgba(248,113,113,0.25)",
    steps: [
      {
        label: "Assessment",
        value: "Reactive Strength Index — 1.45",
        detail: "RSI below 1.50 indicates poor elastic energy utilization. Elite sprinters often exceed 3.0.",
        isHighlight: true,
      },
      {
        label: "Limiting Factor",
        value: "Tendon Stiffness Deficit",
        detail: "Low RSI reveals insufficient Achilles-plantar complex stiffness, reducing elastic energy storage and return.",
      },
      {
        label: "Priority Quality",
        value: "Reactive Strength (Score: 92)",
        detail: "The single most trainable quality for improving jump performance and sprint ground contact mechanics.",
      },
      {
        label: "Training Method",
        value: "Elastic Reactive Training (Confidence: 92%)",
        detail: "High-speed, short-contact plyometrics under strict ground contact time targets build tendon stiffness.",
      },
      {
        label: "Exercise Selection",
        value: "Pogo Jump + Depth Jump Complex",
        detail: "Pogo: 3×10, contact < 200ms. Depth Jump: 4×5 from 40cm, min contact. Specifically targets RSI improvement.",
        isHighlight: true,
      },
      {
        label: "Expected Adaptation",
        value: "Higher RSI, shorter ground contact, greater jump height",
        detail: "8–12 weeks of elastic reactive training typically improves RSI by 0.3–0.6 points in athletic populations.",
      },
    ],
  },
  {
    id: "strength",
    label: "Maximal Strength Base",
    sport: "Rugby / Powerlifting",
    icon: "🏋️",
    accentColor: "rgb(167,139,250)",
    accentBg: "rgba(167,139,250,0.10)",
    accentBorder: "rgba(167,139,250,0.25)",
    steps: [
      {
        label: "Assessment",
        value: "Isometric Mid-Thigh Pull — 2,850N",
        detail: "Below the 3,500N 'good' threshold. Elite athletes in contact sports typically produce 4,000–5,000N.",
        isHighlight: true,
      },
      {
        label: "Limiting Factor",
        value: "Neural Drive Deficit",
        detail: "Below-normative IMTP force indicates the nervous system is not recruiting sufficient motor units under maximal effort.",
      },
      {
        label: "Priority Quality",
        value: "Maximal Strength (Score: 95)",
        detail: "Strength base is the foundational quality for rugby — it directly scales into contact dominance and power.",
      },
      {
        label: "Training Method",
        value: "Maximal Effort Method (Confidence: 95%)",
        detail: "Lifting at 90–100% 1RM is the most direct stimulus for increased motor unit recruitment and neural drive.",
      },
      {
        label: "Exercise Selection",
        value: "Trap Bar Deadlift 4×3 @ 88% 1RM",
        detail: "Selected for its lower technical error than barbell deadlift while producing equivalent force outputs for strength development.",
        isHighlight: true,
      },
      {
        label: "Expected Adaptation",
        value: "Greater 1RM, improved neural drive, sport-specific strength",
        detail: "4–8 weeks of maximal effort training produces significant neural adaptations. Structural gains follow at 8–16 weeks.",
      },
    ],
  },
  {
    id: "conditioning",
    label: "Aerobic Ceiling",
    sport: "Soccer / Rugby",
    icon: "🫀",
    accentColor: "hsl(199 89% 55%)",
    accentBg: "rgba(14,165,233,0.10)",
    accentBorder: "rgba(14,165,233,0.25)",
    steps: [
      {
        label: "Assessment",
        value: "Yo-Yo IRT Level 1 — 1,280m",
        detail: "Below the 1,800m threshold expected for elite soccer players. Recovery between sprint efforts is the bottleneck.",
        isHighlight: true,
      },
      {
        label: "Limiting Factor",
        value: "Aerobic Recovery Deficit",
        detail: "Insufficient aerobic power limits phosphocreatine restoration between sprint bouts, causing early performance decay.",
      },
      {
        label: "Priority Quality",
        value: "Repeated Sprint Ability (Score: 88)",
        detail: "The primary performance quality for field sports requiring sustained high-intensity play over 90 minutes.",
      },
      {
        label: "Training Method",
        value: "Repeated Sprint Ability Training (Confidence: 92%)",
        detail: "Structured repeated sprint protocols with controlled short rest periods directly train sport-specific RSA.",
      },
      {
        label: "Exercise Selection",
        value: "6×30m Repeated Sprint @ 30s rest",
        detail: "Sprint quality, velocity maintenance, and heart rate recovery are all tracked. Rest is standardized, not fully recovered.",
        isHighlight: true,
      },
      {
        label: "Expected Adaptation",
        value: "Maintained sprint quality across a full match",
        detail: "8–10 weeks of RSA training produces significant improvements in sprint decrement scores and Yo-Yo distance.",
      },
    ],
  },
  {
    id: "mobility",
    label: "Movement Quality Gap",
    sport: "All Sports",
    icon: "🔄",
    accentColor: "rgb(74,222,128)",
    accentBg: "rgba(74,222,128,0.10)",
    accentBorder: "rgba(74,222,128,0.25)",
    steps: [
      {
        label: "Assessment",
        value: "Ankle Dorsiflexion — 7cm (below norm)",
        detail: "Less than 10cm in the weight-bearing lunge test is associated with elevated knee and Achilles injury risk.",
        isHighlight: true,
      },
      {
        label: "Limiting Factor",
        value: "Force Transfer Limitation",
        detail: "Restricted ankle dorsiflexion forces compensatory mechanics at the knee and hip, reducing force expression efficiency.",
      },
      {
        label: "Priority Quality",
        value: "Ankle Mobility → Movement Quality (Score: 80)",
        detail: "Ankle range of motion is the most common physical quality limiting squat depth, sprint mechanics, and COD efficiency.",
      },
      {
        label: "Training Method",
        value: "Mobility Training + Isometric Strengthening",
        detail: "Joint mobilization combined with end-range isometric strengthening produces the most durable ROM improvements.",
      },
      {
        label: "Exercise Selection",
        value: "Banded Ankle Mobilization + Wall Lunge",
        detail: "Banded distraction mobilization: 3×30s each. Wall lunge progression: 3×8, adding 1cm of distance weekly.",
        isHighlight: true,
      },
      {
        label: "Expected Adaptation",
        value: "Greater dorsiflexion range, improved squat depth, reduced injury risk",
        detail: "6–8 weeks of targeted ankle mobilization consistently produces 2–4cm improvement in weight-bearing lunge distance.",
      },
    ],
  },
];

// ─── Step Node ────────────────────────────────────────────────────────────────

function StepNode({
  step,
  index,
  total,
  accentColor,
  accentBg,
  accentBorder,
  isActive,
  onHover,
}: {
  step: IntelligenceChain["steps"][number];
  index: number;
  total: number;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  isActive: boolean;
  onHover: (i: number | null) => void;
}) {
  return (
    <div
      className="flex items-start gap-3 group cursor-default"
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Connector column */}
      <div className="flex flex-col items-center flex-shrink-0 pt-0.5" style={{ width: "24px" }}>
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all"
          style={{
            background: step.isHighlight ? accentBg : isActive ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
            border: step.isHighlight ? `1px solid ${accentBorder}` : isActive ? "1px solid rgba(255,255,255,0.20)" : "1px solid rgba(255,255,255,0.08)",
            color: step.isHighlight ? accentColor : "rgba(255,255,255,0.45)",
          }}
        >
          {index + 1}
        </div>
        {index < total - 1 && (
          <div
            className="w-px flex-1 mt-1.5 transition-all"
            style={{
              height: "20px",
              background: step.isHighlight ? accentBorder : "rgba(255,255,255,0.08)",
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <p
          className="text-[9px] font-bold uppercase tracking-widest leading-none mb-1"
          style={{ color: step.isHighlight ? accentColor : "rgba(255,255,255,0.25)" }}
        >
          {step.label}
        </p>
        <p
          className="text-[13px] font-bold leading-snug mb-1"
          style={{ color: step.isHighlight ? accentColor : "rgba(255,255,255,0.85)" }}
        >
          {step.value}
        </p>
        <p
          className="text-[11px] leading-relaxed transition-all"
          style={{
            color: isActive ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.35)",
            maxHeight: isActive ? "80px" : "0px",
            overflow: "hidden",
          }}
        >
          {step.detail}
        </p>
      </div>
    </div>
  );
}

// ─── Chain Card ───────────────────────────────────────────────────────────────

function ChainCard({
  chain,
  active,
  onClick,
}: {
  chain: IntelligenceChain;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl px-4 py-3.5 transition-all"
      style={{
        background: active ? chain.accentBg : "rgba(255,255,255,0.03)",
        border: active ? `1px solid ${chain.accentBorder}` : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-lg leading-none">{chain.icon}</span>
        <span className="text-[13px] font-bold" style={{ color: active ? chain.accentColor : "rgba(255,255,255,0.82)" }}>
          {chain.label}
        </span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: active ? chain.accentColor + "99" : "rgba(255,255,255,0.28)" }}>
        {chain.sport}
      </p>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HowTrainChatThinks() {
  const [activeChain, setActiveChain] = useState(0);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  const chain = CHAINS[activeChain];

  return (
    <section className="px-4 sm:px-6 py-16 sm:py-20">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-widest uppercase mb-4"
            style={{
              background: "rgba(14,165,233,0.10)",
              color: "hsl(199 89% 55%)",
              border: "1px solid rgba(14,165,233,0.20)",
            }}
          >
            Phase 5 — Program Intelligence
          </div>
          <h2
            className="text-3xl sm:text-4xl font-black tracking-tight mb-4"
            style={{ color: "rgba(255,255,255,0.92)" }}
          >
            How TrainChat Thinks
          </h2>
          <p
            className="text-sm sm:text-base leading-relaxed max-w-xl mx-auto"
            style={{ color: "rgba(255,255,255,0.48)" }}
          >
            TrainChat doesn't just generate workouts. It reasons from assessment data to identify
            limiting factors, prioritize qualities, select evidence-based methods, and prescribe
            exercises with specific performance justifications.
          </p>

          {/* Compact chain summary */}
          <div className="flex items-center justify-center gap-1.5 mt-6 flex-wrap">
            {["Assessment", "Limiting Factor", "Priority Quality", "Method", "Exercise", "Adaptation"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-1.5">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                  style={{
                    background: i === 0 || i === arr.length - 1
                      ? "rgba(14,165,233,0.12)"
                      : "rgba(255,255,255,0.04)",
                    color: i === 0 || i === arr.length - 1
                      ? "hsl(199 89% 60%)"
                      : "rgba(255,255,255,0.45)",
                  }}
                >
                  {step}
                </span>
                {i < arr.length - 1 && (
                  <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.18)" }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Chain selector */}
          <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible no-scrollbar lg:w-52 flex-shrink-0">
            {CHAINS.map((c, i) => (
              <ChainCard
                key={c.id}
                chain={c}
                active={activeChain === i}
                onClick={() => setActiveChain(i)}
              />
            ))}
          </div>

          {/* Chain detail */}
          <div
            className="flex-1 rounded-2xl px-6 py-6"
            style={{
              background: "hsl(222 47% 8%)",
              border: `1px solid ${chain.accentBorder}`,
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: chain.accentBg, border: `1px solid ${chain.accentBorder}` }}
              >
                {chain.icon}
              </div>
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: chain.accentColor }}
                >
                  {chain.sport}
                </p>
                <p className="text-base font-black" style={{ color: "rgba(255,255,255,0.90)" }}>
                  {chain.label}
                </p>
              </div>
            </div>

            <p
              className="text-[11px] mb-5"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Hover any step to see the reasoning.
            </p>

            {/* Chain steps */}
            <div>
              {chain.steps.map((step, i) => (
                <StepNode
                  key={step.label}
                  step={step}
                  index={i}
                  total={chain.steps.length}
                  accentColor={chain.accentColor}
                  accentBg={chain.accentBg}
                  accentBorder={chain.accentBorder}
                  isActive={hoveredStep === i}
                  onHover={setHoveredStep}
                />
              ))}
            </div>

            {/* Footer CTA */}
            <div
              className="mt-4 rounded-xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>
                Every exercise in your TrainChat program has a reasoning chain like this one.
                Ask <span style={{ color: chain.accentColor }}>"Why was this exercise selected?"</span> and
                Atlas will explain the full chain from assessment to adaptation.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom explanation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10">
          {[
            {
              icon: "🧠",
              title: "Reasons from data",
              body: "Assessment scores → limiting factors → quality priorities. No generic programming.",
            },
            {
              icon: "🎯",
              title: "Method-first selection",
              body: "Every exercise is selected because of its method, not just because it looks like a good workout.",
            },
            {
              icon: "📈",
              title: "Adaptation-driven",
              body: "The system forecasts specific adaptations and tracks whether you're on target.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-xl px-4 py-4"
              style={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(220 20% 14%)" }}
            >
              <div className="text-xl mb-2">{card.icon}</div>
              <p className="text-[13px] font-bold mb-1.5" style={{ color: "rgba(255,255,255,0.88)" }}>
                {card.title}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.42)" }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
