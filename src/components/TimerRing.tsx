"use client";

/** Chronomètre circulaire néon. */
export function TimerRing({
  remaining,
  total,
  size = 220,
  paused = false,
}: {
  remaining: number;
  total: number;
  size?: number;
  paused?: boolean;
}) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const secs = Math.ceil(remaining / 1000);
  const urgent = secs <= 5 && remaining > 0;
  const color = urgent ? "var(--red)" : ratio < 0.5 ? "var(--amber)" : "var(--cyan)";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible" style={{ filter: `drop-shadow(0 0 10px ${color})` }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={10} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-display font-black tabular-nums ${urgent ? "text-red" : "text-ink"}`}
          style={{ fontSize: size * 0.3, textShadow: `0 0 24px ${color}` }}
        >
          {paused ? "❚❚" : secs}
        </span>
      </div>
    </div>
  );
}
