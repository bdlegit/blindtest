import { admin, HttpError, must } from "@/lib/server/supabase";
import { handle, json } from "@/lib/server/http";
import { requireLibraryAccess } from "@/lib/server/library";
import { LIBRARY_BUCKET } from "@/lib/audio/upload";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  requireLibraryAccess(req);
  const { id } = await params;
  const playlist = must(await admin().from("playlists").select("*").eq("id", id).maybeSingle(), "playlist");
  if (!playlist) throw new HttpError(404, "Playlist introuvable");
  const tracks = must(
    await admin().from("library_tracks").select("*").eq("playlist_id", id).order("created_at"),
    "morceaux",
  );
  return json({ playlist, tracks });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  requireLibraryAccess(req);
  const { id } = await params;
  const files = must(
    await admin().from("library_tracks").select("provider_ref").eq("playlist_id", id).eq("provider", "upload"),
    "morceaux",
  ) as { provider_ref: string }[];
  if (files.length) await admin().storage.from(LIBRARY_BUCKET).remove(files.map((f) => f.provider_ref));
  must(await admin().from("playlists").delete().eq("id", id), "suppression");
  return json({ ok: true });
});
