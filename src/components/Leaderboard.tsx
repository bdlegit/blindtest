"use client";
import { AnimatePresence, motion } from "motion/react";
import { rankPlayers, type Player } from "@/lib/game";
import { PlayerAvatar } from "./PlayerAvatar";

/** Classement animé : les lignes glissent quand l'ordre change. */
export function Leaderboard({
  players,
  online,
  highlight,
  showDelta = false,
  limit,
  compact = false,
  onKick,
}: {
  players: Player[];
  online?: Set<string> | null;
  highlight?: string;
  showDelta?: boolean;
  limit?: number;
  compact?: boolean;
  onKick?: (p: Player) => void;
}) {
  const ranked = rankPlayers(players).slice(0, limit);
  return (
    <ol className={`flex flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
      <AnimatePresence initial={false}>
        {ranked.map((p, i) => (
          <motion.li
            layout
            key={p.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={`group flex items-center gap-3 rounded-2xl px-3 ${compact ? "py-1.5" : "py-2.5"} ${
              p.id === highlight ? "bg-pink/15 ring-1 ring-pink/60" : i === 0 && p.score > 0 ? "bg-amber/10 ring-1 ring-amber/30" : "bg-surface"
            }`}
          >
            <span
              className={`font-display w-7 text-center font-black ${compact ? "text-sm" : "text-lg"} ${
                i === 0 ? "text-amber" : i === 1 ? "text-[#d9e3f0]" : i === 2 ? "text-[#ff9f5a]" : "text-muted"
              }`}
            >
              {i + 1}
            </span>
            <PlayerAvatar avatar={p.avatar} color={p.color} size={compact ? 30 : 38} dim={online ? !online.has(p.id) : false} />
            <span className={`min-w-0 flex-1 truncate font-bold ${compact ? "text-sm" : "text-base"}`}>{p.nickname}</span>
            {showDelta && p.last_round_points > 0 && (
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-display text-xs font-bold text-lime"
              >
                +{p.last_round_points}
              </motion.span>
            )}
            <motion.span
              key={p.score}
              initial={{ scale: 1.4, color: "#b6ff3b" }}
              animate={{ scale: 1, color: "#f6f2ff" }}
              transition={{ duration: 0.6 }}
              className={`font-display tabular-nums font-bold ${compact ? "text-sm" : "text-lg"}`}
            >
              {p.score}
            </motion.span>
            {onKick && (
              <button
                onClick={() => onKick(p)}
                className="ml-1 rounded-lg px-2 py-1 text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:bg-red/20 hover:text-red focus:opacity-100"
                title={`Exclure ${p.nickname}`}
              >
                ✕
              </button>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
