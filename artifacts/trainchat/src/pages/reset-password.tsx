import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password is too long"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

type TokenState = "validating" | "valid" | "invalid" | "expired" | "used";
type SubmitState = "idle" | "loading" | "success" | "error";

function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  const color =
    score <= 1 ? "#ef4444" :
    score === 2 ? "#f97316" :
    score === 3 ? "#eab308" :
    "#22c55e";

  const label =
    score <= 1 ? "Weak" :
    score === 2 ? "Fair" :
    score === 3 ? "Good" :
    "Strong";

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i <= score ? color : "hsl(var(--border))" }}
          />
        ))}
      </div>
      <p className="text-xs" style={{ color }}>{label}</p>
    </div>
  );
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";

  const [tokenState, setTokenState] = useState<TokenState>("validating");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const passwordValue = form.watch("password");

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }

    fetch(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data: { valid: boolean; reason?: string }) => {
        if (data.valid) {
          setTokenState("valid");
        } else if (data.reason === "expired") {
          setTokenState("expired");
        } else if (data.reason === "used") {
          setTokenState("used");
        } else {
          setTokenState("invalid");
        }
      })
      .catch(() => setTokenState("invalid"));
  }, [token]);

  async function onSubmit(data: FormData) {
    setSubmitState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password: data.password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }
      setSubmitState("success");
    } catch (err: any) {
      setSubmitState("error");
      setErrorMsg(err?.message ?? "Something went wrong. Please try again.");
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (tokenState === "validating") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Invalid / expired / used token states ──────────────────────────────────

  if (tokenState !== "valid") {
    const config = {
      expired: {
        title: "Link expired",
        message: "This password reset link has expired. Reset links are valid for 60 minutes.",
      },
      used: {
        title: "Link already used",
        message: "This password reset link has already been used. Please request a new one.",
      },
      invalid: {
        title: "Invalid link",
        message: "This password reset link is invalid or has already been used.",
      },
    }[tokenState] ?? {
      title: "Invalid link",
      message: "This reset link is not valid.",
    };

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-10">
            <img src={trainChatLogo} alt="TrainChat" className="h-10 object-contain" />
          </div>

          <div className="flex justify-center mb-6">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "hsl(0 84% 60% / 0.12)", border: "1px solid hsl(0 84% 60% / 0.25)" }}
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#ef4444" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-foreground tracking-tight mb-3">
            {config.title}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            {config.message}
          </p>

          <button
            onClick={() => setLocation("/forgot-password")}
            className="w-full py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all duration-150 active:scale-[0.99] mb-4"
          >
            Request a new link
          </button>

          <button
            onClick={() => setLocation("/login")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (submitState === "success") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-10">
            <img src={trainChatLogo} alt="TrainChat" className="h-10 object-contain" />
          </div>

          <div className="flex justify-center mb-6">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "hsl(143 70% 45% / 0.12)", border: "1px solid hsl(143 70% 45% / 0.25)" }}
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: "hsl(143 70% 55%)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-foreground tracking-tight mb-3">
            Password updated
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Your password has been reset. You can now sign in with your new password.
          </p>

          <button
            onClick={() => setLocation("/login")}
            className="w-full py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-all duration-150 active:scale-[0.99]"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Reset form ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-10">
          <img src={trainChatLogo} alt="TrainChat" className="h-10 object-contain" />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Set a new password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a strong password — at least 8 characters.
          </p>
        </div>

        {submitState === "error" && errorMsg && (
          <div className="mb-6 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {errorMsg}
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                data-testid="input-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                autoFocus
                className="w-full px-3.5 py-3 pr-10 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
                placeholder="••••••••"
                {...form.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
            <PasswordStrengthBar password={passwordValue} />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Confirm new password
            </label>
            <input
              data-testid="input-confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="w-full px-3.5 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
              placeholder="••••••••"
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>
            )}
          </div>

          <button
            data-testid="button-submit"
            type="submit"
            disabled={submitState === "loading"}
            className="w-full py-3 mt-2 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.99]"
          >
            {submitState === "loading" ? "Updating password..." : "Update password"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <button
            onClick={() => setLocation("/login")}
            className="text-primary hover:text-primary/80 font-medium transition-colors"
          >
            ← Back to sign in
          </button>
        </p>
      </div>
    </div>
  );
}
