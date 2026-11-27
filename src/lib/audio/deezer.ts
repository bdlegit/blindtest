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
  rank?: number;
  artist: { name: string };
  album: { title: string; cover_xl?: string; cover_big?: string; cover_medium?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Appel à l'API Deezer, avec nouvel essai si le quota (50 requêtes / 5 s) est dépassé. */
async function call<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const json = await res.json();
    if (json?.error?.code === 4 && attempt < 3) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    if (json?.error) throw new Error(`Deezer: ${json.error.message ?? "erreur"}`);
    return json as T;
  }
}

export type PlaylistTrack = {
  ref: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  rank: number;
};

const playlistCache = new Map<number, { at: number; tracks: PlaylistTrack[] }>();
const PLAYLIST_TTL = 12 * 60 * 60 * 1000;

/** Morceaux jouables d'une playlist Deezer (mis en cache quelques heures). */
export async function playlistTracks(id: number): Promise<PlaylistTrack[]> {
  const cached = playlistCache.get(id);
  if (cached && Date.now() - cached.at < PLAYLIST_TTL) return cached.tracks;
  const data = await call<{ data: DeezerTrack[] }>(`/playlist/${id}/tracks?limit=200`);
  const tracks = (data.data ?? [])
    .filter((t) => t.readable && t.preview)
    .map((t) => ({
      ref: String(t.id),
      title: t.title_short || t.title,
      artist: t.artist?.name ?? "",
      coverUrl: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || null,
      rank: t.rank ?? 0,
    }));
  playlistCache.set(id, { at: Date.now(), tracks });
  return tracks;
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
