import { eq } from "drizzle-orm";
import { ENV } from "../_core/env";
import {
  deleteAllGraphSubscriptionsForMailbox,
  getDb,
  getMailboxById,
  listMicrosoftWebhookSubscriptionsDueForRenewal,
  upsertMailboxWebhookSubscription,
} from "../db";
import { mailboxWebhookSubscriptions } from "../../drizzle/schema";
import { getMicrosoftGraphAccessTokenForMailbox } from "./providers";

const SUBSCRIPTION_PATH = "https://graph.microsoft.com/v1.0/subscriptions";
/** Graph allows up to ~4230 min for some resources; use ~48h to renew before edge. */
const EXPIRY_MINUTES = 60 * 24 * 2;

function graphNotificationBaseUrl(): string {
  const base = ENV.appBaseUrl || process.env.APP_BASE_URL?.replace(/\/$/, "") || "";
  if (!base) {
    throw new Error("APP_BASE_URL is required to register Microsoft Graph subscriptions (webhook URL).");
  }
  return base;
}

function notificationUrl(): string {
  return `${graphNotificationBaseUrl()}/api/mailboxes/webhooks/microsoft`;
}

function clientStateValue(): string {
  return (
    ENV.microsoftWebhookClientState ||
    process.env.MICROSOFT_WEBHOOK_CLIENT_STATE?.trim() ||
    ""
  );
}

export function validateMicrosoftClientState(received: string | undefined | null): boolean {
  const expected = clientStateValue();
  if (!expected) {
    if (ENV.isProduction) {
      console.warn(
        "[Graph webhook] MICROSOFT_WEBHOOK_CLIENT_STATE is not set; refusing notifications in production.",
      );
      return false;
    }
    return true;
  }
  return received != null && received === expected;
}

export async function createMicrosoftInboxMessageSubscription(
  mailboxId: number,
): Promise<{ providerSubscriptionId: string; expirationDateTime: string }> {
  const clientState = clientStateValue();
  if (!clientState) {
    throw new Error("Set MICROSOFT_WEBHOOK_CLIENT_STATE in the environment to register Graph webhooks.");
  }
  const token = await getMicrosoftGraphAccessTokenForMailbox(mailboxId);
  const expirationDateTime = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();

  const body = {
    changeType: "created",
    notificationUrl: notificationUrl(),
    resource: "me/mailFolders('inbox')/messages",
    expirationDateTime,
    clientState,
  };

  const resp = await fetch(SUBSCRIPTION_PATH, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Graph create subscription failed: ${resp.status} ${t.slice(0, 500)}`);
  }
  const created = (await resp.json()) as { id: string; expirationDateTime?: string };
  const exp = created.expirationDateTime ?? expirationDateTime;
  await deleteAllGraphSubscriptionsForMailbox(mailboxId);
  await upsertMailboxWebhookSubscription({
    mailboxId,
    providerSubscriptionId: created.id,
    status: "active",
    expiresAt: new Date(exp),
  });
  return { providerSubscriptionId: created.id, expirationDateTime: exp };
}

export async function patchMicrosoftSubscription(
  mailboxId: number,
  providerSubscriptionId: string,
): Promise<void> {
  const token = await getMicrosoftGraphAccessTokenForMailbox(mailboxId);
  const expirationDateTime = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();
  const url = `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(providerSubscriptionId)}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expirationDateTime }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Graph patch subscription failed: ${resp.status} ${t.slice(0, 400)}`);
  }
  const row = (await resp.json().catch(() => ({}))) as { expirationDateTime?: string };
  const exp = row.expirationDateTime ?? expirationDateTime;
  const db = await getDb();
  if (db) {
    await db
      .update(mailboxWebhookSubscriptions)
      .set({ expiresAt: new Date(exp), status: "active" })
      .where(eq(mailboxWebhookSubscriptions.providerSubscriptionId, providerSubscriptionId));
  }
}

export async function ensureMicrosoftInboxSubscriptionIfConfigured(mailboxId: number): Promise<void> {
  const m = await getMailboxById(mailboxId);
  if (!m || m.provider !== "microsoft") return;
  try {
    await createMicrosoftInboxMessageSubscription(mailboxId);
  } catch (e) {
    console.error("[Graph subscription] create failed (mailbox " + mailboxId + "):", (e as Error).message);
  }
}

export async function renewMicrosoftGraphSubscriptions(): Promise<void> {
  const rows = await listMicrosoftWebhookSubscriptionsDueForRenewal(24);
  for (const row of rows) {
    try {
      await patchMicrosoftSubscription(row.mailboxId, row.providerSubscriptionId);
    } catch (e) {
      console.error(
        "[Graph subscription] renew failed",
        row.providerSubscriptionId,
        (e as Error).message,
      );
    }
  }
}
