import { getState } from "@/lib/server/engine";
import { handle, json } from "@/lib/server/http";

type Ctx = { params: Promise<{ code: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  return json(await getState(code, req.headers.get("x-player-token")));
});
