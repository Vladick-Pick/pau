import { describe, expect, it, vi } from "vitest";

const reportRouteMocks = vi.hoisted(() => ({
  MAX_REPORT_TRANSCRIPT_CHARS: 80_000,
}));

vi.mock("@/lib/pau/preparation", () => reportRouteMocks);

describe("event report API route", () => {
  it("generates an event report from transcript text", async () => {
    vi.resetModules();
    const generateEventReportFromTranscript = vi.fn(async () => ({
      id: "report-1",
      summary: "Короткий отчет",
    }));

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "MANAGER" },
        response: null,
      })),
    }));
    vi.doMock("@/lib/pau/dashboard", () => ({
      generateEventReportFromTranscript,
    }));

    const { POST } = await import("../src/app/api/events/[eventId]/report/route");
    const response = await POST(
      new Request("http://local.test", {
        method: "POST",
        body: JSON.stringify({ transcript: "Текст записи встречи" }),
      }),
      {
        params: Promise.resolve({ eventId: "event-1" }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: {
        id: "report-1",
        summary: "Короткий отчет",
      },
    });
    expect(generateEventReportFromTranscript).toHaveBeenCalledWith({
      eventId: "event-1",
      transcript: "Текст записи встречи",
      createdByRole: "MANAGER",
    });
  });

  it("rejects oversized transcripts before calling OpenRouter generation", async () => {
    vi.resetModules();
    const generateEventReportFromTranscript = vi.fn();

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "MANAGER" },
        response: null,
      })),
    }));
    vi.doMock("@/lib/pau/dashboard", () => ({
      generateEventReportFromTranscript,
    }));

    const { POST } = await import("../src/app/api/events/[eventId]/report/route");
    const response = await POST(
      new Request("http://local.test", {
        method: "POST",
        body: JSON.stringify({
          transcript: "а".repeat(reportRouteMocks.MAX_REPORT_TRANSCRIPT_CHARS + 1),
        }),
      }),
      {
        params: Promise.resolve({ eventId: "event-1" }),
      }
    );

    expect(response.status).toBe(400);
    expect(generateEventReportFromTranscript).not.toHaveBeenCalled();
  });
});
