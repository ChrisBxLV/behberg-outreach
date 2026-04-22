import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import type { TenantQueryScope } from "../_core/authz";
import {
  countMailboxEmailsSentSince,
  createEmailLog,
  getEmailLogByIdempotencyKey,
  updateEmailLog,
  getCampaignStats,
  getMailboxById,
  getMailboxHealthByMailboxId,
  getMailboxSendLimitsByMailboxId,
  updateCampaign,
  updateMailbox,
  upsertMailboxHealth,
} from "../db";
import { notifyOwner } from "../_core/notification";
import { buildProviderForMailbox } from "./providers";
import { logMailboxEvent, logMailboxMetric } from "./observability";
import { createUnsubscribeToken } from "./unsubscribeToken";

/** Scheduler / internal updates run without a user session; match legacy unscoped campaign writes. */
const internalCampaignWriteScope: TenantQueryScope = { type: "platform" };
import type { Contact, Campaign, SequenceStep } from "../../drizzle/schema";

let _transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST ?? "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("SMTP credentials not configured. Set SMTP_USER and SMTP_PASS environment variables.");
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS
    auth: { user, pass },
    tls: { ciphers: "SSLv3" },
  });

  return _transporter;
}

export function resetTransporter() {
  _transporter = null;
}

export type InterpolateContext = { senderName?: string };

export function interpolateTemplate(
  template: string,
  contact: Partial<Contact>,
  ctx?: InterpolateContext,
): string {
  const sender = (ctx?.senderName ?? "").trim();
  return template
    .replace(/\{\{firstName\}\}/g, contact.firstName ?? contact.fullName?.split(" ")[0] ?? "there")
    .replace(/\{\{lastName\}\}/g, contact.lastName ?? "")
    .replace(/\{\{fullName\}\}/g, contact.fullName ?? "")
    .replace(/\{\{company\}\}/g, contact.company ?? "your company")
    .replace(/\{\{title\}\}/g, contact.title ?? "")
    .replace(/\{\{industry\}\}/g, contact.industry ?? "")
    .replace(/\{\{location\}\}/g, contact.location ?? "")
    .replace(/\{\{email\}\}/g, contact.email ?? "")
    .replace(/\{\{senderName\}\}/g, sender || "Your name");
}

function buildTrackingPixel(trackingId: string, baseUrl: string): string {
  return `<img src="${baseUrl}/api/track/${trackingId}.gif" width="1" height="1" style="display:none" alt="" />`;
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripSimpleHtmlForText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type WrapInHtmlOptions = {
  /** Trusted HTML from mailbox settings */
  signatureHtml?: string | null;
  /** Public URL: shown as small gray Unsubscribe (one-click) */
  unsubscribeUrl?: string | null;
  /** Optional logo above signature */
  signatureLogoUrl?: string | null;
};

function wrapInHtml(body: string, trackingPixel: string, opts?: WrapInHtmlOptions): string {
  const htmlBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const logo = (opts?.signatureLogoUrl ?? "").trim();
  const logoBlock = logo
    ? `<p style="margin:0 0 12px;"><img src="${escapeHtmlAttr(logo)}" alt="" style="max-height:40px;max-width:200px;" /></p>`
    : "";

  const sig = (opts?.signatureHtml ?? "").trim();
  const sigBlock =
    logoBlock || sig
      ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e5e5;">${logoBlock}${sig}</div>`
      : "";

  const u = (opts?.unsubscribeUrl ?? "").trim();
  const unsubBlock = u
    ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.4;">` +
      `<a href="${escapeHtmlAttr(u)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a> ` +
      `from future messages from this sender.</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; font-size: 14px; line-height: 1.5; color: #111827; margin: 0; padding: 0; text-align: left; background: #fff;">
<div style="margin: 0; padding: 0 2px; max-width: 100%; text-align: left;">
${htmlBody}
${sigBlock}
${trackingPixel}
${unsubBlock}
</div>
</body>
</html>`;
}

function buildPlainTextWithFooter(
  body: string,
  opts?: { signatureHtml?: string | null; signatureLogoUrl?: string | null; unsubscribeUrl?: string | null },
): string {
  const parts: string[] = [body];
  if ((opts?.signatureHtml ?? "").trim() || (opts?.signatureLogoUrl ?? "").trim()) {
    if ((opts?.signatureLogoUrl ?? "").trim()) {
      parts.push("", opts!.signatureLogoUrl!);
    }
    if ((opts?.signatureHtml ?? "").trim()) {
      parts.push("", stripSimpleHtmlForText(opts!.signatureHtml!));
    }
  }
  if ((opts?.unsubscribeUrl ?? "").trim()) {
    parts.push("", `Unsubscribe: ${opts!.unsubscribeUrl!}`);
  }
  return parts.join("\n");
}

export interface SendEmailOptions {
  contact: Contact;
  campaign: Campaign;
  step: SequenceStep;
  campaignContactId: number;
  subject: string;
  body: string; // Already personalized
  baseUrl: string;
}

function isMailboxReauthError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return lower.includes("reauth_required") || lower.includes("invalid_grant") || lower.includes("requires re-authentication");
}

