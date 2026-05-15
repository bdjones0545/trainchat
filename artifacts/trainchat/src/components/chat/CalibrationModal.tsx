import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X, ChevronRight, ChevronLeft, Check, Dumbbell,
  AlertCircle, Loader2, Brain, Sparkles, TrendingUp, Zap,
  ShieldCheck, Activity, Target,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibrationData {
  // Core profile
  experienceLevel?: string;
  yearsTraining?: number;
  primaryGoal?: string;
  injuries?: string;
  equipmentAccess?: string;
  daysPerWeek?: number;
  sessionDuration?: number;
  sportFocus?: string;
  exercisesToAvoid?: string;
  // Behavioral (T005)
  scheduleConsistency?: string;
  recoveryConsistency?: string;
  autoregulationComfort?: string;
  motivationStyle?: string;
  trainingAggression?: string;
}

interface AtlasDNA {
  recoveryIdentity: string;
  fatigueIdentity: string;
  progressionIdentity: string;
  coachingIdentity: string;
  adherenceIdentity: string;
  adaptationResponsiveness: string;
}

interface CalibrateResponse {
  success: boolean;
  calibrationScore: number;
  coachingPrecisionScore: number;
  precisionTier: string;
  precisionTierLabel: string;
  precisionTierDescription: string;
  precisionDimensions: {
    contextCompleteness: number;
    behavioralProfile: number;
    recoveryConfidence: number;
    adaptationCertainty: number;
    memorySignals: number;
    longitudinalExperience: number;
  };
  coachReply: string;
  learned: { understood: string[]; implications: string[] };
  dna: AtlasDNA;
}

interface Props {
  onClose: () => void;
  onComplete?: (coachReply: string, applyNow: boolean) => void;
}

// ─── Precision Tiers ──────────────────────────────────────────────────────────

function getPrecisionTier(score: number): {
  tier: string;
  label: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  barColor: string;
} {
  if (score >= 76)
    return {
      tier: "performance_intelligence",
      label: "Performance Intelligence",
      description: "Longitudinal adaptation, predictive recovery, and athlete-specific coaching",
      color: "text-green-400",
      bg: "bg-green-400/10",
      border: "border-green-400/30",
      barColor: "bg-green-400",
    };
  if (score >= 51)
    return {
      tier: "adaptive",
      label: "Adaptive Coaching",
      description: "Atlas can personalize progression and fatigue management",
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/30",
      barColor: "bg-primary",
    };
  if (score >= 26)
    return {
      tier: "context_aware",
      label: "Context-Aware Coaching",
      description: "Better exercise and recovery decisions",
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      border: "border-amber-400/30",
      barColor: "bg-amber-400",
    };
  return {
    tier: "basic",
    label: "Basic Coaching",
    description: "Generic adaptations only",
    color: "text-muted-foreground",
    bg: "bg-muted/20",
    border: "border-border",
    barColor: "bg-muted-foreground",
  };
}

// ─── Local precision estimate (frontend, before server) ──────────────────────

function estimatePrecision(data: CalibrationData): number {
  let score = 0;
  if (data.experienceLevel) score += 5;
  if (data.yearsTraining != null) score += 3;
  if (data.primaryGoal) score += 8;
  if (data.injuries !== undefined) score += 5;
  if (data.equipmentAccess) score += 5;
  if (data.daysPerWeek != null) score += 2;
  if (data.sessionDuration != null) score += 2;
  if (data.scheduleConsistency) score += 10;
  if (data.trainingAggression) score += 5;
  if (data.motivationStyle) score += 5;
  if (data.recoveryConsistency) score += 10;
  if (data.autoregulationComfort) score += 8;
  const years = data.yearsTraining ?? 0;
  if (years >= 5) score += 10;
  else if (years >= 2) score += 7;
  else if (years >= 1) score += 5;
  return Math.min(100, score);
}

// ─── Atlas commentary map (T002) ─────────────────────────────────────────────

