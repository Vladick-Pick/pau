import { requireApiRole } from "@/lib/api/auth";
import { getParticipantDetail } from "@/lib/pau/active-participants";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clubId: string; profileId: string }> }
) {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  const { clubId, profileId } = await context.params;
  const data = await getParticipantDetail(clubId, profileId);

  if (!data) {
    return Response.json({ error: "Participant not found" }, { status: 404 });
  }

  return Response.json({ data });
}
