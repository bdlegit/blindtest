"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NeonBackground } from "@/components/NeonBackground";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { Equalizer } from "@/components/Equalizer";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { burst } from "@/components/confetti";
import { api, ApiError } from "@/lib/client/api";
import { load, playerKey, profileKey, save } from "@/lib/client/storage";
import { remainingMs, useRoom, useServerNow } from "@/lib/client/useRoom";
import { AVATARS, COLORS, LIMITS, rankPlayers, type MyAnswer, type RoomState } from "@/lib/game";

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = use(params);
  const code = raw.toUpperCase();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => setToken(load(playerKey(code))), [code]);

  if (token === undefined) return <Shell><Equalizer bars={8} height={40} className="mx-auto mt-24 w-32" /></Shell>;
  if (!token)
    return (
      <JoinForm
        code={code}
        onJoined={(t) => {
          save(playerKey(code), t);
          setToken(t);
        }}
      />
    );
  return (
    <Controller
      code={code}
      token={token}
      onLost={() => {
        save(playerKey(code), null);
        setToken(null);
      }}
    />
  );
}

function Shell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <NeonBackground intensity={0.6} grid={false} />
      {!compact && (
        <div className="mb-4 flex justify-center">
          <Link href="/">
            <Logo size="sm" />
          </Link>
        </div>
      )}
      {children}
    </main>
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const p = JSON.parse(load(profileKey) ?? "null");
      if (p?.nickname) setNickname(p.nickname);
      if (p?.avatar) setAvatar(p.avatar);
      if (p?.color) setColor(p.color);
    } catch {
      /* ignore */
    }
    api
      .state(code)
      .then((s) => setRoomName(s.room.name))
      .catch((e) => setError((e as Error).message));
  }, [code]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.join(code, { nickname, avatar, color });
      save(profileKey, JSON.stringify({ nickname, avatar, color }));
      onJoined(res.token);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={join} className="flex flex-1 flex-col gap-6">
        <div className="text-center">
          <div className="font-display text-sm font-bold tracking-[0.3em] text-muted">SALLE {code}</div>
          <h1 className="font-display mt-1 text-2xl font-black">{roomName ?? "…"}</h1>
        </div>
        <div className="flex justify-center">
          <motion.div key={avatar + color} initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}>
            <PlayerAvatar avatar={avatar} color={color} size={104} ring />
          </motion.div>
        </div>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, LIMITS.nickname))}
          placeholder="Ton pseudo"
          autoComplete="nickname"
          className="font-display w-full rounded-2xl border border-line bg-black/40 px-5 py-4 text-center text-2xl font-bold outline-none placeholder:text-muted/50 focus:border-pink"
        />
        <div>
          <div className="mb-2 text-sm font-semibold text-muted">Avatar</div>
          <div className="grid grid-cols-10 gap-1.5">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => setAvatar(a)}
                className={`aspect-square rounded-xl text-xl transition ${a === avatar ? "bg-surface-2 ring-2 ring-pink" : "bg-surface"}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-muted">Couleur</div>
          <div className="flex justify-between">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Couleur ${c}`}
                className="h-9 w-9 rounded-full transition"
                style={{ background: c, boxShadow: c === color ? `0 0 0 3px #07050d, 0 0 0 5px ${c}, 0 0 18px ${c}` : undefined }}
              />
            ))}
          </div>
        </div>
        {error && <p className="rounded-2xl bg-red/15 p-3 text-center text-red ring-1 ring-red/40">{error}</p>}
        <div className="mt-auto">
          <Button type="submit" size="xl" className="w-full" disabled={busy || nickname.trim().length < 2}>
            {busy ? "Connexion…" : "C'est parti !"}
          </Button>
        </div>
      </form>
    </Shell>
  );
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const get = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    };
    void get();
    const onVis = () => document.visibilityState === "visible" && void get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

