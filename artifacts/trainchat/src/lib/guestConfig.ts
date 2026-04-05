/**
 * Guest Chat & Paywall Configuration
 *
 * Edit this file to adjust free message limits, paywall messaging, CTA text,
 * feature bullets, and locked-state copy — all in one place.
 */

export const GUEST_CONFIG = {
  // ─── Free Message Limit ────────────────────────────────────────────────────
  // Number of free user messages allowed before the paywall fires.
  TEASER_TOTAL_LIMIT: 5,

  // ─── Paywall Headline & Body ──────────────────────────────────────────────
  PAYWALL_BADGE: "Continue Your Program",
  PAYWALL_HEADLINE: "You've started building your program.",
  PAYWALL_SUBHEADLINE:
    "Create your account to continue, save your progress, and unlock your personalized TrainChat experience.",
  PAYWALL_REASSURANCE: "Your conversation is saved and ready to continue.",

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
  LOCKED_HEADLINE: "Your Program Is Waiting",
  LOCKED_SUBHEADLINE:
    "You've used your free preview. Create an account to continue your coaching journey.",
  LOCKED_BODY:
    "Your conversation is saved. Create your account to pick up exactly where you left off.",
  LOCKED_CTA: "Continue With Full Access",

  // ─── Post-Paywall Signup Page Messaging ──────────────────────────────────
  SIGNUP_HEADLINE: "Continue Your Coaching Journey",
  SIGNUP_SUBHEADLINE:
    "Your conversation is saved. Create your account and pick up exactly where you left off.",

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
