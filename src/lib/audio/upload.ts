import "server-only";
import { admin } from "../server/supabase";
import type { AudioProvider } from "./types";

export const LIBRARY_BUCKET = "library";

/** Fichiers importés par l'organisateur, stockés dans Supabase Storage (bucket privé). */
export const upload: AudioProvider = {
  id: "upload",
  label: "Mes fichiers",
  async resolvePlayable(ref, startAt) {
    const { data, error } = await admin().storage.from(LIBRARY_BUCKET).createSignedUrl(ref, 60 * 60 * 3);
    if (error || !data) return null;
    return { url: data.signedUrl, startAt: Math.max(0, startAt), maxDuration: 600 };
  },
};
