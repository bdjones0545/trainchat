import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, CreditCard, Calendar, RefreshCw, AlertCircle, CheckCircle, XCircle, Zap, Crown, Star } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useState } from "react";
import PricingModal from "@/components/PricingModal";

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchSubscription() {
  const r = await customFetch("/api/subscription");
  if (!r.ok) throw new Error("Failed to load subscription");
  return r.json();
}

async function fetchActiveSystem() {
  const r = await customFetch("/api/training-system/active");
  if (!r.ok) return null;
  return r.json();
}

async function openPortal() {
  const r = await customFetch("/api/subscription/portal", { method: "POST" });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to open billing portal");
  }
  const { url } = await r.json();
  return url as string;
}

async function startCheckout(priceId: string) {
  const r = await customFetch("/api/subscription/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to start checkout");
  }
  const { url } = await r.json();
  return url as string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    active: {
      label: "Active",
      icon: <CheckCircle className="w-3 h-3" />,
      className: "text-green-400 bg-green-400/10 border-green-400/20",
    },
    trialing: {
      label: "Trial",
      icon: <Zap className="w-3 h-3" />,
      className: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    },
    past_due: {
      label: "Payment due",
      icon: <AlertCircle className="w-3 h-3" />,
      className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    },
    canceled_within_period: {
      label: "Canceling",
      icon: <XCircle className="w-3 h-3" />,
      className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    },
    canceled: {
      label: "Canceled",
      icon: <XCircle className="w-3 h-3" />,
      className: "text-red-400 bg-red-400/10 border-red-400/20",
    },
    free: {
      label: "Free plan",
      icon: null,
      className: "text-muted-foreground bg-muted/30 border-border",
    },
  };

  const c = config[status] ?? config.free;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

function PlanIcon({ plan }: { plan: string }) {
  if (plan === "elite") return <Crown className="w-5 h-5 text-amber-400" />;
  if (plan === "pro") return <Star className="w-5 h-5 text-primary" />;
  return <Zap className="w-5 h-5 text-muted-foreground" />;
}

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
};

