import { beforeEach, describe, expect, it, vi } from "vitest";

const addManualFormatVisitMock = vi.fn();

vi.mock("@/lib/pau/active-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pau/active-store")>();
  return {
    ...actual,
    addManualFormatVisit: addManualFormatVisitMock,
  };
});

function makeRequest(body: unknown) {
  return new Request("http://local.test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams() {
  return {
    params: Promise.resolve({ clubId: "ws_cf1", profileId: "profile-1" }),
  };
}

function mockManager() {
  vi.doMock("@/lib/api/auth", () => ({
    requireApiRole: vi.fn(async () => ({
      session: { role: "MANAGER" },
      response: null,
    })),
  }));
}

describe("POST /clubs/[clubId]/participants/[profileId]/visits", () => {
  beforeEach(() => {
    vi.resetModules();
    addManualFormatVisitMock.mockReset();
  });

  it("adds a manual format visit", async () => {
    mockManager();
    addManualFormatVisitMock.mockResolvedValue(undefined);

    const { POST } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/visits/route"
    );
    const response = await POST(
      makeRequest({
        formatSlug: "guest-meeting",
        attendedAt: "2024-04-01",
        notes: "Был",
      }),
      makeParams()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { ok: true } });
    expect(addManualFormatVisitMock).toHaveBeenCalledWith("ws_cf1", "profile-1", {
      formatSlug: "guest-meeting",
      attendedAt: new Date("2024-04-01T00:00:00.000Z"),
      notes: "Был",
    });
  });

  it("rejects invalid payload", async () => {
    mockManager();

    const { POST } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/visits/route"
    );
    const response = await POST(makeRequest({ attendedAt: "2024-04-01" }), makeParams());

    expect(response.status).toBe(400);
    expect(addManualFormatVisitMock).not.toHaveBeenCalled();
  });

  it("rejects impossible calendar dates", async () => {
    mockManager();

    const { POST } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/visits/route"
    );
    const response = await POST(
      makeRequest({
        formatSlug: "guest-meeting",
        attendedAt: "2024-02-31",
        notes: null,
      }),
      makeParams()
    );

    expect(response.status).toBe(400);
    expect(addManualFormatVisitMock).not.toHaveBeenCalled();
  });
});
