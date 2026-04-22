import type { MailProvider, ProviderSendInput, ProviderSendResult } from "./types";

type MicrosoftGraphProviderConfig = {
  accessToken: string;
  mailboxEmail: string;
};

export class MicrosoftGraphProvider implements MailProvider {
  constructor(private readonly config: MicrosoftGraphProviderConfig) {}

  async verifyConnection(): Promise<void> {
    const resp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Microsoft Graph verify failed: ${text.slice(0, 400)}`);
    }
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const replyToAddress = (input.replyTo ?? input.fromEmail ?? this.config.mailboxEmail).trim();

    const createBody = {
      subject: input.subject,
      body: {
        contentType: "HTML",
        content: input.html,
      },
      toRecipients: [
        {
          emailAddress: {
            address: input.toEmail,
          },
        },
      ],
      replyTo:
        replyToAddress
          ? [
              {
                emailAddress: {
                  address: replyToAddress,
                },
              },
            ]
          : undefined,
    };

    const createResp = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody),
    });

    if (!createResp.ok) {
      const text = await createResp.text();
      throw new Error(`Microsoft Graph create message failed: ${text.slice(0, 500)}`);
    }

    const created = (await createResp.json()) as { id: string; conversationId?: string };

    const sendResp = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(created.id)}/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      },
    );

    if (!sendResp.ok) {
      const text = await sendResp.text();
      throw new Error(`Microsoft Graph send failed: ${text.slice(0, 500)}`);
    }

    return {
      providerMessageId: created.id,
      providerThreadId: created.conversationId,
    };
  }
}
