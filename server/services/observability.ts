type MailboxEventName =
  | "microsoft_graph_subscription_skipped"
  | "mailbox_oauth_start"
  | "mailbox_oauth_complete"
  | "mailbox_connected"
  | "mailbox_disconnected"
  | "mailbox_default_changed"
  | "mailbox_test_send_ok"
  | "mailbox_test_send_failed"
  | "mail_send_ok"
  | "mail_send_failed";

export function logMailboxEvent(event: MailboxEventName, payload: Record<string, unknown>) {
  console.info("[MailboxEvent]", JSON.stringify({ event, at: new Date().toISOString(), ...payload }));
}

export function logMailboxMetric(metric: string, value: number, labels: Record<string, string>) {
  console.info("[MailboxMetric]", JSON.stringify({ metric, value, labels, at: new Date().toISOString() }));
}
