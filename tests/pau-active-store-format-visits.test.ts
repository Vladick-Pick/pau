import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    memberProfile: {
      findUnique: vi.fn(),
    },
    eventFormat: {
      findUnique: vi.fn(),
    },
    formatVisit: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  addManualFormatVisit,
  listFormatVisits,
  NotFoundError,
} from "@/lib/pau/active-store";

describe("manual format visits store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a manual visit only for an existing member and PAU format", async () => {
    prismaMock.memberProfile.findUnique.mockResolvedValue({ id: "member-1" });
    prismaMock.eventFormat.findUnique.mockResolvedValue({
      slug: "guest-meeting",
    });
    prismaMock.formatVisit.create.mockResolvedValue({ id: "visit-1" });

    await addManualFormatVisit("ws_cf1", "profile-1", {
      formatSlug: "guest-meeting",
      attendedAt: new Date("2024-04-01T09:00:00.000Z"),
      notes: "Был",
    });

    expect(prismaMock.formatVisit.create).toHaveBeenCalledWith({
      data: {
        clubId: "ws_cf1",
        profileId: "profile-1",
        formatSlug: "guest-meeting",
        attendedAt: new Date("2024-04-01T09:00:00.000Z"),
        notes: "Был",
      },
    });
  });

  it("throws NotFoundError when profile or format does not exist", async () => {
    prismaMock.memberProfile.findUnique.mockResolvedValue(null);
    prismaMock.eventFormat.findUnique.mockResolvedValue({
      slug: "guest-meeting",
    });

    await expect(
      addManualFormatVisit("ws_cf1", "missing", {
        formatSlug: "guest-meeting",
        attendedAt: new Date("2024-04-01T09:00:00.000Z"),
        notes: null,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.formatVisit.create).not.toHaveBeenCalled();
  });

  it("lists manual visits with format names", async () => {
    prismaMock.formatVisit.findMany.mockResolvedValue([
      {
        attendedAt: new Date("2024-04-01T09:00:00.000Z"),
        notes: null,
        format: { name: "Рабочая группа" },
      },
    ]);

    await expect(listFormatVisits("ws_cf1", "profile-1")).resolves.toEqual([
      {
        attendedAt: new Date("2024-04-01T09:00:00.000Z"),
        formatName: "Рабочая группа",
        notes: null,
      },
    ]);
  });
});
