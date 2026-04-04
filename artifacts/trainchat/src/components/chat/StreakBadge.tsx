import { Flame } from "lucide-react";

interface Props {
  streak: number;
  className?: string;
}

export default function StreakBadge({ streak, className = "" }: Props) {
  if (streak < 1) return null;

  const intensity =
    streak >= 14 ? "text-amber-300 bg-amber-400/10 border-amber-400/25" :
    streak >= 7 ? "text-orange-400 bg-orange-400/10 border-orange-400/25" :
    streak >= 3 ? "text-primary bg-primary/10 border-primary/20" :
    "text-muted-foreground bg-accent/30 border-border";

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all ${intensity} ${className}`}
      title={`${streak}-day training streak`}
    >
      <Flame className="w-3 h-3" />
      <span>{streak}</span>
    </div>
  );
}
