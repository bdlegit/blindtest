/** Nettoyage des titres et noms d'artistes venant des playlists Deezer. */

const VERSION_WORDS = /(remaster|version|edit|mix|live|mono|stereo|feat\.?|ft\.|featuring|from |bande originale|b\.o|soundtrack|bonus|radio)/i;

/** « Take on Me (2017 Remaster) » → « Take on Me », mais garde « Sweet Dreams (Are Made of This) ». */
export function cleanTitle(title: string): string {
  let t = title.replace(/\s*[([][^)\]]*[)\]]/g, (m) => (VERSION_WORDS.test(m) ? "" : m));
  t = t.replace(/\s+-\s+.*$/, (m) => (VERSION_WORDS.test(m) ? "" : m));
  return t.trim() || title;
}

/** « Bob Marley & The Wailers » → accepte aussi « Bob Marley ». */
export function artistAliases(artist: string): string[] {
  const first = artist.split(/\s*(?:&|,|\bx\b|\bfeat\.?|\bfeaturing\b|\band\b|\bet\b|\bvs\.?)\s*/i)[0]?.trim();
  return first && first.length >= 2 && first !== artist ? [first] : [];
}
