import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getOrSeedClub,
  listMembers,
  setNote,
  getNote,
  getMember,
} from "@/lib/pau/active-store";
import type { ProfileSource } from "@/lib/profile/sync";
import { syncClub } from "@/lib/profile/sync";
import type {
  Workspace,
  ProfileSearchItem,
  ProfileEnvelopeData,
  BusinessEvent,
} from "@/lib/profile/types";

// ── Shared canned data ─────────────────────────────────────────────────────────

const CLUB_ID = "ws_test_sync";

function makeSearchItem(id: string): ProfileSearchItem {
  return {
    id,
    workspace_id: CLUB_ID,
    display_name: `Member ${id}`,
    primary_email: `${id}@example.com`,
    primary_phone: null,
    categories: [],
    states: [{ code: "active", name: "Участник" }],
    profile_updated_at: "2024-06-01T00:00:00.000Z",
  };
}

function makeProfile(id: string): ProfileEnvelopeData {
  return {
    id,
    workspace_id: CLUB_ID,
    display_name: `Member ${id}`,
    profile_updated_at: "2024-06-01T00:00:00.000Z",
    profile: {
      community: {
        attendance: {
          forums: [{ membership_year: 3 }],
        },
      },
      membership: {
        deals: [
          {
            begin_at: "2022-01-01",
            close_at: "2026-12-31",
          },
        ],
      },
      business: {
        companies: [
          {
            company: `Company ${id}`,
            revenue: "150000000",
            industries: [{ display_name: "Tech" }],
          },
        ],
      },
      profile_text: {
        can_be_useful: "консультации",
        club_goals: "нетворкинг",
      },
    },
  };
}

function makeForumEvent(id: string): BusinessEvent {
  return {
    id: `evt_${id}`,
    event_type: "community.forum_attended",
    event_type_label: "Посетил форум",
    category: "community",
    title: "Весенний форум 2024",
    happened_at: "2024-04-15T10:00:00.000Z",
    observed_at: "2024-04-15T10:00:00.000Z",
    importance: 1,
    current_value: { event_name: "Весенний форум 2024" },
    attributes: {},
  };
}

// ── Stub ProfileSource (happy path — 2 members) ────────────────────────────────

function makeHappyStub(): ProfileSource {
  const members = ["member_a", "member_b"].map(makeSearchItem);
  return {
    listWorkspaces: async (): Promise<Workspace[]> => [
      { id: CLUB_ID, name: "Тестовый клуб", status: "active" },
    ],
    collectProfiles: async (): Promise<ProfileSearchItem[]> => members,
    getProfile: async (id: string): Promise<ProfileEnvelopeData> =>
      makeProfile(id),
    collectBusinessEvents: async (id: string): Promise<BusinessEvent[]> => [
      makeForumEvent(id),
    ],
  };
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeAll(async () => {
  await prisma.club.deleteMany({ where: { id: { startsWith: "ws_test_sync" } } });
});

afterAll(async () => {
  await prisma.club.deleteMany({ where: { id: { startsWith: "ws_test_sync" } } });
  await prisma.$disconnect();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("syncClub — happy path", () => {
  it("returns { synced: 2, failed: 0 } for 2 active members", async () => {
    const result = await syncClub(CLUB_ID, makeHappyStub(), "Тестовый клуб");
    expect(result).toEqual({ clubId: CLUB_ID, synced: 2, failed: 0 });
  });

  it("listMembers returns 2 active rows after sync", async () => {
    const members = await listMembers(CLUB_ID, { stateCode: "active" });
    expect(members).toHaveLength(2);
  });

  it("retention and attendance columns are null (not computed yet)", async () => {
    const members = await listMembers(CLUB_ID, { stateCode: "active" });
    for (const m of members) {
      expect(m.retention).toBeNull();
      expect(m.attendance).toBeNull();
    }
  });

  it("tenureYear is populated from community.attendance.forums", async () => {
    const members = await listMembers(CLUB_ID, { stateCode: "active" });
    for (const m of members) {
      expect(m.tenureYear).toBe(3);
    }
  });

  it("dossier JSON is populated", async () => {
    const members = await listMembers(CLUB_ID, { stateCode: "active" });
    for (const m of members) {
      const dossier = m.dossier as Record<string, unknown>;
      expect(typeof dossier).toBe("object");
      // deriveDossier picks up canBeUseful and clubGoals
      expect(dossier.canBeUseful).toBe("консультации");
      expect(dossier.clubGoals).toBe("нетворкинг");
    }
  });

  it("participation has at least one entry (forum_attended event)", async () => {
    const members = await listMembers(CLUB_ID, { stateCode: "active" });
    for (const m of members) {
      const participation = m.participation as unknown[];
      expect(Array.isArray(participation)).toBe(true);
      expect(participation.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("syncClub — reconcile-not-clobber", () => {
  it("preserves an existing note across re-sync", async () => {
    const memberId = "member_a";
    await setNote(CLUB_ID, memberId, "keep me");

    // Re-run sync — should not wipe the note
    await syncClub(CLUB_ID, makeHappyStub(), "Тестовый клуб");

    const note = await getNote(memberId);
    expect(note).toBe("keep me");
  });
});

describe("syncClub — partial failure tolerance", () => {
  it("counts failed:1 and still syncs the other member when getProfile throws for one", async () => {
    // Clean slate for this sub-test so we can assert freshly
    await prisma.club.deleteMany({ where: { id: "ws_test_sync_partial" } });

    const partialClubId = "ws_test_sync_partial";
    const badStub: ProfileSource = {
      listWorkspaces: async () => [],
      collectProfiles: async () =>
        ["ok_member", "bad_member"].map((id) => ({
          ...makeSearchItem(id),
          workspace_id: partialClubId,
        })),
      getProfile: async (id: string): Promise<ProfileEnvelopeData> => {
        if (id === "bad_member") {
          throw new Error("Profile API unavailable");
        }
        return { ...makeProfile(id), workspace_id: partialClubId };
      },
      collectBusinessEvents: async () => [],
    };

    const result = await syncClub(partialClubId, badStub, "Partial Club");

    expect(result.failed).toBe(1);
    expect(result.synced).toBe(1);

    // The successful member must be in the DB
    const members = await listMembers(partialClubId);
    expect(members.some((m) => m.profileId === "ok_member")).toBe(true);

    await prisma.club.deleteMany({ where: { id: "ws_test_sync_partial" } });
  });
});
