/**
 * ── TrainChat Email Service (SendGrid) ────────────────────────────────────────
 *
 * Centralised transactional email layer powered by SendGrid.
 *
 * Required environment variables:
 *   SENDGRID_API_KEY   — SendGrid API key (starts with SG.)
 *   EMAIL_FROM         — Verified sender address (default: noreply@trainchat.ai)
 *   EMAIL_SUPPORT_TO   — Internal support inbox (default: Bryan.jones@trainchat.ai)
 *
 * If SENDGRID_API_KEY is missing, emails are skipped and a warning is logged.
 * DB records are always saved regardless of email delivery status.
 *
 * Exposed functions:
 *   sendWelcomeEmail(...)
 *   sendSupportSubmissionToAdmin(...)
 *   sendSupportConfirmationToUser(...)
 *   sendBugReportToAdmin(...)
 *   sendBugConfirmationToUser(...)
 *   sendFeatureRequestToAdmin(...)
 *   sendFeatureRequestConfirmationToUser(...)
 */

import sgMail from "@sendgrid/mail";
import { logger } from "./logger";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPPORT_TO = process.env.EMAIL_SUPPORT_TO ?? "Bryan.jones@trainchat.ai";
const FROM_EMAIL = process.env.EMAIL_FROM ?? "noreply@trainchat.ai";
const FROM_NAME = "TrainChat";

function isConfigured(): boolean {
  return !!process.env.SENDGRID_API_KEY;
}

function getClient(): typeof sgMail | null {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return null;
  sgMail.setApiKey(key);
  return sgMail;
}

// ── Shared types ──────────────────────────────────────────────────────────────

export interface SupportEmailPayload {
  type: "contact" | "bug" | "feature";
  name: string;
  email: string;
  category?: string | null;
  subject?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
  userId?: number | null;
}

export interface WelcomeEmailPayload {
  name: string;
  email: string;
}

interface SendResult {
  sent: boolean;
  reason?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function typeLabel(type: "contact" | "bug" | "feature"): string {
  return type === "contact" ? "Support" : type === "bug" ? "Bug Report" : "Feature Request";
}

function supportSubject(payload: SupportEmailPayload): string {
  const label =
    payload.type === "contact" ? "Support" :
    payload.type === "bug" ? "Bug" :
    "Feature";
  const detail = payload.category ?? payload.subject ?? "General";
  return `[TrainChat ${label}] ${detail} — ${payload.email}`;
}

// ── Shared layout wrappers ────────────────────────────────────────────────────

function adminLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px">
    <div style="margin-bottom:24px">
      <span style="font-size:18px;font-weight:700;color:#38bdf8;letter-spacing:-0.02em">TrainChat</span>
      <span style="font-size:12px;color:#64748b;margin-left:8px">Internal</span>
    </div>
    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:28px">
      <h2 style="margin:0 0 20px;color:#f1f5f9;font-size:17px;font-weight:600">${title}</h2>
      ${body}
    </div>
    <p style="color:#475569;font-size:11px;margin-top:16px;text-align:center">TrainChat · noreply@trainchat.ai</p>
  </div>
</body></html>`;
}

function userLayout(preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TrainChat</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <!-- preheader -->
  <div style="display:none;max-height:0;overflow:hidden;color:#0f172a">${escapeHtml(preheader)}</div>
  <div style="max-width:560px;margin:0 auto;padding:40px 16px">
    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px">
      <span style="font-size:22px;font-weight:800;color:#38bdf8;letter-spacing:-0.03em">TrainChat</span>
    </div>
    <!-- Card -->
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:36px 32px">
      ${body}
    </div>
    <!-- Footer -->
    <div style="text-align:center;margin-top:28px">
      <p style="color:#475569;font-size:12px;line-height:1.6;margin:0">
        You received this email because you created a TrainChat account.<br>
        <a href="https://www.trainchat.ai" style="color:#38bdf8;text-decoration:none">www.trainchat.ai</a>
      </p>
    </div>
  </div>
</body></html>`;
}

function ctaButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:#38bdf8;color:#0f172a;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.01em">${label}</a>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:5px 14px 5px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:5px 0;color:#e2e8f0;font-size:13px">${escapeHtml(String(value))}</td>
  </tr>`;
}

// ── Admin: internal support notification body ─────────────────────────────────

function buildAdminBody(payload: SupportEmailPayload): string {
  const label = typeLabel(payload.type);
  const meta = payload.metadata ?? {};

  const rows: [string, unknown][] = [
    ["Type", label],
    ["Name", payload.name],
    ["Email", payload.email],
  ];
  if (payload.category) rows.push(["Category", payload.category]);
  if (payload.subject) rows.push(["Title", payload.subject]);

  const metaRows: [string, unknown][] = [];
  const uid = meta.userId ?? payload.userId;
  if (uid) metaRows.push(["User ID", uid]);
  if (meta.plan) metaRows.push(["Plan", meta.plan]);
  if (meta.activeSystemId) metaRows.push(["System ID", meta.activeSystemId]);
  if (meta.environment) metaRows.push(["Environment", meta.environment]);
  if (meta.deviceInfo) metaRows.push(["Device / Browser", meta.deviceInfo]);
  if (meta.currentRoute) metaRows.push(["Page", meta.currentRoute]);
  if (meta.submittedAt ?? meta.timestamp) metaRows.push(["Submitted at", (meta.submittedAt ?? meta.timestamp) as string]);

  const tableRows = rows
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => infoRow(k, String(v)))
    .join("");

  let messageHtml: string;
  if (payload.type === "bug") {
    messageHtml = buildBugSections(payload.message);
  } else {
    messageHtml = `<pre style="background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;font-size:13px;white-space:pre-wrap;margin:0;overflow:auto">${escapeHtml(payload.message)}</pre>`;
  }

  const debugSection = metaRows.length > 0 ? `
    <details style="margin-top:20px">
      <summary style="cursor:pointer;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">Debug context</summary>
      <table style="width:100%;border-collapse:collapse;margin-top:10px">
        ${metaRows.filter(([, v]) => v != null && v !== "").map(([k, v]) => infoRow(k, String(v))).join("")}
      </table>
    </details>` : "";

  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">${tableRows}</table>
    <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">Message</p>
    ${messageHtml}
    ${debugSection}`;
}

function buildBugSections(message: string): string {
  try {
    const parsed = JSON.parse(message) as Record<string, string>;
    const sections: string[] = [];
    if (parsed.whatHappened) sections.push(bugSection("What happened", parsed.whatHappened));
    if (parsed.expectedBehavior) sections.push(bugSection("Expected behavior", parsed.expectedBehavior));
    if (parsed.stepsToReproduce) sections.push(bugSection("Steps to reproduce", parsed.stepsToReproduce));
    if (sections.length > 0) return sections.join("");
  } catch {
    // fall through
  }
  return `<pre style="background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;font-size:13px;white-space:pre-wrap;margin:0">${escapeHtml(message)}</pre>`;
}

function bugSection(label: string, text: string): string {
  return `<p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px">${label}</p>
<pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap;margin:0 0 12px">${escapeHtml(text)}</pre>`;
}

// ── User-facing confirmation body ─────────────────────────────────────────────

function buildUserConfirmationBody(payload: SupportEmailPayload): string {
  const label = typeLabel(payload.type);

  const heading =
    payload.type === "contact" ? "We've received your message" :
    payload.type === "bug" ? "Bug report received" :
    "Feature request received";

  const intro =
    payload.type === "contact"
      ? `Hi ${escapeHtml(payload.name)}, thanks for reaching out. Our team reviews every message and we'll get back to you at <strong style="color:#e2e8f0">${escapeHtml(payload.email)}</strong> shortly.`
      : payload.type === "bug"
      ? `Hi ${escapeHtml(payload.name)}, thanks for taking the time to report this. Your bug report has been received and our team will investigate.`
      : `Hi ${escapeHtml(payload.name)}, thanks for the suggestion. We log every feature request and review them when planning our roadmap.`;

  return `
    <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:20px;font-weight:700">${escapeHtml(heading)}</h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6">${intro}</p>

    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:16px;margin-bottom:24px">
      <p style="margin:0 0 4px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(label)} summary</p>
      <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.5">${payload.category ?? payload.subject ?? "General inquiry"}</p>
    </div>

    <p style="margin:0 0 24px;color:#64748b;font-size:13px;line-height:1.6">
      In the meantime, you can continue using TrainChat — your AI coach is ready whenever you are.
    </p>

    <div style="text-align:center">
      ${ctaButton("Open TrainChat", "https://www.trainchat.ai")}
    </div>`;
}

// ── Welcome email body ────────────────────────────────────────────────────────

