import { forwardRef } from "react";
import type { ShareMoment, ShareMomentType } from "@/types/share-moments";

interface Props {
  moment: ShareMoment;
}

// ─── Theme per moment type ────────────────────────────────────────────────────

const TYPE_THEME: Record<ShareMomentType, {
  accent: string;
  accentDim: string;
  gradientA: string;
  gradientB: string;
  badge: string;
  badgeBg: string;
  badgeBorder: string;
}> = {
  PROGRAM_GENERATED: {
    accent: "#818cf8",
    accentDim: "#818cf840",
    gradientA: "#1a1730",
    gradientB: "#0d0c1a",
    badge: "PROGRAM CREATED",
    badgeBg: "#818cf818",
    badgeBorder: "#818cf840",
  },
  AGENT_ADJUSTMENT: {
    accent: "#34d399",
    accentDim: "#34d39940",
    gradientA: "#0d2118",
    gradientB: "#060f0c",
    badge: "PROGRAM UPDATED",
    badgeBg: "#34d39918",
    badgeBorder: "#34d39940",
  },
  BLOCK_COMPLETE: {
    accent: "#fbbf24",
    accentDim: "#fbbf2440",
    gradientA: "#231a06",
    gradientB: "#110d03",
    badge: "BLOCK COMPLETE",
    badgeBg: "#fbbf2418",
    badgeBorder: "#fbbf2440",
  },
  NEXT_BLOCK_READY: {
    accent: "#60a5fa",
    accentDim: "#60a5fa40",
    gradientA: "#0f1d2e",
    gradientB: "#060e17",
    badge: "NEXT PHASE READY",
    badgeBg: "#60a5fa18",
    badgeBorder: "#60a5fa40",
  },
  SESSION_LOG_ADAPTATION: {
    accent: "#a78bfa",
    accentDim: "#a78bfa40",
    gradientA: "#1a1428",
    gradientB: "#0d0a14",
    badge: "PLAN ADAPTED",
    badgeBg: "#a78bfa18",
    badgeBorder: "#a78bfa40",
  },
  PROGRESS_MILESTONE: {
    accent: "#fb923c",
    accentDim: "#fb923c40",
    gradientA: "#231408",
    gradientB: "#110a04",
    badge: "MILESTONE",
    badgeBg: "#fb923c18",
    badgeBorder: "#fb923c40",
  },
};

// ─── Block chips helper ───────────────────────────────────────────────────────

