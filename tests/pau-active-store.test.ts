import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getOrSeedClub,
  getClubRules,
  updateRule,
  listRoles,
  createRole,
  deleteRole,
  assignRole,
  unassignRole,
  roleIdsForProfile,
  setReadiness,
  getReadiness,
  setNote,
  getNote,
  upsertMemberProfile,
  listMembers,
  getMember,
} from "@/lib/pau/active-store";

const CLUB = "ws_test_store";
const CLUB2 = "ws_test_store2";

beforeAll(async () => {
  // Clean up any leftover state from a previous run
  await prisma.club.deleteMany({ where: { id: { startsWith: "ws_test_store" } } });
});

afterAll(async () => {
  await prisma.club.deleteMany({ where: { id: { startsWith: "ws_test_store" } } });
});

describe("getOrSeedClub", () => {
  it("seeds exactly 5 rules on first call", async () => {
    await getOrSeedClub(CLUB, "Test Club");
    const rules = await getClubRules(CLUB);
    expect(rules).toHaveLength(5);
  });

  it("is idempotent — second call does not add duplicates", async () => {
    await getOrSeedClub(CLUB, "Test Club Updated");
    const rules = await getClubRules(CLUB);
    expect(rules).toHaveLength(5);
  });

  it("returns rules ordered by sortOrder ascending", async () => {
    const rules = await getClubRules(CLUB);
    const orders = rules.map((r) => r.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe("updateRule", () => {
  it("changes config and enabled on a rule", async () => {
    const rules = await getClubRules(CLUB);
    const rule = rules[0];
    const updated = await updateRule(rule.id, {
      config: { min: 99 },
      enabled: false,
    });
    expect(updated.config).toEqual({ min: 99 });
    expect(updated.enabled).toBe(false);
  });

  it("changes label on a rule", async () => {
    const rules = await getClubRules(CLUB);
    const rule = rules[1];
    const updated = await updateRule(rule.id, { label: "New Label" });
    expect(updated.label).toBe("New Label");
  });
});

describe("roles", () => {
  let roleId: string;

  it("creates a role and lists it with count 0", async () => {
    const role = await createRole(CLUB, "Спикер", "Выступает на встречах");
    roleId = role.id;
    expect(role.name).toBe("Спикер");
    const list = await listRoles(CLUB);
    const found = list.find((r) => r.id === roleId);
    expect(found).toBeDefined();
    expect(found!.count).toBe(0);
  });

  it("assignRole adds an assignment and listRoles shows count 1", async () => {
    await assignRole(roleId, "profile_001");
    const list = await listRoles(CLUB);
    const found = list.find((r) => r.id === roleId);
    expect(found!.count).toBe(1);
  });

  it("assignRole is idempotent — calling twice results in one assignment", async () => {
    await assignRole(roleId, "profile_001");
    const list = await listRoles(CLUB);
    const found = list.find((r) => r.id === roleId);
    expect(found!.count).toBe(1);
  });

  it("roleIdsForProfile returns the roleId for the assigned profile", async () => {
    const ids = await roleIdsForProfile(CLUB, "profile_001");
    expect(ids).toContain(roleId);
  });

  it("unassignRole removes the assignment", async () => {
    await unassignRole(roleId, "profile_001");
    const list = await listRoles(CLUB);
    const found = list.find((r) => r.id === roleId);
    expect(found!.count).toBe(0);
  });

  it("deleteRole removes the role", async () => {
    await deleteRole(roleId);
    const list = await listRoles(CLUB);
    expect(list.find((r) => r.id === roleId)).toBeUndefined();
  });
});

describe("setReadiness / getReadiness", () => {
  it("upserts readiness — set READY then NOT_READY results in one row with NOT_READY", async () => {
    await getOrSeedClub(CLUB, "Test Club");
    await setReadiness(CLUB, "profile_002", "format_abc", "READY");
    await setReadiness(CLUB, "profile_002", "format_abc", "NOT_READY");
    const rows = await getReadiness("profile_002");
    const row = rows.find((r) => r.formatId === "format_abc");
    expect(row).toBeDefined();
    expect(row!.readiness).toBe("NOT_READY");
    // Only one row for this (profileId, formatId) pair
    const duplicates = rows.filter((r) => r.formatId === "format_abc");
    expect(duplicates).toHaveLength(1);
  });
});

describe("setNote / getNote", () => {
  it("upserts a note and retrieves it", async () => {
    await getOrSeedClub(CLUB, "Test Club");
    await setNote(CLUB, "profile_003", "Initial note");
    const note = await getNote("profile_003");
    expect(note).toBe("Initial note");
  });

  it("overwrites the note on second call — still one row", async () => {
    await setNote(CLUB, "profile_003", "Updated note");
    const note = await getNote("profile_003");
    expect(note).toBe("Updated note");
  });

  it("returns null when no note exists", async () => {
    const note = await getNote("profile_no_note_999");
    expect(note).toBeNull();
  });
});

describe("upsertMemberProfile", () => {
  const baseInput = {
    clubId: CLUB,
    profileId: "profile_mem_001",
    displayName: "Иван Иванов",
    stateCode: "active",
    facts: {
      tenureYear: 3,
      retention: null,
      attendance: null,
      paymentPhase: "mid" as const,
      businessBand: 2,
    },
    dossier: {
      company: "ООО Рога",
      revenue: "100M",
      industry: "tech",
      position: "CEO",
      city: "Москва",
      age: 40,
      interests: "golf",
      canBeUseful: "yes",
      clubGoals: "network",
      telegram: "@ivan",
    },
    participation: [{ date: "2024-01-01", title: "Митап", detail: "Speaker" }],
    profileUpdatedAt: new Date("2024-06-01"),
  };

  it("creates a member profile on first upsert", async () => {
    await getOrSeedClub(CLUB, "Test Club");
    await upsertMemberProfile(baseInput);
    const member = await getMember(CLUB, "profile_mem_001");
    expect(member).not.toBeNull();
    expect(member!.displayName).toBe("Иван Иванов");
    expect(member!.tenureYear).toBe(3);
  });

  it("persists null retention and attendance as null (not 0)", async () => {
    const member = await getMember(CLUB, "profile_mem_001");
    expect(member!.retention).toBeNull();
    expect(member!.attendance).toBeNull();
  });

  it("round-trips dossier and participation as JSON", async () => {
    const member = await getMember(CLUB, "profile_mem_001");
    expect(member!.dossier).toEqual(baseInput.dossier);
    expect(member!.participation).toEqual(baseInput.participation);
  });

  it("is idempotent — second upsert results in one row", async () => {
    await upsertMemberProfile(baseInput);
    const members = await listMembers(CLUB);
    const rows = members.filter((m) => m.profileId === "profile_mem_001");
    expect(rows).toHaveLength(1);
  });

  it("updates fields on second upsert", async () => {
    await upsertMemberProfile({ ...baseInput, displayName: "Иван Сидоров" });
    const member = await getMember(CLUB, "profile_mem_001");
    expect(member!.displayName).toBe("Иван Сидоров");
  });

  it("does NOT delete an existing note for the same profileId (reconcile-not-clobber)", async () => {
    await setNote(CLUB, "profile_mem_001", "Manager note");
    await upsertMemberProfile(baseInput);
    const note = await getNote("profile_mem_001");
    expect(note).toBe("Manager note");
  });

  it("does NOT delete an existing role assignment for the same profileId", async () => {
    const role = await createRole(CLUB, "Фасилитатор");
    await assignRole(role.id, "profile_mem_001");
    await upsertMemberProfile(baseInput);
    const ids = await roleIdsForProfile(CLUB, "profile_mem_001");
    expect(ids).toContain(role.id);
  });
});

describe("listMembers", () => {
  it("returns all members when no filter", async () => {
    await getOrSeedClub(CLUB2, "Second Club");
    await upsertMemberProfile({
      clubId: CLUB2,
      profileId: "profile_list_001",
      displayName: "Alice",
      stateCode: "active",
      facts: { tenureYear: 1, retention: 80, attendance: 75, paymentPhase: "mid", businessBand: 1 },
      dossier: { company: null, revenue: null, industry: null, position: null, city: null, age: null, interests: null, canBeUseful: null, clubGoals: null, telegram: null },
      participation: [],
      profileUpdatedAt: null,
    });
    await upsertMemberProfile({
      clubId: CLUB2,
      profileId: "profile_list_002",
      displayName: "Bob",
      stateCode: "inactive",
      facts: { tenureYear: 2, retention: 60, attendance: 50, paymentPhase: "end", businessBand: 2 },
      dossier: { company: null, revenue: null, industry: null, position: null, city: null, age: null, interests: null, canBeUseful: null, clubGoals: null, telegram: null },
      participation: [],
      profileUpdatedAt: null,
    });
    const all = await listMembers(CLUB2);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by stateCode", async () => {
    const active = await listMembers(CLUB2, { stateCode: "active" });
    expect(active.every((m) => m.stateCode === "active")).toBe(true);
    const inactive = await listMembers(CLUB2, { stateCode: "inactive" });
    expect(inactive.every((m) => m.stateCode === "inactive")).toBe(true);
  });
});
