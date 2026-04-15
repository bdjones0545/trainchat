import { X, Zap, Check, Star, Crown } from "lucide-react";
import { useState, useEffect } from "react";

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  badge?: string;
  badgeColor?: string;
  description: string;
  features: string[];
  priceId?: string;
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 19,
    yearlyPrice: 182,
    description: "Start training with AI guidance",
    features: [
      "75 AI coaching messages/month",
      "Full program building",
      "Basic exercise library",
      "Conversation history",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 39,
    yearlyPrice: 374,
    badge: "Most Popular",
    badgeColor: "text-primary border-primary/30 bg-primary/10",
    description: "Full coaching intelligence activated",
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
    description: "Maximum performance mode",
    features: [
      "Everything in Pro",
      "Priority AI response speed",
      "Advanced adaptation logic",
      "High-performance mode",
      "Early access to new features",
      "Deepest performance memory",
    ],
  },
];

interface Props {
  onClose: () => void;
  onSelectPlan: (planId: string, priceId?: string) => void;
  currentPlan?: string;
}

export default function PricingModal({ onClose, onSelectPlan, currentPlan = "free" }: Props) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [plans, setPlans] = useState<Plan[]>(PLANS);

  useEffect(() => {
    fetch("/api/subscription/products", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (!data?.products?.length) return;
        setPlans((prev) =>
          prev.map((plan) => {
            const match = data.products.find((p: any) =>
              p.name?.toLowerCase().includes(plan.id)
            );
            if (!match?.prices?.length) return plan;
            const price = match.prices.find((pr: any) =>
              billing === "monthly"
                ? pr.recurring?.interval === "month"
                : pr.recurring?.interval === "year"
            ) ?? match.prices[0];
            return { ...plan, priceId: price?.id };
          })
        );
      })
      .catch(() => {});
  }, [billing]);

  const yearlyDiscount = Math.round((1 - (182 / (19 * 12))) * 100);

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
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Training Plans</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Unlock your full potential</h2>
            <p className="text-sm text-muted-foreground">
              Your AI performance architect. Cancel anytime.
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

          {/* Plans grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {plans.map((plan) => {
              const price = billing === "monthly" ? plan.monthlyPrice : Math.round(plan.yearlyPrice / 12);
              const isCurrentPlan = plan.id === currentPlan;

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
                    onClick={() => onSelectPlan(plan.id, plan.priceId)}
                    disabled={isCurrentPlan}
                    className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                      isCurrentPlan
                        ? "bg-accent/40 text-muted-foreground cursor-default border border-border"
                        : plan.highlighted
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
                        : "bg-card border border-border text-foreground hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
                    }`}
                  >
                    {isCurrentPlan ? "Current Plan" : `Get ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-6 py-4 border-t border-border/50">
            {["Secure payments via Stripe", "Cancel anytime", "No hidden fees"].map((txt) => (
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
