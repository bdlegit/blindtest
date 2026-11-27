import { createRoom } from "@/lib/server/engine";
import { body, handle, json } from "@/lib/server/http";
import type { GameSettings } from "@/lib/game";

export const maxDuration = 30;

export const POST = handle(async (req: Request) => {
  const b = await body<{ name?: string; settings?: Partial<GameSettings> }>(req);
  const created = await createRoom(b.name ?? "", b.settings ?? {});
  return json(created, { status: 201 });
});
