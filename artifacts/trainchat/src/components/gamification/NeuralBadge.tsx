/**
 * NeuralBadge
 *
 * Compact level indicator rendered in the TopNav beside the streak badge.
 * Tapping opens the full BrainView modal.
 *
 * Only rendered for authenticated premium users who have a neural profile.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import BrainView from "./BrainView";

interface NeuralProfileSummary {
  level: number;
  xpProgressPercent: number;
  consistencyScore: number;
  levelLabel: string;
  totalSessionsCompleted: number;
}

interface Props {
  isPremium?: boolean;
}

export default function NeuralBadge({ isPremium = false }: Props) {
  const [showBrainView, setShowBrainView] = useState(false);

  const { data } = useQuery<NeuralProfileSummary>({
    queryKey: ["neural-profile"],
    queryFn: () => customFetch<NeuralProfileSummary>("/api/neural-profile"),
    enabled: isPremium,
    staleTime: 60000,
  });

  if (!isPremium || !data || data.totalSessionsCompleted < 1) return null;

  const level = data.level;
  const progress = data.xpProgressPercent;

  // Color by level
  const ringColor = level >= 15
    ? "rgba(245,158,11,0.8)"
    : level >= 10
    ? "rgba(168,85,247,0.8)"
    : level >= 5
    ? "rgba(99,102,241,0.8)"
    : "rgba(99,102,241,0.5)";

  return (
    <>
      <button
        onClick={() => setShowBrainView(true)}
        className="flex items-center gap-1.5 group"
        title={`Level ${level} — ${data.levelLabel}`}
      >
        {/* Progress ring badge */}
        <div className="relative w-7 h-7">
          <svg viewBox="0 0 28 28" className="w-full h-full -rotate-90">
            <circle
              cx="14" cy="14" r="11"
              fill="none"
              stroke="rgba(99,102,241,0.12)"
              strokeWidth="2.5"
            />
            <circle
              cx="14" cy="14" r="11"
              fill="none"
              stroke={ringColor}
              strokeWidth="2.5"
              strokeDasharray={`${2 * Math.PI * 11}`}
              strokeDashoffset={`${2 * Math.PI * 11 * (1 - progress / 100)}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 3px ${ringColor})` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] font-black text-foreground leading-none">{level}</span>
          </div>
        </div>
      </button>

      {showBrainView && <BrainView onClose={() => setShowBrainView(false)} />}
    </>
  );
}
