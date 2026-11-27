"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NeonBackground } from "@/components/NeonBackground";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";

const ALPHABET = /[^A-HJ-NP-Z2-9]/g;

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (fromUrl) setCode(fromUrl.toUpperCase().replace(ALPHABET, "").slice(0, 6));
    inputRef.current?.focus();
  }, []);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.length === 6) router.push(`/play/${code}`);
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center px-4 pb-10 pt-8">
      <NeonBackground />
      <Link href="/">
        <Logo size="md" />
      </Link>
      <form onSubmit={submit} className="mt-14 flex w-full max-w-sm flex-col items-center gap-6">
        <h1 className="font-display text-center text-2xl font-black uppercase">
          Code de la <span className="text-neon">salle</span>
        </h1>
        <label className="relative w-full" onClick={() => inputRef.current?.focus()}>
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(ALPHABET, "").slice(0, 6))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Code de la salle"
            className="absolute inset-0 opacity-0"
          />
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className={`font-display flex aspect-[3/4] items-center justify-center rounded-2xl text-3xl font-black transition ${
                  code[i] ? "bg-pink/20 text-ink ring-2 ring-pink glow-pink" : i === code.length ? "bg-surface ring-2 ring-cyan" : "bg-surface ring-1 ring-line"
                }`}
              >
                {code[i] ?? ""}
              </div>
            ))}
          </div>
        </label>
        <p className="text-center text-sm text-muted">Le code est affiché sur la télé. Tu peux aussi scanner le QR code.</p>
        <Button type="submit" size="lg" variant="cyan" disabled={code.length !== 6} className="w-full">
          Entrer →
        </Button>
      </form>
    </main>
  );
}
