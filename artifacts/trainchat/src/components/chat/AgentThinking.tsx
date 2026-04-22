/**
 * AgentThinking — Premium in-place build progress card.
 *
 * Design goals:
 *  - Single card that updates in-place (not multiple bubbles)
 *  - TrainChat logo as the visual core with subtle glow pulse
 *  - Full step list visible upfront: completed ✓ | active ● | pending ○
 *  - Fast builds: card still feels smooth even if only 1–2 steps show
 *  - Mobile-first, compact, no layout jumps
 *
 * Steps are derived from the REAL pipeline stages — no fake delays,
 * no invented stages. Every step maps to an actual server BuildStage.
 *
 * Action type mapping:
 *   Build:   PROGRAM_GENERATION, STRUCTURAL_REBUILD, REBUILD_PROGRAM
 *   Edit:    DIRECT_MUTATION, SESSION_ADJUSTMENT, APPLY_MUTATION
 *   Q&A:     GUIDANCE
 *   Other:   ASK_CLARIFICATION, NO_OP
 *
 * The UI state must always match the actual server action — never show
 * program-build copy for question-answering or editing.
 */

import type { BuildStage } from "@/hooks/useStreamMessage";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

// ─── Step sequences (tied to real BuildStage pipeline) ────────────────────────
//
// Each action type maps to a curated subset of stages with accurate microcopy.
// "loading" is intentionally omitted from most sequences — it's a server-internal
// transition that would look like a duplicate of "understanding" to the user.
//
// IMPORTANT: Non-build actions (GUIDANCE, ASK_CLARIFICATION, NO_OP) must NEVER
// show steps like "Saving your program" or "Assigning sessions & exercises".

interface BuildStep {
  stage: BuildStage;
  label: string;
}

const STEP_SEQUENCES: Record<string, BuildStep[]> = {

  // ── Program BUILD actions ─────────────────────────────────────────────────
  // Full build: new program from scratch.
  PROGRAM_GENERATION: [
    { stage: "understanding", label: "Reading your goal" },
    { stage: "classifying",   label: "Selecting block type" },
    { stage: "planning",      label: "Mapping weekly structure" },
    { stage: "applying",      label: "Assigning sessions & exercises" },
    { stage: "validating",    label: "Validating your system" },
    { stage: "saving",        label: "Finalizing your program" },
  ],
  // Legacy: full architectural restructure.
  STRUCTURAL_REBUILD: [
    { stage: "understanding", label: "Reading your request" },
    { stage: "planning",      label: "Restructuring your split" },
    { stage: "applying",      label: "Rebuilding your program" },
    { stage: "saving",        label: "Saving your program" },
  ],
  // New execPlan action: structural rebuild.
  REBUILD_PROGRAM: [
    { stage: "understanding", label: "Reading your request" },
    { stage: "planning",      label: "Restructuring your split" },
    { stage: "applying",      label: "Rebuilding your program" },
    { stage: "saving",        label: "Saving your program" },
  ],

  // ── Program EDIT actions ──────────────────────────────────────────────────
  // Legacy: atomic surgical edit.
  DIRECT_MUTATION: [
    { stage: "applying", label: "Applying the change" },
    { stage: "saving",   label: "Saving your changes" },
  ],
  // Legacy: session-scoped adjustment.
  SESSION_ADJUSTMENT: [
    { stage: "applying", label: "Applying modifications" },
    { stage: "saving",   label: "Saving your changes" },
  ],
  // New execPlan action: targeted edit or adjustment.
  APPLY_MUTATION: [
    { stage: "understanding", label: "Reading your request" },
    { stage: "applying",      label: "Updating your program" },
    { stage: "saving",        label: "Saving your changes" },
  ],

  // ── Q&A / GUIDANCE actions ────────────────────────────────────────────────
  // Coaching questions, explanations, general advice — no program mutation.
  GUIDANCE: [
    { stage: "understanding", label: "Reviewing your question" },
    { stage: "classifying",   label: "Organizing the key factors" },
    { stage: "applying",      label: "Preparing the best answer" },
  ],

  // ── Clarification ─────────────────────────────────────────────────────────
  ASK_CLARIFICATION: [
    { stage: "understanding", label: "Reviewing your request" },
    { stage: "applying",      label: "Working out what to ask" },
  ],

  // ── No-op / general chat ──────────────────────────────────────────────────
  NO_OP: [
    { stage: "understanding", label: "Reading your message" },
    { stage: "applying",      label: "Preparing a response" },
  ],
};

// Default steps used only when actionType is unknown/unresolved.
// Intentionally neutral — no program-build language.
const DEFAULT_STEPS: BuildStep[] = [
  { stage: "understanding", label: "Reading your request" },
  { stage: "applying",      label: "Working on a response" },
];

// Numeric priority for each BuildStage — used for completed/active/pending math
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

// ─── Card title per action type ───────────────────────────────────────────────

function getCardTitle(actionType?: string): string {
  switch (actionType) {
    // Build
    case "PROGRAM_GENERATION": return "Building your system";
    case "STRUCTURAL_REBUILD":  return "Rebuilding your program";
    case "REBUILD_PROGRAM":     return "Rebuilding your program";
    // Edit
    case "DIRECT_MUTATION":     return "Applying your change";
    case "SESSION_ADJUSTMENT":  return "Modifying your session";
    case "APPLY_MUTATION":      return "Updating your program";
    // Q&A / Guidance
    case "GUIDANCE":            return "Thinking it through";
    // Clarification
    case "ASK_CLARIFICATION":   return "One quick question";
    // No-op
    case "NO_OP":               return "Working on it";
    // Unknown — neutral default, never shows program-build language
    default:                    return "Working on it";
  }
}

// ─── Step status logic ────────────────────────────────────────────────────────

type StepStatus = "completed" | "active" | "pending";

function getStepStatus(
  stepIndex: number,
  steps: BuildStep[],
  currentStage: BuildStage | null,
): StepStatus {
  if (!currentStage) {
    return stepIndex === 0 ? "active" : "pending";
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
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentThinking({
  acknowledgment,
  buildStage,
  actionType,
}: Props) {
  const steps = STEP_SEQUENCES[actionType ?? ""] ?? DEFAULT_STEPS;
  const title = getCardTitle(actionType);
  const isActiveStage = buildStage !== null && buildStage !== "complete";

  return (
    <div className="flex items-start gap-3 mb-4">
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

      {/* Single in-place card */}
      <div
        className="bg-card border border-border/80 rounded-2xl rounded-tl-sm overflow-hidden max-w-[270px] w-full"
        style={{
          animation: isActiveStage ? "card-glow-pulse 2.4s ease-in-out infinite" : undefined,
          borderColor: isActiveStage ? "rgba(var(--primary-rgb, 99 102 241) / 0.22)" : undefined,
        }}
      >
        {/* Card header */}
        <div className="px-4 pt-3 pb-2.5 flex items-start gap-2.5">
          {/* Logo with ambient glow */}
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
            <p className="text-[12px] font-semibold text-foreground leading-none">{title}</p>
            {acknowledgment && (
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2">
                {acknowledgment}
              </p>
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="mx-4 border-t border-border/40 mb-2.5" />

        {/* Step list */}
        <div className="px-4 pb-3.5 space-y-2.5">
          {steps.map((step, i) => (
            <StepRow
              key={step.stage + i}
              label={step.label}
              status={getStepStatus(i, steps, buildStage)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
