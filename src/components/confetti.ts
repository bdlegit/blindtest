"use client";
import confetti from "canvas-confetti";

const NEON = ["#ff2bd6", "#00e5ff", "#b6ff3b", "#ffd400", "#7b2cff"];

export function burst(intensity = 1) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti({ particleCount: Math.round(90 * intensity), spread: 80, origin: { y: 0.65 }, colors: NEON, scalar: 1.1 });
}

export function celebrate(durationMs = 3500) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const end = Date.now() + durationMs;
  const frame = () => {
    confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: NEON });
    confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: NEON });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
