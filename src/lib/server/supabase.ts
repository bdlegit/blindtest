import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Client Supabase avec la clé service_role : à n'utiliser QUE côté serveur. */
export function admin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(500, "Supabase n'est pas configuré (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Lève une HttpError si Supabase renvoie une erreur. */
export function must<T>(res: { data: T; error: { message: string } | null }, what = "base de données"): T {
  if (res.error) {
    console.error(`[supabase] ${what}:`, res.error.message);
    throw new HttpError(500, `Erreur ${what}`);
  }
  return res.data;
}
