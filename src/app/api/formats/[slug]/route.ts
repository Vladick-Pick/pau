import { requireApiRole } from "@/lib/api/auth";
import { deleteFormat } from "@/lib/pau/dashboard";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { slug } = await context.params;
    const format = await deleteFormat(slug);
    return Response.json({ format });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Format deletion failed" },
      { status: 400 }
    );
  }
}
