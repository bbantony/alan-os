import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import "server-only";

// AES-256-GCM needs a fresh random IV per encryption, so it travels with the
// ciphertext rather than being derived from the key. Format stored in the DB:
// base64(iv):base64(authTag):base64(ciphertext). Used for gcal_connections'
// refresh_token_encrypted column — never for anything client-visible.
function getKey(): Buffer {
  const b64 = process.env.GCAL_TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("GCAL_TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("GCAL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decrypt(packed: string): string {
  const [ivB64, tagB64, dataB64] = packed.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
