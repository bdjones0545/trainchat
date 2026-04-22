import { forwardRef } from "react";

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

interface Props {
  card: ProgramCardData;
  focusMode?: "strength" | "speed" | "mobility";
}

const FOCUS_THEME = {
  strength: {
    accent: "#818cf8",
    gradientFrom: "#1e1b4b",
    gradientTo: "#0f0e1a",
    phaseBg: "#818cf820",
    phaseBorder: "#818cf840",
  },
  speed: {
    accent: "#fb923c",
    gradientFrom: "#2c1a0e",
    gradientTo: "#150d06",
    phaseBg: "#fb923c20",
    phaseBorder: "#fb923c40",
  },
  mobility: {
    accent: "#34d399",
    gradientFrom: "#052e16",
    gradientTo: "#021a0c",
    phaseBg: "#34d39920",
    phaseBorder: "#34d39940",
  },
};

const ProgramShareCard = forwardRef<HTMLDivElement, Props>(({ card, focusMode = "strength" }, ref) => {
  const theme = FOCUS_THEME[focusMode] ?? FOCUS_THEME.strength;
  const { accent, gradientFrom, gradientTo } = theme;

  return (
    <div
      ref={ref}
      style={{
        width: 320,
        background: `linear-gradient(155deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
        borderRadius: 20,
        padding: "26px 22px 22px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${accent}22`,
        boxSizing: "border-box",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}15 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -60,
          left: -60,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}08 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Brand bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <span style={{ color: "#ffffff", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em" }}>
          TRAINCHAT
        </span>
        <span
          style={{
            background: `${accent}18`,
            border: `1px solid ${accent}40`,
            color: accent,
            borderRadius: 100,
            padding: "3px 9px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.1em",
          }}
        >
          {focusMode.toUpperCase()}
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 21,
          fontWeight: 800,
          color: "#ffffff",
          lineHeight: 1.2,
          letterSpacing: "-0.025em",
          marginBottom: 5,
        }}
      >
        {card.title}
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 12,
          color: `${accent}cc`,
          fontWeight: 500,
          marginBottom: 18,
          letterSpacing: "0.01em",
        }}
      >
        {card.subtitle}
      </div>

      {/* Phases */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#ffffff40",
            letterSpacing: "0.12em",
            marginBottom: 7,
          }}
        >
          PROGRAM STRUCTURE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {card.phases.slice(0, 4).map((phase, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: accent,
                  opacity: 1 - i * 0.15,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: i === 0 ? "#ffffffdd" : "#ffffff88",
                  fontWeight: i === 0 ? 600 : 400,
                  letterSpacing: "0.01em",
                }}
              >
                {phase}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Day preview */}
      <div
        style={{
          background: "#ffffff06",
          border: `1px solid ${accent}22`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: "0 10px 10px 0",
          padding: "12px 13px",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: accent,
            letterSpacing: "0.08em",
            marginBottom: 9,
          }}
        >
          {card.dayPreview.title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {card.dayPreview.exercises.slice(0, 4).map((ex, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: "#ffffffbb",
                fontWeight: 400,
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  background: "#ffffff30",
                  flexShrink: 0,
                }}
              />
              {ex}
            </div>
          ))}
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: "0.01em",
          marginBottom: 16,
        }}
      >
        {card.tagline}
      </div>

      {/* Footer */}
      <div
        style={{
          paddingTop: 13,
          borderTop: "1px solid #ffffff0e",
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
          <span style={{ fontSize: 9, color: "#ffffff35", fontWeight: 600, letterSpacing: "0.08em" }}>
            AI COACHING
          </span>
        </div>
        <span style={{ fontSize: 9, color: "#ffffff25", fontWeight: 500 }}>
          trainchat.app
        </span>
      </div>
    </div>
  );
});

ProgramShareCard.displayName = "ProgramShareCard";

export default ProgramShareCard;
