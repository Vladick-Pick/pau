import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { mutationErrorResponse } from "@/lib/api/mutation-error";
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

  const { clubId, roleId } = await context.params;

  let profileId: string;
  try {
    ({ profileId } = assignmentSchema.parse(await request.json()));
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    await assignRole(clubId, roleId, profileId);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return mutationErrorResponse(error);
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

  const { clubId, roleId } = await context.params;

  // Read profileId from the query string: some proxies strip DELETE bodies.
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) {
    return Response.json(
      { error: "profileId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    await unassignRole(clubId, roleId, profileId);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
