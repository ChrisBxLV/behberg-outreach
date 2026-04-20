export type MailProviderKind = "google" | "microsoft" | "smtp";

export type ProviderSendInput = {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
};

export type ProviderSendResult = {
  providerMessageId?: string;
  providerThreadId?: string;
};

export interface MailProvider {
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
  verifyConnection(): Promise<void>;
}
