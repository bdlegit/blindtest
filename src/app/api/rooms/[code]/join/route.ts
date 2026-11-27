import { joinRoom } from "@/lib/server/engine";
import { body, handle, json } from "@/lib/server/http";

type Ctx = { params: Promise<{ code: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const b = await body<{ nickname?: string; avatar?: string; color?: string }>(req);
  const { player, token } = await joinRoom(code, b);
  return json({ player, token }, { status: 201 });
});
