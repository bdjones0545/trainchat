/**
 * EditDrawer — Phase 3
 *
 * A bottom-sheet edit interface that appears when the user triggers an
 * AI-assisted edit from any level of the training system (exercise, session,
 * week, phase). Passes explicit targetContext to the backend for focused edits.
 */

import { useState, useRef, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type EditTargetType = "exercise" | "session" | "week" | "phase";

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
}

interface EditDrawerProps {
  target: EditTarget;
  onClose: () => void;
  onEditComplete: (result: EditResult) => void;
  prefillRequest?: string;
}

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
};

// ─── API ─────────────────────────────────────────────────────────────────────

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

  // Focus textarea after animation
  useEffect(() => {
    if (visible) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [visible]);

  const editMutation = useMutation({
    mutationFn: (request: string) => submitTargetedEdit(request, target),
    onSuccess: (data) => {
      onEditComplete(data);
      animateClose();
    },
  });

  function animateClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) animateClose();
  }

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || editMutation.isPending || editMutation.isSuccess) return;
    editMutation.mutate(trimmed);
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

  const isPending = editMutation.isPending;
  const isSuccess = editMutation.isSuccess;
  const isError = editMutation.isError;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: visible ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)", transition: "background 0.3s ease" }}
    >
      <div
        className="w-full max-w-2xl bg-background border border-border rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "85vh",
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
              <div className={`w-10 h-10 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon className={`w-5 h-5 ${config.color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.bg} ${config.border} ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Edit with Coach
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

        {/* Success state */}
        {isSuccess && editMutation.data && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <p className="font-bold text-foreground text-base mb-2">System Updated</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                {editMutation.data.changeSummary}
              </p>
            </div>
            {editMutation.data.appliedCount > 0 && (
              <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/15 rounded-lg px-4 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-green-400">
                  {editMutation.data.appliedCount} change{editMutation.data.appliedCount !== 1 ? "s" : ""} applied
                </span>
              </div>
            )}
          </div>
        )}

        {/* Input state */}
        {!isSuccess && (
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
                    disabled={isPending}
                    className="flex-shrink-0 text-xs bg-muted/50 text-muted-foreground border border-border rounded-lg px-3 py-2 hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-150 disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="mx-5 border-t border-border flex-shrink-0" />

            {/* Text input */}
            <div className="px-5 pt-4 pb-5 flex-shrink-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                Custom Request
              </p>
              <div className="flex gap-2.5 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Tell your coach what to change about this ${target.type}...`}
                  rows={3}
                  disabled={isPending}
                  className="flex-1 bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 focus:bg-muted/50 transition-all duration-150 disabled:opacity-50"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isPending}
                  className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:bg-primary/90 active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPending
                    ? <RotateCcw className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                </button>
              </div>

              {isError && (
                <div className="flex items-center gap-2 mt-3 text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <p className="text-xs">Something went wrong. Please try again.</p>
                </div>
              )}

              {isPending && (
                <div className="flex items-center gap-2 mt-3 text-muted-foreground">
                  <RotateCcw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  <p className="text-xs">Your coach is reviewing and applying the change…</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
