import { useEffect, useRef } from "react";
import {
  type Assessment,
  type AssessmentCategory,
} from "@/data/directory/assessments";

// ─── Category accent color ────────────────────────────────────────────────────

const CATEGORY_ACCENT: Record<AssessmentCategory, { border: string; text: string; bg: string }> = {
  Speed:            { border: "rgba(251,191,36,0.35)",  text: "rgb(251,191,36)",   bg: "rgba(251,191,36,0.10)" },
  Power:            { border: "rgba(248,113,113,0.35)", text: "rgb(248,113,113)",  bg: "rgba(248,113,113,0.10)" },
  Strength:         { border: "rgba(167,139,250,0.35)", text: "rgb(167,139,250)",  bg: "rgba(167,139,250,0.10)" },
  Mobility:         { border: "rgba(74,222,128,0.35)",  text: "rgb(74,222,128)",   bg: "rgba(74,222,128,0.10)" },
  Conditioning:     { border: "rgba(14,165,233,0.35)",  text: "hsl(199 89% 55%)",  bg: "rgba(14,165,233,0.10)" },
  Recovery:         { border: "rgba(52,211,153,0.35)",  text: "rgb(52,211,153)",   bg: "rgba(52,211,153,0.10)" },
  Readiness:        { border: "rgba(251,146,60,0.35)",  text: "rgb(251,146,60)",   bg: "rgba(251,146,60,0.10)" },
  "Movement Quality": { border: "rgba(129,140,248,0.35)", text: "rgb(129,140,248)", bg: "rgba(129,140,248,0.10)" },
};

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    required:    { bg: "rgba(248,113,113,0.12)", text: "rgb(248,113,113)" },
    recommended: { bg: "rgba(74,222,128,0.12)",  text: "rgb(74,222,128)" },
    alternative: { bg: "rgba(161,161,170,0.10)", text: "rgb(161,161,170)" },
  };
  const c = cfg[role] ?? cfg.recommended;
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.text }}
    >
      {role}
    </span>
  );
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

