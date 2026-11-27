import { getState, hostAction, loadRoom, requireHost, type HostAction } from "@/lib/server/engine";
import { body, handle, json } from "@/lib/server/http";

type Ctx = { params: Promise<{ code: string }> };

export const maxDuration = 30;

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const room = await loadRoom(code);
  await requireHost(room, req.headers.get("x-host-token"));
  const action = await body<HostAction>(req);
  await hostAction(room, action);
  return json(await getState(code, null));
});
