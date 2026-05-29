import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { getPauWorkspaceSnapshot, updateFormats } from "@/lib/pau/dashboard";

const formatPatchSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  audience: z.string().nullable().optional(),
  moderatorNotes: z.string().nullable().optional(),
  bitrixEventTypeIds: z.array(z.string()).optional(),
  matchingRules: z.unknown().optional(),
  promptPotential: z.string().optional(),
  promptActive: z.string().optional(),
  promptModerator: z.string().optional(),
});

const formatsPatchSchema = z.union([
  z.array(formatPatchSchema),
  z.object({ formats: z.array(formatPatchSchema) }).transform((body) => body.formats),
]);

export async function GET() {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  const snapshot = await getPauWorkspaceSnapshot();
  return Response.json({
    formats: snapshot.formats,
    demoMode: snapshot.demoMode,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const patches = formatsPatchSchema.parse(await request.json());
    const formats = await updateFormats(patches);
    return Response.json({ formats });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Format update failed" },
      { status: 400 }
    );
  }
}
