import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { emailLogs } from "../../drizzle/schema";
import { getDb, getEmailLogByProviderMessageId, getMailboxById } from "../db";
import { getMicrosoftGraphAccessTokenForMailbox } from "./providers";

const SNIPPET_MAX = 4_000;

function normalizeAddress(email: string): string {
  return email.trim().toLowerCase();
}

function stripSimpleHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type GraphMessageBody = { contentType?: string; content?: string };

type GraphMessage = {
  id: string;
  conversationId?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  body?: GraphMessageBody;
  uniqueBody?: GraphMessageBody;
};

export async function fetchMicrosoftGraphMessage(
  mailboxId: number,
  messageId: string,
): Promise<GraphMessage | null> {
  const token = await getMicrosoftGraphAccessTokenForMailbox(mailboxId);
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`,
  );
  url.searchParams.set(
    "$select",
    "id,conversationId,from,body,uniqueBody,internetMessageId",
  );
  const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const text = await resp.text();
    console.warn("[inboundMessageFetch] Graph GET message failed", { status: resp.status, text: text.slice(0, 500) });
    return null;
  }
  return (await resp.json()) as GraphMessage;
}

export function extractPlainTextFromGraphMessage(m: GraphMessage): string {
  const prefer = m.uniqueBody?.content?.length ? m.uniqueBody : m.body;
  const content = prefer?.content ?? "";
  const contentType = (prefer?.contentType ?? "text").toLowerCase();
  if (contentType.includes("html")) {
    return stripSimpleHtmlToText(content).slice(0, SNIPPET_MAX);
  }
  return content.trim().slice(0, SNIPPET_MAX);
}

export function trimSnippet(text: string): string {
  return text.trim().slice(0, SNIPPET_MAX);
}

/**
 * Resolves a sent `email_logs` row for an *inbound* Inbox message (Graph id often differs from sent `providerMessageId`).
 */
export async function findSentEmailLogForMicrosoftInbound(
  mailboxId: number,
  conversationId: string | null,
  fromEmail: string,
) {
  const db = await getDb();
  if (!db) return undefined;
  const from = normalizeAddress(fromEmail);

  if (conversationId) {
    const withThread = await db
      .select()
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.mailboxId, mailboxId),
          eq(emailLogs.status, "sent"),
          isNull(emailLogs.repliedAt),
          eq(emailLogs.providerThreadId, conversationId),
          sql`LOWER(${emailLogs.toEmail}) = ${from}`,
        ),
      )
      .orderBy(desc(emailLogs.sentAt), desc(emailLogs.id))
      .limit(1);
    if (withThread[0]) return withThread[0];
  }

  const fallback = await db
    .select()
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.mailboxId, mailboxId),
        eq(emailLogs.status, "sent"),
        isNull(emailLogs.repliedAt),
        sql`LOWER(${emailLogs.toEmail}) = ${from}`,
      ),
    )
    .orderBy(desc(emailLogs.sentAt), desc(emailLogs.id))
    .limit(1);
  return fallback[0];
}

/**
 * If the inbound message is from the mailbox itself, not a lead reply, skip.
 */
export async function isSelfSentMicrosoftMessage(mailboxId: number, fromEmail: string): Promise<boolean> {
  const mailbox = await getMailboxById(mailboxId);
  if (!mailbox) return true;
  return normalizeAddress(fromEmail) === normalizeAddress(mailbox.email);
}

export async function resolveMicrosoftReplyTargetLog(
  mailboxId: number,
  messageId: string,
): Promise<{ logId: number; textSnippet: string } | null> {
  try {
    return await resolveMicrosoftReplyTargetLogInner(mailboxId, messageId);
  } catch (e) {
    console.warn("[resolveMicrosoftReplyTargetLog]", (e as Error)?.message ?? e);
    return null;
  }
}

async function resolveMicrosoftReplyTargetLogInner(
  mailboxId: number,
  messageId: string,
): Promise<{ logId: number; textSnippet: string } | null> {
  const direct = await getEmailLogByProviderMessageId(messageId);
  if (direct) {
    const msg = await fetchMicrosoftGraphMessage(mailboxId, messageId);
    const text = msg
      ? trimSnippet(extractPlainTextFromGraphMessage(msg))
      : await fetchBodySnippetByGraphId(mailboxId, messageId);
    return { logId: direct.id, textSnippet: text ?? "" };
  }

  const message = await fetchMicrosoftGraphMessage(mailboxId, messageId);
  if (!message) return null;
  const fromAddr = message.from?.emailAddress?.address ?? "";
  if (!fromAddr) return null;
  if (await isSelfSentMicrosoftMessage(mailboxId, fromAddr)) return null;

  const conv = message.conversationId ?? null;
  const log = await findSentEmailLogForMicrosoftInbound(mailboxId, conv, fromAddr);
  if (!log) return null;
  return {
    logId: log.id,
    textSnippet: trimSnippet(extractPlainTextFromGraphMessage(message)),
  };
}

async function fetchBodySnippetByGraphId(
  mailboxId: number,
  messageId: string,
): Promise<string | null> {
  const m = await fetchMicrosoftGraphMessage(mailboxId, messageId);
  if (!m) return null;
  return trimSnippet(extractPlainTextFromGraphMessage(m));
}
