import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getOrSeedClub, upsertMemberProfile } from "@/lib/pau/active-store";

const CLUB = "ws_test_route";

const DOSSIER = {
  company: "RouteCo",
  revenue: "10M",
  industry: "finance",
  position: "CFO",
  city: "Москва",
  age: 42,
  interests: "tennis",
  canBeUseful: "investing",
  clubGoals: "deals",
  telegram: "@routetest",
};

const PARTICIPATION = [
  { date: "2024-05-15", title: "Встреча", detail: "Attendee" },
];

beforeAll(async () => {
  await prisma.club.deleteMany({ where: { id: { startsWith: "ws_test_route" } } });

  await getOrSeedClub(CLUB, "Route Test");

  // Member with tenureYear=3, paymentPhase="mid" → passes enabled rules
  await upsertMemberProfile({
    clubId: CLUB,
    profileId: "rt_pA",
    displayName: "Route Tester",
    stateCode: "active",
    facts: {
      tenureYear: 3,
      retention: null,
      attendance: null,
      paymentPhase: "mid",
      businessBand: null,
    },
    dossier: DOSSIER,
    participation: PARTICIPATION,
    profileUpdatedAt: new Date("2024-07-01"),
  });
});

afterAll(async () => {
  await prisma.club.deleteMany({ where: { id: { startsWith: "ws_test_route" } } });
  await prisma.$disconnect();
});

// ── GET /api/clubs ─────────────────────────────────────────────────────────────

describe("GET /api/clubs", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }),
      })),
    }));

    const { GET } = await import("../src/app/api/clubs/route");
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns the seeded club in the data array when authenticated", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "VIEWER" },
        response: null,
      })),
    }));

    const { GET } = await import("../src/app/api/clubs/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    const club = (body.data as Array<{ id: string; name: string }>).find(
      (c) => c.id === CLUB
    );
    expect(club).toBeDefined();
    expect(club!.name).toBe("Route Test");
  });
});

// ── GET /api/clubs/[clubId]/active-participants ────────────────────────────────

describe("GET /api/clubs/[clubId]/active-participants", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }),
      })),
    }));

    const { GET } = await import(
      "../src/app/api/clubs/[clubId]/active-participants/route"
    );
    const response = await GET(new Request("http://local.test"), {
      params: Promise.resolve({ clubId: CLUB }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns active member with evaluation.passed === true when authenticated", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "VIEWER" },
        response: null,
      })),
    }));

    const { GET } = await import(
      "../src/app/api/clubs/[clubId]/active-participants/route"
    );
    const response = await GET(new Request("http://local.test"), {
      params: Promise.resolve({ clubId: CLUB }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);

    const member = (
      body.data as Array<{ profileId: string; evaluation: { passed: boolean } }>
    ).find((p) => p.profileId === "rt_pA");
    expect(member).toBeDefined();
    expect(member!.evaluation.passed).toBe(true);
  });
});

// ── GET /api/clubs/[clubId]/participants/[profileId] ───────────────────────────

describe("GET /api/clubs/[clubId]/participants/[profileId]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }),
      })),
    }));

    const { GET } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/route"
    );
    const response = await GET(new Request("http://local.test"), {
      params: Promise.resolve({ clubId: CLUB, profileId: "rt_pA" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 for an unknown profileId", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "VIEWER" },
        response: null,
      })),
    }));

    const { GET } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/route"
    );
    const response = await GET(new Request("http://local.test"), {
      params: Promise.resolve({ clubId: CLUB, profileId: "does_not_exist" }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  it("returns full dossier and rules for the seeded member", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "VIEWER" },
        response: null,
      })),
    }));

    const { GET } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/route"
    );
    const response = await GET(new Request("http://local.test"), {
      params: Promise.resolve({ clubId: CLUB, profileId: "rt_pA" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.profileId).toBe("rt_pA");
    expect(body.data.dossier).toBeDefined();
    expect(body.data.dossier.company).toBe("RouteCo");
    expect(Array.isArray(body.data.rules)).toBe(true);
    expect(body.data.rules.length).toBeGreaterThan(0);
    expect(body.data.evaluation.passed).toBe(true);
  });
});
