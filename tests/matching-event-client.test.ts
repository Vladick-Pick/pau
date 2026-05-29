import { describe, expect, it } from "vitest";

import { requestEventMatch } from "../src/lib/matching/client";

describe("event matching client", () => {
  it("posts an event batch and normalizes active participant matches", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await requestEventMatch(
      {
        apiKey: "match-secret",
        endpoint: "https://match.example.test/v1/events/match",
        fetchImpl: async (url, init) => {
          calls.push({ url: String(url), init: init ?? {} });
          return Response.json({
            activeParticipants: [
              {
                id: "active-1",
                fullName: "Борис Смирнов",
                score: 0.91,
                rationale: "Похожий запрос по партнерствам.",
              },
            ],
            rationale: "Подобран один активный участник.",
          });
        },
      },
      {
        event: {
          id: "event-1",
          title: "Гостевая встреча",
          startsAt: "2026-05-28T16:00:00.000Z",
          formatSlug: "guest-meeting",
        },
        format: {
          slug: "guest-meeting",
          name: "Гостевая встреча",
          matchingInstructions: "Подбирать по бизнес-контексту и запросу.",
        },
        participants: [
          {
            id: "participant-1",
            fullName: "Анна Иванова",
            status: "CONFIRMED",
            participantKind: "POTENTIAL",
            businessContext: ["B2B SaaS"],
          },
        ],
      }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer match-secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      event: { id: "event-1", title: "Гостевая встреча" },
      format: { slug: "guest-meeting" },
      participants: [{ id: "participant-1", fullName: "Анна Иванова" }],
    });
    expect(result).toEqual({
      activeParticipants: [
        {
          id: "active-1",
          fullName: "Борис Смирнов",
          score: 0.91,
          rationale: "Похожий запрос по партнерствам.",
          profile: null,
        },
      ],
      rationale: "Подобран один активный участник.",
    });
  });
});
