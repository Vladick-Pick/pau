export const BITRIX_AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;
export const BITRIX_AUTO_SYNC_LOCK_KEY = "BITRIX24_EVENTS";
export const BITRIX_AUTO_SYNC_LOCK_TTL_MS = 15 * 60 * 1000;

type BitrixAutoSyncCursor = {
  query: string;
  lastSyncedAt: Date;
};

export function selectBitrixAutoSyncQueries(
  formats: Array<{ bitrixSyncTitleQuery?: string | null }>
) {
  return Array.from(
    new Set(
      formats
        .map((format) => format.bitrixSyncTitleQuery?.trim())
        .filter((query): query is string => Boolean(query))
    )
  );
}

export function buildBitrixAutoSyncSearchPlan(
  formats: Array<{ bitrixSyncTitleQuery?: string | null }>,
  cursors: BitrixAutoSyncCursor[]
) {
  const cursorByQuery = new Map(
    cursors.map((cursor) => [cursor.query, cursor.lastSyncedAt])
  );

  return selectBitrixAutoSyncQueries(formats).map((query) => ({
    query,
    modifiedAfter: cursorByQuery.get(query)?.toISOString() ?? null,
  }));
}

export function shouldRunBitrixAutoSync(input: {
  intervalMs: number;
  lastStartedAt: Date | null;
  now: Date;
  running: boolean;
}) {
  if (input.running) {
    return false;
  }

  if (!input.lastStartedAt) {
    return true;
  }

  return input.now.getTime() - input.lastStartedAt.getTime() >= input.intervalMs;
}

export function getBitrixAutoSyncLeaseExpiresAt(
  lockedAt: Date,
  ttlMs = BITRIX_AUTO_SYNC_LOCK_TTL_MS
) {
  return new Date(lockedAt.getTime() + ttlMs);
}

export function isBitrixAutoSyncLeaseExpired(expiresAt: Date, now: Date) {
  return expiresAt.getTime() <= now.getTime();
}

export function shouldResetBitrixAutoSyncCursor(
  previousQuery: string | null | undefined,
  nextQuery: string | null | undefined
) {
  const previous = previousQuery?.trim() ?? "";
  const next = nextQuery?.trim() ?? "";
  return Boolean(next) && previous !== next;
}
