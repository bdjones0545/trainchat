import { useState, useEffect, useRef } from "react";
import { Dumbbell } from "lucide-react";

interface Props {
  acknowledgment?: string;
  thinkingStep?: string;
  intentType?: string;
}

const CREATE_STEPS = [
  "Understanding your goal and constraints...",
  "Building your weekly program structure...",
  "Selecting exercises for each session...",
  "Balancing volume and recovery...",
  "Finalizing your program...",
];

const EDIT_STEPS = [
  "Reading your current program...",
  "Applying your change...",
  "Checking program quality...",
  "Saving the update...",
];

const GENERAL_STEPS = [
  "Thinking through your request...",
  "Preparing your response...",
];

function getSteps(intentType?: string): string[] {
  if (!intentType) return CREATE_STEPS;
  if (
    intentType === "EDIT_PROGRAM" ||
    intentType === "ADJUST_FOR_PAIN" ||
    intentType === "ADJUST_FOR_READINESS"
  ) return EDIT_STEPS;
  if (intentType === "CREATE_PROGRAM") return CREATE_STEPS;
  return GENERAL_STEPS;
}

export default function AgentThinking({ acknowledgment, thinkingStep, intentType }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dotCount, setDotCount] = useState(1);
  const stepsRef = useRef<string[]>([]);

  useEffect(() => {
    stepsRef.current = getSteps(intentType);
    setCurrentStep(0);
  }, [intentType]);

  // Advance through steps on a timer — gives "alive" feeling during AI processing
  useEffect(() => {
    const steps = stepsRef.current;
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        return next < steps.length - 1 ? next : prev;
      });
    }, 2200);
    return () => clearInterval(interval);
  }, [intentType]);

  // Animate trailing dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((d) => (d % 3) + 1);
    }, 480);
    return () => clearInterval(interval);
  }, []);

  const steps = stepsRef.current.length > 0 ? stepsRef.current : getSteps(intentType);
  const displayStep = thinkingStep ?? steps[currentStep] ?? steps[0];
  const dots = ".".repeat(dotCount);

  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
        <Dumbbell className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex flex-col gap-1.5 max-w-sm">
        {acknowledgment && (
          <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-2.5">
            <p className="text-sm text-foreground leading-relaxed">{acknowledgment}</p>
          </div>
        )}
        <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2.5">
          <div className="flex gap-[3px] items-center flex-shrink-0">
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
              style={{ animationDelay: "0ms", animationDuration: "1.1s" }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
              style={{ animationDelay: "180ms", animationDuration: "1.1s" }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
              style={{ animationDelay: "360ms", animationDuration: "1.1s" }}
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {displayStep}
          </p>
        </div>
      </div>
    </div>
  );
}
