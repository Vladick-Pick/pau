import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { assignRole, unassignRole } from "@/lib/pau/active-store";

const assignmentSchema = z.object({
  profileId: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ clubId: string; roleId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { roleId } = await context.params;
    const body = assignmentSchema.parse(await request.json());
    await assignRole(roleId, body.profileId);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Role assignment failed",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ clubId: string; roleId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { roleId } = await context.params;
    const body = assignmentSchema.parse(await request.json());
    await unassignRole(roleId, body.profileId);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Role unassignment failed",
      },
      { status: 400 }
    );
  }
}
