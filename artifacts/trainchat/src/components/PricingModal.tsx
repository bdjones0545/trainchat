import { X, Zap, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { analytics } from "@/lib/analytics";

interface Props {
  onClose: () => void;
  onSelectPlan?: (planId: string, priceId?: string) => void;
  currentPlan?: string;
}

const FEATURES = [
  "Unlimited AI coaching conversations",
  "Adaptive training — readiness-based adjustments",
  "Long-term memory — your coach remembers you",
  "Program evolution week-over-week",
  "Session logging & progress tracking",
  "Proactive insights engine",
  "Full exercise library",
  "Priority AI response speed",
  "Advanced adaptation logic",
  "Deep performance memory",
];

export default function PricingModal({ onClose, onSelectPlan, currentPlan = "free" }: Props) {
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSubscribed =
    currentPlan === "starter" ||
    currentPlan === "pro" ||
    currentPlan === "elite" ||
    currentPlan === "trainchat";

  async function handleSubscribe() {
    if (isSubscribed) return;
    setErrorMsg(null);

    if (onSelectPlan) {
      onSelectPlan("trainchat", "monthly");
      return;
    }

    setLoadingPlan(true);
    analytics.track("checkout_started", { plan: "trainchat", billing: "monthly" });
    try {
      const r = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "trainchat", billingInterval: "monthly" }),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setErrorMsg(data.error ?? "Failed to start checkout. Please try again.");
        setLoadingPlan(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg("Checkout session URL not returned. Please try again.");
        setLoadingPlan(false);
      }
    } catch {
      setErrorMsg("Unable to reach payment service. Please try again.");
      setLoadingPlan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl border border-primary/15 bg-[#080e18] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Zap className="w-3 h-3 text-primary" />
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Live Coaching System</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">This isn't a workout generator.</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              It's a live coaching system that adapts to you.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400 text-center">
              {errorMsg}
            </div>
          )}

          {/* Single subscription card */}
          <div className="relative rounded-xl border border-primary/40 bg-primary/5 p-6 mb-6">
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold border border-primary/30 bg-primary/10 text-primary whitespace-nowrap">
              Everything included
            </div>

            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-foreground mb-1">TrainChat</h3>
              <div className="flex items-baseline gap-1 justify-center">
                <span className="text-4xl font-bold text-foreground">$49.99</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Monthly recurring · Cancel anytime</p>
            </div>

            <ul className="space-y-2.5 mb-6">
              {FEATURES.map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-[12px] text-muted-foreground leading-snug">{feat}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleSubscribe}
              disabled={isSubscribed || loadingPlan}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 ${
                isSubscribed
                  ? "bg-accent/40 text-muted-foreground cursor-default border border-border"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
              }`}
            >
              {loadingPlan ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Redirecting…
                </>
              ) : isSubscribed ? (
                "Current Plan"
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  Get TrainChat
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center gap-6 py-4 border-t border-border/50">
            {["Secure payments via Stripe", "Cancel anytime", "Your training data stays yours"].map((txt) => (
              <div key={txt} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-primary/50" />
                <span className="text-[11px] text-muted-foreground">{txt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
