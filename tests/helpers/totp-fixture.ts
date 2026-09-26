import { createHmac } from "node:crypto";

// Test-only interoperability fixture for the disposable local Supabase Auth service.
// Production MFA always delegates enrollment, challenge and verification to Supabase.
function decodeBase32(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("Invalid local TOTP fixture secret.");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}

export function localTotpCode(secret: string, timestampMs = Date.now()) {
  const counter = BigInt(Math.floor(timestampMs / 30_000));
  const moving = Buffer.alloc(8);
  moving.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(moving).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}
