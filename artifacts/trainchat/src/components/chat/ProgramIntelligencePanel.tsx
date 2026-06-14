import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import type { PerformanceProfile, PrioritizedQuality, LimitingFactor, RankedMethod, AdaptationForecast } from "@/lib/performanceIntelligenceTypes";

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p
      className="text-[9px] font-bold uppercase tracking-widest mb-3"
      style={{ color: "rgba(255,255,255,0.28)" }}
    >
      {label}
    </p>
  );
}

function QualityRow({ quality, index }: { quality: PrioritizedQuality; index: number }) {
  const score = quality.score;
  const barColor = score >= 85 ? "rgb(74,222,128)" : score >= 70 ? "hsl(199 89% 55%)" : "rgb(251,146,60)";

  return (
    <div
      className="rounded-lg px-3 py-2.5 mb-2"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)" }}
          >
            {index + 1}
          </span>
          <span className="text-[12px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
            {quality.quality}
          </span>
        </div>
        <span className="text-[10px] font-bold flex-shrink-0" style={{ color: barColor }}>
          {score}
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: barColor }} />
      </div>
      <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
        {quality.reason}
      </p>
    </div>
  );
}

function LimitingFactorRow({ factor }: { factor: LimitingFactor }) {
  const severityStyle: Record<string, { bg: string; text: string }> = {
    critical: { bg: "rgba(248,113,113,0.10)", text: "rgb(248,113,113)" },
    moderate: { bg: "rgba(251,146,60,0.10)",  text: "rgb(251,146,60)"  },
    minor:    { bg: "rgba(161,161,170,0.10)", text: "rgb(161,161,170)" },
  };
  const s = severityStyle[factor.severity] ?? severityStyle.moderate;

  return (
    <div
      className="rounded-lg px-3 py-2.5 mb-2"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ background: s.bg, color: s.text }}
        >
          {factor.severity}
        </span>
        <p className="text-[11px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.82)" }}>
          {factor.factor}
        </p>
      </div>
      <p className="text-[10px] leading-snug" style={{ color: "rgba(255,255,255,0.38)" }}>
        {factor.detail}
      </p>
      {factor.sourceAssessment && (
        <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
          Source: {factor.sourceAssessment}
        </p>
      )}
    </div>
  );
}

function MethodRow({ method, index }: { method: RankedMethod; index: number }) {
  const c = method.confidence;
  const barColor = c >= 85 ? "hsl(199 89% 55%)" : c >= 72 ? "rgb(74,222,128)" : "rgb(251,191,36)";

  return (
    <div
      className="rounded-lg px-3 py-2.5 mb-2"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[9px] font-black"
            style={{ background: "rgba(14,165,233,0.12)", color: "hsl(199 89% 60%)" }}
          >
            {index + 1}
          </span>
          <span className="text-[11px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
            {method.method}
          </span>
        </div>
        <span className="text-[10px] font-bold flex-shrink-0" style={{ color: barColor }}>{c}%</span>
      </div>
      <p className="text-[9px] mb-1.5" style={{ color: "rgba(255,255,255,0.30)" }}>
        → {method.targetQuality}
      </p>
      <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-full rounded-full" style={{ width: `${c}%`, background: barColor }} />
      </div>
    </div>
  );
}

function AdaptationCard({ adaptations }: { adaptations: AdaptationForecast }) {
  return (
    <div>
      <div className="mb-3">
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(74,222,128,0.70)" }}>
          Primary
        </p>
        {adaptations.primary.map((a) => (
          <div key={a} className="flex items-start gap-2 mb-1.5">
            <span className="text-[10px] mt-0.5" style={{ color: "rgb(74,222,128)" }}>✓</span>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.72)" }}>{a}</p>
          </div>
        ))}
      </div>
      {adaptations.secondary.length > 0 && (
        <div className="mb-3">
          <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>
            Secondary
          </p>
          {adaptations.secondary.slice(0, 3).map((a) => (
            <div key={a} className="flex items-start gap-2 mb-1">
              <span className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.30)" }}>›</span>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>{a}</p>
            </div>
          ))}
        </div>
      )}
      <div
        className="rounded-lg px-3 py-2 mt-2"
        style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)" }}
      >
        <p className="text-[10px]" style={{ color: "rgba(74,222,128,0.75)" }}>
          ⏱ {adaptations.timeline}
        </p>
      </div>
    </div>
  );
}

function ConfidenceMeter({ score }: { score: number }) {
  const color = score >= 85 ? "rgb(74,222,128)" : score >= 70 ? "hsl(199 89% 55%)" : "rgb(251,146,60)";
  const label = score >= 85 ? "High Confidence" : score >= 70 ? "Good Confidence" : "Moderate Confidence";
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 mb-5"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
        style={{ background: `${color}15`, color, border: `2px solid ${color}40` }}
      >
        {score}
      </div>
      <div>
        <p className="text-[11px] font-bold" style={{ color }}>{label}</p>
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Profile confidence — goal, sport, and assessment data
        </p>
      </div>
    </div>
  );
}

// ─── Loading & Empty States ───────────────────────────────────────────────────

