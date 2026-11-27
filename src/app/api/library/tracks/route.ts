import { admin, HttpError, must } from "@/lib/server/supabase";
import { body, handle, json } from "@/lib/server/http";
import { cleanList, requireLibraryAccess } from "@/lib/server/library";
import { LIBRARY_BUCKET } from "@/lib/audio/upload";

type NewTrack = {
  playlistId?: string;
  provider?: "deezer" | "upload";
  ref?: string;
  title?: string;
  artist?: string;
  titleAliases?: string[] | string;
  artistAliases?: string[] | string;
  category?: string;
  coverUrl?: string | null;
  startAt?: number;
  duration?: number;
};

export const POST = handle(async (req: Request) => {
  requireLibraryAccess(req);
  const b = await body<NewTrack>(req);
  const provider = b.provider === "upload" ? "upload" : b.provider === "deezer" ? "deezer" : null;
  if (!provider || !b.ref || !b.playlistId) throw new HttpError(400, "Morceau incomplet");
  const title = (b.title ?? "").trim().slice(0, 120);
  const artist = (b.artist ?? "").trim().slice(0, 120);
  if (!title || !artist) throw new HttpError(400, "Le titre et l'artiste sont obligatoires");
  if (provider === "upload" && !b.ref.startsWith("tracks/")) throw new HttpError(400, "Fichier invalide");
  const row = must(
    await admin()
      .from("library_tracks")
      .insert({
        playlist_id: b.playlistId,
        provider,
        provider_ref: b.ref,
        title,
        artist,
        title_aliases: cleanList(b.titleAliases),
        artist_aliases: cleanList(b.artistAliases),
        category: (b.category ?? "").trim().slice(0, 40) || null,
        cover_url: b.coverUrl && /^https:\/\//.test(b.coverUrl) ? b.coverUrl : null,
        start_at: Math.max(0, Number(b.startAt) || 0),
        duration: Math.min(30, Math.max(5, Number(b.duration) || 20)),
      })
      .select("*")
      .single(),
    "ajout du morceau",
  );
  return json({ track: row }, { status: 201 });
});

export const PATCH = handle(async (req: Request) => {
  requireLibraryAccess(req);
  const b = await body<NewTrack & { id?: string }>(req);
  if (!b.id) throw new HttpError(400, "Morceau manquant");
  const patch: Record<string, unknown> = {};
  if (b.title !== undefined) patch.title = String(b.title).trim().slice(0, 120);
  if (b.artist !== undefined) patch.artist = String(b.artist).trim().slice(0, 120);
  if (b.titleAliases !== undefined) patch.title_aliases = cleanList(b.titleAliases);
  if (b.artistAliases !== undefined) patch.artist_aliases = cleanList(b.artistAliases);
  if (b.category !== undefined) patch.category = String(b.category).trim().slice(0, 40) || null;
  if (b.startAt !== undefined) patch.start_at = Math.max(0, Number(b.startAt) || 0);
  if (b.duration !== undefined) patch.duration = Math.min(30, Math.max(5, Number(b.duration) || 20));
  const row = must(await admin().from("library_tracks").update(patch).eq("id", b.id).select("*").single(), "modification");
  return json({ track: row });
});

export const DELETE = handle(async (req: Request) => {
  requireLibraryAccess(req);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "Morceau manquant");
  const row = must(await admin().from("library_tracks").select("provider,provider_ref").eq("id", id).maybeSingle(), "lecture") as
    | { provider: string; provider_ref: string }
    | null;
  if (row?.provider === "upload") await admin().storage.from(LIBRARY_BUCKET).remove([row.provider_ref]);
  must(await admin().from("library_tracks").delete().eq("id", id), "suppression");
  return json({ ok: true });
});
