import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sameHash(token: string | null | undefined, hash: string | null | undefined): boolean {
  if (!token || !hash) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans O/0/I/1

export function newRoomCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function normalizeCode(code: string): string {
  return (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
