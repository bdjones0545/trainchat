import { forwardRef } from "react";
import { formatExerciseForShareCard } from "./shareCardUtils";

export interface ProgramCardData {
  title: string;
  subtitle: string;
  phases: string[];
  dayPreview: {
    title: string;
    exercises: string[];
  };
  tagline: string;
  caption: string;
}

export type ShareAspectMode = "square" | "portrait" | "landscape";

interface Props {
  card: ProgramCardData;
  focusMode?: "strength" | "speed" | "mobility";
  selectedWeekNumber?: number | null;
  weekPhase?: string | null;
  isAdapted?: boolean;
  shareAspectMode?: ShareAspectMode;
}

const FOCUS_THEME = {
  strength: {
    accent: "#818cf8",
    gradientFrom: "#1a1830",
    gradientMid: "#0f0e1c",
    gradientTo: "#09081a",
    chipLabels: ["POWER", "PROGRESSIVE LOAD", "VOLUME"] as string[],
  },
  speed: {
    accent: "#fb923c",
    gradientFrom: "#231508",
    gradientMid: "#160e05",
    gradientTo: "#0d0803",
    chipLabels: ["ACCELERATION", "SPEED", "EXPLOSIVITY"] as string[],
  },
  mobility: {
    accent: "#34d399",
    gradientFrom: "#041e13",
    gradientMid: "#02110a",
    gradientTo: "#010805",
    chipLabels: ["RANGE", "RECOVERY", "CONTROL"] as string[],
  },
};

const PHASE_SHORT = ["ESTABLISH", "BUILD", "INTENSIFY", "PEAK"];

const ADAPTIVE_CUES = [
  "AI-adjusted from recent performance",
  "Adaptive coaching active",
  "Built from live training feedback",
];

