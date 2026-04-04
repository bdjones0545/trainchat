import { db, analyticsEventsTable, guestSessionsTable } from "@workspace/db";
import { eq, and, gte, lte, count, sql } from "drizzle-orm";

export type FunnelEventName =
  | "landing_page_viewed"
  | "start_free_clicked"
  | "guest_session_created"
  | "onboarding_started"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "program_generated"
  | "followup_used"
  | "paywall_shown"
  | "paywall_cta_clicked"
  | "paywall_signin_clicked"
  | "paywall_closed"
  | "signup_started"
  | "signup_completed"
  | "payment_started"
  | "payment_completed"
  | "guest_converted"
  | "guest_returned"
  | "user_returned_post_conversion"
  | "ai_generation_failed"
  | "onboarding_failed"
  | "payment_failed"
  | string;

export interface TrackEventOptions {
  deviceId?: string;
  guestSessionId?: number;
  userId?: number;
  properties?: Record<string, unknown>;
}

/**
 * Write a single analytics event to the analytics_events table.
 * Fire-and-forget safe: caller does not need to await, and errors are silently swallowed.
 */
export async function trackEvent(event: FunnelEventName, opts: TrackEventOptions = {}): Promise<void> {
  try {
    await db.insert(analyticsEventsTable).values({
      event,
      deviceId: opts.deviceId ?? null,
      guestSessionId: opts.guestSessionId ?? null,
      userId: opts.userId ?? null,
      properties: opts.properties ?? null,
    });
  } catch {
    // Never let analytics errors surface to callers
  }
}

export interface DateFilter {
  from?: Date;
  to?: Date;
}

/**
 * Count how many times a specific event occurred in the given date range.
 */
async function countEvent(event: string, filter: DateFilter): Promise<number> {
  const conditions = [eq(analyticsEventsTable.event, event)];
  if (filter.from) conditions.push(gte(analyticsEventsTable.createdAt, filter.from));
  if (filter.to) conditions.push(lte(analyticsEventsTable.createdAt, filter.to));

  const [result] = await db
    .select({ n: count() })
    .from(analyticsEventsTable)
    .where(and(...conditions));

  return Number(result?.n ?? 0);
}

/**
 * Count distinct deviceIds that fired a specific event.
 */
