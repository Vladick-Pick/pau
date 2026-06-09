import { describe, expect, it } from "vitest";

import { buildLocalEventMatchResult } from "../src/lib/matching/local-event-matching";

describe("local event matching fallback", () => {
  it("returns template active participants for local review", () => {
    const result = buildLocalEventMatchResult({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-06-04T00:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
      },
      participants: [],
    });

    expect(result.activeParticipants).toHaveLength(3);
    expect(result.activeParticipants[0]).toMatchObject({
      id: "local-active-1",
      fullName: "Алексей Морозов",
      score: 0.92,
    });
    expect(result.rationale).toContain("Локальный шаблон");
  });
});
