import { requireApiRole } from "@/lib/api/auth";
import { ProfileApiError } from "@/lib/profile/client";
import { syncAllClubs } from "@/lib/profile/sync";

export async function POST() {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const results = await syncAllClubs();
    return Response.json({ data: results });
  } catch (error) {
    // A client-side ProfileApiError (4xx) is the caller's fault → 400.
    // Anything else (5xx upstream, network, bug) → 500, without leaking detail.
    if (error instanceof ProfileApiError && error.status < 500) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "Profile sync failed" },
      { status: 500 }
    );
  }
}
