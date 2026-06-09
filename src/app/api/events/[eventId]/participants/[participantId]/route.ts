import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import {
  updateEventParticipantActiveDecision,
  updateEventParticipantAttendance,
} from "@/lib/pau/dashboard";

const activeDecisionSchema = z.enum([
  "INVITED_ATTENDED",
  "INVITED_REFUSED",
  "DECLINED_BY_US",
]);

const participantPatchSchema = z.union([
  z.object({
    attendanceMarked: z.boolean(),
  }).strict(),
  z
    .object({
      activeDecision: activeDecisionSchema,
      activeDecisionComment: z.string().optional().nullable(),
    })
    .strict(),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string; participantId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { eventId, participantId } = await context.params;
    const body = participantPatchSchema.parse(await request.json());
    const participant =
      "activeDecision" in body
        ? await updateEventParticipantActiveDecision({
            eventId,
            participantId,
            decision: body.activeDecision,
            comment: body.activeDecisionComment,
          })
        : await updateEventParticipantAttendance({
            eventId,
            participantId,
            attendanceMarked: body.attendanceMarked,
          });

    return Response.json({ participant });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Event participant update failed",
      },
      { status: 400 }
    );
  }
}