function Controller({ code, token, onLost }: { code: string; token: string; onLost: () => void }) {
  const [meId, setMeId] = useState<string | null>(null);
  const { state, setState, error, offset } = useRoom(code, {
    playerToken: token,
    presence: meId ? { key: meId, data: { player: meId } } : undefined,
  });
  const now = useServerNow(offset, 10);
  useWakeLock(true);

  useEffect(() => {
    if (state?.me?.player.id) setMeId(state.me.player.id);
  }, [state?.me?.player.id]);

  // session perdue (partie recréée, jeton invalide…)
  useEffect(() => {
    if (state && !state.me) onLost();
  }, [state, onLost]);

  const setAnswer = useCallback(
    (answer: MyAnswer) => setState((s) => (s && s.me ? { ...s, me: { ...s.me, answer } } : s)),
    [setState],
  );

  if (error && !state) {
    return (
      <Shell>
        <div className="mt-20 text-center">
          <p className="text-lg">{error.message}</p>
          <Link href="/join" className="mt-4 inline-block text-cyan underline">
            Saisir un autre code
          </Link>
        </div>
      </Shell>
    );
  }
  if (!state || !state.me) return <Shell><Equalizer bars={8} height={40} className="mx-auto mt-24 w-32" /></Shell>;

  const { room } = state;
  const me = state.me.player;
  if (me.kicked) {
    return (
      <Shell>
        <div className="mt-24 text-center">
          <div className="text-6xl">🚪</div>
          <p className="font-display mt-4 text-xl font-bold">L&apos;animateur t&apos;a retiré de la partie.</p>
          <Link href="/" className="mt-6 inline-block text-cyan underline">
            Retour à l&apos;accueil
          </Link>
        </div>
      </Shell>
    );
  }

  const ranked = rankPlayers(state.players);
  const rank = ranked.findIndex((p) => p.id === me.id) + 1;
  const remaining = remainingMs(room.phase_ends_at, room.paused_at, now);

  return (
    <Shell compact>
      <div className="mb-4 flex items-center gap-3">
        <PlayerAvatar avatar={me.avatar} color={me.color} size={42} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{me.nickname}</div>
          <div className="text-xs text-muted">
            {room.phase === "lobby" ? `Salle ${room.code}` : `${ordinal(rank)} / ${ranked.length} · ${me.score} pts`}
          </div>
        </div>
        {!["lobby", "finished"].includes(room.phase) && (
          <span className="font-display rounded-full bg-pink/20 px-3 py-1 text-xs font-black text-pink">
            {room.round_index + 1}/{room.total_rounds}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${room.phase}-${room.round_index}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
          className="flex flex-1 flex-col"
        >
          {room.phase === "lobby" && <Waiting state={state} />}
          {room.phase === "countdown" && (
            <Center>
              <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-muted">Prépare-toi</p>
              <p className="font-display mt-3 text-3xl font-black">{room.public_round?.categoryLabel ?? "🎵"}</p>
              <p className="font-display mt-6 text-8xl font-black text-neon">{Math.max(1, Math.ceil((remaining - 600) / 1000))}</p>
            </Center>
          )}
          {room.phase === "playing" && (
            <Answering state={state} code={code} token={token} remaining={remaining} onAnswer={setAnswer} />
          )}
          {room.phase === "reveal" && <MyReveal state={state} />}
          {room.phase === "scores" && (
            <Center>
              <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-muted">Classement</p>
              <p className="font-display mt-2 text-8xl font-black text-neon">{ordinal(rank)}</p>
              <p className="mt-2 text-lg">
                {me.score} pts{" "}
                {me.last_round_points > 0 && <span className="font-bold text-lime">(+{me.last_round_points})</span>}
              </p>
              <p className="mt-8 text-muted">Regarde la télé 📺</p>
            </Center>
          )}
          {room.phase === "finished" && <MyFinal state={state} rank={rank} />}
        </motion.div>
      </AnimatePresence>

      {room.paused_at && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-bg/80 backdrop-blur">
          <div className="font-display text-5xl font-black text-neon">PAUSE</div>
          <p className="mt-2 text-muted">L&apos;animateur a mis la partie en pause</p>
        </div>
      )}
    </Shell>
  );
}

function ordinal(n: number) {
  return n === 1 ? "1er" : `${n}e`;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">{children}</div>;
}

function Waiting({ state }: { state: RoomState }) {
  const me = state.me!.player;
  return (
    <Center>
      <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 2.4 }}>
        <PlayerAvatar avatar={me.avatar} color={me.color} size={130} ring />
      </motion.div>
      <h2 className="font-display mt-8 text-2xl font-black">Tu es dans la partie !</h2>
      <p className="mt-2 text-muted">
        {state.players.length} joueur{state.players.length > 1 ? "s" : ""} connecté{state.players.length > 1 ? "s" : ""}. Garde les yeux sur la télé, ça commence bientôt.
      </p>
      <Equalizer bars={10} height={36} className="mt-8 w-40" />
    </Center>
  );
}

