import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./supabase";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

/** Enveloppe une route : transforme les HttpError en réponses JSON propres. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, { status: e.status });
      console.error(e);
      return json({ error: "Erreur inattendue" }, { status: 500 });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Requête invalide");
  }
}
