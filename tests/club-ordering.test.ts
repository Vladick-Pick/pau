import type { Club } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { sortClubsForDefaultSelection } from "@/lib/pau/club-ordering";

function club(id: string, name: string): Club {
  return {
    id,
    name,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("sortClubsForDefaultSelection", () => {
  it("puts Club First One before Future for the default club selector", () => {
    const sorted = sortClubsForDefaultSelection([
      club("ws_cff", "Club First Future"),
      club("ws_other", "Another Club"),
      club("ws_cf1", "Club First One"),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "ws_cf1",
      "ws_other",
      "ws_cff",
    ]);
  });
});
