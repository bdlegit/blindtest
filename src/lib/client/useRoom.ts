"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RoomState } from "../game";
import { api, ApiError } from "./api";
import { browserSupabase } from "./supabase";

/**
 * État d'une salle, synchronisé en temps réel.
 * - Supabase Realtime prévient de chaque changement → on relit l'état (source de vérité serveur)
 * - filet de sécurité : relecture périodique (plus fréquente si le temps réel est coupé)
 * - estimation du décalage d'horloge avec le serveur pour des chronos synchronisés
 */
export function useRoom(code: string, opts: { playerToken?: string | null; presence?: { key: string; data: Record<string, unknown> } } = {}) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [live, setLive] = useState(false);
  const [online, setOnline] = useState<Set<string> | null>(null);
  const offsetRef = useRef<{ offset: number; rtt: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const tokenRef = useRef(opts.playerToken);
  useEffect(() => {
    tokenRef.current = opts.playerToken;
  }, [opts.playerToken]);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async (): Promise<void> => {
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const run = async () => {
      const t0 = Date.now();
      try {
        const s = await api.state(code, tokenRef.current);
        const t1 = Date.now();
        const rtt = t1 - t0;
        const sample = s.serverNow - (t0 + t1) / 2;
        const prev = offsetRef.current;
        // on garde l'échantillon le plus fiable (aller-retour le plus court), réactualisé de temps en temps
        if (!prev || rtt <= prev.rtt * 1.2) {
          offsetRef.current = { offset: sample, rtt };
          setOffset(sample);
        } else {
          offsetRef.current = { offset: prev.offset, rtt: prev.rtt * 1.05 };
        }
        setState((old) => (old && old.room.version > s.room.version && !s.me ? old : s));
        setError(null);
      } catch (e) {
        if (e instanceof ApiError) setError(e);
      }
    };
    inflight.current = run().finally(() => {
      inflight.current = null;
      if (again.current) {
        again.current = false;
        void refreshRef.current();
      }
    });
    return inflight.current;
  }, [code]);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const roomId = state?.room.id;

  // premier chargement
  useEffect(() => {
    void refresh();
  }, [refresh, opts.playerToken]);

  // temps réel
  useEffect(() => {
    const sb = browserSupabase();
    if (!sb || !roomId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poke = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void refresh();
      }, 80);
    };
    const channel: RealtimeChannel = sb
      .channel(`room-db-${roomId}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, poke)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, poke)
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") poke();
      });
    return () => {
      if (timer) clearTimeout(timer);
      setLive(false);
      void sb.removeChannel(channel);
    };
  }, [roomId, refresh]);

  // présence (qui est connecté)
  const presenceKey = opts.presence?.key;
  const presenceData = JSON.stringify(opts.presence?.data ?? {});
  useEffect(() => {
    const sb = browserSupabase();
    if (!sb || !roomId) return;
    const channel = sb.channel(`presence-${roomId}`, { config: { presence: { key: presenceKey ?? `screen-${Math.random()}` } } });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && presenceKey) await channel.track(JSON.parse(presenceData));
      });
    return () => {
      void sb.removeChannel(channel);
    };
  }, [roomId, presenceKey, presenceData]);

  // relecture de secours
  useEffect(() => {
    const every = live ? 12000 : 2000;
    const id = setInterval(() => void refresh(), every);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [live, refresh]);

  return { state, setState, error, refresh, offset, live, online };
}

/** Horloge « serveur » qui se met à jour plusieurs fois par seconde. */
export function useServerNow(offset: number, hz = 10) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 1000 / hz);
    return () => clearInterval(id);
  }, [offset, hz]);
  return now;
}

/** Temps restant (ms) d'une phase, en tenant compte de la pause. */
export function remainingMs(endsAt: string | null, pausedAt: string | null, now: number) {
  if (!endsAt) return 0;
  const end = new Date(endsAt).getTime();
  const ref = pausedAt ? new Date(pausedAt).getTime() : now;
  return Math.max(0, end - ref);
}
