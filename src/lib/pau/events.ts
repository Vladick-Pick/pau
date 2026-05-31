export const BITRIX_EVENT_LINK_FIELD = "UF_CRM_1645692484";

const BITRIX_PERSONAL_MEETING_FIELDS = new Set([
  "UF_CRM_1669784114991",
  "UF_CRM_1669784197394",
]);

const BITRIX_CONTACT_CHANNEL_FIELDS = new Set([
  "email",
  "fm",
  "im",
  "phone",
  "telegram",
  "ufcrmtelegram",
]);

const BITRIX_FREE_TEXT_PAYLOAD_FIELDS = new Set([
  "additionalinfo",
  "comments",
  "sourcedescription",
]);

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d(?:[\s().-]*\d){9,14}/g;

const BITRIX_BUSINESS_FIELDS = {
  main: "UF_CRM_1774269641800",
  extra1: "UF_CRM_1774269653902",
  extra2: "UF_CRM_1774270188442",
  extra3: "UF_CRM_1774270204829",
  enrichment: "UF_CRM_1774269721467",
} as const;

export type EventParticipantStatus =
  | "INVITED"
  | "CONFIRMED"
  | "ATTENDED"
  | "REFUSED"
  | "MISSED"
  | "UNKNOWN";

export type EventParticipantKind = "POTENTIAL" | "ACTIVE";

export type BitrixRecord = Record<string, unknown>;

export type BitrixVisitRecord = BitrixRecord & {
  id?: string | number;
  title?: string | null;
  stageId?: string | number | null;
  stageName?: string | null;
  parentId2?: unknown;
  contactId?: unknown;
  assignedById?: unknown;
  sourceId?: string | number | null;
  createdTime?: string | null;
  updatedTime?: string | null;
};

export type EventParticipantProfile = {
  id: string;
  eventId: string;
  bitrixVisitId: string | null;
  bitrixDealId: string | null;
  bitrixContactId: string | null;
  fullName: string;
  company: string | null;
  position: string | null;
  status: EventParticipantStatus;
  participantKind: EventParticipantKind;
  age?: number | null;
  gender?: string | null;
  businessFields: {
    main: string | null;
    extra1: string | null;
    extra2: string | null;
    extra3: string | null;
    enrichment: string | null;
  };
  sourcePayload: BitrixRecord;
};

export type PauFormatCandidate = {
  slug: string;
  bitrixEventTypeIds: string[];
};

export type BitrixEventFormatMetadata = {
  title: string | null;
  eventTypeId: string | null;
  eventTypeLabel: string | null;
  formatId: string | null;
  formatLabel: string | null;
};

export function normalizeEventParticipantStatus(
  stageName: string | null | undefined
): EventParticipantStatus {
  const label = normalizeLabel(stageName);
  const stageCode = label.split(":").pop() ?? label;

  if (label.includes("не приш")) {
    return "MISSED";
  }

  if (label.includes("посетил") || label.includes("на мероприятии")) {
    return "ATTENDED";
  }

  if (stageCode === "success") {
    return "ATTENDED";
  }

  if (label.includes("подтверд")) {
    return "CONFIRMED";
  }

  if (stageCode === "preparation") {
    return "CONFIRMED";
  }

  if (label.includes("отказ")) {
    return "REFUSED";
  }

  if (stageCode === "fail") {
    return "REFUSED";
  }

  if (label.includes("приглаш")) {
    return "INVITED";
  }

  if (stageCode === "new") {
    return "INVITED";
  }

  return "UNKNOWN";
}

