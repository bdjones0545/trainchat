/**
 * ExerciseLearnButton
 *
 * Small, subtle trigger that opens the Learn Exercise modal.
 * Placed near the exercise name row — secondary to primary controls.
 */

import { BookOpen } from "lucide-react";

export interface ExerciseLearnButtonProps {
  onClick: () => void;
  ariaLabel?: string;
}

export default function ExerciseLearnButton({
  onClick,
  ariaLabel = "Learn exercise",
}: ExerciseLearnButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="ml-auto flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/35 hover:text-primary hover:bg-primary/10 transition-colors"
    >
      <BookOpen className="w-3 h-3" />
    </button>
  );
}
