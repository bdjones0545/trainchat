/**
 * AgentThinking — Conversational agent progress card.
 *
 * Design goals:
 *  - Mode derived from real actionType + safetyMode — never fabricated.
 *  - Stage checklist with completed ✓ / active ● / pending ○ states.
 *  - Feedback line combines stageNarration + microReason via combineNarrationAndReasons().
 *  - Max 1 microReason per stage, max 3 per stream. No duplicates. No internal terms.
 *  - Failure states show honest coach-voiced messages.
 *  - Mobile-first, compact, no layout jumps, no scrolling.
 */

import { useRef } from "react";
import type { BuildStage } from "@/hooks/useStreamMessage";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";
import { LaserScanLine, ArchitectPlanningDot } from "@/components/laser-skill";

// ─── Modal Mode ───────────────────────────────────────────────────────────────

export type AgentMode =
  | "BUILD"
  | "UPDATE"
  | "GUIDANCE"
  | "PAIN_OR_SAFETY"
  | "REBUILD";

interface ModeConfig {
  header: string;
  subheader: string;
}

const MODE_CONFIG: Record<AgentMode, ModeConfig> = {
  BUILD: {
    header: "Building your training system",
    subheader: "Creating your program",
  },
  UPDATE: {
    header: "Updating your program",
    subheader: "Applying your adjustment",
  },
  GUIDANCE: {
    header: "Thinking through your question",
    subheader: "No program changes yet",
  },
  PAIN_OR_SAFETY: {
    header: "Adjusting with care",
    subheader: "Keeping the session useful and joint-friendly",
  },
  REBUILD: {
    header: "Rebuilding your training system",
    subheader: "Creating a new structure",
  },
};

function deriveMode(actionType?: string, safetyMode?: boolean): AgentMode {
  if (safetyMode) return "PAIN_OR_SAFETY";
  switch (actionType) {
    case "PROGRAM_GENERATION":
      return "BUILD";
    case "STRUCTURAL_REBUILD":
    case "REBUILD_PROGRAM":
      return "REBUILD";
    case "DIRECT_MUTATION":
    case "SESSION_ADJUSTMENT":
    case "APPLY_MUTATION":
      return "UPDATE";
    case "GUIDANCE":
    case "ASK_CLARIFICATION":
    case "NO_OP":
      return "GUIDANCE";
    default:
      return "BUILD";
  }
}

// ─── Step sequences (tied to real BuildStage pipeline) ────────────────────────

interface BuildStep {
  stage: BuildStage;
  label: string;
}

const STEP_SEQUENCES: Record<string, BuildStep[]> = {
  PROGRAM_GENERATION: [
    { stage: "understanding", label: "Understanding your goal" },
    { stage: "classifying",   label: "Choosing the right structure" },
    { stage: "planning",      label: "Mapping weekly layout" },
    { stage: "applying",      label: "Selecting exercises" },
    { stage: "validating",    label: "Checking constraints" },
    { stage: "saving",        label: "Saving your program" },
  ],
  STRUCTURAL_REBUILD: [
    { stage: "understanding", label: "Understanding your request" },
    { stage: "planning",      label: "Restructuring your split" },
    { stage: "applying",      label: "Rebuilding your program" },
    { stage: "saving",        label: "Saving updates" },
  ],
  REBUILD_PROGRAM: [
    { stage: "understanding", label: "Understanding your request" },
    { stage: "planning",      label: "Restructuring your split" },
    { stage: "applying",      label: "Rebuilding your program" },
    { stage: "saving",        label: "Saving updates" },
  ],
  DIRECT_MUTATION: [
    { stage: "applying", label: "Applying the change" },
    { stage: "saving",   label: "Saving updates" },
  ],
  SESSION_ADJUSTMENT: [
    { stage: "applying", label: "Applying modifications" },
    { stage: "saving",   label: "Saving updates" },
  ],
  APPLY_MUTATION: [
    { stage: "understanding", label: "Understanding your request" },
    { stage: "applying",      label: "Updating your program" },
    { stage: "saving",        label: "Saving updates" },
  ],
  GUIDANCE: [
    { stage: "understanding", label: "Reviewing your question" },
    { stage: "classifying",   label: "Organizing the key factors" },
    { stage: "applying",      label: "Preparing the best answer" },
  ],
  ASK_CLARIFICATION: [
    { stage: "understanding", label: "Reviewing your request" },
    { stage: "applying",      label: "Working out what to ask" },
  ],
  NO_OP: [
    { stage: "understanding", label: "Reading your message" },
    { stage: "applying",      label: "Preparing a response" },
  ],
};