async function enforceMailboxRateLimit(mailboxId: number) {
  const limits = await getMailboxSendLimitsByMailboxId(mailboxId);
  if (!limits) return;
  const now = new Date();
  const hourWindow = new Date(now.getTime() - 60 * 60 * 1000);
  const dayWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [hourCount, dayCount] = await Promise.all([
    countMailboxEmailsSentSince(mailboxId, hourWindow),
    countMailboxEmailsSentSince(mailboxId, dayWindow),
  ]);
  if (hourCount >= limits.hourlyLimit) {
    throw new Error(`Mailbox hourly limit reached (${limits.hourlyLimit}/hour)`);
  }
  if (dayCount >= limits.dailyLimit) {
    throw new Error(`Mailbox daily limit reached (${limits.dailyLimit}/day)`);
  }
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; trackingId: string; error?: string }> {
  const { contact, campaign, step, campaignContactId, subject, body, baseUrl } = opts;

  if (!contact.email) {
    return { success: false, trackingId: "", error: "Contact has no email address" };
  }

  const idempotencyKey = `${campaignContactId}:${step.id}`;
  const existingPre = await getEmailLogByIdempotencyKey(idempotencyKey);
  if (existingPre?.status === "sent") {
    return { success: true, trackingId: existingPre.trackingId ?? "" };
  }
  if (existingPre?.status === "queued") {
    return { success: false, trackingId: existingPre.trackingId ?? "", error: "Send already in progress for this step" };
  }
  if (existingPre?.status === "bounced") {
    return { success: false, trackingId: existingPre.trackingId ?? "", error: "Cannot resend: previous send bounced" };
  }

  const effectiveTrackingId =
    existingPre?.status === "failed" && existingPre.trackingId ? existingPre.trackingId : uuidv4();

  const trackingPixel = buildTrackingPixel(effectiveTrackingId, baseUrl);
  const base = baseUrl.replace(/\/$/, "");

  let signatureHtml: string | null | undefined;
  let signatureLogoUrl: string | null | undefined;
  let unsubscribeUrl: string | undefined;

  if (campaign.mailboxId != null) {
    const mb = await getMailboxById(campaign.mailboxId);
    if (mb) {
      signatureHtml = mb.signatureHtml ?? undefined;
      signatureLogoUrl = mb.signatureLogoUrl ?? undefined;
      try {
        const token = createUnsubscribeToken({
          mailboxId: mb.id,
          contactId: contact.id,
          email: contact.email.trim().toLowerCase(),
        });
        unsubscribeUrl = `${base}/api/public/unsubscribe?token=${encodeURIComponent(token)}`;
      } catch (e: any) {
        console.warn("[Email] Unsubscribe link skipped:", e?.message ?? e);
      }
    }
  }

  const wrapOpts: WrapInHtmlOptions = {
    signatureHtml,
    signatureLogoUrl,
    unsubscribeUrl: unsubscribeUrl ?? null,
  };
  const htmlBody = wrapInHtml(body, trackingPixel, wrapOpts);
  const plainText = buildPlainTextWithFooter(body, wrapOpts);

  if (existingPre?.status === "failed" && existingPre.id) {
    await updateEmailLog(existingPre.id, { status: "queued", errorMessage: null, body: htmlBody, subject });
  } else {
    const logData = {
      campaignId: campaign.id,
      contactId: contact.id,
      sequenceStepId: step.id,
      campaignContactId,
      mailboxId: campaign.mailboxId ?? null,
      subject,
      body: htmlBody,
      fromEmail: campaign.fromEmail ?? "outreach@behberg.com",
      toEmail: contact.email,
      status: "queued" as const,
      trackingId: effectiveTrackingId,
      idempotencyKey,
      scheduledAt: new Date(),
    };

    try {
      await createEmailLog(logData);
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY" || String(e?.message ?? "").toLowerCase().includes("duplicate")) {
        const again = await getEmailLogByIdempotencyKey(idempotencyKey);
        if (again?.status === "sent") {
          return { success: true, trackingId: again.trackingId ?? "" };
        }
      }
      throw e;
    }
  }

  try {
    const fromName = campaign.fromName ?? "Behberg";
    let fromEmail = campaign.fromEmail ?? process.env.SMTP_USER ?? "outreach@behberg.com";
    let providerMessageId: string | undefined;
    let providerThreadId: string | undefined;

    if (campaign.mailboxId != null) {
      const mailbox = await getMailboxById(campaign.mailboxId);
      if (!mailbox) throw new Error("Selected mailbox no longer exists");
      fromEmail = mailbox.email;
      const health = await getMailboxHealthByMailboxId(campaign.mailboxId);
      if (health?.reauthRequired) throw new Error("Mailbox requires re-authentication");
      if (mailbox.status === "error" || mailbox.status === "disabled" || mailbox.status === "reauth_required") {
        throw new Error(`Mailbox is not healthy (${mailbox.status})`);
      }

      await enforceMailboxRateLimit(mailbox.id);
      const provider = await buildProviderForMailbox(mailbox.id);
      const providerResult = await provider.send({
        fromName,
        fromEmail,
        replyTo: campaign.replyTo ?? fromEmail,
        toEmail: contact.email,
        subject,
        html: htmlBody,
        text: plainText,
      });
      providerMessageId = providerResult.providerMessageId;
      providerThreadId = providerResult.providerThreadId;
      await upsertMailboxHealth(mailbox.id, {
        reauthRequired: false,
        errorCode: null,
        errorMessage: null,
        lastSuccessAt: new Date(),
      });
      await updateMailbox(mailbox.id, { status: "connected" });
      logMailboxMetric("mailbox_send_success_total", 1, {
        provider: mailbox.provider,
        mailboxId: String(mailbox.id),
      });
    } else {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: contact.email,
        replyTo: campaign.replyTo ?? fromEmail,
        subject,
        html: htmlBody,
        text: plainText,
      });
    }

    // Update via tracking ID since we don't have the log ID back
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      const { emailLogs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(emailLogs).set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: providerMessageId ?? null,
        providerThreadId: providerThreadId ?? null,
      }).where(eq(emailLogs.trackingId, effectiveTrackingId));
    }

    // Increment campaign sent count
    const stats = await getCampaignStats(campaign.id);
    const newSentCount = (stats?.sentCount ?? 0) + 1;
    await updateCampaign(campaign.id, { sentCount: newSentCount }, internalCampaignWriteScope);

    // Milestone notifications
    await checkMilestones(campaign.id, newSentCount, stats);

    logMailboxEvent("mail_send_ok", {
      campaignId: campaign.id,
      mailboxId: campaign.mailboxId ?? null,
      contactId: contact.id,
    });

    return { success: true, trackingId: effectiveTrackingId };
  } catch (err: any) {
    if (campaign.mailboxId != null) {
      const reason = String(err?.message ?? "send_failed");
      const reauthRequired = isMailboxReauthError(reason);
      await upsertMailboxHealth(campaign.mailboxId, {
        lastErrorAt: new Date(),
        errorCode: reauthRequired ? "reauth_required" : "send_failed",
        errorMessage: reason,
        reauthRequired,
      });
      await updateMailbox(campaign.mailboxId, { status: reauthRequired ? "reauth_required" : "error" });
      logMailboxMetric("mailbox_send_error_total", 1, {
        mailboxId: String(campaign.mailboxId),
      });
    }
    logMailboxEvent("mail_send_failed", {
      campaignId: campaign.id,
      mailboxId: campaign.mailboxId ?? null,
      contactId: contact.id,
      error: err.message,
    });
    // Mark as failed
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      const { emailLogs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(emailLogs)
        .set({ status: "failed", errorMessage: err.message })
        .where(eq(emailLogs.trackingId, effectiveTrackingId));
    }

    return { success: false, trackingId: effectiveTrackingId, error: err.message };
  }
}

