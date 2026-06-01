import {
  BriefType,
  Prisma,
  type AppUser,
  type Brief,
  type Event,
  type EventFormat,
  type EventParticipant,
  type EventParticipantStatus,
  type PreparationEventStatus,
  type Role,
  type SyncLog,
} from "@prisma/client";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { randomUUID } from "node:crypto";
import net from "node:net";

import {
  BitrixClient,
  type BitrixEvent,
  type BitrixEventVisit,
} from "@/lib/bitrix/client";
import {
  buildReadableBitrixContactProfiles,
  type BitrixContactEntity,
  type BitrixContactProfileFields,
} from "@/lib/bitrix/contact-profile";
import {
  BITRIX_EVENT_LINK_FIELD,
  type BitrixFieldAliases,
  mapBitrixDealToEventParticipant,
  normalizeAliases,
} from "@/lib/bitrix/mapping";
import {
  generateBriefWithOpenRouter,
  generateReportWithOpenRouter,
} from "@/lib/briefs/openrouter";
import {
  hashPassword,
  verifyPassword,
} from "../auth/passwords";
import { prisma } from "@/lib/db";
import {
  getCsvEnv,
  getOptionalEnv,
  getRequiredEnv,
  isDatabaseConfigured,
} from "@/lib/env";
import { requestEventMatch } from "@/lib/matching/client";
import {
  BITRIX_AUTO_SYNC_INTERVAL_MS,
  BITRIX_AUTO_SYNC_LOCK_KEY,
  buildBitrixAutoSyncSearchPlan,
  collectBitrixAutoSyncCandidatesSequentially,
  getBitrixAutoSyncLeaseExpiresAt,
  groupBitrixAutoSyncEventIdsByVisitCursor,
  shouldResetBitrixAutoSyncCursor,
  shouldRunBitrixAutoSync,
} from "@/lib/pau/auto-sync";
import { demoSnapshot } from "@/lib/pau/demo-data";
import { shouldUseDemoWorkspaceFallback } from "@/lib/pau/demo-fallback";
import { resolvePauFormatForBitrixEvent } from "@/lib/pau/events";
import {
  buildEventBriefPlan,
  buildEventMatchProfile,
  buildTranscriptReportInput,
  selectDefaultExportBriefs,
} from "@/lib/pau/preparation";
import type {
  PauBrief,
  PauEvent,
  PauEventParticipant,
  PauFormat,
  PauIntegrationStatus,
  PauUser,
  PauWorkspaceSnapshot,
} from "@/lib/pau/types";

export { hashPassword, verifyPassword } from "../auth/passwords";

const DEFAULT_FORMAT_SLUG = "guest-meeting";
const BITRIX_DEAL_CLUB_BRANCH_FIELD = "UF_CRM_DEAL_FILIAL_KLUBA__VYBOR_";
const BITRIX_DEAL_CLUB_CUSTOMER_FIELD = "UF_CRM_1747682957";
const BITRIX_DEAL_ENRICHMENT_FIELDS = {
  keyProjects: "UF_CRM_1766147164481",
  clubConnections: "UF_CRM_1766147207634",
} as const;
const BITRIX_DEAL_CLUB_BRANCH_LABELS: Record<string, string> = {
  "2": "Москва",
};
const BITRIX_DEAL_CLUB_CUSTOMER_LABELS: Record<string, string> = {
  "5844": "ClubFirst One",
  "5846": "ClubFirst Globall",
  "5848": "ClubFirst Ladies",
  "5850": "ClubFirst Future",
  "6676": "Атланты",
  "6678": "Маркетплейсы",
  "6950": "CTU",
  "7114": "СЧ",
  "7142": "Фестиваль АС",
};

type EventWithRelations = Event & {
  format: EventFormat;
  participants: Array<
    EventParticipant & {
      briefs: Brief[];
    }
  >;
  matchRuns: Array<{
    activeParticipantCount: number;
    responsePayload: Prisma.JsonValue | null;
    createdAt: Date;
  }>;
  briefs: Brief[];
};

type FormatPatch = {
  slug: string;
  name?: string;
  description?: string;
  audience?: string | null;
  moderatorNotes?: string | null;
  bitrixEventTypeIds?: string[];
  bitrixSyncTitleQuery?: string;
  matchingRules?: unknown;
  promptPotential?: string;
  promptActive?: string;
  promptModerator?: string;
  promptReport?: string;
};

type SyncEventsInput = {
  eventIds: string[];
  modifiedAfter?: string | null;
};

type BitrixAutoSyncRuntime = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastError: string | null;
};

type BitrixAutoSyncResult = {
  queriesChecked: number;
  eventsFound: number;
  eventsSynced: number;
  participantsSynced: number;
};

type BitrixAutoSyncLease = {
  owner: string;
};

declare global {
  var __pauBitrixAutoSync: BitrixAutoSyncRuntime | undefined;
}

export async function getPauWorkspaceSnapshot(): Promise<PauWorkspaceSnapshot> {
  const integrationStatus = getIntegrationStatus();
  if (!(await canUseDatabase(integrationStatus))) {
    if (!shouldUseDemoWorkspaceFallback()) {
      throw new Error("Database is not available");
    }

    return {
      ...demoSnapshot,
      integrationStatus,
    };
  }

  try {
    await ensureDefaultFormats();
    const latestSyncLog = await loadLatestBitrixSyncLog();
    startBitrixAutoSyncScheduler(latestSyncLog?.createdAt ?? null);
    const now = new Date();
    const [upcomingEvents, pastEvents, formats, briefs, users] =
      await Promise.all([
        loadEvents({ scope: "upcoming", limit: 3, now }),
        loadEvents({ scope: "past", limit: 25, now }),
        prisma.eventFormat.findMany({ orderBy: { name: "asc" } }),
        prisma.brief.findMany({
          orderBy: { createdAt: "desc" },
          take: 12,
          include: {
            event: true,
            eventParticipant: true,
            participant: true,
          },
        }),
        prisma.appUser.findMany({ orderBy: { createdAt: "asc" } }),
      ]);
    const upcoming = upcomingEvents.map(mapEvent);
    const past = pastEvents.map(mapEvent);
    const allEvents = [...upcoming, ...past];

    return {
      demoMode: false,
      integrationStatus,
      autoSync: buildAutoSyncStatus(integrationStatus, latestSyncLog),
      summary: {
        upcomingEvents: upcomingEvents.length,
        pastEvents: pastEvents.length,
        invitedParticipants: allEvents.reduce(
          (sum, event) => sum + event.counts.invited,
          0
        ),
        confirmedParticipants: allEvents.reduce(
          (sum, event) => sum + event.counts.confirmed,
          0
        ),
        activeParticipants: allEvents.reduce(
          (sum, event) => sum + event.counts.active,
          0
        ),
        briefs: briefs.length,
      },
      upcomingEvents: upcoming,
      pastEvents: past,
      formats: formats.map(mapFormat),
      briefs: briefs.map(mapBrief),
      users: users.map(mapUser),
    };
  } catch (error) {
    if (!shouldUseDemoWorkspaceFallback()) {
      throw error;
    }

    return {
      ...demoSnapshot,
      integrationStatus: {
        ...integrationStatus,
        database: false,
      },
    };
  }
}

export async function getEvents(scope: "upcoming" | "past" | "all") {
  assertDatabase();
  const events = await loadEvents({
    scope,
    limit: scope === "upcoming" ? 3 : 50,
    now: new Date(),
  });
  return events.map(mapEvent);
}

