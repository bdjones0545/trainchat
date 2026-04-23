/**
 * LearnExerciseModal — Premium coaching assist layer
 *
 * Composed of sub-sections:
 *   LearnExerciseHeader, LearnExerciseWhySection, LearnExerciseCuesSection,
 *   LearnExerciseMistakesSection, LearnExerciseModifySection,
 *   LearnExerciseDemoSection, LearnExerciseAskCoachSection
 *
 * All coaching content is derived from lib/learn-exercise.ts.
 * No backend required.
 */

import { useEffect, useRef } from "react";
import { X, BookOpen, ChevronRight, ExternalLink } from "lucide-react";
import type {
  LearnExerciseData,
  LearnExerciseContext,
  ExerciseRole,
} from "@/lib/learn-exercise";
import {
  buildYoutubeSearchUrl,
  buildAskCoachPrompts,
} from "@/lib/learn-exercise";

// ─── Modal props ───────────────────────────────────────────────────────────────

export interface LearnExerciseModalProps {
  open: boolean;
  exercise: LearnExerciseData | null;
  context: LearnExerciseContext | null;
  onClose: () => void;
  onAskCoach: (prompt: string) => void;
}

// ─── Small shared primitives ───────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.14em] mb-2">
      {children}
    </p>
  );
}

function BulletList({
  items,
  bulletClass,
}: {
  items: string[];
  bulletClass: string;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className={`mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${bulletClass}`} />
          <span className="text-[12px] text-foreground/80 leading-snug">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── LearnExerciseHeader ───────────────────────────────────────────────────────

interface LearnExerciseHeaderProps {
  exerciseName: string;
  role?: ExerciseRole;
  movementFamily?: string | null;
  onClose: () => void;
}

function rolePillStyle(role: ExerciseRole): string {
  switch (role) {
    case "PRIMARY":
      return "bg-primary/15 text-primary border-primary/30";
    case "SECONDARY":
      return "bg-amber-600/15 text-amber-500 border-amber-600/30";
    case "POWER":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "PREP":
      return "bg-teal-500/15 text-teal-400 border-teal-500/30";
    case "SKILL":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "TRUNK":
      return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
    case "ACCESSORY":
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    case "CONDITIONING":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "SUPPORT":
      return "bg-teal-500/15 text-teal-400 border-teal-500/30";
    default:
      return "bg-accent text-muted-foreground border-border";
  }
}

function roleLabel(role: ExerciseRole): string {
  switch (role) {
    case "PREP":    return "Prep";
    case "SKILL":   return "Skill";
    default:        return role ?? "";
  }
}

function LearnExerciseHeader({ exerciseName, role, movementFamily, onClose }: LearnExerciseHeaderProps) {
  return (
    <div className="flex-shrink-0 px-5 pt-5 pb-3.5 border-b border-border">
      <div className="md:hidden w-10 h-1 rounded-full bg-border/60 mx-auto mb-4" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-[9px] font-bold text-primary uppercase tracking-[0.14em]">
              Learn Exercise
            </span>
            {role && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold tracking-[0.1em] border uppercase ${rolePillStyle(role)}`}
              >
                {roleLabel(role)}
              </span>
            )}
          </div>
          <h2 className="text-[18px] font-bold text-foreground leading-tight tracking-tight">
            {exerciseName}
          </h2>
          {movementFamily && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{movementFamily}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-accent/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── LearnExerciseWhySection ───────────────────────────────────────────────────

interface LearnExerciseWhySectionProps {
  whyThisIsHere?: string | null;
  exerciseName: string;
  context?: LearnExerciseContext | null;
  movementFamily?: string | null;
  role?: ExerciseRole;
  coachNote?: string;
}

function LearnExerciseWhySection({
  whyThisIsHere,
  coachNote,
}: LearnExerciseWhySectionProps) {
  if (!whyThisIsHere && !coachNote) return null;
  return (
    <div>
      <SectionLabel>Why this is in your program</SectionLabel>
      {whyThisIsHere && (
        <p className="text-[12px] text-foreground/75 leading-relaxed">{whyThisIsHere}</p>
      )}
      {coachNote && (
        <div className="mt-2.5 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
          <p className="text-[10px] font-semibold text-primary mb-0.5">Coach note</p>
          <p className="text-[11px] text-foreground/70 leading-relaxed italic">{coachNote}</p>
        </div>
      )}
    </div>
  );
}

// ─── LearnExerciseCuesSection ──────────────────────────────────────────────────

interface LearnExerciseCuesSectionProps {
  cues: string[];
  exerciseName: string;
  movementFamily?: string | null;
}

function LearnExerciseCuesSection({ cues }: LearnExerciseCuesSectionProps) {
  if (!cues.length) return null;
  return (
    <div>
      <SectionLabel>Key coaching cues</SectionLabel>
      <BulletList items={cues} bulletClass="bg-primary/60" />
    </div>
  );
}

// ─── LearnExerciseMistakesSection ─────────────────────────────────────────────

interface LearnExerciseMistakesSectionProps {
  mistakes: string[];
  exerciseName: string;
  movementFamily?: string | null;
}

function LearnExerciseMistakesSection({ mistakes }: LearnExerciseMistakesSectionProps) {
  if (!mistakes.length) return null;
  return (
    <div>
      <SectionLabel>Common mistakes</SectionLabel>
      <BulletList items={mistakes} bulletClass="bg-amber-400/60" />
    </div>
  );
}

// ─── LearnExerciseModifySection ───────────────────────────────────────────────

interface LearnExerciseModifySectionProps {
  easierOptions: string[];
  harderOptions: string[];
  substituteOptions: string[];
  exerciseName: string;
  onSelectSuggestion?: (prompt: string) => void;
}

function ModifyCard({
  label,
  description,
  accent,
  onClick,
}: {
  label: string;
  description: string;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${accent} ${onClick ? "cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all" : ""}`}
      onClick={onClick}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1 opacity-60">{label}</p>
      <p className="text-[12px] leading-snug text-foreground/80">{description}</p>
    </div>
  );
}

function LearnExerciseModifySection({
  easierOptions,
  harderOptions,
  substituteOptions,
  exerciseName,
  onSelectSuggestion,
}: LearnExerciseModifySectionProps) {
  const easier = easierOptions[0];
  const harder = harderOptions[0];
  const sub = substituteOptions[0];
  if (!easier && !harder && !sub) return null;
  return (
    <div>
      <SectionLabel>Modify this movement</SectionLabel>
      <div className="space-y-2">
        {easier && (
          <ModifyCard
            label="Easier"
            description={easier}
            accent="bg-green-500/5 border-green-500/20"
            onClick={onSelectSuggestion ? () => onSelectSuggestion(`Give me an easier version of ${exerciseName}`) : undefined}
          />
        )}
        {harder && (
          <ModifyCard
            label="Harder"
            description={harder}
            accent="bg-primary/5 border-primary/20"
            onClick={onSelectSuggestion ? () => onSelectSuggestion(`Make ${exerciseName} harder`) : undefined}
          />
        )}
        {sub && (
          <ModifyCard
            label="If this bothers you"
            description={sub}
            accent="bg-amber-500/5 border-amber-500/20"
            onClick={onSelectSuggestion ? () => onSelectSuggestion(`Swap ${exerciseName} for a joint-friendlier option`) : undefined}
          />
        )}
      </div>
    </div>
  );
}

// ─── LearnExerciseDemoSection ─────────────────────────────────────────────────

interface LearnExerciseDemoSectionProps {
  exerciseName: string;
  youtubeQuery?: string | null;
}

function LearnExerciseDemoSection({ exerciseName, youtubeQuery }: LearnExerciseDemoSectionProps) {
  const query = youtubeQuery ?? `${exerciseName} exercise proper form strength training`;
  const demoUrl = buildYoutubeSearchUrl(`${exerciseName} tutorial technique coaching`);
  const searchUrl = buildYoutubeSearchUrl(query);
  return (
    <div>
      <SectionLabel>See it in action</SectionLabel>
      <div className="flex gap-2">
        <a
          href={demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/40 transition-colors"
        >
          View demo <ExternalLink className="w-3 h-3 opacity-60 flex-shrink-0" />
        </a>
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/40 transition-colors"
        >
          Search videos <ExternalLink className="w-3 h-3 opacity-60 flex-shrink-0" />
        </a>
      </div>
    </div>
  );
}

// ─── LearnExerciseAskCoachSection ─────────────────────────────────────────────

interface LearnExerciseAskCoachSectionProps {
  exerciseName: string;
  onAskCoach: (prompt: string) => void;
}

function LearnExerciseAskCoachSection({ exerciseName, onAskCoach }: LearnExerciseAskCoachSectionProps) {
  const prompts = buildAskCoachPrompts(exerciseName);
  return (
    <div>
      <SectionLabel>Ask coach about this movement</SectionLabel>
      <div className="space-y-1.5">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onAskCoach(prompt)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/40 transition-colors group"
          >
            <span className="text-[11px] text-foreground/70 group-hover:text-foreground text-left leading-snug transition-colors">
              {prompt}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary flex-shrink-0 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── LearnExerciseModal (main shell) ──────────────────────────────────────────

export default function LearnExerciseModal({
  open,
  exercise,
  context,
  onClose,
  onAskCoach,
}: LearnExerciseModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open || !exercise) return null;

  function handleAskCoach(prompt: string) {
    onAskCoach(prompt);
    onClose();
  }

  function handleModifySuggestion(prompt: string) {
    onAskCoach(prompt);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: "le-fade 0.18s ease both" }}
      />

      {/* Sheet / Modal */}
      <div
        className={[
          "fixed z-50 bg-card border border-border flex flex-col overflow-hidden",
          "bottom-0 left-0 right-0 rounded-t-[24px] max-h-[82vh]",
          "md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2",
          "md:w-[480px] md:rounded-[20px] md:max-h-[80vh]",
        ].join(" ")}
        style={{ animation: "le-slide-up 0.22s cubic-bezier(0.22, 1, 0.36, 1) both" }}
      >
        <style>{`
          @keyframes le-fade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes le-slide-up {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          @media (min-width: 768px) {
            @keyframes le-slide-up {
              from { transform: translate(-50%, calc(-50% + 20px)); opacity: 0; }
              to   { transform: translate(-50%, -50%);               opacity: 1; }
            }
          }
        `}</style>

        <LearnExerciseHeader
          exerciseName={exercise.exerciseName}
          role={exercise.role}
          movementFamily={exercise.movementFamily}
          onClose={onClose}
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 py-4 space-y-5">
            <LearnExerciseWhySection
              exerciseName={exercise.exerciseName}
              whyThisIsHere={exercise.whyThisIsHere}
              context={context}
              movementFamily={exercise.movementFamily}
              role={exercise.role}
            />

            <LearnExerciseCuesSection
              exerciseName={exercise.exerciseName}
              cues={exercise.coachingCues ?? []}
              movementFamily={exercise.movementFamily}
            />

            <LearnExerciseMistakesSection
              exerciseName={exercise.exerciseName}
              mistakes={exercise.commonMistakes ?? []}
              movementFamily={exercise.movementFamily}
            />

            <LearnExerciseModifySection
              exerciseName={exercise.exerciseName}
              easierOptions={exercise.easierOptions ?? []}
              harderOptions={exercise.harderOptions ?? []}
              substituteOptions={exercise.substituteOptions ?? []}
              onSelectSuggestion={handleModifySuggestion}
            />

            <LearnExerciseDemoSection
              exerciseName={exercise.exerciseName}
              youtubeQuery={exercise.youtubeQuery}
            />

            <LearnExerciseAskCoachSection
              exerciseName={exercise.exerciseName}
              onAskCoach={handleAskCoach}
            />

            <div className="h-4" />
          </div>
        </div>
      </div>
    </>
  );
}
