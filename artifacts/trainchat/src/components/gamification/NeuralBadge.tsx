/**
 * NeuralBadge
 *
 * A compact consistency indicator in the TopNav.
 * Shows a subtle SVG ring representing training consistency — not a level.
 * Tapping opens the Neural System (BrainView) modal.
 *
 * Visible only for users who have logged at least one session.
 * Ring color reflects consistency: green → amber → red.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Activity } from "lucide-react";
import BrainView from "./BrainView";

interface NeuralProfileSummary {
  maturityLabel: string;
  maturityProgress: number;
  consistencyScore: number;
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

  const consistency = data.consistencyScore;

  // Ring color reflects consistency — no gamification
  const ringColor = consistency >= 70
    ? "rgba(34,197,94,0.75)"   // good consistency → green
    : consistency >= 40
    ? "rgba(245,158,11,0.75)"  // moderate → amber
    : "rgba(99,102,241,0.5)";  // early stage → muted primary

  const circumference = 2 * Math.PI * 11;
  const offset = circumference * (1 - consistency / 100);

  return (
    <>
      <button
        onClick={() => setShowBrainView(true)}
        className="flex items-center gap-1.5 group"
        title={`Neural System — ${data.maturityLabel}`}
      >
        {/* Consistency ring — no level number inside */}
        <div className="relative w-6 h-6">
          <svg viewBox="0 0 28 28" className="w-full h-full -rotate-90">
            <circle cx="14" cy="14" r="11" fill="none"
              stroke="rgba(99,102,241,0.1)" strokeWidth="2.5" />
            <circle cx="14" cy="14" r="11" fill="none"
              stroke={ringColor}
              strokeWidth="2.5"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{
                transition: "stroke-dashoffset 1s ease",
                filter: `drop-shadow(0 0 2px ${ringColor})`,
              }}
            />
          </svg>
          {/* Small center dot — no text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full" style={{ background: ringColor }} />
          </div>
        </div>
      </button>

      {showBrainView && <BrainView onClose={() => setShowBrainView(false)} />}
    </>
  );
}
