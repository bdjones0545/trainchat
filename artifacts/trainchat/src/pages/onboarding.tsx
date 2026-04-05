import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateProfile } from "@workspace/api-client-react";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface ProfileData {
  trainingGoal: string;
  experienceLevel: string;
  trainingStyle: string;
  daysPerWeek: number;
  sessionDuration: number;
  equipmentAccess: string;
  injuries: string;
  sportFocus: string;
  exercisePreferences: string;
  exercisesToAvoid: string;
}

const steps = [
  {
    id: 1,
    title: "What is your primary training goal?",
    subtitle: "We'll build your entire program around this.",
    field: "trainingGoal",
    type: "choice",
    options: [
      { value: "muscle_gain", label: "Build Muscle", desc: "Hypertrophy and size" },
      { value: "strength", label: "Get Stronger", desc: "Maximal strength and power" },
      { value: "fat_loss", label: "Lose Fat", desc: "Body composition and conditioning" },
      { value: "athletic_performance", label: "Athletic Performance", desc: "Speed, power, agility" },
      { value: "general_fitness", label: "General Fitness", desc: "Health and endurance" },
    ],
  },
  {
    id: 2,
    title: "What is your training experience level?",
    subtitle: "This determines how we structure your program.",
    field: "experienceLevel",
    type: "choice",
    options: [
      { value: "beginner", label: "Beginner", desc: "Less than 1 year of consistent training" },
      { value: "intermediate", label: "Intermediate", desc: "1-3 years of consistent training" },
      { value: "advanced", label: "Advanced", desc: "3+ years, familiar with periodization" },
      { value: "elite", label: "Elite", desc: "Competitive athlete or coach" },
    ],
  },
  {
    id: 3,
    title: "What training style do you prefer?",
    subtitle: "Your preference shapes the structure of every session.",
    field: "trainingStyle",
    type: "choice",
    options: [
      { value: "powerlifting", label: "Powerlifting Style", desc: "Squat, bench, deadlift focus" },
      { value: "bodybuilding", label: "Bodybuilding Style", desc: "Volume and isolation work" },
      { value: "athletic", label: "Athletic / Functional", desc: "Power, speed, movement quality" },
      { value: "calisthenics", label: "Calisthenics", desc: "Bodyweight and bar work" },
      { value: "hybrid", label: "Hybrid", desc: "Mix of strength and conditioning" },
    ],
  },
  {
    id: 4,
    title: "How many days per week can you train?",
    subtitle: "Be realistic — consistency beats volume.",
    field: "daysPerWeek",
    type: "number_choice",
    options: [
      { value: 2, label: "2 days" },
      { value: 3, label: "3 days" },
      { value: 4, label: "4 days" },
      { value: 5, label: "5 days" },
      { value: 6, label: "6 days" },
    ],
  },
  {
    id: 5,
    title: "How long is a typical session?",
    subtitle: "We'll keep every session within this window.",
    field: "sessionDuration",
    type: "number_choice",
    options: [
      { value: 30, label: "30 min" },
      { value: 45, label: "45 min" },
      { value: 60, label: "60 min" },
      { value: 75, label: "75 min" },
      { value: 90, label: "90 min" },
      { value: 120, label: "2 hours+" },
    ],
  },
  {
    id: 6,
    title: "What equipment do you have access to?",
    subtitle: "Your program will be built around what you actually have.",
    field: "equipmentAccess",
    type: "choice",
    options: [
      { value: "full_gym", label: "Full Commercial Gym", desc: "Barbells, machines, cables, everything" },
      { value: "home_gym", label: "Home Gym", desc: "Barbells, dumbbells, power rack" },
      { value: "dumbbells_only", label: "Dumbbells Only", desc: "Adjustable or fixed dumbbells" },
      { value: "bodyweight", label: "Bodyweight Only", desc: "No equipment" },
      { value: "limited", label: "Minimal Equipment", desc: "Resistance bands, pull-up bar, etc." },
    ],
  },
  {
    id: 7,
    title: "Any injuries or physical limitations?",
    subtitle: "We'll work around them. Skip if none.",
    field: "injuries",
    type: "text",
    placeholder: "e.g. Lower back issues, bad knees, shoulder impingement...",
    optional: true,
  },
  {
    id: 8,
    title: "Do you train for a specific sport or activity?",
    subtitle: "This helps us align your training with performance needs. Skip if not applicable.",
    field: "sportFocus",
    type: "text",
    placeholder: "e.g. Soccer, BJJ, Cycling, Powerlifting, Football...",
    optional: true,
  },
  {
    id: 9,
    title: "Any exercise preferences?",
    subtitle: "Exercises or movement patterns you want included. Skip if you have no preference.",
    field: "exercisePreferences",
    type: "text",
    placeholder: "e.g. I love Romanian deadlifts, prefer compound movements...",
    optional: true,
  },
  {
    id: 10,
    title: "Any exercises to avoid?",
    subtitle: "Movements you want excluded from your program. Skip if none.",
    field: "exercisesToAvoid",
    type: "text",
    placeholder: "e.g. No overhead pressing, avoid box jumps...",
    optional: true,
  },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<ProfileData>({
    trainingGoal: "",
    experienceLevel: "",
    trainingStyle: "",
    daysPerWeek: 4,
    sessionDuration: 60,
    equipmentAccess: "",
    injuries: "",
    sportFocus: "",
    exercisePreferences: "",
    exercisesToAvoid: "",
  });
  const [error, setError] = useState<string | null>(null);
  const createProfile = useCreateProfile();

  const currentStep = steps[step];
  const progress = ((step + 1) / steps.length) * 100;
  const isRequired = !("optional" in currentStep) || !currentStep.optional;

  function handleChoice(field: string, value: string | number) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function canAdvance() {
    const val = data[currentStep.field as keyof ProfileData];
    if (isRequired) {
      return val !== "" && val !== 0;
    }
    return true;
  }

  function handleNext() {
    if (!canAdvance() && isRequired) {
      setError("Please make a selection to continue");
      return;
    }
    setError(null);
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleSubmit();
    }
  }

  function handleSubmit() {
    if (createProfile.isPending) return;
    setError(null);
    createProfile.mutate(
      {
        data: {
          trainingGoal: data.trainingGoal,
          experienceLevel: data.experienceLevel,
          trainingStyle: data.trainingStyle,
          daysPerWeek: data.daysPerWeek,
          sessionDuration: data.sessionDuration,
          equipmentAccess: data.equipmentAccess,
          injuries: data.injuries || null,
          sportFocus: data.sportFocus || null,
          exercisePreferences: data.exercisePreferences || null,
          exercisesToAvoid: data.exercisesToAvoid || null,
        },
      },
      {
        onSuccess: () => setLocation("/chat"),
        onError: (err) => {
          const apiMessage =
            err && typeof err === "object" && "data" in err
              ? (err.data as { error?: string } | null)?.error
              : err instanceof Error
              ? err.message
              : null;
          setError(apiMessage ?? "Failed to save your profile. Please try again.");
        },
      }
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      <div className="h-0.5 bg-border">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step counter */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Step {step + 1} of {steps.length}
        </span>
        {step > 0 && (
          <button
            onClick={() => { setStep((s) => s - 1); setError(null); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg" key={step}>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground tracking-tight mb-2">
              {currentStep.title}
            </h2>
            <p className="text-sm text-muted-foreground">{currentStep.subtitle}</p>
          </div>

          {/* Choice options */}
          {(currentStep.type === "choice") && (
            <div className="space-y-2.5">
              {currentStep.options?.map((opt) => {
                const isSelected = data[currentStep.field as keyof ProfileData] === opt.value.toString();
                return (
                  <button
                    key={String(opt.value)}
                    data-testid={`option-${opt.value}`}
                    onClick={() => handleChoice(currentStep.field, opt.value.toString())}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-150 ${
                      isSelected
                        ? "bg-primary/10 border-primary/60 text-foreground"
                        : "bg-card border-border text-foreground hover:border-muted-foreground/40 hover:bg-accent"
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-primary" : ""}`}>{opt.label}</p>
                      {"desc" in opt && <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>}
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Number choice */}
          {currentStep.type === "number_choice" && (
            <div className="flex flex-wrap gap-2.5">
              {currentStep.options?.map((opt) => {
                const currentVal = data[currentStep.field as keyof ProfileData];
                const isSelected = currentVal === opt.value || Number(currentVal) === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    data-testid={`option-${opt.value}`}
                    onClick={() => handleChoice(currentStep.field, opt.value)}
                    className={`px-5 py-3 rounded-xl border text-sm font-medium transition-all duration-150 ${
                      isSelected
                        ? "bg-primary/10 border-primary/60 text-primary"
                        : "bg-card border-border text-foreground hover:border-muted-foreground/40 hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Text input */}
          {currentStep.type === "text" && (
            <textarea
              data-testid="input-text"
              className="w-full px-4 py-3.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all resize-none"
              rows={4}
              placeholder={currentStep.placeholder}
              value={data[currentStep.field as keyof ProfileData] as string}
              onChange={(e) => handleChoice(currentStep.field, e.target.value)}
            />
          )}

          {/* Error */}
          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}

          {/* Navigation */}
          <div className="mt-8">
            <button
              data-testid="button-next"
              onClick={handleNext}
              disabled={createProfile.isPending}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.99]"
            >
              {createProfile.isPending
                ? "Saving..."
                : step < steps.length - 1
                ? (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </>
                )
                : "Complete Setup"}
            </button>
            {!isRequired && (
              <button
                onClick={() => {
                  if (step < steps.length - 1) {
                    setStep((s) => s + 1);
                  } else {
                    handleSubmit();
                  }
                }}
                disabled={createProfile.isPending}
                className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Skip this step
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