export async function listBitrixEventCandidates(input: {
  query: string;
  modifiedAfter?: string | null;
}) {
  return listBitrixEventCandidatesWithClient(
    new BitrixClient(),
    input.query,
    input.modifiedAfter ?? null
  );
}

async function listBitrixEventCandidatesWithClient(
  bitrix: BitrixClient,
  queryInput: string,
  modifiedAfter: string | null
) {
  const query = queryInput.trim();
  if (!query) {
    return [];
  }

  const events = await bitrix.listEvents({
    modifiedAfter,
    titleSearch: query,
  });

  return events.map((event) => ({
    eventId: event.eventId,
    entityTypeId: event.entityTypeId,
    smartItemId: bitrixEventSmartItemId(event),
    title: event.title ?? "Без названия",
    eventDate: event.startAt ?? event.eventDate,
    stageName: event.stageName,
    status: event.status,
    eventTypeId: event.eventTypeId,
    eventTypeLabel: event.eventTypeLabel,
    formatId: event.formatId,
    formatLabel: event.formatLabel,
    updatedTime: event.updatedTime,
  }));
}

export async function getEvent(eventId: string) {
  assertDatabase();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: eventInclude,
  });
  if (!event) {
    throw new Error("Event not found");
  }

  return mapEvent(event);
}

