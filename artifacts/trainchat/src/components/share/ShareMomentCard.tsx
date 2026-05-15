import { forwardRef } from "react";
import type { ShareMoment, ShareMomentType, ShareDay1Exercise } from "@/types/share-moments";

interface Props {
  moment: ShareMoment;
}

// ─── Per-type visual theme ────────────────────────────────────────────────────

const TYPE_THEME: Record<ShareMomentType, {
  accent: string;
  gradientA: string;
  gradientB: string;
  badge: string;
  badgeBg: string;
  badgeBorder: string;
}> = {
  PROGRAM_GENERATED: {
    accent: "#818cf8",
    gradientA: "#191730",
    gradientB: "#0c0b1a",
    badge: "PROGRAM CREATED",
    badgeBg: "#818cf815",
    badgeBorder: "#818cf838",
  },
  AGENT_ADJUSTMENT: {
    accent: "#34d399",
    gradientA: "#0d2118",
    gradientB: "#07100d",
    badge: "PROGRAM UPDATED",
    badgeBg: "#34d39915",
    badgeBorder: "#34d39938",
  },
  BLOCK_COMPLETE: {
    accent: "#fbbf24",
    gradientA: "#231a06",
    gradientB: "#120e03",
    badge: "BLOCK COMPLETE",
    badgeBg: "#fbbf2415",
    badgeBorder: "#fbbf2438",
  },
  NEXT_BLOCK_READY: {
    accent: "#60a5fa",
    gradientA: "#0f1e30",
    gradientB: "#070e18",
    badge: "NEXT PHASE READY",
    badgeBg: "#60a5fa15",
    badgeBorder: "#60a5fa38",
  },
  SESSION_LOG_ADAPTATION: {
    accent: "#a78bfa",
    gradientA: "#1a1429",
    gradientB: "#0d0a14",
    badge: "PLAN ADAPTED",
    badgeBg: "#a78bfa15",
    badgeBorder: "#a78bfa38",
  },
  PROGRESS_MILESTONE: {
    accent: "#fb923c",
    gradientA: "#231408",
    gradientB: "#110a04",
    badge: "MILESTONE",
    badgeBg: "#fb923c15",
    badgeBorder: "#fb923c38",
  },
};

// ─── Headline copy ────────────────────────────────────────────────────────────

const HEADLINE: Record<ShareMomentType, string> = {
  PROGRAM_GENERATED: "Look what I created with the TrainChat® Agent",
  AGENT_ADJUSTMENT: "TrainChat® Agent updated my program",
  BLOCK_COMPLETE: "Block complete — next phase is loading",
  NEXT_BLOCK_READY: "My next training phase is ready",
  SESSION_LOG_ADAPTATION: "TrainChat® Agent adapted my plan",
  PROGRESS_MILESTONE: "Milestone reached",
};

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        background: "#ffffff07",
        border: "1px solid #ffffff10",
        borderRadius: 8,
        padding: "8px 10px",
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 14,
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
          fontSize: 8,
          color: "#ffffff35",
          fontWeight: 600,
          marginTop: 3,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Day 1 exercise row ───────────────────────────────────────────────────────

function ExerciseRow({
  ex,
  accent,
  isLast,
}: {
  ex: ShareDay1Exercise;
  accent: string;
  isLast: boolean;
}) {
  const prescription =
    ex.sets && ex.reps
      ? `${ex.sets}×${ex.reps}`
      : ex.sets
        ? `${ex.sets} sets`
        : ex.reps
          ? ex.reps
          : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        paddingBottom: isLast ? 0 : 8,
        marginBottom: isLast ? 0 : 8,
        borderBottom: isLast ? "none" : "1px solid #ffffff09",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
        <div
          style={{
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: `${accent}80`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "#ffffffcc",
            letterSpacing: "0.005em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ex.name}
        </span>
      </div>
      {prescription && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: `${accent}bb`,
            letterSpacing: "0.03em",
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {prescription}
        </span>
      )}
    </div>
  );
}

// ─── Day 1 hero panel ─────────────────────────────────────────────────────────

const MAX_EXERCISES = 5;

function Day1Panel({
  day1,
  accent,
}: {
  day1: NonNullable<ShareMoment["day1"]>;
  accent: string;
}) {
  const exercises = day1.exercises ?? [];
  const visible = exercises.slice(0, MAX_EXERCISES);
  const overflow = exercises.length - MAX_EXERCISES;

  return (
    <div
      style={{
        background: "#ffffff06",
        border: `1px solid ${accent}28`,
        borderRadius: 12,
        padding: "13px 14px",
        marginBottom: 14,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 11,
        }}
      >
        <div
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            background: accent,
            boxShadow: `0 0 6px ${accent}80`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: `${accent}99`,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Day 1 Program
        </span>
      </div>

      {/* Day title */}
      {day1.name && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.01em",
            marginBottom: 10,
            lineHeight: 1.2,
          }}
        >
          {day1.name}
        </div>
      )}

      {/* Exercise list */}
      {visible.length > 0 ? (
        <div>
          {visible.map((ex, i) => (
            <ExerciseRow
              key={i}
              ex={ex}
              accent={accent}
              isLast={i === visible.length - 1 && overflow <= 0}
            />
          ))}
          {overflow > 0 && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: "1px solid #ffffff09",
                fontSize: 10,
                fontWeight: 600,
                color: "#ffffff35",
                letterSpacing: "0.04em",
              }}
            >
              + {overflow} more exercise{overflow !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#ffffff30", fontStyle: "italic" }}>
          Exercise details loading…
        </div>
      )}
    </div>
  );
}

