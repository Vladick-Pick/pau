import { requireApiRole } from "@/lib/api/auth";
import { getPauWorkspaceSnapshot } from "@/lib/pau/dashboard";

export async function GET() {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  return Response.json(await getPauWorkspaceSnapshot());
}
