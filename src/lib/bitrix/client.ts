import { getOptionalEnv, getRequiredEnv } from "../env";

export type BitrixClientOptions = {
  webhookUrl?: string;
  portalHost?: string;
  userId?: string;
  webhookToken?: string;
  timeoutMs?: number;
  requestIntervalMs?: number;
  fetchImpl?: typeof fetch;
};

export type BitrixEventStatus =
  | "draft"
  | "preannounce"
  | "planned"
  | "completed"
  | "canceled"
  | "unknown";

export type BitrixEvent = {
  eventId: string;
  entityTypeId: number;
  categoryId: number | null;
  title: string | null;
  eventDate: string;
  startAt: string | null;
  endAt: string | null;
  stageId: string;
  stageName: string | null;
  status: BitrixEventStatus;
  eventTypeId: string | null;
  eventTypeLabel: string | null;
  formatId: string | null;
  formatLabel: string | null;
  createdTime: string;
  updatedTime: string;
};

export type BitrixEventVisitStatus =
  | "INVITED"
  | "CONFIRMED"
  | "REFUSED"
  | "ATTENDED"
  | "MISSED"
  | "UNKNOWN";

export type BitrixEventVisit = {
  id: string;
  eventId: string | null;
  eventName: string;
  eventDate: string;
  status: BitrixEventVisitStatus;
  stageId: string;
  stageName: string;
  dealId: string | null;
  contactId: string | null;
  managerId: string | null;
  sourceId: string | null;
  createdTime: string;
  updatedTime: string;
};

type SmartProcessFieldMetadata = {
  title?: string | null;
  type?: string | null;
  settings?: Record<string, unknown> | null;
  items?: Array<{
    ID?: string | number;
    id?: string | number;
    VALUE?: string | null;
    value?: string | null;
  }>;
};

type SmartProcessCategory = {
  id: string | number;
  stages?: Array<{
    id?: string | number;
    statusId?: string | number;
    name?: string | null;
    title?: string | null;
  }>;
};

type EventDiscoveryMetadata = {
  entityTypeId: number;
  eventNameFieldName: string | null;
  eventDateFieldName: string | null;
  eventEntityTypeId: number | null;
  stageNames: Map<string, string>;
};

type EventItemDiscoveryMetadata = {
  entityTypeId: number;
  eventDateFieldName: string | null;
  eventTypeFieldName: string | null;
  eventTypeMap: Record<string, string>;
  eventFormatFieldName: string | null;
  eventFormatMap: Record<string, string>;
  stageNames: Map<string, string>;
};

type BitrixEventRow = {
  id: string | number;
  title?: string | null;
  stageId?: string | number | null;
  categoryId?: string | number | null;
  createdTime?: string | null;
  updatedTime?: string | null;
  [key: string]: unknown;
};

type BitrixEventVisitRow = BitrixEventRow & {
  assignedById?: unknown;
  contactId?: unknown;
  parentId2?: unknown;
  sourceId?: string | number | null;
};

const VISITS_SMART_PROCESS_TITLE = "Посещения мероприятий";
const DEAL_EVENT_FIELD_TITLE = "Мероприятие ОФ";
const DEAL_EVENT_FIELD_FALLBACK = "UF_CRM_1645692484";

export class BitrixClient {
  private readonly webhookUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly requestIntervalMs: number;
  private eventMetadataPromise: Promise<EventDiscoveryMetadata | null> | null = null;
  private eventItemMetadataPromise: Promise<EventItemDiscoveryMetadata | null> | null =
    null;

  constructor(options: BitrixClientOptions = {}) {
    this.webhookUrl = resolveWebhookUrl(options);
    this.fetcher = options.fetchImpl ?? fetch;
    this.timeoutMs =
      options.timeoutMs ?? Number(getOptionalEnv("BITRIX24_TIMEOUT_MS") ?? 30000);
    this.requestIntervalMs =
      options.requestIntervalMs ??
      Number(getOptionalEnv("BITRIX24_REQUEST_INTERVAL_MS") ?? 250);
  }

