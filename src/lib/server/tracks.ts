import "server-only";
import { randomUUID } from "node:crypto";
import { CATEGORIES, CATEGORY_BY_ID, type SeedTrack } from "../catalog";
import { deezer } from "../audio/deezer";
import type { TrackCandidate } from "../audio/types";
import { isMatch, normalize } from "../match";
import type { Choice, GameSettings } from "../game";
import { admin, HttpError, must } from "./supabase";

export type GameTrack = {
  provider: string;
  provider_ref: string;
  title: string;
  artist: string;
  title_aliases: string[];
  artist_aliases: string[];
  category: string | null;
  cover_url: string | null;
  start_at: number;
  duration: number;
  choices: Choice[] | null;
  correct_choice: string | null;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const key = (artist: string, title: string) => `${normalize(artist)}|${normalize(title)}`;

const BAD_VERSION = /\b(remix|lofi|lo fi|trap|cover|karaoke|instrumental version|8 bit|8bit|piano version|acoustic|slowed|sped up|nightcore|tribute|made famous|in the style|note blocks?|piano solo|originally performed|lofi edit|medley)\b/;

function haystack(r: TrackCandidate) {
  return normalize(`${r.title} ${r.album ?? ""} ${r.artist}`, { decorations: false });
}

/** Cherche l'extrait Deezer correspondant à un morceau du catalogue. */
export async function resolveSeed(seed: SeedTrack, workTitle: boolean): Promise<TrackCandidate | null> {
  const queries = seed.q
    ? [seed.q, `${seed.artist} ${seed.title}`]
    : [`artist:"${seed.artist}" track:"${seed.title}"`, `${seed.artist} ${seed.title}`];
  // mots-clés qui doivent apparaître (titre, album ou artiste) pour une œuvre
  const keywords = (seed.m ?? [seed.title, ...(seed.ta ?? [])]).map((k) => normalize(k, { decorations: false })).filter(Boolean);
  for (const q of queries) {
    let results: TrackCandidate[] = [];
    try {
      results = await deezer.search!(q, 10);
    } catch (e) {
      console.warn("[deezer] recherche échouée", q, (e as Error).message);
      continue;
    }
    // les versions originales d'abord (pas de remix, reprise, karaoké…)
    results = [...results.filter((r) => !BAD_VERSION.test(haystack(r))), ...results.filter((r) => BAD_VERSION.test(haystack(r)))];
    if (!results.length) continue;
    if (workTitle) {
      const hit = results.find((r) => !BAD_VERSION.test(haystack(r)) && keywords.some((k) => haystack(r).includes(k)));
      if (hit) return hit;
      continue;
    }
    if (seed.q) return results[0];
    const good = results.find(
      (r) => isMatch(r.artist, seed.artist, seed.aa) && isMatch(r.title, seed.title, seed.ta),
    );
    if (good) return good;
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

type Pending = Omit<GameTrack, "choices" | "correct_choice">;

async function fromThemes(categories: string[], wanted: number, duration: number): Promise<Pending[]> {
  const cats = categories.map((c) => CATEGORY_BY_ID[c]).filter(Boolean);
  if (!cats.length) throw new HttpError(400, "Choisis au moins une catégorie");
  // tirage équilibré entre catégories, sans doublon
  const queues = cats.map((c) => shuffle(c.tracks).map((s) => ({ seed: s, cat: c })));
  const pool: { seed: SeedTrack; cat: (typeof cats)[number] }[] = [];
  const seen = new Set<string>();
  while (queues.some((q) => q.length)) {
    for (const q of shuffle(queues)) {
      const next = q.shift();
      if (!next) continue;
      const k = key(next.seed.artist, next.seed.title);
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(next);
    }
  }
  const result: Pending[] = [];
  // on résout par lots jusqu'à en avoir assez (quelques morceaux peuvent être indisponibles)
  for (let start = 0; start < pool.length && result.length < wanted; ) {
    const batch = pool.slice(start, start + Math.max(4, wanted - result.length + 2));
    start += batch.length;
    const resolved = await mapLimit(batch, 6, (p) => resolveSeed(p.seed, !!p.cat.workTitle));
    resolved.forEach((r, i) => {
      if (!r || result.length >= wanted) return;
      const { seed, cat } = batch[i];
      result.push({
        provider: "deezer",
        provider_ref: r.ref,
        title: seed.title,
        artist: seed.artist,
        title_aliases: seed.ta ?? [],
        artist_aliases: seed.aa ?? [],
        category: cat.id,
        cover_url: r.coverUrl ?? null,
        start_at: 0,
        duration,
      });
    });
  }
  return result;
}

async function fromPlaylist(playlistId: string, wanted: number, defaultDuration: number): Promise<Pending[]> {
  const rows = must(
    await admin().from("library_tracks").select("*").eq("playlist_id", playlistId),
    "lecture de la playlist",
  ) as Array<Record<string, unknown>>;
  if (!rows.length) throw new HttpError(400, "Cette playlist est vide");
  return shuffle(rows)
    .slice(0, wanted)
    .map((r) => ({
      provider: String(r.provider),
      provider_ref: String(r.provider_ref),
      title: String(r.title),
      artist: String(r.artist),
      title_aliases: (r.title_aliases as string[]) ?? [],
      artist_aliases: (r.artist_aliases as string[]) ?? [],
      category: (r.category as string) ?? null,
      cover_url: (r.cover_url as string) ?? null,
      start_at: Number(r.start_at ?? 0),
      duration: Math.min(Number(r.duration ?? defaultDuration) || defaultDuration, defaultDuration),
    }));
}

/** Propositions du mode QCM : la bonne réponse + 3 leurres plausibles. */
function addChoices(tracks: Pending[], categories: string[]): GameTrack[] {
  const decoys: { title: string; artist: string; category: string | null }[] = [
    ...tracks.map((t) => ({ title: t.title, artist: t.artist, category: t.category })),
    ...CATEGORIES.filter((c) => categories.includes(c.id) || !categories.length).flatMap((c) =>
      c.tracks.map((s) => ({ title: s.title, artist: s.artist, category: c.id })),
    ),
  ];
  return tracks.map((t) => {
    const workTitle = !!(t.category && CATEGORY_BY_ID[t.category]?.workTitle);
    const label = (x: { title: string; artist: string }) => (workTitle ? x.title : `${x.title} — ${x.artist}`);
    const mine = label(t);
    const sameCat = shuffle(decoys.filter((d) => d.category === t.category));
    const others = shuffle(decoys.filter((d) => d.category !== t.category));
    const picked: string[] = [];
    for (const d of [...sameCat, ...others]) {
      const l = label(d);
      if (picked.length >= 3) break;
      if (normalize(l) === normalize(mine) || picked.some((p) => normalize(p) === normalize(l))) continue;
      if (!workTitle && normalize(d.title) === normalize(t.title)) continue;
      picked.push(l);
    }
    const correctId = randomUUID().slice(0, 8);
    const choices = shuffle([
      { id: correctId, label: mine },
      ...picked.map((l) => ({ id: randomUUID().slice(0, 8), label: l })),
    ]);
    return { ...t, choices, correct_choice: correctId };
  });
}

export async function buildGameTracks(settings: GameSettings): Promise<GameTrack[]> {
  const wanted = settings.rounds;
  const pending =
    settings.source.type === "themes"
      ? await fromThemes(settings.source.categories, wanted, settings.roundDuration)
      : await fromPlaylist(settings.source.playlistId, wanted, settings.roundDuration);
  if (!pending.length) throw new HttpError(502, "Impossible de récupérer des extraits musicaux. Réessaie dans un instant.");
  const cats = settings.source.type === "themes" ? settings.source.categories : [];
  return addChoices(pending, cats);
}