const ProgramShareCard = forwardRef<HTMLDivElement, Props>(
  ({ card, focusMode = "strength", selectedWeekNumber, weekPhase, isAdapted, shareAspectMode = "square" }, ref) => {
    const theme = FOCUS_THEME[focusMode] ?? FOCUS_THEME.strength;
    const { accent, gradientFrom, gradientMid, gradientTo, chipLabels } = theme;

    // Detect active week: explicit prop wins, then scan phases for ◀ marker
    const activeWeekIdx: number =
      selectedWeekNumber != null
        ? selectedWeekNumber - 1
        : (() => {
            const idx = card.phases.findIndex((p) => p.includes("◀"));
            return idx >= 0 ? idx : -1;
          })();

    const activePhaseLabel =
      weekPhase?.toUpperCase() ??
      (activeWeekIdx >= 0 ? (PHASE_SHORT[activeWeekIdx] ?? null) : null);

    // Stable adaptive cue — pick from list based on week index so it varies
    const adaptiveCue = isAdapted
      ? (ADAPTIVE_CUES[activeWeekIdx >= 0 ? activeWeekIdx % ADAPTIVE_CUES.length : 0] ?? ADAPTIVE_CUES[0])
      : null;

    // shareAspectMode is wired for future layout variation; width stays 320 for now
    void shareAspectMode;

    return (
      <div
        ref={ref}
        style={{
          width: 320,
          background: `linear-gradient(158deg, ${gradientFrom} 0%, ${gradientMid} 55%, ${gradientTo} 100%)`,
          borderRadius: 22,
          padding: "22px 22px 20px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
          position: "relative",
          overflow: "hidden",
          border: `1px solid ${accent}20`,
          boxSizing: "border-box",
        }}
      >
        {/* ── Ambient background layers ─────────────────────────────────── */}

        {/* Neural dot grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `radial-gradient(circle, ${accent}12 1px, transparent 1px)`,
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
            width: 260,
            height: 260,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accent}1c 0%, transparent 65%)`,
            pointerEvents: "none",
          }}
        />

        {/* Secondary bottom-left ambient */}
        <div
          style={{
            position: "absolute",
            bottom: -70,
            left: -50,
            width: 190,
            height: 190,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accent}0a 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        {/* Diagonal energy streak — primary */}
        <div
          style={{
            position: "absolute",
            top: -15,
            right: 52,
            width: 1,
            height: 200,
            background: `linear-gradient(to bottom, transparent 0%, ${accent}22 45%, ${accent}0c 80%, transparent 100%)`,
            transform: "rotate(-26deg)",
            pointerEvents: "none",
          }}
        />

        {/* Diagonal energy streak — secondary */}
        <div
          style={{
            position: "absolute",
            top: 25,
            right: 88,
            width: 1,
            height: 140,
            background: `linear-gradient(to bottom, transparent 0%, ${accent}10 55%, transparent 100%)`,
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
            background: `linear-gradient(90deg, transparent 0%, ${accent}38 40%, ${accent}18 70%, transparent 100%)`,
            pointerEvents: "none",
          }}
        />

        {/* ── Brand bar ────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 17,
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
                fontSize: 10,
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "0.14em",
              }}
            >
              TRAINCHAT
            </span>
            <span
              style={{
                fontSize: 7.5,
                fontWeight: 700,
                color: `${accent}60`,
                letterSpacing: "0.08em",
                marginLeft: 1,
              }}
            >
              ◆ LIVE
            </span>
          </div>
          <span
            style={{
              background: `${accent}16`,
              border: `1px solid ${accent}38`,
              color: accent,
              borderRadius: 100,
              padding: "2px 8px",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.12em",
            }}
          >
            {focusMode.toUpperCase()}
          </span>
        </div>

        {/* ── Title ────────────────────────────────────────────────────── */}
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.2,
            letterSpacing: "-0.025em",
            marginBottom: 4,
            position: "relative",
          }}
        >
          {card.title}
        </div>

        {/* ── Subtitle ─────────────────────────────────────────────────── */}
        <div
          style={{
            fontSize: 11.5,
            color: `${accent}cc`,
            fontWeight: 500,
            marginBottom: adaptiveCue ? 6 : 16,
            letterSpacing: "0.005em",
            position: "relative",
          }}
        >
          {card.subtitle}
        </div>

        {/* ── Adaptive intelligence cue ─────────────────────────────────── */}
        {adaptiveCue && (
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: `${accent}65`,
              letterSpacing: "0.04em",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 5,
              position: "relative",
            }}
          >
            <span style={{ fontSize: 7, color: `${accent}50`, lineHeight: 1 }}>◆</span>
            {adaptiveCue}
          </div>
        )}

        {/* ── Week timeline: W1 ── W2 ● ── W3 ── W4 ─────────────────────── */}
        <div style={{ marginBottom: isAdapted ? 10 : 14, position: "relative" }}>
          <div
            style={{
              fontSize: 7.5,
              fontWeight: 700,
              color: "#ffffff42",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 9,
            }}
          >
            Block structure
          </div>
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {[0, 1, 2, 3].map((i) => {
              const isActive = i === activeWeekIdx;
              const isPast = activeWeekIdx >= 0 && i < activeWeekIdx;
              const nodeSz = isActive ? 12 : 7;

              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    position: "relative",
                  }}
                >
                  {/* Left half connector */}
                  <div
                    style={{
                      position: "absolute",
                      top: isActive ? 5 : 3,
                      left: 0,
                      right: "50%",
                      height: 1,
                      background:
                        i === 0
                          ? "transparent"
                          : isActive
                          ? `linear-gradient(90deg, ${accent}60, ${accent}aa)`
                          : isPast
                          ? `${accent}55`
                          : "#ffffff18",
                    }}
                  />
                  {/* Right half connector */}
                  <div
                    style={{
                      position: "absolute",
                      top: isActive ? 5 : 3,
                      left: "50%",
                      right: 0,
                      height: 1,
                      background:
                        i === 3
                          ? "transparent"
                          : isActive
                          ? `linear-gradient(90deg, ${accent}aa, ${accent}60)`
                          : isPast
                          ? `${accent}55`
                          : "#ffffff18",
                    }}
                  />
                  {/* Active glow halo */}
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        top: -6,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: `radial-gradient(circle, ${accent}38 0%, transparent 70%)`,
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {/* Node */}
                  <div
                    style={{
                      width: nodeSz,
                      height: nodeSz,
                      borderRadius: "50%",
                      background: isActive
                        ? accent
                        : isPast
                        ? `${accent}60`
                        : "#ffffff18",
                      boxShadow: isActive
                        ? `0 0 12px ${accent}c0, 0 0 28px ${accent}55`
                        : "none",
                      border: isActive
                        ? `1px solid ${accent}dd`
                        : `1px solid #ffffff18`,
                      position: "relative",
                      zIndex: 1,
                      marginTop: isActive ? -2 : 0,
                    }}
                  />
                  {/* W label */}
                  <div
                    style={{
                      fontSize: isActive ? 9 : 7.5,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive
                        ? accent
                        : isPast
                        ? `${accent}75`
                        : "#ffffff42",
                      marginTop: 5,
                      letterSpacing: "0.04em",
                    }}
                  >
                    W{i + 1}
                  </div>
                  {/* Phase label — active week only */}
                  {isActive && activePhaseLabel && (
                    <div
                      style={{
                        fontSize: 7,
                        fontWeight: 700,
                        color: `${accent}90`,
                        letterSpacing: "0.1em",
                        marginTop: 2,
                        textTransform: "uppercase",
                      }}
                    >
                      {activePhaseLabel}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── AI adaptation strip ───────────────────────────────────────── */}
        {isAdapted && (
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
            {/* Strip bloom */}
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
              AI ADAPTED THIS WEEK
            </span>
          </div>
        )}

        {/* ── Session preview ───────────────────────────────────────────── */}
        <div
          style={{
            background: "#ffffff05",
            border: `1px solid ${accent}1c`,
            borderLeft: `2px solid ${accent}cc`,
            borderRadius: "0 10px 10px 0",
            padding: "11px 13px",
            marginBottom: 12,
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
              background: `radial-gradient(circle, ${accent}0e 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              fontSize: 8.5,
              fontWeight: 700,
              color: accent,
              letterSpacing: "0.1em",
              marginBottom: 9,
              position: "relative",
            }}
          >
            {card.dayPreview.title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, position: "relative" }}>
            {card.dayPreview.exercises.slice(0, 4).map((ex, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11,
                  color: i === 0 ? "#ffffffd0" : "#ffffffaa",
                  fontWeight: i === 0 ? 500 : 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: i === 0 ? `${accent}90` : "#ffffff28",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatExerciseForShareCard(ex)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Focus chips ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
          {chipLabels.slice(0, 3).map((chip, i) => (
            <span
              key={i}
              style={{
                fontSize: 7.5,
                fontWeight: 700,
                color: i === 0 ? accent : `${accent}92`,
                background: i === 0 ? `${accent}14` : `${accent}08`,
                border: `1px solid ${i === 0 ? `${accent}35` : `${accent}18`}`,
                borderRadius: 100,
                padding: "2px 8px",
                letterSpacing: "0.1em",
                boxShadow: i === 0 ? `0 0 8px ${accent}1a` : "none",
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div
          style={{
            paddingTop: 11,
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
                boxShadow: `0 0 6px ${accent}80`,
              }}
            />
            <span
              style={{
                fontSize: 8,
                color: "#ffffff42",
                fontWeight: 700,
                letterSpacing: "0.1em",
              }}
            >
              AI COACHING
            </span>
          </div>
          <span style={{ fontSize: 8, color: "#ffffff30", fontWeight: 500 }}>
            trainchat.app
          </span>
        </div>
      </div>
    );
  }
);

ProgramShareCard.displayName = "ProgramShareCard";

export default ProgramShareCard;
