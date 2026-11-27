import { randomUUID } from "node:crypto";
import { admin, HttpError, must } from "@/lib/server/supabase";
import { body, handle, json } from "@/lib/server/http";
import { requireLibraryAccess } from "@/lib/server/library";
import { LIBRARY_BUCKET } from "@/lib/audio/upload";

/**
 * Le fichier audio est envoyé DIRECTEMENT du navigateur vers Supabase Storage via une URL
 * signée (évite la limite de taille des fonctions Vercel).
 */
export const POST = handle(async (req: Request) => {
  requireLibraryAccess(req);
  const { filename } = await body<{ filename?: string }>(req);
  const ext = ((filename ?? "").split(".").pop() ?? "mp3").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp3";
  if (!["mp3", "m4a", "aac", "ogg", "wav", "webm", "flac", "mp4"].includes(ext)) throw new HttpError(400, "Format audio non supporté");
  const path = `tracks/${randomUUID()}.${ext}`;
  const data = must(await admin().storage.from(LIBRARY_BUCKET).createSignedUploadUrl(path), "préparation de l'envoi") as {
    signedUrl: string;
    token: string;
    path: string;
  };
  return json({ path, token: data.token, signedUrl: data.signedUrl });
});

export const GET = handle(async (req: Request) => {
  requireLibraryAccess(req);
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path.startsWith("tracks/")) throw new HttpError(400, "Fichier invalide");
  const data = must(await admin().storage.from(LIBRARY_BUCKET).createSignedUrl(path, 3600), "lecture") as { signedUrl: string };
  return json({ url: data.signedUrl });
});
