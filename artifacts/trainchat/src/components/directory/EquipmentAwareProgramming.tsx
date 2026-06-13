import { useState } from "react";
import { EQUIPMENT_SCENARIOS } from "@/data/directory/exercise-product-links";

// ─── Scenario Card ─────────────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  active,
  onClick,
}: {
  scenario: (typeof EQUIPMENT_SCENARIOS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-xl px-4 py-3 transition-all"
      style={{
        background: active
          ? "rgba(14,165,233,0.12)"
          : "rgba(255,255,255,0.03)",
        border: active
          ? "1px solid rgba(14,165,233,0.35)"
          : "1px solid rgba(255,255,255,0.07)",
        color: active ? "hsl(199 89% 65%)" : "rgba(255,255,255,0.55)",
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5">
        {scenario.sport}
      </p>
      <p className="text-[13px] font-bold" style={{ color: active ? "hsl(199 89% 72%)" : "rgba(255,255,255,0.80)" }}>
        {scenario.goal}
      </p>
    </button>
  );
}

// ─── Chain Step ────────────────────────────────────────────────────────────────

function ChainStep({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | string[];
  accent?: boolean;
  icon: string;
}) {
  const values = Array.isArray(value) ? value : [value];
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
        style={{
          background: accent
            ? "rgba(14,165,233,0.15)"
            : "rgba(255,255,255,0.06)",
          border: accent
            ? "1px solid rgba(14,165,233,0.30)"
            : "1px solid rgba(255,255,255,0.10)",
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.30)" }}>
          {label}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: accent
                  ? "rgba(14,165,233,0.10)"
                  : "rgba(255,255,255,0.06)",
                color: accent ? "hsl(199 89% 68%)" : "rgba(255,255,255,0.75)",
              }}
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Equipment Toggle ─────────────────────────────────────────────────────────

function EquipmentToggle({
  hasEquipment,
  onChange,
}: {
  hasEquipment: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
    >
      <button
        onClick={() => onChange(true)}
        className="px-3.5 py-1.5 rounded-md text-[11px] font-semibold transition-all"
        style={{
          background: hasEquipment ? "rgba(14,165,233,0.20)" : "transparent",
          color: hasEquipment ? "hsl(199 89% 65%)" : "rgba(255,255,255,0.40)",
          border: hasEquipment ? "1px solid rgba(14,165,233,0.30)" : "1px solid transparent",
        }}
      >
        ✅ Have Equipment
      </button>
      <button
        onClick={() => onChange(false)}
        className="px-3.5 py-1.5 rounded-md text-[11px] font-semibold transition-all"
        style={{
          background: !hasEquipment ? "rgba(251,146,60,0.15)" : "transparent",
          color: !hasEquipment ? "rgb(251,146,60)" : "rgba(255,255,255,0.40)",
          border: !hasEquipment ? "1px solid rgba(251,146,60,0.25)" : "1px solid transparent",
        }}
      >
        ❌ No Equipment
      </button>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function EquipmentAwareProgramming() {
  const [activeScenario, setActiveScenario] = useState(0);
  const [hasEquipment, setHasEquipment] = useState(true);

  const scenario = EQUIPMENT_SCENARIOS[activeScenario];

  const currentExercises = hasEquipment
    ? scenario.withEquipment.exercises
    : scenario.withoutEquipment.alternatives;

  const currentMethod = hasEquipment
    ? scenario.withEquipment.method
    : scenario.withoutEquipment.method;

  const currentProduct = hasEquipment
    ? scenario.withEquipment.product
    : "No Equipment";

  const adaptation = scenario.withoutEquipment.adaptationPreserved;

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
            Phase 3 Intelligence
          </div>
          <h2
            className="text-3xl sm:text-4xl font-black tracking-tight mb-4"
            style={{ color: "rgba(255,255,255,0.92)" }}
          >
            Equipment-Aware Programming
          </h2>
          <p
            className="text-sm sm:text-base leading-relaxed max-w-xl mx-auto"
            style={{ color: "rgba(255,255,255,0.48)" }}
          >
            TrainChat adapts every program to the tools you actually have.
            Same goal. Same method. Different equipment — different exercises.
          </p>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">

          {/* Scenario selector */}
          <div className="space-y-2">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-3 px-1"
              style={{ color: "rgba(255,255,255,0.28)" }}
            >
              Select a Goal
            </p>
            {EQUIPMENT_SCENARIOS.map((s, i) => (
              <ScenarioCard
                key={i}
                scenario={s}
                active={activeScenario === i}
                onClick={() => setActiveScenario(i)}
              />
            ))}
          </div>

          {/* Intelligence panel */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Panel header */}
            <div
              className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.30)" }}>
                  Goal
                </p>
                <p className="text-base font-bold" style={{ color: "rgba(255,255,255,0.88)" }}>
                  {scenario.goal}
                </p>
              </div>
              <EquipmentToggle hasEquipment={hasEquipment} onChange={setHasEquipment} />
            </div>

            {/* Chain */}
            <div className="px-5 py-5 space-y-4">

              {/* Preserved quality */}
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{
                  background: "rgba(74,222,128,0.06)",
                  border: "1px solid rgba(74,222,128,0.15)",
                }}
              >
                <span className="text-lg">🎯</span>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(74,222,128,0.60)" }}>
                    Quality Always Preserved
                  </p>
                  <p className="text-[12px] font-semibold" style={{ color: "rgb(74,222,128)" }}>
                    {adaptation}
                  </p>
                </div>
              </div>

              {/* Knowledge chain */}
              <div className="space-y-3 pt-1">
                <ChainStep
                  label="Training Method"
                  value={currentMethod}
                  icon="📐"
                  accent
                />

                <div className="pl-5" style={{ borderLeft: "1px dashed rgba(255,255,255,0.10)" }}>
                  <div className="ml-[-1px] pl-4 space-y-3">
                    <ChainStep
                      label={hasEquipment ? "Required Equipment" : "No Equipment Needed"}
                      value={currentProduct}
                      icon={hasEquipment ? "🛠️" : "🚫"}
                      accent={hasEquipment}
                    />

                    <ChainStep
                      label={hasEquipment ? "Prescribed Exercises" : "Substitute Exercises"}
                      value={currentExercises}
                      icon="⚡"
                      accent={hasEquipment}
                    />
                  </div>
                </div>
              </div>

              {/* Insight note */}
              <div
                className="rounded-xl px-4 py-3 mt-2"
                style={{
                  background: hasEquipment
                    ? "rgba(14,165,233,0.06)"
                    : "rgba(251,146,60,0.06)",
                  border: hasEquipment
                    ? "1px solid rgba(14,165,233,0.15)"
                    : "1px solid rgba(251,146,60,0.15)",
                }}
              >
                <p
                  className="text-[11px] leading-relaxed"
                  style={{
                    color: hasEquipment
                      ? "rgba(14,165,233,0.85)"
                      : "rgba(251,146,60,0.85)",
                  }}
                >
                  {hasEquipment
                    ? `TrainChat selects exercises using ${scenario.withEquipment.product} when it's confirmed available in your training profile.`
                    : `No ${scenario.withEquipment.product}? TrainChat substitutes exercises that preserve the same ${adaptation.toLowerCase()} adaptation.`}
                </p>
              </div>

              {/* CTA */}
              <a
                href="/"
                className="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold w-full transition-all"
                style={{
                  background: "rgba(14,165,233,0.12)",
                  color: "hsl(199 89% 65%)",
                  border: "1px solid rgba(14,165,233,0.25)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(14,165,233,0.20)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(14,165,233,0.12)";
                }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Tell TrainChat what equipment you have
              </a>
            </div>
          </div>
        </div>

        {/* Bottom stat row */}
        <div
          className="mt-8 grid grid-cols-3 gap-4 rounded-2xl px-6 py-5"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {[
            { value: "60+", label: "Exercise–Product Links" },
            { value: "6",   label: "Equipment Scenarios" },
            { value: "100%", label: "Adaptation Preserved" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p
                className="text-2xl font-black mb-1"
                style={{ color: "hsl(199 89% 55%)" }}
              >
                {stat.value}
              </p>
              <p className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
