export type ParticipantStatus = "POTENTIAL" | "ACTIVE";

export type BitrixEntity = Record<string, unknown>;

export const BITRIX_EVENT_LINK_FIELD = "UF_CRM_1645692484";
export const BITRIX_BUSINESS_MAIN_FIELD = "UF_CRM_1774269641800";
export const BITRIX_BUSINESS_EXTRA_1_FIELD = "UF_CRM_1774269653902";
export const BITRIX_BUSINESS_EXTRA_2_FIELD = "UF_CRM_1774270188442";
export const BITRIX_BUSINESS_EXTRA_3_FIELD = "UF_CRM_1774270204829";
export const BITRIX_ENRICHMENT_FIELD = "UF_CRM_1774269721467";

export const PERSONAL_MEETING_FIELDS = [
  "UF_CRM_1669784114991",
  "UF_CRM_1669784197394",
] as const;

export type NormalizedParticipant = {
  bitrixDealId: string;
  bitrixContactId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  company: string | null;
  position: string | null;
  city: string | null;
  sourceFormatSlug: string | null;
  status: ParticipantStatus;
  sourcePayload: {
    deal: BitrixEntity;
    contact: BitrixEntity | null;
  };
};

export type BitrixFieldAliases = {
  eventLinkField: string;
  businessMainField: string;
  businessExtra1Field: string;
  businessExtra2Field: string;
  businessExtra3Field: string;
  enrichmentField: string;
  ageField?: string | null;
  birthdateField?: string | null;
  genderField?: string | null;
};

export type EventParticipantProfile = NormalizedParticipant & {
  eventLinkId: string | null;
  age: number | null;
  gender: string | null;
  businessMain: string | null;
  businessExtra1: string | null;
  businessExtra2: string | null;
  businessExtra3: string | null;
  enrichment: BitrixEntity | null;
};

type MapBitrixDealInput = {
  deal: BitrixEntity;
  contact?: BitrixEntity | null;
  activeIdentifiers: Array<string | number>;
};

export function mapBitrixDealToParticipant(
  input: MapBitrixDealInput
): NormalizedParticipant {
  const dealId = requireIdentifier(getAny(input.deal, ["id", "ID"]));
  const contactId = toOptionalString(
    getAny(input.contact, ["id", "ID"]) ??
      getAny(input.deal, ["contactId", "CONTACT_ID", "contactID"])
  );
  const email =
    getMultifield(input.contact, "EMAIL") ?? getMultifield(input.deal, "EMAIL");
  const phone =
    getMultifield(input.contact, "PHONE") ?? getMultifield(input.deal, "PHONE");
  const fullName =
    compact([
      toOptionalString(getAny(input.contact, ["name", "NAME"])),
      toOptionalString(getAny(input.contact, ["lastName", "LAST_NAME"])),
    ]).join(" ") ||
    toOptionalString(getAny(input.deal, ["title", "TITLE"])) ||
    `Bitrix deal ${dealId}`;
  const activeSet = new Set(
    input.activeIdentifiers.map((identifier) =>
      String(identifier).trim().toLowerCase()
    )
  );

  return {
    bitrixDealId: dealId,
    bitrixContactId: contactId,
    fullName,
    email,
    phone,
    telegram:
      toOptionalString(getAny(input.contact, ["ufCrmTelegram", "UF_CRM_TELEGRAM"])) ??
      toOptionalString(getAny(input.deal, ["ufCrmTelegram", "UF_CRM_TELEGRAM"])),
    company:
      toOptionalString(getAny(input.contact, ["companyTitle", "COMPANY_TITLE"])) ??
      toOptionalString(getAny(input.deal, ["companyTitle", "COMPANY_TITLE"])),
    position:
      toOptionalString(getAny(input.contact, ["post", "POST"])) ??
      toOptionalString(getAny(input.deal, ["post", "POST"])),
    city:
      toOptionalString(getAny(input.contact, ["ufCrmCity", "UF_CRM_CITY"])) ??
      toOptionalString(getAny(input.deal, ["ufCrmCity", "UF_CRM_CITY"])),
    sourceFormatSlug: toOptionalString(
      getAny(input.deal, ["ufCrmFormat", "UF_CRM_FORMAT", "formatSlug"])
    ),
    status: isKnownActive(activeSet, [dealId, contactId, email])
      ? "ACTIVE"
      : "POTENTIAL",
    sourcePayload: {
      deal: input.deal,
      contact: input.contact ?? null,
    },
  };
}

