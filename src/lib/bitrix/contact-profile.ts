import type { BitrixClient } from "./client";

export type BitrixContactProfileFieldMetadata = {
  type?: string | null;
  settings?: Record<string, unknown> | null;
  items?: Array<{
    ID?: string | number;
    id?: string | number;
    VALUE?: string | null;
    value?: string | null;
  }>;
  title?: string | null;
  listLabel?: string | null;
  formLabel?: string | null;
  filterLabel?: string | null;
};

export type BitrixContactProfileFields = Record<
  string,
  BitrixContactProfileFieldMetadata
>;

export type BitrixContactEntity = Record<string, unknown>;

export const BITRIX_CONTACT_BUSINESS_MAIN_FIELD = "UF_CRM_1667127836";
export const BITRIX_CONTACT_BUSINESS_EXTRA_1_FIELD = "UF_CRM_1667137130";
export const BITRIX_CONTACT_BUSINESS_EXTRA_2_FIELD = "UF_CRM_1667137172";
export const BITRIX_CONTACT_BUSINESS_EXTRA_3_FIELD = "UF_CRM_1667137190";
export const BITRIX_CONTACT_BUSINESS_PROFILE_FIELD =
  "__PAU_CONTACT_BUSINESS_PROFILE";
export const BITRIX_CONTACT_ENRICHMENT_PAYLOAD_FIELD =
  "__PAU_CONTACT_ENRICHMENT";

export type BitrixContactBusinessBlock = {
  sphere: string | null;
  specifics: string | null;
  role: string | null;
  experience: string | null;
  okved: string | null;
  sharePercent: string | null;
  revenue: string | null;
  rusprofileUrl: string | null;
  siteUrl: string | null;
};

export type BitrixContactBusinessProfile = {
  main: BitrixContactBusinessBlock | null;
  extra1: BitrixContactBusinessBlock | null;
  extra2: BitrixContactBusinessBlock | null;
  extra3: BitrixContactBusinessBlock | null;
};

const CONTACT_BUSINESS_FIELDS = [
  BITRIX_CONTACT_BUSINESS_MAIN_FIELD,
  BITRIX_CONTACT_BUSINESS_EXTRA_1_FIELD,
  BITRIX_CONTACT_BUSINESS_EXTRA_2_FIELD,
  BITRIX_CONTACT_BUSINESS_EXTRA_3_FIELD,
] as const;

const CONTACT_IDENTITY_FIELDS = ["UF_CRM_1643718541418"] as const;

const CONTACT_BUSINESS_GROUPS = {
  main: {
    sphere: BITRIX_CONTACT_BUSINESS_MAIN_FIELD,
    specifics: "UF_CRM_1643721389",
    role: "UF_CRM_1643793756",
    experience: "UF_CRM_1766145312607",
    okved: "UF_CRM_1766145758122",
    sharePercent: "UF_CRM_1766146139889",
    revenue: "UF_CRM_1647946359",
    rusprofileUrl: "UF_CRM_INFOCOMP_KOSAS",
    siteUrl: null,
  },
  extra1: {
    sphere: BITRIX_CONTACT_BUSINESS_EXTRA_1_FIELD,
    specifics: "UF_CRM_1667137598",
    role: "UF_CRM_1667135843",
    experience: null,
    okved: "UF_CRM_1766145794497",
    sharePercent: "UF_CRM_1766146188567",
    revenue: "UF_CRM_1773231015874",
    rusprofileUrl: "UF_CRM_1766145626758",
    siteUrl: "UF_CRM_1768212851360",
  },
  extra2: {
    sphere: BITRIX_CONTACT_BUSINESS_EXTRA_2_FIELD,
    specifics: "UF_CRM_1667137605",
    role: "UF_CRM_1667135884",
    experience: null,
    okved: "UF_CRM_1766145818789",
    sharePercent: "UF_CRM_1766146199062",
    revenue: "UF_CRM_1773231111581",
    rusprofileUrl: "UF_CRM_1766145643422",
    siteUrl: "UF_CRM_1768212869688",
  },
  extra3: {
    sphere: BITRIX_CONTACT_BUSINESS_EXTRA_3_FIELD,
    specifics: "UF_CRM_1667137611",
    role: "UF_CRM_1667135910",
    experience: null,
    okved: "UF_CRM_1766145835144",
    sharePercent: "UF_CRM_1766146211183",
    revenue: "UF_CRM_1773231147700",
    rusprofileUrl: "UF_CRM_1766145663782",
    siteUrl: "UF_CRM_1768212884641",
  },
} as const;