// ─── Fallback day panel (no exercise data) ────────────────────────────────────

function Day1Fallback({
  dayName,
  accent,
}: {
  dayName?: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff06",
        border: `1px solid ${accent}28`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: "0 12px 12px 0",
        padding: "12px 14px",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: `${accent}80`,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Day 1 Program
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#ffffffcc",
          letterSpacing: "0.01em",
        }}
      >
        {dayName ?? "Custom Training Day"}
      </div>
      <div style={{ fontSize: 10, color: "#ffffff30", marginTop: 4 }}>
        Personalized by TrainChat® Agent
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

const ShareMomentCard = forwardRef<HTMLDivElement, Props>(({ moment }, ref) => {
  const theme = TYPE_THEME[moment.type];
  const { accent, gradientA, gradientB, badge, badgeBg, badgeBorder } = theme;

  // Stat tiles
  const stats: { value: string; label: string }[] = [];
  if (moment.daysPerWeek) stats.push({ value: `${moment.daysPerWeek}×`, label: "Days / wk" });
  if (moment.splitType) stats.push({ value: moment.splitType, label: "Split" });
  if (moment.blockLength) stats.push({ value: `${moment.blockLength} wks`, label: "Block" });
  if (stats.length === 0) {
    moment.metrics.slice(0, 3).forEach((m) => stats.push({ value: m.value, label: m.label }));
  }

  const headline = HEADLINE[moment.type];

  // Subtitle — program name or derived
  const subtitle = (() => {
    if (moment.subtitle && moment.subtitle !== headline) return moment.subtitle;
    const parts = [
      moment.daysPerWeek ? `${moment.daysPerWeek}-day` : null,
      moment.splitType ?? moment.trainingStyle ?? null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : (moment.programName ?? "Training program");
  })();

  const hasDay1Data = !!(moment.day1?.exercises?.length);
  const day1Name = moment.day1?.name ?? moment.currentDayName;

  return (
    <div
      ref={ref}
      style={{
        width: 320,
        background: `linear-gradient(155deg, ${gradientA} 0%, ${gradientB} 100%)`,
        borderRadius: 22,
        padding: "22px 20px 18px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${accent}28`,
        boxSizing: "border-box",
      }}
    >
      {/* Ambient glow — top right */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}14 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* ── Top bar: brand + type badge ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "0.15em",
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
            padding: "3px 8px",
            fontSize: 7.5,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {badge}
        </span>
      </div>

      {/* ── Headline ────────────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 17,
          fontWeight: 800,
          color: "#ffffff",
          lineHeight: 1.25,
          letterSpacing: "-0.025em",
          marginBottom: 5,
        }}
      >
        {headline}
      </div>

      {/* ── Subtitle / program label ─────────────────────────────────────── */}
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: `${accent}bb`,
          marginBottom: 18,
          letterSpacing: "0.01em",
          lineHeight: 1.4,
        }}
      >
        {subtitle.charAt(0).toUpperCase() + subtitle.slice(1)}
      </div>

      {/* ── Day 1 hero section ───────────────────────────────────────────── */}
      {hasDay1Data ? (
        <Day1Panel day1={moment.day1!} accent={accent} />
      ) : (day1Name || moment.currentDayName) ? (
        <Day1Fallback dayName={day1Name} accent={accent} />
      ) : null}

      {/* ── Stat tiles ───────────────────────────────────────────────────── */}
      {stats.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
          }}
        >
          {stats.slice(0, 3).map((s, i) => (
            <StatTile key={i} value={s.value} label={s.label} />
          ))}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div
        style={{
          paddingTop: 12,
          borderTop: "1px solid #ffffff0c",
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
              boxShadow: `0 0 5px ${accent}`,
            }}
          />
          <span
            style={{
              fontSize: 8,
              color: "#ffffff28",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Custom AI Coaching
          </span>
        </div>
        <span style={{ fontSize: 8.5, color: "#ffffff20", fontWeight: 500 }}>
          trainchat.app
        </span>
      </div>
    </div>
  );
});

ShareMomentCard.displayName = "ShareMomentCard";

export default ShareMomentCard;