  async call<T>(
    method: string,
    payload: Record<string, unknown> = {}
  ): Promise<T> {
    const attempts = 2;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.callOnce<T>(method, payload);
      } catch (error) {
        lastError = error;
        if (attempt === attempts || !isTransientBitrixError(error)) {
          throw error;
        }

        await delay(this.requestIntervalMs);
      }
    }

    throw lastError;
  }

  private async callOnce<T>(
    method: string,
    payload: Record<string, unknown> = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(`${this.webhookUrl}/${method}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Bitrix24 API failed with ${response.status} ${response.statusText}`
        );
      }

      const body = (await response.json()) as {
        result?: T;
        error?: string;
        error_description?: string;
      };
      if (body.error) {
        throw new Error(body.error_description ?? body.error);
      }

      if (body.result === undefined) {
        throw new Error("Bitrix24 API returned an empty result");
      }

      return body.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getItem(entityTypeId: number, id: string | number) {
    return this.call<{ item: Record<string, unknown> }>("crm.item.get", {
      entityTypeId,
      id,
    });
  }

  async listItems(
    entityTypeId: number,
    filter: Record<string, unknown>,
    select: string[]
  ) {
    return this.call<{ items: Array<Record<string, unknown>> }>(
      "crm.item.list",
      {
        entityTypeId,
        filter,
        select,
      }
    );
  }

  async getDeal(id: string | number) {
    return this.call<Record<string, unknown>>("crm.deal.get", { id });
  }

  async listDealsByIds(ids: string[], select: string[]) {
    return this.listCrmEntitiesByIds("crm.deal.list", ids, select);
  }

  async getContact(id: string | number) {
    return this.call<Record<string, unknown>>("crm.contact.get", { id });
  }

  async listContactsByIds(ids: string[], select: string[]) {
    return this.listCrmEntitiesByIds("crm.contact.list", ids, select);
  }

  private async listCrmEntitiesByIds(
    method: "crm.deal.list" | "crm.contact.list",
    ids: string[],
    select: string[]
  ) {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => id.trim()).filter(Boolean))
    );
    if (normalizedIds.length === 0) {
      return [];
    }

    return this.listPaged<Record<string, unknown>>(method, (start) => ({
      filter:
        normalizedIds.length === 1
          ? { ID: normalizedIds[0] }
          : { "@ID": normalizedIds },
      select,
      order: { ID: "ASC" },
      start,
    }));
  }

  async getSmartProcessTypes() {
    return this.call<{
      types: Array<{ entityTypeId: string | number; title?: string | null }>;
    }>("crm.type.list");
  }

  async getSmartProcessFields(entityTypeId: number) {
    return this.call<{
      fields: Record<string, SmartProcessFieldMetadata>;
    }>("crm.item.fields", { entityTypeId });
  }

  async getSmartProcessCategories(entityTypeId: number) {
    return this.call<{
      categories: SmartProcessCategory[];
    }>("crm.category.list", { entityTypeId });
  }

  async fetchEventDealFieldName() {
    const fields = await this.call<Record<string, SmartProcessFieldMetadata>>(
      "crm.deal.fields",
      {}
    );
    return (
      findFieldByExactTitle(fields, DEAL_EVENT_FIELD_TITLE) ??
      (fields[DEAL_EVENT_FIELD_FALLBACK] ? DEAL_EVENT_FIELD_FALLBACK : null)
    );
  }

  async listEvents(input: {
    modifiedAfter: string | null;
    titleSearch?: string;
    eventIds?: string[];
  }): Promise<BitrixEvent[]> {
    const metadata = await this.getEventItemMetadata();
    if (!metadata) {
      return [];
    }

    const rows = await this.listPaged<BitrixEventRow>("crm.item.list", (start) => ({
      entityTypeId: metadata.entityTypeId,
      select: [
        "id",
        "title",
        "stageId",
        "categoryId",
        "createdTime",
        "updatedTime",
        ...(metadata.eventDateFieldName ? [metadata.eventDateFieldName] : []),
        ...(metadata.eventTypeFieldName ? [metadata.eventTypeFieldName] : []),
        ...(metadata.eventFormatFieldName ? [metadata.eventFormatFieldName] : []),
      ],
      filter: buildEventItemFilter(input),
      order: { id: "ASC" },
      start,
    }));

    return rows.map((row) => {
      const stageId = normalizeOptionalString(row.stageId) ?? "";
      const eventTypeId = metadata.eventTypeFieldName
        ? extractLinkedId(row[metadata.eventTypeFieldName])
        : null;
      const formatId = metadata.eventFormatFieldName
        ? extractLinkedId(row[metadata.eventFormatFieldName])
        : null;
      const eventDate = metadata.eventDateFieldName
        ? normalizeDateValue(
            normalizeOptionalString(row[metadata.eventDateFieldName])
          )
        : null;
      const stageName = metadata.stageNames.get(stageId) ?? stageId;

      return {
        eventId: String(row.id),
        entityTypeId: metadata.entityTypeId,
        categoryId:
          row.categoryId === null || row.categoryId === undefined
            ? null
            : Number(row.categoryId),
        title: row.title ?? null,
        eventDate: eventDate ?? row.createdTime ?? "",
        startAt: eventDate,
        endAt: null,
        stageId,
        stageName,
        status: normalizeBitrixEventStatus(stageName),
        eventTypeId,
        eventTypeLabel: eventTypeId
          ? metadata.eventTypeMap[eventTypeId] ?? eventTypeId
          : null,
        formatId,
        formatLabel: formatId ? metadata.eventFormatMap[formatId] ?? formatId : null,
        createdTime: row.createdTime ?? "",
        updatedTime: row.updatedTime ?? row.createdTime ?? "",
      };
    });
  }

  async listEventVisits(input: {
    modifiedAfter: string | null;
    reportYear: number;
    eventIds?: string[];
  }): Promise<BitrixEventVisit[]> {
    const metadata = await this.getEventMetadata();
    if (!metadata) {
      return [];
    }

    const eventTitleMap = metadata.eventEntityTypeId
      ? await this.fetchDynamicItemTitleMap(metadata.eventEntityTypeId, input.eventIds)
      : {};
    const rows = await this.listPaged<BitrixEventVisitRow>(
      "crm.item.list",
      (start) => ({
        entityTypeId: metadata.entityTypeId,
        select: [
          "id",
          "title",
          "stageId",
          "categoryId",
          "createdTime",
          "updatedTime",
          "assignedById",
          "contactId",
          "parentId2",
          "sourceId",
          ...(metadata.eventNameFieldName ? [metadata.eventNameFieldName] : []),
          ...(metadata.eventDateFieldName ? [metadata.eventDateFieldName] : []),
        ],
        filter: buildEventVisitFilter({
          eventFieldName: metadata.eventNameFieldName,
          eventIds: input.eventIds,
          modifiedAfter: input.modifiedAfter,
        }),
        order: { id: "ASC" },
        start,
      })
    );

    return rows.map((row) => {
      const stageId = normalizeOptionalString(row.stageId) ?? "";
      const stageName = metadata.stageNames.get(stageId) ?? stageId;
      const eventId = metadata.eventNameFieldName
        ? extractLinkedId(row[metadata.eventNameFieldName])
        : null;
      const eventName = resolveEventName(
        eventId
          ? eventTitleMap[eventId]
          : metadata.eventNameFieldName
            ? normalizeOptionalString(row[metadata.eventNameFieldName])
            : null,
        row.title ?? null
      );
      const explicitDate = metadata.eventDateFieldName
        ? normalizeDateValue(
            normalizeOptionalString(row[metadata.eventDateFieldName])
          )
        : null;
      const eventDate =
        explicitDate ?? parseEventDate(eventName, input.reportYear) ?? "";

      return {
        id: String(row.id),
        eventId,
        eventName,
        eventDate,
        status: normalizeBitrixVisitStatus(stageName),
        stageId,
        stageName,
        dealId: extractLinkedId(row.parentId2),
        contactId: extractLinkedId(row.contactId),
        managerId: normalizeOptionalString(row.assignedById),
        sourceId: normalizeOptionalString(row.sourceId),
        createdTime: row.createdTime ?? "",
        updatedTime: row.updatedTime ?? row.createdTime ?? "",
      };
    });
  }

  async listPaged<T>(
    method: string,
    buildPayload: (start: number) => Record<string, unknown>
  ): Promise<T[]> {
    const rows: T[] = [];
    let start = 0;

    while (true) {
      const response = await this.call<T[] | { items?: T[] }>(method, {
        ...buildPayload(start),
        start,
      });
      const page = Array.isArray(response) ? response : response.items ?? [];
      rows.push(...page);

      if (page.length < 50) {
        break;
      }

      start += 50;
      await delay(this.requestIntervalMs);
    }

    return rows;
  }

  private async getEventMetadata(): Promise<EventDiscoveryMetadata | null> {
    this.eventMetadataPromise ??= this.discoverEventMetadata();
    return this.eventMetadataPromise;
  }

  private async discoverEventMetadata(): Promise<EventDiscoveryMetadata | null> {
    const types = await this.getSmartProcessTypes();
    const type = types.types.find(
      (candidate) =>
        normalizeLabel(candidate.title) ===
        normalizeLabel(VISITS_SMART_PROCESS_TITLE)
    );
    const entityTypeId = Number(type?.entityTypeId);
    if (!Number.isFinite(entityTypeId)) {
      return null;
    }

    const [fieldsResponse, categoriesResponse] = await Promise.all([
      this.getSmartProcessFields(entityTypeId),
      this.getSmartProcessCategories(entityTypeId),
    ]);
    const fields = fieldsResponse.fields ?? {};
    const eventNameFieldName = findEventNameField(fields);

    return {
      entityTypeId,
      eventNameFieldName,
      eventDateFieldName: findEventDateField(fields),
      eventEntityTypeId: extractDynamicEntityTypeId(
        eventNameFieldName ? fields[eventNameFieldName] : undefined
      ),
      stageNames: buildStageNames(categoriesResponse.categories ?? []),
    };
  }

  private async getEventItemMetadata(): Promise<EventItemDiscoveryMetadata | null> {
    this.eventItemMetadataPromise ??= this.discoverEventItemMetadata();
    return this.eventItemMetadataPromise;
  }

  private async discoverEventItemMetadata(): Promise<EventItemDiscoveryMetadata | null> {
    const visitMetadata = await this.getEventMetadata();
    if (!visitMetadata?.eventEntityTypeId) {
      return null;
    }

    const entityTypeId = visitMetadata.eventEntityTypeId;
    const [fieldsResponse, categoriesResponse] = await Promise.all([
      this.getSmartProcessFields(entityTypeId),
      this.getSmartProcessCategories(entityTypeId),
    ]);
    const fields = fieldsResponse.fields ?? {};
    const eventTypeFieldName = findEventTypeField(fields);
    const eventFormatFieldName = findEventFormatField(fields);

    return {
      entityTypeId,
      eventDateFieldName: findEventDateField(fields),
      eventTypeFieldName,
      eventTypeMap: fieldItemsToValueMap(
        eventTypeFieldName ? fields[eventTypeFieldName] : undefined
      ),
      eventFormatFieldName,
      eventFormatMap: fieldItemsToValueMap(
        eventFormatFieldName ? fields[eventFormatFieldName] : undefined
      ),
      stageNames: buildStageNames(categoriesResponse.categories ?? []),
    };
  }

  private async fetchDynamicItemTitleMap(entityTypeId: number, itemIds?: string[]) {
    const rows = await this.listPaged<{ id: string | number; title?: string | null }>(
      "crm.item.list",
      (start) => ({
        entityTypeId,
        select: ["id", "title"],
        filter: buildEventIdFilter(itemIds),
        order: { id: "ASC" },
        start,
      })
    );

    return Object.fromEntries(
      rows.map((row) => [String(row.id), row.title ?? String(row.id)])
    );
  }
}

