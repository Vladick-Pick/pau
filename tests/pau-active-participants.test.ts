import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getOrSeedClub,
  upsertMemberProfile,
  createRole,
  assignRole,
} from "@/lib/pau/active-store";
import {
  getActiveParticipants,
  getParticipantDetail,
} from "@/lib/pau/active-participants";

const CLUB = "ws_test_ap";

const DOSSIER = {
  company: "TestCo",
  revenue: "50M",
  industry: "tech",
  position: "CEO",
  city: "Москва",
  age: 35,
  interests: "chess",
  canBeUseful: "consulting",
  clubGoals: "network",
  telegram: "@tester",
};

const PARTICIPATION = [
  { date: "2024-03-01", title: "Встреча", detail: "Speaker" },
];

beforeAll(async () => {
  // Clean up any leftover state
  await prisma.club.deleteMany({ where: { id: { startsWith: "ws_test" } } });

  // Seed club (seeds default rules: tenure+payment ENABLED, retention+attendance+activity DISABLED)
  await getOrSeedClub(CLUB, "Test");

  // Member A: tenureYear=3, paymentPhase="mid" → should PASS enabled rules
  await upsertMemberProfile({
    clubId: CLUB,
    profileId: "pA",
    displayName: "Alice Active",
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
    profileUpdatedAt: new Date("2024-06-01"),
  });

  // Member B: tenureYear=1, paymentPhase="mid" → fails tenure (min=2)
  await upsertMemberProfile({
    clubId: CLUB,
    profileId: "pB",
    displayName: "Bob Beginner",
    stateCode: "active",
    facts: {
      tenureYear: 1,
      retention: null,
      attendance: null,
      paymentPhase: "mid",
      businessBand: null,
    },
    dossier: DOSSIER,
    participation: [],
    profileUpdatedAt: null,
  });
});

afterAll(async () => {
  await prisma.club.deleteMany({ where: { id: { startsWith: "ws_test" } } });
  await prisma.$disconnect();
});

describe("getActiveParticipants", () => {
  it("A passes all enabled rules (tenure≥2 ok, payment mid ok)", async () => {
    const summaries = await getActiveParticipants(CLUB);
    const a = summaries.find((s) => s.profileId === "pA");
    expect(a).toBeDefined();
    expect(a!.evaluation.passed).toBe(true);
    expect(a!.evaluation.failedKeys).toEqual([]);
    expect(a!.evaluation.missingKeys).toEqual([]);
  });

  it("B fails tenure rule (tenureYear=1 < min=2)", async () => {
    const summaries = await getActiveParticipants(CLUB);
    const b = summaries.find((s) => s.profileId === "pB");
    expect(b).toBeDefined();
    expect(b!.evaluation.passed).toBe(false);
    expect(b!.evaluation.failedKeys).toContain("tenure");
  });

  it("disabled rules (retention, attendance, activity) do not appear in failed or missing", async () => {
    const summaries = await getActiveParticipants(CLUB);
    for (const s of summaries) {
      expect(s.evaluation.failedKeys).not.toContain("retention");
      expect(s.evaluation.failedKeys).not.toContain("attendance");
      expect(s.evaluation.failedKeys).not.toContain("activity");
      expect(s.evaluation.missingKeys).not.toContain("retention");
      expect(s.evaluation.missingKeys).not.toContain("attendance");
      expect(s.evaluation.missingKeys).not.toContain("activity");
    }
  });

  it("sort: passed member (A) appears before failed member (B)", async () => {
    const summaries = await getActiveParticipants(CLUB);
    const idxA = summaries.findIndex((s) => s.profileId === "pA");
    const idxB = summaries.findIndex((s) => s.profileId === "pB");
    expect(idxA).toBeLessThan(idxB);
  });

  it("summaries include displayName, stateCode, facts, roleIds, readiness", async () => {
    const summaries = await getActiveParticipants(CLUB);
    const a = summaries.find((s) => s.profileId === "pA")!;
    expect(a.displayName).toBe("Alice Active");
    expect(a.stateCode).toBe("active");
    expect(a.facts.tenureYear).toBe(3);
    expect(a.facts.paymentPhase).toBe("mid");
    expect(Array.isArray(a.roleIds)).toBe(true);
    expect(Array.isArray(a.readiness)).toBe(true);
  });

  it("after assigning a role to A, A.roleIds is non-empty", async () => {
    const role = await createRole(CLUB, "Спикер");
    await assignRole(role.id, "pA");

    const summaries = await getActiveParticipants(CLUB);
    const a = summaries.find((s) => s.profileId === "pA")!;
    expect(a.roleIds.length).toBeGreaterThan(0);
    // Activity rule is disabled, so evaluation.passed stays true
    expect(a.evaluation.passed).toBe(true);
  });
});

describe("getParticipantDetail", () => {
  it("returns null for non-existent profileId", async () => {
    const result = await getParticipantDetail(CLUB, "nope");
    expect(result).toBeNull();
  });

  it("returns full detail for pA including dossier, participation, note, rules", async () => {
    const detail = await getParticipantDetail(CLUB, "pA");
    expect(detail).not.toBeNull();
    expect(detail!.profileId).toBe("pA");
    expect(detail!.dossier.company).toBe("TestCo");
    expect(detail!.participation).toEqual(PARTICIPATION);
    expect(detail!.note).toBeNull(); // no note set
    expect(Array.isArray(detail!.rules)).toBe(true);
    expect(detail!.rules.length).toBeGreaterThan(0);
  });

  it("detail evaluation matches summary evaluation for pA", async () => {
    const summaries = await getActiveParticipants(CLUB);
    const summary = summaries.find((s) => s.profileId === "pA")!;
    const detail = await getParticipantDetail(CLUB, "pA");
    expect(detail!.evaluation.passed).toBe(summary.evaluation.passed);
    expect(detail!.evaluation.failedKeys).toEqual(summary.evaluation.failedKeys);
  });
});
