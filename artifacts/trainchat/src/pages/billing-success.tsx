import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, Loader2, ArrowRight } from "lucide-react";

export default function BillingSuccess() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [plan, setPlan] = useState<string>("");
  const [interval, setInterval] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      setStatus("success");
      return;
    }

    fetch(`/api/billing/checkout-session/${sessionId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tier) setPlan(data.tier);
        if (data?.billingInterval) setInterval(data.billingInterval);
        setStatus("success");
      })
      .catch(() => setStatus("success"));
  }, []);

  const PLAN_NAMES: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    elite: "Elite",
  };

  return (
    <div className="min-h-screen bg-[#080e18] flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {status === "loading" ? (
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              Payment successful
            </h1>

            {plan ? (
              <p className="text-muted-foreground mb-1">
                Your{" "}
                <span className="text-foreground font-semibold">
                  TrainChat {PLAN_NAMES[plan] ?? plan}
                </span>{" "}
                {interval ? `(${interval}) ` : ""}plan is now active.
              </p>
            ) : (
              <p className="text-muted-foreground mb-1">
                Your TrainChat plan is now active.
              </p>
            )}

            <p className="text-sm text-muted-foreground/60 mb-8">
              You'll receive a receipt from Stripe at your email address.
            </p>

            <button
              onClick={() => navigate("/chat")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              Go to TrainChat
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="mt-4">
              <button
                onClick={() => navigate("/billing")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                View billing settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
