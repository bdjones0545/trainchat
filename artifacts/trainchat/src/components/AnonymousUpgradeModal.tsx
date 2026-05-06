import { X, Zap, Shield, ArrowRight, Loader2, Crown, Star } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { getOrCreateDeviceId } from "@/lib/deviceId";

const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
};

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormData = z.infer<typeof schema>;

interface Props {
  planId: string;
  billingInterval: "monthly" | "yearly";
  onClose: () => void;
}

function PlanIcon({ planId }: { planId: string }) {
  if (planId === "elite") return <Crown className="w-6 h-6 text-amber-400" />;
  if (planId === "pro") return <Star className="w-6 h-6 text-primary" />;
  return <Zap className="w-6 h-6 text-primary" />;
}

export default function AnonymousUpgradeModal({ planId, billingInterval, onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"form" | "loading">("form");
  const [error, setError] = useState<string | null>(null);

  const planName = PLAN_NAMES[planId] ?? planId;
  const isElite = planId === "elite";

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setStep("loading");

    const deviceId = getOrCreateDeviceId();

    try {
      // Step 1: Register — upgrades the anonymous user in-place, preserving all data
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, deviceId }),
      });

      if (!regRes.ok) {
        const body = await regRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Registration failed. Please try again.");
      }

      const { user } = await regRes.json();
      // Immediately update the React Query cache so the app sees the new registered user
      queryClient.setQueryData(getGetMeQueryKey(), user);
      queryClient.invalidateQueries({ queryKey: ["subscription"] });

      // Step 2: Start Stripe checkout using lookup-key based endpoint
      const checkoutRes = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: planId, billingInterval }),
      });

      if (!checkoutRes.ok) {
        const body = await checkoutRes.json().catch(() => ({}));
        // Registration succeeded — user has a free account with data preserved.
        // Redirect to billing so they can try checkout again.
        console.error("[AnonymousUpgradeModal] Checkout failed after registration:", body.error);
        onClose();
        window.location.href = "/billing";
        return;
      }

      const { url } = await checkoutRes.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      setStep("form");
      setError(err.message ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={step === "form" ? onClose : undefined}
      />

      <div
        className="relative w-full max-w-md rounded-2xl border border-primary/20 bg-[#0c1220] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {step === "form" && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="p-8">
          {step === "loading" ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 mx-auto">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Setting up your account…</h2>
              <p className="text-sm text-muted-foreground">
                Your program is saved. Redirecting you to checkout.
              </p>
            </div>
          ) : (
            <>
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 mx-auto border ${
                  isElite
                    ? "bg-amber-400/10 border-amber-400/20"
                    : "bg-primary/10 border-primary/20"
                }`}
              >
                <PlanIcon planId={planId} />
              </div>

              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  Create your account to unlock {planName}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We'll save your current system and attach {planName} ({billingInterval}) to your account.
                </p>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/10 mb-6">
                <Shield className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Your current training program is preserved — nothing is lost.
                </span>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Name
                  </label>
                  <input
                    type="text"
                    autoComplete="name"
                    className="w-full px-3.5 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
                    placeholder="Your name"
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <p className="mt-1 text-xs text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    className="w-full px-3.5 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
                    placeholder="you@example.com"
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p className="mt-1 text-xs text-destructive">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full px-3.5 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
                    placeholder="At least 8 characters"
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p className="mt-1 text-xs text-destructive">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all duration-150 ${
                    isElite
                      ? "bg-amber-400 text-black hover:bg-amber-400/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <p className="text-center text-[11px] text-muted-foreground/50 mt-4">
                Secure payments via Stripe · Cancel anytime · No hidden fees
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
