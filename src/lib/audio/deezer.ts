import "server-only";
import type { AudioProvider, TrackCandidate } from "./types";

/**
 * Deezer : l'API publique (sans clé) renvoie des extraits officiels de 30 s et les pochettes.
 * Elle n'autorise pas les appels depuis le navigateur (CORS), d'où l'usage côté serveur.
 * Les URLs d'extraits sont signées et expirent : on les redemande juste avant de jouer.
 */
const API = "https://api.deezer.com";
const PREVIEW_SECONDS = 30;

type DeezerTrack = {
  id: number;
  title: string;
  title_short?: string;
  readable: boolean;
  preview: string;
  artist: { name: string };
  album: { title: string; cover_xl?: string; cover_big?: string; cover_medium?: string };
};

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Deezer ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(`Deezer: ${json.error.message ?? "erreur"}`);
  return json as T;
}

function toCandidate(t: DeezerTrack): TrackCandidate {
  return {
    provider: "deezer",
    ref: String(t.id),
    title: t.title_short || t.title,
    artist: t.artist?.name ?? "",
    album: t.album?.title,
    coverUrl: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || null,
    previewLength: PREVIEW_SECONDS,
  };
}

export const deezer: AudioProvider = {
  id: "deezer",
  label: "Deezer (extraits 30 s)",
  async search(query, limit = 10) {
    const data = await call<{ data: DeezerTrack[] }>(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return (data.data ?? []).filter((t) => t.readable && t.preview).map(toCandidate);
  },
  async resolvePlayable(ref, startAt) {
    const t = await call<DeezerTrack>(`/track/${encodeURIComponent(ref)}`);
    if (!t.preview) return null;
    const start = Math.min(Math.max(0, startAt), PREVIEW_SECONDS - 5);
    return { url: t.preview, startAt: start, maxDuration: PREVIEW_SECONDS - start };
  },
};
