import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X, ChevronRight, ChevronLeft, Zap, Check, Target, Dumbbell,
  AlertCircle, Clock, Loader2, TrendingUp,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibrationData {
  experienceLevel?: string;
  yearsTraining?: number;
  primaryGoal?: string;
  injuries?: string;
  equipmentAccess?: string;
  daysPerWeek?: number;
  sessionDuration?: number;
  sportFocus?: string;
  exercisesToAvoid?: string;
}

interface Props {
  onClose: () => void;
  onComplete?: (coachReply: string) => void;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function computeLocalScore(data: CalibrationData): number {
  let score = 0;
  if (data.experienceLevel) score += 10;
  if (data.yearsTraining != null) score += 5;
  if (data.primaryGoal) score += 15;
  if (data.injuries !== undefined) score += 20;
  if (data.equipmentAccess) score += 15;
  if (data.daysPerWeek != null) score += 10;
  if (data.sessionDuration != null) score += 10;
  if (data.sportFocus) score += 8;
  if (data.exercisesToAvoid) score += 7;
  return Math.min(100, score);
}

function scoreLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 70) return { label: "High", color: "text-green-400", bg: "bg-green-400" };
  if (score >= 40) return { label: "Medium", color: "text-amber-400", bg: "bg-amber-400" };
  return { label: "Low", color: "text-muted-foreground", bg: "bg-muted-foreground" };
}

// ─── Chip button helper ────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 active:scale-95 ${
        selected
          ? "bg-primary/20 border-primary/50 text-primary"
          : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
    >
      {selected && <Check className="w-3 h-3 inline mr-1 -mt-px" />}
      {label}
    </button>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "experience", title: "Training Background" },
  { id: "goal", title: "Primary Goal" },
  { id: "injuries", title: "Injuries & Limitations" },
  { id: "equipment", title: "Equipment Access" },
  { id: "time", title: "Schedule" },
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function CalibrationModal({ onClose, onComplete }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CalibrationData>({});
  const [injuryText, setInjuryText] = useState("");
  const [done, setDone] = useState(false);
  const [coachReply, setCoachReply] = useState("");

  // Pre-fill from existing profile
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => customFetch<any>("/api/profile").catch(() => null),
    staleTime: 60000,
  });

  // Sync profile data on first mount
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
      });
      if (profile.injuries) setInjuryText(profile.injuries);
    }
  });

  const calibrateMutation = useMutation({
    mutationFn: (payload: CalibrationData) =>
      customFetch<{ success: boolean; calibrationScore: number; coachReply: string }>("/api/calibrate", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setCoachReply(result.coachReply);
      setDone(true);
      onComplete?.(result.coachReply);
    },
  });

  const currentScore = computeLocalScore(data);
  const { label: scoreLbl, color: scoreColor, bg: scoreBg } = scoreLabel(currentScore);

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
      ? injuryText.split(",").map((s) => s.trim()).filter(Boolean)
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

  const canSkipToSubmit = step === STEPS.length - 1;
  const stepTitle = STEPS[step].title;

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">System Upgraded</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">{coachReply}</p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="text-sm font-semibold text-foreground">AI Accuracy:</span>
              <span className={`text-sm font-bold ${scoreColor}`}>{scoreLbl} ({currentScore}%)</span>
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden shadow-2xl animate-slide-up">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Upgrade Your Training Intelligence</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                The more I know, the better I can build and adjust your program.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Accuracy bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">AI Accuracy</span>
              <span className={`text-[11px] font-bold ${scoreColor}`}>{scoreLbl} · {currentScore}%</span>
            </div>
            <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${scoreBg}`}
                style={{ width: `${currentScore}%` }}
              />
            </div>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mt-3">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === step ? "bg-primary w-5" : i < step ? "bg-primary/40 w-3" : "bg-muted/40 w-3"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="p-5 min-h-[200px]">
          <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-3">{stepTitle}</p>

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

          <button
            type="button"
            onClick={handleNext}
            disabled={calibrateMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {calibrateMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Upgrading…</>
            ) : step === STEPS.length - 1 ? (
              <><Zap className="w-3.5 h-3.5" /> Upgrade Intelligence</>
            ) : (
              <>Next <ChevronRight className="w-3.5 h-3.5" /></>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