function BlockChips({
  weekNumber,
  blockLength,
  blockLabel,
  accent,
  accentDim,
}: {
  weekNumber?: number;
  blockLength?: number;
  blockLabel?: string;
  accent: string;
  accentDim: string;
}) {
  const total = blockLength ?? 4;
  const current = weekNumber ?? 1;

  const phaseLabels: Record<number, string> = {
    1: "Establish",
    2: "Build",
    3: "Intensify",
    4: blockLabel ?? "Peak",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#ffffff35",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Training Block
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Array.from({ length: total }, (_, i) => {
          const wk = i + 1;
          const isCurrent = wk === current;
          const label = phaseLabels[wk] ?? `Phase ${wk}`;
          return (
            <div
              key={wk}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: isCurrent ? "5px 10px" : "4px 8px",
                borderRadius: 100,
                background: isCurrent ? `${accent}20` : "#ffffff08",
                border: isCurrent ? `1.5px solid ${accent}70` : "1px solid #ffffff14",
                boxShadow: isCurrent ? `0 0 10px ${accent}25` : "none",
                transition: "all 0.2s",
              }}
            >
              {isCurrent && (
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: accent,
                    boxShadow: `0 0 6px ${accent}`,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  fontSize: isCurrent ? 10 : 9,
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? accent : "#ffffff50",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}
              >
                W{wk} — {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        background: "#ffffff08",
        border: "1px solid #ffffff12",
        borderRadius: 10,
        padding: "9px 10px",
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          color: "#ffffff40",
          fontWeight: 600,
          marginTop: 3,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

const ShareMomentCard = forwardRef<HTMLDivElement, Props>(({ moment }, ref) => {
  const theme = TYPE_THEME[moment.type];
  const { accent, accentDim, gradientA, gradientB, badge, badgeBg, badgeBorder } = theme;

  // Stat tiles — build from available data
  const stats: { value: string; label: string }[] = [];
  if (moment.daysPerWeek) stats.push({ value: `${moment.daysPerWeek}×`, label: "Days / week" });
  if (moment.splitType) stats.push({ value: moment.splitType, label: "Split" });
  if (moment.blockLength) stats.push({ value: `${moment.blockLength} wks`, label: "Block" });
  // Fall back to metrics if no rich data
  if (stats.length === 0) {
    moment.metrics.slice(0, 3).forEach((m) => stats.push({ value: m.value, label: m.label }));
  }

  const showBlocks = (moment.type === "PROGRAM_GENERATED"
    || moment.type === "AGENT_ADJUSTMENT"
    || moment.type === "BLOCK_COMPLETE"
    || moment.type === "NEXT_BLOCK_READY"
  ) && !!moment.daysPerWeek;

  const showCurrentDay = !!moment.currentDayName;

  // Headline copy per type
  const headlineMap: Record<ShareMomentType, string> = {
    PROGRAM_GENERATED: "Look what I created with the TrainChat Agent",
    AGENT_ADJUSTMENT: "TrainChat Agent adjusted my program",
    BLOCK_COMPLETE: "Block complete — next phase is ready",
    NEXT_BLOCK_READY: "My next training phase is ready",
    SESSION_LOG_ADAPTATION: "TrainChat Agent adapted my plan",
    PROGRESS_MILESTONE: "Milestone reached",
  };

  const headline = headlineMap[moment.type];

  // Subtitle — prefer programName or built from split/frequency
  const subtitle = (() => {
    if (moment.subtitle && moment.subtitle !== headline) return moment.subtitle;
    const parts = [
      moment.daysPerWeek ? `${moment.daysPerWeek}-day` : null,
      moment.splitType ?? moment.trainingStyle ?? null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : (moment.programName ?? "Training program");
  })();

  return (
    <div
      ref={ref}
      style={{
        width: 320,
        background: `linear-gradient(155deg, ${gradientA} 0%, ${gradientB} 100%)`,
        borderRadius: 22,
        padding: "24px 22px 20px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${accentDim}`,
        boxSizing: "border-box",
      }}
    >
      {/* Background glow — top right */}
      <div
        style={{
          position: "absolute",
          top: -70,
          right: -70,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      {/* Background glow — bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: -50,
          left: -50,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}0c 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* ── Top bar: brand + type badge ───────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          TRAINCHAT AGENT
        </span>
        <span
          style={{
            background: badgeBg,
            border: `1px solid ${badgeBorder}`,
            color: accent,
            borderRadius: 100,
            padding: "3px 9px",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {badge}
        </span>
      </div>

      {/* ── Headline ──────────────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "#ffffff",
          lineHeight: 1.25,
          letterSpacing: "-0.025em",
          marginBottom: 6,
        }}
      >
        {headline}
      </div>

      {/* ── Subtitle / Program name ───────────────────────────────────────── */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: `${accent}cc`,
          marginBottom: 20,
          letterSpacing: "0.01em",
          lineHeight: 1.4,
        }}
      >
        {subtitle.charAt(0).toUpperCase() + subtitle.slice(1)}
      </div>

      {/* ── Block chips ───────────────────────────────────────────────────── */}
      {showBlocks && (
        <BlockChips
          weekNumber={moment.weekNumber}
          blockLength={moment.blockLength ?? 4}
          blockLabel={moment.blockLabel}
          accent={accent}
          accentDim={accentDim}
        />
      )}

      {/* ── Current day feature row ───────────────────────────────────────── */}
      {showCurrentDay && (
        <div
          style={{
            background: `${accent}10`,
            border: `1px solid ${accent}28`,
            borderLeft: `3px solid ${accent}`,
            borderRadius: "0 10px 10px 0",
            padding: "10px 12px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: `${accent}90`,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              Day 1 Focus
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#ffffffdd",
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {moment.currentDayName}
            </div>
          </div>
        </div>
      )}

      {/* ── Stat tiles ───────────────────────────────────────────────────── */}
      {stats.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 7,
            marginBottom: 18,
          }}
        >
          {stats.slice(0, 3).map((s, i) => (
            <StatTile key={i} value={s.value} label={s.label} />
          ))}
        </div>
      )}

      {/* ── Block label pill (if available, for non-PROGRAM_GENERATED) ────── */}
      {moment.blockLabel && !showBlocks && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            borderRadius: 100,
            background: `${accent}15`,
            border: `1px solid ${accent}30`,
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 600, color: `${accent}cc`, letterSpacing: "0.04em" }}>
            {moment.blockLabel}
          </span>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div
        style={{
          paddingTop: 14,
          borderTop: "1px solid #ffffff0d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 6px ${accent}`,
            }}
          />
          <span
            style={{
              fontSize: 8,
              color: "#ffffff30",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            AI Coaching
          </span>
        </div>
        <span style={{ fontSize: 9, color: "#ffffff22", fontWeight: 500 }}>
          trainchat.app
        </span>
      </div>
    </div>
  );
});

ShareMomentCard.displayName = "ShareMomentCard";

export default ShareMomentCard;
