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
    const body = {
      message: {
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
        replyTo: replyToAddress
          ? [
              {
                emailAddress: {
                  address: replyToAddress,
                },
              },
            ]
          : undefined,
      },
      saveToSentItems: true,
    };

    const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Microsoft Graph send failed: ${text.slice(0, 500)}`);
    }

    return {};
  }
}

