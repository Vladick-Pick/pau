import { requireApiRole } from "@/lib/api/auth";
import { syncAllClubs } from "@/lib/profile/sync";

export async function POST() {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const results = await syncAllClubs();
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Profile sync failed" },
      { status: 400 }
    );
  }
}
