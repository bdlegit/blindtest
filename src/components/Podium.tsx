"use client";
import { motion } from "motion/react";
import { rankPlayers, type Player } from "@/lib/game";
import { PlayerAvatar } from "./PlayerAvatar";

const STEPS = [
  { place: 2, h: "h-28 sm:h-36", color: "#d9e3f0", delay: 0.25 },
  { place: 1, h: "h-40 sm:h-52", color: "#ffd400", delay: 0.5 },
  { place: 3, h: "h-20 sm:h-28", color: "#ff9f5a", delay: 0 },
];

export function Podium({ players, big = false }: { players: Player[]; big?: boolean }) {
  const ranked = rankPlayers(players);
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-5">
      {STEPS.map(({ place, h, color, delay }) => {
        const p = ranked[place - 1];
        return (
          <div key={place} className="flex w-28 flex-col items-center sm:w-40">
            {p ? (
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: delay + 0.4, type: "spring", stiffness: 260, damping: 18 }}
                className="mb-3 flex flex-col items-center gap-2"
              >
                {place === 1 && <span className="text-3xl sm:text-4xl">👑</span>}
                <PlayerAvatar avatar={p.avatar} color={p.color} size={big ? (place === 1 ? 96 : 72) : place === 1 ? 72 : 56} ring={place === 1} />
                <span className="max-w-full truncate text-center font-bold sm:text-lg">{p.nickname}</span>
                <span className="font-display text-lg font-black sm:text-2xl" style={{ color }}>
                  {p.score}
                </span>
              </motion.div>
            ) : (
              <div className="mb-3 h-10" />
            )}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay, duration: 0.6, ease: [0.2, 0.9, 0.3, 1.2] }}
              style={{
                transformOrigin: "bottom",
                background: `linear-gradient(to bottom, ${color}55, ${color}10)`,
                boxShadow: `0 0 0 1px ${color}88, 0 0 30px ${color}44`,
              }}
              className={`${h} flex w-full items-start justify-center rounded-t-2xl pt-3`}
            >
              <span className="font-display text-3xl font-black sm:text-5xl" style={{ color }}>
                {place}
              </span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
