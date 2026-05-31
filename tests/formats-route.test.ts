import { describe, expect, it, vi } from "vitest";

describe("format API route", () => {
  it("deletes a format through the manager-only endpoint", async () => {
    vi.resetModules();
    const deleteFormat = vi.fn(async () => ({ slug: "guest-meeting" }));

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "MANAGER" },
        response: null,
      })),
    }));
    vi.doMock("@/lib/pau/dashboard", () => ({
      deleteFormat,
    }));

    const { DELETE } = await import("../src/app/api/formats/[slug]/route");
    const response = await DELETE(new Request("http://local.test"), {
      params: Promise.resolve({ slug: "guest-meeting" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      format: { slug: "guest-meeting" },
    });
    expect(deleteFormat).toHaveBeenCalledWith("guest-meeting");
  });
});
