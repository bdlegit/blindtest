/** Fond de « club » animé : halos de couleur, sol quadrillé néon et grain. */
export function NeonBackground({ intensity = 1, grid = true }: { intensity?: number; grid?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <div className="absolute inset-0" style={{ opacity: intensity }}>
        <div className="blob-a absolute -left-1/4 -top-1/4 h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(circle,rgba(255,43,214,0.28),transparent_60%)] blur-3xl" />
        <div className="blob-b absolute -right-1/4 top-0 h-[65vmax] w-[65vmax] rounded-full bg-[radial-gradient(circle,rgba(0,229,255,0.2),transparent_60%)] blur-3xl" />
        <div className="blob-c absolute bottom-[-30%] left-1/4 h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(circle,rgba(123,44,255,0.3),transparent_60%)] blur-3xl" />
      </div>
      {grid && (
        <div className="absolute inset-x-[-50%] bottom-[-10%] h-[55%] opacity-40">
          <div className="neon-grid h-full w-full" />
        </div>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(7,5,13,0.85)_100%)]" />
      <div className="grain absolute inset-0" />
    </div>
  );
}