const CONTACT_ENRICHMENT_FIELDS = {
  keyProjects: null,
  clubConnections: null,
  wasInCommunity: "UF_CRM_1765895191819",
  previousCommunities: "UF_CRM_1643816816",
  clubGoals: "UF_CRM_1643816950",
  hobbies: "UF_CRM_1643817006",
  personalIncome: "UF_CRM_1766145330402",
  mentionsLinks: "UF_CRM_1766147011846",
  additionalInfo: "UF_CRM_1768223556404",
  familyKids: "UF_CRM_1643817014",
  newProjects: "UF_CRM_1667310772911",
  usefulForClub: "UF_CRM_1643816879",
} as const;

export async function buildReadableBitrixContactProfiles(input: {
  bitrix: BitrixClient;
  contacts: BitrixContactEntity[];
  fields: BitrixContactProfileFields;
}) {
  const listElementNameCache = new Map<string, Promise<string | null>>();

  return Promise.all(
    input.contacts.map((contact) =>
      buildReadableBitrixContactProfile({
        contact,
        fields: input.fields,
        resolveListElementName: (iblockId, elementId) => {
          const cacheKey = `${iblockId}:${elementId}`;
          let cached = listElementNameCache.get(cacheKey);
          if (!cached) {
            cached = resolveListElementName(input.bitrix, iblockId, elementId);
            listElementNameCache.set(cacheKey, cached);
          }

          return cached;
        },
      })
    )
  );
}

export async function buildReadableBitrixContactProfile(input: {
  contact: BitrixContactEntity;
  fields: BitrixContactProfileFields;
  resolveListElementName: (
    iblockId: string,
    elementId: string
  ) => Promise<string | null>;
}): Promise<BitrixContactEntity> {
  const contact = { ...input.contact };

  for (const field of [...CONTACT_BUSINESS_FIELDS, ...CONTACT_IDENTITY_FIELDS]) {
    const decoded = await decodeBitrixFieldValue(
      input.contact[field],
      input.fields[field],
      input.resolveListElementName
    );
    if (!isEmptyBitrixValue(decoded)) {
      contact[field] = toProfileText(decoded);
    }
  }

  const businessProfile = await buildBusinessProfile(input);
  if (hasBusinessProfileValue(businessProfile)) {
    contact[BITRIX_CONTACT_BUSINESS_PROFILE_FIELD] = businessProfile;
  }

  const enrichment = await buildEnrichmentProfile(input);
  if (Object.keys(enrichment).length > 0) {
    contact[BITRIX_CONTACT_ENRICHMENT_PAYLOAD_FIELD] = enrichment;
  }

  return contact;
}

export function getBitrixFieldLabel(
  field: string,
  metadata: BitrixContactProfileFieldMetadata | undefined
) {
  return (
    metadata?.formLabel ??
    metadata?.listLabel ??
    metadata?.filterLabel ??
    metadata?.title ??
    field
  );
}

async function decodeBitrixFieldValue(
  value: unknown,
  metadata: BitrixContactProfileFieldMetadata | undefined,
  resolveListElementName: (
    iblockId: string,
    elementId: string
  ) => Promise<string | null>
): Promise<unknown> {
  if (isEmptyBitrixValue(value)) {
    return null;
  }

  if (metadata?.type === "enumeration") {
    return decodeEnumerationValue(value, metadata);
  }

  if (metadata?.type === "iblock_element") {
    return decodeListElementValue(value, metadata, resolveListElementName);
  }

  return value;
}

function decodeEnumerationValue(
  value: unknown,
  metadata: BitrixContactProfileFieldMetadata
) {
  const items = new Map(
    (metadata.items ?? []).map((item) => [
      String(item.ID ?? item.id),
      item.VALUE ?? item.value ?? null,
    ])
  );
  const decoded = getBitrixScalarValues(value)
    .map((item) => items.get(item) ?? item)
    .filter((item): item is string => Boolean(item));

  return collapseDecodedValues(decoded);
}

