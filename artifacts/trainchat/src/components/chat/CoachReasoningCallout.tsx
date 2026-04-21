/**
 * CoachReasoningCallout
 *
 * A compact, premium callout that surfaces the coach's reasoning after
 * builds, edits, and check-in adaptations. Explains WHY a decision was
 * made — not just WHAT changed.
 *
 * Design: subtle, focused, scan-friendly. Never louder than the primary card.
 */

interface CoachReasoningCalloutProps {
  reasoning: string;
  variant?: "build" | "edit" | "checkin";
}

export default function CoachReasoningCallout({
  reasoning,
  variant = "edit",
}: CoachReasoningCalloutProps) {
  if (!reasoning) return null;

  const styles = {
    build: {
      border: "border-primary/15",
      bg: "bg-primary/5",
      labelColor: "text-primary/60",
      textColor: "text-foreground/80",
    },
    edit: {
      border: "border-primary/12",
      bg: "bg-primary/4",
      labelColor: "text-primary/55",
      textColor: "text-foreground/75",
    },
    checkin: {
      border: "border-primary/15",
      bg: "bg-primary/5",
      labelColor: "text-primary/60",
      textColor: "text-foreground/80",
    },
  };

  const s = styles[variant];

  return (
    <div className={`mt-2.5 rounded-lg border ${s.border} ${s.bg} px-3 py-2`}>
      <div className="flex items-start gap-2">
        <span
          className={`text-[9px] font-bold uppercase tracking-widest ${s.labelColor} mt-[1px] flex-shrink-0`}
        >
          Coach Insight
        </span>
        <p className={`text-[11px] leading-relaxed ${s.textColor} italic`}>
          {reasoning}
        </p>
      </div>
    </div>
  );
}
