import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { createEmailLog, updateEmailLog, recordOpenEvent, updateCampaign, getCampaignStats } from "../db";
import { notifyOwner } from "../_core/notification";
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

export function interpolateTemplate(template: string, contact: Partial<Contact>): string {
  return template
    .replace(/\{\{firstName\}\}/g, contact.firstName ?? contact.fullName?.split(" ")[0] ?? "there")
    .replace(/\{\{lastName\}\}/g, contact.lastName ?? "")
    .replace(/\{\{fullName\}\}/g, contact.fullName ?? "")
    .replace(/\{\{company\}\}/g, contact.company ?? "your company")
    .replace(/\{\{title\}\}/g, contact.title ?? "")
    .replace(/\{\{industry\}\}/g, contact.industry ?? "")
    .replace(/\{\{location\}\}/g, contact.location ?? "")
    .replace(/\{\{email\}\}/g, contact.email ?? "");
}

function buildTrackingPixel(trackingId: string, baseUrl: string): string {
  return `<img src="${baseUrl}/api/track/${trackingId}.gif" width="1" height="1" style="display:none" alt="" />`;
}

function wrapInHtml(body: string, trackingPixel: string): string {
  // Convert plain text line breaks to HTML, append tracking pixel
  const htmlBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
${htmlBody}
${trackingPixel}
</body>
</html>`;
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

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; trackingId: string; error?: string }> {
  const { contact, campaign, step, campaignContactId, subject, body, baseUrl } = opts;

  if (!contact.email) {
    return { success: false, trackingId: "", error: "Contact has no email address" };
  }

  const trackingId = uuidv4();
  const trackingPixel = buildTrackingPixel(trackingId, baseUrl);
  const htmlBody = wrapInHtml(body, trackingPixel);

  // Create email log entry
  const logData = {
    campaignId: campaign.id,
    contactId: contact.id,
    sequenceStepId: step.id,
    campaignContactId,
    subject,
    body: htmlBody,
    fromEmail: campaign.fromEmail ?? "outreach@behberg.com",
    toEmail: contact.email,
    status: "queued" as const,
    trackingId,
    scheduledAt: new Date(),
  };

  await createEmailLog(logData);

  try {
    const transporter = getTransporter();
    const fromName = campaign.fromName ?? "Behberg";
    const fromEmail = campaign.fromEmail ?? process.env.SMTP_USER ?? "outreach@behberg.com";

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: contact.email,
      replyTo: campaign.replyTo ?? fromEmail,
      subject,
      html: htmlBody,
      text: body, // Plain text fallback
    });

    // Mark as sent
    await updateEmailLog(0, { status: "sent", sentAt: new Date() });

    // Update via tracking ID since we don't have the log ID back
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      const { emailLogs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(emailLogs).set({ status: "sent", sentAt: new Date() }).where(eq(emailLogs.trackingId, trackingId));
    }

    // Increment campaign sent count
    const stats = await getCampaignStats(campaign.id);
    const newSentCount = (stats?.sentCount ?? 0) + 1;
    await updateCampaign(campaign.id, { sentCount: newSentCount });

    // Milestone notifications
    await checkMilestones(campaign.id, newSentCount, stats);

    return { success: true, trackingId };
  } catch (err: any) {
    // Mark as failed
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      const { emailLogs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(emailLogs)
        .set({ status: "failed", errorMessage: err.message })
        .where(eq(emailLogs.trackingId, trackingId));
    }

    return { success: false, trackingId, error: err.message };
  }
}

async function checkMilestones(campaignId: number, sentCount: number, stats: any) {
  if (!stats) return;

  // 100 sent milestone
  if (sentCount >= 100 && !stats.notifiedAt100Sent) {
    await updateCampaign(campaignId, { notifiedAt100Sent: true });
    await notifyOwner({
      title: `🎯 Campaign Milestone: 100 emails sent`,
      content: `Campaign "${stats.name}" has reached 100 sent emails. Open rate: ${stats.openCount > 0 ? Math.round((stats.openCount / sentCount) * 100) : 0}%`,
    });
  }

  // High reply rate (>20%)
  const replyRate = stats.replyCount / Math.max(sentCount, 1);
  if (replyRate > 0.2 && !stats.notifiedHighReply && sentCount >= 10) {
    await updateCampaign(campaignId, { notifiedHighReply: true });
    await notifyOwner({
      title: `🔥 High Reply Rate Detected`,
      content: `Campaign "${stats.name}" has a ${Math.round(replyRate * 100)}% reply rate (${stats.replyCount} replies from ${sentCount} sent).`,
    });
  }

  // Bounce detection (>5%)
  const bounceRate = stats.bounceCount / Math.max(sentCount, 1);
  if (bounceRate > 0.05 && !stats.notifiedBounce && sentCount >= 10) {
    await updateCampaign(campaignId, { notifiedBounce: true });
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
