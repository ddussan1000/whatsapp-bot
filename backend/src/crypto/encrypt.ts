import { env } from "../config/env";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const keyBytes = hexToBytes(env.ENCRYPTION_KEY);
  return crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// Format: base64(iv + ciphertext_with_tag) - 12 bytes IV + ciphertext + 16 bytes auth tag
export async function encrypt(plaintext: string): Promise<string> {
  if (!env.ENCRYPTION_KEY) return plaintext; // pass-through if no key configured
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(12 + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), 12);
  return "enc:" + Buffer.from(combined).toString("base64");
}

export async function decrypt(value: string): Promise<string> {
  if (!value.startsWith("enc:")) return value; // not encrypted, return as-is
  if (!env.ENCRYPTION_KEY) return value;
  const key = await getKey();
  const combined = Buffer.from(value.slice(4), "base64");
  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export function isEncrypted(value: string | null): boolean {
  return typeof value === "string" && value.startsWith("enc:");
}

export async function safeDecrypt(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (!isEncrypted(value)) return value; // legacy unencrypted value
  return decrypt(value);
}
