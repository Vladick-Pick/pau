import type { SessionRole } from "@/lib/auth/session";
import { canAccess, getCurrentSession } from "@/lib/auth/server";

export async function requireApiRole(minimumRole: SessionRole) {
  const session = await getCurrentSession();
  if (!session) {
    return {
      session: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!canAccess(session, minimumRole)) {
    return {
      session: null,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { session, response: null };
}