function buildEventItemFilter(input: {
  modifiedAfter: string | null;
  titleSearch?: string;
  eventIds?: string[];
}) {
  return {
    ...(input.modifiedAfter ? { ">=updatedTime": input.modifiedAfter } : {}),
    ...buildEventIdFilter(input.eventIds),
    ...(input.titleSearch?.trim() ? { "%title": input.titleSearch.trim() } : {}),
  };
}

function buildEventIdFilter(eventIds: string[] | undefined) {
  const normalized = Array.from(
    new Set((eventIds ?? []).map((id) => id.trim()).filter(Boolean))
  );

  if (normalized.length === 0) {
    return {};
  }

  if (normalized.length === 1) {
    return { id: normalized[0] };
  }

  return { "@id": normalized };
}

function normalizeWebhookUrl(webhookUrl: string): string {
  return webhookUrl.replace(/\/+$/, "");
}

function resolveWebhookUrl(options: BitrixClientOptions): string {
  const directUrl = options.webhookUrl ?? getOptionalEnv("BITRIX_WEBHOOK_URL");
  if (directUrl) {
    return normalizeWebhookUrl(directUrl);
  }

  const portalHost = options.portalHost ?? getOptionalEnv("BITRIX24_PORTAL_HOST");
  const userId = options.userId ?? getOptionalEnv("BITRIX24_WEBHOOK_USER_ID");
  const token = options.webhookToken ?? getOptionalEnv("BITRIX24_WEBHOOK_TOKEN");

  if (portalHost && userId && token) {
    return normalizeWebhookUrl(`https://${portalHost}/rest/${userId}/${token}`);
  }

  return normalizeWebhookUrl(getRequiredEnv("BITRIX_WEBHOOK_URL"));
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isTransientBitrixError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message.includes("fetch failed") ||
      error.message.includes("UND_ERR_CONNECT_TIMEOUT") ||
      error.message.includes("timed out") ||
      error.message.includes("aborted"))
  );
}

