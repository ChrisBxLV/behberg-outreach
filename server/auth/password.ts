import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { ENV } from "../_core/env";

export function hashOtp(loginId: string, code: string) {
  return createHash("sha256").update(`${loginId}:${code}:${ENV.cookieSecret}`).digest("hex");
}

export function makePasswordSalt() {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string) {
  const iterations = 310_000;
  const derivedKeyBytes = 32;
  return pbkdf2Sync(password, salt, iterations, derivedKeyBytes, "sha256").toString("base64");
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  try {
    const derived = hashPassword(password, salt);
    const a = Buffer.from(derived, "base64");
    const b = Buffer.from(expectedHash, "base64");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
