const DELAYS = [0, 0.35, 0.15, 0.55, 0.25, 0.7, 0.05, 0.45, 0.6, 0.2, 0.4, 0.1];
const COLORS = ["var(--pink)", "#ff6ae6", "var(--violet)", "var(--cyan)"];

/** Égaliseur décoratif (pas d'analyse du son : les extraits ne l'autorisent pas en CORS). */
export function Equalizer({
  bars = 12,
  active = true,
  className = "",
  height = 64,
}: {
  bars?: number;
  active?: boolean;
  className?: string;
  height?: number;
}) {
  return (
    <div aria-hidden className={`flex items-end gap-[3px] ${active ? "" : "eq-paused"} ${className}`} style={{ height }}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="eq-bar block flex-1 rounded-full"
          style={{
            height: "100%",
            animationDelay: `${-DELAYS[i % DELAYS.length] * 2}s`,
            animationDuration: `${0.9 + ((i * 37) % 7) / 10}s`,
            background: `linear-gradient(to top, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 1) % COLORS.length]})`,
            boxShadow: `0 0 12px ${COLORS[i % COLORS.length]}`,
            transform: active ? undefined : "scaleY(0.15)",
          }}
        />
      ))}
    </div>
  );
}
