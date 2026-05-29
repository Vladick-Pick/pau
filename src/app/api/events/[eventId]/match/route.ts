import { requireApiRole } from "@/lib/api/auth";
import { runEventMatch } from "@/lib/pau/dashboard";

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
    const match = await runEventMatch(eventId);
    return Response.json({ match });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Matching failed" },
      { status: 400 }
    );
  }
}
