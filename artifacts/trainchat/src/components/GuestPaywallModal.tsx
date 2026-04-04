import { GUEST_CONFIG } from "@/lib/guestConfig";

interface GuestPaywallModalProps {
  deviceId: string | null;
  onRegister: () => void;
  onSignIn: () => void;
}

/**
 * GuestPaywallModal
 *
 * Full-screen premium paywall overlay shown after the guest teaser is exhausted.
 * Copy and feature bullets are driven entirely by GUEST_CONFIG in lib/guestConfig.ts.
 * Design intentionally evokes "unlock" rather than "block".
 */
export function GuestPaywallModal({ onRegister, onSignIn }: GuestPaywallModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "hsl(222 47% 6% / 0.92)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "hsl(222 47% 9%)",
          border: "1px solid hsl(199 89% 48% / 0.35)",
          boxShadow: "0 0 60px hsl(199 89% 48% / 0.12), 0 24px 48px hsl(222 47% 4% / 0.6)",
        }}
      >
        {/* Top accent bar */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, hsl(199 89% 48%), transparent)" }} />

        <div className="p-7 space-y-6">
          {/* Badge */}
          <div className="flex justify-center">
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide"
              style={{ background: "hsl(199 89% 48% / 0.12)", color: "hsl(199 89% 48%)", border: "1px solid hsl(199 89% 48% / 0.25)" }}
            >
              <LockIcon />
              {GUEST_CONFIG.PAYWALL_BADGE}
            </span>
          </div>

          {/* Headline */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white leading-tight tracking-tight">
              {GUEST_CONFIG.PAYWALL_HEADLINE}
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              {GUEST_CONFIG.PAYWALL_SUBHEADLINE}
            </p>
          </div>

          {/* Reassurance pill */}
          <div className="flex justify-center">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs"
              style={{ background: "hsl(143 70% 45% / 0.12)", color: "hsl(143 70% 55%)", border: "1px solid hsl(143 70% 45% / 0.2)" }}
            >
              <CheckIcon />
              {GUEST_CONFIG.PAYWALL_REASSURANCE}
            </span>
          </div>

          {/* Feature bullets */}
          <div className="space-y-2.5">
            {GUEST_CONFIG.PAYWALL_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex items-start gap-3 px-4 py-3 rounded-xl"
                style={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 18%)" }}
              >
                <span className="text-lg flex-shrink-0 mt-0.5">{feature.icon}</span>
                <div className="min-w-0">
                  <div className="text-white text-sm font-semibold">{feature.title}</div>
                  <div className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{feature.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Primary CTA */}
          <div className="space-y-3">
            <button
              onClick={onRegister}
              className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "hsl(199 89% 48%)",
                boxShadow: "0 0 24px hsl(199 89% 48% / 0.35)",
              }}
            >
              {GUEST_CONFIG.PAYWALL_CTA_PRIMARY}
            </button>

            <p className="text-center text-xs text-zinc-600">{GUEST_CONFIG.PAYWALL_NO_CC_NOTE}</p>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "hsl(222 47% 18%)" }} />
              <span className="text-zinc-600 text-xs">or</span>
              <div className="flex-1 h-px" style={{ background: "hsl(222 47% 18%)" }} />
            </div>

            {/* Sign in */}
            <button
              onClick={onSignIn}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-150 hover:bg-white/5"
              style={{ color: "hsl(199 89% 48%)", border: "1px solid hsl(199 89% 48% / 0.25)" }}
            >
              {GUEST_CONFIG.PAYWALL_CTA_SIGNIN}
            </button>
          </div>

          {/* Social proof */}
          <p className="text-center text-zinc-600 text-xs">{GUEST_CONFIG.PAYWALL_SOCIAL_PROOF}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Tiny inline icons ────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
