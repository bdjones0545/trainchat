import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useGuestSession } from "@/hooks/useGuestSession";
import { GUEST_CONFIG } from "@/lib/guestConfig";
import { GuestPaywallModal } from "@/components/GuestPaywallModal";
import logoSrc from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingAnswers {
  goal: string;
  experience: string;
  frequency: number;
  equipment: string[];
  injuries: string;
  style: string;
  timeline: string;
  sport: string;
}

interface GuestProgramExercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
}

interface GuestProgramDay {
  dayNumber: number;
  name: string;
  focus: string;
  exercises: GuestProgramExercise[];
  dayNotes?: string;
}

interface GuestProgram {
  programName: string;
  weeklyStructure: string;
  coachIntro: string;
  rationale: string;
  days: GuestProgramDay[];
  coachNote: string;
  progressionPrinciple: string;
}

type GuestStep = "idle" | "onboarding" | "generating" | "output" | "locked";

// ─── Onboarding Questions ─────────────────────────────────────────────────────

const QUESTIONS = [
  {
    key: "goal",
    headline: "What's your primary goal?",
    subheadline: "This shapes every programming decision.",
    type: "single" as const,
    options: [
      { value: "Build Muscle", label: "Build Muscle", icon: "💪", desc: "Maximize size and hypertrophy" },
      { value: "Get Stronger", label: "Get Stronger", icon: "⚡", desc: "Pure strength and power output" },
      { value: "Lose Fat", label: "Lose Fat", icon: "🔥", desc: "Burn fat while preserving muscle" },
      { value: "Improve Fitness", label: "Improve Fitness", icon: "🏃", desc: "Cardio capacity and overall health" },
      { value: "Sport Performance", label: "Sport Performance", icon: "🏆", desc: "Athletic edge and competitive output" },
      { value: "Rehab & Recovery", label: "Rehab & Recovery", icon: "🩺", desc: "Train around limitations" },
    ],
  },
  {
    key: "experience",
    headline: "How long have you been training seriously?",
    subheadline: "Honest answer gives better programming.",
    type: "single" as const,
    options: [
      { value: "Beginner", label: "Beginner", icon: "🌱", desc: "Under 1 year of consistent training" },
      { value: "Intermediate", label: "Intermediate", icon: "📈", desc: "1–3 years, solid fundamentals" },
      { value: "Advanced", label: "Advanced", icon: "🎯", desc: "3+ years, periodization experience" },
    ],
  },
  {
    key: "frequency",
    headline: "How many days per week can you train?",
    subheadline: "Realistic commitment, not aspirational.",
    type: "single" as const,
    options: [
      { value: 2, label: "2 days", icon: "📅", desc: "Minimum effective dose" },
      { value: 3, label: "3 days", icon: "📅", desc: "Most effective for most people" },
      { value: 4, label: "4 days", icon: "📅", desc: "High frequency, solid split" },
      { value: 5, label: "5 days", icon: "📅", desc: "High volume approach" },
      { value: 6, label: "6 days", icon: "📅", desc: "Elite training frequency" },
    ],
  },
  {
    key: "equipment",
    headline: "What equipment do you have access to?",
    subheadline: "Select all that apply.",
    type: "multi" as const,
    options: [
      { value: "Full Gym", label: "Full Gym", icon: "🏋️", desc: "Commercial gym, all equipment" },
      { value: "Barbell & Rack", label: "Barbell & Rack", icon: "🏗️", desc: "Power rack, barbells, plates" },
      { value: "Dumbbells", label: "Dumbbells", icon: "🪨", desc: "Dumbbell range available" },
      { value: "Cables & Machines", label: "Cables & Machines", icon: "⚙️", desc: "Cable system and isolation machines" },
      { value: "Resistance Bands", label: "Resistance Bands", icon: "🎯", desc: "Bands of varying resistance" },
      { value: "Bodyweight Only", label: "Bodyweight Only", icon: "🤸", desc: "No equipment — bodyweight movements" },
    ],
  },
  {
    key: "injuries",
    headline: "Any injuries or limitations to program around?",
    subheadline: "This is non-negotiable — we route around everything.",
    type: "text-with-presets" as const,
    placeholder: "e.g. lower back pain, left shoulder impingement...",
    presets: ["None", "Lower Back", "Knees", "Shoulders", "Hips", "Wrists/Elbows"],
  },
  {
    key: "style",
    headline: "What training style resonates with you?",
    subheadline: "This shapes exercise selection and session feel.",
    type: "single" as const,
    options: [
      { value: "Powerlifting / Strength", label: "Powerlifting / Strength", icon: "🏋️", desc: "Heavy compound lifts, low reps" },
      { value: "Bodybuilding / Hypertrophy", label: "Bodybuilding / Hypertrophy", icon: "💪", desc: "Volume-focused, muscle isolation" },
      { value: "Athletic / Functional", label: "Athletic / Functional", icon: "⚡", desc: "Power, agility, athleticism" },
      { value: "HIIT / Conditioning", label: "HIIT / Conditioning", icon: "🔥", desc: "High intensity, metabolic" },
      { value: "Flexible / Mixed", label: "Flexible / Mixed", icon: "🔄", desc: "Balanced across modalities" },
    ],
  },
  {
    key: "timeline",
    headline: "What's your commitment timeline?",
    subheadline: "Helps calibrate progression strategy.",
    type: "single" as const,
    options: [
      { value: "4–6 weeks", label: "4–6 weeks", icon: "⏱️", desc: "Short-term focus" },
      { value: "8–12 weeks", label: "8–12 weeks", icon: "📆", desc: "One training block" },
      { value: "6 months", label: "6 months", icon: "🗓️", desc: "Multi-block commitment" },
      { value: "Ongoing", label: "Ongoing", icon: "♾️", desc: "Long-term lifestyle shift" },
    ],
  },
  {
    key: "sport",
    headline: "Any sport or performance focus?",
    subheadline: "Optional — skip if general fitness.",
    type: "single" as const,
    options: [
      { value: "None", label: "None / General", icon: "—", desc: "No sport-specific focus" },
      { value: "Running / Endurance", label: "Running / Endurance", icon: "🏃", desc: "Aerobic performance" },
      { value: "Combat Sports", label: "Combat Sports", icon: "🥊", desc: "MMA, boxing, wrestling" },
      { value: "Team Sports", label: "Team Sports", icon: "⚽", desc: "Football, basketball, soccer" },
      { value: "Cycling / Triathlon", label: "Cycling / Triathlon", icon: "🚴", desc: "Multi-sport endurance" },
      { value: "Climbing / Gymnastics", label: "Climbing / Gymnastics", icon: "🧗", desc: "Bodyweight strength/skill" },
    ],
  },
] as const;

