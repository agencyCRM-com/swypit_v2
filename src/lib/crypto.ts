import crypto from "node:crypto";

import { env } from "@/lib/env";

const ENCRYPTION_KEY = crypto.createHash("sha256").update(env.ENCRYPTION_SECRET).digest();

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(cipherText: string): string {
  const buffer = Buffer.from(cipherText, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);

  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function verifyWebhookSignature({
  body,
  signature,
  secret,
  toleranceSeconds,
}: {
  body: string;
  signature: string | null;
  secret: string;
  toleranceSeconds: number;
}): boolean {
  if (!signature) {
    return false;
  }

  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );

  if (!parts.t || !parts.v1) {
    return false;
  }

  const ageSeconds = Math.abs(Date.now() - Number(parts.t)) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) {
    return false;
  }

  const payload = `${parts.t}.${body}`;
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  if (digest.length !== parts.v1.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(parts.v1));
}
