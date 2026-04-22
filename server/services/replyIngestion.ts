import { and, count, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  getDb,
  getEmailLogById,
  deactivateEnrollmentsForMailboxContact,
  recordMailboxUnsubscribe,
} from "../db";
import { campaignContacts, campaigns, emailLogs } from "../../drizzle/schema";
import { classifyReplyText, type ReplySentimentLabel } from "./replyClassifier";

const TERMINAL = {
  nextSendAt: null as null,
} as const;

export async function ingestEmailReply(
  logId: number,
  opts: {
    textSnippet?: string | null;
    /** If set, skip LLM (e.g. manual mark) */
    forceSentiment?: ReplySentimentLabel;
  } = {},
) {
  const db = await getDb();
  if (!db) return;

  const log = await getEmailLogById(logId);
  if (!log) return;

  const wasReplied = log.repliedAt != null;
  if (wasReplied) return;

  const snippet = (opts.textSnippet ?? "").trim() || (log.replySnippet as string) || "";
  const sentiment: ReplySentimentLabel = opts.forceSentiment ?? (await classifyReplyText(snippet));

  const repliedAt = log.repliedAt ?? new Date();

  await db
    .update(emailLogs)
    .set({
      repliedAt,
      replySentiment: sentiment,
      replySnippet: snippet || log.replySnippet,
    })
    .where(eq(emailLogs.id, logId));

  const [earlier] = await db
    .select({ n: count() })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.campaignId, log.campaignId),
        eq(emailLogs.contactId, log.contactId),
        isNotNull(emailLogs.repliedAt),
        ne(emailLogs.id, logId),
      ),
    );
  if (Number(earlier?.n ?? 0) === 0) {
    await db
      .update(campaigns)
      .set({ replyCount: sql`${campaigns.replyCount} + 1` })
      .where(eq(campaigns.id, log.campaignId));
  }

  if (!log.campaignContactId) return;

  const completedAt = new Date();

  if (sentiment === "unsubscribe_intent") {
    if (log.mailboxId && log.toEmail) {
      await recordMailboxUnsubscribe(log.mailboxId, log.toEmail, "reply_detected");
      await deactivateEnrollmentsForMailboxContact(log.mailboxId, log.contactId);
    } else {
      await db
        .update(campaignContacts)
        .set({ status: "unsubscribed", ...TERMINAL, completedAt, completionReason: "reply_unsubscribe" })
        .where(eq(campaignContacts.id, log.campaignContactId!));
    }
    return;
  }

  if (sentiment === "negative") {
    await db
      .update(campaignContacts)
      .set({
        status: "completed",
        ...TERMINAL,
        completedAt,
        completionReason: "negative_reply",
      })
      .where(eq(campaignContacts.id, log.campaignContactId!));
    return;
  }

  if (sentiment === "positive") {
    await db
      .update(campaignContacts)
      .set({
        status: "positive_reply",
        ...TERMINAL,
        completedAt,
        completionReason: "positive_reply",
      })
      .where(eq(campaignContacts.id, log.campaignContactId!));
    return;
  }

  await db
    .update(campaignContacts)
    .set({
      status: "replied",
      ...TERMINAL,
      completedAt,
      completionReason: "inbound_reply",
    })
    .where(eq(campaignContacts.id, log.campaignContactId!));
}
