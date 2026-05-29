import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { syncEventsFromBitrix } from "@/lib/pau/dashboard";

const syncEventsSchema = z.object({
  eventIds: z.array(z.string().trim().min(1)).min(1),
});

export async function POST(request: Request) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const input = syncEventsSchema.parse(await request.json());
    const result = await syncEventsFromBitrix(input);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Bitrix sync failed" },
      { status: 400 }
    );
  }
}
