import { forwardRef } from "react";
import type { ShareMoment, ShareMomentType, ShareDay1Exercise } from "@/types/share-moments";
import { formatExerciseForShareCard } from "./shareCardUtils";

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
  isAdaptation?: boolean;
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
    isAdaptation: true,
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
    isAdaptation: true,
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
  PROGRAM_GENERATED: "My live adaptive training system",
  AGENT_ADJUSTMENT: "AI-adjusted my performance plan",
  BLOCK_COMPLETE: "Block complete — next phase loading",
  NEXT_BLOCK_READY: "My next training phase is ready",
  SESSION_LOG_ADAPTATION: "TrainChat® Agent adapted my plan",
  PROGRESS_MILESTONE: "Milestone reached",
};

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div
      style={{
        background: `${accent}08`,
        border: `1px solid ${accent}1c`,
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
          color: `${accent}80`,
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

// ─── Exercise row ─────────────────────────────────────────────────────────────

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          minWidth: 0,
          flex: 1,
          overflow: "hidden",
        }}
      >
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
          {formatExerciseForShareCard(ex.name)}
        </span>
      </div>
      {prescription && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: `${accent}cc`,
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
        background: `${accent}06`,
        border: `1px solid ${accent}22`,
        borderLeft: `2px solid ${accent}cc`,
        borderRadius: "0 12px 12px 0",
        padding: "13px 14px",
        marginBottom: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Inner glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: -15,
          transform: "translateY(-50%)",
          width: 70,
          height: 70,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}10 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 11,
          position: "relative",
        }}
      >
        <div
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            background: accent,
            boxShadow: `0 0 7px ${accent}80`,
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
            position: "relative",
          }}
        >
          {day1.name}
        </div>
      )}

      {/* Exercise list */}
      <div style={{ position: "relative" }}>
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
                  color: "#ffffff45",
                  letterSpacing: "0.04em",
                }}
              >
                + {overflow} more exercise{overflow !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#ffffff40", fontStyle: "italic" }}>
            Exercise details loading…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Fallback day panel ───────────────────────────────────────────────────────

function Day1Fallback({ dayName, accent }: { dayName?: string; accent: string }) {
  return (
    <div
      style={{
        background: `${accent}06`,
        border: `1px solid ${accent}22`,
        borderLeft: `2px solid ${accent}cc`,
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
      <div style={{ fontSize: 10, color: "#ffffff40", marginTop: 4 }}>
        Personalized by TrainChat® Agent
      </div>
    </div>
  );
}

// ─── AI adaptation intelligence strip ────────────────────────────────────────

function AdaptationStrip({ accent }: { accent: string }) {
  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 8,
        padding: "7px 11px",
        background: `linear-gradient(90deg, ${accent}14, ${accent}08 80%, transparent)`,
        border: `1px solid ${accent}28`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -8,
          top: "50%",
          transform: "translateY(-50%)",
          width: 50,
          height: 50,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: accent,
          boxShadow: `0 0 7px ${accent}`,
          flexShrink: 0,
          position: "relative",
        }}
      />
      <span
        style={{
          fontSize: 7.5,
          fontWeight: 700,
          color: `${accent}dd`,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          position: "relative",
        }}
      >
        AI ADAPTED
      </span>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

const ShareMomentCard = forwardRef<HTMLDivElement, Props>(({ moment }, ref) => {
  const theme = TYPE_THEME[moment.type];
  const { accent, gradientA, gradientB, badge, badgeBg, badgeBorder, isAdaptation } = theme;

  const stats: { value: string; label: string }[] = [];
  if (moment.daysPerWeek) stats.push({ value: `${moment.daysPerWeek}×`, label: "Days / wk" });
  if (moment.splitType) stats.push({ value: moment.splitType, label: "Split" });
  if (moment.blockLength) stats.push({ value: `${moment.blockLength} wks`, label: "Block" });
  if (stats.length === 0) {
    moment.metrics.slice(0, 3).forEach((m) => stats.push({ value: m.value, label: m.label }));
  }

  const headline = HEADLINE[moment.type];

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
        background: `linear-gradient(158deg, ${gradientA} 0%, ${gradientB} 100%)`,
        borderRadius: 22,
        padding: "22px 20px 18px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${accent}22`,
        boxSizing: "border-box",
      }}
    >
      {/* ── Ambient background layers ─────────────────────────────────── */}

      {/* Neural dot grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${accent}10 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
          pointerEvents: "none",
        }}
      />

      {/* Primary top-right bloom */}
      <div
        style={{
          position: "absolute",
          top: -90,
          right: -70,
          width: 250,
          height: 250,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}18 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />

      {/* Bottom-left ambient */}
      <div
        style={{
          position: "absolute",
          bottom: -60,
          left: -50,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}09 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Diagonal energy streak — primary */}
      <div
        style={{
          position: "absolute",
          top: -15,
          right: 50,
          width: 1,
          height: 190,
          background: `linear-gradient(to bottom, transparent 0%, ${accent}20 45%, ${accent}0a 80%, transparent 100%)`,
          transform: "rotate(-26deg)",
          pointerEvents: "none",
        }}
      />

      {/* Diagonal energy streak — secondary */}
      <div
        style={{
          position: "absolute",
          top: 30,
          right: 85,
          width: 1,
          height: 130,
          background: `linear-gradient(to bottom, transparent 0%, ${accent}0e 55%, transparent 100%)`,
          transform: "rotate(-26deg)",
          pointerEvents: "none",
        }}
      />

      {/* Top edge highlight */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${accent}35 40%, ${accent}18 70%, transparent 100%)`,
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
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 8px ${accent}90, 0 0 18px ${accent}28`,
              flexShrink: 0,
            }}
          />
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
        </div>
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

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 17,
          fontWeight: 800,
          color: "#ffffff",
          lineHeight: 1.25,
          letterSpacing: "-0.025em",
          marginBottom: 5,
          position: "relative",
        }}
      >
        {headline}
      </div>

      {/* ── Subtitle / program label ─────────────────────────────────────── */}
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: `${accent}cc`,
          marginBottom: isAdaptation ? 12 : 18,
          letterSpacing: "0.01em",
          lineHeight: 1.4,
          position: "relative",
        }}
      >
        {subtitle.charAt(0).toUpperCase() + subtitle.slice(1)}
      </div>

      {/* ── AI adaptation strip (adaptation types only) ──────────────────── */}
      {isAdaptation && <AdaptationStrip accent={accent} />}

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
            position: "relative",
          }}
        >
          {stats.slice(0, 3).map((s, i) => (
            <StatTile key={i} value={s.value} label={s.label} accent={accent} />
          ))}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div
        style={{
          paddingTop: 12,
          borderTop: "1px solid #ffffff0e",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 5px ${accent}80`,
            }}
          />
          <span
            style={{
              fontSize: 8,
              color: "#ffffff42",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            AI Coaching
          </span>
        </div>
        <span style={{ fontSize: 8.5, color: "#ffffff30", fontWeight: 500 }}>
          trainchat.app
        </span>
      </div>
    </div>
  );
});

ShareMomentCard.displayName = "ShareMomentCard";

export default ShareMomentCard;
