/**
 * ── TrainChat Email Service ──────────────────────────────────────────────────
 *
 * Sends support submissions to Bryan.jones@trainchat.ai via SMTP.
 *
 * Requires these environment variables to be set:
 *   SMTP_HOST   — e.g. smtp.gmail.com
 *   SMTP_PORT   — e.g. 587
 *   SMTP_USER   — SMTP username / email
 *   SMTP_PASS   — SMTP password / app password
 *   SMTP_FROM   — From address (defaults to noreply@trainchat.ai)
 *
 * If SMTP is not configured, emails are not sent but DB records are still saved.
 */

import nodemailer from "nodemailer";
import { logger } from "./logger";

const SUPPORT_EMAIL = "Bryan.jones@trainchat.ai";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

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

function buildSubject(payload: SupportEmailPayload): string {
  const typeLabel =
    payload.type === "contact" ? "Support" :
    payload.type === "bug" ? "Bug" :
    "Feature";
  const detail = payload.category ?? payload.subject ?? "General";
  return `[TrainChat ${typeLabel}] ${detail} — ${payload.email}`;
}

function buildHtmlBody(payload: SupportEmailPayload): string {
  const rows = (obj: Record<string, unknown>) =>
    Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#9ca3af;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0;color:#f3f4f6">${String(v)}</td></tr>`)
      .join("");

  const typeLabel =
    payload.type === "contact" ? "Contact Support" :
    payload.type === "bug" ? "Bug Report" :
    "Feature Request";

  const fields: Record<string, unknown> = {
    "Type": typeLabel,
    "Name": payload.name,
    "Email": payload.email,
  };

  if (payload.category) fields["Category"] = payload.category;
  if (payload.subject) fields["Feature Title"] = payload.subject;

  const meta = payload.metadata ?? {};
  const metaRows: Record<string, unknown> = {};

  if (meta.userId ?? payload.userId) metaRows["User ID"] = meta.userId ?? payload.userId;
  if (meta.plan) metaRows["Plan"] = meta.plan;
  if (meta.activeSystemId) metaRows["Active System ID"] = meta.activeSystemId;
  if (meta.environment) metaRows["Environment"] = meta.environment;
  if (meta.deviceInfo) metaRows["Device / Browser"] = meta.deviceInfo;
  if (meta.currentRoute) metaRows["Page"] = meta.currentRoute;
  if (meta.timestamp) metaRows["Submitted at"] = meta.timestamp;

  const messageContent =
    payload.type === "bug"
      ? buildBugMessageHtml(payload.message, meta)
      : `<pre style="background:#111827;color:#f3f4f6;padding:16px;border-radius:6px;font-size:13px;white-space:pre-wrap;margin:0">${escapeHtml(payload.message)}</pre>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f3f4f6;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:#1e293b;border-radius:8px;padding:24px;border:1px solid #334155">
      <h2 style="margin:0 0 20px;color:#38bdf8;font-size:18px">${typeLabel}</h2>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px">
        ${rows(fields)}
      </table>

      <div style="margin-bottom:16px">
        <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em">Message</p>
        ${messageContent}
      </div>

      ${Object.keys(metaRows).length > 0 ? `
      <details style="margin-top:20px">
        <summary style="cursor:pointer;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Debug context</summary>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">
          ${rows(metaRows)}
        </table>
      </details>` : ""}
    </div>
  </div>
</body>
</html>`;
}

function buildBugMessageHtml(message: string, meta: Record<string, unknown>): string {
  const sections: string[] = [];
  try {
    const parsed = JSON.parse(message) as Record<string, string>;
    if (parsed.whatHappened) sections.push(`<p style="margin:0 0 4px;color:#9ca3af;font-size:12px;text-transform:uppercase">What happened</p><pre style="background:#111827;color:#f3f4f6;padding:12px;border-radius:6px;font-size:13px;white-space:pre-wrap;margin:0 0 12px">${escapeHtml(parsed.whatHappened)}</pre>`);
    if (parsed.expectedBehavior) sections.push(`<p style="margin:0 0 4px;color:#9ca3af;font-size:12px;text-transform:uppercase">Expected behavior</p><pre style="background:#111827;color:#f3f4f6;padding:12px;border-radius:6px;font-size:13px;white-space:pre-wrap;margin:0 0 12px">${escapeHtml(parsed.expectedBehavior)}</pre>`);
    if (parsed.stepsToReproduce) sections.push(`<p style="margin:0 0 4px;color:#9ca3af;font-size:12px;text-transform:uppercase">Steps to reproduce</p><pre style="background:#111827;color:#f3f4f6;padding:12px;border-radius:6px;font-size:13px;white-space:pre-wrap;margin:0 0 12px">${escapeHtml(parsed.stepsToReproduce)}</pre>`);
    if (sections.length > 0) return sections.join("");
  } catch {
    // fall through
  }
  return `<pre style="background:#111827;color:#f3f4f6;padding:16px;border-radius:6px;font-size:13px;white-space:pre-wrap;margin:0">${escapeHtml(message)}</pre>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Sends a support submission email.
 * Returns { sent: true } on success or { sent: false, reason } on failure/unconfigured.
 */
export async function sendSupportEmail(payload: SupportEmailPayload): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();

  if (!transporter) {
    logger.warn(
      { type: payload.type, email: payload.email },
      "[SupportEmail] SMTP not configured — email not sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable. DB record saved."
    );
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    await transporter.sendMail({
      from: `TrainChat Support <${process.env.SMTP_FROM ?? "noreply@trainchat.ai"}>`,
      to: SUPPORT_EMAIL,
      replyTo: payload.email,
      subject: buildSubject(payload),
      html: buildHtmlBody(payload),
    });

    logger.info({ type: payload.type, to: SUPPORT_EMAIL, from: payload.email }, "[SupportEmail] Email sent successfully");
    return { sent: true };
  } catch (err) {
    logger.error({ err, type: payload.type }, "[SupportEmail] Failed to send email");
    return { sent: false, reason: "send_failed" };
  }
}
