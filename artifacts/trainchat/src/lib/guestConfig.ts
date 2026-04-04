/**
 * Guest Teaser & Paywall Configuration
 *
 * Edit this file to adjust teaser limits, paywall messaging, CTA text,
 * feature bullets, and locked-state copy — all in one place.
 */

export const GUEST_CONFIG = {
  // ─── Teaser Limits ────────────────────────────────────────────────────────
  // Total teaserUsesCount allowed before the paywall fires.
  // 1 = program generated, 2 = one follow-up interaction.
  TEASER_TOTAL_LIMIT: 2,

  // ─── Paywall Headline & Body ──────────────────────────────────────────────
  PAYWALL_BADGE: "Your Free Preview Has Ended",
  PAYWALL_HEADLINE: "Your Plan Is Ready — Unlock Full Access",
  PAYWALL_SUBHEADLINE:
    "Your AI coach has already started learning you. Save your progress and unlock the complete system.",
  PAYWALL_REASSURANCE: "Your plan is saved and ready to continue.",

  // ─── Paywall CTAs ─────────────────────────────────────────────────────────
  PAYWALL_CTA_PRIMARY: "Create Free Account",
  PAYWALL_CTA_SIGNIN: "Already have an account? Sign in",
  PAYWALL_NO_CC_NOTE: "No credit card required to create an account",
  PAYWALL_SOCIAL_PROOF: "Join thousands of athletes training smarter",

  // ─── Feature Bullets ─────────────────────────────────────────────────────
  PAYWALL_FEATURES: [
    {
      icon: "🧠",
      title: "Adaptive Programming",
      desc: "Your coach evolves your program every week based on your real progress.",
    },
    {
      icon: "💬",
      title: "Unlimited Coaching",
      desc: "Ask anything. Adjust anything. Your coach is always on.",
    },
    {
      icon: "📈",
      title: "Progress Tracking",
      desc: "Log sessions, track milestones, and watch your gains compound.",
    },
    {
      icon: "🗓️",
      title: "Full Program Access",
      desc: "Unlock every day, every week, every training block.",
    },
  ],

  // ─── Return Visitor Locked State ─────────────────────────────────────────
  LOCKED_HEADLINE: "Your Free Preview Has Been Used",
  LOCKED_SUBHEADLINE:
    "Your personalized program is saved. Create an account to continue your coaching journey.",
  LOCKED_BODY:
    "Your free guided preview has already been used on this device. Create your account to pick up exactly where you left off.",
  LOCKED_CTA: "Continue With Full Access",

  // ─── Post-Paywall Signup Page Messaging ──────────────────────────────────
  SIGNUP_HEADLINE: "Continue Your Coaching Journey",
  SIGNUP_SUBHEADLINE:
    "Your personalized plan is ready. Create your account and pick up exactly where you left off.",

  // ─── Funnel Event Names ───────────────────────────────────────────────────
  EVENTS: {
    PAYWALL_SHOWN: "paywall_shown",
    PAYWALL_CTA_CLICKED: "paywall_cta_clicked",
    PAYWALL_SIGNIN_CLICKED: "paywall_signin_clicked",
    PAYWALL_CLOSED: "paywall_closed",
    SIGNUP_STARTED: "signup_started",
    SIGNUP_COMPLETED: "signup_completed",
    PAYMENT_STARTED: "payment_started",
    PAYMENT_COMPLETED: "payment_completed",
    GUEST_CONVERTED: "guest_converted",
  },
} as const;
