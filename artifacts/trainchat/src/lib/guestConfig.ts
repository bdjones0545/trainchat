/**
 * Guest Chat & Paywall Configuration
 *
 * Edit this file to adjust free message limits, paywall messaging, CTA text,
 * feature bullets, and locked-state copy — all in one place.
 */

export const GUEST_CONFIG = {
  // ─── Free Message Limit ────────────────────────────────────────────────────
  // Number of free user messages allowed before the paywall fires.
  TEASER_TOTAL_LIMIT: 8,

  // ─── Paywall Headline & Body ──────────────────────────────────────────────
  PAYWALL_BADGE: "Your System Is Ready",
  PAYWALL_HEADLINE: "Create your account to save and evolve your system.",
  PAYWALL_SUBHEADLINE:
    "Your training system is building. Create a free account to save it, keep editing it, and let it adapt to you over time.",
  PAYWALL_REASSURANCE: "Your conversation and progress are saved — pick up exactly where you left off.",

  // ─── Paywall CTAs ─────────────────────────────────────────────────────────
  PAYWALL_CTA_PRIMARY: "Save My System — It's Free",
  PAYWALL_CTA_SIGNIN: "Already have an account? Sign in",
  PAYWALL_NO_CC_NOTE: "No credit card required",
  PAYWALL_SOCIAL_PROOF: "Join thousands of athletes training smarter",

  // ─── Feature Bullets ─────────────────────────────────────────────────────
  PAYWALL_FEATURES: [
    {
      icon: "⚡",
      title: "Your System Evolves",
      desc: "Edit it through conversation. The more you use it, the smarter it gets.",
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
      icon: "🧠",
      title: "Adaptive Programming",
      desc: "Your program updates automatically based on your real progress and recovery.",
    },
  ],

  // ─── Return Visitor Locked State ─────────────────────────────────────────
  LOCKED_HEADLINE: "Your System Is Waiting",
  LOCKED_SUBHEADLINE:
    "Create a free account to pick up where you left off and keep building.",
  LOCKED_BODY:
    "Your training system is saved. Create your account to continue editing it through conversation.",
  LOCKED_CTA: "Continue Building My System",

  // ─── Post-Paywall Signup Page Messaging ──────────────────────────────────
  SIGNUP_HEADLINE: "Save Your Training System",
  SIGNUP_SUBHEADLINE:
    "Your system is built and ready. Create your free account to save it and keep evolving it.",

  // ─── Funnel Event Names ───────────────────────────────────────────────────
  EVENTS: {
    LANDING_PAGE_VIEWED: "landing_page_viewed",
    START_FREE_CLICKED: "start_free_clicked",
    GUEST_SESSION_CREATED: "guest_session_created",
    ONBOARDING_STARTED: "onboarding_started",
    ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
    ONBOARDING_COMPLETED: "onboarding_completed",
    PROGRAM_GENERATED: "program_generated",
    FOLLOWUP_USED: "followup_used",
    AI_GENERATION_FAILED: "ai_generation_failed",
    PAYWALL_SHOWN: "paywall_shown",
    PAYWALL_CTA_CLICKED: "paywall_cta_clicked",
    PAYWALL_SIGNIN_CLICKED: "paywall_signin_clicked",
    PAYWALL_CLOSED: "paywall_closed",
    SIGNUP_STARTED: "signup_started",
    SIGNUP_COMPLETED: "signup_completed",
    PAYMENT_STARTED: "payment_started",
    PAYMENT_COMPLETED: "payment_completed",
    GUEST_CONVERTED: "guest_converted",
    GUEST_RETURNED: "guest_returned",
    USER_RETURNED_POST_CONVERSION: "user_returned_post_conversion",
    GUEST_CHAT_MESSAGE: "guest_chat_message",
  },
} as const;
