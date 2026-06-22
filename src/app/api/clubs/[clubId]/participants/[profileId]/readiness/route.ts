import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { mutationErrorResponse } from "@/lib/api/mutation-error";
import { setReadiness } from "@/lib/pau/active-store";

const readinessSchema = z.object({
  formatId: z.string().min(1),
  readiness: z.enum(["READY", "NOT_READY", "UNMARKED"]),
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

  let body: z.infer<typeof readinessSchema>;
  try {
    body = readinessSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    await setReadiness(clubId, profileId, body.formatId, body.readiness);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
