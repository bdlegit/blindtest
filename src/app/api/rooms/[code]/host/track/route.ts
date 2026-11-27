import { hostTrack, loadRoom, requireHost } from "@/lib/server/engine";
import { handle, json } from "@/lib/server/http";

type Ctx = { params: Promise<{ code: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const room = await loadRoom(code);
  await requireHost(room, req.headers.get("x-host-token"));
  const round = Number(new URL(req.url).searchParams.get("round"));
  return json(await hostTrack(room, round));
});
