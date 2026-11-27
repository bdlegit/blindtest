/** Petits accès sûrs à localStorage (peut être indisponible : navigation privée…). */
export function load(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function save(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export const hostKey = (code: string) => `btp:host:${code.toUpperCase()}`;
export const playerKey = (code: string) => `btp:player:${code.toUpperCase()}`;
export const profileKey = "btp:profile";
export const libraryKey = "btp:library-password";
