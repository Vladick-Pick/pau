import { describe, expect, it } from "vitest";

import { summarizeFormatCard } from "../src/lib/pau/format-cards";

describe("PAU format cards", () => {
  it("summarizes a saved format for the compact palette", () => {
    expect(
      summarizeFormatCard({
        slug: "guest-meeting",
        name: "Гостевая встреча",
        description: "Знакомство потенциальных участников с клубом.",
        bitrixEventTypeIdsText: "guest, Гостевая встреча, offline",
        matchingRulesText: '{ "goal": "Релевантные участники" }',
        promptPotential: "Опиши гостя",
        promptActive: "Опиши активного",
        promptModerator: "",
        promptReport: "Сформируй отчет по расшифровке",
      })
    ).toEqual({
      bitrixLinks: ["guest", "Гостевая встреча", "offline"],
      completedPrompts: 3,
      hasMatchingRules: true,
      totalPrompts: 4,
    });
  });
});