const DEFAULT_STEPS: BuildStep[] = [
  { stage: "understanding", label: "Understanding your request" },
  { stage: "applying",      label: "Working on a response" },
];

const STAGE_ORDER: Record<BuildStage, number> = {
  understanding: 1,
  loading:       1.5,
  classifying:   2,
  planning:      3,
  applying:      4,
  validating:    5,
  saving:        6,
  complete:      7,
};

// ─── Step status ──────────────────────────────────────────────────────────────

type StepStatus = "completed" | "active" | "pending";

function getStepStatus(
  stepIndex: number,
  steps: BuildStep[],
  currentStage: BuildStage | null,
): StepStatus {
  if (!currentStage) {
    return "pending";
  }
  const step = steps[stepIndex];
  const nextStep = steps[stepIndex + 1];
  const currentOrder = STAGE_ORDER[currentStage];
  const stepOrder    = STAGE_ORDER[step.stage];
  const nextOrder    = nextStep ? STAGE_ORDER[nextStep.stage] : 8;
  if (currentOrder >= nextOrder) return "completed";
  if (currentOrder >= stepOrder) return "active";
  return "pending";
}

// ─── Feedback line combiner ───────────────────────────────────────────────────

/**
 * Combines the current stage narration and a single micro-reason into
 * one coach-voiced feedback line. Pure function — no internal terms, no jargon.
 */