function buildStageNames(categories: SmartProcessCategory[]) {
  const stageNames = new Map<string, string>();
  for (const category of categories) {
    for (const stage of category.stages ?? []) {
      const stageId = normalizeOptionalString(stage.id ?? stage.statusId);
      if (stageId) {
        stageNames.set(stageId, stage.name ?? stage.title ?? stageId);
      }
    }
  }

  return stageNames;
}

function buildEventVisitFilter(input: {
  eventFieldName: string | null;
  eventIds?: string[];
  modifiedAfter: string | null;
}) {
  const filter: Record<string, unknown> = input.modifiedAfter
    ? { ">=updatedTime": input.modifiedAfter }
    : {};
  const eventIds = Array.from(
    new Set((input.eventIds ?? []).map((id) => id.trim()).filter(Boolean))
  );

  if (!input.eventFieldName || eventIds.length === 0) {
    return filter;
  }

  if (eventIds.length === 1) {
    filter[input.eventFieldName] = eventIds[0];
  } else {
    filter[`@${input.eventFieldName}`] = eventIds;
  }

  return filter;
}

function findEventNameField(fields: Record<string, SmartProcessFieldMetadata>) {
  return (
    findFieldByExactTitle(fields, "Мероприятие") ??
    Object.entries(fields).find(([, field]) => {
      const title = normalizeLabel(field.title);
      return title.includes("мероприят") && !title.includes("дата");
    })?.[0] ??
    null
  );
}

