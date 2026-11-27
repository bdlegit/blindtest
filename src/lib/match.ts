/**
 * Reconnaissance « intelligente » des réponses.
 *
 * - insensible à la casse et aux accents
 * - ignore la ponctuation, « feat. … », « (Remastered) », « - Radio Edit », « The » initial
 * - tolère quelques fautes de frappe (distance de Damerau-Levenshtein bornée selon la longueur)
 * - accepte les variantes (alias) d'un titre ou d'un artiste
 * - accepte une saisie qui contient la réponse ("daft punk one more time")
 * - refuse les réponses trop approximatives ou trop courtes
 */

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  un: "1", deux: "2", trois: "3", quatre: "4", cinq: "5", sept: "7", huit: "8", neuf: "9", dix: "10",
};

const STOP_PREFIXES = ["the ", "le ", "la ", "les ", "l "];

/** Supprime les mentions annexes d'un titre : (feat. X), [Remastered 2011], - Radio Edit… */
export function stripDecorations(input: string): string {
  let s = input;
  s = s.replace(/\s*[([{][^)\]}]*[)\]}]/g, " "); // (…) […] {…}
  s = s.replace(/\s+-\s+.*(remaster|edit|version|mix|live|mono|stereo|bande originale|from |b\.o|ost).*$/i, " ");
  s = s.replace(/\s+(feat\.?|ft\.?|featuring|avec)\s+.*$/i, " ");
  return s;
}

export function normalize(input: string, { decorations = true } = {}): string {
  let s = (input ?? "").toString();
  if (decorations) s = stripDecorations(s);
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // accents
  s = s.toLowerCase();
  s = s.replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ß/g, "ss");
  s = s.replace(/&/g, " and ").replace(/\+/g, " and ");
  s = s.replace(/['’`´]/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s
    .split(" ")
    .filter(Boolean)
    .map((w) => (w === "et" ? "and" : NUMBER_WORDS[w] ?? w))
    .join(" ");
  s = s.trim();
  for (const p of STOP_PREFIXES) {
    if (s.startsWith(p) && s.length > p.length + 2) {
      s = s.slice(p.length);
      break;
    }
  }
  return s;
}

/** Distance de Damerau-Levenshtein (variante OSA). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Nombre de fautes tolérées selon la longueur (sans espaces) de la réponse attendue. */
export function allowedTypos(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 11) return 2;
  if (length <= 18) return 3;
  return 4;
}

function compact(s: string) {
  return s.replace(/ /g, "");
}

function closeEnough(guess: string, target: string): boolean {
  const g = compact(guess);
  const t = compact(target);
  if (!g || !t) return false;
  if (g === t) return true;
  // garde-fou : une saisie beaucoup plus courte ou plus longue n'est pas une faute de frappe
  if (Math.abs(g.length - t.length) > allowedTypos(t.length)) return false;
  return editDistance(g, t) <= allowedTypos(t.length);
}

/** Toutes les formes acceptées d'une réponse (avec et sans décorations, alias inclus). */
export function targetForms(value: string, aliases: string[] = []): string[] {
  const forms = new Set<string>();
  for (const v of [value, ...aliases]) {
    if (!v) continue;
    const n = normalize(v);
    if (n) forms.add(n);
    const raw = normalize(v, { decorations: false });
    if (raw) forms.add(raw);
  }
  return [...forms];
}

/**
 * La saisie `guess` correspond-elle à la réponse `value` (ou un de ses alias) ?
 * On teste la saisie entière, puis chaque « fenêtre » de mots de la saisie, ce qui
 * permet de répondre « Daft Punk - One More Time » d'un coup.
 */
export function isMatch(guess: string, value: string, aliases: string[] = []): boolean {
  const g = normalize(guess, { decorations: false });
  if (!g) return false;
  const gWords = g.split(" ");
  for (const target of targetForms(value, aliases)) {
    if (closeEnough(g, target)) return true;
    const tWords = target.split(" ");
    const n = tWords.length;
    // Une réponse d'un seul mot très court (ex. « U2 », « Sia ») doit être tapée exactement.
    const minLen = compact(target).length;
    for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
      if (size > gWords.length || size === gWords.length) continue;
      for (let i = 0; i + size <= gWords.length; i++) {
        const window = gWords.slice(i, i + size).join(" ");
        if (minLen <= 3 ? window === target : closeEnough(window, target)) return true;
      }
    }
  }
  return false;
}

export type GuessResult = { title: boolean; artist: boolean };

export function checkGuess(
  guess: string,
  track: { title: string; artist: string; titleAliases?: string[]; artistAliases?: string[] },
): GuessResult {
  return {
    title: isMatch(guess, track.title, track.titleAliases),
    artist: isMatch(guess, track.artist, track.artistAliases),
  };
}
