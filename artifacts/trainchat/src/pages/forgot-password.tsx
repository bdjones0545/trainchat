import { useState } from "react";
import { useLocation } from "wouter";
import { useNoIndex } from "@/hooks/useNoIndex";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type FormData = z.infer<typeof schema>;

type State = "idle" | "loading" | "success" | "error";

export default function ForgotPassword() {
  useNoIndex();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(data: FormData) {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: data.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }
      setState("success");
    } catch (err: any) {
      setState("error");
      setErrorMsg(err?.message ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img src={trainChatLogo} alt="TrainChat" className="h-10 object-contain" />
        </div>

        {state === "success" ? (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "hsl(199 89% 48% / 0.12)", border: "1px solid hsl(199 89% 48% / 0.25)" }}
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#38bdf8" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight mb-3">
              Check your inbox
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              If an account exists for that email, we've sent password reset instructions. The link expires in 60 minutes.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Didn't receive it? Check your spam folder or{" "}
              <button
                onClick={() => { setState("idle"); form.reset(); }}
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                try again
              </button>
              .
            </p>
            <button
              onClick={() => setLocation("/login")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                Forgot your password?
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            {state === "error" && errorMsg && (
              <div className="mb-6 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {errorMsg}
              </div>
            )}

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  data-testid="input-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  className="w-full px-3.5 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
                  placeholder="you@example.com"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              <button
                data-testid="button-submit"
                type="submit"
                disabled={state === "loading"}
                className="w-full py-3 mt-2 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.99]"
              >
                {state === "loading" ? "Sending..." : "Send reset link"}
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
          </>
        )}
      </div>
    </div>
  );
}
