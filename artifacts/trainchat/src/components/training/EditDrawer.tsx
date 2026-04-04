/**
 * EditDrawer — Phase A: Collaborative Decision Layer
 *
 * Multi-phase interaction:
 *   1. Input       — user describes what they want
 *   2. Directions  — AI presents 2-4 coach-curated direction cards
 *   3. Executing   — AI applies the chosen direction
 *   4. Success     — change summary
 *
 * Highly specific requests (e.g. "swap bench for dumbbell") skip Phase 2 and
 * execute directly.
 */

import { useState, useRef, useEffect } from "react";
import {
  X,
  Dumbbell,
  Calendar,
  Layers,
  BarChart3,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Clock,
  MessageCircle,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditTargetType = "exercise" | "session" | "week" | "phase" | "system";

export interface EditTarget {
  type: EditTargetType;
  id: number;
  label: string;
  parentLabel?: string;
}

export interface ChangedIds {
  exercises: number[];
  sessions: number[];
  weeks: number[];
  phases: number[];
}

export interface EditResult {
  intent: string;
  scope: string;
  changeSummary: string;
  appliedCount: number;
  skippedCount: number;
  changedIds: ChangedIds;
  updatedData: { today: any; week: any; block: any };
  changeLogId?: number;
}

export interface DirectionOption {
  id: string;
  label: string;
  whatWillChange: string;
  whyItMatters: string;
  editRequest: string;
}

export interface DirectionsResponse {
  shouldSkipDirections: boolean;
  coachMessage?: string;
  directions?: DirectionOption[];
  directEditRequest?: string;
}

interface EditDrawerProps {
  target: EditTarget;
  onClose: () => void;
  onEditComplete: (result: EditResult) => void;
  prefillRequest?: string;
}

type DrawerPhase = "input" | "directions" | "executing" | "success" | "error";

// ─── Contextual Suggestions ───────────────────────────────────────────────────

const SUGGESTIONS: Record<EditTargetType, string[]> = {
  exercise: [
    "Swap this exercise",
    "Easier variation",
    "Harder variation",
    "Change the rep range",
    "Add a set",
    "Remove a set",
    "Make it shoulder-friendly",
    "Add explosive cue",
  ],
  session: [
    "Shorten this session",
    "Lower the volume",
    "Recovery emphasis",
    "Equipment-friendly version",
    "More explosive work",
    "More athletic emphasis",
    "Reduce fatigue on this day",
  ],
  week: [
    "Make this a deload week",
    "Increase intensity",
    "Reduce overall fatigue",
    "Travel / minimal equipment mode",
    "Add more volume",
    "Less volume this week",
  ],
  phase: [
    "More power-focused",
    "Shift toward hypertrophy",
    "Field-sport emphasis",
    "General fitness bias",
    "More variety",
    "Shorter block",
  ],
  system: [
    "Reduce overall volume",
    "Increase training intensity",
    "Make it a deload week",
    "Modify for injury",
    "Swap all heavy compound lifts",
    "Simplify the schedule",
  ],
};

// ─── Target header config ─────────────────────────────────────────────────────

const TARGET_CONFIG: Record<
  EditTargetType,
  { icon: React.ElementType; label: string; color: string; bg: string; border: string }
> = {
  exercise: {
    icon: Dumbbell,
    label: "Exercise",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/20",
  },
  session: {
    icon: Layers,
    label: "Session",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  week: {
    icon: Calendar,
    label: "Week",
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-400/20",
  },
  phase: {
    icon: BarChart3,
    label: "Block",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    border: "border-purple-400/20",
  },
  system: {
    icon: Sparkles,
    label: "System",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
};

// Direction card colors (cycle through)
const DIRECTION_COLORS = [
  { accent: "text-primary", bg: "bg-primary/8", border: "border-primary/25", hover: "hover:border-primary/60 hover:bg-primary/12" },
  { accent: "text-orange-400", bg: "bg-orange-400/8", border: "border-orange-400/25", hover: "hover:border-orange-400/60 hover:bg-orange-400/12" },
  { accent: "text-green-400", bg: "bg-green-400/8", border: "border-green-400/25", hover: "hover:border-green-400/60 hover:bg-green-400/12" },
  { accent: "text-purple-400", bg: "bg-purple-400/8", border: "border-purple-400/25", hover: "hover:border-purple-400/60 hover:bg-purple-400/12" },
];

// ─── API calls ────────────────────────────────────────────────────────────────

async function fetchDirections(
  request: string,
  target: EditTarget
): Promise<DirectionsResponse> {
  return customFetch<DirectionsResponse>("/api/training-system/directions", {
    method: "POST",
    body: JSON.stringify({
      request,
      targetContext: {
        type: target.type,
        id: target.id,
        label: target.label,
        parentLabel: target.parentLabel,
      },
    }),
  });
}

async function submitTargetedEdit(
  request: string,
  target: EditTarget
): Promise<EditResult> {
  return customFetch<EditResult>("/api/training-system/edit", {
    method: "POST",
    body: JSON.stringify({
      request,
      targetContext: {
        type: target.type,
        id: target.id,
        label: target.label,
        parentLabel: target.parentLabel,
      },
    }),
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditDrawer({ target, onClose, onEditComplete, prefillRequest }: EditDrawerProps) {
  const [input, setInput] = useState(prefillRequest ?? "");
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<DrawerPhase>("input");
  const [directions, setDirections] = useState<DirectionsResponse | null>(null);
  const [editResult, setEditResult] = useState<EditResult | null>(null);
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const config = TARGET_CONFIG[target.type];
  const Icon = config.icon;
  const suggestions = SUGGESTIONS[target.type];

  // Animate in
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Focus textarea when in input phase
  useEffect(() => {
    if (visible && phase === "input") {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [visible, phase]);

  // ── Directions fetch mutation ──
  const directionsMutation = useMutation({
    mutationFn: (request: string) => fetchDirections(request, target),
    onSuccess: (data) => {
      if (data.shouldSkipDirections) {
        // Go straight to execution
        setPhase("executing");
        editMutation.mutate(data.directEditRequest ?? input.trim());
      } else {
        setDirections(data);
        setPhase("directions");
      }
    },
    onError: () => {
      setErrorMsg("Something went wrong. Please try again.");
      setPhase("error");
    },
  });

  // ── Edit execution mutation ──
  const editMutation = useMutation({
    mutationFn: (request: string) => submitTargetedEdit(request, target),
    onSuccess: (data) => {
      setEditResult(data);
      setPhase("success");
      // Notify parent after a short delay so user sees success state
      setTimeout(() => onEditComplete(data), 800);
    },
    onError: () => {
      setErrorMsg("The edit could not be applied. Please try again.");
      setPhase("error");
    },
  });

  function animateClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) animateClose();
  }

  // Step 1: user submits their request → fetch directions
  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || directionsMutation.isPending) return;
    setErrorMsg(null);
    setPhase("executing"); // show loading state immediately
    directionsMutation.mutate(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") animateClose();
  }

  function handleSuggestion(text: string) {
    setInput(text);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // Step 2: user picks a direction → execute edit
  function handleSelectDirection(direction: DirectionOption) {
    setSelectedDirectionId(direction.id);
    setPhase("executing");
    editMutation.mutate(direction.editRequest);
  }

  function handleBackToInput() {
    setPhase("input");
    setDirections(null);
    setSelectedDirectionId(null);
    setErrorMsg(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: visible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)",
        transition: "background 0.3s ease",
      }}
    >
      <div
        className="w-full max-w-2xl bg-background border border-border rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "88vh",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* Back button — visible on directions phase */}
              {phase === "directions" && (
                <button
                  onClick={handleBackToInput}
                  className="w-10 h-10 rounded-xl bg-muted/60 border border-border flex items-center justify-center flex-shrink-0 mt-0.5 hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                </button>
              )}

              {phase !== "directions" && (
                <div className={`w-10 h-10 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.bg} ${config.border} ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {phase === "directions" ? "Choose Direction" : "Edit with Coach"}
                  </span>
                </div>
                <h3 className="font-bold text-base text-foreground leading-tight truncate">
                  {target.label}
                </h3>
                {target.parentLabel && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    in {target.parentLabel}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={animateClose}
              className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0 hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* ── Phase: Input ────────────────────────────────────────── */}
        {phase === "input" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Suggestions */}
            <div className="px-5 pt-4 pb-3 flex-shrink-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                Quick Actions
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="flex-shrink-0 text-xs bg-muted/50 text-muted-foreground border border-border rounded-lg px-3 py-2 hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-150"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mx-5 border-t border-border flex-shrink-0" />

            {/* Text input */}
            <div className="px-5 pt-4 pb-6 flex-shrink-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                Custom Request
              </p>
              <div className="flex gap-2.5 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Tell your coach what to change about this ${target.type}…`}
                  rows={3}
                  className="flex-1 bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 focus:bg-muted/50 transition-all duration-150"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:bg-primary/90 active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: Directions ───────────────────────────────────── */}
        {phase === "directions" && directions && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Memory callout — subtle reference to past decisions */}
            {directions.memoryCallout && (
              <div className="mx-5 mt-4 mb-0 flex items-start gap-2.5 bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
                <Clock className="w-3.5 h-3.5 text-primary/60 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-primary/80 leading-relaxed italic">
                  {directions.memoryCallout}
                </p>
              </div>
            )}

            {/* Coach message */}
            {directions.coachMessage && (
              <div className="px-5 pt-4 pb-3 flex-shrink-0">
                <p className="text-sm text-foreground/80 leading-relaxed font-medium">
                  {directions.coachMessage}
                </p>
              </div>
            )}

            {/* Direction cards */}
            <div className="px-5 pb-4 flex flex-col gap-3">
              {(directions.directions ?? []).map((dir, i) => {
                const colors = DIRECTION_COLORS[i % DIRECTION_COLORS.length];
                return (
                  <button
                    key={dir.id}
                    onClick={() => handleSelectDirection(dir)}
                    className={`w-full text-left rounded-2xl border p-4 transition-all duration-150 active:scale-[0.98] ${colors.border} ${colors.bg} ${colors.hover}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Letter badge */}
                        <div className={`w-7 h-7 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <span className={`text-xs font-bold ${colors.accent}`}>{dir.id}</span>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-bold mb-1 ${colors.accent}`}>{dir.label}</p>
                          <p className="text-xs text-foreground/80 leading-relaxed mb-1.5">
                            {dir.whatWillChange}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {dir.whyItMatters}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 ${colors.accent} opacity-60`} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Continuity prompt — coach check-in question */}
            {directions.continuityPrompt && (
              <div className="mx-5 mb-6 mt-1">
                <div className="flex items-start gap-2.5 bg-muted/40 border border-border rounded-xl px-4 py-3">
                  <MessageCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    {directions.continuityPrompt}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Phase: Executing ────────────────────────────────────── */}
        {phase === "executing" && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-5">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
              </div>
              <div className="absolute inset-0 rounded-full border border-primary/30 animate-ping" />
            </div>
            <div className="text-center">
              <p className="font-bold text-foreground text-base mb-1.5">
                {directionsMutation.isPending
                  ? "Thinking through the best directions…"
                  : "Applying your choice…"}
              </p>
              <p className="text-sm text-muted-foreground">
                {directionsMutation.isPending
                  ? "Let's figure out what makes the most sense here"
                  : "Your coach is making the update now"}
              </p>
            </div>
          </div>
        )}

        {/* ── Phase: Success ──────────────────────────────────────── */}
        {phase === "success" && editResult && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <p className="font-bold text-foreground text-base mb-2">Done</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                {editResult.changeSummary}
              </p>
            </div>
            {editResult.appliedCount > 0 && (
              <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/15 rounded-lg px-4 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-green-400">
                  {editResult.appliedCount} change{editResult.appliedCount !== 1 ? "s" : ""} applied
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Phase: Error ────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="font-bold text-foreground text-base mb-2">Something went wrong</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                {errorMsg ?? "Please try again."}
              </p>
            </div>
            <button
              onClick={handleBackToInput}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
