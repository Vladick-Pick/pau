import { describe, expect, it } from "vitest";

import {
  BITRIX_EVENT_LINK_FIELD,
  extractEventParticipantProfile,
  mapBitrixVisitToEventParticipant,
  normalizeEventParticipantStatus,
  resolvePauFormatForBitrixEvent,
} from "../src/lib/pau/events";

describe("PAU event domain", () => {
  it("normalizes Bitrix event visit stages into preparation statuses", () => {
    expect(normalizeEventParticipantStatus("Приглашен")).toBe("INVITED");
    expect(normalizeEventParticipantStatus("Подтвердил участие")).toBe("CONFIRMED");
    expect(normalizeEventParticipantStatus("На мероприятии")).toBe("ATTENDED");
    expect(normalizeEventParticipantStatus("Отказ")).toBe("REFUSED");
    expect(normalizeEventParticipantStatus("Не пришел")).toBe("MISSED");
    expect(normalizeEventParticipantStatus("Новая запись")).toBe("UNKNOWN");
    expect(normalizeEventParticipantStatus("DT162_14:NEW")).toBe("INVITED");
    expect(normalizeEventParticipantStatus("DT162_14:PREPARATION")).toBe(
      "CONFIRMED"
    );
    expect(normalizeEventParticipantStatus("DT162_14:SUCCESS")).toBe("ATTENDED");
    expect(normalizeEventParticipantStatus("DT162_14:FAIL")).toBe("REFUSED");
  });

  it("maps a Bitrix event visit and ignores personal-meeting fields", () => {
    const participant = mapBitrixVisitToEventParticipant({
      eventId: "event-42",
      visit: {
        id: 901,
        title: "Посещение Анна Иванова в Гостевая встреча 28.05",
        stageId: "DT177_33:CONFIRMED",
        stageName: "Подтвердил участие",
        parentId2: 12345,
        contactId: 777,
        assignedById: 78,
        sourceId: "WEB",
        createdTime: "2026-05-20T10:00:00.000Z",
        updatedTime: "2026-05-21T10:00:00.000Z",
      },
      deal: {
        ID: "12345",
        TITLE: "Анна Иванова",
        CONTACT_ID: "777",
        [BITRIX_EVENT_LINK_FIELD]: "event-42",
        UF_CRM_1669784114991: "Очная",
        UF_CRM_1669784197394: "2026-05-25T12:00:00+03:00",
        UF_CRM_1774269641800: "Основной бизнес",
        UF_CRM_1774269653902: "Доп бизнес 1",
        UF_CRM_1774270188442: "Доп бизнес 2",
        UF_CRM_1774270204829: "Доп бизнес 3",
        UF_CRM_1774269721467: "Обогащение",
      },
      contact: {
        ID: "777",
        NAME: "Анна",
        LAST_NAME: "Иванова",
        POST: "CEO",
        COMPANY_TITLE: "Acme",
      },
    });

    expect(participant).toMatchObject({
      eventId: "event-42",
      bitrixVisitId: "901",
      bitrixDealId: "12345",
      bitrixContactId: "777",
      fullName: "Анна Иванова",
      status: "CONFIRMED",
      businessFields: {
        main: "Основной бизнес",
        extra1: "Доп бизнес 1",
        extra2: "Доп бизнес 2",
        extra3: "Доп бизнес 3",
        enrichment: "Обогащение",
      },
    });
    expect(participant.sourcePayload).not.toHaveProperty("UF_CRM_1669784114991");
    expect(participant.sourcePayload).not.toHaveProperty("UF_CRM_1669784197394");
  });

  it("builds a compact profile for matching from event participant data", () => {
    const profile = extractEventParticipantProfile({
      id: "participant-1",
      eventId: "event-1",
      bitrixVisitId: "901",
      bitrixDealId: "12345",
      bitrixContactId: "777",
      fullName: "Анна Иванова",
      company: "Acme",
      position: "CEO",
      status: "INVITED",
      participantKind: "POTENTIAL",
      businessFields: {
        main: "B2B SaaS",
        extra1: "Инвестиции",
        extra2: null,
        extra3: null,
        enrichment: "Ищет партнеров в enterprise.",
      },
      sourcePayload: {},
    });

    expect(profile).toEqual({
      id: "participant-1",
      fullName: "Анна Иванова",
      company: "Acme",
      position: "CEO",
      status: "INVITED",
      participantKind: "POTENTIAL",
      businessContext: [
        "B2B SaaS",
        "Инвестиции",
        "Ищет партнеров в enterprise.",
      ],
    });
  });

  it("resolves a PAU format from Bitrix event type and format metadata", () => {
    const formats = [
      {
        slug: "guest-meeting",
        bitrixEventTypeIds: ["guest", "гостевая встреча"],
      },
      {
        slug: "working-group",
        bitrixEventTypeIds: ["offline-board", "рабочая группа"],
      },
    ];

    expect(
      resolvePauFormatForBitrixEvent(formats, {
        title: "Знакомство с клубом 29.04.",
        eventTypeId: "guest",
        eventTypeLabel: "Гостевая встреча",
        formatId: "offline",
        formatLabel: "Очно",
      })
    ).toBe("guest-meeting");

    expect(
      resolvePauFormatForBitrixEvent(formats, {
        title: "Совет активных участников",
        eventTypeId: null,
        eventTypeLabel: null,
        formatId: "offline-board",
        formatLabel: "Очно",
      })
    ).toBe("working-group");
  });
});