async function checkMilestones(campaignId: number, sentCount: number, stats: any) {
  if (!stats) return;

  // 100 sent milestone
  if (sentCount >= 100 && !stats.notifiedAt100Sent) {
    await updateCampaign(campaignId, { notifiedAt100Sent: true }, internalCampaignWriteScope);
    await notifyOwner({
      title: `🎯 Campaign Milestone: 100 emails sent`,
      content: `Campaign "${stats.name}" has reached 100 sent emails. Open rate: ${stats.openCount > 0 ? Math.round((stats.openCount / sentCount) * 100) : 0}%`,
    });
  }

  // High reply rate (>20%)
  const replyRate = stats.replyCount / Math.max(sentCount, 1);
  if (replyRate > 0.2 && !stats.notifiedHighReply && sentCount >= 10) {
    await updateCampaign(campaignId, { notifiedHighReply: true }, internalCampaignWriteScope);
    await notifyOwner({
      title: `🔥 High Reply Rate Detected`,
      content: `Campaign "${stats.name}" has a ${Math.round(replyRate * 100)}% reply rate (${stats.replyCount} replies from ${sentCount} sent).`,
    });
  }

  // Bounce detection (>5%)
  const bounceRate = stats.bounceCount / Math.max(sentCount, 1);
  if (bounceRate > 0.05 && !stats.notifiedBounce && sentCount >= 10) {
    await updateCampaign(campaignId, { notifiedBounce: true }, internalCampaignWriteScope);
    await notifyOwner({
      title: `⚠️ High Bounce Rate Detected`,
      content: `Campaign "${stats.name}" has a ${Math.round(bounceRate * 100)}% bounce rate (${stats.bounceCount} bounces from ${sentCount} sent). Review your contact list.`,
    });
  }
}

