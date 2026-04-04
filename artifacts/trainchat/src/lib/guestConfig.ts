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

  // ─── Onboarding ──────────────────────────────────────────────────────────
  // Number of onboarding questions shown to the guest user.
  // Match this to the QUESTIONS array length in guest-start.tsx.
  ONBOARDING_QUESTION_COUNT: 8,

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
  // These must match the FunnelEventName union in analyticsService.ts on the backend.
  EVENTS: {
    // Entry
    LANDING_PAGE_VIEWED: "landing_page_viewed",
    START_FREE_CLICKED: "start_free_clicked",
    GUEST_SESSION_CREATED: "guest_session_created",

    // Onboarding
    ONBOARDING_STARTED: "onboarding_started",
    ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
    ONBOARDING_COMPLETED: "onboarding_completed",

    // AI Experience
    PROGRAM_GENERATED: "program_generated",
    FOLLOWUP_USED: "followup_used",
    AI_GENERATION_FAILED: "ai_generation_failed",

    // Monetization
    PAYWALL_SHOWN: "paywall_shown",
    PAYWALL_CTA_CLICKED: "paywall_cta_clicked",
    PAYWALL_SIGNIN_CLICKED: "paywall_signin_clicked",
    PAYWALL_CLOSED: "paywall_closed",
    SIGNUP_STARTED: "signup_started",
    SIGNUP_COMPLETED: "signup_completed",
    PAYMENT_STARTED: "payment_started",
    PAYMENT_COMPLETED: "payment_completed",
    GUEST_CONVERTED: "guest_converted",

    // Retention
    GUEST_RETURNED: "guest_returned",
    USER_RETURNED_POST_CONVERSION: "user_returned_post_conversion",
  },
} as const;
