import { requireApiRole } from "@/lib/api/auth";
import { buildEventBriefsDocx, getEvent } from "@/lib/pau/dashboard";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireApiRole("VIEWER");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { eventId } = await context.params;
    const [event, buffer] = await Promise.all([
      getEvent(eventId),
      buildEventBriefsDocx(eventId),
    ]);
    const filename = encodeURIComponent(`${event.title}.docx`);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 400 }
    );
  }
}
