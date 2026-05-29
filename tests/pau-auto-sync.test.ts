import { describe, expect, it } from "vitest";

import {
  BITRIX_AUTO_SYNC_INTERVAL_MS,
  BITRIX_AUTO_SYNC_LOCK_TTL_MS,
  buildBitrixAutoSyncSearchPlan,
  getBitrixAutoSyncLeaseExpiresAt,
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

  it("builds a per-query Bitrix search plan so new format queries backfill history", () => {
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
        query: "Гостевая встреча",
        modifiedAfter: "2026-05-29T10:00:00.000Z",
      },
      {
        query: "Рабочая группа",
        modifiedAfter: null,
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
