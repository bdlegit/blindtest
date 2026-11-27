"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";

type Loaded = { round: number; url: string; startAt: number; duration: number };

// 0,1 s de silence : sert à « débloquer » l'audio du navigateur lors d'un clic.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/**
 * Lecteur audio de la télé. Un seul élément <audio> réutilisé : une fois débloqué par un
 * clic de l'animateur, il peut ensuite jouer les extraits automatiquement.
 */
export function useHostAudio(code: string, hostToken: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedRef = useRef<Loaded | null>(null);
  const pending = useRef<Map<number, Promise<Loaded | null>>>(new Map());
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playingRound = useRef<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    a.crossOrigin = null;
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    a.onended = () => setPlaying(false);
    audioRef.current = a;
    return () => {
      a.pause();
      a.src = "";
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const fetchTrack = useCallback(
    (round: number) => {
      if (!hostToken) return Promise.resolve(null);
      const existing = pending.current.get(round);
      if (existing) return existing;
      const p = api
        .track(code, hostToken, round)
        .then((t) => {
          setError(null);
          return t as Loaded;
        })
        .catch((e) => {
          pending.current.delete(round);
          setError((e as Error).message);
          return null;
        });
      pending.current.set(round, p);
      return p;
    },
    [code, hostToken],
  );

  /** Précharge l'extrait d'une manche. */
  const prepare = useCallback(
    async (round: number) => {
      const t = await fetchTrack(round);
      const a = audioRef.current;
      if (!t || !a) return null;
      if (loadedRef.current?.round !== round && playingRound.current === null) {
        loadedRef.current = t;
        a.src = t.url;
        a.load();
      }
      return t;
    },
    [fetchTrack],
  );

  const stopFade = () => {
    if (fadeRef.current) clearInterval(fadeRef.current);
    fadeRef.current = null;
  };

  /** Lance l'extrait de la manche, éventuellement en cours de route (reprise après rechargement). */
  const play = useCallback(
    async (round: number, elapsedMs = 0) => {
      const t = await fetchTrack(round);
      const a = audioRef.current;
      if (!t || !a) return;
      stopFade();
      if (loadedRef.current?.round !== round || !a.src) {
        loadedRef.current = t;
        a.src = t.url;
      }
      playingRound.current = round;
      a.volume = 1;
      const seek = () => {
        try {
          a.currentTime = t.startAt + Math.max(0, elapsedMs) / 1000;
        } catch {
          /* ignore */
        }
      };
      if (a.readyState >= 1) seek();
      else a.addEventListener("loadedmetadata", seek, { once: true });
      try {
        await a.play();
        setBlocked(false);
      } catch (e) {
        if ((e as Error).name === "NotAllowedError") setBlocked(true);
      }
    },
    [fetchTrack],
  );

  const pause = useCallback(() => {
    stopFade();
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    const a = audioRef.current;
    if (!a || !a.src || playingRound.current === null) return;
    try {
      await a.play();
      setBlocked(false);
    } catch {
      setBlocked(true);
    }
  }, []);

  /** Baisse le son progressivement puis coupe. */
  const fadeOut = useCallback((ms = 1200) => {
    const a = audioRef.current;
    playingRound.current = null;
    if (!a || a.paused) return;
    stopFade();
    const steps = 20;
    let i = 0;
    const start = a.volume;
    fadeRef.current = setInterval(() => {
      i++;
      a.volume = Math.max(0, start * (1 - i / steps));
      if (i >= steps) {
        stopFade();
        a.pause();
        a.volume = 1;
      }
    }, ms / steps);
  }, []);

  /** À appeler dans un clic : autorise ensuite la lecture automatique. */
  const unlock = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      if (!a.src || a.src === window.location.href) {
        a.src = SILENCE;
        await a.play();
        a.pause();
      } else if (playingRound.current !== null) {
        await a.play();
      } else {
        const prevMuted = a.muted;
        a.muted = true;
        await a.play();
        a.pause();
        a.muted = prevMuted;
      }
      setBlocked(false);
    } catch {
      /* on réessaiera au prochain clic */
    }
  }, []);

  return { prepare, play, pause, resume, fadeOut, unlock, blocked, muted, setMuted, error, playing };
}
