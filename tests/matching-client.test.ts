import { describe, expect, it } from "vitest";

import { requestParticipantMatch } from "../src/lib/matching/client";

describe("matching client", () => {
  it("posts a participant profile and normalizes the match response", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await requestParticipantMatch(
      {
        apiKey: "match-secret",
        endpoint: "https://match.example.test/v1/match",
        fetchImpl: async (url, init) => {
          calls.push({ url: String(url), init: init ?? {} });
          return Response.json({
            score: 0.82,
            activeParticipantIds: ["active-1", "active-2"],
            rationale: "Схожие отрасли и формат участия.",
            suggestedFormatSlugs: ["round-table"],
          });
        },
      },
      {
        id: "participant-1",
        fullName: "Анна Иванова",
        company: "Acme",
        position: "CEO",
        city: "Москва",
        interests: ["b2b", "partnerships"],
        history: [{ formatSlug: "breakfast", attendedAt: "2026-05-01" }],
      }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://match.example.test/v1/match");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer match-secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      profile: { id: "participant-1", fullName: "Анна Иванова" },
    });
    expect(result).toEqual({
      score: 0.82,
      activeParticipantIds: ["active-1", "active-2"],
      rationale: "Схожие отрасли и формат участия.",
      suggestedFormatSlugs: ["round-table"],
    });
  });

  it("throws a readable error on failed matching API calls", async () => {
    await expect(
      requestParticipantMatch(
        {
          apiKey: "match-secret",
          endpoint: "https://match.example.test/v1/match",
          fetchImpl: async () =>
            new Response(JSON.stringify({ error: "quota" }), {
              status: 429,
              statusText: "Too Many Requests",
            }),
        },
        {
          id: "participant-1",
          fullName: "Анна Иванова",
          interests: [],
          history: [],
        }
      )
    ).rejects.toThrow("Matching API failed with 429 Too Many Requests");
  });
});
