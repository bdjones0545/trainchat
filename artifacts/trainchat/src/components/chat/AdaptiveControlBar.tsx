import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  ClipboardCheck,
  type LucideProps,
} from "lucide-react";

export type AdaptiveMode = "atlas" | "checkin";

interface ModeConfig {
  id: AdaptiveMode;
  label: string;
  icon: React.ComponentType<LucideProps>;
  description: string;
}

const MODES: ModeConfig[] = [
  {
    id: "atlas",
    label: "Atlas",
    icon: Bot,
    description: "Adaptive coaching chat",
  },
  {
    id: "checkin",
    label: "Check-In",
    icon: ClipboardCheck,
    description: "Readiness & recovery",
  },
];

interface AdaptiveControlBarProps {
  activeMode: AdaptiveMode;
  onModeChange: (mode: AdaptiveMode) => void;
  onOpenAtlasModal: () => void;
  onOpenCheckInModal: () => void;
  className?: string;
}

export default function AdaptiveControlBar({
  activeMode,
  onModeChange,
  onOpenAtlasModal,
  onOpenCheckInModal,
  className = "",
}: AdaptiveControlBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  function handlePillClick(modeId: AdaptiveMode) {
    onModeChange(modeId);
    if (modeId === "atlas") {
      onOpenAtlasModal();
    } else if (modeId === "checkin") {
      onOpenCheckInModal();
    }
  }

  return (
    <div
      ref={containerRef}
      className={`adaptive-control-bar-wrapper ${className}`}
      aria-label="Operating mode selector"
      role="tablist"
    >
      {/* Scrollable pill row */}
      <div className="adaptive-control-bar-scroll">
        <div className="adaptive-control-bar-inner">
          {MODES.map((mode) => {
            const isActive = activeMode === mode.id;
            const Icon = mode.icon;

            return (
              <motion.button
                key={mode.id}
                role="tab"
                aria-selected={isActive}
                aria-label={mode.description}
                onClick={() => handlePillClick(mode.id)}
                className={`adaptive-pill ${isActive ? "adaptive-pill--active" : "adaptive-pill--idle"}`}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                {/* Active background glow */}
                <AnimatePresence>
                  {isActive && (
                    <motion.span
                      key="active-bg"
                      className="adaptive-pill__glow-bg"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 400, damping: 28, duration: 0.25 }}
                    />
                  )}
                </AnimatePresence>

                {/* Animated border pulse for active pill */}
                {isActive && (
                  <motion.span
                    className="adaptive-pill__border-pulse"
                    animate={{ opacity: [0, 0.7, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 2.8,
                      delay: 1.2,
                      ease: "easeInOut",
                    }}
                  />
                )}

                <span className="adaptive-pill__content">
                  <Icon
                    className={`adaptive-pill__icon ${isActive ? "adaptive-pill__icon--active" : ""}`}
                    strokeWidth={isActive ? 2 : 1.6}
                  />
                  <span className={`adaptive-pill__label ${isActive ? "adaptive-pill__label--active" : ""}`}>
                    {mode.label}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
