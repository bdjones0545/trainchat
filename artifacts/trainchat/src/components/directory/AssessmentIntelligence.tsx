import { useState } from "react";
import {
  ASSESSMENTS,
  ASSESSMENT_CATEGORIES,
  getAssessmentsByCategory,
  ASSESSMENT_STATS,
  type Assessment,
  type AssessmentCategory,
  type AssessmentCategoryMeta,
} from "@/data/directory/assessments";
import { getExamplePathways } from "@/lib/directory/analyzeAssessmentResults";
import { AssessmentDetailDrawer } from "./AssessmentDetailDrawer";

// ─── Category accent ──────────────────────────────────────────────────────────

const ACCENT: Record<AssessmentCategory, { border: string; text: string; bg: string }> = {
  Speed:            { border: "rgba(251,191,36,0.30)",  text: "rgb(251,191,36)",   bg: "rgba(251,191,36,0.08)" },
  Power:            { border: "rgba(248,113,113,0.30)", text: "rgb(248,113,113)",  bg: "rgba(248,113,113,0.08)" },
  Strength:         { border: "rgba(167,139,250,0.30)", text: "rgb(167,139,250)",  bg: "rgba(167,139,250,0.08)" },
  Mobility:         { border: "rgba(74,222,128,0.30)",  text: "rgb(74,222,128)",   bg: "rgba(74,222,128,0.08)" },
  Conditioning:     { border: "rgba(14,165,233,0.30)",  text: "hsl(199 89% 55%)",  bg: "rgba(14,165,233,0.08)" },
  Recovery:         { border: "rgba(52,211,153,0.30)",  text: "rgb(52,211,153)",   bg: "rgba(52,211,153,0.08)" },
  Readiness:        { border: "rgba(251,146,60,0.30)",  text: "rgb(251,146,60)",   bg: "rgba(251,146,60,0.08)" },
  "Movement Quality": { border: "rgba(129,140,248,0.30)", text: "rgb(129,140,248)", bg: "rgba(129,140,248,0.08)" },
};

// ─── Category tab ─────────────────────────────────────────────────────────────

function CategoryTab({
  meta,
  active,
  count,
  onClick,
}: {
  meta: AssessmentCategoryMeta;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const a = ACCENT[meta.name];
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all"
      style={{
        background: active ? a.bg : "rgba(255,255,255,0.03)",
        border: active ? `1px solid ${a.border}` : "1px solid rgba(255,255,255,0.07)",
        color: active ? a.text : "rgba(255,255,255,0.45)",
      }}
    >
      <span className="text-base leading-none">{meta.icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold leading-tight truncate">{meta.name}</p>
        <p className="text-[9px] mt-0.5" style={{ color: active ? a.text + "99" : "rgba(255,255,255,0.25)" }}>
          {count} tests
        </p>
      </div>
    </button>
  );
}

// ─── Assessment card ──────────────────────────────────────────────────────────

function AssessmentCard({
  assessment,
  onClick,
}: {
  assessment: Assessment;
  onClick: () => void;
}) {
  const a = ACCENT[assessment.category];
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl px-4 py-3 transition-all group"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = a.bg;
        (e.currentTarget as HTMLButtonElement).style.border = `1px solid ${a.border}`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)";
        (e.currentTarget as HTMLButtonElement).style.border = "1px solid rgba(255,255,255,0.07)";
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[13px] font-bold leading-tight" style={{ color: "rgba(255,255,255,0.88)" }}>
          {assessment.name}
        </p>
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.30)" }}
        >
          {assessment.difficulty}
        </span>
      </div>
      <p className="text-[11px] leading-snug mb-2.5" style={{ color: "rgba(255,255,255,0.42)" }}>
        {assessment.metric} · {assessment.unit}
      </p>
      <div className="flex flex-wrap gap-1">
        {assessment.qualities.slice(0, 2).map((q) => (
          <span
            key={q.quality}
            className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: a.bg, color: a.text }}
          >
            {q.quality}
          </span>
        ))}
        {assessment.qualities.length > 2 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)" }}>
            +{assessment.qualities.length - 2} more
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Example Pathway Card ─────────────────────────────────────────────────────

