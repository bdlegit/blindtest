"use client";
import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { browserSupabase } from "./supabase";

export type ControlMessage = { type: "mute"; muted: boolean } | { type: "mute-state"; muted: boolean } | { type: "hello" };

/**
 * Canal direct télé ↔ télécommande (Supabase Realtime Broadcast) pour ce qui ne passe pas
 * par le serveur : couper / remettre le son de la télé.
 */
export function useControlChannel(roomId: string | undefined, onMessage: (m: ControlMessage) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb || !roomId) return;
    const channel = sb.channel(`control-${roomId}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "control" }, ({ payload }) => handler.current(payload as ControlMessage)).subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.send({ type: "broadcast", event: "control", payload: { type: "hello" } });
    });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void sb.removeChannel(channel);
    };
  }, [roomId]);

  return useCallback((m: ControlMessage) => {
    void channelRef.current?.send({ type: "broadcast", event: "control", payload: m });
  }, []);
}
