"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NeonBackground } from "@/components/NeonBackground";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { Equalizer } from "@/components/Equalizer";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { api } from "@/lib/client/api";
import { hostKey, load, save } from "@/lib/client/storage";
import { remainingMs, useRoom, useServerNow } from "@/lib/client/useRoom";
import { useControlChannel } from "@/lib/client/useControlChannel";
import { rankPlayers, type Phase, type Player } from "@/lib/game";
import type { HostAction } from "@/lib/server/engine";

const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Salle d'attente",
  countdown: "Compte à rebours",
  playing: "Manche en cours",
  reveal: "Révélation",
  scores: "Classement",
  finished: "Partie terminée",
};

/** Télécommande de l'animateur, sur téléphone. */
export default function RemotePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = use(params);
  const code = raw.toUpperCase();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  // le jeton arrive dans le fragment de l'URL (#k=…), jamais envoyé au serveur : on le garde puis on nettoie l'URL
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("k");
    if (fromHash) {
      save(hostKey(code), fromHash);
      window.history.replaceState(null, "", window.location.pathname);
    }
    setToken(fromHash ?? load(hostKey(code)));
  }, [code]);

  if (token === undefined) return <Shell><Equalizer bars={8} height={40} className="mx-auto mt-24 w-32" /></Shell>;
  if (!token) {
    return (
      <Shell>
        <div className="mt-20 text-center">
          <div className="text-5xl">🔒</div>
          <p className="font-display mt-4 text-xl font-bold">Télécommande non autorisée</p>
          <p className="mt-2 text-muted">Scanne le QR code « Télécommande » affiché sur l&apos;écran de l&apos;animateur.</p>
        </div>
      </Shell>
    );
  }
  return <Remote code={code} token={token} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <NeonBackground intensity={0.5} grid={false} />
      {children}
    </main>
  );
}

