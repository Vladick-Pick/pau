import { requireApiRole } from "@/lib/api/auth";
import { generateEventBriefs } from "@/lib/pau/dashboard";

export async function POST(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response || !auth.session) {
    return auth.response;
  }

  try {
    const { eventId } = await context.params;
    const result = await generateEventBriefs({
      eventId,
      createdByRole: auth.session.role,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Brief generation failed" },
      { status: 400 }
    );
  }
}
