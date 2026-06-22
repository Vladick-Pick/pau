import { requireApiRole } from "@/lib/api/auth";
import { listClubs } from "@/lib/pau/active-store";

export async function GET() {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  const clubs = await listClubs();
  return Response.json({ data: clubs });
}
