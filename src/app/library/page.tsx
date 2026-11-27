"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { NeonBackground } from "@/components/NeonBackground";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { api, ApiError, type LibraryTrack } from "@/lib/client/api";
import { browserSupabase } from "@/lib/client/supabase";
import { libraryKey, save } from "@/lib/client/storage";

type Pl = { id: string; name: string; count: number };

export default function LibraryPage() {
  const [playlists, setPlaylists] = useState<Pl[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await api.playlists();
      setPlaylists(r.playlists);
      setNeedPassword(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedPassword(true);
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (needPassword) return <PasswordGate onDone={reload} />;

  return (
    <main className="relative mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-8">
      <NeonBackground intensity={0.5} grid={false} />
      <header className="mb-8 flex items-center justify-between">
        <Link href="/">
          <Logo size="sm" />
        </Link>
        <Link href="/create" className="text-sm font-semibold text-cyan hover:underline">
          Créer une partie →
        </Link>
      </header>
      <h1 className="font-display text-3xl font-black uppercase sm:text-5xl">
        Ma <span className="text-neon">bibliothèque</span>
      </h1>
      <p className="mb-8 mt-2 max-w-2xl text-muted">
        Compose tes propres playlists de blind test : cherche des extraits Deezer ou importe tes fichiers audio, puis choisis le moment où
        l&apos;extrait commence et sa durée.
      </p>
      {error && <p className="mb-4 rounded-2xl bg-red/15 p-3 text-red">{error}</p>}

      {current ? (
        <PlaylistEditor
          id={current}
          onBack={() => {
            setCurrent(null);
            void reload();
          }}
        />
      ) : (
        <>
          <form
            className="glass mb-6 flex flex-col gap-3 rounded-3xl p-5 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              try {
                const r = await api.createPlaylist(newName);
                setNewName("");
                setCurrent(r.playlist.id);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom de la nouvelle playlist (ex. Soirée 2000 de Max)"
              className="flex-1 rounded-2xl border border-line bg-black/30 px-4 py-3 outline-none focus:border-pink"
            />
            <Button type="submit" disabled={!newName.trim()}>
              + Créer
            </Button>
          </form>
          <div className="grid gap-3 sm:grid-cols-2">
            {playlists === null
              ? [0, 1].map((i) => <div key={i} className="shimmer h-20 rounded-3xl bg-surface" />)
              : playlists.map((p) => (
                  <button key={p.id} onClick={() => setCurrent(p.id)} className="glass flex items-center justify-between rounded-3xl p-5 text-left hover:bg-surface-2">
                    <span className="font-display font-bold">🎚️ {p.name}</span>
                    <span className="text-sm text-muted">{p.count} titres →</span>
                  </button>
                ))}
            {playlists?.length === 0 && <p className="text-muted">Aucune playlist pour l&apos;instant.</p>}
          </div>
        </>
      )}
    </main>
  );
}

function PasswordGate({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <NeonBackground />
      <Logo size="md" />
      <form
        className="glass flex w-full max-w-sm flex-col gap-4 rounded-3xl p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save(libraryKey, pw);
          onDone();
        }}
      >
        <h1 className="font-display text-xl font-bold">🔒 Bibliothèque protégée</h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Mot de passe"
          className="rounded-2xl border border-line bg-black/30 px-4 py-3 outline-none focus:border-pink"
        />
        <Button type="submit">Entrer</Button>
      </form>
    </main>
  );
}

function PlaylistEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const [name, setName] = useState("");
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [tab, setTab] = useState<"deezer" | "upload">("deezer");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api.playlist(id);
    setName(r.playlist.name);
    setTracks(r.tracks);
  }, [id]);
  useEffect(() => {
    reload().catch((e) => setError((e as Error).message));
  }, [reload]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-muted hover:text-ink">
          ← Mes playlists
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Supprimer la playlist « ${name} » ?`)) return;
            await api.deletePlaylist(id);
            onBack();
          }}
          className="text-sm text-red/80 hover:text-red"
        >
          Supprimer la playlist
        </button>
      </div>
      <h2 className="font-display text-2xl font-black">🎚️ {name}</h2>
      {error && <p className="rounded-2xl bg-red/15 p-3 text-red">{error}</p>}

      <section className="glass rounded-3xl p-5">
        <div className="mb-4 flex rounded-full bg-black/40 p-1 text-sm sm:w-fit">
          {(["deezer", "upload"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-4 py-1.5 font-semibold transition sm:flex-none ${tab === t ? "bg-ink text-bg" : "text-muted"}`}
            >
              {t === "deezer" ? "🔎 Chercher (Deezer)" : "⬆️ Importer un fichier"}
            </button>
          ))}
        </div>
        {tab === "deezer" ? <DeezerSearch playlistId={id} onAdded={reload} /> : <UploadForm playlistId={id} onAdded={reload} />}
      </section>

      <section>
        <h3 className="font-display mb-3 font-bold uppercase tracking-wider text-muted">{tracks.length} titres</h3>
        <div className="flex flex-col gap-2">
          {tracks.map((t) => (
            <TrackRow key={t.id} track={t} onChange={reload} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DeezerSearch({ playlistId, onAdded }: { playlistId: string; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.searchDeezer>>["results"]>([]);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setBusy(true);
          try {
            setResults((await api.searchDeezer(q)).results);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artiste, titre…"
          className="flex-1 rounded-2xl border border-line bg-black/30 px-4 py-3 outline-none focus:border-cyan"
        />
        <Button type="submit" variant="cyan" disabled={busy}>
          {busy ? "…" : "Chercher"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col gap-2">
        {results.map((r) => (
          <div key={r.ref} className="flex items-center gap-3 rounded-2xl bg-surface p-2 pr-3">
            {r.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.coverUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-surface-2" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{r.title}</div>
              <div className="truncate text-sm text-muted">{r.artist}</div>
            </div>
            <Button
              size="sm"
              variant={added.has(r.ref) ? "ghost" : "pink"}
              disabled={added.has(r.ref)}
              onClick={async () => {
                await api.addTrack({ playlistId, provider: "deezer", ref: r.ref, title: r.title, artist: r.artist, coverUrl: r.coverUrl, duration: 25 });
                setAdded((s) => new Set(s).add(r.ref));
                onAdded();
              }}
            >
              {added.has(r.ref) ? "✓ Ajouté" : "+ Ajouter"}
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Deezer fournit des extraits officiels de 30 secondes.</p>
    </div>
  );
}

function guessFromFilename(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ").replace(/^\d+[\s.-]+/, "");
  const [a, ...rest] = base.split(" - ");
  return rest.length ? { artist: a.trim(), title: rest.join(" - ").trim() } : { artist: "", title: base.trim() };
}

function UploadForm({ playlistId, onAdded }: { playlistId: string; onAdded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [aliases, setAliases] = useState("");
  const [category, setCategory] = useState("");
  const [startAt, setStartAt] = useState(0);
  const [duration, setDuration] = useState(20);
  const [fileDuration, setFileDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    const g = guessFromFilename(file.name);
    setTitle((t) => t || g.title);
    setArtist((a) => a || g.artist);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const sb = browserSupabase();
      if (!sb) throw new Error("Supabase n'est pas configuré");
      const { path, token } = await api.uploadUrl(file.name);
      const { error } = await sb.storage.from("library").uploadToSignedUrl(path, token, file, { contentType: file.type || "audio/mpeg" });
      if (error) throw new Error(error.message);
      await api.addTrack({
        playlistId,
        provider: "upload",
        ref: path,
        title,
        artist,
        artistAliases: aliases,
        category,
        startAt,
        duration,
      });
      setMsg(`✓ « ${title} » ajouté`);
      setFile(null);
      setTitle("");
      setArtist("");
      setAliases("");
      setStartAt(0);
      setPreview(null);
      onAdded();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-6 text-center hover:border-pink">
        <span className="text-3xl">🎵</span>
        <span className="font-semibold">{file ? file.name : "Choisir un fichier audio (MP3, M4A, OGG, WAV…)"}</span>
        <span className="text-xs text-muted">25 Mo maximum</span>
        <input type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {file && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre *" className="rounded-2xl border border-line bg-black/30 px-4 py-3 outline-none focus:border-pink" />
            <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artiste *" className="rounded-2xl border border-line bg-black/30 px-4 py-3 outline-none focus:border-pink" />
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Autres noms acceptés (séparés par des virgules)" className="rounded-2xl border border-line bg-black/30 px-4 py-3 outline-none focus:border-pink" />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Catégorie (ex. Années 80)" className="rounded-2xl border border-line bg-black/30 px-4 py-3 outline-none focus:border-pink" />
          </div>
          {preview && (
            <audio ref={audioRef} src={preview} controls className="w-full" onLoadedMetadata={(e) => setFileDuration(e.currentTarget.duration || 0)} />
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <label>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-muted">Début de l&apos;extrait</span>
                <span className="font-bold">{fmt(startAt)}</span>
              </div>
              <input type="range" min={0} max={Math.max(0, Math.floor(fileDuration - 5))} value={startAt} onChange={(e) => setStartAt(Number(e.target.value))} className="w-full" />
              <button
                type="button"
                className="mt-1 text-xs text-cyan hover:underline"
                onClick={() => {
                  if (audioRef.current) setStartAt(Math.floor(audioRef.current.currentTime));
                }}
              >
                Utiliser la position du lecteur
              </button>
            </label>
            <label>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-muted">Durée de diffusion</span>
                <span className="font-bold">{duration} s</span>
              </div>
              <input type="range" min={5} max={30} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full" />
            </label>
          </div>
          <Button onClick={upload} disabled={busy || !title.trim() || !artist.trim()}>
            {busy ? "Envoi…" : "⬆️ Ajouter à la playlist"}
          </Button>
        </>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function TrackRow({ track, onChange }: { track: LibraryTrack; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [startAt, setStartAt] = useState(Number(track.start_at));
  const [duration, setDuration] = useState(Number(track.duration));
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center gap-3">
        {track.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.cover_url} alt="" className="h-11 w-11 rounded-xl object-cover" />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2">🎵</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{track.title}</div>
          <div className="truncate text-sm text-muted">
            {track.artist} · {track.provider === "deezer" ? "Deezer" : "Fichier"} · {fmt(Number(track.start_at))} → {track.duration} s
          </div>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg px-2 py-1 text-sm text-muted hover:text-ink">
          ✎
        </button>
        <button
          onClick={async () => {
            await api.deleteTrack(track.id);
            onChange();
          }}
          className="rounded-lg px-2 py-1 text-sm text-muted hover:text-red"
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted">Début</span>
              <span className="font-bold">{fmt(startAt)}</span>
            </div>
            <input type="range" min={0} max={track.provider === "deezer" ? 25 : 600} value={startAt} onChange={(e) => setStartAt(Number(e.target.value))} className="w-full" />
          </label>
          <label>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-muted">Durée</span>
              <span className="font-bold">{duration} s</span>
            </div>
            <input type="range" min={5} max={30} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full" />
          </label>
          <Button
            size="sm"
            onClick={async () => {
              await api.updateTrack({ id: track.id, startAt, duration });
              setOpen(false);
              onChange();
            }}
          >
            Enregistrer
          </Button>
        </div>
      )}
    </div>
  );
}
