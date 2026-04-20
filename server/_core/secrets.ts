import crypto from "node:crypto";

type EncryptedBlob = {
  iv: string;
  tag: string;
  data: string;
};

function getSecretKey(): Buffer {
  const raw = process.env.MAILBOX_TOKEN_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "";
  if (!raw.trim()) {
    throw new Error("MAILBOX_TOKEN_ENCRYPTION_KEY (or JWT_SECRET fallback) is required");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(value: string): string {
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedBlob = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const key = getSecretKey();
  const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as EncryptedBlob;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const data = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]);
  return data.toString("utf8");
}
