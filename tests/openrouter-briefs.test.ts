import { describe, expect, it } from "vitest";

import {
  generateBriefWithOpenRouter,
  generateReportWithOpenRouter,
} from "../src/lib/briefs/openrouter";

describe("OpenRouter brief generation", () => {
  it("requests a strict structured brief and parses the content", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const brief = await generateBriefWithOpenRouter({
      apiKey: "openrouter-secret",
      appTitle: "ПАУ",
      model: "openai/gpt-5-mini",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Анна строит B2B-партнерства.",
                  talkingPoints: ["Спросить про партнерские каналы"],
                  risks: ["Нет истории посещений"],
                  nextSteps: ["Позвать на круглый стол"],
                }),
              },
            },
          ],
        });
      },
      input: {
        briefType: "POTENTIAL",
        participant: {
          fullName: "Анна Иванова",
          status: "POTENTIAL",
          company: "Acme",
          position: "CEO",
          city: "Москва",
        },
        format: {
          name: "Круглый стол",
          description: "Закрытая встреча для обмена опытом.",
        },
        match: {
          score: 0.82,
          rationale: "Схожие отрасли.",
          activeParticipantIds: ["active-1"],
          suggestedFormatSlugs: ["round-table"],
        },
        attendanceHistory: [],
      },
    });

    expect(calls[0].url).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer openrouter-secret",
      "Content-Type": "application/json",
      "X-OpenRouter-Title": "ПАУ",
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: "openai/gpt-5-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pau_brief",
          strict: true,
        },
      },
      stream: false,
    });
    expect(brief).toEqual({
      summary: "Анна строит B2B-партнерства.",
      talkingPoints: ["Спросить про партнерские каналы"],
      risks: ["Нет истории посещений"],
      nextSteps: ["Позвать на круглый стол"],
    });
  });
});

describe("OpenRouter report generation", () => {
  it("requests a strict structured report from transcript context", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const report = await generateReportWithOpenRouter({
      apiKey: "openrouter-secret",
      appTitle: "ПАУ",
      model: "openai/gpt-5-mini",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Участники договорились о следующих шагах.",
                  keyPoints: ["Партнерские каналы", "Подбор активных"],
                  decisions: ["Собрать интро после встречи"],
                  nextSteps: ["Отправить follow-up"],
                }),
              },
            },
          ],
        });
      },
      input: {
        eventTitle: "Гостевая встреча 28.05",
        formatName: "Гостевая встреча",
        prompt: "Сформируй отчет по расшифровке",
        transcript: "Текст записи встречи.",
      },
    });

    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: "openai/gpt-5-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pau_event_report",
          strict: true,
        },
      },
      stream: false,
    });
    expect(report).toEqual({
      summary: "Участники договорились о следующих шагах.",
      keyPoints: ["Партнерские каналы", "Подбор активных"],
      decisions: ["Собрать интро после встречи"],
      nextSteps: ["Отправить follow-up"],
    });
  });
});
