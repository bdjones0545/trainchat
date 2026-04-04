import { X, Zap, Lock, ArrowRight } from "lucide-react";

interface Props {
  plan: string;
  messagesUsed: number;
  onUpgrade: () => void;
  onClose: () => void;
}

export default function PaywallModal({ plan, messagesUsed, onUpgrade, onClose }: Props) {
  const isFree = plan === "free";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl border border-primary/20 bg-[#0c1220] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 mx-auto">
            <Lock className="w-6 h-6 text-primary" />
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-foreground mb-2">
              {isFree ? "Your 5 free interactions are up" : "Message limit reached"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isFree
                ? "You've experienced what your AI performance architect can do. Unlock full access to keep building and evolving your program."
                : "You've hit your monthly limit. Upgrade to Pro for unlimited coaching sessions."}
            </p>
          </div>

          {/* What you unlock */}
          <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mb-6 space-y-2.5">
            {[
              "Unlimited AI coaching conversations",
              "Adaptive training based on your readiness",
              "Long-term memory — your coach remembers you",
              "Program evolution week-over-week",
              "Session logging and progress tracking",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="text-[12px] text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={onUpgrade}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all duration-150"
          >
            <Zap className="w-4 h-4" />
            View Plans & Unlock Access
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-center text-[11px] text-muted-foreground/60 mt-3">
            Cancel anytime. No commitment.
          </p>
        </div>
      </div>
    </div>
  );
}
