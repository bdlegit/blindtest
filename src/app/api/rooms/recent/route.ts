import { admin, must } from "@/lib/server/supabase";
import { handle, json } from "@/lib/server/http";

export const GET = handle(async () => {
  const rows = must(
    await admin()
      .from("game_history")
      .select("id,room_name,player_count,rounds,podium,finished_at")
      .order("finished_at", { ascending: false })
      .limit(6),
    "historique",
  );
  return json({ games: rows });
});
