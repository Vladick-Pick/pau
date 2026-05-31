import { z } from "zod";

import { requireApiRole } from "@/lib/api/auth";
import { generateEventReportFromTranscript } from "@/lib/pau/dashboard";
import { MAX_REPORT_TRANSCRIPT_CHARS } from "@/lib/pau/preparation";

const eventReportSchema = z.object({
  transcript: z.string().trim().min(1).max(MAX_REPORT_TRANSCRIPT_CHARS),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireApiRole("MANAGER");
  if (auth.response || !auth.session) {
    return auth.response;
  }

  try {
    const { eventId } = await context.params;
    const body = eventReportSchema.parse(await request.json());
    const report = await generateEventReportFromTranscript({
      eventId,
      transcript: body.transcript,
      createdByRole: auth.session.role,
    });

    return Response.json({ report });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Report generation failed" },
      { status: 400 }
    );
  }
}
