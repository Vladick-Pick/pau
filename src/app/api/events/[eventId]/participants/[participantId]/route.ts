import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { updateEventParticipantAttendance } from "@/lib/pau/dashboard";

const attendancePatchSchema = z.object({
  attendanceMarked: z.boolean(),
});

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
    const body = attendancePatchSchema.parse(await request.json());
    const participant = await updateEventParticipantAttendance({
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
