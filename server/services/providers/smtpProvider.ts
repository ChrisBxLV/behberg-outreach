import nodemailer from "nodemailer";
import type { MailProvider, ProviderSendInput, ProviderSendResult } from "./types";

type SmtpProviderConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

export class SmtpProvider implements MailProvider {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: SmtpProviderConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
      tls: { ciphers: "SSLv3" },
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
