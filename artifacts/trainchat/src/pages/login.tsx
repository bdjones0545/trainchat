import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

const DEVICE_ID_KEY = "trainchat_device_id";

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

type LoginForm = z.infer<typeof loginSchema>;

/**
 * Attempt to merge any existing guest session into the just-authenticated account.
 * Silent — never throws; merge failure is non-fatal.
 */
async function tryConvertGuestSession(deviceId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/guest/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ deviceId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function trackGuestEvent(deviceId: string, event: string) {
  try {
    await fetch("/api/guest/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, event }),
    });
  } catch { /* silent */ }
}

export default function Login() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const fromTeaser = params.get("from") === "teaser";

  // Track return user signin when arriving from paywall flow
  useEffect(() => {
    if (!fromTeaser) return;
    const deviceId = (() => { try { return localStorage.getItem(DEVICE_ID_KEY); } catch { return null; } })();
    if (deviceId) trackGuestEvent(deviceId, "user_returned_post_conversion");
  }, [fromTeaser]);

  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const queryClient = useQueryClient();
  const login = useLogin();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginForm) {
    setError(null);
    login.mutate(
      { data },
      {
        onSuccess: async (result) => {
          await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });

          // ── Guest-to-user merge on login ──────────────────────────────
          const deviceId = (() => {
            try { return localStorage.getItem(DEVICE_ID_KEY); } catch { return null; }
          })();

          if (deviceId) {
            setConverting(true);
            const merged = await tryConvertGuestSession(deviceId);
            setConverting(false);

            if (merged) {
              // Guest session merged — user's profile is now populated,
              // starter conversation created, onboardingComplete = true.
              // Always route to chat for a seamless continuation experience.
              await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
              setLocation("/chat");
              return;
            }
          }

          // No guest session or merge failed — route based on onboarding status
          // The backend self-heals this flag, so it is always accurate.
          const onboardingComplete = result?.user?.onboardingComplete ?? false;
          if (process.env.NODE_ENV !== "production") {
            console.info(
              `[routing] login: onboardingComplete=${onboardingComplete} → ${onboardingComplete ? "/chat" : "/onboarding"}`,
            );
          }
          setLocation(onboardingComplete ? "/chat" : "/onboarding");
        },
        onError: (err: unknown) => {
          const apiErr = err as { data?: { error?: string } };
          setError(apiErr?.data?.error ?? "Invalid email or password");
        },
      }
    );
  }

  const isLoading = login.isPending || converting;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img src={trainChatLogo} alt="TrainChat" className="h-10 object-contain" />
        </div>

        {/* Teaser continuation badge */}
        {fromTeaser && (
          <div className="flex justify-center mb-6">
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{
                background: "hsl(143 70% 45% / 0.12)",
                color: "hsl(143 70% 55%)",
                border: "1px solid hsl(143 70% 45% / 0.25)",
              }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Your plan is saved and ready to continue
            </span>
          </div>
        )}

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {fromTeaser ? "Continue Your Journey" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {fromTeaser ? "Sign in to pick up exactly where you left off." : "Welcome back. Let's get to work."}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              data-testid="input-email"
              type="email"
              autoComplete="email"
              className="w-full px-3.5 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
              placeholder="you@example.com"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              data-testid="input-password"
              type="password"
              autoComplete="current-password"
              className="w-full px-3.5 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
              placeholder="••••••••"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          <button
            data-testid="button-submit"
            type="submit"
            disabled={isLoading}
            className="w-full py-3 mt-2 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 active:scale-[0.99]"
          >
            {converting
              ? "Restoring your progress..."
              : login.isPending
                ? "Signing in..."
                : fromTeaser
                  ? "Continue My Journey"
                  : "Sign in"}
          </button>
        </form>

        {/* Register link */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <button
            onClick={() => setLocation(fromTeaser ? "/register?from=teaser" : "/register")}
            className="text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Create one
          </button>
        </p>
      </div>
    </div>
  );
}
