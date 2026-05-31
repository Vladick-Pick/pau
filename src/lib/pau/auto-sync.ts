export const BITRIX_AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;
export const BITRIX_AUTO_SYNC_LOCK_KEY = "BITRIX24_EVENTS";
export const BITRIX_AUTO_SYNC_LOCK_TTL_MS = 15 * 60 * 1000;

type BitrixAutoSyncCursor = {
  query: string;
  lastSyncedAt: Date;
};

export type BitrixAutoSyncSearchPlanItem = {
  eventModifiedAfter: string | null;
  query: string;
  visitModifiedAfter: string | null;
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
): BitrixAutoSyncSearchPlanItem[] {
  const cursorByQuery = new Map(
    cursors.map((cursor) => [cursor.query, cursor.lastSyncedAt])
  );

  return selectBitrixAutoSyncQueries(formats).map((query) => ({
    eventModifiedAfter: null,
    query,
    visitModifiedAfter: cursorByQuery.get(query)?.toISOString() ?? null,
  }));
}

export async function collectBitrixAutoSyncCandidatesSequentially<
  Candidate extends { eventId: string },
>(
  searchPlan: BitrixAutoSyncSearchPlanItem[],
  listCandidates: (search: BitrixAutoSyncSearchPlanItem) => Promise<Candidate[]>
) {
  const results: Array<{
    candidates: Candidate[];
    search: BitrixAutoSyncSearchPlanItem;
  }> = [];

  for (const search of searchPlan) {
    results.push({
      search,
      candidates: await listCandidates(search),
    });
  }

  return results;
}

export function groupBitrixAutoSyncEventIdsByVisitCursor(
  results: Array<{
    candidates: Array<{ eventId: string }>;
    search: Pick<BitrixAutoSyncSearchPlanItem, "visitModifiedAfter">;
  }>
) {
  const cursorByEventId = new Map<string, string | null>();

  for (const result of results) {
    for (const candidate of result.candidates) {
      const eventId = candidate.eventId.trim();
      if (!eventId) {
        continue;
      }

      const nextCursor = result.search.visitModifiedAfter;
      const currentCursor = cursorByEventId.get(eventId);
      if (
        !cursorByEventId.has(eventId) ||
        shouldUseEarlierVisitCursor(currentCursor, nextCursor)
      ) {
        cursorByEventId.set(eventId, nextCursor);
      }
    }
  }

  const eventIdsByCursor = new Map<string | null, string[]>();
  for (const [eventId, modifiedAfter] of cursorByEventId) {
    eventIdsByCursor.set(modifiedAfter, [
      ...(eventIdsByCursor.get(modifiedAfter) ?? []),
      eventId,
    ]);
  }

  return Array.from(eventIdsByCursor, ([modifiedAfter, eventIds]) => ({
    modifiedAfter,
    eventIds,
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

function shouldUseEarlierVisitCursor(
  currentCursor: string | null | undefined,
  nextCursor: string | null
) {
  if (!currentCursor) {
    return false;
  }

  if (!nextCursor) {
    return true;
  }

  return new Date(nextCursor).getTime() < new Date(currentCursor).getTime();
}
