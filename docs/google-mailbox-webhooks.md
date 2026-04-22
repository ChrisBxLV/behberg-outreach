# Google (Gmail) mailboxes: sending and webhooks

## Current behavior

Connected **Google** mailboxes use **OAuth SMTP** (not the Gmail API) to send outbound messages. Outbound message IDs from the Gmail REST API are therefore **not** available on `email_logs.providerMessageId` unless the product moves to **Gmail API send** (`users.messages.send`) and stores the returned `id`.

## Implications

- **Inbound reply classification** via Graph-style webhooks is **not** implemented for Google in this codebase. Matching an arbitrary inbound IMAP/Gmail message to a sent row without a shared provider message id requires **Gmail API** message ids and **Gmail history / watch** (or polling), or a separate **IMAP** integration.
- **Microsoft 365** mailboxes use Microsoft Graph for send and can use **Graph subscriptions** on the Inbox plus `conversationId` / body fetch (implemented in the email platform hardening workstream).

## Recommended path (longer term)

1. Switch Google sending to **Gmail API** and persist `providerMessageId` from the send response.
2. Add **Gmail `users.watch`** (or Google Pub/Sub) and process `historyId` notifications to correlate inbound replies.

Until then, Google mailboxes rely on **open tracking** (pixel), **manual “mark replied”** in the app, and other non-webhook signals as implemented in the product.
