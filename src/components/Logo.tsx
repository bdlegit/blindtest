import { Equalizer } from "./Equalizer";

/** Logo BLIND TEST PARTY : wordmark néon + égaliseur. */
export function Logo({ size = "lg", animated = true }: { size?: "sm" | "md" | "lg" | "xl"; animated?: boolean }) {
  const scale = { sm: "text-lg", md: "text-3xl", lg: "text-5xl sm:text-6xl", xl: "text-6xl sm:text-8xl" }[size];
  const eqH = { sm: 16, md: 26, lg: 44, xl: 64 }[size];
  return (
    <div className="inline-flex select-none flex-col items-center leading-none">
      <div className="flex items-end gap-3">
        <Equalizer bars={5} height={eqH} active={animated} className="w-[0.9em] text-current" />
        <span className={`font-display font-black uppercase ${scale} text-neon flicker`}>Blind Test</span>
      </div>
      <span
        className={`font-display font-black uppercase tracking-[0.5em] text-ink ${
          { sm: "mt-1 text-[0.6rem]", md: "mt-2 text-sm", lg: "mt-3 text-xl sm:text-2xl", xl: "mt-4 text-2xl sm:text-4xl" }[size]
        }`}
        style={{ textShadow: "0 0 18px rgba(255,255,255,0.35)" }}
      >
        Party
      </span>
    </div>
  );
}
