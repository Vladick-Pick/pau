import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { mutationErrorResponse } from "@/lib/api/mutation-error";
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

  const { clubId, profileId } = await context.params;

  let note: string;
  try {
    ({ note } = noteSchema.parse(await request.json()));
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    await setNote(clubId, profileId, note);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
