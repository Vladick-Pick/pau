import { requireApiRole } from "@/lib/api/auth";
import { mutationErrorResponse } from "@/lib/api/mutation-error";
import { deleteRole } from "@/lib/pau/active-store";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ clubId: string; roleId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { clubId, roleId } = await context.params;
    await deleteRole(clubId, roleId);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