export function mapBitrixVisitToEventParticipant(input: {
  eventId: string;
  visit: BitrixVisitRecord;
  deal?: BitrixRecord | null;
  contact?: BitrixRecord | null;
  participantKind?: EventParticipantKind;
}): EventParticipantProfile {
  const bitrixVisitId = toOptionalString(
    input.visit.id ?? input.visit.ID ?? input.visit.ID
  );
  const bitrixDealId = extractLinkedId(input.visit.parentId2) ??
    toOptionalString(getAny(input.deal, ["ID", "id"]));
  const bitrixContactId = extractLinkedId(input.visit.contactId) ??
    toOptionalString(getAny(input.contact, ["ID", "id"])) ??
    toOptionalString(getAny(input.deal, ["CONTACT_ID", "contactId"]));
  const fullName =
    compact([
      toOptionalString(getAny(input.contact, ["NAME", "name"])),
      toOptionalString(getAny(input.contact, ["LAST_NAME", "lastName"])),
    ]).join(" ") ||
    toOptionalString(getAny(input.deal, ["TITLE", "title"])) ||
    toOptionalString(input.visit.title) ||
    "Без имени";

  return {
    id: bitrixVisitId ? `visit-${bitrixVisitId}` : `deal-${bitrixDealId ?? input.eventId}`,
    eventId: input.eventId,
    bitrixVisitId,
    bitrixDealId,
    bitrixContactId,
    fullName,
    company:
      toOptionalString(getAny(input.contact, ["COMPANY_TITLE", "companyTitle"])) ??
      toOptionalString(getAny(input.deal, ["COMPANY_TITLE", "companyTitle"])),
    position:
      toOptionalString(getAny(input.contact, ["POST", "post"])) ??
      toOptionalString(getAny(input.deal, ["POST", "post"])),
    status: normalizeEventParticipantStatus(input.visit.stageName),
    participantKind: input.participantKind ?? "POTENTIAL",
    businessFields: {
      main: toOptionalString(getAny(input.deal, [BITRIX_BUSINESS_FIELDS.main])),
      extra1: toOptionalString(getAny(input.deal, [BITRIX_BUSINESS_FIELDS.extra1])),
      extra2: toOptionalString(getAny(input.deal, [BITRIX_BUSINESS_FIELDS.extra2])),
      extra3: toOptionalString(getAny(input.deal, [BITRIX_BUSINESS_FIELDS.extra3])),
      enrichment: toOptionalString(
        getAny(input.deal, [BITRIX_BUSINESS_FIELDS.enrichment])
      ),
    },
    sourcePayload: sanitizeSourcePayload({
      visit: input.visit,
      deal: input.deal ?? null,
      contact: null,
    }),
  };
}

export function resolvePauFormatForBitrixEvent(
  formats: PauFormatCandidate[],
  event: BitrixEventFormatMetadata,
  defaultSlug = "guest-meeting"
) {
  const eventValues = [
    event.eventTypeId,
    event.eventTypeLabel,
    event.formatId,
    event.formatLabel,
  ]
    .map(normalizeLabel)
    .filter(Boolean);
  const eventTitle = normalizeLabel(event.title);
  const matched = formats.find((format) =>
    format.bitrixEventTypeIds.some((id) => {
      const normalizedId = normalizeLabel(id);
      return (
        Boolean(normalizedId) &&
        (eventValues.includes(normalizedId) || eventTitle.includes(normalizedId))
      );
    })
  );

  return (
    matched?.slug ??
    formats.find((format) => format.slug === defaultSlug)?.slug ??
    formats[0]?.slug ??
    defaultSlug
  );
}

export function extractEventParticipantProfile(participant: EventParticipantProfile) {
  return {
    id: participant.id,
    fullName: participant.fullName,
    company: participant.company,
    position: participant.position,
    status: participant.status,
    participantKind: participant.participantKind,
    businessContext: compact([
      participant.businessFields.main,
      participant.businessFields.extra1,
      participant.businessFields.extra2,
      participant.businessFields.extra3,
      participant.businessFields.enrichment,
    ]),
  };
}

function extractLinkedId(value: unknown): string | null {
  const raw = toOptionalString(value);
  if (!raw) {
    return null;
  }

  const match = /(\d+)$/.exec(raw);
  return match?.[1] ?? raw;
}

function sanitizeSourcePayload(payload: BitrixRecord): BitrixRecord {
  return JSON.parse(
    JSON.stringify(payload, (key, value) => {
      const normalizedKey = normalizePayloadFieldName(key);
      if (
        BITRIX_PERSONAL_MEETING_FIELDS.has(key) ||
        BITRIX_CONTACT_CHANNEL_FIELDS.has(normalizedKey)
      ) {
        return undefined;
      }

      if (
        typeof value === "string" &&
        BITRIX_FREE_TEXT_PAYLOAD_FIELDS.has(normalizedKey)
      ) {
        return redactFreeTextPayload(value);
      }

      return value;
    })
  ) as BitrixRecord;
}

function redactFreeTextPayload(value: string) {
  return value
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]");
}

function normalizePayloadFieldName(field: string) {
  return field.replaceAll("_", "").toLowerCase();
}

function getAny(
  source: BitrixRecord | null | undefined,
  keys: string[]
): unknown {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    if (key in source) {
      return source[key];
    }
  }

  return undefined;
}

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е");
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}
