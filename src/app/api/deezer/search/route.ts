import { deezer } from "@/lib/audio/deezer";
import { handle, json } from "@/lib/server/http";
import { requireLibraryAccess } from "@/lib/server/library";

export const GET = handle(async (req: Request) => {
  requireLibraryAccess(req);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return json({ results: [] });
  return json({ results: await deezer.search!(q, 15) });
});
