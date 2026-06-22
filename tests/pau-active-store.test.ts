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
  roleIdsByProfile,
  readinessByProfile,
  upsertMemberProfile,
  listMembers,
  getMember,
  NotFoundError,
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
    const updated = await updateRule(CLUB, rule.id, {
      config: { min: 99 },
      enabled: false,
    });
    expect(updated.config).toEqual({ min: 99 });
    expect(updated.enabled).toBe(false);
  });

  it("changes label on a rule", async () => {
    const rules = await getClubRules(CLUB);
    const rule = rules[1];
    const updated = await updateRule(CLUB, rule.id, { label: "New Label" });
    expect(updated.label).toBe("New Label");
  });

  it("throws NotFoundError when the rule belongs to a different club", async () => {
    await getOrSeedClub(CLUB2, "Second Club");
    const rules = await getClubRules(CLUB);
    const rule = rules[0];
    // CLUB2 does not own this rule → must not update it.
    await expect(
      updateRule(CLUB2, rule.id, { label: "Hijacked" })
    ).rejects.toBeInstanceOf(NotFoundError);
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
    await assignRole(CLUB, roleId, "profile_001");
    const list = await listRoles(CLUB);
    const found = list.find((r) => r.id === roleId);
    expect(found!.count).toBe(1);
  });

  it("assignRole is idempotent — calling twice results in one assignment", async () => {
    await assignRole(CLUB, roleId, "profile_001");
    const list = await listRoles(CLUB);
    const found = list.find((r) => r.id === roleId);
    expect(found!.count).toBe(1);
  });

  it("roleIdsForProfile returns the roleId for the assigned profile", async () => {
    const ids = await roleIdsForProfile(CLUB, "profile_001");
    expect(ids).toContain(roleId);
  });

  it("assignRole throws NotFoundError when the role belongs to a different club", async () => {
    await getOrSeedClub(CLUB2, "Second Club");
    await expect(
      assignRole(CLUB2, roleId, "profile_001")
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("unassignRole removes the assignment", async () => {
    await unassignRole(CLUB, roleId, "profile_001");
    const list = await listRoles(CLUB);
    const found = list.find((r) => r.id === roleId);
    expect(found!.count).toBe(0);
  });

  it("deleteRole throws NotFoundError when the role belongs to a different club", async () => {
    await getOrSeedClub(CLUB2, "Second Club");
    await expect(deleteRole(CLUB2, roleId)).rejects.toBeInstanceOf(
      NotFoundError
    );
    // Still present in its real club.
    const list = await listRoles(CLUB);
    expect(list.find((r) => r.id === roleId)).toBeDefined();
  });

  it("deleteRole removes the role", async () => {
    await deleteRole(CLUB, roleId);
    const list = await listRoles(CLUB);
    expect(list.find((r) => r.id === roleId)).toBeUndefined();
  });
});

describe("setReadiness / getReadiness", () => {
  it("upserts readiness — set READY then NOT_READY results in one row with NOT_READY", async () => {
    await getOrSeedClub(CLUB, "Test Club");
    await setReadiness(CLUB, "profile_002", "format_abc", "READY");
    await setReadiness(CLUB, "profile_002", "format_abc", "NOT_READY");
    const rows = await getReadiness(CLUB, "profile_002");
    const row = rows.find((r) => r.formatId === "format_abc");
    expect(row).toBeDefined();
    expect(row!.readiness).toBe("NOT_READY");
    // Only one row for this (clubId, profileId, formatId) tuple
    const duplicates = rows.filter((r) => r.formatId === "format_abc");
    expect(duplicates).toHaveLength(1);
  });

  it("scopes getReadiness to the club", async () => {
    const rows = await getReadiness(CLUB, "profile_002");
    expect(rows.every((r) => r.clubId === CLUB)).toBe(true);
  });
});

describe("setNote / getNote", () => {
  it("upserts a note and retrieves it", async () => {
    await getOrSeedClub(CLUB, "Test Club");
    await setNote(CLUB, "profile_003", "Initial note");
    const note = await getNote(CLUB, "profile_003");
    expect(note).toBe("Initial note");
  });

  it("overwrites the note on second call — still one row", async () => {
    await setNote(CLUB, "profile_003", "Updated note");
    const note = await getNote(CLUB, "profile_003");
    expect(note).toBe("Updated note");
  });

  it("returns null when no note exists", async () => {
    const note = await getNote(CLUB, "profile_no_note_999");
    expect(note).toBeNull();
  });

  it("scopes notes per club — same profileId in another club is independent", async () => {
    await getOrSeedClub(CLUB2, "Second Club");
    await setNote(CLUB, "profile_shared_note", "club one note");
    await setNote(CLUB2, "profile_shared_note", "club two note");
    expect(await getNote(CLUB, "profile_shared_note")).toBe("club one note");
    expect(await getNote(CLUB2, "profile_shared_note")).toBe("club two note");
  });
});

describe("bulk helpers", () => {
  it("roleIdsByProfile groups assignments by profile in one query", async () => {
    await getOrSeedClub(CLUB, "Test Club");
    const role = await createRole(CLUB, "Bulk Role");
    await assignRole(CLUB, role.id, "bulk_profile_1");
    await assignRole(CLUB, role.id, "bulk_profile_2");

    const map = await roleIdsByProfile(CLUB);
    expect(map.get("bulk_profile_1")).toContain(role.id);
    expect(map.get("bulk_profile_2")).toContain(role.id);
  });

  it("readinessByProfile groups readiness rows by profile in one query", async () => {
    await getOrSeedClub(CLUB, "Test Club");
    await setReadiness(CLUB, "bulk_profile_1", "bulk_format_1", "READY");

    const map = await readinessByProfile(CLUB);
    const rows = map.get("bulk_profile_1") ?? [];
    const row = rows.find((r) => r.formatId === "bulk_format_1");
    expect(row).toBeDefined();
    expect(row!.readiness).toBe("READY");
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
    const note = await getNote(CLUB, "profile_mem_001");
    expect(note).toBe("Manager note");
  });

  it("does NOT delete an existing role assignment for the same profileId", async () => {
    const role = await createRole(CLUB, "Фасилитатор");
    await assignRole(CLUB, role.id, "profile_mem_001");
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
