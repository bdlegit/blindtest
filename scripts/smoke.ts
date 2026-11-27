/**
 * Test de bout en bout de l'API : joue une partie complète contre un serveur lancé.
 * Usage : BASE_URL=http://localhost:3000 npx tsx scripts/smoke.ts
 * (nécessite NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

let failures = 0;
function check(cond: unknown, label: string) {
  console.log(`${cond ? "✔" : "✘"} ${label}`);
  if (!cond) failures++;
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ── création
  const created = await call("POST", "/api/rooms", {
    name: "Smoke test",
    settings: { rounds: 3, roundDuration: 10, speedBonus: true, source: { type: "themes", categories: ["80s", "rock"] } },
  });
  check(created.status === 201 && created.data.code?.length === 6, `salle créée (${created.data.code})`);
  const { code, hostToken } = created.data;
  const H = { "x-host-token": hostToken };

  // ── sécurité
  const st = await call("GET", `/api/rooms/${code}`);
  const { data: leakedTracks } = await anon.from("room_tracks").select("*").eq("room_id", st.data.room.id);
  check(!leakedTracks?.length, "clé publique : morceaux de la partie illisibles");
  const { data: leakedSecrets } = await anon.from("room_secrets").select("*");
  check(!leakedSecrets?.length, "clé publique : secrets illisibles");
  const { error: writeErr } = await anon.from("rooms").update({ name: "hack" }).eq("id", st.data.room.id);
  const after = await call("GET", `/api/rooms/${code}`);
  check(after.data.room.name === "Smoke test" || !!writeErr, "clé publique : écriture refusée");
  const badHost = await call("POST", `/api/rooms/${code}/host`, { action: "start" }, { "x-host-token": "nope" });
  check(badHost.status === 403, "action animateur refusée sans jeton");
  const badTrack = await call("GET", `/api/rooms/${code}/host/track?round=0`);
  check(badTrack.status === 403, "URL d'extrait refusée sans jeton");
  check(!JSON.stringify(st.data).includes("title_aliases"), "l'état public ne contient pas les réponses");

  // ── joueurs
  const start0 = await call("POST", `/api/rooms/${code}/host`, { action: "start" }, H);
  check(start0.status === 409, "impossible de démarrer sans joueur");
  const names = ["Alice", "Bob", "Chloé"];
  const players: { id: string; token: string }[] = [];
  for (const n of names) {
    const j = await call("POST", `/api/rooms/${code}/join`, { nickname: n });
    check(j.status === 201, `${n} rejoint`);
    players.push({ id: j.data.player.id, token: j.data.token });
  }
  const dup = await call("POST", `/api/rooms/${code}/join`, { nickname: "alice" });
  check(dup.status === 409, "pseudo en double refusé");
  const me = await call("GET", `/api/rooms/${code}`, undefined, { "x-player-token": players[0].token });
  check(me.data.me?.player.nickname === "Alice", "reconnexion par jeton");

  const roomId = st.data.room.id as string;
  const { data: tracks } = await admin.from("room_tracks").select("*").eq("room_id", roomId).order("position");
  check(tracks?.length === 3, "3 morceaux préparés");

  const track0 = await call("GET", `/api/rooms/${code}/host/track?round=0`, undefined, H);
  check(track0.status === 200 && /^https:\/\//.test(track0.data.url), "URL d'extrait Deezer fraîche pour l'animateur");

  // ── partie
  await call("POST", `/api/rooms/${code}/host`, { action: "start" }, H);
  for (let round = 0; round < 3; round++) {
    let s = (await call("GET", `/api/rooms/${code}`)).data;
    check(s.room.phase === "countdown" && s.room.round_index === round, `manche ${round + 1} : compte à rebours`);
    const early = await call("POST", `/api/rooms/${code}/answer`, { guess: "x" }, { "x-player-token": players[0].token });
    check(early.status === 409, "réponse refusée avant le début");
    await call("POST", `/api/rooms/${code}/host`, { action: "advance", phase: "countdown", round, force: true }, H);
    s = (await call("GET", `/api/rooms/${code}`)).data;
    check(s.room.phase === "playing", "manche en cours");
    const t = tracks![round];
    // Alice : titre + artiste d'un coup (avec une faute), Bob : l'artiste puis rien, Chloé : faux
    const a = await call("POST", `/api/rooms/${code}/answer`, { guess: `${t.artist} ${t.title}`.toLowerCase() }, { "x-player-token": players[0].token });
    check(a.data.answer?.foundTitle && a.data.answer?.foundArtist, `Alice trouve « ${t.title} » / ${t.artist}`);
    const b = await call("POST", `/api/rooms/${code}/answer`, { guess: t.artist }, { "x-player-token": players[1].token });
    check(b.data.answer?.foundArtist && !b.data.answer?.foundTitle, "Bob trouve l'artiste seulement");
    const mid = (await call("GET", `/api/rooms/${code}`)).data;
    check(mid.room.answered_count === 2, "compteur : 2 joueurs ont répondu");
    check(!mid.room.public_round?.reveal, "pas de révélation pendant la manche");
    const scoresHidden = mid.players.every((p: { id: string; score: number }) => p.score === s.players.find((q: { id: string }) => q.id === p.id).score);
    check(scoresHidden, "scores inchangés avant la révélation");
    // Chloé épuise ses essais, Bob aussi → tout le monde a fini → révélation anticipée
    for (let i = 0; i < 5; i++) await call("POST", `/api/rooms/${code}/answer`, { guess: "zzzz qqq" }, { "x-player-token": players[2].token });
    for (let i = 0; i < 4; i++) await call("POST", `/api/rooms/${code}/answer`, { guess: "wrong" }, { "x-player-token": players[1].token });
    await sleep(200);
    s = (await call("GET", `/api/rooms/${code}`)).data;
    check(s.room.phase === "reveal", "révélation automatique quand tout le monde a fini");
    check(s.room.public_round?.reveal?.title === t.title, "titre révélé");
    const alice = s.players.find((p: { id: string }) => p.id === players[0].id);
    check(alice.last_round_points >= 200, `Alice marque ${alice.last_round_points} pts (bonus inclus)`);
    await call("POST", `/api/rooms/${code}/host`, { action: "advance", phase: "reveal", round, force: true }, H);
    s = (await call("GET", `/api/rooms/${code}`)).data;
    if (round < 2) {
      check(s.room.phase === "scores", "podium provisoire");
      // pause / reprise
      await call("POST", `/api/rooms/${code}/host`, { action: "pause" }, H);
      const paused = (await call("GET", `/api/rooms/${code}`)).data;
      check(!!paused.room.paused_at, "pause");
      await sleep(300);
      await call("POST", `/api/rooms/${code}/host`, { action: "resume" }, H);
      const resumed = (await call("GET", `/api/rooms/${code}`)).data;
      check(!resumed.room.paused_at && new Date(resumed.room.phase_ends_at) > new Date(paused.room.phase_ends_at), "reprise : chrono décalé");
      // avance non forcée trop tôt : ignorée
      await call("POST", `/api/rooms/${code}/host`, { action: "advance", phase: "scores", round }, H);
      check((await call("GET", `/api/rooms/${code}`)).data.room.phase === "scores", "avance automatique prématurée ignorée");
      await call("POST", `/api/rooms/${code}/host`, { action: "advance", phase: "scores", round, force: true }, H);
    }
  }
  const fin = (await call("GET", `/api/rooms/${code}`)).data;
  check(fin.room.phase === "finished", "partie terminée");
  const stats = fin.room.final_stats;
  check(stats?.totalCorrect === 6, `stats : ${stats?.totalCorrect} bonnes réponses (attendu 6)`);
  check(stats?.fastest?.nickname === "Alice" || stats?.fastest?.nickname === "Bob", `le plus rapide : ${stats?.fastest?.nickname}`);
  const ranked = [...fin.players].sort((a: { score: number }, b: { score: number }) => b.score - a.score);
  check(ranked[0].nickname === "Alice" && ranked[2].score === 0, "classement final cohérent");
  const recent = await call("GET", "/api/rooms/recent");
  check(recent.data.games?.some((g: { room_name: string }) => g.room_name === "Smoke test"), "partie dans l'historique");

  // ── rejouer
  await call("POST", `/api/rooms/${code}/host`, { action: "replay" }, H);
  const replay = (await call("GET", `/api/rooms/${code}`, undefined, { "x-player-token": players[1].token })).data;
  check(replay.room.phase === "lobby" && replay.players.length === 3 && replay.players.every((p: { score: number }) => p.score === 0), "rejouer : mêmes joueurs, scores à zéro");
  check(replay.me?.player.nickname === "Bob", "rejouer : les téléphones restent connectés");

  // ── exclusion
  await call("POST", `/api/rooms/${code}/host`, { action: "kick", playerId: players[2].id }, H);
  const kicked = await call("GET", `/api/rooms/${code}`, undefined, { "x-player-token": players[2].token });
  check(kicked.data.me?.player.kicked === true && kicked.data.players.length === 2, "exclusion d'un joueur");

  console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert ✔");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
