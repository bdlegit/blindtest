import { admin, HttpError, must } from "@/lib/server/supabase";
import { body, handle, json } from "@/lib/server/http";
import { requireLibraryAccess } from "@/lib/server/library";

export const GET = handle(async (req: Request) => {
  requireLibraryAccess(req);
  const rows = must(
    await admin().from("playlists").select("id,name,created_at,library_tracks(count)").order("created_at", { ascending: false }),
    "playlists",
  ) as Array<{ id: string; name: string; created_at: string; library_tracks: { count: number }[] }>;
  return json({
    playlists: rows.map((p) => ({ id: p.id, name: p.name, created_at: p.created_at, count: p.library_tracks?.[0]?.count ?? 0 })),
  });
});

export const POST = handle(async (req: Request) => {
  requireLibraryAccess(req);
  const { name } = await body<{ name?: string }>(req);
  const clean = (name ?? "").trim().slice(0, 60);
  if (!clean) throw new HttpError(400, "Donne un nom à ta playlist");
  const row = must(await admin().from("playlists").insert({ name: clean }).select("*").single(), "création playlist");
  return json({ playlist: row }, { status: 201 });
});