// ─── Entry Screen ─────────────────────────────────────────────────────────────

function EntryScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-4">
          <img src={logoSrc} alt="TrainChat" className="h-12 mx-auto" />
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white tracking-tight leading-tight">
              Elite AI Training,<br />
              <span style={{ color: "hsl(199 89% 48%)" }}>personalized to you.</span>
            </h1>
            <p className="text-zinc-400 text-lg max-w-md mx-auto leading-relaxed">
              Answer 8 questions. Get a real program built by an AI performance coach with PhD-level exercise science expertise.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-center gap-6 text-sm text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              No signup required
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Real programming
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              2 minutes
            </span>
          </div>
          <button
            onClick={onStart}
            className="w-full py-4 px-8 rounded-xl font-semibold text-white text-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "hsl(199 89% 48%)", boxShadow: "0 0 30px hsl(199 89% 48% / 0.3)" }}
          >
            Build My Program →
          </button>
          <p className="text-zinc-600 text-xs">Already have an account?{" "}
            <a href="/login" className="underline" style={{ color: "hsl(199 89% 48%)" }}>Sign in</a>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4">
          {[
            { label: "Exercise Science", sub: "PhD-level expertise" },
            { label: "Personalized", sub: "Built for your profile" },
            { label: "Actionable", sub: "Start Day 1 today" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl p-4 text-center" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
              <div className="text-white font-semibold text-sm">{item.label}</div>
              <div className="text-zinc-500 text-xs mt-0.5">{item.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Locked Screen (returning guest whose teaser is exhausted + no program) ───

function LockedScreen({ onUnlock, onSignIn }: { onUnlock: () => void; onSignIn: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-5">
          <img src={logoSrc} alt="TrainChat" className="h-12 mx-auto" />
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{ background: "hsl(199 89% 48% / 0.12)", border: "1px solid hsl(199 89% 48% / 0.3)" }}
          >
            <svg className="w-6 h-6" style={{ color: "hsl(199 89% 48%)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">{GUEST_CONFIG.LOCKED_HEADLINE}</h1>
            <p className="text-zinc-400 text-base max-w-sm mx-auto leading-relaxed">{GUEST_CONFIG.LOCKED_BODY}</p>
          </div>
        </div>
        <div className="space-y-3">
          <button
            onClick={onUnlock}
            className="w-full py-4 px-8 rounded-xl font-semibold text-white text-base transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "hsl(199 89% 48%)", boxShadow: "0 0 30px hsl(199 89% 48% / 0.25)" }}
          >
            {GUEST_CONFIG.LOCKED_CTA}
          </button>
          <button
            onClick={onSignIn}
            className="w-full py-3 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: "hsl(199 89% 48%)", border: "1px solid hsl(199 89% 48% / 0.2)" }}
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding Step ──────────────────────────────────────────────────────────

function OnboardingStep({
  questionIndex,
  answers,
  onAnswer,
  onBack,
  onNext,
}: {
  questionIndex: number;
  answers: Partial<OnboardingAnswers>;
  onAnswer: (key: string, value: any) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const q = QUESTIONS[questionIndex];
  const currentValue = answers[q.key as keyof OnboardingAnswers];
  const [textInput, setTextInput] = useState((currentValue as string) ?? "");
  const isLast = questionIndex === QUESTIONS.length - 1;

  const canProceed =
    q.type === "multi"
      ? ((currentValue as string[]) ?? []).length > 0
      : q.type === "text-with-presets"
        ? textInput.trim().length > 0
        : currentValue !== undefined;

  const handleTextChange = (val: string) => {
    setTextInput(val);
    onAnswer(q.key, val);
  };

  const handlePreset = (preset: string) => {
    setTextInput(preset);
    onAnswer(q.key, preset);
  };

  const handleSingle = (val: any) => {
    onAnswer(q.key, val);
    setTimeout(onNext, 280);
  };

  const handleMultiToggle = (val: string) => {
    const curr = ((currentValue as string[]) ?? []);
    const updated = curr.includes(val)
      ? curr.filter((v) => v !== val)
      : [...curr, val];
    onAnswer(q.key, updated);
  };

  return (
    <div className="w-full max-w-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold text-white leading-snug">{q.headline}</h2>
        <p className="text-zinc-400 text-sm">{q.subheadline}</p>
      </div>

      {(q.type === "single") && (
        <div className="grid grid-cols-1 gap-2.5">
          {"options" in q && q.options.map((opt: any) => {
            const isSelected = currentValue === opt.value;
            return (
              <button
                key={String(opt.value)}
                onClick={() => handleSingle(opt.value)}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all duration-150 w-full group"
                style={{
                  background: isSelected ? "hsl(199 89% 48% / 0.15)" : "hsl(222 47% 11%)",
                  border: `1px solid ${isSelected ? "hsl(199 89% 48%)" : "hsl(222 47% 18%)"}`,
                }}
              >
                <span className="text-xl w-7 text-center flex-shrink-0">{opt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium text-sm">{opt.label}</div>
                  {"desc" in opt && <div className="text-zinc-500 text-xs mt-0.5">{opt.desc}</div>}
                </div>
                {isSelected && (
                  <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "hsl(199 89% 48%)" }}>
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "multi" && (
        <div className="grid grid-cols-1 gap-2.5">
          {"options" in q && q.options.map((opt: any) => {
            const sel = ((currentValue as string[]) ?? []).includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => handleMultiToggle(opt.value)}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all duration-150 w-full"
                style={{
                  background: sel ? "hsl(199 89% 48% / 0.15)" : "hsl(222 47% 11%)",
                  border: `1px solid ${sel ? "hsl(199 89% 48%)" : "hsl(222 47% 18%)"}`,
                }}
              >
                <span className="text-xl w-7 text-center flex-shrink-0">{opt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium text-sm">{opt.label}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{opt.desc}</div>
                </div>
                <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all"
                  style={{ background: sel ? "hsl(199 89% 48%)" : "transparent", border: `1px solid ${sel ? "hsl(199 89% 48%)" : "hsl(222 47% 30%)"}` }}>
                  {sel && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {q.type === "text-with-presets" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {"presets" in q && q.presets.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePreset(preset)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: textInput === preset ? "hsl(199 89% 48% / 0.2)" : "hsl(222 47% 11%)",
                  border: `1px solid ${textInput === preset ? "hsl(199 89% 48%)" : "hsl(222 47% 18%)"}`,
                  color: textInput === preset ? "hsl(199 89% 68%)" : "#a1a1aa",
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            value={textInput}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={"placeholder" in q ? q.placeholder : ""}
            rows={2}
            className="w-full px-4 py-3 rounded-xl text-white text-sm resize-none outline-none transition-all"
            style={{
              background: "hsl(222 47% 11%)",
              border: "1px solid hsl(222 47% 25%)",
              caretColor: "hsl(199 89% 48%)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "hsl(199 89% 48%)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "hsl(222 47% 25%)")}
          />
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {questionIndex > 0 && (
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl font-medium text-zinc-400 transition-all hover:text-white"
            style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}
          >
            ← Back
          </button>
        )}
        {(q.type === "multi" || q.type === "text-with-presets") && (
          <button
            onClick={onNext}
            disabled={!canProceed}
            className="flex-1 py-3 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: canProceed ? "hsl(199 89% 48%)" : "hsl(222 47% 18%)",
            }}
          >
            {isLast ? "Generate My Program →" : "Continue →"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

const LOADING_LINES = [
  "Analyzing your training profile...",
  "Selecting optimal exercise patterns...",
  "Calibrating volume for your experience level...",
  "Routing around limitations...",
  "Applying periodization logic...",
  "Building your first week...",
  "Finalizing coaching rationale...",
];

function GeneratingScreen() {
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineIdx((i) => (i + 1) % LOADING_LINES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center space-y-10">
      <div className="space-y-6">
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: "hsl(199 89% 48% / 0.4)" }} />
          <div className="absolute inset-2 rounded-full animate-pulse"
            style={{ background: "hsl(199 89% 48% / 0.6)" }} />
          <div className="absolute inset-4 rounded-full flex items-center justify-center"
            style={{ background: "hsl(199 89% 48%)" }}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">Your coach is building your plan</h2>
          <p key={lineIdx} className="text-zinc-400 text-sm animate-in fade-in duration-500">
            {LOADING_LINES[lineIdx]}
          </p>
        </div>
      </div>

      <div className="w-48 h-0.5 rounded-full overflow-hidden" style={{ background: "hsl(222 47% 18%)" }}>
        <div className="h-full rounded-full animate-[loading_3s_ease-in-out_infinite]"
          style={{ background: "hsl(199 89% 48%)", width: "60%" }} />
      </div>
    </div>
  );
}

// ─── Program Output ───────────────────────────────────────────────────────────

function ExerciseTable({ exercises }: { exercises: GuestProgramExercise[] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(222 47% 18%)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "hsl(222 47% 11%)" }}>
            <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Exercise</th>
            <th className="text-center px-3 py-2.5 text-zinc-400 font-medium w-14">Sets</th>
            <th className="text-center px-3 py-2.5 text-zinc-400 font-medium w-16">Reps</th>
            <th className="text-center px-3 py-2.5 text-zinc-400 font-medium w-16">Rest</th>
          </tr>
        </thead>
        <tbody>
          {exercises.map((ex, i) => (
            <tr key={i} style={{ borderTop: "1px solid hsl(222 47% 14%)", background: i % 2 === 0 ? "hsl(222 47% 9%)" : "hsl(222 47% 8%)" }}>
              <td className="px-4 py-3">
                <div className="text-white font-medium">{ex.name}</div>
                {ex.notes && <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{ex.notes}</div>}
              </td>
              <td className="px-3 py-3 text-center text-zinc-300">{ex.sets}</td>
              <td className="px-3 py-3 text-center text-zinc-300 whitespace-nowrap">{ex.reps}</td>
              <td className="px-3 py-3 text-center text-zinc-400 text-xs whitespace-nowrap">{ex.rest}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayCard({ day, defaultOpen }: { day: GuestProgramDay; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(222 47% 18%)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-white/5"
        style={{ background: "hsl(222 47% 11%)" }}
      >
        <div>
          <div className="text-white font-semibold text-sm">{day.name}</div>
          <div className="text-zinc-500 text-xs mt-0.5">{day.focus}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 text-xs">{day.exercises.length} exercises</span>
          <svg
            className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="p-4 space-y-3" style={{ background: "hsl(222 47% 8%)" }}>
          <ExerciseTable exercises={day.exercises} />
          {day.dayNotes && (
            <p className="text-zinc-500 text-xs px-1">{day.dayNotes}</p>
          )}
        </div>
      )}
    </div>
  );
}

function FollowupSection({
  deviceId,
  programName,
  onPaywallTrigger,
}: {
  deviceId: string;
  programName: string;
  onPaywallTrigger: () => void;
}) {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || loading || used) return;
    setLoading(true);
    setError(null);

    try {
      const data = await customFetch<{ response: string }>("/api/guest/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, message: message.trim() }),
      });
      setResponse(data.response ?? "");
      setUsed(true);
      // After user reads the response, surface the paywall
      setTimeout(onPaywallTrigger, 1200);
    } catch (err: any) {
      const isExhausted = (err as any)?.code === "TEASER_EXHAUSTED";
      if (isExhausted) {
        setUsed(true);
        onPaywallTrigger();
      } else {
        setError("Couldn't get a response. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [message, loading, used, deviceId, onPaywallTrigger]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (used && response) {
    return (
      <div className="space-y-4 rounded-xl p-5" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: "hsl(199 89% 48%)" }}>
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold mb-2" style={{ color: "hsl(199 89% 48%)" }}>Coach Response</div>
            <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{response}</div>
          </div>
        </div>
        <div className="pt-2 border-t" style={{ borderColor: "hsl(222 47% 18%)" }}>
          <p className="text-zinc-600 text-xs text-center">
            Want unlimited follow-ups and a fully adaptive program?{" "}
            <a href="/register" className="underline" style={{ color: "hsl(199 89% 48%)" }}>
              Create your free account →
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
      <div>
        <div className="text-white font-semibold text-sm mb-1">Ask a follow-up question</div>
        <div className="text-zinc-500 text-xs">Swap an exercise, adjust the schedule, or ask anything about this program.</div>
      </div>

      {error && (
        <div className="text-red-400 text-xs px-3 py-2 rounded-lg" style={{ background: "hsl(0 50% 15%)" }}>
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask about ${programName}...`}
          rows={2}
          className="flex-1 px-3 py-2.5 rounded-xl text-white text-sm resize-none outline-none transition-all"
          style={{
            background: "hsl(222 47% 8%)",
            border: "1px solid hsl(222 47% 22%)",
            caretColor: "hsl(199 89% 48%)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "hsl(199 89% 48%)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "hsl(222 47% 22%)")}
        />
        <button
          onClick={handleSubmit}
          disabled={!message.trim() || loading}
          className="px-4 py-2 rounded-xl font-medium text-white text-sm transition-all disabled:opacity-40 self-end"
          style={{ background: "hsl(199 89% 48%)" }}
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : "Send"}
        </button>
      </div>
    </div>
  );
}

function ProgramOutput({
  program,
  deviceId,
  onRegister,
  onPaywallTrigger,
}: {
  program: GuestProgram;
  deviceId: string;
  onRegister: () => void;
  onPaywallTrigger: () => void;
}) {
  return (
    <div className="w-full max-w-2xl space-y-6 pb-16">
      <div className="flex items-start gap-3 rounded-xl p-5"
        style={{ background: "hsl(199 89% 48% / 0.08)", border: "1px solid hsl(199 89% 48% / 0.25)" }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "hsl(199 89% 48%)" }}>
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <div className="text-xs font-semibold mb-1.5" style={{ color: "hsl(199 89% 58%)" }}>Your Coach</div>
          <p className="text-zinc-200 text-sm leading-relaxed">{program.coachIntro}</p>
        </div>
      </div>

      <div className="rounded-xl p-5 space-y-3"
        style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
        <div>
          <h1 className="text-xl font-bold text-white">{program.programName}</h1>
          <span className="inline-block mt-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
            style={{ background: "hsl(199 89% 48% / 0.15)", color: "hsl(199 89% 68%)" }}>
            {program.weeklyStructure}
          </span>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">{program.rationale}</p>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-white font-semibold text-sm px-1">Your Program</h3>
        {program.days.map((day, i) => (
          <DayCard key={day.dayNumber} day={day} defaultOpen={i === 0} />
        ))}
      </div>

      {program.coachNote && (
        <div className="rounded-xl px-5 py-4"
          style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
          <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wide">Week 1 Focus</div>
          <p className="text-zinc-300 text-sm leading-relaxed">{program.coachNote}</p>
          {program.progressionPrinciple && (
            <p className="text-zinc-500 text-xs mt-2 leading-relaxed">{program.progressionPrinciple}</p>
          )}
        </div>
      )}

      <FollowupSection deviceId={deviceId} programName={program.programName} onPaywallTrigger={onPaywallTrigger} />

      <div className="rounded-xl p-5 text-center space-y-3"
        style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
        <div>
          <div className="text-white font-bold text-base">Like what you see?</div>
          <div className="text-zinc-400 text-sm mt-1">
            Save this program, track sessions, and get a fully adaptive AI coach that evolves with you.
          </div>
        </div>
        <button
          onClick={onRegister}
          className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.02]"
          style={{ background: "hsl(199 89% 48%)" }}
        >
          Create Free Account →
        </button>
        <p className="text-zinc-600 text-xs">Free to start. No credit card.</p>
      </div>
    </div>
  );
}

// ─── Funnel event helper (fire-and-forget, never throws) ─────────────────────

async function trackFunnelEvent(deviceId: string, event: string, metadata?: Record<string, unknown>) {
  try {
    await fetch("/api/guest/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, event, ...(metadata ? { metadata } : {}) }),
    });
  } catch { /* silent */ }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GuestStart() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<GuestStep>("idle");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<OnboardingAnswers>>({});
  const [program, setProgram] = useState<GuestProgram | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const hasInitialized = useRef(false);

  const { deviceId, guestSession } = useGuestSession(false);

  // ── Return visitor handling ────────────────────────────────────────────────
  // Runs once after the guest session loads to restore the correct UI state.
  useEffect(() => {
    if (hasInitialized.current || !guestSession) return;
    hasInitialized.current = true;

    // Already converted → send to app
    if (guestSession.status === "converted") {
      navigate("/chat");
      return;
    }

    // Teaser already exhausted
    if (guestSession.teaserUsesCount >= GUEST_CONFIG.TEASER_TOTAL_LIMIT) {
      const savedProgram = (guestSession.metadata as any)?.firstProgramOutput as GuestProgram | undefined;
      if (savedProgram) {
        // Show program + paywall overlay (feels like continuation)
        setProgram(savedProgram);
        setStep("output");
        setShowPaywall(true);
        if (deviceId) trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.PAYWALL_SHOWN, { reason: "return_visitor" });
      } else {
        // No program saved → show locked state
        setStep("locked");
      }
      return;
    }

    // Program generated, teaser not yet exhausted → restore output
    if (guestSession.firstProgramGeneratedAt) {
      const savedProgram = (guestSession.metadata as any)?.firstProgramOutput as GuestProgram | undefined;
      if (savedProgram) {
        setProgram(savedProgram);
        setStep("output");
      }
      return;
    }

    // Onboarding completed but no program → resume from last question
    if (guestSession.onboardingCompletedAt && !guestSession.firstProgramGeneratedAt) {
      const savedAnswers = (guestSession.metadata as any)?.onboardingAnswers as Partial<OnboardingAnswers> | undefined;
      if (savedAnswers) {
        setAnswers(savedAnswers);
        setQuestionIndex(QUESTIONS.length - 1);
        setStep("onboarding");
      }
      return;
    }

    // Onboarding started but not completed → resume from step 1
    if (guestSession.onboardingStartedAt && !guestSession.onboardingCompletedAt) {
      setStep("onboarding");
    }
    // else: idle — no change needed
  }, [guestSession, deviceId, navigate]);

  const handleStart = useCallback(async () => {
    setStep("onboarding");
    if (deviceId) {
      try {
        await customFetch(`/api/guest/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
      } catch { /* non-blocking — session may already exist */ }
    }
  }, [deviceId]);

  const handleAnswer = useCallback((key: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleBack = useCallback(() => {
    if (questionIndex === 0) {
      setStep("idle");
    } else {
      setQuestionIndex((i) => i - 1);
    }
  }, [questionIndex]);

  const handleNext = useCallback(async () => {
    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex((i) => i + 1);

      if (questionIndex === 0 && deviceId) {
        try {
          await customFetch(`/api/guest/session/${deviceId}`, {
            method: "GET",
          });
        } catch { /* non-blocking */ }
      }
    } else {
      await handleGenerate();
    }
  }, [questionIndex, answers, deviceId]);

  const handleGenerate = useCallback(async () => {
    if (!deviceId) return;

    const finalAnswers: OnboardingAnswers = {
      goal: (answers.goal as string) ?? "Improve Fitness",
      experience: (answers.experience as string) ?? "Beginner",
      frequency: (answers.frequency as number) ?? 3,
      equipment: (answers.equipment as string[]) ?? ["Bodyweight Only"],
      injuries: (answers.injuries as string) ?? "None",
      style: (answers.style as string) ?? "Flexible / Mixed",
      timeline: (answers.timeline as string) ?? "Ongoing",
      sport: (answers.sport as string) ?? "None",
    };

    setStep("generating");
    setGenError(null);

    try {
      // Save onboarding answers (customFetch throws on non-2xx; returns parsed body on success)
      await customFetch<{ session: unknown }>("/api/guest/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, answers: finalAnswers }),
      });

      // Generate program
      const genData = await customFetch<{ program: GuestProgram }>("/api/guest/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });

      if (!genData.program) throw new Error("No program returned");
      setProgram(genData.program);
      setStep("output");
    } catch (err: any) {
      setGenError(err.message ?? "Something went wrong");
      setStep("onboarding");
      setQuestionIndex(QUESTIONS.length - 1);
    }
  }, [answers, deviceId]);

  const handlePaywallTrigger = useCallback(async () => {
    setShowPaywall(true);
    if (deviceId) {
      await trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.PAYWALL_SHOWN);
      // Record paywallShownAt on the session
      try {
        await fetch(`/api/guest/session/${deviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paywallShownAt: new Date().toISOString() }),
        });
      } catch { /* non-blocking */ }
    }
  }, [deviceId]);

  const handleRegister = useCallback(() => {
    if (deviceId) trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.PAYWALL_CTA_CLICKED);
    navigate("/register?from=teaser");
  }, [navigate, deviceId]);

  const handleSignIn = useCallback(() => {
    if (deviceId) trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.PAYWALL_SIGNIN_CLICKED);
    navigate("/login?from=teaser");
  }, [navigate, deviceId]);

  return (
    <div className="min-h-screen" style={{ background: "hsl(222 47% 7%)" }}>
      {step !== "idle" && step !== "generating" && step !== "locked" && (
        <div className="fixed top-0 left-0 right-0 z-10 px-4 py-3 flex items-center gap-3"
          style={{ background: "hsl(222 47% 7% / 0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid hsl(222 47% 14%)" }}>
          <img src={logoSrc} alt="TrainChat" className="h-6" />
          {step === "onboarding" && (
            <>
              <div className="flex-1 flex items-center gap-2 ml-2">
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "hsl(222 47% 18%)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${((questionIndex + 1) / QUESTIONS.length) * 100}%`,
                      background: "hsl(199 89% 48%)",
                    }}
                  />
                </div>
                <span className="text-zinc-500 text-xs whitespace-nowrap">{questionIndex + 1} / {QUESTIONS.length}</span>
              </div>
            </>
          )}
          {step === "output" && (
            <div className="ml-auto">
              <button onClick={handleRegister} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: "hsl(199 89% 48%)" }}>
                Save Program
              </button>
            </div>
          )}
        </div>
      )}

      <div className={`flex justify-center px-4 ${step !== "idle" && step !== "generating" && step !== "locked" ? "pt-20 pb-8" : ""}`}>
        {step === "idle" && <EntryScreen onStart={handleStart} />}

        {step === "onboarding" && (
          <div className="w-full max-w-xl pt-8">
            {genError && (
              <div className="mb-4 p-3 rounded-xl text-red-400 text-sm" style={{ background: "hsl(0 50% 12%)", border: "1px solid hsl(0 50% 20%)" }}>
                {genError} — Please try again.
              </div>
            )}
            <OnboardingStep
              key={questionIndex}
              questionIndex={questionIndex}
              answers={answers}
              onAnswer={handleAnswer}
              onBack={handleBack}
              onNext={handleNext}
            />
          </div>
        )}

        {step === "generating" && <GeneratingScreen />}

        {step === "output" && program && (
          <ProgramOutput
            program={program}
            deviceId={deviceId ?? ""}
            onRegister={handleRegister}
            onPaywallTrigger={handlePaywallTrigger}
          />
        )}

        {step === "locked" && (
          <LockedScreen
            onUnlock={handleRegister}
            onSignIn={handleSignIn}
          />
        )}
      </div>

      {/* Premium paywall overlay — shown after teaser is exhausted */}
      {showPaywall && (
        <GuestPaywallModal
          deviceId={deviceId}
          onRegister={handleRegister}
          onSignIn={handleSignIn}
        />
      )}
    </div>
  );
}