export function combineNarrationAndReasons({
  stageNarration,
  microReason,
}: {
  stageNarration?: string;
  microReason?: string;
}): string {
  const narration = stageNarration?.trim();
  const reason    = microReason?.trim();
  if (narration && reason) return `${narration} — ${reason}`;
  if (narration) return narration;
  if (reason) return reason;
  return "Working through your request\u2026";
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function StepRow({ label, status }: { label: string; status: StepStatus }) {
  if (status === "completed") {
    return (
      <div className="flex items-center gap-2.5 animate-in fade-in duration-200">
        <div className="w-3.5 h-3.5 rounded-full bg-primary/12 border border-primary/25 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 10 10" className="w-2 h-2 text-primary/60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        </div>
        <span className="text-[11px] text-muted-foreground/50 leading-snug">{label}</span>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="flex items-center gap-2.5 animate-in fade-in duration-150">
        <div
          className="w-3.5 h-3.5 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center flex-shrink-0"
          style={{ animation: "ping-soft 1.6s ease-in-out infinite" }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        </div>
        <span className="text-[11px] text-primary font-medium leading-snug">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-3.5 h-3.5 rounded-full border border-border/30 flex-shrink-0" />
      <span className="text-[11px] text-muted-foreground/30 leading-snug">{label}</span>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  acknowledgment?: string;
  buildStage: BuildStage | null;
  stageLabel: string;
  stageHistory: string[];
  actionType?: string;
  /** Coach-voiced narration for the active stage — from server SSE. */
  stageNarration?: string;
  /** Pre-computed micro-reasons from persisted constraints — max 3, already safe-to-show. */
  microReasons?: string[];
  /** True when the turn involves pain/safety constraints. */
  safetyMode?: boolean;
  /** True when the stream ended with a verification failure. */
  verificationFailed?: boolean;
  /** True when the stream ended with a generic failure. */
  streamFailed?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentThinking({
  acknowledgment,
  buildStage,
  actionType,
  stageNarration,
  microReasons = [],
  safetyMode = false,
  verificationFailed = false,
  streamFailed = false,
}: Props) {
  const steps = STEP_SEQUENCES[actionType ?? ""] ?? DEFAULT_STEPS;
  const mode = deriveMode(actionType, safetyMode);
  const { header, subheader } = MODE_CONFIG[mode];
  const isActiveStage = buildStage !== null && buildStage !== "complete";

  // Track which micro-reasons have been consumed — one per completed/active stage.
  // usedCountRef advances each time the active stage changes, revealing the next reason.
  const usedCountRef = useRef<number>(0);
  const prevStageRef = useRef<BuildStage | null>(null);
  if (buildStage !== prevStageRef.current) {
    prevStageRef.current = buildStage;
    if (buildStage && buildStage !== "complete") {
      usedCountRef.current = Math.min(usedCountRef.current + 1, microReasons.length);
    }
  }
  // Show the most recently "unlocked" reason (index = usedCountRef - 1)
  const currentMicroReason =
    usedCountRef.current > 0 ? microReasons[usedCountRef.current - 1] : undefined;

  const feedbackLine = combineNarrationAndReasons({
    stageNarration,
    microReason: currentMicroReason,
  });

  return (
    <div className="flex items-start gap-3 mb-4" data-testid="agent-thinking-card">
      <style>{`
        @keyframes ping-soft {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 99 102 241) / 0); }
          50%       { box-shadow: 0 0 0 3px rgba(var(--primary-rgb, 99 102 241) / 0.18); }
        }
        @keyframes logo-breathe {
          0%, 100% { opacity: 0.75; filter: brightness(1); }
          50%       { opacity: 1;    filter: brightness(1.15); }
        }
        @keyframes card-glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 99 102 241) / 0); }
          50%       { box-shadow: 0 0 12px 0 rgba(var(--primary-rgb, 99 102 241) / 0.09); }
        }
      `}</style>

      {/* Agent avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/8 border border-primary/15 flex items-center justify-center mt-0.5 flex-col overflow-hidden">
        <img
          src={trainChatLogo}
          alt=""
          className="w-4 h-4 object-contain"
          style={{
            animation: isActiveStage ? "logo-breathe 2s ease-in-out infinite" : undefined,
          }}
        />
      </div>

      {/* Card */}
      <div
        className="bg-card border border-border/80 rounded-2xl rounded-tl-sm overflow-hidden max-w-[280px] w-full relative"
        style={{
          animation: isActiveStage ? "card-glow-pulse 2.4s ease-in-out infinite" : undefined,
          borderColor: isActiveStage ? "rgba(var(--primary-rgb, 99 102 241) / 0.22)" : undefined,
        }}
      >
        <LaserScanLine active={isActiveStage} stage={buildStage} containerHeight={180} />
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-4 pt-3 pb-2.5 flex items-start gap-2.5">
          <div className="relative flex-shrink-0 mt-0.5">
            {isActiveStage && (
              <div
                className="absolute inset-0 rounded-full bg-primary/20 blur-[4px]"
                style={{ animation: "logo-breathe 1.8s ease-in-out infinite" }}
              />
            )}
            <img
              src={trainChatLogo}
              alt=""
              className="relative w-4 h-4 object-contain"
            />
          </div>

          <div className="min-w-0">
            <p
              className="text-[12px] font-semibold text-foreground leading-none"
              data-testid="agent-thinking-header"
            >
              {header}
            </p>
            <p
              className="text-[10px] text-muted-foreground/60 mt-0.5 leading-snug"
              data-testid="agent-thinking-subheader"
            >
              {subheader}
            </p>
            {acknowledgment && (
              <p className="text-[10px] text-muted-foreground/50 mt-1 leading-snug line-clamp-2">
                {acknowledgment}
              </p>
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="mx-4 border-t border-border/40 mb-2.5" />

        {/* ── Step checklist ───────────────────────────────────────────────── */}
        <div className="px-4 pb-3 space-y-2.5" data-testid="agent-thinking-steps">
          {steps.map((step, i) => (
            <StepRow
              key={step.stage + i}
              label={step.label}
              status={getStepStatus(i, steps, buildStage)}
            />
          ))}
          {isActiveStage && (
            <div className="pt-0.5">
              <ArchitectPlanningDot stage={buildStage} />
            </div>
          )}
        </div>

        {/* ── Failure states ───────────────────────────────────────────────── */}
        {verificationFailed && (
          <div
            className="mx-4 mb-3.5 border-t border-border/30 pt-2.5 animate-in fade-in duration-300"
            data-testid="agent-thinking-verification-failed"
          >
            <p className="text-[10.5px] text-amber-600 dark:text-amber-400 leading-snug">
              I caught a mismatch before saving, so I'm not going to pretend it updated.
            </p>
          </div>
        )}
        {streamFailed && !verificationFailed && (
          <div
            className="mx-4 mb-3.5 border-t border-border/30 pt-2.5 animate-in fade-in duration-300"
            data-testid="agent-thinking-stream-failed"
          >
            <p className="text-[10.5px] text-muted-foreground/70 leading-snug">
              I couldn't finish that update cleanly. Try again or ask me to simplify the change.
            </p>
          </div>
        )}

        {/* ── Feedback line (narration + micro-reason) ─────────────────────── */}
        {isActiveStage && !verificationFailed && !streamFailed && (
          <div
            className="mx-4 mb-3.5 border-t border-border/30 pt-2.5 animate-in fade-in duration-300"
            key={feedbackLine}
            data-testid="agent-thinking-feedback"
          >
            <p className="text-[10.5px] text-muted-foreground/70 leading-snug italic">
              {feedbackLine}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
