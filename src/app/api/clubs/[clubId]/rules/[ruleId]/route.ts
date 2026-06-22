import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { updateRule } from "@/lib/pau/active-store";

const rulePatchSchema = z
  .object({
    label: z.string().optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.label !== undefined || v.config !== undefined || v.enabled !== undefined,
    { message: "At least one field (label, config, enabled) is required" }
  );

export async function PUT(
  request: Request,
  context: { params: Promise<{ clubId: string; ruleId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { ruleId } = await context.params;
    const body = rulePatchSchema.parse(await request.json());
    const data = await updateRule(ruleId, body);
    return Response.json({ data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Rule update failed",
      },
      { status: 400 }
    );
  }
}
