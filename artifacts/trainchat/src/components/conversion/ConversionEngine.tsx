import { useEffect, useRef } from "react";
import { X, Zap, Sparkles } from "lucide-react";

// ─── Phase 1: First Value Overlay ─────────────────────────────────────────────
// Shown inline in the transcript immediately after a program is generated.
// Forces the user into their first edit with 3 one-tap quick actions.

interface FirstValueOverlayProps {
  onAction: (text: string) => void;
  onDismiss: () => void;
}

const FIRST_VALUE_ACTIONS = [
  "Make this more athletic",
  "Make Day 1 harder",
  "Replace squats with knee-friendly options",
];

export function FirstValueOverlay({ onAction, onDismiss }: FirstValueOverlayProps) {
  return (
    <div className="flex items-start gap-2 mb-2 md:mb-4 animate-in fade-in slide-in-from-bottom-3 duration-300" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
        <Zap className="w-3 h-3 text-primary" />
      </div>
      <div className="flex-1 min-w-0 bg-card border border-primary/15 rounded-xl rounded-tl-sm px-3 py-2 md:px-4 md:py-2.5">
        <div className="flex items-start justify-between gap-2 mb-1.5 md:mb-2">
          <div>
            <p className="text-[12px] font-semibold text-foreground leading-snug">Your training system is ready</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">Edit anything in real time</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-muted-foreground/35 hover:text-muted-foreground transition-colors flex-shrink-0 p-0.5 mt-0.5"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {FIRST_VALUE_ACTIONS.map((action, idx) => (
            <button
              key={action}
              onClick={() => onAction(action)}
              className={`text-left text-[11px] font-medium text-primary/90 px-2.5 py-1.5 rounded-lg bg-primary/6 border border-primary/12 hover:bg-primary/12 hover:border-primary/25 hover:text-primary active:scale-[0.98] transition-all duration-150${idx === 2 ? " hidden sm:block" : ""}`}
            >
              → {action}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Phase 2: Edit Reinforcement Toast ────────────────────────────────────────
// Fixed floating toast shown once after the first successful edit.
// Auto-dismisses after 4s. Does not block UI.

interface EditReinforcementToastProps {
  onDone: () => void;
  onKeepRefining: () => void;
}

export function EditReinforcementToast({ onDone, onKeepRefining }: EditReinforcementToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDone, 4000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDone]);

  return (
    <div
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-250"
      style={{ animationDelay: "200ms", animationFillMode: "both" }}
    >
      <div className="bg-card border border-primary/20 rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 pointer-events-auto max-w-[300px]">
        <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground leading-snug">Your system just updated in real time</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Every part of your program is editable</p>
        </div>
        <button
          onClick={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
            onKeepRefining();
          }}
          className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors whitespace-nowrap flex-shrink-0 border border-primary/25 rounded-full px-2.5 py-1 bg-primary/8 hover:bg-primary/14"
        >
          Keep refining
        </button>
      </div>
    </div>
  );
}

// ─── Phase 3: Save Prompt Card ────────────────────────────────────────────────
// Shown inline below messages after 2-3 edits OR ~25 seconds of engagement.
// Routes anonymous users to account creation, logged-in users to direct save.

interface SavePromptCardProps {
  isAnonymous: boolean;
  onSave: () => void;
  onDismiss: () => void;
}

export function SavePromptCard({ onSave, onDismiss }: SavePromptCardProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-primary/20 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-250 w-full max-w-2xl mx-auto">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground">Save your system</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Store this and continue editing anytime</p>
      </div>
      <button
        onClick={onSave}
        className="flex-shrink-0 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 active:scale-95 transition-all"
      >
        Save My System
      </button>
      <button
        onClick={onDismiss}
        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Phase 4: Upgrade Hint ────────────────────────────────────────────────────
// Small non-intrusive in-transcript hint shown once after the user has generated
// a program, made 2+ edits, AND saved. Does not show a paywall.

interface UpgradeHintProps {
  onDismiss: () => void;
}

export function UpgradeHint({ onDismiss }: UpgradeHintProps) {
  return (
    <div
      className="flex items-start gap-3 mb-4 animate-in fade-in duration-400"
      style={{ animationDelay: "300ms", animationFillMode: "both" }}
    >
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center mt-0.5">
        <Sparkles className="w-3 h-3 text-primary/60" />
      </div>
      <div className="flex items-center gap-2 flex-1 px-4 py-2.5 rounded-2xl rounded-tl-sm bg-card border border-border/60 min-w-0">
        <p className="text-[12px] text-muted-foreground flex-1">
          Pro unlocks unlimited systems and advanced edits
        </p>
        <button
          onClick={onDismiss}
          className="text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Phase 5: Return Session Hook ────────────────────────────────────────────
// Shown at the top of the empty state for returning users who have an active system.
// Reduces between-session drop-off by surfacing immediate resume actions.

interface ReturnSessionHookProps {
  programName?: string;
  onResume: () => void;
  onIntensify: () => void;
  onDismiss: () => void;
}

export function ReturnSessionHook({ programName, onResume, onIntensify, onDismiss }: ReturnSessionHookProps) {
  return (
    <div
      className="w-full max-w-sm mx-auto mb-6 animate-in fade-in slide-in-from-bottom-2 duration-400"
      style={{ animationDelay: "300ms", animationFillMode: "both" }}
    >
      <div className="bg-card border border-primary/20 rounded-2xl px-4 py-4 shadow-sm relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
            Welcome back
          </p>
        </div>
        <p className="text-[13px] font-semibold text-foreground mb-0.5">
          Your system is ready to continue
        </p>
        {programName && (
          <p className="text-[11px] text-muted-foreground/70 mb-3 truncate">{programName}</p>
        )}
        <div className="flex gap-2 mt-3">
          <button
            onClick={onResume}
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            Resume editing
          </button>
          <button
            onClick={onIntensify}
            className="flex-1 py-2 rounded-xl border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 active:scale-[0.98] transition-all"
          >
            Make it more intense
          </button>
        </div>
      </div>
    </div>
  );
}
