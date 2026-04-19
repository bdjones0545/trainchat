import { forwardRef } from "react";
import { Dumbbell, Zap, Trophy, ArrowRight, Activity, Target } from "lucide-react";
import type { ShareMoment, ShareMomentType } from "@/types/share-moments";

interface Props {
  moment: ShareMoment;
}

const TYPE_CONFIG: Record<ShareMomentType, {
  icon: typeof Dumbbell;
  label: string;
  accentColor: string;
  gradientFrom: string;
  gradientTo: string;
}> = {
  PROGRAM_GENERATED: {
    icon: Zap,
    label: "New Program",
    accentColor: "#00b4d8",
    gradientFrom: "#003566",
    gradientTo: "#001d3d",
  },
  AGENT_ADJUSTMENT: {
    icon: Activity,
    label: "AI Adjustment",
    accentColor: "#06d6a0",
    gradientFrom: "#004e3a",
    gradientTo: "#001d14",
  },
  BLOCK_COMPLETE: {
    icon: Trophy,
    label: "Block Complete",
    accentColor: "#ffd60a",
    gradientFrom: "#3d2b00",
    gradientTo: "#1a1200",
  },
  NEXT_BLOCK_READY: {
    icon: ArrowRight,
    label: "Next Phase",
    accentColor: "#00b4d8",
    gradientFrom: "#003566",
    gradientTo: "#001d3d",
  },
  SESSION_LOG_ADAPTATION: {
    icon: Activity,
    label: "AI Adapted",
    accentColor: "#06d6a0",
    gradientFrom: "#004e3a",
    gradientTo: "#001d14",
  },
  PROGRESS_MILESTONE: {
    icon: Target,
    label: "Milestone",
    accentColor: "#fb5607",
    gradientFrom: "#3d1500",
    gradientTo: "#1a0900",
  },
};

const ShareMomentCard = forwardRef<HTMLDivElement, Props>(({ moment }, ref) => {
  const config = TYPE_CONFIG[moment.type];
  const Icon = config.icon;
  const accent = config.accentColor;

  return (
    <div
      ref={ref}
      style={{
        width: 320,
        background: `linear-gradient(160deg, ${config.gradientFrom} 0%, ${config.gradientTo} 100%)`,
        borderRadius: 20,
        padding: "28px 24px 22px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${accent}22`,
        boxSizing: "border-box",
      }}
    >
      {/* Glow blob */}
      <div
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Top: brand + type badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <span style={{ color: "#ffffff", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
          TRAINCHAT
        </span>
        <span
          style={{
            background: `${accent}22`,
            border: `1px solid ${accent}55`,
            color: accent,
            borderRadius: 100,
            padding: "3px 10px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Icon size={9} strokeWidth={2.5} />
          {config.label.toUpperCase()}
        </span>
      </div>

      {/* Main headline */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          {moment.title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: `${accent}cc`,
            fontWeight: 500,
            marginTop: 5,
            lineHeight: 1.4,
          }}
        >
          {moment.subtitle}
        </div>
      </div>

      {/* Agent quote */}
      {moment.agentQuote && (
        <div
          style={{
            background: "#ffffff0a",
            border: `1px solid #ffffff12`,
            borderLeft: `3px solid ${accent}`,
            borderRadius: "0 8px 8px 0",
            padding: "10px 12px",
            marginTop: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#ffffff99",
              fontWeight: 500,
              letterSpacing: "0.04em",
              marginBottom: 4,
            }}
          >
            COACH
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#ffffffcc",
              fontWeight: 400,
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            "{moment.agentQuote}"
          </div>
        </div>
      )}

      {/* Metrics */}
      {moment.metrics.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: moment.agentQuote ? 0 : 18,
            flexWrap: "wrap",
          }}
        >
          {moment.metrics.slice(0, 3).map((metric, i) => (
            <div
              key={i}
              style={{
                background: "#ffffff08",
                border: "1px solid #ffffff14",
                borderRadius: 10,
                padding: "8px 12px",
                flex: "1 1 auto",
                minWidth: 80,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#ffffff",
                  lineHeight: 1,
                }}
              >
                {metric.value}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#ffffff55",
                  fontWeight: 500,
                  marginTop: 3,
                  letterSpacing: "0.05em",
                }}
              >
                {metric.label.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid #ffffff10",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 6px ${accent}`,
            }}
          />
          <span style={{ fontSize: 10, color: "#ffffff40", fontWeight: 600, letterSpacing: "0.06em" }}>
            AI COACHING
          </span>
        </div>
        <span style={{ fontSize: 10, color: "#ffffff30", fontWeight: 500 }}>
          trainchat.app
        </span>
      </div>
    </div>
  );
});

ShareMomentCard.displayName = "ShareMomentCard";

export default ShareMomentCard;
