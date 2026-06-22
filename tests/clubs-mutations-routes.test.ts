import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  getOrSeedClub,
  getClubRules,
  roleIdsForProfile,
  getReadiness,
  getNote,
} from "@/lib/pau/active-store";

const CLUB = "ws_test_mutr";
const PROFILE = "ws_test_mutr_profile1";
const FORMAT = "ws_test_mutr_format1";

// Helpers to build mock request objects
function makeRequest(body: unknown, method = "PUT") {
  return new Request("http://local.test", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

// Auth mock factories
function mockManager() {
  vi.doMock("@/lib/api/auth", () => ({
    requireApiRole: vi.fn(async () => ({
      session: { role: "MANAGER" },
      response: null,
    })),
  }));
}

function mockViewer() {
  vi.doMock("@/lib/api/auth", () => ({
    requireApiRole: vi.fn(async () => ({
      session: { role: "VIEWER" },
      response: null,
    })),
  }));
}

function mockUnauthorized() {
  vi.doMock("@/lib/api/auth", () => ({
    requireApiRole: vi.fn(async () => ({
      session: null,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    })),
  }));
}

beforeAll(async () => {
  // Clean up only our namespace
  await prisma.participantNote.deleteMany({
    where: { profileId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.formatReadiness.deleteMany({
    where: { profileId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.activeRoleAssignment.deleteMany({
    where: { profileId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.activeRole.deleteMany({
    where: { clubId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.memberProfile.deleteMany({
    where: { clubId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.activeRule.deleteMany({
    where: { clubId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.club.deleteMany({
    where: { id: { startsWith: "ws_test_mutr" } },
  });

  await getOrSeedClub(CLUB, "Mut Test");
});

afterAll(async () => {
  await prisma.participantNote.deleteMany({
    where: { profileId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.formatReadiness.deleteMany({
    where: { profileId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.activeRoleAssignment.deleteMany({
    where: { profileId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.activeRole.deleteMany({
    where: { clubId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.memberProfile.deleteMany({
    where: { clubId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.activeRule.deleteMany({
    where: { clubId: { startsWith: "ws_test_mutr" } },
  });
  await prisma.club.deleteMany({
    where: { id: { startsWith: "ws_test_mutr" } },
  });
});

// ── Rules ─────────────────────────────────────────────────────────────────────

describe("PUT /clubs/[clubId]/rules/[ruleId]", () => {
  it("happy path: toggles enabled flag", async () => {
    vi.resetModules();
    mockManager();

    const rules = await getClubRules(CLUB);
    expect(rules.length).toBeGreaterThan(0);
    const rule = rules[0];
    const newEnabled = !rule.enabled;

    const { PUT } = await import(
      "../src/app/api/clubs/[clubId]/rules/[ruleId]/route"
    );
    const response = await PUT(
      makeRequest({ enabled: newEnabled }),
      makeParams({ clubId: CLUB, ruleId: rule.id })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data).toBeDefined();
    expect(json.data.enabled).toBe(newEnabled);
  });

  it("auth gate: returns 403 when not MANAGER", async () => {
    vi.resetModules();
    mockUnauthorized();

    const rules = await getClubRules(CLUB);
    const rule = rules[0];

    const { PUT } = await import(
      "../src/app/api/clubs/[clubId]/rules/[ruleId]/route"
    );
    const response = await PUT(
      makeRequest({ enabled: true }),
      makeParams({ clubId: CLUB, ruleId: rule.id })
    );

    expect(response.status).toBe(403);
  });

  it("validation: empty body → 400", async () => {
    vi.resetModules();
    mockManager();

    const rules = await getClubRules(CLUB);
    const rule = rules[0];

    const { PUT } = await import(
      "../src/app/api/clubs/[clubId]/rules/[ruleId]/route"
    );
    const response = await PUT(
      makeRequest({}),
      makeParams({ clubId: CLUB, ruleId: rule.id })
    );

    expect(response.status).toBe(400);
  });
});

// ── Roles ─────────────────────────────────────────────────────────────────────

describe("GET /clubs/[clubId]/roles", () => {
  it("VIEWER can list roles", async () => {
    vi.resetModules();
    mockViewer();

    const { GET } = await import(
      "../src/app/api/clubs/[clubId]/roles/route"
    );
    const response = await GET(
      new Request("http://local.test"),
      makeParams({ clubId: CLUB })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json.data)).toBe(true);
  });
});

describe("POST /clubs/[clubId]/roles", () => {
  it("happy path: creates a role and GET shows it", async () => {
    // POST
    vi.resetModules();
    mockManager();

    const { POST } = await import(
      "../src/app/api/clubs/[clubId]/roles/route"
    );
    const postResponse = await POST(
      makeRequest({ name: "ws_test_mutr_Спикер", description: "Тест" }, "POST"),
      makeParams({ clubId: CLUB })
    );

    expect(postResponse.status).toBe(200);
    const postJson = await postResponse.json();
    expect(postJson.data.name).toBe("ws_test_mutr_Спикер");
    const roleId = postJson.data.id;

    // GET
    vi.resetModules();
    mockViewer();

    const { GET } = await import(
      "../src/app/api/clubs/[clubId]/roles/route"
    );
    const getResponse = await GET(
      new Request("http://local.test"),
      makeParams({ clubId: CLUB })
    );
    expect(getResponse.status).toBe(200);
    const getJson = await getResponse.json();
    const found = getJson.data.find((r: { id: string }) => r.id === roleId);
    expect(found).toBeDefined();
    expect(found.name).toBe("ws_test_mutr_Спикер");
  });

  it("auth gate: returns 403 when not MANAGER", async () => {
    vi.resetModules();
    mockUnauthorized();

    const { POST } = await import(
      "../src/app/api/clubs/[clubId]/roles/route"
    );
    const response = await POST(
      makeRequest({ name: "ShouldFail" }, "POST"),
      makeParams({ clubId: CLUB })
    );

    expect(response.status).toBe(403);
  });

  it("validation: missing name → 400", async () => {
    vi.resetModules();
    mockManager();

    const { POST } = await import(
      "../src/app/api/clubs/[clubId]/roles/route"
    );
    const response = await POST(
      makeRequest({ description: "no name" }, "POST"),
      makeParams({ clubId: CLUB })
    );

    expect(response.status).toBe(400);
  });
});

// ── Assignments ───────────────────────────────────────────────────────────────

describe("POST/DELETE /clubs/[clubId]/roles/[roleId]/assignments", () => {
  it("happy path: assigns profile to role and unassigns", async () => {
    // First create a role directly via store
    const { createRole } = await import("@/lib/pau/active-store");
    const role = await createRole(CLUB, "ws_test_mutr_Assign");

    // POST assignment
    vi.resetModules();
    mockManager();

    const { POST } = await import(
      "../src/app/api/clubs/[clubId]/roles/[roleId]/assignments/route"
    );
    const assignResponse = await POST(
      makeRequest({ profileId: PROFILE }, "POST"),
      makeParams({ clubId: CLUB, roleId: role.id })
    );

    expect(assignResponse.status).toBe(200);
    const assignJson = await assignResponse.json();
    expect(assignJson.data.ok).toBe(true);

    // Verify via store
    const roleIds = await roleIdsForProfile(CLUB, PROFILE);
    expect(roleIds).toContain(role.id);

    // DELETE assignment
    vi.resetModules();
    mockManager();

    const { DELETE } = await import(
      "../src/app/api/clubs/[clubId]/roles/[roleId]/assignments/route"
    );
    const unassignResponse = await DELETE(
      makeRequest({ profileId: PROFILE }, "DELETE"),
      makeParams({ clubId: CLUB, roleId: role.id })
    );

    expect(unassignResponse.status).toBe(200);
    const unassignJson = await unassignResponse.json();
    expect(unassignJson.data.ok).toBe(true);

    // Verify removed
    const roleIdsAfter = await roleIdsForProfile(CLUB, PROFILE);
    expect(roleIdsAfter).not.toContain(role.id);
  });
});

// ── Readiness ─────────────────────────────────────────────────────────────────

describe("PUT /clubs/[clubId]/participants/[profileId]/readiness", () => {
  it("happy path: sets readiness and store reflects it", async () => {
    vi.resetModules();
    mockManager();

    const { PUT } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/readiness/route"
    );
    const response = await PUT(
      makeRequest({ formatId: FORMAT, readiness: "READY" }),
      makeParams({ clubId: CLUB, profileId: PROFILE })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.ok).toBe(true);

    const rows = await getReadiness(PROFILE);
    const row = rows.find((r) => r.formatId === FORMAT && r.profileId === PROFILE);
    expect(row).toBeDefined();
    expect(row!.readiness).toBe("READY");
  });

  it("validation: missing formatId → 400", async () => {
    vi.resetModules();
    mockManager();

    const { PUT } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/readiness/route"
    );
    const response = await PUT(
      makeRequest({ readiness: "READY" }),
      makeParams({ clubId: CLUB, profileId: PROFILE })
    );

    expect(response.status).toBe(400);
  });
});

// ── Notes ─────────────────────────────────────────────────────────────────────

describe("PUT /clubs/[clubId]/participants/[profileId]/note", () => {
  it("happy path: sets note and store reflects it", async () => {
    vi.resetModules();
    mockManager();

    const { PUT } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/note/route"
    );
    const response = await PUT(
      makeRequest({ note: "Хороший участник" }),
      makeParams({ clubId: CLUB, profileId: PROFILE })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.ok).toBe(true);

    const note = await getNote(PROFILE);
    expect(note).toBe("Хороший участник");
  });

  it("validation: note too long → 400", async () => {
    vi.resetModules();
    mockManager();

    const { PUT } = await import(
      "../src/app/api/clubs/[clubId]/participants/[profileId]/note/route"
    );
    const response = await PUT(
      makeRequest({ note: "x".repeat(4001) }),
      makeParams({ clubId: CLUB, profileId: PROFILE })
    );

    expect(response.status).toBe(400);
  });
});