function findEventDateField(fields: Record<string, SmartProcessFieldMetadata>) {
  return (
    findFieldByExactTitle(fields, "Дата мероприятия") ??
    Object.entries(fields).find(([, field]) => {
      const title = normalizeLabel(field.title);
      return (
        title.includes("дата") &&
        title.includes("мероприят") &&
        (field.type === "date" || field.type === "datetime")
      );
    })?.[0] ??
    null
  );
}

function findEventTypeField(fields: Record<string, SmartProcessFieldMetadata>) {
  return (
    findFieldByExactTitle(fields, "Тип мероприятия") ??
    Object.entries(fields).find(([, field]) => {
      const title = normalizeLabel(field.title);
      return title.includes("тип") && title.includes("мероприят");
    })?.[0] ??
    null
  );
}

function findEventFormatField(fields: Record<string, SmartProcessFieldMetadata>) {
  return (
    findFieldByExactTitle(fields, "Формат") ??
    Object.entries(fields).find(([, field]) =>
      normalizeLabel(field.title).includes("формат")
    )?.[0] ??
    null
  );
}

function findFieldByExactTitle<T extends { title?: string | null }>(
  fields: Record<string, T>,
  title: string
) {
  const target = normalizeLabel(title);
  return (
    Object.entries(fields).find(
      ([, field]) => normalizeLabel(field.title) === target
    )?.[0] ?? null
  );
}