function PathwayCard({
  pathway,
  onSelect,
}: {
  pathway: ReturnType<typeof getExamplePathways>[number];
  onSelect: () => void;
}) {
  const assessment = ASSESSMENTS.find((a) => a.name === pathway.assessmentName);
  if (!assessment) return null;
  const a = ACCENT[assessment.category];

  const chain = [
    { label: "Assessment", value: pathway.assessmentName, accent: true },
    { label: "Quality", value: pathway.quality },
    { label: "Method", value: pathway.method },
    { label: "Exercise", value: pathway.exercise, accent: true },
    { label: "Adaptation", value: pathway.adaptation },
  ];

  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-2xl px-5 py-5 transition-all"
      style={{
        background: "hsl(222 47% 8%)",
        border: `1px solid ${a.border}`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = a.bg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "hsl(222 47% 8%)";
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: a.bg, color: a.text, border: `1px solid ${a.border}` }}
        >
          {assessment.category}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {chain.map((step, i) => (
          <div key={step.label} className="flex items-start gap-2">
            <div className="flex flex-col items-center flex-shrink-0 mt-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: step.accent ? a.text : "rgba(255,255,255,0.15)" }}
              />
              {i < chain.length - 1 && (
                <div className="w-px flex-1 mt-0.5" style={{ height: "16px", background: "rgba(255,255,255,0.08)" }} />
              )}
            </div>
            <div className="pb-1">
              <p
                className="text-[8px] font-bold uppercase tracking-widest leading-none mb-0.5"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {step.label}
              </p>
              <p
                className="text-[11px] font-semibold leading-snug"
                style={{ color: step.accent ? a.text : "rgba(255,255,255,0.72)" }}
              >
                {step.value.length > 60 ? step.value.slice(0, 58) + "…" : step.value}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p
        className="text-[10px] mt-4 font-semibold"
        style={{ color: a.text + "80" }}
      >
        Click to explore full assessment →
      </p>
    </button>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function AssessmentStatsBar() {
  const stats = [
    { value: `${ASSESSMENT_STATS.total}`, label: "Assessments" },
    { value: `${ASSESSMENT_STATS.categories}`, label: "Categories" },
    { value: `${ASSESSMENT_STATS.qualities}+`, label: "Physical Qualities" },
    { value: `${ASSESSMENT_STATS.sports}+`, label: "Sports" },
  ];
  return (
    <div
      className="rounded-2xl px-6 py-5 mb-10"
      style={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(220 20% 14%)" }}
    >
      <p
        className="text-center text-xs font-semibold uppercase tracking-widest mb-5"
        style={{ color: "hsl(199 89% 48%)" }}
      >
        Assessment Intelligence Network
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center text-center">
            <span className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: "#f4f4f5" }}>
              {s.value}
            </span>
            <span className="text-[11px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.38)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AssessmentIntelligence() {
  const [activeCategory, setActiveCategory] = useState<AssessmentCategory>("Speed");
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [activeTab, setActiveTab] = useState<"browse" | "pathways">("pathways");

  const pathways = getExamplePathways();
  const categoryAssessments = getAssessmentsByCategory(activeCategory);

  return (
    <section className="px-4 sm:px-6 py-16 sm:py-20">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-widest uppercase mb-4"
            style={{
              background: "rgba(167,139,250,0.10)",
              color: "rgb(167,139,250)",
              border: "1px solid rgba(167,139,250,0.20)",
            }}
          >
            Phase 4 Intelligence
          </div>
          <h2
            className="text-3xl sm:text-4xl font-black tracking-tight mb-4"
            style={{ color: "rgba(255,255,255,0.92)" }}
          >
            Assessment Intelligence
          </h2>
          <p
            className="text-sm sm:text-base leading-relaxed max-w-xl mx-auto"
            style={{ color: "rgba(255,255,255,0.48)" }}
          >
            TrainChat reasons from objective test results — not just goals. Enter a score and the
            system identifies weaknesses, maps them to qualities, selects methods, prescribes
            exercises, and projects adaptations.
          </p>

          {/* Chain summary */}
          <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
            {["Assessment", "Quality", "Method", "Exercise", "Adaptation"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-2">
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                  style={{
                    background: i === 0 || i === arr.length - 1 ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.05)",
                    color: i === 0 || i === arr.length - 1 ? "rgb(167,139,250)" : "rgba(255,255,255,0.55)",
                    border: i === 0 || i === arr.length - 1 ? "1px solid rgba(167,139,250,0.20)" : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {step}
                </span>
                {i < arr.length - 1 && (
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.20)" }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stats Bar */}
        <AssessmentStatsBar />

        {/* Tab switcher */}
        <div
          className="inline-flex rounded-xl p-1 mb-8"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {(["pathways", "browse"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2 rounded-lg text-[12px] font-semibold capitalize transition-all"
              style={{
                background: activeTab === tab ? "rgba(255,255,255,0.08)" : "transparent",
                color: activeTab === tab ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.40)",
              }}
            >
              {tab === "pathways" ? "Example Pathways" : "Browse Assessments"}
            </button>
          ))}
        </div>

        {/* Example Pathways Tab */}
        {activeTab === "pathways" && (
          <div>
            <p
              className="text-[12px] mb-6"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Click any pathway to explore the full assessment, normative data, and prescription.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pathways.map((pathway) => {
                const assessment = ASSESSMENTS.find((a) => a.name === pathway.assessmentName);
                return (
                  <PathwayCard
                    key={pathway.assessmentName}
                    pathway={pathway}
                    onSelect={() => setSelectedAssessment(assessment ?? null)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Browse Tab */}
        {activeTab === "browse" && (
          <div className="flex flex-col gap-6">
            {/* Category tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {ASSESSMENT_CATEGORIES.map((meta) => (
                <CategoryTab
                  key={meta.name}
                  meta={meta}
                  active={activeCategory === meta.name}
                  count={getAssessmentsByCategory(meta.name).length}
                  onClick={() => setActiveCategory(meta.name)}
                />
              ))}
            </div>

            {/* Category description */}
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.40)" }}>
                {ASSESSMENT_CATEGORIES.find((c) => c.name === activeCategory)?.description}
              </p>
            </div>

            {/* Assessment cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categoryAssessments.map((assessment) => (
                <AssessmentCard
                  key={assessment.id}
                  assessment={assessment}
                  onClick={() => setSelectedAssessment(assessment)}
                />
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div
          className="mt-12 rounded-2xl px-6 py-8 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(14,165,233,0.08) 100%)",
            border: "1px solid rgba(167,139,250,0.20)",
          }}
        >
          <p
            className="text-lg font-bold mb-2"
            style={{ color: "rgba(255,255,255,0.88)" }}
          >
            Turn your test results into a program
          </p>
          <p className="text-[13px] mb-4" style={{ color: "rgba(255,255,255,0.45)" }}>
            Tell TrainChat your scores and it will identify your priority weaknesses, select the
            right methods, and build you a system to fix them.
          </p>
          <a
            href="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all"
            style={{
              background: "rgba(167,139,250,0.15)",
              color: "rgb(167,139,250)",
              border: "1px solid rgba(167,139,250,0.30)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "rgba(167,139,250,0.25)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "rgba(167,139,250,0.15)";
            }}
          >
            Analyze my assessment results →
          </a>
        </div>

      </div>

      {/* Detail Drawer */}
      <AssessmentDetailDrawer
        assessment={selectedAssessment}
        onClose={() => setSelectedAssessment(null)}
      />
    </section>
  );
}
