import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { listBitrixEventCandidates } from "@/lib/pau/dashboard";

const querySchema = z.string().trim().min(1).default("Гостевая встреча");

export async function GET(request: NextRequest) {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const query = querySchema.parse(
      request.nextUrl.searchParams.get("query") ?? undefined
    );
    const events = await listBitrixEventCandidates({ query });
    return Response.json({ query, events });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Bitrix event search failed" },
      { status: 400 }
    );
  }
}
