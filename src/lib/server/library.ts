import "server-only";
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./supabase";

/** Protection simple de la bibliothèque : mot de passe optionnel (variable LIBRARY_PASSWORD). */
export function requireLibraryAccess(req: Request) {
  const expected = process.env.LIBRARY_PASSWORD;
  if (!expected) return;
  const given = req.headers.get("x-library-password") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Mot de passe de la bibliothèque requis");
}

export function cleanList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
  if (typeof v === "string") return v.split(/[,;|]/).map((x) => x.trim()).filter(Boolean).slice(0, 10);
  return [];
}
