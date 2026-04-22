import { ENV } from "../_core/env";
import { applyProviderTrackingEvent } from "../db";

/**
 * Best-effort parsing for SNS-wrapped SES bounce notifications and plain JSON test payloads.
 * Maps to `email_logs` via `providerMessageId` when the outbound send used that header (e.g. SES message id in logs).
 */
export async function tryIngestSesOrSnsBounceNotification(body: unknown): Promise<boolean> {
  const raw = body as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return false;

  let messageObj: Record<string, unknown> = raw;
  if (typeof raw.Message === "string") {
    try {
      messageObj = JSON.parse(raw.Message) as Record<string, unknown>;
    } catch {
      return false;
    }
  }

  const eventType = String(messageObj.eventType ?? messageObj.Type ?? messageObj.notificationType ?? "").toLowerCase();
  const isBounce =
    eventType.includes("bounce") ||
    (messageObj.bounce && typeof messageObj.bounce === "object") ||
    (messageObj.bounce as Record<string, unknown>) != null;
  if (!isBounce) return false;

  const mail = (messageObj.mail ?? messageObj.Mail) as Record<string, unknown> | undefined;
  const messageId = String(
    (mail as { messageId?: string } | undefined)?.messageId ??
      (messageObj as { messageId?: string }).messageId ??
      (raw as { messageId?: string }).messageId ??
      "",
  ).trim();
  if (!messageId) return false;

  const recips =
    (messageObj.bounce as { bouncedRecipients?: { emailAddress?: string }[] } | undefined)
      ?.bouncedRecipients ?? [];
  const firstEmail = recips[0]?.emailAddress?.toLowerCase() ?? "";
  if (ENV.sesBounceAllowlist.length > 0 && !ENV.sesBounceAllowlist.includes(firstEmail) && firstEmail) {
    return false;
  }

  return applyProviderTrackingEvent({ providerMessageId: messageId, eventType: "bounce" });
}