type Feedback = { kind: "good" | "bad" | "info"; text: string; id: number };

function Answering({
  state,
  code,
  token,
  remaining,
  onAnswer,
}: {
  state: RoomState;
  code: string;
  token: string;
  remaining: number;
  onAnswer: (a: MyAnswer) => void;
}) {
  const { room } = state;
  const answer = state.me!.answer;
  const s = room.settings;
  const pr = room.public_round;
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const total =
    room.phase_ends_at && room.phase_started_at
      ? new Date(room.phase_ends_at).getTime() - new Date(room.phase_started_at).getTime()
      : s.roundDuration * 1000;
  const ratio = Math.max(0, Math.min(1, remaining / total));
  const done = !!answer?.done;
  const attemptsLeft = s.maxAttempts - (answer?.attempts ?? 0);

  const flash = (kind: Feedback["kind"], text: string) => setFeedback((f) => ({ kind, text, id: (f?.id ?? 0) + 1 }));

  const hintChoices = answer?.hintChoices ?? null;
  const canHint = s.answerMode === "text" && s.hints !== false && !done && !hintChoices;

  async function send(payload: { guess?: string; choice?: string; hint?: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.answer(code, token, payload);
      onAnswer(res.answer);
      const r = res.result;
      if (payload.hint) {
        flash("info", "💡 Joker activé : choisis la bonne proposition (points ÷ 2)");
      } else if (s.answerMode === "choices" || payload.choice) {
        if (r?.correct) {
          vibrate([30, 40, 30]);
          burst(0.6);
          flash("good", payload.choice && s.answerMode === "text" ? "Bonne réponse !" : `Bonne réponse ! +${res.answer.points}`);
        } else {
          vibrate(120);
          flash("bad", "Raté…");
        }
      } else if (r && (r.title || r.artist)) {
        vibrate([30, 40, 30]);
        burst(0.5);
        const what = [r.title && (pr?.workTitle ? "Œuvre" : "Titre"), r.artist && "Artiste"].filter(Boolean).join(" + ");
        flash("good", `${what} trouvé${r.title && r.artist ? "s" : ""} !`);
        setGuess("");
      } else {
        vibrate(80);
        flash("bad", res.answer.done ? "Plus d'essais pour cette manche" : "Non, essaie encore !");
        setGuess("");
      }
      if (!res.answer.done) inputRef.current?.focus();
    } catch (e) {
      flash("info", e instanceof ApiError ? e.message : "Connexion instable, réessaie");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${ratio * 100}%`,
            background: ratio < 0.2 ? "var(--red)" : ratio < 0.5 ? "var(--amber)" : "linear-gradient(90deg,var(--pink),var(--cyan))",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold">{pr?.categoryLabel ?? "🎵 Écoute bien"}</span>
        <span className="font-display font-black tabular-nums">{Math.ceil(remaining / 1000)} s</span>
      </div>

      {s.answerMode === "choices" && pr?.choices ? (
        <ChoiceButtons choices={pr.choices} chosen={answer?.choice ?? null} disabled={done || busy} onPick={(id) => send({ choice: id })} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FoundChip found={!!answer?.foundTitle} label={pr?.workTitle ? "Œuvre" : "Titre"} />
            <FoundChip found={!!answer?.foundArtist} label={pr?.workTitle ? "Artiste / compo." : "Artiste"} />
          </div>
          {done ? (
            <Center>
              <div className="text-6xl">{answer?.foundTitle && answer?.foundArtist ? "🔥" : answer?.foundTitle || answer?.foundArtist ? "👏" : "🤞"}</div>
              <p className="font-display mt-4 text-xl font-black">
                {answer?.foundTitle && answer?.foundArtist ? "Sans faute !" : "C'est noté !"}
              </p>
              <p className="mt-2 text-muted">Réponse révélée à la fin du temps</p>
            </Center>
          ) : hintChoices ? (
            <div className="flex flex-col gap-3">
              <p className="text-center text-sm font-semibold text-amber">💡 Joker : une seule tentative, points divisés par deux</p>
              <ChoiceButtons choices={hintChoices} chosen={null} disabled={busy} onPick={(id) => send({ choice: id })} />
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (guess.trim()) void send({ guess: guess.trim() });
              }}
              className="flex flex-col gap-3"
            >
              <input
                ref={inputRef}
                value={guess}
                onChange={(e) => setGuess(e.target.value.slice(0, LIMITS.guess))}
                placeholder={pr?.workTitle ? "Film, jeu, série… ou compositeur" : "Titre ou artiste…"}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                enterKeyHint="send"
                className="w-full rounded-2xl border border-line bg-black/50 px-5 py-4 text-xl font-semibold outline-none placeholder:text-muted/50 focus:border-cyan"
              />
              <Button type="submit" variant="cyan" size="lg" disabled={busy || !guess.trim()}>
                {busy ? "…" : "Envoyer"}
              </Button>
              <p className="text-center text-xs text-muted">
                {attemptsLeft} essai{attemptsLeft > 1 ? "s" : ""} restant{attemptsLeft > 1 ? "s" : ""} · tu peux tout taper d&apos;un coup
              </p>
              {canHint && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send({ hint: true })}
                  className="mt-2 rounded-2xl border border-amber/50 bg-amber/10 px-4 py-3 font-bold text-amber transition active:scale-95"
                >
                  💡 Voir les propositions <span className="font-normal opacity-80">(points ÷ 2)</span>
                </button>
              )}
            </form>
          )}
        </>
      )}

      <AnimatePresence>
        {feedback && (
          <motion.div
            key={feedback.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            onAnimationComplete={() => setTimeout(() => setFeedback((f) => (f?.id === feedback.id ? null : f)), 1800)}
            className={`font-display rounded-2xl px-4 py-3 text-center font-bold ${
              feedback.kind === "good"
                ? "bg-lime text-[#0b1200] glow-lime"
                : feedback.kind === "bad"
                  ? "bg-red/20 text-red ring-1 ring-red/50"
                  : "bg-surface-2 text-ink"
            }`}
          >
            {feedback.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const CHOICE_COLORS = ["#ff2bd6", "#00e5ff", "#b6ff3b", "#ffd400"];

function ChoiceButtons({
  choices,
  chosen,
  disabled,
  onPick,
}: {
  choices: { id: string; label: string }[];
  chosen: string | null;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="grid flex-1 grid-cols-1 gap-3">
      {choices.map((c, i) => {
        const color = CHOICE_COLORS[i % CHOICE_COLORS.length];
        const isChosen = chosen === c.id;
        return (
          <motion.button
            key={c.id}
            whileTap={{ scale: 0.96 }}
            disabled={disabled || !!chosen}
            onClick={() => onPick(c.id)}
            className="rounded-3xl p-5 text-left text-lg font-bold transition disabled:opacity-100"
            style={{
              background: isChosen ? color : `${color}1f`,
              color: isChosen ? "#07050d" : "var(--text)",
              boxShadow: `inset 0 0 0 2px ${color}${isChosen ? "" : "88"}${isChosen ? `, 0 0 30px ${color}` : ""}`,
              opacity: chosen && !isChosen ? 0.35 : 1,
            }}
          >
            {c.label}
          </motion.button>
        );
      })}
    </div>
  );
}

function FoundChip({ found, label }: { found: boolean; label: string }) {
  return (
    <motion.div
      animate={found ? { scale: [1, 1.12, 1] } : {}}
      className={`rounded-2xl px-4 py-3 text-center font-bold ${found ? "bg-lime text-[#0b1200] glow-lime" : "bg-surface text-muted ring-1 ring-line"}`}
    >
      {found ? "✓ " : ""}
      {label}
    </motion.div>
  );
}

function MyReveal({ state }: { state: RoomState }) {
  const rv = state.room.public_round?.reveal;
  const me = state.me!.player;
  const mine = rv?.results.find((r) => r.playerId === me.id);
  const ok = !!(mine?.foundTitle || mine?.foundArtist);
  useEffect(() => {
    if (ok) burst(0.8);
  }, [ok]);
  if (!rv) return <Center><Equalizer bars={8} height={40} className="w-32" /></Center>;
  return (
    <Center>
      {rv.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rv.coverUrl}
          alt=""
          onError={(e) => (e.currentTarget.style.display = "none")}
          className="h-40 w-40 rounded-3xl object-cover shadow-[0_0_50px_rgba(255,43,214,0.4)]"
        />
      )}
      <p className="font-display mt-5 text-2xl font-black text-neon">{rv.title}</p>
      <p className="text-lg font-bold">{rv.artist}</p>
      <div className={`font-display mt-8 rounded-3xl px-8 py-5 text-3xl font-black ${ok ? "bg-lime text-[#0b1200] glow-lime" : "bg-surface text-muted"}`}>
        {ok ? `+${mine!.points}` : "0 pt"}
      </div>
      <p className="mt-3 text-muted">
        {mine?.awarded ? "✋ Accordé par l'animateur !" : ok ? (mine?.hint ? "Bien joué avec le joker 💡" : "Bien joué !") : "La prochaine sera la bonne 💪"}
      </p>
    </Center>
  );
}

function MyFinal({ state, rank }: { state: RoomState; rank: number }) {
  const me = state.me!.player;
  const stats = state.room.final_stats?.perPlayer[me.id];
  useEffect(() => {
    if (rank === 1) burst(1.5);
  }, [rank]);
  return (
    <Center>
      <div className="text-6xl">{rank === 1 ? "👑" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🎧"}</div>
      <p className="font-display mt-3 text-sm font-bold uppercase tracking-[0.3em] text-muted">Partie terminée</p>
      <p className="font-display mt-2 text-7xl font-black text-neon">{ordinal(rank)}</p>
      <p className="mt-2 text-xl font-bold">{me.score} points</p>
      {stats && (
        <div className="mt-8 grid w-full grid-cols-2 gap-3">
          <div className="glass rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted">Trouvés</div>
            <div className="font-display text-2xl font-black text-lime">
              {stats.correct}/{state.room.final_stats!.rounds}
            </div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted">Plus rapide</div>
            <div className="font-display text-2xl font-black text-cyan">{stats.best != null ? `${(stats.best / 1000).toFixed(1)} s` : "—"}</div>
          </div>
        </div>
      )}
      <p className="mt-8 text-muted">Si l&apos;animateur relance, tu resteras dans la partie 🔁</p>
    </Center>
  );
}
