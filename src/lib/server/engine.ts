import "server-only";
import { CATEGORY_BY_ID } from "../catalog";
import { checkGuess } from "../match";
import {
  AVATARS,
  COLORS,
  HINT_OPENED,
  hintPoints,
  LIMITS,
  PHASE_MS,
  pointsFor,
  rankPlayers,
  type Choice,
  type FinalStats,
  type GameSettings,
  type MyAnswer,
  type Phase,
  type Player,
  type PublicRound,
  type RevealResult,
  type Room,
  type RoomState,
} from "../game";
import { hashToken, newRoomCode, newToken, normalizeCode, sameHash } from "./auth";
import { admin, HttpError, must } from "./supabase";
import { buildGameTracks, type GameTrack } from "./tracks";

type AnswerRow = {
  id: string;
  room_id: string;
  round_index: number;
  player_id: string;
  attempts: number;
  found_title: boolean;
  found_artist: boolean;
  title_ms: number | null;
  artist_ms: number | null;
  points: number;
  guesses: string[];
  choice: string | null;
  done: boolean;
};

type TrackRow = GameTrack & { id: string; room_id: string; position: number };

const db = () => admin();
const nowIso = () => new Date().toISOString();
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

// ─────────────────────────────────────────────────────────── validation

function clampInt(v: unknown, [min, max]: readonly [number, number], fallback: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeSettings(input: Partial<GameSettings> | undefined): GameSettings {
  const s = input ?? {};
  const src = s.source;
  let source: GameSettings["source"];
  if (src?.type === "playlist" && typeof src.playlistId === "string" && src.playlistId) {
    source = { type: "playlist", playlistId: src.playlistId };
  } else {
    const cats = Array.isArray((src as { categories?: unknown })?.categories)
      ? ((src as { categories: unknown[] }).categories.filter((c) => typeof c === "string" && CATEGORY_BY_ID[c]) as string[])
      : [];
    if (!cats.length) throw new HttpError(400, "Choisis au moins une catégorie musicale");
    source = { type: "themes", categories: [...new Set(cats)] };
  }
  return {
    mode: "classic",
    rounds: clampInt(s.rounds, LIMITS.rounds, 10),
    pointsTitle: clampInt(s.pointsTitle, LIMITS.points, 100),
    pointsArtist: clampInt(s.pointsArtist, LIMITS.points, 100),
    speedBonus: s.speedBonus !== false,
    answerMode: s.answerMode === "choices" ? "choices" : "text",
    roundDuration: clampInt(s.roundDuration, LIMITS.roundDuration, 25),
    maxAttempts: clampInt(s.maxAttempts, LIMITS.maxAttempts, 5),
    hints: s.hints !== false,
    source,
  };
}

// ─────────────────────────────────────────────────────────── lecture

export async function loadRoom(code: string): Promise<Room> {
  const c = normalizeCode(code);
  if (c.length !== 6) throw new HttpError(404, "Code de salle invalide");
  const room = must(await db().from("rooms").select("*").eq("code", c).maybeSingle(), "lecture de la salle");
  if (!room) throw new HttpError(404, "Aucune partie avec ce code");
  return room as Room;
}

async function loadPlayers(roomId: string): Promise<Player[]> {
  return must(
    await db().from("players").select("*").eq("room_id", roomId).order("created_at"),
    "lecture des joueurs",
  ) as Player[];
}

async function loadTrack(roomId: string, position: number): Promise<TrackRow | null> {
  return must(
    await db().from("room_tracks").select("*").eq("room_id", roomId).eq("position", position).maybeSingle(),
    "lecture du morceau",
  ) as TrackRow | null;
}

export async function requireHost(room: Room, token: string | null) {
  const secret = must(
    await db().from("room_secrets").select("host_token_hash").eq("room_id", room.id).maybeSingle(),
    "vérification animateur",
  ) as { host_token_hash: string } | null;
  if (!sameHash(token, secret?.host_token_hash)) throw new HttpError(403, "Réservé à l'animateur");
}

export async function findPlayerByToken(room: Room, token: string | null): Promise<Player | null> {
  if (!token) return null;
  const secret = must(
    await db().from("player_secrets").select("player_id").eq("token_hash", hashToken(token)).maybeSingle(),
    "vérification joueur",
  ) as { player_id: string } | null;
  if (!secret) return null;
  const player = must(
    await db().from("players").select("*").eq("id", secret.player_id).eq("room_id", room.id).maybeSingle(),
    "lecture joueur",
  ) as Player | null;
  return player;
}

export async function requirePlayer(room: Room, token: string | null): Promise<Player> {
  const p = await findPlayerByToken(room, token);
  if (!p) throw new HttpError(401, "Session de joueur introuvable, rejoins la partie à nouveau");
  if (p.kicked) throw new HttpError(403, "Tu as été exclu de la partie");
  return p;
}

/** Le joueur a-t-il ouvert le joker en saisie libre ? */
const usedHint = (room: Room, a: Pick<AnswerRow, "choice"> | null | undefined) =>
  room.settings.answerMode === "text" && !!a?.choice;

function toMyAnswer(a: AnswerRow | null, hintChoices: Choice[] | null = null): MyAnswer | null {
  if (!a) return null;
  return {
    attempts: a.attempts,
    foundTitle: a.found_title,
    foundArtist: a.found_artist,
    points: a.points,
    choice: a.choice === HINT_OPENED ? null : a.choice,
    done: a.done,
    lastGuess: a.guesses.at(-1) ?? null,
    hintChoices,
  };
}

export async function getState(code: string, playerToken: string | null): Promise<RoomState> {
  const room = await loadRoom(code);
  const players = await loadPlayers(room.id);
  let me: RoomState["me"] = null;
  if (playerToken) {
    const player = await findPlayerByToken(room, playerToken);
    if (player) {
      const answer =
        room.round_index >= 0
          ? (must(
              await db()
                .from("answers")
                .select("*")
                .eq("room_id", room.id)
                .eq("round_index", room.round_index)
                .eq("player_id", player.id)
                .maybeSingle(),
              "lecture réponse",
            ) as AnswerRow | null)
          : null;
      let hintChoices: Choice[] | null = null;
      if (answer && usedHint(room, answer)) hintChoices = (await loadTrack(room.id, room.round_index))?.choices ?? null;
      me = { player, answer: toMyAnswer(answer, hintChoices) };
    }
  }
  return { room, players: players.filter((p) => !p.kicked), serverNow: Date.now(), me };
}

// ─────────────────────────────────────────────────────────── transitions

/** Mise à jour optimiste : n'aboutit que si personne n'a modifié la salle entre-temps. */
async function transition(room: Room, patch: Partial<Room>): Promise<Room | null> {
  const res = await db()
    .from("rooms")
    .update({ ...patch, version: room.version + 1, updated_at: nowIso() })
    .eq("id", room.id)
    .eq("version", room.version)
    .select("*")
    .maybeSingle();
  return must(res, "mise à jour de la salle") as Room | null;
}

function publicRoundFor(room: Room, track: TrackRow, index: number): PublicRound {
  const cat = track.category ? CATEGORY_BY_ID[track.category] : undefined;
  return {
    index,
    category: track.category,
    categoryLabel: cat ? `${cat.emoji} ${cat.label}` : null,
    workTitle: !!cat?.workTitle,
    choices: room.settings.answerMode === "choices" ? track.choices : null,
  };
}

async function startRound(room: Room, index: number): Promise<Room | null> {
  const track = await loadTrack(room.id, index);
  if (!track) return finish(room);
  const now = Date.now();
  return transition(room, {
    phase: "countdown",
    round_index: index,
    answered_count: 0,
    phase_started_at: new Date(now).toISOString(),
    phase_ends_at: new Date(now + PHASE_MS.countdown).toISOString(),
    paused_at: null,
    public_round: publicRoundFor(room, track, index),
  });
}

async function beginPlaying(room: Room): Promise<Room | null> {
  const track = await loadTrack(room.id, room.round_index);
  const duration = Math.min(room.settings.roundDuration, Number(track?.duration ?? room.settings.roundDuration));
  const now = Date.now();
  return transition(room, {
    phase: "playing",
    phase_started_at: new Date(now).toISOString(),
    phase_ends_at: new Date(now + duration * 1000).toISOString(),
    paused_at: null,
  });
}

async function reveal(room: Room): Promise<Room | null> {
  if (room.phase !== "playing") return null;
  const now = Date.now();
  // 1. on « verrouille » la manche : plus aucune réponse acceptée
  const claimed = await transition(room, {
    phase: "reveal",
    phase_started_at: new Date(now).toISOString(),
    phase_ends_at: new Date(now + PHASE_MS.reveal).toISOString(),
    paused_at: null,
  });
  if (!claimed) return null;
  // 2. on attribue les points
  must(await db().rpc("apply_round_scores", { p_room: room.id, p_round: room.round_index }), "attribution des points");
  // 3. on publie la révélation
  const [track, answers] = await Promise.all([
    loadTrack(room.id, room.round_index),
    db().from("answers").select("*").eq("room_id", room.id).eq("round_index", room.round_index),
  ]);
  const rows = must(answers, "lecture des réponses") as AnswerRow[];
  const players = await loadPlayers(room.id);
  const results: RevealResult[] = players
    .filter((p) => !p.kicked)
    .map((p) => {
      const a = rows.find((r) => r.player_id === p.id);
      const times = [a?.title_ms, a?.artist_ms].filter((x): x is number => typeof x === "number");
      return {
        playerId: p.id,
        foundTitle: !!a?.found_title,
        foundArtist: !!a?.found_artist,
        points: a?.points ?? 0,
        ms: times.length ? Math.min(...times) : null,
        guess: room.settings.answerMode === "choices"
          ? (track?.choices?.find((c) => c.id === a?.choice)?.label ?? null)
          : (a?.guesses.at(-1) ?? null),
        hint: usedHint(room, a),
      };
    });
  const public_round: PublicRound = {
    ...(claimed.public_round as PublicRound),
    reveal: {
      title: track?.title ?? "?",
      artist: track?.artist ?? "?",
      coverUrl: track?.cover_url ?? null,
      correctChoice: track?.correct_choice ?? null,
      results,
    },
  };
  return transition(claimed, { public_round });
}

async function computeFinalStats(room: Room, players: Player[]): Promise<FinalStats> {
  const answers = must(
    await db().from("answers").select("*").eq("room_id", room.id),
    "statistiques",
  ) as AnswerRow[];
  const tracks = must(
    await db().from("room_tracks").select("position,title,artist").eq("room_id", room.id),
    "statistiques",
  ) as Pick<TrackRow, "position" | "title" | "artist">[];
  const rounds = Math.max(0, Math.min(room.total_rounds, room.round_index + 1));
  const active = players.filter((p) => !p.kicked);
  const perPlayer: FinalStats["perPlayer"] = {};
  let fastest: FinalStats["fastest"] = null;
  let totalCorrect = 0;
  for (const p of active) {
    const mine = answers.filter((a) => a.player_id === p.id && (a.found_title || a.found_artist));
    const firsts = mine
      .map((a) => Math.min(a.title_ms ?? Infinity, a.artist_ms ?? Infinity))
      .filter((x) => Number.isFinite(x));
    const best = firsts.length ? Math.min(...firsts) : null;
    perPlayer[p.id] = {
      correct: mine.length,
      rate: rounds ? mine.length / rounds : 0,
      avgMs: firsts.length ? Math.round(firsts.reduce((s, x) => s + x, 0) / firsts.length) : null,
      best,
    };
    totalCorrect += mine.length;
    if (best !== null && (!fastest || best < fastest.ms)) fastest = { playerId: p.id, nickname: p.nickname, ms: best };
  }
  let hardest: FinalStats["hardest"] = null;
  let fewest = Infinity;
  for (const t of tracks.filter((t) => t.position < rounds)) {
    const n = answers.filter((a) => a.round_index === t.position && (a.found_title || a.found_artist)).length;
    if (n < fewest) {
      fewest = n;
      hardest = { title: t.title, artist: t.artist };
    }
  }
  return {
    rounds,
    totalCorrect,
    successRate: active.length && rounds ? totalCorrect / (active.length * rounds) : 0,
    fastest,
    perPlayer,
    hardest,
  };
}

async function finish(room: Room): Promise<Room | null> {
  const players = await loadPlayers(room.id);
  const stats = await computeFinalStats(room, players);
  const done = await transition(room, {
    phase: "finished",
    phase_started_at: nowIso(),
    phase_ends_at: null,
    paused_at: null,
    final_stats: stats,
    finished_at: nowIso(),
  });
  if (done) {
    const ranked = rankPlayers(players);
    if (ranked.length) {
      await db()
        .from("game_history")
        .insert({
          room_id: room.id,
          room_name: room.name,
          player_count: ranked.length,
          rounds: stats.rounds,
          podium: ranked.slice(0, 3).map((p) => ({ nickname: p.nickname, avatar: p.avatar, color: p.color, score: p.score })),
        });
    }
  }
  return done;
}

/** Fait avancer la partie d'une phase. `force` = l'animateur a cliqué sur « suivant ». */
export async function advance(room: Room, expected: { phase: Phase; round: number }, force: boolean): Promise<Room | null> {
  if (room.phase !== expected.phase || room.round_index !== expected.round) return null; // déjà fait
  if (room.paused_at && !force) return null;
  if (!force && room.phase_ends_at && ms(room.phase_ends_at) - Date.now() > 400) return null; // trop tôt
  switch (room.phase) {
    case "countdown":
      return beginPlaying(room);
    case "playing":
      return reveal(room);
    case "reveal":
      if (room.round_index + 1 >= room.total_rounds) return finish(room);
      return transition(room, {
        phase: "scores",
        phase_started_at: nowIso(),
        phase_ends_at: new Date(Date.now() + PHASE_MS.scores).toISOString(),
        paused_at: null,
      });
    case "scores":
      return startRound(room, room.round_index + 1);
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────── actions

export async function createRoom(nameInput: string, settingsInput: Partial<GameSettings>) {
  const name = (nameInput ?? "").toString().trim().slice(0, 40) || "Soirée Blind Test";
  const settings = sanitizeSettings(settingsInput);
  const tracks = await buildGameTracks(settings);
  const hostToken = newToken();
  let room: Room | null = null;
  for (let attempt = 0; attempt < 5 && !room; attempt++) {
    const res = await db()
      .from("rooms")
      .insert({ code: newRoomCode(), name, settings, total_rounds: tracks.length })
      .select("*")
      .single();
    if (res.error?.code === "23505") continue; // code déjà pris
    room = must(res, "création de la salle") as Room;
  }
  if (!room) throw new HttpError(500, "Impossible de générer un code de salle");
  must(await db().from("room_secrets").insert({ room_id: room.id, host_token_hash: hashToken(hostToken) }), "création");
  must(
    await db().from("room_tracks").insert(tracks.map((t, i) => ({ ...t, room_id: room!.id, position: i }))),
    "enregistrement des morceaux",
  );
  return { code: room.code, hostToken, rounds: tracks.length };
}

export async function joinRoom(code: string, input: { nickname?: string; avatar?: string; color?: string }) {
  const room = await loadRoom(code);
  if (room.phase === "finished") throw new HttpError(409, "Cette partie est terminée");
  const nickname = (input.nickname ?? "").toString().replace(/\s+/g, " ").trim().slice(0, LIMITS.nickname);
  if (nickname.length < 2) throw new HttpError(400, "Choisis un pseudo (2 caractères minimum)");
  const avatar = AVATARS.includes(input.avatar ?? "") ? input.avatar! : AVATARS[Math.floor(Math.random() * AVATARS.length)];
  const color = COLORS.includes(input.color ?? "") ? input.color! : COLORS[Math.floor(Math.random() * COLORS.length)];
  const players = (await loadPlayers(room.id)).filter((p) => !p.kicked);
  if (players.length >= LIMITS.players) throw new HttpError(409, "La salle est pleine");
  const res = await db().from("players").insert({ room_id: room.id, nickname, avatar, color }).select("*").single();
  if (res.error?.code === "23505") throw new HttpError(409, "Ce pseudo est déjà pris dans cette partie");
  const player = must(res, "inscription") as Player;
  const token = newToken();
  must(await db().from("player_secrets").insert({ player_id: player.id, token_hash: hashToken(token) }), "inscription");
  return { player, token };
}

async function checkAllDone(room: Room) {
  const [players, answers] = await Promise.all([
    loadPlayers(room.id),
    db().from("answers").select("player_id,done").eq("room_id", room.id).eq("round_index", room.round_index),
  ]);
  const active = players.filter((p) => !p.kicked);
  const doneIds = new Set((must(answers, "réponses") as { player_id: string; done: boolean }[]).filter((a) => a.done).map((a) => a.player_id));
  if (active.length && active.every((p) => doneIds.has(p.id))) {
    const fresh = await loadRoom(room.code);
    if (fresh.phase === "playing" && fresh.round_index === room.round_index && !fresh.paused_at) await reveal(fresh);
  }
}

export async function submitAnswer(room: Room, player: Player, input: { guess?: string; choice?: string; hint?: boolean }) {
  if (room.phase !== "playing") throw new HttpError(409, "Ce n'est pas le moment de répondre");
  if (room.paused_at) throw new HttpError(409, "La partie est en pause");
  const now = Date.now();
  const endsAt = ms(room.phase_ends_at);
  if (now > endsAt + 1200) throw new HttpError(409, "Trop tard !");
  const track = await loadTrack(room.id, room.round_index);
  if (!track) throw new HttpError(500, "Morceau introuvable");
  const durationMs = Math.max(1, endsAt - ms(room.phase_started_at));
  const elapsed = Math.min(durationMs, Math.max(0, durationMs - (endsAt - now)));
  const s = room.settings;

  // ligne de réponse (créée au premier essai)
  await db()
    .from("answers")
    .upsert(
      { room_id: room.id, round_index: room.round_index, player_id: player.id },
      { onConflict: "room_id,round_index,player_id", ignoreDuplicates: true },
    );

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = must(
      await db()
        .from("answers")
        .select("*")
        .eq("room_id", room.id)
        .eq("round_index", room.round_index)
        .eq("player_id", player.id)
        .single(),
      "lecture réponse",
    ) as AnswerRow;
    const hintChoicesOf = (a: AnswerRow) => (usedHint(room, a) ? (track.choices ?? null) : null);
    if (current.done) return { answer: toMyAnswer(current, hintChoicesOf(current))!, result: null };

    const patch: Partial<AnswerRow> & { updated_at: string } = { updated_at: nowIso(), attempts: current.attempts + 1 };
    let result: { title: boolean; artist: boolean; correct?: boolean } = { title: false, artist: false };

    if (s.answerMode === "choices") {
      const choice = (input.choice ?? "").toString();
      if (!track.choices?.some((c) => c.id === choice)) throw new HttpError(400, "Choix invalide");
      const correct = choice === track.correct_choice;
      patch.choice = choice;
      patch.done = true;
      patch.guesses = [...current.guesses, track.choices.find((c) => c.id === choice)!.label];
      if (correct) {
        patch.found_title = true;
        patch.found_artist = true;
        patch.title_ms = elapsed;
        patch.artist_ms = elapsed;
        patch.points = pointsFor(s.pointsTitle + s.pointsArtist, elapsed, durationMs, s.speedBonus);
      }
      result = { title: correct, artist: correct, correct };
    } else if (input.hint) {
      // joker : on dévoile les 4 propositions à ce joueur seulement
      if (s.hints === false) throw new HttpError(409, "Le joker n'est pas activé pour cette partie");
      if (!track.choices?.length) throw new HttpError(409, "Pas de propositions pour ce morceau");
      if (current.choice) return { answer: toMyAnswer(current, hintChoicesOf(current))!, result: null };
      patch.attempts = current.attempts; // ouvrir le joker ne consomme pas d'essai
      patch.choice = HINT_OPENED;
    } else if (input.choice !== undefined) {
      // réponse via le joker : un seul essai, points divisés par deux
      if (current.choice !== HINT_OPENED) throw new HttpError(409, "Ouvre d'abord le joker");
      const choice = (input.choice ?? "").toString();
      const picked = track.choices?.find((c) => c.id === choice);
      if (!picked) throw new HttpError(400, "Choix invalide");
      const correct = choice === track.correct_choice;
      patch.choice = choice;
      patch.done = true;
      patch.guesses = [...current.guesses, picked.label].slice(-LIMITS.maxAttempts[1]);
      if (correct) {
        let gained = 0;
        if (!current.found_title) {
          patch.found_title = true;
          patch.title_ms = elapsed;
          gained += pointsFor(s.pointsTitle, elapsed, durationMs, s.speedBonus);
        }
        if (!current.found_artist) {
          patch.found_artist = true;
          patch.artist_ms = elapsed;
          gained += pointsFor(s.pointsArtist, elapsed, durationMs, s.speedBonus);
        }
        patch.points = current.points + hintPoints(gained);
      }
      result = { title: correct && !current.found_title, artist: correct && !current.found_artist, correct };
    } else {
      if (current.choice === HINT_OPENED) throw new HttpError(409, "Tu as pris le joker : choisis une proposition");
      const guess = (input.guess ?? "").toString().trim().slice(0, LIMITS.guess);
      if (!guess) throw new HttpError(400, "Réponse vide");
      const check = checkGuess(guess, {
        title: track.title,
        artist: track.artist,
        titleAliases: track.title_aliases,
        artistAliases: track.artist_aliases,
      });
      let points = current.points;
      const newTitle = check.title && !current.found_title;
      const newArtist = check.artist && !current.found_artist;
      if (newTitle) {
        patch.found_title = true;
        patch.title_ms = elapsed;
        points += pointsFor(s.pointsTitle, elapsed, durationMs, s.speedBonus);
      }
      if (newArtist) {
        patch.found_artist = true;
        patch.artist_ms = elapsed;
        points += pointsFor(s.pointsArtist, elapsed, durationMs, s.speedBonus);
      }
      patch.points = points;
      patch.guesses = [...current.guesses, guess].slice(-LIMITS.maxAttempts[1]);
      const foundTitle = current.found_title || newTitle;
      const foundArtist = current.found_artist || newArtist;
      patch.done = (foundTitle && foundArtist) || current.attempts + 1 >= s.maxAttempts;
      result = { title: newTitle, artist: newArtist };
    }

    // écriture conditionnelle : protège contre les doubles envois simultanés
    const updated = must(
      await db().from("answers").update(patch).eq("id", current.id).eq("attempts", current.attempts).select("*").maybeSingle(),
      "enregistrement réponse",
    ) as AnswerRow | null;
    if (!updated) continue;

    await db().rpc("refresh_answered_count", { p_room: room.id, p_round: room.round_index });
    if (updated.done) await checkAllDone(room);
    return { answer: toMyAnswer(updated, hintChoicesOf(updated))!, result };
  }
  throw new HttpError(429, "Doucement ! Réessaie");
}

export type HostAction =
  | { action: "start" }
  | { action: "advance"; phase: Phase; round: number; force?: boolean }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "kick"; playerId: string }
  | { action: "award"; playerId: string; round: number }
  | { action: "end" }
  | { action: "replay" };

export async function hostAction(room: Room, a: HostAction): Promise<void> {
  switch (a.action) {
    case "start": {
      if (room.phase !== "lobby") return;
      const players = (await loadPlayers(room.id)).filter((p) => !p.kicked);
      if (!players.length) throw new HttpError(409, "Attends qu'au moins un joueur rejoigne la partie");
      await startRound(room, 0);
      return;
    }
    case "advance":
      await advance(room, { phase: a.phase, round: a.round }, !!a.force);
      return;
    case "pause":
      if (room.paused_at || room.phase === "lobby" || room.phase === "finished") return;
      await transition(room, { paused_at: nowIso() });
      return;
    case "resume": {
      if (!room.paused_at) return;
      const pausedFor = Date.now() - ms(room.paused_at);
      await transition(room, {
        paused_at: null,
        phase_ends_at: room.phase_ends_at ? new Date(ms(room.phase_ends_at) + pausedFor).toISOString() : null,
        phase_started_at: room.phase_started_at ? new Date(ms(room.phase_started_at) + pausedFor).toISOString() : null,
      });
      return;
    }
    case "kick": {
      must(await db().from("players").update({ kicked: true }).eq("id", a.playerId).eq("room_id", room.id), "exclusion");
      if (room.round_index >= 0) await db().rpc("refresh_answered_count", { p_room: room.id, p_round: room.round_index });
      if (room.phase === "playing") await checkAllDone(room);
      return;
    }
    case "award":
      await award(room, a.playerId, a.round);
      return;
    case "end":
      if (room.phase === "finished" || room.phase === "lobby") return;
      await finish(room);
      return;
    case "replay": {
      if (room.phase !== "finished") return;
      const tracks = await buildGameTracks(room.settings);
      must(await db().from("answers").delete().eq("room_id", room.id), "réinitialisation");
      must(await db().from("room_tracks").delete().eq("room_id", room.id), "réinitialisation");
      must(
        await db().from("room_tracks").insert(tracks.map((t, i) => ({ ...t, room_id: room.id, position: i }))),
        "réinitialisation",
      );
      must(
        await db().from("players").update({ score: 0, last_round_points: 0, correct_count: 0 }).eq("room_id", room.id),
        "réinitialisation",
      );
      await transition(room, {
        phase: "lobby",
        round_index: -1,
        total_rounds: tracks.length,
        answered_count: 0,
        phase_started_at: null,
        phase_ends_at: null,
        paused_at: null,
        public_round: null,
        final_stats: null,
        finished_at: null,
      });
      return;
    }
  }
}

/**
 * L'animateur accorde une réponse refusée par la reconnaissance automatique : le joueur
 * gagne les points de ce qu'il lui manquait (titre et/ou artiste), sans bonus de rapidité,
 * divisés par deux s'il avait pris le joker. Possible pendant la révélation et le classement.
 */
async function award(room: Room, playerId: string, round: number) {
  if (round !== room.round_index || !["reveal", "scores"].includes(room.phase)) {
    throw new HttpError(409, "On ne peut plus modifier cette manche");
  }
  const rv = room.public_round?.reveal;
  const entry = rv?.results.find((r) => r.playerId === playerId);
  if (!rv || !entry) throw new HttpError(404, "Joueur introuvable pour cette manche");
  if (entry.foundTitle && entry.foundArtist) return;
  const s = room.settings;
  let gained = (entry.foundTitle ? 0 : s.pointsTitle) + (entry.foundArtist ? 0 : s.pointsArtist);
  if (entry.hint) gained = hintPoints(gained);
  const wasZero = !entry.foundTitle && !entry.foundArtist;

  // 1. on réserve la modification de la salle (évite un double clic qui compterait deux fois)
  const public_round: PublicRound = {
    ...room.public_round!,
    reveal: {
      ...rv,
      results: rv.results.map((r) =>
        r.playerId === playerId
          ? { ...r, foundTitle: true, foundArtist: true, points: r.points + gained, awarded: (r.awarded ?? 0) + gained }
          : r,
      ),
    },
  };
  const claimed = await transition(room, { public_round });
  if (!claimed) throw new HttpError(409, "La manche vient de changer, réessaie");

  // 2. réponse du joueur et score
  await db()
    .from("answers")
    .upsert(
      { room_id: room.id, round_index: round, player_id: playerId },
      { onConflict: "room_id,round_index,player_id", ignoreDuplicates: true },
    );
  const answer = must(
    await db().from("answers").select("*").eq("room_id", room.id).eq("round_index", round).eq("player_id", playerId).single(),
    "lecture réponse",
  ) as AnswerRow;
  must(
    await db()
      .from("answers")
      .update({ found_title: true, found_artist: true, points: answer.points + gained, done: true, updated_at: nowIso() })
      .eq("id", answer.id),
    "validation",
  );
  const player = must(await db().from("players").select("*").eq("id", playerId).single(), "lecture joueur") as Player;
  must(
    await db()
      .from("players")
      .update({
        score: player.score + gained,
        last_round_points: player.last_round_points + gained,
        correct_count: player.correct_count + (wasZero ? 1 : 0),
      })
      .eq("id", playerId),
    "validation",
  );
}

/** URL de l'extrait à jouer sur la télé (réservé à l'animateur). */
export async function hostTrack(room: Room, round: number) {
  if (round < 0 || round >= room.total_rounds || (round !== room.round_index && round !== room.round_index + 1)) {
    throw new HttpError(400, "Manche invalide");
  }
  const track = await loadTrack(room.id, round);
  if (!track) throw new HttpError(404, "Morceau introuvable");
  const { getProvider } = await import("../audio");
  const playable = await getProvider(track.provider).resolvePlayable(track.provider_ref, Number(track.start_at));
  if (!playable) throw new HttpError(502, "Extrait indisponible");
  return {
    round,
    url: playable.url,
    startAt: playable.startAt,
    duration: Math.min(Number(track.duration), playable.maxDuration, room.settings.roundDuration),
  };
}