function TierRow({ tier, value }: { tier: string; value: string }) {
  const cfg: Record<string, { text: string; icon: string }> = {
    elite: { text: "rgb(74,222,128)",   icon: "🏆" },
    good:  { text: "rgb(251,191,36)",   icon: "✅" },
    average: { text: "rgb(251,146,60)", icon: "⚠️" },
    below: { text: "rgb(248,113,113)",  icon: "🔴" },
  };
  const c = cfg[tier] ?? cfg.average;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="text-sm w-5 flex-shrink-0">{c.icon}</span>
      <span
        className="text-[10px] font-bold uppercase tracking-widest w-16 flex-shrink-0"
        style={{ color: c.text }}
      >
        {tier}
      </span>
      <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.65)" }}>
        {value}
      </span>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4" style={{ borderBottom: "1px solid hsl(220 20% 12%)" }}>
      <p
        className="text-[9px] font-bold uppercase tracking-widest mb-3"
        style={{ color: "rgba(255,255,255,0.28)" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Chain step ───────────────────────────────────────────────────────────────

function ChainNode({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | string[];
  accent?: boolean;
}) {
  const values = Array.isArray(value) ? value : [value];
  return (
    <div className="flex flex-col gap-1">
      <p
        className="text-[9px] font-semibold uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.28)" }}
      >
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
            style={{
              background: accent ? "rgba(14,165,233,0.12)" : "rgba(255,255,255,0.06)",
              color: accent ? "hsl(199 89% 68%)" : "rgba(255,255,255,0.75)",
              border: accent ? "1px solid rgba(14,165,233,0.20)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export function AssessmentDetailDrawer({
  assessment,
  onClose,
}: {
  assessment: Assessment | null;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!assessment) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [assessment, onClose]);

  useEffect(() => {
    if (assessment) drawerRef.current?.scrollTo({ top: 0 });
  }, [assessment]);

  if (!assessment) return null;

  const accent = CATEGORY_ACCENT[assessment.category] ?? CATEGORY_ACCENT["Speed"];
  const nd = assessment.normativeData;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.60)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[420px] overflow-y-auto"
        style={{
          background: "hsl(222 47% 7%)",
          borderLeft: "1px solid hsl(220 20% 14%)",
          boxShadow: "-24px 0 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4"
          style={{
            background: "hsl(222 47% 7%)",
            borderBottom: `1px solid ${accent.border}`,
          }}
        >
          <div className="min-w-0 flex-1">
            <span
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2"
              style={{ background: accent.bg, color: accent.text }}
            >
              {assessment.category}
            </span>
            <h2
              className="text-base font-black leading-tight"
              style={{ color: "rgba(255,255,255,0.92)" }}
            >
              {assessment.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.40)" }}>
                {assessment.metric} · {assessment.unit}
              </span>
              <span
                className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }}
              >
                {assessment.difficulty}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-all"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.50)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5">

          {/* Description */}
          <DrawerSection title="Overview">
            <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
              {assessment.description}
            </p>
          </DrawerSection>

          {/* Normative Data */}
          {nd && (Object.keys(nd).filter((k) => k !== "note").length > 0) && (
            <DrawerSection title="Normative Data">
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {nd.elite   && <TierRow tier="elite"   value={nd.elite} />}
                {nd.good    && <TierRow tier="good"    value={nd.good} />}
                {nd.average && <TierRow tier="average" value={nd.average} />}
                {nd.below   && <TierRow tier="below"   value={nd.below} />}
              </div>
              {nd.note && (
                <p className="text-[11px] mt-2.5 italic" style={{ color: "rgba(255,255,255,0.35)" }}>
                  ℹ️ {nd.note}
                </p>
              )}
            </DrawerSection>
          )}

          {/* Measured Qualities */}
          <DrawerSection title="Measured Qualities">
            <div className="flex flex-wrap gap-2">
              {assessment.qualities.map((q) => (
                <span
                  key={q.quality}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                  style={{
                    background: accent.bg,
                    color: accent.text,
                    border: `1px solid ${accent.border}`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: accent.text }}
                  />
                  {q.quality}
                  {q.linkType === "reflects" && (
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px" }}>(reflects)</span>
                  )}
                </span>
              ))}
            </div>
          </DrawerSection>

          {/* Reasoning Chain */}
          <DrawerSection title="Intelligence Chain">
            <div className="flex flex-col gap-3">
              <ChainNode
                label="Assessment"
                value={assessment.name}
                accent
              />
              <div className="flex items-center gap-2 pl-1">
                <div className="w-px h-4 bg-white/10 ml-2" />
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.20)" }}>↓</span>
              </div>
              <ChainNode
                label="Measured Qualities"
                value={assessment.qualities.map((q) => q.quality)}
              />
              {assessment.methods.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pl-1">
                    <div className="w-px h-4 bg-white/10 ml-2" />
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.20)" }}>↓</span>
                  </div>
                  <ChainNode
                    label="Recommended Methods"
                    value={assessment.methods.map((m) => m.method)}
                  />
                </>
              )}
              {assessment.exercises.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pl-1">
                    <div className="w-px h-4 bg-white/10 ml-2" />
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.20)" }}>↓</span>
                  </div>
                  <ChainNode
                    label="Prescribed Exercises"
                    value={assessment.exercises.map((e) => e.exercise)}
                  />
                </>
              )}
              <div className="flex items-center gap-2 pl-1">
                <div className="w-px h-4 bg-white/10 ml-2" />
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.20)" }}>↓</span>
              </div>
              <ChainNode label="Expected Adaptation" value={assessment.expectedAdaptation} />
            </div>
          </DrawerSection>

          {/* Recommended Methods */}
          {assessment.methods.length > 0 && (
            <DrawerSection title="Recommended Methods">
              <div className="flex flex-col gap-2">
                {assessment.methods.map((m, i) => (
                  <div
                    key={m.method}
                    className="rounded-lg px-3 py-2.5"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                        style={{ background: "rgba(14,165,233,0.15)", color: "hsl(199 89% 60%)" }}
                      >
                        {i + 1}
                      </span>
                      <p className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.82)" }}>
                        {m.method}
                      </p>
                    </div>
                    <p className="text-[11px] pl-6" style={{ color: "rgba(255,255,255,0.40)" }}>
                      For: {m.weakness}
                    </p>
                  </div>
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Recommended Products */}
          {assessment.products.length > 0 && (
            <DrawerSection title="Recommended Products">
              <div className="flex flex-col gap-2">
                {assessment.products.map((p) => (
                  <div
                    key={p.product}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <p className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.78)" }}>
                      {p.product}
                    </p>
                    <RoleBadge role={p.role} />
                  </div>
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Recommended Exercises */}
          {assessment.exercises.length > 0 && (
            <DrawerSection title="Prescribed Exercises">
              <div className="flex flex-col gap-2">
                {assessment.exercises.map((e) => (
                  <div
                    key={e.exercise}
                    className="rounded-lg px-3 py-3"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <p className="text-[12px] font-semibold mb-1" style={{ color: "rgba(255,255,255,0.85)" }}>
                      {e.exercise}
                    </p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>
                      {e.prescription}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.28)" }}>
                      Targets: {e.weakness}
                    </p>
                  </div>
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Equipment Required */}
          {assessment.equipmentRequired.length > 0 && (
            <DrawerSection title="Equipment Required">
              <div className="flex flex-wrap gap-2">
                {assessment.equipmentRequired.map((eq) => (
                  <span
                    key={eq}
                    className="text-[11px] px-2.5 py-1 rounded-full"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.55)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    {eq}
                  </span>
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Sports */}
          <DrawerSection title="Sport Relevance">
            <div className="flex flex-wrap gap-2">
              {assessment.sportRelevance.map((s) => (
                <span
                  key={s}
                  className="text-[11px] px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.45)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </DrawerSection>

          <div className="h-8" />
        </div>
      </div>
    </>
  );
}