async function countUniqueDevices(event: string, filter: DateFilter): Promise<number> {
  const conditions = [
    eq(analyticsEventsTable.event, event),
    sql`${analyticsEventsTable.deviceId} IS NOT NULL`,
  ];
  if (filter.from) conditions.push(gte(analyticsEventsTable.createdAt, filter.from));
  if (filter.to) conditions.push(lte(analyticsEventsTable.createdAt, filter.to));

  const [result] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${analyticsEventsTable.deviceId})` })
    .from(analyticsEventsTable)
    .where(and(...conditions));

  return Number(result?.n ?? 0);
}

function pct(num: number, denom: number): number {
  if (!denom) return 0;
  return parseFloat(((num / denom) * 100).toFixed(1));
}

/**
 * Build a full funnel metrics report for the given date range.
 * All counts are unique-device counts to avoid double-counting re-visits.
 */
export async function getFunnelMetrics(filter: DateFilter) {
  const [
    landingViewed,
    startFreeClicked,
    onboardingStarted,
    onboardingCompleted,
    programGenerated,
    paywallShown,
    paywallCtaClicked,
    signupStarted,
    signupCompleted,
    paymentStarted,
    paymentCompleted,
    guestConverted,
    guestReturned,
    followupUsed,
    generationFailed,
  ] = await Promise.all([
    countUniqueDevices("landing_page_viewed", filter),
    countUniqueDevices("start_free_clicked", filter),
    countUniqueDevices("onboarding_started", filter),
    countUniqueDevices("onboarding_completed", filter),
    countUniqueDevices("program_generated", filter),
    countUniqueDevices("paywall_shown", filter),
    countUniqueDevices("paywall_cta_clicked", filter),
    countUniqueDevices("signup_started", filter),
    countUniqueDevices("signup_completed", filter),
    countUniqueDevices("payment_started", filter),
    countUniqueDevices("payment_completed", filter),
    countUniqueDevices("guest_converted", filter),
    countUniqueDevices("guest_returned", filter),
    countEvent("followup_used", filter),
    countEvent("ai_generation_failed", filter),
  ]);

  return {
    funnel: [
      {
        step: "Landing Page Viewed",
        event: "landing_page_viewed",
        count: landingViewed,
        conversionFrom: null,
        conversionPct: null,
      },
      {
        step: "Start Free Clicked",
        event: "start_free_clicked",
        count: startFreeClicked,
        conversionFrom: "landing_page_viewed",
        conversionPct: pct(startFreeClicked, landingViewed),
      },
      {
        step: "Onboarding Started",
        event: "onboarding_started",
        count: onboardingStarted,
        conversionFrom: "start_free_clicked",
        conversionPct: pct(onboardingStarted, startFreeClicked),
      },
      {
        step: "Onboarding Completed",
        event: "onboarding_completed",
        count: onboardingCompleted,
        conversionFrom: "onboarding_started",
        conversionPct: pct(onboardingCompleted, onboardingStarted),
      },
      {
        step: "Program Generated",
        event: "program_generated",
        count: programGenerated,
        conversionFrom: "onboarding_completed",
        conversionPct: pct(programGenerated, onboardingCompleted),
      },
      {
        step: "Paywall Shown",
        event: "paywall_shown",
        count: paywallShown,
        conversionFrom: "program_generated",
        conversionPct: pct(paywallShown, programGenerated),
      },
      {
        step: "Paywall CTA Clicked",
        event: "paywall_cta_clicked",
        count: paywallCtaClicked,
        conversionFrom: "paywall_shown",
        conversionPct: pct(paywallCtaClicked, paywallShown),
      },
      {
        step: "Signup Started",
        event: "signup_started",
        count: signupStarted,
        conversionFrom: "paywall_cta_clicked",
        conversionPct: pct(signupStarted, paywallCtaClicked),
      },
      {
        step: "Signup Completed",
        event: "signup_completed",
        count: signupCompleted,
        conversionFrom: "signup_started",
        conversionPct: pct(signupCompleted, signupStarted),
      },
      {
        step: "Payment Started",
        event: "payment_started",
        count: paymentStarted,
        conversionFrom: "signup_completed",
        conversionPct: pct(paymentStarted, signupCompleted),
      },
      {
        step: "Payment Completed",
        event: "payment_completed",
        count: paymentCompleted,
        conversionFrom: "payment_started",
        conversionPct: pct(paymentCompleted, paymentStarted),
      },
    ],
    summary: {
      landingViewed,
      startFreeClicked,
      onboardingStarted,
      onboardingCompleted,
      programGenerated,
      paywallShown,
      paywallCtaClicked,
      signupStarted,
      signupCompleted,
      paymentStarted,
      paymentCompleted,
      guestConverted,
      guestReturned,
      followupUsed,
      generationFailed,
      overallConversionPct: pct(signupCompleted, landingViewed),
      paywallToCta: pct(paywallCtaClicked, paywallShown),
      signupToPayment: pct(paymentCompleted, signupCompleted),
    },
    dropoff: [
      {
        stage: "Started onboarding, didn't complete",
        count: Math.max(0, onboardingStarted - onboardingCompleted),
        pct: pct(Math.max(0, onboardingStarted - onboardingCompleted), onboardingStarted),
      },
      {
        stage: "Generated program, didn't hit paywall",
        count: Math.max(0, programGenerated - paywallShown),
        pct: pct(Math.max(0, programGenerated - paywallShown), programGenerated),
      },
      {
        stage: "Saw paywall, didn't click CTA",
        count: Math.max(0, paywallShown - paywallCtaClicked),
        pct: pct(Math.max(0, paywallShown - paywallCtaClicked), paywallShown),
      },
      {
        stage: "Started signup, didn't complete",
        count: Math.max(0, signupStarted - signupCompleted),
        pct: pct(Math.max(0, signupStarted - signupCompleted), signupStarted),
      },
      {
        stage: "Completed signup, didn't start payment",
        count: Math.max(0, signupCompleted - paymentStarted),
        pct: pct(Math.max(0, signupCompleted - paymentStarted), signupCompleted),
      },
      {
        stage: "Started payment, didn't complete",
        count: Math.max(0, paymentStarted - paymentCompleted),
        pct: pct(Math.max(0, paymentStarted - paymentCompleted), paymentStarted),
      },
    ],
  };
}

/**
 * Return the N most recent analytics events for display in the dashboard.
 */
export async function getRecentEvents(limit = 50, filter: DateFilter = {}) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (filter.from) conditions.push(gte(analyticsEventsTable.createdAt, filter.from) as any);
  if (filter.to) conditions.push(lte(analyticsEventsTable.createdAt, filter.to) as any);

  const rows = await db
    .select()
    .from(analyticsEventsTable)
    .where(conditions.length ? and(...(conditions as any)) : undefined)
    .orderBy(sql`${analyticsEventsTable.createdAt} DESC`)
    .limit(limit);

  return rows;
}
