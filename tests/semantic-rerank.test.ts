import { describe, expect, it } from "vitest";

import { requestSemanticRerank } from "../src/lib/matching/semantic-rerank";

describe("semantic rerank", () => {
  it("requests a strict JSON rerank from OpenRouter", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await requestSemanticRerank({
      apiKey: "openrouter-key",
      appTitle: "ПАУ",
      model: "openai/gpt-5-mini",
      input: {
        event: {
          title: "Гостевая встреча",
          formatName: "Гостевая встреча",
        },
        formatDescription: "Живой разговор с гостями.",
        potentials: [
          {
            id: "potential-1",
            businessContext: ["IT | разработка ПО"],
            requestContext: ["ищет партнеров"],
          },
        ],
        pairs: [
          {
            pairId: "active-1::potential-1",
            activeProfileId: "active-1",
            potentialId: "potential-1",
            displayName: "Активный",
            baseScore: 0.77,
            businessContext: ["B2B SaaS"],
            usefulnessContext: ["продажи"],
            potentialContext: ["IT | разработка ПО", "ищет партнеров"],
            evidenceFields: ["business_domain"],
            risks: [],
          },
        ],
      },
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  matches: [
                    {
                      activeProfileId: "active-1",
                      potentialId: "potential-1",
                      pairId: "active-1::potential-1",
                      semanticScore: 0.84,
                      reason: "Близкий B2B SaaS контекст.",
                      introTopic: "Обсудить продажи",
                      risks: [],
                      evidenceFields: ["businessContext"],
                    },
                  ],
                }),
              },
            },
          ],
        });
      },
    });

    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer openrouter-key",
      "Content-Type": "application/json",
      "X-OpenRouter-Title": "%D0%9F%D0%90%D0%A3",
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: "openai/gpt-5-mini",
      response_format: {
        type: "json_schema",
      },
      temperature: 0.2,
    });
    expect(result.matches[0]).toMatchObject({
      activeProfileId: "active-1",
      semanticScore: 0.84,
    });
  });

  it("rejects malformed rerank responses", async () => {
    await expect(
      requestSemanticRerank({
        apiKey: "openrouter-key",
        appTitle: "ПАУ",
        model: "openai/gpt-5-mini",
        input: {
          event: { title: "Гостевая", formatName: "Гостевая" },
          formatDescription: "",
          potentials: [],
          pairs: [],
        },
        fetchImpl: async () =>
          Response.json({
            choices: [{ message: { content: JSON.stringify({ nope: [] }) } }],
          }),
      })
    ).rejects.toThrow();
  });
});
