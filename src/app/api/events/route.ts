import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { getPauWorkspaceSnapshot } from "@/lib/pau/dashboard";

const scopeSchema = z.enum(["upcoming", "past"]).default("upcoming");

export async function GET(request: NextRequest) {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  const scope = scopeSchema.parse(request.nextUrl.searchParams.get("scope") ?? undefined);
  const snapshot = await getPauWorkspaceSnapshot();

  return Response.json({
    scope,
    events: scope === "past" ? snapshot.pastEvents : snapshot.upcomingEvents,
    demoMode: snapshot.demoMode,
  });
}
