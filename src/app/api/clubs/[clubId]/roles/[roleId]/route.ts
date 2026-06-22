import { requireApiRole } from "@/lib/api/auth";
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
    const { roleId } = await context.params;
    await deleteRole(roleId);
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Role deletion failed",
      },
      { status: 400 }
    );
  }
}