export async function syncEventsFromBitrix(input: SyncEventsInput) {
  assertDatabase();
  await ensureDefaultFormats();
  const selectedEventIds = Array.from(
    new Set(input.eventIds.map((id) => id.trim()).filter(Boolean))
  );
  if (selectedEventIds.length === 0) {
    throw new Error("Select Bitrix events before sync");
  }

  const bitrix = new BitrixClient();
  const reportYear = new Date().getUTCFullYear();
  const dealEventFieldName =
    getOptionalEnv("BITRIX_EVENT_LINK_FIELD") ?? BITRIX_EVENT_LINK_FIELD;
  const [formats, bitrixEvents] = await Promise.all([
    prisma.eventFormat.findMany(),
    bitrix.listEvents({ modifiedAfter: null, eventIds: selectedEventIds }),
  ]);
  const visits =
    bitrixEvents.length > 0
      ? await bitrix.listEventVisits({
          modifiedAfter: input.modifiedAfter ?? null,
          reportYear,
          eventIds: bitrixEvents.map((event) => event.eventId),
        })
      : [];
  const activeIdentifiers = await getActiveIdentifiers();
  const aliases = getBitrixAliases(dealEventFieldName);
  let eventsSynced = 0;
  let participantsSynced = 0;
  const eventsByBitrixEventId = new Map<string, Event>();

  for (const bitrixEvent of bitrixEvents) {
    const format = resolveFormatForBitrixEvent(formats, bitrixEvent);
    const event = await prisma.event.upsert({
      where: { bitrixSmartItemId: bitrixEventSmartItemId(bitrixEvent) },
      update: {
        title: bitrixEvent.title ?? "Без названия",
        startsAt: parseBitrixDate(bitrixEvent.startAt ?? bitrixEvent.eventDate),
        endsAt: parseBitrixDate(bitrixEvent.endAt),
        status: getPreparationEventStatus(
          bitrixEvent.startAt ?? bitrixEvent.eventDate,
          bitrixEvent.status
        ),
        bitrixEventId: bitrixEvent.eventId,
        bitrixEventTypeId: bitrixEvent.eventTypeId ?? bitrixEvent.formatId,
        bitrixEventTypeLabel:
          bitrixEvent.eventTypeLabel ?? bitrixEvent.formatLabel ?? null,
        formatSlug: format.slug,
        sourcePayload: {
          event: bitrixEvent,
          dealEventFieldName,
        } as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
      create: {
        title: bitrixEvent.title ?? "Без названия",
        startsAt: parseBitrixDate(bitrixEvent.startAt ?? bitrixEvent.eventDate),
        endsAt: parseBitrixDate(bitrixEvent.endAt),
        status: getPreparationEventStatus(
          bitrixEvent.startAt ?? bitrixEvent.eventDate,
          bitrixEvent.status
        ),
        bitrixEventId: bitrixEvent.eventId,
        bitrixSmartItemId: bitrixEventSmartItemId(bitrixEvent),
        bitrixEventTypeId: bitrixEvent.eventTypeId ?? bitrixEvent.formatId,
        bitrixEventTypeLabel:
          bitrixEvent.eventTypeLabel ?? bitrixEvent.formatLabel ?? null,
        formatSlug: format.slug,
        sourcePayload: {
          event: bitrixEvent,
          dealEventFieldName,
        } as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
    eventsByBitrixEventId.set(bitrixEvent.eventId, event);
    eventsSynced += 1;
  }

  const fallbackGroups = new Map<string, typeof visits>();
  for (const visit of visits) {
    if (visit.eventId && eventsByBitrixEventId.has(visit.eventId)) {
      continue;
    }

    const key = visitFallbackKey(visit);
    fallbackGroups.set(key, [...(fallbackGroups.get(key) ?? []), visit]);
  }

  for (const [fallbackKey, groupVisits] of fallbackGroups) {
    const firstVisit = groupVisits[0];
    if (!firstVisit) {
      continue;
    }

    const format = resolveFormatForBitrixEvent(formats, {
      title: firstVisit.eventName,
      eventTypeId: null,
      eventTypeLabel: null,
      formatId: null,
      formatLabel: null,
    });
    const fallbackEvent = await prisma.event.upsert({
      where: { bitrixSmartItemId: `visit-group:${fallbackKey}` },
      update: {
        title: firstVisit.eventName,
        startsAt: parseBitrixDate(firstVisit.eventDate),
        status: getPreparationEventStatus(firstVisit.eventDate, null),
        bitrixEventId: firstVisit.eventId,
        bitrixEventTypeId: null,
        bitrixEventTypeLabel: null,
        formatSlug: format.slug,
        sourcePayload: {
          unresolvedEventId: firstVisit.eventId,
          visitIds: groupVisits.map((visit) => visit.id),
          dealEventFieldName,
        } as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
      create: {
        title: firstVisit.eventName,
        startsAt: parseBitrixDate(firstVisit.eventDate),
        status: getPreparationEventStatus(firstVisit.eventDate, null),
        bitrixEventId: firstVisit.eventId,
        bitrixSmartItemId: `visit-group:${fallbackKey}`,
        bitrixEventTypeId: null,
        bitrixEventTypeLabel: null,
        formatSlug: format.slug,
        sourcePayload: {
          unresolvedEventId: firstVisit.eventId,
          visitIds: groupVisits.map((visit) => visit.id),
          dealEventFieldName,
        } as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });

    if (firstVisit.eventId) {
      eventsByBitrixEventId.set(firstVisit.eventId, fallbackEvent);
    }
    eventsSynced += 1;
  }

  const dealIds = uniqueStrings(visits.map((visit) => visit.dealId));
  const deals = await bitrix.listDealsByIds(dealIds, ["*", "UF_*"]);
  const dealsById = new Map(
    deals.flatMap((deal) => {
      const id = getString(deal.ID) ?? getString(deal.id);
      return id ? [[id, deal] as const] : [];
    })
  );
  const contactsById = await fetchReadableContactsForVisitsAndDeals(
    bitrix,
    visits,
    deals
  );
  for (const visit of visits) {
    const event =
      (visit.eventId ? eventsByBitrixEventId.get(visit.eventId) : null) ??
      (await findFallbackEventForVisit(visit));
    if (!event || !visit.dealId) {
      continue;
    }

    const deal = dealsById.get(visit.dealId);
    if (!deal) {
      continue;
    }

    const profile = mapBitrixDealToEventParticipant({
      deal,
      contact: profileContactForVisitAndDeal(visit, deal, contactsById),
      activeIdentifiers,
      aliases,
    });
    const participant = await upsertParticipantFromProfile(profile);

    await prisma.eventParticipant.upsert({
      where: {
        eventId_bitrixDealId: {
          eventId: event.id,
          bitrixDealId: profile.bitrixDealId,
        },
      },
      update: {
        participantId: participant.id,
        kind: "POTENTIAL",
        status: visit.status,
        bitrixVisitId: visit.id,
        bitrixContactId: profile.bitrixContactId,
        fullName: profile.fullName,
        email: null,
        phone: null,
        telegram: null,
        company: profile.company,
        position: profile.position,
        city: profile.city,
        age: profile.age,
        gender: profile.gender,
        businessMain: profile.businessMain,
        businessExtra1: profile.businessExtra1,
        businessExtra2: profile.businessExtra2,
        businessExtra3: profile.businessExtra3,
        businessProfile: jsonValueOrNull(profile.businessProfile),
        enrichment: jsonValueOrNull(profile.enrichment),
        sourcePayload: {
          visit,
          profile: profile.sourcePayload,
          dealEventFieldName,
        } as Prisma.InputJsonValue,
        statusUpdatedAt: new Date(),
      },
      create: {
        eventId: event.id,
        participantId: participant.id,
        kind: "POTENTIAL",
        status: visit.status,
        bitrixVisitId: visit.id,
        bitrixDealId: profile.bitrixDealId,
        bitrixContactId: profile.bitrixContactId,
        fullName: profile.fullName,
        email: null,
        phone: null,
        telegram: null,
        company: profile.company,
        position: profile.position,
        city: profile.city,
        age: profile.age,
        gender: profile.gender,
        businessMain: profile.businessMain,
        businessExtra1: profile.businessExtra1,
        businessExtra2: profile.businessExtra2,
        businessExtra3: profile.businessExtra3,
        businessProfile: jsonValueOrNull(profile.businessProfile),
        enrichment: jsonValueOrNull(profile.enrichment),
        sourcePayload: {
          visit,
          profile: profile.sourcePayload,
          dealEventFieldName,
        } as Prisma.InputJsonValue,
        statusUpdatedAt: new Date(),
      },
    });
    participantsSynced += 1;
  }

  await logSync(
    "SUCCESS",
    `Synced ${eventsSynced} events and ${participantsSynced} event participants`
  );

  return { eventsSynced, participantsSynced };
}

async function fetchReadableContactsForVisitsAndDeals(
  bitrix: BitrixClient,
  visits: BitrixEventVisit[],
  deals: Array<Record<string, unknown>>
) {
  const contactIds = uniqueStrings(
    [
      ...visits.map((visit) => visit.contactId),
      ...deals.map(
        (deal) =>
          getString(deal.CONTACT_ID) ??
          getString(deal.contactId) ??
          getString(deal.contactID)
      ),
    ]
  );
  if (contactIds.length === 0) {
    return new Map<string, BitrixContactEntity>();
  }

  let contacts: BitrixContactEntity[];
  try {
    contacts = await bitrix.listContactsByIds(contactIds, ["*", "UF_*"]);
  } catch {
    return new Map<string, BitrixContactEntity>();
  }

  let fields: BitrixContactProfileFields;
  try {
    fields = await bitrix.call<BitrixContactProfileFields>("crm.contact.fields");
  } catch {
    return indexBitrixContactsById(contacts);
  }

  const readableContacts = await buildReadableBitrixContactProfiles({
    bitrix,
    contacts,
    fields,
  });

  return indexBitrixContactsById(readableContacts);
}

function indexBitrixContactsById(contacts: BitrixContactEntity[]) {
  return new Map(
    contacts.flatMap((contact) => {
      const id = getString(contact.ID) ?? getString(contact.id);
      return id ? [[id, contact] as const] : [];
    })
  );
}

function profileContactForVisitAndDeal(
  visit: BitrixEventVisit,
  deal: Record<string, unknown>,
  contactsById: Map<string, BitrixContactEntity>
) {
  const contactId =
    visit.contactId ??
    getString(deal.CONTACT_ID) ??
    getString(deal.contactId) ??
    getString(deal.contactID);

  return contactId ? contactsById.get(contactId) ?? null : null;
}

export async function syncBitrixEventsByFormatQueries(): Promise<BitrixAutoSyncResult> {
  assertDatabase();
  await ensureDefaultFormats();

  const formats = await prisma.eventFormat.findMany({
    select: { bitrixSyncTitleQuery: true },
  });
  const cursors = await prisma.bitrixAutoSyncCursor.findMany();
  const searchPlan = buildBitrixAutoSyncSearchPlan(formats, cursors);
  const syncStartedAt = new Date();

  if (searchPlan.length === 0) {
    await logSync("SUCCESS", "Auto sync skipped: no Bitrix title queries configured");
    return {
      queriesChecked: 0,
      eventsFound: 0,
      eventsSynced: 0,
      participantsSynced: 0,
    };
  }

  const bitrix = new BitrixClient();
  const candidatesByQuery = await collectBitrixAutoSyncCandidatesSequentially(
    searchPlan,
    (search) =>
      listBitrixEventCandidatesWithClient(
        bitrix,
        search.query,
        search.eventModifiedAfter
      )
  );
  const syncGroups = groupBitrixAutoSyncEventIdsByVisitCursor(candidatesByQuery);
  const eventIds = uniqueStrings(syncGroups.flatMap((group) => group.eventIds));

  if (eventIds.length === 0) {
    await logSync(
      "SUCCESS",
      `Auto sync found no Bitrix events for ${searchPlan.length} format queries`
    );
    await saveBitrixAutoSyncCursors(searchPlan, syncStartedAt);
    return {
      queriesChecked: searchPlan.length,
      eventsFound: 0,
      eventsSynced: 0,
      participantsSynced: 0,
    };
  }

  const result = { eventsSynced: 0, participantsSynced: 0 };
  for (const group of syncGroups) {
    const groupResult = await syncEventsFromBitrix({
      eventIds: group.eventIds,
      modifiedAfter: group.modifiedAfter,
    });
    result.eventsSynced += groupResult.eventsSynced;
    result.participantsSynced += groupResult.participantsSynced;
  }
  await saveBitrixAutoSyncCursors(searchPlan, syncStartedAt);
  return {
    queriesChecked: searchPlan.length,
    eventsFound: eventIds.length,
    ...result,
  };
}

export function runBitrixAutoSyncNow() {
  const runtime = getBitrixAutoSyncRuntime();
  if (runtime.running) {
    return {
      started: false,
      reason: "already_running",
      ...runtimeToPlainState(runtime),
    };
  }

  runtime.running = true;
  runtime.lastStartedAt = new Date();
  runtime.lastError = null;
  void finishBitrixAutoSync(runtime);

  return {
    started: true,
    ...runtimeToPlainState(runtime),
  };
}

export function startBitrixAutoSyncScheduler(initialLastStartedAt: Date | null = null) {
  const runtime = getBitrixAutoSyncRuntime();
  runtime.lastStartedAt ??= initialLastStartedAt;

  if (!runtime.timer) {
    runtime.timer = setInterval(() => {
      void runBitrixAutoSyncIfDue();
    }, BITRIX_AUTO_SYNC_INTERVAL_MS);
    runtime.timer.unref?.();
  }

  void runBitrixAutoSyncIfDue();
}

export async function runEventMatch(eventId: string) {
  assertDatabase();
  const endpoint = getRequiredEnv("MATCHING_API_ENDPOINT");
  const apiKey = getRequiredEnv("MATCHING_API_KEY");
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: eventInclude,
  });
  if (!event) {
    throw new Error("Event not found");
  }

  const profile = buildEventMatchProfile({
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt?.toISOString() ?? null,
      formatSlug: event.formatSlug,
    },
    format: {
      slug: event.format.slug,
      name: event.format.name,
      matchingRules: event.format.matchingRules,
    },
    participants: event.participants.map((participant) => ({
      id: participant.id,
      kind: participant.kind,
      status: participant.status,
      fullName: participant.fullName,
      company: participant.company,
      position: participant.position,
      city: participant.city,
      age: participant.age,
      gender: participant.gender,
      businessMain: participant.businessMain,
      businessExtra1: participant.businessExtra1,
      businessExtra2: participant.businessExtra2,
      businessExtra3: participant.businessExtra3,
      businessProfile: participant.businessProfile,
      enrichment: participant.enrichment,
    })),
  });

  try {
    const result = await requestEventMatch({ endpoint, apiKey }, profile);
    await prisma.eventMatchRun.create({
      data: {
        eventId,
        activeParticipantIds: result.activeParticipants.map(
          (participant) => participant.id
        ),
        activeParticipantCount: result.activeParticipants.length,
        requestPayload: profile as Prisma.InputJsonValue,
        responsePayload: result as Prisma.InputJsonValue,
      },
    });

    for (const active of result.activeParticipants) {
      const existing = await prisma.eventParticipant.findFirst({
        where: {
          eventId,
          kind: "ACTIVE",
          fullName: active.fullName,
        },
      });
      const data = {
        kind: "ACTIVE" as const,
        status: "INVITED" as const,
        fullName: active.fullName,
        matchedScore: active.score ?? null,
        matchRationale: active.rationale ?? result.rationale,
        sourcePayload: active.profile
          ? ({ matchingProfile: active.profile } as Prisma.InputJsonValue)
          : undefined,
      };

      if (existing) {
        await prisma.eventParticipant.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.eventParticipant.create({
          data: {
            eventId,
            ...data,
          },
        });
      }
    }

    return result;
  } catch (error) {
    await prisma.eventMatchRun.create({
      data: {
        eventId,
        activeParticipantCount: 0,
        requestPayload: profile as Prisma.InputJsonValue,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

export async function generateEventBriefs(input: {
  eventId: string;
  createdByRole: Role;
}) {
  assertDatabase();
  const apiKey = getRequiredEnv("OPENROUTER_API_KEY");
  const model = getOptionalEnv("OPENROUTER_MODEL") ?? "openai/gpt-5-mini";
  const appTitle = getOptionalEnv("OPENROUTER_APP_TITLE") ?? "ПАУ";
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    include: eventInclude,
  });
  if (!event) {
    throw new Error("Event not found");
  }

  const briefPlan = buildEventBriefPlan({
    format: {
      promptPotential: event.format.promptPotential,
      promptActive: event.format.promptActive,
      promptModerator: event.format.promptModerator,
    },
    participants: event.participants.map((participant) => ({
      id: participant.id,
      kind: participant.kind,
      fullName: participant.fullName,
    })),
  });
  const createdBriefs: Brief[] = [];

  for (const planItem of briefPlan) {
    const participant = planItem.participantId
      ? event.participants.find((candidate) => candidate.id === planItem.participantId)
      : null;
    const generated = await generateBriefWithOpenRouter({
      apiKey,
      appTitle,
      model,
      input: {
        briefType: planItem.briefType,
        prompt: planItem.prompt,
        participant: participant
          ? {
              fullName: participant.fullName,
              status: participant.kind === "ACTIVE" ? "ACTIVE" : "POTENTIAL",
              company: participant.company,
              position: participant.position,
              city: participant.city,
              age: participant.age,
              gender: participant.gender,
              businessMain: participant.businessMain,
              businessExtra1: participant.businessExtra1,
              businessExtra2: participant.businessExtra2,
              businessExtra3: participant.businessExtra3,
              businessProfile: participant.businessProfile,
              enrichment: participant.enrichment,
            }
          : {
              fullName: "Модератор",
              status: "ACTIVE",
            },
        format: {
          name: event.format.name,
          description: event.format.description,
        },
        match: participant?.matchedScore
          ? {
              score: participant.matchedScore,
              rationale: participant.matchRationale ?? "",
              activeParticipantIds: [participant.id],
              suggestedFormatSlugs: [event.formatSlug],
            }
          : null,
        attendanceHistory: [],
      },
    });
    const version = await prisma.brief.count({
      where: {
        eventId: event.id,
        eventParticipantId: participant?.id ?? null,
        briefType: planItem.briefType,
      },
    });
    const brief = await prisma.brief.create({
      data: {
        eventId: event.id,
        eventParticipantId: participant?.id ?? null,
        briefType: planItem.briefType,
        formatSlug: event.formatSlug,
        model,
        prompt: planItem.prompt,
        content: generated as Prisma.InputJsonValue,
        rawContent: JSON.stringify(generated),
        version: version + 1,
        createdByRole: input.createdByRole,
      },
    });
    createdBriefs.push(brief);
  }

  return { created: createdBriefs.length };
}

export async function updateEventParticipantAttendance(input: {
  eventId: string;
  participantId: string;
  attendanceMarked: boolean;
}) {
  assertDatabase();
  const participant = await prisma.eventParticipant.findFirst({
    where: {
      id: input.participantId,
      eventId: input.eventId,
    },
    include: {
      event: { select: { status: true } },
      briefs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!participant) {
    throw new Error("Event participant not found");
  }
  if (participant.kind !== "ACTIVE") {
    throw new Error("Only active participants can be marked manually");
  }
  if (participant.event.status !== "PAST") {
    throw new Error("Attendance can only be marked for past events");
  }

  const updated = await prisma.eventParticipant.update({
    where: { id: participant.id },
    data: { attendanceMarked: input.attendanceMarked },
    include: {
      briefs: { orderBy: { createdAt: "desc" } },
    },
  });

  return mapEventParticipant(updated);
}

export async function generateEventReportFromTranscript(input: {
  eventId: string;
  transcript: string;
  createdByRole: Role;
}) {
  assertDatabase();
  const apiKey = getRequiredEnv("OPENROUTER_API_KEY");
  const model = getOptionalEnv("OPENROUTER_MODEL") ?? "openai/gpt-5-mini";
  const appTitle = getOptionalEnv("OPENROUTER_APP_TITLE") ?? "ПАУ";
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    include: {
      format: true,
    },
  });
  if (!event) {
    throw new Error("Event not found");
  }
  if (event.status !== "PAST") {
    throw new Error("Reports can only be generated for past events");
  }
  if (!event.format.promptReport.trim()) {
    throw new Error("Report prompt is not configured for this format");
  }

  const reportInput = buildTranscriptReportInput({
    eventTitle: event.title,
    formatName: event.format.name,
    promptReport: event.format.promptReport,
    transcript: input.transcript,
  });
  const generated = await generateReportWithOpenRouter({
    apiKey,
    appTitle,
    model,
    input: reportInput,
  });
  const version = await prisma.brief.count({
    where: {
      eventId: event.id,
      briefType: BriefType.REPORT,
    },
  });
  const brief = await prisma.brief.create({
    data: {
      eventId: event.id,
      briefType: BriefType.REPORT,
      formatSlug: event.formatSlug,
      model,
      prompt: reportInput.prompt,
      content: generated as Prisma.InputJsonValue,
      rawContent: JSON.stringify(generated),
      version: version + 1,
      createdByRole: input.createdByRole,
    },
  });

  return mapBrief({
    ...brief,
    event,
    eventParticipant: null,
    participant: null,
  });
}

export async function buildEventBriefsDocx(eventId: string) {
  assertDatabase();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: eventInclude,
  });
  if (!event) {
    throw new Error("Event not found");
  }

  const children: Paragraph[] = [
    new Paragraph({
      text: event.title,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Формат: ${event.format.name}`,
          bold: true,
        }),
      ],
    }),
  ];

  const exportBriefs = selectDefaultExportBriefs(
    event.participants.flatMap((participant) =>
      participant.briefs.flatMap((brief) =>
        brief.briefType === BriefType.REPORT
          ? []
          : [
              {
                participant,
                brief,
                briefType: brief.briefType as Exclude<BriefType, "REPORT">,
              },
            ]
      )
    )
  );
  for (const { participant, brief } of exportBriefs) {
    children.push(
      new Paragraph({
        text: participant.fullName,
        heading: HeadingLevel.HEADING_1,
      }),
      ...briefToParagraphs(brief.content)
    );
  }

  const document = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(document);
}

export async function updateFormats(patches: FormatPatch[]) {
  assertDatabase();
  const results: EventFormat[] = [];
  for (const patch of patches) {
    const previousFormat =
      patch.bitrixSyncTitleQuery === undefined
        ? null
        : await prisma.eventFormat.findUnique({
            where: { slug: patch.slug },
            select: { bitrixSyncTitleQuery: true },
          });
    const format = await prisma.eventFormat.upsert({
      where: { slug: patch.slug },
      update: formatPatchToData(patch),
      create: {
        slug: patch.slug,
        name: patch.name ?? patch.slug,
        description: patch.description ?? "",
        audience: patch.audience,
        moderatorNotes: patch.moderatorNotes,
        bitrixEventTypeIds: patch.bitrixEventTypeIds ?? [],
        bitrixSyncTitleQuery: patch.bitrixSyncTitleQuery ?? "",
        matchingRules: jsonOrNull(patch.matchingRules),
        promptPotential: patch.promptPotential ?? "",
        promptActive: patch.promptActive ?? "",
        promptModerator: patch.promptModerator ?? "",
        promptReport: patch.promptReport ?? "",
      },
    });
    if (
      patch.bitrixSyncTitleQuery !== undefined &&
      shouldResetBitrixAutoSyncCursor(
        previousFormat?.bitrixSyncTitleQuery,
        format.bitrixSyncTitleQuery
      )
    ) {
      await prisma.bitrixAutoSyncCursor.deleteMany({
        where: { query: format.bitrixSyncTitleQuery.trim() },
      });
    }

    results.push(format);
  }

  return results.map(mapFormat);
}

export async function deleteFormat(slug: string) {
  assertDatabase();
  const format = await prisma.eventFormat.findUnique({
    where: { slug },
  });
  if (!format) {
    throw new Error("Format not found");
  }

  const [events, visits, briefs] = await Promise.all([
    prisma.event.count({ where: { formatSlug: slug } }),
    prisma.visit.count({ where: { formatSlug: slug } }),
    prisma.brief.count({ where: { formatSlug: slug } }),
  ]);
  if (events + visits + briefs > 0) {
    throw new Error("Format is used by existing history and cannot be deleted");
  }

  const deleted = await prisma.eventFormat.delete({
    where: { slug },
  });
  return mapFormat(deleted);
}

export async function listUsers() {
  assertDatabase();
  const users = await prisma.appUser.findMany({ orderBy: { createdAt: "asc" } });
  return users.map(mapUser);
}

export async function createUser(input: {
  login: string;
  displayName: string;
  role: Role;
  password: string;
}) {
  assertDatabase();
  const user = await prisma.appUser.create({
    data: {
      login: input.login,
      displayName: input.displayName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
  });
  return mapUser(user);
}

export async function updateUser(input: {
  id: string;
  displayName?: string;
  role?: Role;
  active?: boolean;
  password?: string;
}) {
  assertDatabase();
  const user = await prisma.appUser.update({
    where: { id: input.id },
    data: {
      displayName: input.displayName,
      role: input.role,
      active: input.active,
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });
  return mapUser(user);
}

export async function findActiveUserByCredentials(input: {
  login: string;
  password: string;
}) {
  if (!(await canUseDatabase(getIntegrationStatus()))) {
    return null;
  }

  const user = await prisma.appUser.findUnique({
    where: { login: input.login },
  });
  if (!user?.active) {
    return null;
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    return null;
  }

  return {
    role: user.role,
    userName: user.displayName,
  };
}

export function getIntegrationStatus(): PauIntegrationStatus {
  return {
    database: isDatabaseConfigured(),
    bitrix: Boolean(
      getOptionalEnv("BITRIX_WEBHOOK_URL") ||
        (getOptionalEnv("BITRIX24_PORTAL_HOST") &&
          getOptionalEnv("BITRIX24_WEBHOOK_USER_ID") &&
          getOptionalEnv("BITRIX24_WEBHOOK_TOKEN"))
    ),
    matching: Boolean(
      getOptionalEnv("MATCHING_API_ENDPOINT") && getOptionalEnv("MATCHING_API_KEY")
    ),
    openrouter: Boolean(getOptionalEnv("OPENROUTER_API_KEY")),
  };
}

async function runBitrixAutoSyncIfDue() {
  const integrationStatus = getIntegrationStatus();
  if (!integrationStatus.database || !integrationStatus.bitrix) {
    return;
  }

  if (!(await canUseDatabase(integrationStatus))) {
    return;
  }

  const runtime = getBitrixAutoSyncRuntime();
  if (!runtime.lastStartedAt) {
    const latestSyncLog = await loadLatestBitrixSyncLog();
    runtime.lastStartedAt = latestSyncLog?.createdAt ?? null;
  }

  if (
    !shouldRunBitrixAutoSync({
      intervalMs: BITRIX_AUTO_SYNC_INTERVAL_MS,
      lastStartedAt: runtime.lastStartedAt,
      now: new Date(),
      running: runtime.running,
    })
  ) {
    return;
  }

  runBitrixAutoSyncNow();
}

async function finishBitrixAutoSync(runtime: BitrixAutoSyncRuntime) {
  let lease: BitrixAutoSyncLease | null = null;

  try {
    lease = await acquireBitrixAutoSyncLease();
    if (!lease) {
      runtime.lastFinishedAt = new Date();
      return;
    }

    await syncBitrixEventsByFormatQueries();
    runtime.lastFinishedAt = new Date();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auto sync error";
    runtime.lastError = message;
    runtime.lastFinishedAt = new Date();
    try {
      await logSync("FAILED", `Auto sync failed: ${message}`);
    } catch {
      // The in-memory status still needs to be cleared even if the database log fails.
    }
  } finally {
    if (lease) {
      try {
        await releaseBitrixAutoSyncLease(lease);
      } catch {
        // A stale lease can expire naturally; do not keep the process-local flag stuck.
      }
    }
    runtime.running = false;
  }
}

function getBitrixAutoSyncRuntime() {
  globalThis.__pauBitrixAutoSync ??= {
    timer: null,
    running: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
  };
  return globalThis.__pauBitrixAutoSync;
}

function runtimeToPlainState(runtime: BitrixAutoSyncRuntime) {
  return {
    running: runtime.running,
    lastStartedAt: runtime.lastStartedAt?.toISOString() ?? null,
    lastFinishedAt: runtime.lastFinishedAt?.toISOString() ?? null,
    lastError: runtime.lastError,
  };
}

async function loadLatestBitrixSyncLog() {
  return prisma.syncLog.findFirst({
    where: { source: "BITRIX24_EVENTS" },
    orderBy: { createdAt: "desc" },
  });
}

function buildAutoSyncStatus(
  integrationStatus: PauIntegrationStatus,
  latestSyncLog: SyncLog | null
): PauWorkspaceSnapshot["autoSync"] {
  const runtime = getBitrixAutoSyncRuntime();
  const enabled = integrationStatus.database && integrationStatus.bitrix;
  const lastStartedAt = runtime.lastStartedAt ?? latestSyncLog?.createdAt ?? null;
  const nextRunAt =
    enabled && lastStartedAt && !runtime.running
      ? new Date(lastStartedAt.getTime() + BITRIX_AUTO_SYNC_INTERVAL_MS)
      : null;

  return {
    enabled,
    intervalMinutes: BITRIX_AUTO_SYNC_INTERVAL_MS / 60_000,
    running: runtime.running,
    lastStartedAt: runtime.lastStartedAt?.toISOString() ?? null,
    lastFinishedAt: runtime.lastFinishedAt?.toISOString() ?? null,
    lastError: runtime.lastError,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    lastLog: latestSyncLog
      ? {
          status: latestSyncLog.status,
          message: latestSyncLog.message,
          createdAt: latestSyncLog.createdAt.toISOString(),
        }
      : null,
  };
}

async function acquireBitrixAutoSyncLease(): Promise<BitrixAutoSyncLease | null> {
  const lockedAt = new Date();
  const expiresAt = getBitrixAutoSyncLeaseExpiresAt(lockedAt);
  const owner = randomUUID();

  try {
    await prisma.autoSyncLock.create({
      data: {
        key: BITRIX_AUTO_SYNC_LOCK_KEY,
        owner,
        lockedAt,
        expiresAt,
      },
    });
    return { owner };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  const result = await prisma.autoSyncLock.updateMany({
    where: {
      key: BITRIX_AUTO_SYNC_LOCK_KEY,
      expiresAt: { lte: lockedAt },
    },
    data: {
      owner,
      lockedAt,
      expiresAt,
    },
  });

  return result.count === 1 ? { owner } : null;
}

async function releaseBitrixAutoSyncLease(lease: BitrixAutoSyncLease) {
  await prisma.autoSyncLock.deleteMany({
    where: {
      key: BITRIX_AUTO_SYNC_LOCK_KEY,
      owner: lease.owner,
    },
  });
}

async function saveBitrixAutoSyncCursors(
  searchPlan: Array<{ query: string }>,
  lastSyncedAt: Date
) {
  await prisma.$transaction(
    searchPlan.map((search) =>
      prisma.bitrixAutoSyncCursor.upsert({
        where: { query: search.query },
        update: { lastSyncedAt },
        create: {
          query: search.query,
          lastSyncedAt,
        },
      })
    )
  );
}

async function loadEvents(input: {
  scope: "upcoming" | "past" | "all";
  limit: number;
  now: Date;
}) {
  const where =
    input.scope === "upcoming"
      ? {
          OR: [{ startsAt: null }, { startsAt: { gte: input.now } }],
        }
      : input.scope === "past"
        ? { startsAt: { lt: input.now } }
        : {};

  return prisma.event.findMany({
    where,
    orderBy:
      input.scope === "past" ? [{ startsAt: "desc" }] : [{ startsAt: "asc" }],
    take: input.limit,
    include: eventInclude,
  });
}

const eventInclude = {
  format: true,
  participants: {
    orderBy: [{ kind: "asc" }, { status: "asc" }, { fullName: "asc" }],
    include: {
      briefs: { orderBy: { createdAt: "desc" } },
    },
  },
  matchRuns: { orderBy: { createdAt: "desc" }, take: 1 },
  briefs: true,
} satisfies Prisma.EventInclude;

function mapEvent(event: EventWithRelations): PauEvent {
  const counts = {
    invited: countStatus(event.participants, "INVITED"),
    confirmed: countStatus(event.participants, "CONFIRMED"),
    refused: countStatus(event.participants, "REFUSED"),
    attended: countStatus(event.participants, "ATTENDED"),
    missed: countStatus(event.participants, "MISSED"),
    unknown: countStatus(event.participants, "UNKNOWN"),
    active: event.participants.filter((participant) => participant.kind === "ACTIVE")
      .length,
    briefs: event.briefs.length,
  };
  const match = event.matchRuns[0] ?? null;
  const latestReport =
    event.briefs
      .filter((brief) => brief.briefType === BriefType.REPORT)
      .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ??
    null;

  return {
    id: event.id,
    title: event.title,
    startsAt: event.startsAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
    status: event.status,
    bitrixEventId: event.bitrixEventId,
    bitrixSmartItemId: event.bitrixSmartItemId,
    bitrixEventTypeId: event.bitrixEventTypeId,
    bitrixEventTypeLabel: event.bitrixEventTypeLabel,
    formatSlug: event.formatSlug,
    formatName: event.format.name,
    syncedAt: event.syncedAt?.toISOString() ?? null,
    counts,
    latestMatch: match
      ? {
          activeParticipantCount: match.activeParticipantCount,
          rationale: getRationale(match.responsePayload),
          createdAt: match.createdAt.toISOString(),
      }
      : null,
    latestReport: latestReport
      ? {
          id: latestReport.id,
          summary: getBriefSummary(latestReport.content) ?? "Отчет без резюме",
          createdAt: latestReport.createdAt.toISOString(),
        }
      : null,
    participants: event.participants.map(mapEventParticipant),
  };
}

function mapEventParticipant(
  participant: EventParticipant & { briefs: Brief[] }
): PauEventParticipant {
  const activeBrief = participant.briefs.find(
    (brief) => brief.briefType === BriefType.ACTIVE
  );
  const clubBranch = getParticipantClubBranch(participant.sourcePayload);
  const clubCustomer = getParticipantClubCustomer(participant.sourcePayload);
  const businessProfile = normalizeParticipantBusinessProfile(participant);

  return {
    id: participant.id,
    participantId: participant.participantId,
    kind: participant.kind,
    status: participant.status,
    bitrixDealId: participant.bitrixDealId,
    bitrixContactId: participant.bitrixContactId,
    fullName: participant.fullName,
    email: null,
    phone: null,
    telegram: null,
    company: participant.company,
    position: participant.position ?? businessProfile?.main?.role ?? null,
    city: participant.city ?? clubBranch,
    clubBranch,
    clubCustomer,
    age: participant.age,
    gender: participant.gender,
    businessMain: participant.businessMain,
    businessExtra1: participant.businessExtra1,
    businessExtra2: participant.businessExtra2,
    businessExtra3: participant.businessExtra3,
    businessProfile,
    enrichment: normalizeParticipantEnrichment(participant),
    bitrixComment: getParticipantBitrixComment(participant.sourcePayload),
    matchedScore: participant.matchedScore,
    matchRationale: participant.matchRationale,
    attendanceMarked: participant.attendanceMarked,
    briefSummary: getBriefSummary(activeBrief?.content),
  };
}

function normalizeParticipantBusinessProfile(
  participant: EventParticipant
): PauEventParticipant["businessProfile"] {
  if (isRecord(participant.businessProfile)) {
    const profile = participant.businessProfile as NonNullable<
      PauEventParticipant["businessProfile"]
    >;
    return Object.values(profile).some(Boolean) ? profile : null;
  }

  const profile: NonNullable<PauEventParticipant["businessProfile"]> = {
    main: participant.businessMain
      ? buildLegacyBusinessBlock(participant.businessMain)
      : null,
    extra1: participant.businessExtra1
      ? buildLegacyBusinessBlock(participant.businessExtra1)
      : null,
    extra2: participant.businessExtra2
      ? buildLegacyBusinessBlock(participant.businessExtra2)
      : null,
    extra3: participant.businessExtra3
      ? buildLegacyBusinessBlock(participant.businessExtra3)
      : null,
  };

  return Object.values(profile).some(Boolean) ? profile : null;
}

function buildLegacyBusinessBlock(
  sphere: string
): NonNullable<PauEventParticipant["businessProfile"]>["main"] {
  return {
    sphere,
    specifics: null,
    role: null,
    experience: null,
    okved: null,
    sharePercent: null,
    revenue: null,
    rusprofileUrl: null,
    siteUrl: null,
  };
}

function normalizeParticipantEnrichment(
  participant: EventParticipant
): PauEventParticipant["enrichment"] {
  return mergeParticipantEnrichment(
    getParticipantDealEnrichment(participant.sourcePayload),
    normalizeEnrichmentRecord(participant.enrichment)
  );
}

function normalizeEnrichmentRecord(
  value: Prisma.JsonValue | null
): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }

  const enrichment = Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const text = getString(item);
      return text ? [[key, text]] : [];
    })
  );

  return Object.keys(enrichment).length > 0 ? enrichment : null;
}

function getParticipantClubBranch(
  sourcePayload: Prisma.JsonValue | null
): string | null {
  const deal = getParticipantSourceDeal(sourcePayload);
  const rawValue = getString(deal?.[BITRIX_DEAL_CLUB_BRANCH_FIELD]);
  if (!rawValue) {
    return null;
  }

  return BITRIX_DEAL_CLUB_BRANCH_LABELS[rawValue] ?? rawValue;
}

function getParticipantClubCustomer(
  sourcePayload: Prisma.JsonValue | null
): string | null {
  const deal = getParticipantSourceDeal(sourcePayload);
  const rawValue = getString(deal?.[BITRIX_DEAL_CLUB_CUSTOMER_FIELD]);
  if (!rawValue) {
    return null;
  }

  return BITRIX_DEAL_CLUB_CUSTOMER_LABELS[rawValue] ?? rawValue;
}

function getParticipantBitrixComment(
  sourcePayload: Prisma.JsonValue | null
): string | null {
  const deal = getParticipantSourceDeal(sourcePayload);
  return normalizeBitrixText(deal?.COMMENTS);
}

function getParticipantSourceDeal(
  sourcePayload: Prisma.JsonValue | null
): Record<string, unknown> | null {
  if (!isRecord(sourcePayload)) {
    return null;
  }

  const profile = sourcePayload.profile;
  if (!isRecord(profile) || !isRecord(profile.deal)) {
    return null;
  }

  return profile.deal;
}

function getParticipantDealEnrichment(
  sourcePayload: Prisma.JsonValue | null
): Record<string, string> | null {
  const deal = getParticipantSourceDeal(sourcePayload);
  if (!deal) {
    return null;
  }

  const enrichment = Object.fromEntries(
    Object.entries(BITRIX_DEAL_ENRICHMENT_FIELDS).flatMap(([key, field]) => {
      const text = getString(deal[field]);
      return text ? [[key, text]] : [];
    })
  );

  return Object.keys(enrichment).length > 0 ? enrichment : null;
}

function mergeParticipantEnrichment(
  ...profiles: Array<Record<string, string> | null>
): PauEventParticipant["enrichment"] {
  const merged = Object.assign({}, ...profiles.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : null;
}

function normalizeBitrixText(value: unknown): string | null {
  const text = getString(value);
  if (!text) {
    return null;
  }

  return decodeBasicHtmlEntities(
    text
      .replace(/\[\/?p\]/gi, "\n")
      .replace(/\[br\s*\/?\]/gi, "\n")
      .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, "$1")
      .replace(/\[\/?[^\]]+\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function mapFormat(format: EventFormat): PauFormat {
  return {
    slug: format.slug,
    name: format.name,
    description: format.description,
    audience: format.audience,
    moderatorNotes: format.moderatorNotes,
    bitrixEventTypeIds: format.bitrixEventTypeIds,
    bitrixSyncTitleQuery: format.bitrixSyncTitleQuery,
    matchingRules: format.matchingRules,
    promptPotential: format.promptPotential,
    promptActive: format.promptActive,
    promptModerator: format.promptModerator,
    promptReport: format.promptReport,
  };
}

function mapBrief(
  brief: Brief & {
    event?: Event | null;
    eventParticipant?: EventParticipant | null;
    participant?: { fullName: string } | null;
  }
): PauBrief {
  return {
    id: brief.id,
    eventTitle: brief.event?.title ?? null,
    participantName:
      brief.briefType === BriefType.REPORT
        ? "Отчет мероприятия"
        : brief.eventParticipant?.fullName ??
          brief.participant?.fullName ??
          "Модератор",
    briefType: brief.briefType,
    model: brief.model,
    summary: getBriefSummary(brief.content) ?? "Без резюме",
    createdAt: brief.createdAt.toISOString(),
    createdByRole: brief.createdByRole,
  };
}

function mapUser(user: AppUser): PauUser {
  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  };
}

function bitrixEventSmartItemId(event: BitrixEvent) {
  return `${event.entityTypeId}:${event.eventId}`;
}

function visitFallbackKey(visit: BitrixEventVisit) {
  return visit.eventId
    ? `unresolved:${visit.eventId}`
    : `${visit.eventDate || "undated"}::${normalizeLabel(visit.eventName)}`;
}

async function findFallbackEventForVisit(visit: BitrixEventVisit) {
  return prisma.event.findUnique({
    where: { bitrixSmartItemId: `visit-group:${visitFallbackKey(visit)}` },
  });
}

function resolveFormatForBitrixEvent(
  formats: EventFormat[],
  event: {
    title: string | null;
    eventTypeId: string | null;
    eventTypeLabel: string | null;
    formatId: string | null;
    formatLabel: string | null;
  }
) {
  const slug = resolvePauFormatForBitrixEvent(formats, event, DEFAULT_FORMAT_SLUG);
  const format =
    formats.find((format) => format.slug === slug) ??
    formats.find((format) => format.slug === DEFAULT_FORMAT_SLUG) ??
    formats[0];
  if (!format) {
    throw new Error("No PAU event formats configured");
  }

  return format;
}

function parseBitrixDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPreparationEventStatus(
  eventDate: string | null,
  bitrixStatus: BitrixEvent["status"] | null
): PreparationEventStatus {
  if (bitrixStatus === "canceled") {
    return "CANCELED";
  }

  if (bitrixStatus === "completed") {
    return "PAST";
  }

  if (!eventDate) {
    return "UNKNOWN";
  }

  return Date.parse(eventDate) >= Date.now() ? "UPCOMING" : "PAST";
}

async function upsertParticipantFromProfile(
  profile: Awaited<ReturnType<typeof mapBitrixDealToEventParticipant>>
) {
  return prisma.participant.upsert({
    where: { bitrixDealId: profile.bitrixDealId },
    update: {
      bitrixContactId: profile.bitrixContactId,
      status: profile.status,
      fullName: profile.fullName,
      email: null,
      phone: null,
      telegram: null,
      company: profile.company,
      position: profile.position,
      city: profile.city,
      sourceFormatSlug: null,
      sourcePayload: profile.sourcePayload as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
    create: {
      bitrixDealId: profile.bitrixDealId,
      bitrixContactId: profile.bitrixContactId,
      status: profile.status,
      fullName: profile.fullName,
      email: null,
      phone: null,
      telegram: null,
      company: profile.company,
      position: profile.position,
      city: profile.city,
      sourcePayload: profile.sourcePayload as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
  });
}

async function ensureDefaultFormats() {
  const count = await prisma.eventFormat.count();
  if (count > 0) {
    return;
  }

  await prisma.eventFormat.create({
    data: {
      slug: DEFAULT_FORMAT_SLUG,
      name: "Гостевая встреча",
      description:
        "Основной формат знакомства потенциальных участников с клубом и активными участниками.",
      audience: "Потенциальные и активные участники",
      moderatorNotes: "Проверить состав и персональные связки.",
      bitrixEventTypeIds: ["гостевая", "гость", "знакомство"],
      bitrixSyncTitleQuery: "Гостевая встреча",
      matchingRules: {
        goal: "Подобрать активных участников по релевантности и доверию.",
      },
      promptPotential:
        "Сформируй краткий бриф по гостю: бизнес, запрос, риски, что уточнить.",
      promptActive:
        "Сформируй бриф активного участника: почему он релевантен и какие темы поднять.",
      promptModerator:
        "Сформируй карту связок и риски динамики для модератора.",
      promptReport:
        "Сформируй отчет по расшифровке встречи: ключевые темы, решения, риски и следующие шаги.",
    },
  });
}

async function getActiveIdentifiers() {
  const configured = getCsvEnv("PAU_ACTIVE_IDENTIFIERS");
  const activeParticipants = await prisma.participant.findMany({
    where: { status: "ACTIVE" },
    select: {
      bitrixDealId: true,
      bitrixContactId: true,
    },
  });

  return [
    ...configured,
    ...activeParticipants.flatMap((participant) => [
      participant.bitrixDealId,
      participant.bitrixContactId,
    ]),
  ].filter((value): value is string => Boolean(value));
}

function getBitrixAliases(discoveredEventLinkField?: string | null): BitrixFieldAliases {
  return normalizeAliases({
    eventLinkField:
      getOptionalEnv("BITRIX_EVENT_LINK_FIELD") ??
      discoveredEventLinkField ??
      undefined,
    businessMainField: getOptionalEnv("BITRIX_BUSINESS_MAIN_FIELD") ?? undefined,
    businessExtra1Field:
      getOptionalEnv("BITRIX_BUSINESS_EXTRA_1_FIELD") ?? undefined,
    businessExtra2Field:
      getOptionalEnv("BITRIX_BUSINESS_EXTRA_2_FIELD") ?? undefined,
    businessExtra3Field:
      getOptionalEnv("BITRIX_BUSINESS_EXTRA_3_FIELD") ?? undefined,
    enrichmentField: getOptionalEnv("BITRIX_ENRICHMENT_FIELD") ?? undefined,
    ageField: getOptionalEnv("BITRIX_AGE_FIELD"),
    birthdateField: getOptionalEnv("BITRIX_BIRTHDATE_FIELD"),
    genderField: getOptionalEnv("BITRIX_GENDER_FIELD"),
  });
}

function formatPatchToData(patch: FormatPatch): Prisma.EventFormatUpdateInput {
  return {
    name: patch.name,
    description: patch.description,
    audience: patch.audience,
    moderatorNotes: patch.moderatorNotes,
    bitrixEventTypeIds: patch.bitrixEventTypeIds,
    bitrixSyncTitleQuery: patch.bitrixSyncTitleQuery,
    matchingRules:
      patch.matchingRules === undefined ? undefined : jsonOrNull(patch.matchingRules),
    promptPotential: patch.promptPotential,
    promptActive: patch.promptActive,
    promptModerator: patch.promptModerator,
    promptReport: patch.promptReport,
  };
}

function countStatus(
  participants: EventParticipant[],
  status: EventParticipantStatus
) {
  return participants.filter((participant) => participant.status === status).length;
}

function briefToParagraphs(content: Prisma.JsonValue | null) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return [new Paragraph(String(content ?? ""))];
  }

  const paragraphs: Paragraph[] = [];
  const summary = "summary" in content ? String(content.summary ?? "") : "";
  if (summary) {
    paragraphs.push(new Paragraph(summary));
  }

  for (const key of ["talkingPoints", "risks", "nextSteps"] as const) {
    const value = content[key];
    if (!Array.isArray(value)) {
      continue;
    }

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: sectionTitle(key), bold: true })],
      })
    );
    for (const item of value) {
      paragraphs.push(new Paragraph(`- ${String(item)}`));
    }
  }

  return paragraphs;
}

function sectionTitle(key: "talkingPoints" | "risks" | "nextSteps") {
  if (key === "talkingPoints") {
    return "Точки разговора";
  }

  if (key === "risks") {
    return "Риски";
  }

  return "Следующие шаги";
}

function getBriefSummary(content: Prisma.JsonValue | undefined | null) {
  if (
    content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    "summary" in content &&
    typeof content.summary === "string"
  ) {
    return content.summary;
  }

  return null;
}

function getRationale(content: Prisma.JsonValue | undefined | null) {
  if (
    content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    "rationale" in content &&
    typeof content.rationale === "string"
  ) {
    return content.rationale;
  }

  return null;
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function jsonValueOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

function getString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е");
}

async function logSync(status: "SUCCESS" | "FAILED", message: string) {
  await prisma.syncLog.create({
    data: {
      source: "BITRIX24_EVENTS",
      status,
      message,
    },
  });
}

async function canUseDatabase(integrationStatus: PauIntegrationStatus) {
  return integrationStatus.database && (await isDatabaseAvailable());
}

function assertDatabase() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured");
  }
}

async function isDatabaseAvailable() {
  if (!(await isDatabaseTcpReachable())) {
    return false;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function isDatabaseTcpReachable() {
  const databaseUrl = getOptionalEnv("DATABASE_URL");
  if (!databaseUrl) {
    return false;
  }

  try {
    const url = new URL(databaseUrl);
    const port = Number(url.port || "5432");
    if (!url.hostname || !Number.isInteger(port)) {
      return false;
    }

    return await canOpenTcpConnection(url.hostname, port);
  } catch {
    return false;
  }
}

function canOpenTcpConnection(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