export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendLoginCodeEmail(opts: {
  toEmail: string;
  code: string;
  expiresInMinutes: number;
  /** When the code is emailed to a fallback inbox, name the account it applies to. */
  accountLoginHint?: string;
}) {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_USER ?? "outreach@behberg.com";
  const subject = "Your Behberg admin login code";
  const hintLine =
    opts.accountLoginHint && opts.accountLoginHint.toLowerCase() !== opts.toEmail.toLowerCase()
      ? ` This code is for account: ${opts.accountLoginHint}.`
      : "";
  const text = `Your Behberg login code is ${opts.code}. It expires in ${opts.expiresInMinutes} minutes.${hintLine}`;
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Arial,sans-serif;color:#111;line-height:1.6;">
  <p>Your Behberg login code is:</p>
  <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:8px 0;">${opts.code}</p>
  <p>This code expires in ${opts.expiresInMinutes} minutes.${hintLine ? `<br/><span style="font-size:13px;color:#444">${hintLine.trim()}</span>` : ""}</p>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Behberg Admin" <${fromEmail}>`,
    to: opts.toEmail,
    subject,
    text,
    html,
  });
}

export async function sendPasswordResetEmail(opts: {
  toEmail: string;
  code: string;
  expiresInMinutes: number;
  accountLoginHint?: string;
}) {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_USER ?? "outreach@behberg.com";
  const subject = "Reset your Behberg password";
  const hintLine =
    opts.accountLoginHint && opts.accountLoginHint.toLowerCase() !== opts.toEmail.toLowerCase()
      ? ` This reset is for account: ${opts.accountLoginHint}.`
      : "";
  const text = `Use this code to set a new Behberg password: ${opts.code}. It expires in ${opts.expiresInMinutes} minutes.${hintLine} If you did not request a reset, ignore this email.`;
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Arial,sans-serif;color:#111;line-height:1.6;">
  <p>Your password reset code is:</p>
  <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:8px 0;">${opts.code}</p>
  <p>This code expires in ${opts.expiresInMinutes} minutes.${hintLine ? `<br/><span style="font-size:13px;color:#444">${hintLine.trim()}</span>` : ""}</p>
  <p style="font-size:13px;color:#666">If you did not request a password reset, you can ignore this message.</p>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Behberg Admin" <${fromEmail}>`,
    to: opts.toEmail,
    subject,
    text,
    html,
  });
}
