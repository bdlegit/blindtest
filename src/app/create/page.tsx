"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NeonBackground } from "@/components/NeonBackground";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { Equalizer } from "@/components/Equalizer";
import { api } from "@/lib/client/api";
import { hostKey, save } from "@/lib/client/storage";
import { DEFAULT_SETTINGS, LIMITS, type GameSettings } from "@/lib/game";

type Cat = Awaited<ReturnType<typeof api.categories>>["categories"][number];
type Pl = { id: string; name: string; count: number };

const MODES = [
  { id: "classic", label: "Classique", desc: "Trouve le titre et l'artiste", icon: "🎵", ready: true },
  { id: "speed", label: "Rapidité", desc: "Le premier rafle le jackpot", icon: "⚡", ready: false },
  { id: "teams", label: "Équipes", desc: "Les scores par équipe", icon: "🤝", ready: false },
  { id: "survival", label: "Survie", desc: "Chaque erreur coûte cher", icon: "💀", ready: false },
];

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold uppercase tracking-wider sm:text-lg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-muted">{label}</span>
        <span className="font-display text-xl font-bold">
          {value}
          {unit && <span className="ml-1 text-sm text-muted">{unit}</span>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 text-left">
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? "bg-pink glow-pink" : "bg-surface-2"}`}>
        <motion.span
          layout
          className="absolute top-1 h-6 w-6 rounded-full bg-white"
          style={{ left: on ? "calc(100% - 1.75rem)" : "0.25rem" }}
        />
      </span>
    </button>
  );
}

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [cats, setCats] = useState<Cat[]>([]);
  const [selected, setSelected] = useState<string[]>(["hits"]);
  const [sourceType, setSourceType] = useState<"themes" | "playlist">("themes");
  const [playlists, setPlaylists] = useState<Pl[] | null>(null);
  const [playlistId, setPlaylistId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.categories().then((r) => setCats(r.categories)).catch(() => setError("Impossible de charger les catégories"));
    api
      .playlists()
      .then((r) => {
        setPlaylists(r.playlists);
        if (r.playlists[0]) setPlaylistId(r.playlists[0].id);
      })
      .catch(() => setPlaylists([]));
  }, []);

  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const toggleCat = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const canCreate = sourceType === "themes" ? selected.length > 0 : !!playlistId;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const source: GameSettings["source"] =
        sourceType === "themes" ? { type: "themes", categories: selected } : { type: "playlist", playlistId };
      const res = await api.create(name.trim() || "Soirée Blind Test", { ...settings, source });
      save(hostKey(res.code), res.hostToken);
      router.push(`/tv/${res.code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto max-w-5xl px-4 pb-40 pt-6 sm:px-8">
      <NeonBackground intensity={0.7} grid={false} />
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" aria-label="Accueil">
          <Logo size="sm" />
        </Link>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Retour
        </Link>
      </header>

      <h1 className="font-display mb-2 text-3xl font-black uppercase sm:text-5xl">
        Nouvelle <span className="text-neon">partie</span>
      </h1>
      <p className="mb-8 text-muted">Ouvre cette page sur l&apos;écran que tout le monde regarde : c&apos;est lui qui jouera la musique.</p>

      <div className="flex flex-col gap-5">
        <Section title="Nom de la soirée">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Soirée Blind Test"
            className="font-display w-full rounded-2xl border border-line bg-black/30 px-5 py-4 text-xl font-bold outline-none placeholder:text-muted/50 focus:border-pink focus:glow-pink"
          />
        </Section>

        <Section title="Mode de jeu">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MODES.map((m) => (
              <button
                key={m.id}
                disabled={!m.ready}
                className={`relative rounded-2xl p-4 text-left transition ${
                  m.ready ? "bg-pink/15 ring-2 ring-pink glow-pink" : "cursor-not-allowed bg-surface opacity-50"
                }`}
              >
                <div className="text-2xl">{m.icon}</div>
                <div className="font-display mt-2 font-bold">{m.label}</div>
                <div className="text-xs text-muted">{m.desc}</div>
                {!m.ready && (
                  <span className="absolute right-3 top-3 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Bientôt
                  </span>
                )}
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="La musique"
          aside={
            <div className="flex rounded-full bg-black/40 p-1 text-sm">
              {(["themes", "playlist"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSourceType(t)}
                  className={`rounded-full px-4 py-1.5 font-semibold transition ${sourceType === t ? "bg-ink text-bg" : "text-muted"}`}
                >
                  {t === "themes" ? "Catégories" : "Ma playlist"}
                </button>
              ))}
            </div>
          }
        >
          <AnimatePresence mode="wait">
            {sourceType === "themes" ? (
              <motion.div key="themes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="mb-4 text-sm text-muted">
                  Choisis une ou plusieurs catégories : les extraits seront tirés au hasard et mélangés.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {cats.map((c) => {
                    const on = selected.includes(c.id);
                    return (
                      <motion.button
                        key={c.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleCat(c.id)}
                        className="relative overflow-hidden rounded-2xl p-4 text-left transition"
                        style={{
                          background: on
                            ? `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]})`
                            : "rgba(255,255,255,0.04)",
                          boxShadow: on ? `0 0 26px ${c.gradient[0]}66, inset 0 0 0 1px rgba(255,255,255,0.35)` : "inset 0 0 0 1px rgba(255,255,255,0.08)",
                        }}
                      >
                        <div className="text-2xl">{c.emoji}</div>
                        <div className={`mt-2 text-sm font-bold leading-tight ${on ? "text-white" : ""}`}>{c.label}</div>
                        <div className={`text-xs ${on ? "text-white/80" : "text-muted"}`}>{c.approx ? `${c.count}+` : c.count} titres</div>
                        {on && <span className="absolute right-3 top-3 text-sm">✓</span>}
                      </motion.button>
                    );
                  })}
                  {!cats.length && Array.from({ length: 10 }, (_, i) => <div key={i} className="shimmer h-24 rounded-2xl bg-surface" />)}
                </div>
                <div className="mt-4 flex gap-3 text-sm">
                  <button className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setSelected(cats.map((c) => c.id))}>
                    Tout sélectionner
                  </button>
                  <button className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setSelected([])}>
                    Aucune
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="playlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {playlists === null ? (
                  <div className="shimmer h-16 rounded-2xl bg-surface" />
                ) : playlists.length === 0 ? (
                  <div className="rounded-2xl bg-surface p-5 text-muted">
                    Tu n&apos;as pas encore de playlist.{" "}
                    <Link href="/library" className="font-semibold text-cyan hover:underline">
                      Crée-la dans ta bibliothèque →
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {playlists.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPlaylistId(p.id)}
                        className={`flex items-center justify-between rounded-2xl p-4 text-left transition ${
                          playlistId === p.id ? "bg-cyan/15 ring-2 ring-cyan glow-cyan" : "bg-surface"
                        }`}
                      >
                        <span className="font-bold">🎚️ {p.name}</span>
                        <span className="text-sm text-muted">{p.count} titres</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        <Section title="Réglages">
          <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            <Slider label="Nombre de manches" value={settings.rounds} min={LIMITS.rounds[0]} max={LIMITS.rounds[1]} onChange={(v) => set("rounds", v)} />
            <Slider
              label="Temps d'écoute par manche"
              value={settings.roundDuration}
              min={LIMITS.roundDuration[0]}
              max={LIMITS.roundDuration[1]}
              unit="s"
              onChange={(v) => set("roundDuration", v)}
            />
            <Slider label="Points pour le titre" value={settings.pointsTitle} min={10} max={500} step={10} unit="pts" onChange={(v) => set("pointsTitle", v)} />
            <Slider label="Points pour l'artiste" value={settings.pointsArtist} min={10} max={500} step={10} unit="pts" onChange={(v) => set("pointsArtist", v)} />
            <div className="sm:col-span-2">
              <Toggle
                on={settings.speedBonus}
                onChange={(v) => set("speedBonus", v)}
                label="⚡ Bonus de rapidité"
                hint="Jusqu'à +50 % des points pour les réponses les plus rapides"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-3 font-semibold">Façon de répondre</div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { id: "text", label: "⌨️ Saisie libre", hint: "On tape titre et/ou artiste, fautes de frappe tolérées" },
                    { id: "choices", label: "🔢 Choix multiples", hint: "4 propositions, une seule tentative" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => set("answerMode", o.id)}
                    className={`rounded-2xl p-4 text-left transition ${
                      settings.answerMode === o.id ? "bg-violet/25 ring-2 ring-violet" : "bg-surface"
                    }`}
                  >
                    <div className="font-bold">{o.label}</div>
                    <div className="text-xs text-muted">{o.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            {settings.answerMode === "text" && (
              <Slider
                label="Essais par manche"
                value={settings.maxAttempts}
                min={LIMITS.maxAttempts[0]}
                max={LIMITS.maxAttempts[1]}
                onChange={(v) => set("maxAttempts", v)}
              />
            )}
          </div>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/80 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="text-sm text-muted">
            {error ? (
              <span className="text-red">{error}</span>
            ) : sourceType === "themes" ? (
              `${selected.length} catégorie${selected.length > 1 ? "s" : ""} · ${settings.rounds} manches · ${settings.roundDuration} s`
            ) : (
              `${settings.rounds} manches · ${settings.roundDuration} s`
            )}
          </div>
          <Button size="lg" onClick={create} disabled={!canCreate || busy} className="w-full sm:w-auto">
            {busy ? (
              <>
                <Equalizer bars={4} height={18} className="w-5" /> On mixe ta playlist…
              </>
            ) : (
              "Créer la salle →"
            )}
          </Button>
        </div>
      </div>
    </main>
  );
}
