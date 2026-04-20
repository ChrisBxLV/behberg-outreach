import nodemailer from "nodemailer";
import type { MailProvider, ProviderSendInput, ProviderSendResult } from "./types";

type OauthSmtpProviderConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  accessToken: string;
};

/**
 * Provider for Gmail / Microsoft via OAuth2 SMTP.
 * This keeps transport implementation unified while storing per-mailbox tokens.
 */
export class OauthSmtpProvider implements MailProvider {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: OauthSmtpProviderConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        type: "OAuth2",
        user: config.username,
        accessToken: config.accessToken,
      },
    });
  }

  async verifyConnection(): Promise<void> {
    await this.transporter.verify();
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    const info = await this.transporter.sendMail({
      from: `"${input.fromName}" <${input.fromEmail}>`,
      to: input.toEmail,
      replyTo: input.replyTo ?? input.fromEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { providerMessageId: info.messageId ?? undefined };
  }
}
