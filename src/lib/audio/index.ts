import "server-only";
import { deezer } from "./deezer";
import { upload } from "./upload";
import type { AudioProvider, ProviderId } from "./types";

const providers: Record<ProviderId, AudioProvider> = { deezer, upload };

export function getProvider(id: string): AudioProvider {
  const p = providers[id as ProviderId];
  if (!p) throw new Error(`Fournisseur audio inconnu : ${id}`);
  return p;
}
