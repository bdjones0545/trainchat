import { X, Zap, Check, Star, Crown, Loader2 } from "lucide-react";
import { useState } from "react";

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  badge?: string;
  badgeColor?: string;
  headline: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  ctaLabel: string;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 19,
    yearlyPrice: 182,
    headline: "Your program, saved and evolving.",
    description: "Build your training system and keep progressing.",
    ctaLabel: "Save my training system",
    features: [
      "Full program building",
      "Basic exercise library",
      "Conversation history",
      "Save and return to your system",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 39,
    yearlyPrice: 374,
    badge: "Most Popular",
    badgeColor: "text-primary border-primary/30 bg-primary/10",
    headline: "Your coach remembers you.",
    description: "Adaptive coaching with long-term memory and evolving programming.",
    ctaLabel: "Start coaching with Pro",
    highlighted: true,
    features: [
      "Unlimited AI coaching",
      "Adaptive training (readiness-based)",
      "Long-term memory — coach remembers you",
      "Program evolution week-over-week",
      "Session logging & progress tracking",
      "Proactive insights engine",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    monthlyPrice: 79,
    yearlyPrice: 758,
    badge: "High Performance",
    badgeColor: "text-amber-400 border-amber-400/30 bg-amber-400/10",
    headline: "Maximum coaching intelligence.",
    description: "Priority adaptation, deeper performance memory, and early access systems.",
    ctaLabel: "Activate Elite",
    features: [
      "Everything in Pro",
      "Priority AI response speed",
      "Advanced adaptation logic",
      "Deepest performance memory",
      "Early access to new features",
    ],
  },
];

interface Props {
  onClose: () => void;
  onSelectPlan?: (planId: string, priceId?: string) => void;
  currentPlan?: string;
}

export default function PricingModal({ onClose, onSelectPlan, currentPlan = "free" }: Props) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const yearlyDiscount = Math.round((1 - (182 / (19 * 12))) * 100);

  async function handleSelectPlan(plan: Plan) {
    if (plan.id === currentPlan) return;
    setErrorMsg(null);

    if (onSelectPlan) {
      onSelectPlan(plan.id, billing);
      return;
    }

    setLoadingPlan(plan.id);
    try {
      const r = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: plan.id, billingInterval: billing }),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setErrorMsg(data.error ?? "Failed to start checkout. Please try again.");
        setLoadingPlan(null);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg("Checkout session URL not returned. Please try again.");
        setLoadingPlan(null);
      }
    } catch {
      setErrorMsg("Unable to reach payment service. Please try again.");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-3xl rounded-2xl border border-primary/15 bg-[#080e18] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8 pb-2">
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

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                billing === "monthly"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                billing === "yearly"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/20">
                Save {yearlyDiscount}%
              </span>
            </button>
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400 text-center">
              {errorMsg}
            </div>
          )}

          {/* Plans grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {PLANS.map((plan) => {
              const price = billing === "monthly" ? plan.monthlyPrice : Math.round(plan.yearlyPrice / 12);
              const isCurrentPlan = plan.id === currentPlan;
              const isLoading = loadingPlan === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-xl border p-5 flex flex-col transition-all ${
                    plan.highlighted
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card/50"
                  }`}
                >
                  {plan.badge && (
                    <div className={`absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${plan.badgeColor}`}>
                      {plan.id === "elite" ? <Crown className="w-3 h-3 inline mr-1" /> : <Star className="w-3 h-3 inline mr-1" />}
                      {plan.badge}
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-foreground mb-1">{plan.name}</h3>
                    <p className="text-[12px] font-semibold text-foreground/80 leading-snug mb-1">{plan.headline}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">{plan.description}</p>

                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-foreground">${price}</span>
                      <span className="text-xs text-muted-foreground">/mo</span>
                    </div>
                    {billing === "yearly" && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        ${plan.yearlyPrice}/year
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-[11px] text-muted-foreground leading-snug">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isCurrentPlan || isLoading || loadingPlan !== null}
                    className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 ${
                      isCurrentPlan
                        ? "bg-accent/40 text-muted-foreground cursor-default border border-border"
                        : plan.highlighted
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
                        : "bg-card border border-border text-foreground hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] disabled:opacity-60"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Redirecting…
                      </>
                    ) : isCurrentPlan ? (
                      "Current Plan"
                    ) : (
                      plan.ctaLabel
                    )}
                  </button>
                </div>
              );
            })}
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
