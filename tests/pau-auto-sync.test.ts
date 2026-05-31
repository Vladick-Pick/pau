import { describe, expect, it } from "vitest";

import {
  BITRIX_AUTO_SYNC_INTERVAL_MS,
  BITRIX_AUTO_SYNC_LOCK_TTL_MS,
  buildBitrixAutoSyncSearchPlan,
  collectBitrixAutoSyncCandidatesSequentially,
  getBitrixAutoSyncLeaseExpiresAt,
  groupBitrixAutoSyncEventIdsByVisitCursor,
  isBitrixAutoSyncLeaseExpired,
  selectBitrixAutoSyncQueries,
  shouldResetBitrixAutoSyncCursor,
  shouldRunBitrixAutoSync,
} from "../src/lib/pau/auto-sync";

describe("PAU Bitrix auto sync", () => {
  it("uses unique non-empty format title queries for hourly Bitrix search", () => {
    expect(
      selectBitrixAutoSyncQueries([
        { bitrixSyncTitleQuery: " Гостевая встреча " },
        { bitrixSyncTitleQuery: "" },
        { bitrixSyncTitleQuery: null },
        { bitrixSyncTitleQuery: "Рабочая группа" },
        { bitrixSyncTitleQuery: "Гостевая встреча" },
      ])
    ).toEqual(["Гостевая встреча", "Рабочая группа"]);
  });

  it("keeps event discovery unbounded while applying per-query cursors to visits", () => {
    const cursorAt = new Date("2026-05-29T10:00:00.000Z");

    expect(
      buildBitrixAutoSyncSearchPlan(
        [
          { bitrixSyncTitleQuery: "Гостевая встреча" },
          { bitrixSyncTitleQuery: "Рабочая группа" },
        ],
        [{ query: "Гостевая встреча", lastSyncedAt: cursorAt }]
      )
    ).toEqual([
      {
        eventModifiedAfter: null,
        query: "Гостевая встреча",
        visitModifiedAfter: "2026-05-29T10:00:00.000Z",
      },
      {
        eventModifiedAfter: null,
        query: "Рабочая группа",
        visitModifiedAfter: null,
      },
    ]);
  });

  it("runs Bitrix title searches sequentially to preserve request throttling", async () => {
    const calls: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await collectBitrixAutoSyncCandidatesSequentially(
      [
        {
          eventModifiedAfter: null,
          query: "Гостевая встреча",
          visitModifiedAfter: "2026-05-29T10:00:00.000Z",
        },
        {
          eventModifiedAfter: null,
          query: "Рабочая группа",
          visitModifiedAfter: null,
        },
      ],
      async (search) => {
        calls.push(`start:${search.query}`);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        calls.push(`end:${search.query}`);
        return [{ eventId: search.query }];
      }
    );

    expect(maxInFlight).toBe(1);
    expect(calls).toEqual([
      "start:Гостевая встреча",
      "end:Гостевая встреча",
      "start:Рабочая группа",
      "end:Рабочая группа",
    ]);
    expect(results.map((result) => result.candidates[0]?.eventId)).toEqual([
      "Гостевая встреча",
      "Рабочая группа",
    ]);
  });

  it("uses the earliest visit cursor when several queries find the same event", () => {
    expect(
      groupBitrixAutoSyncEventIdsByVisitCursor([
        {
          search: { visitModifiedAfter: "2026-05-29T10:00:00.000Z" },
          candidates: [{ eventId: "event-1" }, { eventId: "event-2" }],
        },
        {
          search: { visitModifiedAfter: null },
          candidates: [{ eventId: "event-1" }, { eventId: "event-3" }],
        },
        {
          search: { visitModifiedAfter: "2026-05-29T09:00:00.000Z" },
          candidates: [{ eventId: "event-2" }],
        },
      ])
    ).toEqual([
      {
        modifiedAfter: null,
        eventIds: ["event-1", "event-3"],
      },
      {
        modifiedAfter: "2026-05-29T09:00:00.000Z",
        eventIds: ["event-2"],
      },
    ]);
  });

  it("runs immediately when never synced and then only after the interval", () => {
    const now = new Date("2026-05-29T12:00:00.000Z");

    expect(
      shouldRunBitrixAutoSync({
        intervalMs: BITRIX_AUTO_SYNC_INTERVAL_MS,
        lastStartedAt: null,
        now,
        running: false,
      })
    ).toBe(true);

    expect(
      shouldRunBitrixAutoSync({
        intervalMs: BITRIX_AUTO_SYNC_INTERVAL_MS,
        lastStartedAt: new Date("2026-05-29T11:30:00.000Z"),
        now,
        running: false,
      })
    ).toBe(false);

    expect(
      shouldRunBitrixAutoSync({
        intervalMs: BITRIX_AUTO_SYNC_INTERVAL_MS,
        lastStartedAt: new Date("2026-05-29T11:00:00.000Z"),
        now,
        running: false,
      })
    ).toBe(true);

    expect(
      shouldRunBitrixAutoSync({
        intervalMs: BITRIX_AUTO_SYNC_INTERVAL_MS,
        lastStartedAt: new Date("2026-05-29T10:00:00.000Z"),
        now,
        running: true,
      })
    ).toBe(false);
  });

  it("expires an auto-sync lease after its ttl", () => {
    const lockedAt = new Date("2026-05-29T12:00:00.000Z");
    const expiresAt = getBitrixAutoSyncLeaseExpiresAt(lockedAt);

    expect(expiresAt.getTime() - lockedAt.getTime()).toBe(
      BITRIX_AUTO_SYNC_LOCK_TTL_MS
    );
    expect(
      isBitrixAutoSyncLeaseExpired(
        expiresAt,
        new Date(expiresAt.getTime() - 1)
      )
    ).toBe(false);
    expect(isBitrixAutoSyncLeaseExpired(expiresAt, expiresAt)).toBe(true);
  });

  it("resets the cursor when a format title query changes", () => {
    expect(
      shouldResetBitrixAutoSyncCursor("Гостевая встреча", "Гостевая встреча")
    ).toBe(false);
    expect(shouldResetBitrixAutoSyncCursor("Гостевая встреча", "  ")).toBe(false);
    expect(
      shouldResetBitrixAutoSyncCursor("Гостевая встреча", "Рабочая группа")
    ).toBe(true);
    expect(shouldResetBitrixAutoSyncCursor(null, "Рабочая группа")).toBe(true);
  });
});
