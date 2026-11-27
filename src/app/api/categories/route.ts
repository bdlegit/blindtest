import { CATEGORIES } from "@/lib/catalog";
import { json } from "@/lib/server/http";

export function GET() {
  return json({
    categories: CATEGORIES.map(({ id, label, emoji, gradient, tracks, playlistTracks }) => ({
      id,
      label,
      emoji,
      gradient,
      // titres choisis à la main + titres populaires des playlists Deezer (arrondi à la dizaine)
      count: playlistTracks ? Math.floor((tracks.length + playlistTracks) / 10) * 10 : tracks.length,
      approx: !!playlistTracks,
    })),
  });
}