function buildWelcomeBody(payload: WelcomeEmailPayload): string {
  const rawFirst = payload.name?.trim().split(" ")[0];
  const firstName = rawFirst && rawFirst.toLowerCase() !== "there" ? rawFirst : "there";
  return `
    <p style="margin:0 0 4px;color:#38bdf8;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">Your AI coach is ready.</p>
    <h2 style="margin:0 0 6px;color:#f1f5f9;font-size:24px;font-weight:800;line-height:1.25">Let's build something real.</h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.65">
      Welcome to TrainChat, ${escapeHtml(firstName)}.
    </p>

    <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;line-height:1.7">
      This isn't a workout app.<br>
      This is your AI training system — built to adapt to you in real time.
    </p>

    <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.7">
      Whether you're chasing strength, performance, consistency, or just a smarter way to train, TrainChat helps you build and evolve your program like a high-level coach would.
    </p>

    <div style="margin-bottom:28px">
      <p style="margin:0 0 14px;color:#f1f5f9;font-size:14px;font-weight:600">How to start:</p>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:12px 14px;background:#0f172a;border-radius:8px 8px 0 0;border-bottom:1px solid #1e293b;vertical-align:top">
            <span style="color:#38bdf8;font-weight:700;font-size:13px">1 &nbsp;</span>
            <strong style="color:#e2e8f0;font-size:13px">Open the agent</strong><br>
            <span style="color:#64748b;font-size:12px;line-height:1.5">Tell it what you want. Example: "Build me a 3-day strength program."</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 14px;background:#0f172a;border-bottom:1px solid #1e293b;vertical-align:top">
            <span style="color:#38bdf8;font-weight:700;font-size:13px">2 &nbsp;</span>
            <strong style="color:#e2e8f0;font-size:13px">Vibe code your system</strong><br>
            <span style="color:#64748b;font-size:12px;line-height:1.5">Ask for changes. Adjust exercises, goals, days, equipment, injuries, or focus areas.</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 14px;background:#0f172a;border-radius:0 0 8px 8px;vertical-align:top">
            <span style="color:#38bdf8;font-weight:700;font-size:13px">3 &nbsp;</span>
            <strong style="color:#e2e8f0;font-size:13px">Refine over time</strong><br>
            <span style="color:#64748b;font-size:12px;line-height:1.5">Every input helps shape a smarter training system around you.</span>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin-bottom:28px">
      <a href="https://www.trainchat.ai" style="display:block;width:100%;box-sizing:border-box;background:#38bdf8;color:#0f172a;font-weight:700;font-size:15px;padding:16px 24px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;text-align:center">Start building my system</a>
    </div>

    <p style="margin:0 0 20px;color:#64748b;font-size:13px;line-height:1.6;font-style:italic">
      P.S. Most users can build their first program in under 30 seconds.
    </p>

    <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;border-top:1px solid #334155;padding-top:20px">
      Questions? Reply to this email or use the <strong style="color:#64748b">Help</strong> menu inside TrainChat.<br>
      We're here to help you build the system that gets results.<br><br>
      <strong style="color:#94a3b8">TrainChat</strong><br>
      <span style="color:#64748b">Your AI training system.</span>
    </p>`;
}

// ── Delivery helper ───────────────────────────────────────────────────────────

