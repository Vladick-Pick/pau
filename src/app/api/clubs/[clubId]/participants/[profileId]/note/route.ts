import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { setNote } from "@/lib/pau/active-store";

const noteSchema = z.object({
  note: z.string().max(4000),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ clubId: string; profileId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { clubId, profileId } = await context.params;
    const body = noteSchema.parse(await request.json());
    await setNote(clubId, profileId, body.note);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Note update failed",
      },
      { status: 400 }
    );
  }
}
