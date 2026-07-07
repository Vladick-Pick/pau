import { describe, expect, it } from "vitest";

import { mergeFormatVisitHistory } from "@/lib/pau/active-participants";
describe("mergeFormatVisitHistory", () => {
  it("returns only internal format visits and ignores external profile participation", () => {
    const history = mergeFormatVisitHistory({
      visits: [
        {
          attendedAt: new Date("2024-04-01T09:00:00.000Z"),
          formatName: "Рабочая группа",
          notes: "Был на сессии",
        },
      ],
    });

    expect(history).toEqual([
      {
        date: "2024-04-01",
        title: "Рабочая группа",
        detail: "Был на сессии",
      },
    ]);
  });

  it("does not trust external events even when titles contain configured format names", () => {
    const history = mergeFormatVisitHistory({
      visits: [],
    });

    expect(history).toEqual([]);
  });
});
