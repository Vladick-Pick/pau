import { requireApiRole } from "@/lib/api/auth";
import { getActiveParticipants } from "@/lib/pau/active-participants";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clubId: string }> }
) {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  const { clubId } = await context.params;
  const data = await getActiveParticipants(clubId);
  return Response.json({ data });
}
