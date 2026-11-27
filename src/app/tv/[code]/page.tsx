"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NeonBackground } from "@/components/NeonBackground";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { Equalizer } from "@/components/Equalizer";
import { Leaderboard } from "@/components/Leaderboard";
import { Podium } from "@/components/Podium";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { QrCode } from "@/components/QrCode";
import { TimerRing } from "@/components/TimerRing";
import { burst, celebrate } from "@/components/confetti";
import { api } from "@/lib/client/api";
import { hostKey, load } from "@/lib/client/storage";
import { remainingMs, useRoom, useServerNow } from "@/lib/client/useRoom";
import { rankPlayers, type Player, type RoomState } from "@/lib/game";
import type { HostAction } from "@/lib/server/engine";
import { useHostAudio } from "./useHostAudio";

export default function TvPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setHostToken(load(hostKey(code)));
    setReady(true);
  }, [code]);

  const { state, setState, error, offset, online, refresh } = useRoom(code);
  const now = useServerNow(offset, 8);
  const audio = useHostAudio(code, hostToken);
  const isHost = !!hostToken;
  const [actionError, setActionError] = useState<string | null>(null);

  const act = useCallback(
    async (action: HostAction) => {
      if (!hostToken) return;
      try {
        const s = await api.host(code, hostToken, action);
        setState(s);
        setActionError(null);
      } catch (e) {
        setActionError((e as Error).message);
        void refresh();
      }
    },
    [code, hostToken, setState, refresh],
  );

  const room = state?.room;
  const phase = room?.phase;
  const round = room?.round_index ?? -1;
  const paused = !!room?.paused_at;

  // ── avance automatique des phases (pilotée par l'écran de l'animateur)
  const lastAdvance = useRef<string>("");
  useEffect(() => {
    if (!isHost || !room || paused || !room.phase_ends_at) return;
    if (!["countdown", "playing", "reveal", "scores"].includes(room.phase)) return;
    const key = `${room.phase}:${room.round_index}:${room.phase_ends_at}`;
    const wait = new Date(room.phase_ends_at).getTime() - (Date.now() + offset) + 150;
    const id = setTimeout(() => {
      if (lastAdvance.current === key) return;
      lastAdvance.current = key;
      void act({ action: "advance", phase: room.phase, round: room.round_index });
    }, Math.max(0, wait));
    return () => clearTimeout(id);
  }, [isHost, room, paused, offset, act]);

  // ── pilotage du son selon la phase
  const audioKey = `${phase}:${round}:${paused}`;
  const prevAudioKey = useRef("");
  useEffect(() => {
    if (!isHost || !room || prevAudioKey.current === audioKey) return;
    const prev = prevAudioKey.current;
    prevAudioKey.current = audioKey;
    if (paused) {
      audio.pause();
      return;
    }
    if (phase === "countdown") void audio.prepare(round);
    else if (phase === "playing") {
      const elapsed = room.phase_started_at ? Date.now() + offset - new Date(room.phase_started_at).getTime() : 0;
      if (prev.startsWith("playing:") && prev.endsWith(":true")) void audio.resume();
      else void audio.play(round, elapsed > 1500 ? elapsed : 0);
    } else if (phase === "reveal") {
      if (prev.endsWith(":true")) void audio.resume();
    } else if (phase === "scores") {
      audio.fadeOut();
      const t = setTimeout(() => void audio.prepare(round + 1), 1600);
      return () => clearTimeout(t);
    } else audio.fadeOut();
  }, [audioKey, isHost, room, phase, round, paused, offset, audio]);

  // ── raccourcis clavier
  useEffect(() => {
    if (!isHost || !room) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (room.phase === "lobby") void act({ action: "start" });
        else void act({ action: paused ? "resume" : "pause" });
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") {
        if (!["lobby", "finished"].includes(room.phase)) void act({ action: "advance", phase: room.phase, round: room.round_index, force: true });
      } else if (e.key.toLowerCase() === "m") audio.setMuted((m) => !m);
      else if (e.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHost, room, paused, act, audio]);

  if (!ready || (!state && !error)) return <Loading />;
  if (error && !state) return <ErrorScreen message={error.message} />;
  if (!state || !room) return <Loading />;

  const remaining = remainingMs(room.phase_ends_at, room.paused_at, now);

  return (
    <main
      className="relative flex h-dvh flex-col overflow-hidden px-[2.5vw] py-[2vh]"
      onClick={() => isHost && audio.blocked && void audio.unlock()}
    >
      <NeonBackground intensity={phase === "playing" ? 1 : 0.7} grid={phase !== "finished"} />
      <TvHeader state={state} />

      <div className="relative flex min-h-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.section
            key={`${phase}-${phase === "lobby" || phase === "finished" ? "" : round}`}
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -24, filter: "blur(8px)" }}
            transition={{ duration: 0.45 }}
            className="flex min-h-0 flex-1"
          >
            {phase === "lobby" && (
              <Lobby
                state={state}
                online={online}
                isHost={isHost}
                onStart={() => {
                  void audio.unlock();
                  void act({ action: "start" });
                }}
                onKick={(p) => confirm(`Exclure ${p.nickname} ?`) && void act({ action: "kick", playerId: p.id })}
              />
            )}
            {phase === "countdown" && <Countdown state={state} remaining={remaining} />}
            {phase === "playing" && <Playing state={state} remaining={remaining} online={online} />}
            {phase === "reveal" && <Reveal state={state} />}
            {phase === "scores" && <Scores state={state} />}
            {phase === "finished" && (
              <Finished
                state={state}
                isHost={isHost}
                onReplay={() => {
                  void audio.unlock();
                  void act({ action: "replay" });
                }}
              />
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      {isHost && phase !== "lobby" && (
        <HostControls
          paused={paused}
          phase={phase!}
          muted={audio.muted}
          onPause={() => act({ action: paused ? "resume" : "pause" })}
          onNext={() => act({ action: "advance", phase: room.phase, round: room.round_index, force: true })}
          onEnd={() => confirm("Terminer la partie maintenant ?") && act({ action: "end" })}
          onMute={() => audio.setMuted((m) => !m)}
        />
      )}

      <AnimatePresence>
        {paused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg/75 backdrop-blur-md"
          >
            <div className="font-display text-[8vw] font-black uppercase text-neon">Pause</div>
            <p className="text-[1.6vw] text-muted">{isHost ? "Espace pour reprendre" : "L'animateur a mis la partie en pause"}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {isHost && audio.blocked && (
        <button
          onClick={() => void audio.unlock()}
          className="absolute inset-x-0 top-1/3 z-30 mx-auto w-fit rounded-3xl bg-pink px-10 py-6 font-display text-2xl font-black uppercase glow-pink"
        >
          🔊 Clique pour activer le son
        </button>
      )}
      {(actionError || (isHost && audio.error)) && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-2xl bg-red/20 px-5 py-3 text-red ring-1 ring-red/50">
          {actionError ?? audio.error}
        </div>
      )}
    </main>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

function Loading() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6">
      <NeonBackground />
      <Logo size="lg" />
      <Equalizer bars={10} height={40} className="w-40" />
    </main>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <NeonBackground />
      <Logo size="md" />
      <p className="text-xl">{message}</p>
      <Link href="/" className="text-cyan underline">
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}

function TvHeader({ state }: { state: RoomState }) {
  const { room } = state;
  const inGame = !["lobby", "finished"].includes(room.phase);
  return (
    <header className="relative z-10 mb-[2vh] flex items-center justify-between gap-6">
      <div className="flex items-center gap-6">
        <Logo size="sm" />
        <div className="hidden h-10 w-px bg-line md:block" />
        <div className="hidden truncate text-[1.3vw] font-bold md:block">{room.name}</div>
      </div>
      <div className="flex items-center gap-4">
        {inGame && (
          <>
            {room.public_round?.categoryLabel && (
              <span className="glass rounded-full px-5 py-2 text-[1.2vw] font-bold">{room.public_round.categoryLabel}</span>
            )}
            <span className="font-display rounded-full bg-pink/20 px-5 py-2 text-[1.2vw] font-black text-pink ring-1 ring-pink/50">
              Manche {room.round_index + 1}/{room.total_rounds}
            </span>
          </>
        )}
        <span className="font-display glass rounded-full px-5 py-2 text-[1.2vw] font-black tracking-[0.25em]">{room.code}</span>
      </div>
    </header>
  );
}

function joinUrl(code: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/play/${code}`;
}

function Lobby({
  state,
  online,
  isHost,
  onStart,
  onKick,
}: {
  state: RoomState;
  online: Set<string> | null;
  isHost: boolean;
  onStart: () => void;
  onKick: (p: Player) => void;
}) {
  const { room, players } = state;
  const url = joinUrl(room.code);
  const host = url.replace(/^https?:\/\//, "").replace(/\/play\/.*/, "");
  const s = room.settings;
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-[3vw]">
      <div className="flex flex-col items-center justify-center gap-[3vh]">
        <p className="font-display text-[1.6vw] font-bold uppercase tracking-[0.3em] text-muted">Rejoins la partie</p>
        <QrCode value={url} size={Math.round(typeof window !== "undefined" ? Math.min(window.innerWidth * 0.17, window.innerHeight * 0.32) : 240)} />
        <div className="text-center">
          <p className="text-[1.3vw] text-muted">
            ou va sur <span className="font-bold text-ink">{host}/join</span> avec le code
          </p>
          <div className="font-display mt-2 text-[6vw] font-black leading-none tracking-[0.15em] text-neon">{room.code}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="mb-[2vh] flex items-end justify-between">
          <h2 className="font-display text-[2.6vw] font-black uppercase">
            Joueurs <span className="text-pink">{players.length}</span>
          </h2>
          <div className="text-right text-[1.1vw] text-muted">
            {s.rounds} manches · {s.roundDuration} s · {s.answerMode === "choices" ? "QCM" : "saisie libre"}
            {s.speedBonus ? " · bonus rapidité" : ""}
          </div>
        </div>
        <div className="glass min-h-0 flex-1 overflow-y-auto rounded-[2vw] p-[1.5vw]">
          {players.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-muted">
              <Equalizer bars={8} height={48} className="w-32" />
              <p className="text-[1.5vw]">On attend les premiers joueurs…</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[1vw] xl:grid-cols-4">
              <AnimatePresence>
                {players.map((p) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.4, rotate: -8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="group relative flex flex-col items-center gap-2 rounded-2xl bg-surface p-[1vw]"
                  >
                    <PlayerAvatar avatar={p.avatar} color={p.color} size={64} dim={online ? !online.has(p.id) : false} />
                    <span className="max-w-full truncate text-[1.2vw] font-bold">{p.nickname}</span>
                    {isHost && (
                      <button
                        onClick={() => onKick(p)}
                        className="absolute right-2 top-2 rounded-lg px-2 text-sm text-muted opacity-0 transition group-hover:opacity-100 hover:text-red"
                        title="Exclure"
                      >
                        ✕
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
        <div className="mt-[2vh] flex items-center justify-between gap-4">
          {isHost ? (
            <>
              <p className="text-[1.1vw] text-muted">Le son sort de cet écran : monte le volume de la télé 🔊</p>
              <Button size="xl" onClick={onStart} disabled={!players.length}>
                ▶ Lancer la partie
              </Button>
            </>
          ) : (
            <p className="text-[1.3vw] text-muted">En attente du lancement par l&apos;animateur…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Countdown({ state, remaining }: { state: RoomState; remaining: number }) {
  const n = Math.max(1, Math.ceil((remaining - 600) / 1000));
  const pr = state.room.public_round;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[3vh]">
      <p className="font-display text-[2vw] font-bold uppercase tracking-[0.4em] text-muted">
        Manche {state.room.round_index + 1}
      </p>
      {pr?.categoryLabel && <p className="font-display text-[3vw] font-black">{pr.categoryLabel}</p>}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={remaining < 600 ? "go" : n}
          initial={{ scale: 2.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.3, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="font-display text-[16vw] font-black leading-none text-neon"
        >
          {remaining < 600 ? "GO" : n}
        </motion.div>
      </AnimatePresence>
      {pr?.workTitle && <p className="text-[1.5vw] text-muted">🎬 Trouve l&apos;œuvre (film, série, jeu…) et son compositeur ou interprète</p>}
    </div>
  );
}

function Playing({ state, remaining, online }: { state: RoomState; remaining: number; online: Set<string> | null }) {
  const { room, players } = state;
  const total = room.phase_ends_at && room.phase_started_at
    ? new Date(room.phase_ends_at).getTime() - new Date(room.phase_started_at).getTime()
    : room.settings.roundDuration * 1000;
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,8fr)_minmax(0,4fr)] gap-[3vw]">
      <div className="flex flex-col items-center justify-center gap-[4vh]">
        <div className="relative grid place-items-center">
          <div className="pulse-ring col-start-1 row-start-1 h-full w-full rounded-full ring-2 ring-pink/40" />
          <div className="col-start-1 row-start-1">
            <TimerRing remaining={remaining} total={total} size={Math.round(typeof window !== "undefined" ? window.innerHeight * 0.36 : 300)} paused={!!room.paused_at} />
          </div>
        </div>
        <Equalizer bars={28} height={90} active={!room.paused_at} className="w-[55vw] max-w-[900px]" />
        <div className="flex items-center gap-4">
          <span className="font-display text-[4vw] font-black text-cyan">
            {room.answered_count}
            <span className="text-[2.4vw] text-muted">/{players.length}</span>
          </span>
          <span className="text-[1.6vw] text-muted">{room.answered_count > 1 ? "ont déjà répondu" : "a déjà répondu"}</span>
        </div>
        <p className="text-[1.4vw] text-muted">
          {room.settings.answerMode === "choices" ? "Choisis la bonne réponse sur ton téléphone 📱" : "Tape le titre et/ou l'artiste sur ton téléphone 📱"}
        </p>
      </div>
      <aside className="glass flex min-h-0 flex-col rounded-[2vw] p-[1.5vw]">
        <h3 className="font-display mb-3 text-[1.3vw] font-bold uppercase tracking-wider text-muted">Classement</h3>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Leaderboard players={players} online={online} compact limit={10} />
        </div>
      </aside>
    </div>
  );
}

function Reveal({ state }: { state: RoomState }) {
  const { room, players } = state;
  const rv = room.public_round?.reveal;
  const winners = rv?.results.filter((r) => r.foundTitle || r.foundArtist).length ?? 0;
  useEffect(() => {
    if (winners) burst(Math.min(2, 0.6 + winners * 0.2));
  }, [winners]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  if (!rv) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Equalizer bars={10} height={60} className="w-48" />
      </div>
    );
  }
  const results = [...rv.results].sort((a, b) => b.points - a.points);
  const pr = room.public_round!;
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,6fr)_minmax(0,6fr)] items-center gap-[3vw]">
      <div className="flex flex-col items-center gap-[3vh] text-center">
        <div className="relative">
          <div className="spin-slow relative h-[42vh] w-[42vh] rounded-full bg-[repeating-radial-gradient(circle,#111_0,#111_2px,#1b1b1b_3px,#111_4px)] shadow-[0_0_80px_rgba(255,43,214,0.35)]">
            <div className="absolute inset-[18%] flex items-center justify-center rounded-full bg-gradient-to-br from-pink to-violet text-[6vh]">🎵</div>
            {rv.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rv.coverUrl}
                alt=""
                onError={(e) => (e.currentTarget.style.display = "none")}
                className="absolute inset-[18%] h-[64%] w-[64%] rounded-full object-cover ring-4 ring-black"
              />
            )}
            <div className="absolute left-1/2 top-1/2 h-[3vh] w-[3vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg ring-2 ring-white/20" />
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="font-display text-[3.4vw] font-black leading-tight text-neon">{rv.title}</div>
          <div className="mt-2 text-[2vw] font-bold">{rv.artist}</div>
          {pr.workTitle && <div className="text-[1.1vw] text-muted">œuvre · compositeur / interprète</div>}
        </motion.div>
      </div>
      <div className="glass flex max-h-full min-h-0 flex-col rounded-[2vw] p-[1.5vw]">
        <h3 className="font-display mb-3 flex items-center justify-between text-[1.3vw] font-bold uppercase tracking-wider">
          <span>Réponses</span>
          <span className="text-lime">
            {winners}/{rv.results.length} ont trouvé
          </span>
        </h3>
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
          {results.map((r, i) => {
            const p = byId.get(r.playerId);
            if (!p) return null;
            const ok = r.foundTitle || r.foundArtist;
            return (
              <motion.div
                key={r.playerId}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.07 }}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${ok ? "bg-lime/10 ring-1 ring-lime/40" : "bg-surface"}`}
              >
                <PlayerAvatar avatar={p.avatar} color={p.color} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{p.nickname}</div>
                  <div className="truncate text-sm text-muted">{r.guess ? `« ${r.guess} »` : "— pas de réponse —"}</div>
                </div>
                {room.settings.answerMode === "choices" ? (
                  <Badge ok={ok} label={ok ? "Bonne réponse" : "Raté"} />
                ) : (
                  <div className="flex gap-1.5">
                    <Badge ok={r.foundTitle} label={pr.workTitle ? "Œuvre" : "Titre"} />
                    <Badge ok={r.foundArtist} label="Artiste" />
                  </div>
                )}
                <span className={`w-16 text-right text-lg font-black ${r.points ? "font-display text-lime" : "text-muted"}`}>
                  {r.points ? `+${r.points}` : "—"}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ok ? "bg-lime text-[#0b1200]" : "bg-surface-2 text-muted line-through"}`}>
      {ok ? "✓ " : ""}
      {label}
    </span>
  );
}

function Scores({ state }: { state: RoomState }) {
  const { room, players } = state;
  const ranked = rankPlayers(players);
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-center gap-[3vw]">
      <div className="flex flex-col items-center gap-[4vh]">
        <h2 className="font-display text-[3vw] font-black uppercase">
          Podium <span className="text-neon">provisoire</span>
        </h2>
        <Podium players={players} big />
        <p className="text-[1.4vw] text-muted">
          Encore {room.total_rounds - room.round_index - 1} manche{room.total_rounds - room.round_index - 1 > 1 ? "s" : ""}…
        </p>
      </div>
      <div className="glass max-h-full overflow-hidden rounded-[2vw] p-[1.5vw]">
        <Leaderboard players={ranked} showDelta />
      </div>
    </div>
  );
}

function Finished({ state, isHost, onReplay }: { state: RoomState; isHost: boolean; onReplay: () => void }) {
  const { room, players } = state;
  const stats = room.final_stats;
  const ranked = rankPlayers(players);
  const winner = ranked[0];
  useEffect(() => {
    celebrate(4000);
  }, []);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-[3vw]">
      <div className="flex flex-col items-center justify-center gap-[3vh]">
        {winner && (
          <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="text-center">
            {winner.score > 0 ? (
              <>
                <p className="font-display text-[1.6vw] font-bold uppercase tracking-[0.4em] text-amber">Grand gagnant</p>
                <p className="font-display text-[5vw] font-black leading-tight text-neon">
                  {winner.avatar} {winner.nickname}
                </p>
              </>
            ) : (
              <p className="font-display text-[3.5vw] font-black leading-tight text-neon">Personne n&apos;a marqué 😅</p>
            )}
          </motion.div>
        )}
        <Podium players={players} big />
        {isHost && (
          <div className="mt-[2vh] flex gap-4">
            <Button size="xl" onClick={onReplay}>
              🔁 Rejouer
            </Button>
            <Link
              href="/create"
              className="font-display glass inline-flex items-center rounded-2xl px-7 py-4 font-bold uppercase tracking-wide hover:bg-surface-2"
            >
              Nouvelle partie
            </Link>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-[1.5vh]">
        {stats && (
          <div className="grid grid-cols-2 gap-[1vw]">
            <Stat label="Bonnes réponses" value={String(stats.totalCorrect)} color="var(--lime)" />
            <Stat label="Taux de réussite" value={pct(stats.successRate)} color="var(--cyan)" />
            <Stat
              label="Le plus rapide"
              value={stats.fastest ? `${stats.fastest.nickname}` : "—"}
              sub={stats.fastest ? `${(stats.fastest.ms / 1000).toFixed(1)} s` : undefined}
              color="var(--pink)"
            />
            <Stat label="Le plus dur" value={stats.hardest?.title ?? "—"} sub={stats.hardest?.artist} color="var(--amber)" />
          </div>
        )}
        <div className="glass min-h-0 flex-1 overflow-y-auto rounded-[2vw] p-[1.2vw]">
          <table className="w-full text-left text-[1.05vw]">
            <thead className="text-muted">
              <tr>
                <th className="pb-2">#</th>
                <th className="pb-2">Joueur</th>
                <th className="pb-2 text-right">Score</th>
                <th className="pb-2 text-right">Trouvés</th>
                <th className="pb-2 text-right">Réussite</th>
                <th className="pb-2 text-right">Moy.</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p, i) => {
                const ps = stats?.perPlayer[p.id];
                return (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2 font-display font-bold">{i + 1}</td>
                    <td className="py-2 font-bold">
                      {p.avatar} {p.nickname}
                    </td>
                    <td className="py-2 text-right font-display font-bold">{p.score}</td>
                    <td className="py-2 text-right">
                      {ps?.correct ?? 0}/{stats?.rounds ?? room.total_rounds}
                    </td>
                    <td className="py-2 text-right">{ps ? pct(ps.rate) : "—"}</td>
                    <td className="py-2 text-right">{ps?.avgMs != null ? `${(ps.avgMs / 1000).toFixed(1)} s` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass rounded-[1.5vw] p-[1.2vw]">
      <div className="text-[0.95vw] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="font-display mt-1 truncate text-[2vw] font-black" style={{ color }}>
        {value}
      </div>
      {sub && <div className="truncate text-[0.95vw] text-muted">{sub}</div>}
    </div>
  );
}

function HostControls({
  paused,
  phase,
  muted,
  onPause,
  onNext,
  onEnd,
  onMute,
}: {
  paused: boolean;
  phase: string;
  muted: boolean;
  onPause: () => void;
  onNext: () => void;
  onEnd: () => void;
  onMute: () => void;
}) {
  const nextLabel =
    phase === "playing" ? "⏭ Passer / révéler" : phase === "reveal" ? "⏭ Classement" : phase === "scores" ? "⏭ Manche suivante" : "⏭ Suivant";
  if (phase === "finished") return null;
  return (
    <div className="relative z-30 mt-[1.5vh] flex items-center justify-center gap-3 opacity-40 transition hover:opacity-100 focus-within:opacity-100">
      <Button variant="ghost" size="sm" onClick={onPause}>
        {paused ? "▶ Reprendre" : "❚❚ Pause"}
      </Button>
      <Button variant="ghost" size="sm" onClick={onNext}>
        {nextLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={onMute}>
        {muted ? "🔇 Son coupé" : "🔊 Son"}
      </Button>
      <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
        ⛶ Plein écran
      </Button>
      <Button variant="danger" size="sm" onClick={onEnd}>
        ■ Terminer
      </Button>
      <span className="ml-2 hidden text-xs text-muted lg:inline">Espace : pause · → : suivant · M : son · F : plein écran</span>
    </div>
  );
}
