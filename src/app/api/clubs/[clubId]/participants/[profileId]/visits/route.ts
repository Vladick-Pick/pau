import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { mutationErrorResponse } from "@/lib/api/mutation-error";
import { addManualFormatVisit } from "@/lib/pau/active-store";

const visitSchema = z.object({
  formatSlug: z.string().trim().min(1),
  attendedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).nullable().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ clubId: string; profileId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  const { clubId, profileId } = await context.params;

  let body: z.infer<typeof visitSchema>;
  try {
    body = visitSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const attendedAt = parseDateOnly(body.attendedAt);
  if (!attendedAt) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    await addManualFormatVisit(clubId, profileId, {
      formatSlug: body.formatSlug,
      attendedAt,
      notes: body.notes ?? null,
    });
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}

function parseDateOnly(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10) === value ? date : null;
}
