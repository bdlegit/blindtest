import type { HostAction } from "../server/engine";
import type { GameSettings, MyAnswer, Player, RoomState } from "../game";
import { libraryKey, load } from "./storage";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`);
  return data as T;
}

const lib = (): Record<string, string> => {
  const pw = load(libraryKey);
  return pw ? { "x-library-password": pw } : {};
};

export const api = {
  state: (code: string, playerToken?: string | null) =>
    request<RoomState>(`/api/rooms/${code}`, { headers: playerToken ? { "x-player-token": playerToken } : {} }),
  create: (name: string, settings: GameSettings) =>
    request<{ code: string; hostToken: string; rounds: number }>("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name, settings }),
    }),
  join: (code: string, p: { nickname: string; avatar: string; color: string }) =>
    request<{ player: Player; token: string }>(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify(p) }),
  answer: (code: string, token: string, a: { guess?: string; choice?: string }) =>
    request<{ answer: MyAnswer; result: { title: boolean; artist: boolean; correct?: boolean } | null }>(
      `/api/rooms/${code}/answer`,
      { method: "POST", body: JSON.stringify(a), headers: { "x-player-token": token } },
    ),
  host: (code: string, token: string, action: HostAction) =>
    request<RoomState>(`/api/rooms/${code}/host`, {
      method: "POST",
      body: JSON.stringify(action),
      headers: { "x-host-token": token },
    }),
  track: (code: string, token: string, round: number) =>
    request<{ round: number; url: string; startAt: number; duration: number }>(
      `/api/rooms/${code}/host/track?round=${round}`,
      { headers: { "x-host-token": token } },
    ),
  recent: () =>
    request<{
      games: { id: string; room_name: string; player_count: number; rounds: number; finished_at: string; podium: { nickname: string; avatar: string; color: string; score: number }[] }[];
    }>("/api/rooms/recent"),
  categories: () =>
    request<{ categories: { id: string; label: string; emoji: string; gradient: [string, string]; count: number }[] }>(
      "/api/categories",
    ),
  // ── bibliothèque
  playlists: () => request<{ playlists: { id: string; name: string; count: number }[] }>("/api/library/playlists", { headers: lib() }),
  createPlaylist: (name: string) =>
    request<{ playlist: { id: string; name: string } }>("/api/library/playlists", { method: "POST", body: JSON.stringify({ name }), headers: lib() }),
  playlist: (id: string) => request<{ playlist: { id: string; name: string }; tracks: LibraryTrack[] }>(`/api/library/playlists/${id}`, { headers: lib() }),
  deletePlaylist: (id: string) => request(`/api/library/playlists/${id}`, { method: "DELETE", headers: lib() }),
  searchDeezer: (q: string) =>
    request<{ results: { provider: "deezer"; ref: string; title: string; artist: string; album?: string; coverUrl?: string | null }[] }>(
      `/api/deezer/search?q=${encodeURIComponent(q)}`,
      { headers: lib() },
    ),
  addTrack: (t: Record<string, unknown>) =>
    request<{ track: LibraryTrack }>("/api/library/tracks", { method: "POST", body: JSON.stringify(t), headers: lib() }),
  updateTrack: (t: Record<string, unknown>) =>
    request<{ track: LibraryTrack }>("/api/library/tracks", { method: "PATCH", body: JSON.stringify(t), headers: lib() }),
  deleteTrack: (id: string) => request(`/api/library/tracks?id=${id}`, { method: "DELETE", headers: lib() }),
  uploadUrl: (filename: string) =>
    request<{ path: string; token: string; signedUrl: string }>("/api/library/upload-url", {
      method: "POST",
      body: JSON.stringify({ filename }),
      headers: lib(),
    }),
  fileUrl: (path: string) => request<{ url: string }>(`/api/library/upload-url?path=${encodeURIComponent(path)}`, { headers: lib() }),
};

export type LibraryTrack = {
  id: string;
  playlist_id: string;
  provider: "deezer" | "upload";
  provider_ref: string;
  title: string;
  artist: string;
  title_aliases: string[];
  artist_aliases: string[];
  category: string | null;
  cover_url: string | null;
  start_at: number;
  duration: number;
};