function fieldItemsToValueMap(field: SmartProcessFieldMetadata | undefined) {
  if (!field?.items?.length) {
    return {};
  }

  return Object.fromEntries(
    field.items.flatMap((item) => {
      const id = item.ID ?? item.id;
      const value = item.VALUE ?? item.value;
      return id !== undefined && value ? [[String(id), value]] : [];
    })
  ) as Record<string, string>;
}

function extractDynamicEntityTypeId(field: SmartProcessFieldMetadata | undefined) {
  const parentEntityTypeId = Number(field?.settings?.parentEntityTypeId);
  if (Number.isFinite(parentEntityTypeId)) {
    return parentEntityTypeId;
  }

  const dynamicEntityKey = Object.entries(field?.settings ?? {}).find(
    ([key, value]) => key.startsWith("DYNAMIC_") && value === "Y"
  )?.[0];
  if (!dynamicEntityKey) {
    return null;
  }

  const entityTypeId = Number(dynamicEntityKey.replace("DYNAMIC_", ""));
  return Number.isFinite(entityTypeId) ? entityTypeId : null;
}

function extractLinkedId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    return /(?:^|[_:])(\d+)$/u.exec(trimmed)?.[1] ?? trimmed;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const linkedId = extractLinkedId(item);
      if (linkedId) {
        return linkedId;
      }
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      extractLinkedId(record.ID) ??
      extractLinkedId(record.id) ??
      extractLinkedId(record.VALUE) ??
      extractLinkedId(record.value)
    );
  }

  return null;
}

function resolveEventName(
  explicitName: string | null | undefined,
  rawTitle: string | null | undefined
) {
  const explicit = explicitName?.trim();
  if (explicit) {
    return explicit;
  }

  const title = rawTitle?.trim() ?? "";
  const titleMatch = /^Посещение\s+.+?\s+в\s+(.+)$/iu.exec(title);
  return titleMatch?.[1]?.trim() || title || "Без названия";
}

function parseEventDate(eventName: string, reportYear: number) {
  const match = /(^|\D)(\d{1,2})\.(\d{1,2})(?:\.|\D|$)/u.exec(eventName);
  if (!match?.[2] || !match[3]) {
    return null;
  }

  const day = Number(match[2]);
  const month = Number(match[3]);
  const date = new Date(Date.UTC(reportYear, month - 1, day));
  if (
    date.getUTCFullYear() !== reportYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
}

function normalizeDateValue(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeBitrixEventStatus(
  stageName: string | null | undefined
): BitrixEventStatus {
  const label = normalizeLabel(stageName);
  const stageCode = label.split(":").pop() ?? label;

  if (label.includes("отмен")) {
    return "canceled";
  }

  if (stageCode === "fail") {
    return "canceled";
  }

  if (
    label.includes("заверш") ||
    label.includes("проведен") ||
    label.includes("прош")
  ) {
    return "completed";
  }

  if (stageCode === "success") {
    return "completed";
  }

  if (label.includes("план")) {
    return "planned";
  }

  if (label.includes("преданонс")) {
    return "preannounce";
  }

  if (label.includes("чернов")) {
    return "draft";
  }

  if (stageCode === "new") {
    return "draft";
  }

  return "unknown";
}

function normalizeBitrixVisitStatus(
  stageName: string | null | undefined
): BitrixEventVisitStatus {
  const label = normalizeLabel(stageName);
  const stageCode = label.split(":").pop() ?? label;

  if (label.includes("посетил") || label.includes("на мероприятии")) {
    return "ATTENDED";
  }

  if (stageCode === "success") {
    return "ATTENDED";
  }

  if (label.includes("пойду") || label.includes("подтверж")) {
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

  if (label.includes("не приш") || label.includes("no show")) {
    return "MISSED";
  }

  if (label.includes("приглаш")) {
    return "INVITED";
  }

  if (stageCode === "new") {
    return "INVITED";
  }

  return "UNKNOWN";
}

function normalizeOptionalString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е");
}