async function decodeListElementValue(
  value: unknown,
  metadata: BitrixContactProfileFieldMetadata,
  resolveListElementName: (
    iblockId: string,
    elementId: string
  ) => Promise<string | null>
) {
  const iblockId = normalizeOptionalString(metadata.settings?.IBLOCK_ID);
  if (!iblockId) {
    return value;
  }

  const decoded = await Promise.all(
    getBitrixScalarValues(value).map(async (elementId) => {
      try {
        return (await resolveListElementName(iblockId, elementId)) ?? elementId;
      } catch {
        return elementId;
      }
    })
  );

  return collapseDecodedValues(decoded);
}

async function resolveListElementName(
  bitrix: BitrixClient,
  iblockId: string,
  elementId: string
) {
  const rows = await bitrix.call<Array<{ NAME?: string | null }>>(
    "lists.element.get",
    {
      IBLOCK_TYPE_ID: "lists",
      IBLOCK_ID: Number(iblockId),
      ELEMENT_ID: Number(elementId),
      SELECT: ["ID", "NAME"],
    }
  );

  return normalizeOptionalString(rows[0]?.NAME);
}

function getBitrixScalarValues(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(getBitrixScalarValues);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      getBitrixScalarValues
    );
  }

  const normalized = normalizeOptionalString(value);
  return normalized ? [normalized] : [];
}

function collapseDecodedValues(values: string[]) {
  if (values.length === 0) {
    return null;
  }

  return values.length === 1 ? values[0] : values;
}

function toProfileText(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeOptionalString(item))
      .filter((item): item is string => Boolean(item))
      .join(", ");
  }

  return normalizeOptionalString(value);
}

async function buildBusinessProfile(input: {
  contact: BitrixContactEntity;
  fields: BitrixContactProfileFields;
  resolveListElementName: (
    iblockId: string,
    elementId: string
  ) => Promise<string | null>;
}): Promise<BitrixContactBusinessProfile> {
  return {
    main: await buildBusinessBlock(input, CONTACT_BUSINESS_GROUPS.main),
    extra1: await buildBusinessBlock(input, CONTACT_BUSINESS_GROUPS.extra1),
    extra2: await buildBusinessBlock(input, CONTACT_BUSINESS_GROUPS.extra2),
    extra3: await buildBusinessBlock(input, CONTACT_BUSINESS_GROUPS.extra3),
  };
}

async function buildBusinessBlock(
  input: {
    contact: BitrixContactEntity;
    fields: BitrixContactProfileFields;
    resolveListElementName: (
      iblockId: string,
      elementId: string
    ) => Promise<string | null>;
  },
  fields: Record<keyof BitrixContactBusinessBlock, string | null>
): Promise<BitrixContactBusinessBlock | null> {
  const block: BitrixContactBusinessBlock = {
    sphere: null,
    specifics: null,
    role: null,
    experience: null,
    okved: null,
    sharePercent: null,
    revenue: null,
    rusprofileUrl: null,
    siteUrl: null,
  };

  for (const key of Object.keys(block) as Array<keyof BitrixContactBusinessBlock>) {
    const field = fields[key];
    if (!field) {
      continue;
    }

    const decoded = await decodeBitrixFieldValue(
      input.contact[field],
      input.fields[field],
      input.resolveListElementName
    );
    block[key] = toProfileText(decoded);
  }

  return Object.values(block).some(Boolean) ? block : null;
}

async function buildEnrichmentProfile(input: {
  contact: BitrixContactEntity;
  fields: BitrixContactProfileFields;
  resolveListElementName: (
    iblockId: string,
    elementId: string
  ) => Promise<string | null>;
}) {
  const enrichment: Record<string, string> = {};
  for (const [key, field] of Object.entries(CONTACT_ENRICHMENT_FIELDS)) {
    if (!field) {
      continue;
    }

    const decoded = await decodeBitrixFieldValue(
      input.contact[field],
      input.fields[field],
      input.resolveListElementName
    );
    const text = toProfileText(decoded);
    if (text) {
      enrichment[key] = text;
    }
  }

  return enrichment;
}

function hasBusinessProfileValue(profile: BitrixContactBusinessProfile) {
  return Object.values(profile).some(Boolean);
}

function isEmptyBitrixValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isEmptyBitrixValue);
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }

  return false;
}

function normalizeOptionalString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