function Remote({ code, token }: { code: string; token: string }) {
  const { state, setState, error, offset, refresh, online } = useRoom(code);
  const now = useServerNow(offset, 4);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tvMuted, setTvMuted] = useState<boolean | null>(null);

  const send = useControlChannel(state?.room.id, (m) => {
    if (m.type === "mute-state") setTvMuted(m.muted);
  });
  useEffect(() => {
    if (state?.room.id) send({ type: "hello" });
  }, [state?.room.id, send]);

  const act = useCallback(
    async (action: HostAction, label: string) => {
      setBusy(label);
      setMessage(null);
      try {
        setState(await api.host(code, token, action));
      } catch (e) {
        setMessage((e as Error).message);
        void refresh();
      } finally {
        setBusy(null);
      }
    },
    [code, token, setState, refresh],
  );

  const room = state?.room;
  const byId = useMemo(() => new Map((state?.players ?? []).map((p) => [p.id, p])), [state?.players]);

  if (error && !state) {
    return (
      <Shell>
        <p className="mt-20 text-center">{error.message}</p>
      </Shell>
    );
  }
  if (!state || !room) return <Shell><Equalizer bars={8} height={40} className="mx-auto mt-24 w-32" /></Shell>;

  const remaining = Math.ceil(remainingMs(room.phase_ends_at, room.paused_at, now) / 1000);
  const paused = !!room.paused_at;
  const inGame = !["lobby", "finished"].includes(room.phase);
  const rv = room.public_round?.reveal;
  const nextLabel =
    room.phase === "countdown"
      ? "⏭ Démarrer tout de suite"
      : room.phase === "playing"
        ? "⏭ Passer / révéler"
        : room.phase === "reveal"
          ? room.round_index + 1 >= room.total_rounds
            ? "🏁 Résultats finaux"
            : "⏭ Classement"
          : "⏭ Manche suivante";

  return (
    <Shell>
      <header className="mb-5 flex items-center justify-between">
        <Logo size="sm" animated={false} />
        <span className="font-display glass rounded-full px-3 py-1 text-sm font-black tracking-widest">{room.code}</span>
      </header>

      <section className="glass rounded-3xl p-5">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-muted">🎛️ Télécommande · {room.name}</div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="font-display text-2xl font-black">{paused ? "⏸ En pause" : PHASE_LABEL[room.phase]}</div>
            {inGame && (
              <div className="text-sm text-muted">
                Manche {room.round_index + 1}/{room.total_rounds}
                {room.public_round?.categoryLabel ? ` · ${room.public_round.categoryLabel}` : ""}
              </div>
            )}
          </div>
          {inGame && room.phase_ends_at && (
            <div className="font-display text-4xl font-black tabular-nums text-cyan">{remaining}s</div>
          )}
        </div>
        {room.phase === "playing" && (
          <div className="mt-2 text-sm">
            <span className="font-bold text-cyan">{room.answered_count}</span>
            <span className="text-muted"> / {state.players.length} ont répondu</span>
          </div>
        )}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        {room.phase === "lobby" && (
          <Button size="lg" className="col-span-2" disabled={!state.players.length || !!busy} onClick={() => act({ action: "start" }, "start")}>
            ▶ Lancer la partie
          </Button>
        )}
        {inGame && (
          <>
            <Button size="lg" variant={paused ? "lime" : "ghost"} disabled={!!busy} onClick={() => act({ action: paused ? "resume" : "pause" }, "pause")}>
              {paused ? "▶ Reprendre" : "❚❚ Pause"}
            </Button>
            <Button
              size="lg"
              variant="cyan"
              disabled={!!busy}
              onClick={() => act({ action: "advance", phase: room.phase, round: room.round_index, force: true }, "next")}
            >
              {nextLabel}
            </Button>
          </>
        )}
        {room.phase === "finished" && (
          <Button size="lg" className="col-span-2" disabled={!!busy} onClick={() => act({ action: "replay" }, "replay")}>
            🔁 Rejouer avec les mêmes joueurs
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={tvMuted === null}
          onClick={() => {
            const next = !tvMuted;
            send({ type: "mute", muted: next });
            setTvMuted(next);
          }}
        >
          {tvMuted === null ? "🔊 Son…" : tvMuted ? "🔇 Remettre le son" : "🔊 Couper le son"}
        </Button>
        <Link
          href={`/play/${room.code}`}
          target="_blank"
          className="font-display glass inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-bold uppercase tracking-wide"
        >
          🎮 Je joue aussi
        </Link>
      </section>

      {message && <p className="mt-3 rounded-2xl bg-red/15 p-3 text-center text-sm text-red ring-1 ring-red/40">{message}</p>}

      {(room.phase === "reveal" || room.phase === "scores") && rv && (
        <section className="mt-5">
          <h2 className="font-display mb-1 text-sm font-bold uppercase tracking-wider text-muted">Réponses de la manche</h2>
          <p className="mb-3 text-xs text-muted">
            Réponse juste mais refusée ? Accorde les points (sans bonus de rapidité, divisés par deux si joker).
          </p>
          <div className="mb-3 rounded-2xl bg-surface p-3 text-sm">
            <span className="text-muted">Bonne réponse : </span>
            <b>{rv.title}</b> — {rv.artist}
          </div>
          <div className="flex flex-col gap-2">
            {[...rv.results]
              .sort((a, b) => Number(a.foundTitle && a.foundArtist) - Number(b.foundTitle && b.foundArtist))
              .map((r) => {
                const p = byId.get(r.playerId);
                if (!p) return null;
                const full = r.foundTitle && r.foundArtist;
                return (
                  <div key={r.playerId} className={`flex items-center gap-3 rounded-2xl p-3 ${full ? "bg-lime/10" : "bg-surface"}`}>
                    <PlayerAvatar avatar={p.avatar} color={p.color} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate font-bold">
                        {p.nickname} {r.hint && <span className="text-xs">💡</span>}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {r.guess ? `« ${r.guess} »` : "pas de réponse"} · {r.foundTitle ? "✓" : "✗"} titre {r.foundArtist ? "✓" : "✗"} artiste
                      </div>
                    </div>
                    {full ? (
                      <span className="font-display text-sm font-black text-lime">+{r.points}</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="lime"
                        disabled={!!busy}
                        onClick={() => act({ action: "award", playerId: r.playerId, round: room.round_index }, `award-${r.playerId}`)}
                      >
                        {busy === `award-${r.playerId}` ? "…" : "✓ Accorder"}
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-display mb-3 text-sm font-bold uppercase tracking-wider text-muted">Joueurs ({state.players.length})</h2>
        <AnimatePresence initial={false}>
          {rankPlayers(state.players).map((p: Player) => (
            <motion.div key={p.id} layout className="mb-2 flex items-center gap-3 rounded-2xl bg-surface p-2.5">
              <PlayerAvatar avatar={p.avatar} color={p.color} size={32} dim={online ? !online.has(p.id) : false} />
              <span className="min-w-0 flex-1 truncate font-bold">{p.nickname}</span>
              <span className="font-display text-sm font-bold">{p.score}</span>
              <button
                onClick={() => confirm(`Exclure ${p.nickname} ?`) && act({ action: "kick", playerId: p.id }, "kick")}
                className="rounded-lg px-2 py-1 text-sm text-muted hover:text-red"
                aria-label={`Exclure ${p.nickname}`}
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </section>

      {inGame && (
        <button
          onClick={() => confirm("Terminer la partie maintenant ?") && act({ action: "end" }, "end")}
          className="mt-6 rounded-2xl border border-red/40 bg-red/10 py-3 font-bold text-red"
        >
          ■ Terminer la partie
        </button>
      )}
    </Shell>
  );
}