async function deliver(msg: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}, label: string): Promise<SendResult> {
  if (!isConfigured()) {
    logger.warn({ label, to: msg.to }, `[Email] SendGrid not configured — ${label} skipped. Set SENDGRID_API_KEY to enable.`);
    return { sent: false, reason: "sendgrid_not_configured" };
  }

  const client = getClient();
  if (!client) return { sent: false, reason: "sendgrid_not_configured" };

  try {
    await client.send({
      from: { name: FROM_NAME, email: FROM_EMAIL },
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    logger.info({ label, to: msg.to }, `[Email] ${label} delivered`);
    return { sent: true };
  } catch (err: any) {
    const status = err?.response?.status;
    const body = err?.response?.body;
    logger.error({ err, status, body, label, to: msg.to }, `[Email] ${label} failed`);
    return { sent: false, reason: "send_failed" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Welcome email sent once when a new account is created.
 */
export async function sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<SendResult> {
  const html = userLayout("Your AI coach is ready. Start building your training system now.", buildWelcomeBody(payload));
  return deliver(
    { to: payload.email, subject: "Welcome to TrainChat — Build your system", html },
    "welcome",
  );
}

/**
 * Internal admin notification for a generic contact/support submission.
 */
export async function sendSupportSubmissionToAdmin(payload: SupportEmailPayload): Promise<SendResult> {
  const html = adminLayout(`Contact Support — ${payload.email}`, buildAdminBody(payload));
  return deliver(
    { to: SUPPORT_TO, subject: supportSubject(payload), html, replyTo: payload.email },
    "support-admin",
  );
}

/**
 * User-facing confirmation for a contact/support submission.
 */
export async function sendSupportConfirmationToUser(payload: SupportEmailPayload): Promise<SendResult> {
  const html = userLayout("We've received your message and will follow up shortly.", buildUserConfirmationBody(payload));
  return deliver(
    { to: payload.email, subject: `[TrainChat] We received your message`, html },
    "support-confirm",
  );
}

/**
 * Internal admin notification for a bug report.
 */
export async function sendBugReportToAdmin(payload: SupportEmailPayload): Promise<SendResult> {
  const html = adminLayout(`Bug Report — ${payload.email}`, buildAdminBody(payload));
  return deliver(
    { to: SUPPORT_TO, subject: supportSubject(payload), html, replyTo: payload.email },
    "bug-admin",
  );
}

/**
 * User-facing confirmation for a bug report.
 */
export async function sendBugConfirmationToUser(payload: SupportEmailPayload): Promise<SendResult> {
  const html = userLayout("We've logged your bug report and our team is on it.", buildUserConfirmationBody(payload));
  return deliver(
    { to: payload.email, subject: `[TrainChat] Bug report received`, html },
    "bug-confirm",
  );
}

/**
 * Internal admin notification for a feature request.
 */
export async function sendFeatureRequestToAdmin(payload: SupportEmailPayload): Promise<SendResult> {
  const html = adminLayout(`Feature Request — ${payload.email}`, buildAdminBody(payload));
  return deliver(
    { to: SUPPORT_TO, subject: supportSubject(payload), html, replyTo: payload.email },
    "feature-admin",
  );
}

/**
 * User-facing confirmation for a feature request.
 */
export async function sendFeatureRequestConfirmationToUser(payload: SupportEmailPayload): Promise<SendResult> {
  const html = userLayout("Thanks for the suggestion — we've added it to our roadmap.", buildUserConfirmationBody(payload));
  return deliver(
    { to: payload.email, subject: `[TrainChat] Feature request received`, html },
    "feature-confirm",
  );
}

// ── Password Reset email ──────────────────────────────────────────────────────

export interface PasswordResetEmailPayload {
  email: string;
  resetUrl: string;
  expiresInMinutes: number;
}

function buildPasswordResetBody(payload: PasswordResetEmailPayload): string {
  return `
    <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:20px;font-weight:700">Reset your password</h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6">
      We received a request to reset the password for your TrainChat account
      (<strong style="color:#e2e8f0">${escapeHtml(payload.email)}</strong>).
      Click the button below to choose a new password.
    </p>

    <div style="text-align:center;margin-bottom:28px">
      ${ctaButton("Reset my password", payload.resetUrl)}
    </div>

    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px 16px;margin-bottom:24px">
      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6">
        This link expires in <strong style="color:#94a3b8">${payload.expiresInMinutes} minutes</strong>.
        If you didn't request a password reset, you can safely ignore this email — your password won't change.
      </p>
    </div>

    <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;border-top:1px solid #334155;padding-top:20px">
      If the button above doesn't work, copy and paste this URL into your browser:<br>
      <span style="color:#38bdf8;font-size:12px;word-break:break-all">${escapeHtml(payload.resetUrl)}</span>
    </p>`;
}

/**
 * Sends a branded password reset email with a secure one-time link.
 */
export async function sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<SendResult> {
  const html = userLayout(
    "Reset your TrainChat password — link expires soon.",
    buildPasswordResetBody(payload),
  );
  return deliver(
    {
      to: payload.email,
      subject: "Reset your TrainChat password",
      html,
    },
    "password-reset",
  );
}

/**
 * @deprecated Compatibility shim — routes to the appropriate admin+confirm pair.
 * Existing callers in support.ts still work without changes.
 */
export async function sendSupportEmail(payload: SupportEmailPayload): Promise<SendResult> {
  const [adminResult] = await Promise.all([
    payload.type === "contact"
      ? sendSupportSubmissionToAdmin(payload)
      : payload.type === "bug"
      ? sendBugReportToAdmin(payload)
      : sendFeatureRequestToAdmin(payload),
    payload.type === "contact"
      ? sendSupportConfirmationToUser(payload)
      : payload.type === "bug"
      ? sendBugConfirmationToUser(payload)
      : sendFeatureRequestConfirmationToUser(payload),
  ]);
  return adminResult;
}

// ── Retention Emails ─────────────────────────────────────────────────────────

export interface RetentionBasePayload {
  name: string;
  email: string;
}

export interface WeekTransitionPayload extends RetentionBasePayload {
  weekNumber: number;
}

/**
 * Sent once after a user's first successful training system build.
 * Subject: "Your training system is live"
 */
export async function sendFirstBuildEmail(payload: RetentionBasePayload): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#f1f5f9;line-height:1.3">
      Your training system is live, ${escapeHtml(payload.name)}.
    </h2>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:15px;line-height:1.6">
      This isn't a static plan. It's a live coaching system that adapts around your schedule, 
      your feedback, and how you're actually training.
    </p>
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:18px 20px;margin-bottom:24px">
      <p style="margin:0 0 8px;color:#e2e8f0;font-size:14px;font-weight:600">What's waiting for you:</p>
      <ul style="margin:0;padding-left:18px;color:#94a3b8;font-size:14px;line-height:1.8">
        <li>Your Day 1 session is ready to go</li>
        <li>Tell your coach how it went — it adapts from there</li>
        <li>Ask to adjust intensity, swap exercises, or shift days anytime</li>
      </ul>
    </div>
    <div style="text-align:center;margin-bottom:24px">
      ${ctaButton("Open my training system", process.env.CLIENT_URL ?? "https://trainchat.ai")}
    </div>
    <p style="margin:0;color:#475569;font-size:13px;line-height:1.6">
      Your coach remembers everything. The more you use it, the smarter it gets.
    </p>`;
  const html = userLayout("Your training system is live — TrainChat", body);
  return deliver({ to: payload.email, subject: "Your training system is live", html }, "first-build");
}

/**
 * Sent when a user advances to a new training week.
 * Subject: "Week N of your program is ready"
 */
export async function sendWeekTransitionEmail(payload: WeekTransitionPayload): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#f1f5f9;line-height:1.3">
      Week ${payload.weekNumber} is ready, ${escapeHtml(payload.name)}.
    </h2>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:15px;line-height:1.6">
      You completed Week ${payload.weekNumber - 1}. Your coach has your next block built and ready — 
      progressive, adapted to how last week went.
    </p>
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:18px 20px;margin-bottom:24px">
      <p style="margin:0;color:#94a3b8;font-size:14px;line-height:1.7">
        Open your program to see what changed, what's the same, and what's coming. 
        If anything doesn't fit — just tell your coach.
      </p>
    </div>
    <div style="text-align:center;margin-bottom:24px">
      ${ctaButton("See Week ${payload.weekNumber}", process.env.CLIENT_URL ?? "https://trainchat.ai")}
    </div>`;
  const html = userLayout(`Week ${payload.weekNumber} of your program is ready — TrainChat`, body);
  return deliver(
    { to: payload.email, subject: `Week ${payload.weekNumber} of your program is ready`, html },
    "week-transition",
  );
}

/**
 * Sent after ~48 hours of inactivity when user has an active training system.
 * Subject: "Your next session is waiting"
 */
export async function send48hInactivityEmail(payload: RetentionBasePayload): Promise<SendResult> {
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#f1f5f9;line-height:1.3">
      Your program is still waiting, ${escapeHtml(payload.name)}.
    </h2>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:15px;line-height:1.6">
      You've got a live training system — built around your goals, ready to adapt. 
      Your next session is right where you left it.
    </p>
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:18px 20px;margin-bottom:24px">
      <p style="margin:0;color:#94a3b8;font-size:14px;line-height:1.7">
        Can't make the full session? Tell your coach. It'll shorten it, swap it, or push it — 
        whatever keeps you moving forward.
      </p>
    </div>
    <div style="text-align:center;margin-bottom:24px">
      ${ctaButton("Get back to training", process.env.CLIENT_URL ?? "https://trainchat.ai")}
    </div>`;
  const html = userLayout("Your next session is waiting — TrainChat", body);
  return deliver({ to: payload.email, subject: "Your next session is waiting", html }, "inactivity-48h");
}
