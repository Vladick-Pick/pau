import { requireApiRole } from "@/lib/api/auth";
import { runEventMatching } from "@/lib/pau/event-matching-run";

export async function POST(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { eventId } = await context.params;
    const match = await runEventMatching({
      eventId,
      actor: {
        role: auth.session?.role ?? null,
        userName: auth.session?.userName ?? null,
      },
    });
    return Response.json({ match });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Matching failed" },
      { status: 400 }
    );
  }
}
