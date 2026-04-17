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
        You received this email because you have a TrainChat account.<br>
        <a href="https://trainchat.ai" style="color:#38bdf8;text-decoration:none">trainchat.ai</a>
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
      ${ctaButton("Open TrainChat", "https://trainchat.ai")}
    </div>`;
}

// ── Welcome email body ────────────────────────────────────────────────────────

function buildWelcomeBody(payload: WelcomeEmailPayload): string {
  const firstName = payload.name?.split(" ")[0] ?? "there";
  return `
    <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:22px;font-weight:800">Welcome to TrainChat, ${escapeHtml(firstName)}.</h2>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.65">
      Your AI coach is ready. TrainChat builds intelligent, personalised training programs that adapt to how you train — whether you're chasing strength, performance, or just consistency.
    </p>

    <div style="margin-bottom:28px">
      <p style="margin:0 0 14px;color:#f1f5f9;font-size:14px;font-weight:600">Here's how to get started:</p>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:10px 12px;background:#0f172a;border-radius:8px 8px 0 0;border-bottom:1px solid #1e293b">
            <span style="color:#38bdf8;font-weight:700;font-size:13px">1 · </span>
            <span style="color:#e2e8f0;font-size:13px">Chat with your coach to build your first program</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#0f172a;border-bottom:1px solid #1e293b">
            <span style="color:#38bdf8;font-weight:700;font-size:13px">2 · </span>
            <span style="color:#e2e8f0;font-size:13px">Complete your training profile so the AI tailors your plan</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#0f172a;border-radius:0 0 8px 8px">
            <span style="color:#38bdf8;font-weight:700;font-size:13px">3 · </span>
            <span style="color:#e2e8f0;font-size:13px">Explore Settings → Billing when you're ready to upgrade</span>
          </td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin-bottom:28px">
      ${ctaButton("Start coaching →", "https://trainchat.ai")}
    </div>

    <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;border-top:1px solid #334155;padding-top:20px">
      Questions? Reply to this email or use the <strong style="color:#64748b">Help</strong> menu inside TrainChat.<br>
      We're here to help you build the system that gets results.
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
  const html = userLayout("Your AI coach is ready — let's build your system.", buildWelcomeBody(payload));
  return deliver(
    { to: payload.email, subject: "Welcome to TrainChat — your AI coach is ready", html },
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
