import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { mutationErrorResponse } from "@/lib/api/mutation-error";
import { getClubRules, updateRule } from "@/lib/pau/active-store";

const rulePatchSchema = z
  .object({
    label: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.label !== undefined || v.config !== undefined || v.enabled !== undefined,
    { message: "At least one field (label, config, enabled) is required" }
  );

/** Rule types whose config.min must be a finite number. */
const NUMERIC_THRESHOLD_TYPES = new Set(["MIN_YEAR", "MIN_PERCENT", "MIN_BAND"]);

export async function PUT(
  request: Request,
  context: { params: Promise<{ clubId: string; ruleId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  const { clubId, ruleId } = await context.params;

  let body: z.infer<typeof rulePatchSchema>;
  try {
    body = rulePatchSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // When config is being changed, validate it against the rule's type
  // (a non-finite threshold would otherwise silently disable a gate).
  if (body.config !== undefined) {
    const rule = (await getClubRules(clubId)).find((r) => r.id === ruleId);
    if (rule && NUMERIC_THRESHOLD_TYPES.has(rule.type)) {
      const min = Number((body.config as Record<string, unknown>).min);
      if (!Number.isFinite(min)) {
        return Response.json(
          { error: "config.min must be a finite number" },
          { status: 400 }
        );
      }
    }
  }

  try {
    const data = await updateRule(clubId, ruleId, body);
    return Response.json({ data });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
