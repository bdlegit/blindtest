import { loadRoom, requirePlayer, submitAnswer } from "@/lib/server/engine";
import { body, handle, json } from "@/lib/server/http";

type Ctx = { params: Promise<{ code: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const room = await loadRoom(code);
  const player = await requirePlayer(room, req.headers.get("x-player-token"));
  const b = await body<{ guess?: string; choice?: string; hint?: boolean }>(req);
  return json(await submitAnswer(room, player, b));
});
