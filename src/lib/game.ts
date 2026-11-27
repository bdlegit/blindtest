/** Types et règles partagés entre le serveur, la télé et les téléphones. */

export type Phase = "lobby" | "countdown" | "playing" | "reveal" | "scores" | "finished";

export type AnswerMode = "text" | "choices";

export type GameSource =
  | { type: "themes"; categories: string[] }
  | { type: "playlist"; playlistId: string };

export type GameSettings = {
  mode: "classic";
  rounds: number;
  pointsTitle: number;
  pointsArtist: number;
  speedBonus: boolean;
  answerMode: AnswerMode;
  /** durée d'écoute / de réponse par manche (s) */
  roundDuration: number;
  maxAttempts: number;
  source: GameSource;
};

export const DEFAULT_SETTINGS: GameSettings = {
  mode: "classic",
  rounds: 10,
  pointsTitle: 100,
  pointsArtist: 100,
  speedBonus: true,
  answerMode: "text",
  roundDuration: 25,
  maxAttempts: 5,
  source: { type: "themes", categories: ["hits"] },
};

export const LIMITS = {
  rounds: [3, 30],
  points: [10, 1000],
  roundDuration: [10, 30],
  maxAttempts: [1, 10],
  players: 40,
  nickname: 16,
  guess: 80,
} as const;

/** Durées des phases automatiques (ms). */
export const PHASE_MS = {
  countdown: 4000,
  reveal: 9000,
  scores: 7000,
} as const;

export type Choice = { id: string; label: string };

export type RevealResult = {
  playerId: string;
  foundTitle: boolean;
  foundArtist: boolean;
  points: number;
  ms: number | null;
  guess: string | null;
};

export type PublicRound = {
  index: number;
  category: string | null;
  categoryLabel: string | null;
  workTitle: boolean;
  choices: Choice[] | null;
  reveal?: {
    title: string;
    artist: string;
    coverUrl: string | null;
    correctChoice: string | null;
    results: RevealResult[];
  };
};

export type FinalStats = {
  rounds: number;
  totalCorrect: number;
  successRate: number; // 0..1, manches avec au moins une trouvaille / (joueurs × manches)
  fastest: { playerId: string; nickname: string; ms: number } | null;
  perPlayer: Record<string, { correct: number; rate: number; avgMs: number | null; best: number | null }>;
  hardest: { title: string; artist: string } | null;
};

export type Room = {
  id: string;
  code: string;
  name: string;
  settings: GameSettings;
  phase: Phase;
  round_index: number;
  total_rounds: number;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  paused_at: string | null;
  answered_count: number;
  public_round: PublicRound | null;
  final_stats: FinalStats | null;
  version: number;
  created_at: string;
  finished_at: string | null;
};

export type Player = {
  id: string;
  room_id: string;
  nickname: string;
  avatar: string;
  color: string;
  score: number;
  last_round_points: number;
  correct_count: number;
  kicked: boolean;
  created_at: string;
};

export type MyAnswer = {
  attempts: number;
  foundTitle: boolean;
  foundArtist: boolean;
  points: number;
  choice: string | null;
  done: boolean;
  lastGuess: string | null;
};

export type RoomState = {
  room: Room;
  players: Player[];
  serverNow: number;
  me?: { player: Player; answer: MyAnswer | null } | null;
};

export const AVATARS = ["🎧", "🎤", "🎸", "🥁", "🎹", "🎷", "🎺", "🪩", "🦄", "🐙", "👽", "🤖", "🦊", "🐸", "🔥", "⚡", "💎", "🍕", "🌶️", "👑"];
export const COLORS = ["#ff2bd6", "#00e5ff", "#b6ff3b", "#ffd400", "#ff7a00", "#7b2cff", "#ff2b4f", "#3bffb0"];

/** Points gagnés pour une trouvaille, avec bonus de rapidité (jusqu'à +50 %). */
export function pointsFor(base: number, elapsedMs: number, durationMs: number, speedBonus: boolean): number {
  if (!speedBonus) return base;
  const ratio = Math.min(1, Math.max(0, elapsedMs / durationMs));
  const bonus = base * 0.5 * (1 - ratio);
  return Math.round((base + bonus) / 5) * 5;
}

export function rankPlayers(players: Player[]): Player[] {
  return [...players]
    .filter((p) => !p.kicked)
    .sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at));
}