const ATLAS_COMMENTARY: Record<string, string> = {
  experience:
    "Your training age changes how aggressively I progress strength and volume — and how much complexity your program can carry.",
  goal: "This shapes every programming decision I make: loading, volume, movement selection, and energy system priorities.",
  injuries:
    "This helps me predict fatigue before performance drops and build your program around what you can actually train safely.",
  equipment:
    "I build every exercise selection around what you actually have access to — no workarounds, no assumed equipment.",
  time: "I use your schedule to decide how adaptive your plan needs to be week to week — and how much recovery buffer to build in.",
  behavior:
    "Behavioral patterns are the most valuable coaching signal I have. This helps me understand how you actually train, not just what you intend to do.",
};

// ─── Chip helper ──────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
  variant = "default",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  const baseStyle = "px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 active:scale-95";
  const dangerSelected = "bg-red-500/15 border-red-500/40 text-red-400";
  const dangerDefault = "bg-card border-border text-muted-foreground hover:border-red-400/30 hover:text-foreground";
  const primarySelected = "bg-primary/20 border-primary/50 text-primary";
  const primaryDefault = "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseStyle} ${
        variant === "danger"
          ? selected
            ? dangerSelected
            : dangerDefault
          : selected
            ? primarySelected
            : primaryDefault
      }`}
    >
      {selected && variant !== "danger" && <Check className="w-3 h-3 inline mr-1 -mt-px" />}
      {selected && variant === "danger" && <AlertCircle className="w-3 h-3 inline mr-1 -mt-px" />}
      {label}
    </button>
  );
}

// ─── Atlas Commentary Banner ──────────────────────────────────────────────────

function AtlasBanner({ stepId }: { stepId: string }) {
  const text = ATLAS_COMMENTARY[stepId];
  if (!text) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 mb-4">
      <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-px">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
      </div>
      <p className="text-[11px] text-primary/70 leading-relaxed italic">{text}</p>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "experience", title: "Training Background" },
  { id: "goal", title: "Primary Goal" },
  { id: "injuries", title: "Injuries & Limitations" },
  { id: "equipment", title: "Equipment Access" },
  { id: "time", title: "Schedule" },
  { id: "behavior", title: "Athlete Behavior" },
];

const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"];
const YEARS_OPTIONS = [0, 1, 2, 3, 5, 7, 10];
const GOALS = [
  { id: "Muscle Gain", label: "Muscle Gain", icon: "💪" },
  { id: "Fat Loss", label: "Fat Loss", icon: "🔥" },
  { id: "Athletic Performance", label: "Athletic Performance", icon: "⚡" },
  { id: "General Fitness", label: "General Fitness", icon: "🎯" },
  { id: "Strength", label: "Strength", icon: "🏋️" },
];
const INJURY_QUICK = ["Knee", "Shoulder", "Lower back", "Hip", "Wrist", "Neck", "Ankle"];
const EQUIPMENT_OPTIONS = [
  { id: "Full gym", label: "Full Gym" },
  { id: "Dumbbells only", label: "Dumbbells Only" },
  { id: "Bodyweight", label: "Bodyweight" },
  { id: "Home gym", label: "Home Gym" },
  { id: "Barbells only", label: "Barbells Only" },
];
const DAYS_OPTIONS = [2, 3, 4, 5, 6];
const DURATION_OPTIONS = [30, 45, 60, 75, 90];

// Behavioral options
const SCHEDULE_OPTIONS = [
  "Highly consistent",
  "Mostly consistent",
  "Variable week-to-week",
  "Often unpredictable",
];
const RECOVERY_OPTIONS = [
  "Prioritize recovery",
  "Balanced approach",
  "Inconsistent recovery",
  "Often overtrain",
];
const AGGRESSION_OPTIONS = ["Conservative", "Moderate", "Aggressive", "All-out always"];
const AUTOREGULATION_OPTIONS = ["Train by feel", "Mix of both", "Follow the plan", "Need clear structure"];
const MOTIVATION_OPTIONS = ["Intrinsic / habit", "Performance gains", "Competitive", "Accountability"];

// ─── Main component ───────────────────────────────────────────────────────────

export default function CalibrationModal({ onClose, onComplete }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CalibrationData>({});
  const [injuryText, setInjuryText] = useState("");
  const [serverResult, setServerResult] = useState<CalibrateResponse | null>(null);
  const [stage, setStage] = useState<"form" | "result" | "done">("form");
  const [applyNow, setApplyNow] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => customFetch<any>("/api/profile").catch(() => null),
    staleTime: 60000,
  });

  // Pre-fill from existing profile on first render
  useState(() => {
    if (profile) {
      setData({
        experienceLevel: profile.experienceLevel ?? undefined,
        primaryGoal: profile.trainingGoal ?? undefined,
        injuries: profile.injuries ?? undefined,
        equipmentAccess: profile.equipmentAccess ?? undefined,
        daysPerWeek: profile.daysPerWeek ?? undefined,
        sessionDuration: profile.sessionDuration ?? undefined,
        sportFocus: profile.sportFocus ?? undefined,
        yearsTraining: profile.yearsTraining ?? undefined,
        scheduleConsistency: profile.scheduleConsistency ?? undefined,
        recoveryConsistency: profile.recoveryConsistency ?? undefined,
        autoregulationComfort: profile.autoregulationComfort ?? undefined,
        motivationStyle: profile.motivationStyle ?? undefined,
        trainingAggression: profile.trainingAggression ?? undefined,
      });
      if (profile.injuries) setInjuryText(profile.injuries);
    }
  });

  const calibrateMutation = useMutation({
    mutationFn: (payload: CalibrationData) =>
      customFetch<CalibrateResponse>("/api/calibrate", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setServerResult(result);
      setStage("result");
    },
  });

  const localScore = estimatePrecision(data);
  const displayScore = serverResult?.coachingPrecisionScore ?? localScore;
  const precision = getPrecisionTier(displayScore);

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      const payload = { ...data };
      if (injuryText.trim()) payload.injuries = injuryText.trim();
      else payload.injuries = data.injuries ?? "";
      calibrateMutation.mutate(payload);
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  function toggleInjuryQuick(tag: string) {
    const parts = injuryText.trim()
      ? injuryText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const idx = parts.findIndex((p) => p.toLowerCase() === tag.toLowerCase());
    if (idx >= 0) parts.splice(idx, 1);
    else parts.push(tag);
    setInjuryText(parts.join(", "));
    setData((d) => ({ ...d, injuries: parts.join(", ") }));
  }

  function isTagActive(tag: string) {
    return injuryText.toLowerCase().includes(tag.toLowerCase());
  }

  function handleChoiceSelect(choice: "now" | "future") {
    const willApply = choice === "now";
    setApplyNow(willApply);
    setStage("done");
    onComplete?.(serverResult?.coachReply ?? "", willApply);
  }

  // ── Result screen (T004 "What Atlas Learned" + choice) ────────────────────

  if (stage === "result" && serverResult) {
    const { learned, dna } = serverResult;
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${precision.bg} border ${precision.border}`}>
                <Brain className={`w-4.5 h-4.5 ${precision.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">What Atlas Learned</h3>
                <p className="text-[10px] text-muted-foreground">Intelligence profile updated</p>
              </div>
            </div>

            {/* Precision tier */}
            <div className={`px-3 py-2.5 rounded-xl ${precision.bg} border ${precision.border} flex items-center justify-between`}>
              <div>
                <p className={`text-xs font-bold ${precision.color}`}>{precision.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{precision.description}</p>
              </div>
              <span className={`text-lg font-black ${precision.color}`}>{displayScore}</span>
            </div>

            {/* Precision bar */}
            <div className="h-1 bg-muted/30 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all duration-700 ${precision.barColor}`}
                style={{ width: `${displayScore}%` }}
              />
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">

            {/* What Atlas now understands */}
            {learned.understood.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  Atlas now understands
                </p>
                <div className="space-y-1.5">
                  {learned.understood.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Check className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-foreground leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Implications — what changed */}
            {learned.implications.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  Here's what changed in your coaching
                </p>
                <div className="space-y-1.5">
                  {learned.implications.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <TrendingUp className="w-3 h-3 text-primary/60 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DNA snapshot */}
            {dna && (
              <div className="px-3 py-3 rounded-xl bg-card border border-border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  Athlete identity
                </p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                    <p className="text-[11px] text-foreground">{dna.progressionIdentity}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                    <p className="text-[11px] text-foreground">{dna.recoveryIdentity}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                    <p className="text-[11px] text-foreground">{dna.adherenceIdentity}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Apply choice */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">How would you like to apply this?</p>
              <div className="space-y-2">
                <button
                  onClick={() => handleChoiceSelect("now")}
                  className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border border-primary/30 bg-primary/8 hover:bg-primary/12 active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-4 h-4 rounded-full border-2 border-primary mt-0.5 flex-shrink-0 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">Update my current plan</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Refine the active program using this new intelligence
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => handleChoiceSelect("future")}
                  className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border border-border hover:border-primary/30 active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-4 h-4 rounded-full border-2 border-border mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Use for future programs</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Keep the current plan — apply this intelligence to future builds
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────

  if (stage === "done") {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
          <div className="p-6 text-center">
            <div className={`w-14 h-14 rounded-2xl ${precision.bg} border ${precision.border} flex items-center justify-center mx-auto mb-4`}>
              <Brain className={`w-7 h-7 ${precision.color}`} />
            </div>
            <h3 className="text-base font-bold text-foreground mb-1">
              {applyNow ? "Atlas is recalibrating your plan" : "Intelligence profile updated"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {applyNow
                ? "Ask me to refine your current plan and I'll apply everything you've shared."
                : "Your athlete profile is saved. Every future program will use this intelligence."}
            </p>

            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${precision.bg} border ${precision.border} mb-5`}>
              <div className="text-left">
                <p className={`text-xs font-bold ${precision.color}`}>{precision.label}</p>
                <p className="text-[10px] text-muted-foreground">{precision.description}</p>
              </div>
              <span className={`text-lg font-black ${precision.color}`}>{displayScore}</span>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              Back to Training
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form screen ───────────────────────────────────────────────────────────

  const localPrecision = getPrecisionTier(localScore);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden shadow-2xl animate-slide-up">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Brain className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">Teach Atlas About You</h2>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-relaxed max-w-[240px]">
                  The more Atlas understands your training, recovery, and lifestyle, the smarter your coaching becomes.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Coaching Precision bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Coaching Precision
              </span>
              <span className={`text-[11px] font-bold ${localPrecision.color}`}>
                {localPrecision.label} · {localScore}
              </span>
            </div>
            <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${localPrecision.barColor}`}
                style={{ width: `${localScore}%` }}
              />
            </div>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mt-3">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === step
                    ? "bg-primary w-5"
                    : i < step
                      ? "bg-primary/40 w-3"
                      : "bg-muted/40 w-3"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="p-5 min-h-[240px]">
          <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-2">
            {STEPS[step].title}
          </p>

          {/* Atlas commentary banner (T002) */}
          <AtlasBanner stepId={STEPS[step].id} />

          {/* ── Step 0: Experience ─────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Training level</p>
                <div className="flex flex-wrap gap-2">
                  {EXPERIENCE_LEVELS.map((lvl) => (
                    <Chip
                      key={lvl}
                      label={lvl}
                      selected={data.experienceLevel?.toLowerCase() === lvl.toLowerCase()}
                      onClick={() => setData((d) => ({ ...d, experienceLevel: lvl.toLowerCase() }))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Years training</p>
                <div className="flex flex-wrap gap-2">
                  {YEARS_OPTIONS.map((y) => (
                    <Chip
                      key={y}
                      label={y === 10 ? "10+" : y === 0 ? "< 1" : `${y}`}
                      selected={data.yearsTraining === y}
                      onClick={() => setData((d) => ({ ...d, yearsTraining: y }))}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Goal ───────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, primaryGoal: g.id }))}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-left transition-all duration-150 active:scale-95 ${
                    data.primaryGoal === g.id
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-card border-border text-foreground hover:border-primary/30"
                  }`}
                >
                  <span className="text-base">{g.icon}</span>
                  <span className="text-xs font-semibold">{g.label}</span>
                  {data.primaryGoal === g.id && <Check className="w-3 h-3 ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: Injuries ───────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {INJURY_QUICK.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleInjuryQuick(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 active:scale-95 ${
                      isTagActive(tag)
                        ? "bg-red-500/15 border-red-500/40 text-red-400"
                        : "bg-card border-border text-muted-foreground hover:border-red-400/30 hover:text-foreground"
                    }`}
                  >
                    {isTagActive(tag) && <AlertCircle className="w-3 h-3 inline mr-1 -mt-px" />}
                    {tag}
                  </button>
                ))}
              </div>
              <textarea
                value={injuryText}
                onChange={(e) => {
                  setInjuryText(e.target.value);
                  setData((d) => ({ ...d, injuries: e.target.value }));
                }}
                placeholder="Describe any injuries, pain, or movement limitations…"
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground">Leave blank if you have no limitations.</p>
            </div>
          )}

          {/* ── Step 3: Equipment ──────────────────────────────────────────── */}
          {step === 3 && (
            <div className="grid grid-cols-2 gap-2">
              {EQUIPMENT_OPTIONS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, equipmentAccess: e.id }))}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-left transition-all duration-150 active:scale-95 ${
                    data.equipmentAccess?.toLowerCase() === e.id.toLowerCase()
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-card border-border text-foreground hover:border-primary/30"
                  }`}
                >
                  <Dumbbell className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-xs font-semibold">{e.label}</span>
                  {data.equipmentAccess?.toLowerCase() === e.id.toLowerCase() && (
                    <Check className="w-3 h-3 ml-auto flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Step 4: Schedule ───────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Days per week</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OPTIONS.map((d) => (
                    <Chip
                      key={d}
                      label={`${d} days`}
                      selected={data.daysPerWeek === d}
                      onClick={() => setData((prev) => ({ ...prev, daysPerWeek: d }))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Minutes per session</p>
                <div className="flex flex-wrap gap-2">
                  {DURATION_OPTIONS.map((m) => (
                    <Chip
                      key={m}
                      label={`${m} min`}
                      selected={data.sessionDuration === m}
                      onClick={() => setData((prev) => ({ ...prev, sessionDuration: m }))}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5: Behavior (T005) ────────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Schedule consistency</p>
                <div className="flex flex-wrap gap-2">
                  {SCHEDULE_OPTIONS.map((o) => (
                    <Chip
                      key={o}
                      label={o}
                      selected={data.scheduleConsistency === o}
                      onClick={() => setData((d) => ({ ...d, scheduleConsistency: o }))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Recovery approach</p>
                <div className="flex flex-wrap gap-2">
                  {RECOVERY_OPTIONS.map((o) => (
                    <Chip
                      key={o}
                      label={o}
                      selected={data.recoveryConsistency === o}
                      onClick={() => setData((d) => ({ ...d, recoveryConsistency: o }))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Training intensity tendency</p>
                <div className="flex flex-wrap gap-2">
                  {AGGRESSION_OPTIONS.map((o) => (
                    <Chip
                      key={o}
                      label={o}
                      selected={data.trainingAggression === o}
                      onClick={() => setData((d) => ({ ...d, trainingAggression: o }))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">How I like to regulate intensity</p>
                <div className="flex flex-wrap gap-2">
                  {AUTOREGULATION_OPTIONS.map((o) => (
                    <Chip
                      key={o}
                      label={o}
                      selected={data.autoregulationComfort === o}
                      onClick={() => setData((d) => ({ ...d, autoregulationComfort: o }))}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all duration-150"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-all duration-150"
            >
              Skip
            </button>
          )}

          {step > 0 && (
            <button
              type="button"
              onClick={onClose}
              className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1"
            >
              Skip
            </button>
          )}

          <button
            type="button"
            onClick={handleNext}
            disabled={calibrateMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {calibrateMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calibrating…
              </>
            ) : step === STEPS.length - 1 ? (
              <>
                <Sparkles className="w-3.5 h-3.5" /> Calibrate Atlas
              </>
            ) : (
              <>
                Next <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
