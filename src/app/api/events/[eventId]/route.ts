import { requireApiRole } from "@/lib/api/auth";
import { getEvent, getPauWorkspaceSnapshot } from "@/lib/pau/dashboard";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  const { eventId } = await context.params;

  try {
    return Response.json({ event: await getEvent(eventId) });
  } catch (error) {
    const snapshot = await getPauWorkspaceSnapshot();
    const event = [...snapshot.upcomingEvents, ...snapshot.pastEvents].find(
      (candidate) => candidate.id === eventId
    );
    if (event) {
      return Response.json({ event, demoMode: snapshot.demoMode });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Event not found" },
      { status: 404 }
    );
  }
}
