"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { NeonBackground } from "@/components/NeonBackground";
import { Logo } from "@/components/Logo";
import { Equalizer } from "@/components/Equalizer";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { api } from "@/lib/client/api";

type Recent = Awaited<ReturnType<typeof api.recent>>["games"];

const STEPS = [
  { icon: "📺", title: "La télé mixe", text: "Crée la partie sur l'écran du salon : c'est lui qui joue les extraits et affiche les scores." },
  { icon: "📱", title: "Les téléphones buzzent", text: "Chacun scanne le QR code, choisit un pseudo et tape ses réponses en secret." },
  { icon: "🏆", title: "Le plus rapide gagne", text: "Titre, artiste, bonus de rapidité : le classement s'emballe à chaque manche." },
];

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

export default function Home() {
  const [recent, setRecent] = useState<Recent | null>(null);
  useEffect(() => {
    api.recent().then((r) => setRecent(r.games)).catch(() => setRecent([]));
  }, []);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-8">
      <NeonBackground />
      <header className="flex items-center justify-between">
        <Logo size="sm" />
        <Link href="/library" className="glass rounded-full px-4 py-2 text-sm font-semibold text-muted transition hover:text-ink">
          🎚️ Ma bibliothèque
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-20">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <Logo size="xl" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 max-w-xl text-balance text-lg text-muted sm:text-xl"
        >
          Le blind test des soirées entre potes. <span className="text-ink">La télé envoie le son</span>, vos{" "}
          <span className="text-ink">téléphones servent de buzzer</span>.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-10 flex w-full max-w-md flex-col gap-4 sm:max-w-none sm:flex-row sm:justify-center"
        >
          <Link
            href="/create"
            className="font-display group relative inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-pink to-[#ff5ee6] px-9 py-5 text-lg font-bold uppercase tracking-wide text-white glow-pink transition hover:scale-[1.03] active:scale-95 sm:text-xl"
          >
            <span className="pulse-ring absolute inset-0 rounded-2xl ring-2 ring-pink/60" />
            📺 Créer une partie
          </Link>
          <Link
            href="/join"
            className="font-display inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-cyan to-[#62f0ff] px-9 py-5 text-lg font-bold uppercase tracking-wide text-[#05121a] glow-cyan transition hover:scale-[1.03] active:scale-95 sm:text-xl"
          >
            📱 Rejoindre
          </Link>
        </motion.div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-3xl p-6"
          >
            <div className="text-4xl">{s.icon}</div>
            <h3 className="font-display mt-4 text-lg font-bold">
              <span className="text-pink">0{i + 1}.</span> {s.title}
            </h3>
            <p className="mt-2 text-muted">{s.text}</p>
          </motion.div>
        ))}
      </section>

      <section className="mt-14">
        <div className="mb-4 flex items-center gap-3">
          <Equalizer bars={4} height={18} className="w-5" />
          <h2 className="font-display text-xl font-bold uppercase tracking-wide">Dernières parties</h2>
        </div>
        {recent === null ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass shimmer h-28 rounded-3xl" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="glass rounded-3xl p-6 text-muted">Aucune partie pour l&apos;instant. Lance la première de la soirée !</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {recent.map((g) => {
              const winner = g.podium[0];
              return (
                <div key={g.id} className="glass flex flex-col gap-3 rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="truncate font-bold">{g.room_name}</h3>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(g.finished_at)}</span>
                  </div>
                  {winner && (
                    <div className="flex items-center gap-3">
                      <PlayerAvatar avatar={winner.avatar} color={winner.color} size={40} ring />
                      <div className="min-w-0">
                        <div className="truncate font-bold">👑 {winner.nickname}</div>
                        <div className="text-sm text-muted">{winner.score} pts</div>
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-muted">
                    {g.player_count} joueur{g.player_count > 1 ? "s" : ""} · {g.rounds} manches
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
