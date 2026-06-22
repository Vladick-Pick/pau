import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { listRoles, createRole } from "@/lib/pau/active-store";

const roleCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ clubId: string }> }
) {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  const { clubId } = await context.params;
  const data = await listRoles(clubId);
  return Response.json({ data });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ clubId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { clubId } = await context.params;
    const body = roleCreateSchema.parse(await request.json());
    const data = await createRole(clubId, body.name, body.description);
    return Response.json({ data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Role creation failed",
      },
      { status: 400 }
    );
  }
}