const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 19, yearly: 182 },
  pro: { monthly: 39, yearly: 374 },
  elite: { monthly: 79, yearly: 758 },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showPricing, setShowPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
    staleTime: 30_000,
  });

  const { data: activeProgram } = useQuery({
    queryKey: ["training-system-active"],
    queryFn: fetchActiveSystem,
    staleTime: 60_000,
  });

  const portalMutation = useMutation({
    mutationFn: openPortal,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  async function handleSelectPlan(_planId: string, priceId?: string) {
    setShowPricing(false);
    if (!priceId) {
      setError("Price ID not available. Please try again.");
      return;
    }
    try {
      const url = await startCheckout(priceId);
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err.message);
    }
  }

  const plan = sub?.plan ?? "free";
  const planStatus = sub?.planStatus ?? "active";
  const billingInterval = sub?.billingInterval ?? null;
  const currentPeriodEnd = sub?.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd = sub?.cancelAtPeriodEnd ?? false;
  const trialEnd = sub?.trialEnd ?? null;
  const hasActiveAccess = sub?.hasActiveAccess ?? false;
  const isPaid = plan !== "free";

  // Effective status label for badge
  let displayStatus = planStatus;
  if (isPaid && cancelAtPeriodEnd) displayStatus = "canceled_within_period";
  if (!isPaid) displayStatus = "free";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/chat")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Billing & Subscription</h1>
            <p className="text-sm text-muted-foreground">Manage your plan and payment details</p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-2.5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">
              ✕
            </button>
          </div>
        )}

        {/* Active program callout */}
        {activeProgram?.name && (
          <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Active program</p>
              <p className="text-sm font-semibold text-foreground truncate">{activeProgram.name}</p>
            </div>
            {activeProgram.days?.length > 0 && (
              <div className="ml-auto flex-shrink-0">
                <span className="text-xs text-muted-foreground">{activeProgram.days.length} day{activeProgram.days.length !== 1 ? "s" : ""}/wk</span>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-card/50 border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current plan card */}
            <div className="rounded-xl border border-border bg-card/50 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <PlanIcon plan={plan} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                      Current plan
                    </p>
                    <p className="text-lg font-bold text-foreground">{PLAN_NAMES[plan] ?? plan}</p>
                  </div>
                </div>
                <StatusBadge status={displayStatus} />
              </div>

              {isPaid && billingInterval && (
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl font-bold text-foreground">
                    ${billingInterval === "yearly"
                      ? Math.round((PLAN_PRICES[plan]?.yearly ?? 0) / 12)
                      : (PLAN_PRICES[plan]?.monthly ?? 0)}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                  {billingInterval === "yearly" && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (${PLAN_PRICES[plan]?.yearly ?? 0}/year)
                    </span>
                  )}
                </div>
              )}

              {isPaid && billingInterval && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="capitalize">{billingInterval} billing</span>
                </div>
              )}

              {!isPaid && (
                <p className="text-sm text-muted-foreground">
                  You're on the free plan with {sub?.features ? "limited" : "no"} access to premium features.
                </p>
              )}
            </div>

            {/* Subscription details */}
            {isPaid && (
              <div className="rounded-xl border border-border bg-card/50 p-6 space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Subscription details</h2>

                <div className="space-y-3">
                  {currentPeriodEnd && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <RefreshCw className="w-3.5 h-3.5" />
                        {cancelAtPeriodEnd ? "Access ends" : "Renews on"}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(currentPeriodEnd)}
                      </span>
                    </div>
                  )}

                  {trialEnd && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Zap className="w-3.5 h-3.5" />
                        Trial ends
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(trialEnd)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CreditCard className="w-3.5 h-3.5" />
                      Payment method
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      Managed via Stripe
                    </span>
                  </div>
                </div>

                {cancelAtPeriodEnd && currentPeriodEnd && (
                  <div className="mt-2 p-3 rounded-lg bg-amber-400/10 border border-amber-400/20">
                    <p className="text-xs text-amber-400 leading-relaxed">
                      Your subscription is set to cancel on {formatDate(currentPeriodEnd)}. You'll retain full access until then.
                    </p>
                  </div>
                )}

                {planStatus === "past_due" && (
                  <div className="mt-2 p-3 rounded-lg bg-red-400/10 border border-red-400/20">
                    <p className="text-xs text-red-400 leading-relaxed">
                      Your last payment failed. Update your payment method to keep access.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Features summary */}
            {sub?.features && (
              <div className="rounded-xl border border-border bg-card/50 p-6">
                <h2 className="text-sm font-semibold text-foreground mb-4">What's included</h2>
                <div className="space-y-2.5">
                  {[
                    { key: "unlimitedMessages", label: "Unlimited AI coaching messages" },
                    { key: "adaptationContext", label: "Adaptive training (readiness-based)" },
                    { key: "memoryContext", label: "Long-term memory — coach remembers you" },
                    { key: "programEvolution", label: "Program evolution week-over-week" },
                    { key: "insightHints", label: "Proactive insights engine" },
                    { key: "sessionLogging", label: "Session logging & progress tracking" },
                    { key: "priorityAI", label: "Priority AI response speed" },
                  ].map(({ key, label }) => {
                    const active = (sub.features as any)[key];
                    return (
                      <div key={key} className="flex items-center gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        <span className={`text-[12px] ${active ? "text-muted-foreground" : "text-muted-foreground/40 line-through"}`}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="rounded-xl border border-border bg-card/50 p-6 space-y-3">
              <h2 className="text-sm font-semibold text-foreground mb-1">Manage billing</h2>

              {isPaid && (
                <button
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-card border border-border text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  {portalMutation.isPending ? "Opening portal…" : "Manage payment & subscription"}
                </button>
              )}

              {(!isPaid || !hasActiveAccess) && (
                <button
                  onClick={() => setShowPricing(true)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
                >
                  <Zap className="w-4 h-4" />
                  {isPaid ? "Reactivate subscription" : "Upgrade to Pro"}
                </button>
              )}

              {isPaid && !cancelAtPeriodEnd && (
                <p className="text-center text-[11px] text-muted-foreground/50">
                  Cancel, downgrade, or update your payment method in the portal above.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {showPricing && (
        <PricingModal
          onClose={() => setShowPricing(false)}
          onSelectPlan={handleSelectPlan}
          currentPlan={plan}
        />
      )}
    </div>
  );
}
