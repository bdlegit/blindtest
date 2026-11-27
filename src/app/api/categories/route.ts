import { CATEGORIES } from "@/lib/catalog";
import { json } from "@/lib/server/http";

export function GET() {
  return json({
    categories: CATEGORIES.map(({ id, label, emoji, gradient, tracks }) => ({ id, label, emoji, gradient, count: tracks.length })),
  });
}