function EmptyState({ hasActiveSystem }: { hasActiveSystem: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-5 py-10 text-center">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4"
        style={{ background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.20)" }}
      >
        🧠
      </div>
      <p className="text-[13px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.75)" }}>
        {hasActiveSystem ? "Generating profile…" : "No active program"}
      </p>
      <p className="text-[11px] leading-relaxed max-w-[200px]" style={{ color: "rgba(255,255,255,0.38)" }}>
        {hasActiveSystem
          ? "Your Performance Intelligence Profile will appear here after building a program."
          : "Build your training program and your Performance Intelligence Profile will appear here."}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {[80, 60, 90, 50, 70, 40].map((w, i) => (
        <div
          key={i}
          className="h-12 rounded-lg animate-pulse"
          style={{ background: "rgba(255,255,255,0.05)", width: `${w}%`, animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

type Section = "qualities" | "factors" | "methods" | "adaptations" | "exercises";

export function ProgramIntelligencePanel({
  hasActiveSystem,
  trainingSystemId,
}: {
  hasActiveSystem: boolean;
  trainingSystemId?: number | null;
}) {
  const [activeSection, setActiveSection] = useState<Section>("qualities");

  const { data: profile, isLoading } = useQuery<PerformanceProfile | null>({
    queryKey: ["performance-profile", trainingSystemId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (trainingSystemId) params.set("systemId", String(trainingSystemId));
      const result = await customFetch<{ profile: PerformanceProfile | null }>(
        `/api/performance-profile?${params.toString()}`
      );
      return result?.profile ?? null;
    },
    enabled: !!hasActiveSystem,
    staleTime: 60_000,
    retry: 1,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!profile) return <EmptyState hasActiveSystem={hasActiveSystem} />;

  const sections: Array<{ id: Section; label: string; count?: number }> = [
    { id: "qualities",    label: "Qualities",   count: profile.priorityQualities.length },
    { id: "factors",      label: "Limiters",    count: profile.limitingFactors.length },
    { id: "methods",      label: "Methods",     count: profile.recommendedMethods.length },
    { id: "adaptations",  label: "Forecast" },
    { id: "exercises",    label: "Why?" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab bar */}
      <div
        className="flex gap-0.5 px-2.5 py-2 overflow-x-auto flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
            style={{
              background: activeSection === s.id ? "rgba(167,139,250,0.12)" : "transparent",
              color: activeSection === s.id ? "rgb(167,139,250)" : "rgba(255,255,255,0.38)",
            }}
          >
            {s.label}
            {s.count !== undefined && (
              <span
                className="text-[8px] px-1 rounded-full"
                style={{
                  background: activeSection === s.id ? "rgba(167,139,250,0.20)" : "rgba(255,255,255,0.08)",
                  color: activeSection === s.id ? "rgb(167,139,250)" : "rgba(255,255,255,0.30)",
                }}
              >
                {s.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3">
        <ConfidenceMeter score={profile.confidence} />

        {activeSection === "qualities" && (
          <div>
            <SectionHeader label="Priority Physical Qualities" />
            {profile.priorityQualities.map((q, i) => (
              <QualityRow key={q.quality} quality={q} index={i} />
            ))}
            {profile.sport && (
              <p className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.28)" }}>
                Ranked for {profile.goal} + {profile.sport}
              </p>
            )}
          </div>
        )}

        {activeSection === "factors" && (
          <div>
            <SectionHeader label="Identified Limiting Factors" />
            {profile.limitingFactors.length === 0 ? (
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.40)" }}>
                No significant limiting factors detected. Program optimized for goal-based quality development.
              </p>
            ) : (
              profile.limitingFactors.map((f) => (
                <LimitingFactorRow key={f.factor} factor={f} />
              ))
            )}
          </div>
        )}

        {activeSection === "methods" && (
          <div>
            <SectionHeader label="Selected Training Methods" />
            {profile.recommendedMethods.map((m, i) => (
              <MethodRow key={m.method} method={m} index={i} />
            ))}
          </div>
        )}

        {activeSection === "adaptations" && (
          <div>
            <SectionHeader label="Expected Adaptation Forecast" />
            <AdaptationCard adaptations={profile.expectedAdaptations} />
          </div>
        )}

        {activeSection === "exercises" && (
          <div>
            <SectionHeader label="Exercise Selection Rationale" />
            {profile.exerciseRationale.length === 0 ? (
              <p className="text-[11px] mb-3" style={{ color: "rgba(255,255,255,0.40)" }}>
                Exercise rationale loads with your next program build.
              </p>
            ) : (
              profile.exerciseRationale.map((r) => (
                <div
                  key={r.exercise}
                  className="rounded-lg px-3 py-3 mb-2"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <p className="text-[12px] font-bold mb-1" style={{ color: "rgba(255,255,255,0.88)" }}>
                    {r.exercise}
                  </p>
                  <p className="text-[10px] mb-1.5" style={{ color: "rgba(255,255,255,0.40)" }}>
                    <span style={{ color: "hsl(199 89% 55%)" }}>Quality:</span> {r.targetQuality}
                    {" · "}
                    <span style={{ color: "hsl(199 89% 55%)" }}>Method:</span> {r.method}
                  </p>
                  {r.limitingFactor && (
                    <p className="text-[10px] mb-1" style={{ color: "rgba(251,146,60,0.75)" }}>
                      Targets: {r.limitingFactor}
                    </p>
                  )}
                  <p className="text-[10px]" style={{ color: "rgba(74,222,128,0.70)" }}>
                    → {r.expectedAdaptation}
                  </p>
                </div>
              ))
            )}
            <div
              className="rounded-lg px-3 py-2.5 mt-2"
              style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)" }}
            >
              <p className="text-[10px]" style={{ color: "rgba(167,139,250,0.80)" }}>
                💬 Ask Atlas: <em>"Why was this exercise selected?"</em> or <em>"What weakness is this targeting?"</em>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
