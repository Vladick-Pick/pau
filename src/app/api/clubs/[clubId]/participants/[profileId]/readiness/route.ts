import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
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

  try {
    const { clubId, profileId } = await context.params;
    const body = readinessSchema.parse(await request.json());
    await setReadiness(clubId, profileId, body.formatId, body.readiness);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Readiness update failed",
      },
      { status: 400 }
    );
  }
}