export function mapBitrixDealToEventParticipant(input: {
  deal: BitrixEntity;
  contact?: BitrixEntity | null;
  activeIdentifiers: Array<string | number>;
  aliases?: Partial<BitrixFieldAliases>;
}): EventParticipantProfile {
  const aliases = normalizeAliases(input.aliases);
  const participant = mapBitrixDealToParticipant({
    deal: sanitizeDealPayload(input.deal),
    contact: input.contact,
    activeIdentifiers: input.activeIdentifiers,
  });
  const birthdate = aliases.birthdateField
    ? toOptionalString(getAny(input.contact, [aliases.birthdateField])) ??
      toOptionalString(getAny(input.deal, [aliases.birthdateField]))
    : null;

  return {
    ...participant,
    sourcePayload: {
      deal: sanitizeDealPayload(input.deal),
      contact: input.contact ?? null,
    },
    eventLinkId: toOptionalString(getAny(input.deal, [aliases.eventLinkField])),
    age:
      getNumberFromField(input.deal, aliases.ageField) ??
      getNumberFromField(input.contact, aliases.ageField) ??
      calculateAge(birthdate),
    gender:
      getStringFromAlias(input.contact, aliases.genderField) ??
      getStringFromAlias(input.deal, aliases.genderField),
    businessMain: getStringFromAlias(input.deal, aliases.businessMainField),
    businessExtra1: getStringFromAlias(input.deal, aliases.businessExtra1Field),
    businessExtra2: getStringFromAlias(input.deal, aliases.businessExtra2Field),
    businessExtra3: getStringFromAlias(input.deal, aliases.businessExtra3Field),
    enrichment: getRecordFromAlias(input.deal, aliases.enrichmentField),
  };
}

export function normalizeEventStatus(stageName: string | null | undefined) {
  const value = normalizeLabel(stageName);

  if (value.includes("подтверж")) {
    return "CONFIRMED" as const;
  }

  if (value.includes("посетил") || value.includes("на мероприятии")) {
    return "ATTENDED" as const;
  }

  if (value.includes("отказ")) {
    return "REFUSED" as const;
  }

  if (value.includes("не приш") || value.includes("no show")) {
    return "MISSED" as const;
  }

  if (value.includes("приглаш")) {
    return "INVITED" as const;
  }

  return "UNKNOWN" as const;
}

export function sanitizeDealPayload(deal: BitrixEntity): BitrixEntity {
  const sanitized = { ...deal };
  for (const field of PERSONAL_MEETING_FIELDS) {
    delete sanitized[field];
  }

  return sanitized;
}

export function normalizeAliases(
  aliases: Partial<BitrixFieldAliases> = {}
): BitrixFieldAliases {
  return {
    eventLinkField: aliases.eventLinkField ?? BITRIX_EVENT_LINK_FIELD,
    businessMainField: aliases.businessMainField ?? BITRIX_BUSINESS_MAIN_FIELD,
    businessExtra1Field:
      aliases.businessExtra1Field ?? BITRIX_BUSINESS_EXTRA_1_FIELD,
    businessExtra2Field:
      aliases.businessExtra2Field ?? BITRIX_BUSINESS_EXTRA_2_FIELD,
    businessExtra3Field:
      aliases.businessExtra3Field ?? BITRIX_BUSINESS_EXTRA_3_FIELD,
    enrichmentField: aliases.enrichmentField ?? BITRIX_ENRICHMENT_FIELD,
    ageField: aliases.ageField ?? null,
    birthdateField: aliases.birthdateField ?? null,
    genderField: aliases.genderField ?? null,
  };
}

function getAny(
  source: BitrixEntity | null | undefined,
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

function getMultifield(
  source: BitrixEntity | null | undefined,
  type: "EMAIL" | "PHONE"
): string | null {
  const field =
    getAny(source, ["fm", "FM"]) ??
    getAny(source, [type.toLowerCase(), type]);
  const values =
    isRecord(field) && Array.isArray(field[type]) ? field[type] : field;

  if (!Array.isArray(values)) {
    return toOptionalString(values);
  }

  for (const value of values) {
    const candidate = isRecord(value)
      ? getAny(value, ["value", "VALUE"])
      : value;
    const normalized = toOptionalString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function requireIdentifier(value: unknown): string {
  const identifier = toOptionalString(value);
  if (!identifier) {
    throw new Error("Bitrix item is missing id");
  }

  return identifier;
}

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getStringFromAlias(
  source: BitrixEntity | null | undefined,
  alias: string | null | undefined
): string | null {
  return alias ? toOptionalString(getAny(source, [alias])) : null;
}

function getRecordFromAlias(
  source: BitrixEntity | null | undefined,
  alias: string | null | undefined
): BitrixEntity | null {
  if (!alias) {
    return null;
  }

  const value = getAny(source, [alias]);
  return isRecord(value) ? value : toOptionalString(value) ? { value } : null;
}

function getNumberFromField(
  source: BitrixEntity | null | undefined,
  alias: string | null | undefined
): number | null {
  const value = getStringFromAlias(source, alias);
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function calculateAge(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const birthdate = new Date(value);
  if (Number.isNaN(birthdate.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - birthdate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthdate.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getUTCDate() < birthdate.getUTCDate())
  ) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е");
}

function compact(values: Array<string | null>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function isKnownActive(
  activeSet: Set<string>,
  identifiers: Array<string | null>
): boolean {
  return identifiers.some(
    (identifier) => identifier && activeSet.has(identifier.toLowerCase())
  );
}
