/**
 * Architecture modulaire des sources audio.
 *
 * Un fournisseur sait (1) chercher des morceaux et (2) produire, au moment de jouer,
 * une URL d'extrait lisible par un <audio> HTML5. Le jeu ne connaît que cette interface :
 * on peut ajouter Spotify, YouTube, un serveur perso… sans toucher au moteur de partie.
 */
export type ProviderId = "deezer" | "upload";

export type TrackCandidate = {
  provider: ProviderId;
  /** identifiant propre au fournisseur (id Deezer, chemin de stockage…) */
  ref: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string | null;
  /** durée de l'extrait disponible, en secondes */
  previewLength?: number;
};

export type PlayableAudio = {
  url: string;
  /** seconde de début dans le fichier */
  startAt: number;
  /** durée maximale disponible à partir de startAt (secondes) */
  maxDuration: number;
};

export interface AudioProvider {
  id: ProviderId;
  label: string;
  search?(query: string, limit?: number): Promise<TrackCandidate[]>;
  /** URL fraîche (les liens d'extraits expirent) */
  resolvePlayable(ref: string, startAt: number): Promise<PlayableAudio | null>;
}
