import { describe, expect, it } from "vitest";

import {
  BITRIX_CONTACT_BUSINESS_MAIN_FIELD,
  BITRIX_CONTACT_BUSINESS_PROFILE_FIELD,
  BITRIX_CONTACT_ENRICHMENT_PAYLOAD_FIELD,
} from "../src/lib/bitrix/contact-profile";
import {
  mapBitrixDealToEventParticipant,
  mapBitrixDealToParticipant,
} from "../src/lib/bitrix/mapping";

describe("Bitrix participant mapping", () => {
  it("uses deal and contact fields and marks known active contacts", () => {
    const participant = mapBitrixDealToParticipant({
      activeIdentifiers: ["42", "active@example.com"],
      deal: {
        id: 501,
        title: "Регистрация на деловой завтрак",
        categoryId: 9,
        stageId: "C9:NEW",
        assignedById: 7,
        contactId: 42,
        ufCrmFormat: "business-breakfast",
        ufCrmTelegram: "@active",
      },
      contact: {
        id: 42,
        name: "Анна",
        lastName: "Иванова",
        post: "CEO",
        companyTitle: "Acme",
        fm: {
          EMAIL: [{ value: "active@example.com", valueType: "WORK" }],
          PHONE: [{ value: "+79990001122", valueType: "WORK" }],
        },
        ufCrmCity: "Москва",
      },
    });

    expect(participant).toMatchObject({
      bitrixDealId: "501",
      bitrixContactId: "42",
      fullName: "Анна Иванова",
      email: null,
      phone: null,
      company: "Acme",
      position: "CEO",
      city: "Москва",
      telegram: null,
      sourceFormatSlug: "business-breakfast",
      status: "ACTIVE",
    });
  });

  it("falls back to deal fields when contact data is absent", () => {
    const participant = mapBitrixDealToParticipant({
      activeIdentifiers: [],
      deal: {
        id: "777",
        title: "Петр Сидоров",
        contactId: null,
        email: [{ value: "petr@example.com" }],
        phone: [{ value: "+70000000000" }],
      },
    });

    expect(participant).toMatchObject({
      bitrixDealId: "777",
      bitrixContactId: null,
      fullName: "Петр Сидоров",
      email: null,
      phone: null,
      status: "POTENTIAL",
    });
  });

  it("does not expose contact channels in event participant profiles", () => {
    const participant = mapBitrixDealToEventParticipant({
      activeIdentifiers: ["active@example.com"],
      aliases: {
        businessMainField: "UF_BUSINESS_MAIN",
      },
      deal: {
        id: 501,
        title: "Регистрация на деловой завтрак",
        contactId: 42,
        COMMENTS:
          "Связаться по +7 999 000-11-22 или active@example.com после встречи",
        SOURCE_DESCRIPTION: "Звонок поступил на номер: +7 495 118-09-81.",
        email: [{ value: "deal@example.com" }],
        phone: [{ value: "+70000000000" }],
        ufCrmTelegram: "@deal",
        UF_BUSINESS_MAIN: "B2B SaaS",
      },
      contact: {
        id: 42,
        name: "Анна",
        lastName: "Иванова",
        fm: {
          EMAIL: [{ value: "active@example.com", valueType: "WORK" }],
          PHONE: [{ value: "+79990001122", valueType: "WORK" }],
        },
        ufCrmTelegram: "@active",
      },
    });

    expect(participant).toMatchObject({
      bitrixDealId: "501",
      bitrixContactId: "42",
      fullName: "Анна Иванова",
      email: null,
      phone: null,
      telegram: null,
      businessMain: "B2B SaaS",
      status: "POTENTIAL",
    });
    expect(participant.sourcePayload.contact).toBeNull();
    expect(participant.sourcePayload.deal).not.toHaveProperty("email");
    expect(participant.sourcePayload.deal).not.toHaveProperty("phone");
    expect(participant.sourcePayload.deal).not.toHaveProperty("ufCrmTelegram");
    expect(participant.sourcePayload.deal.COMMENTS).toBe(
      "Связаться по [redacted-phone] или [redacted-email] после встречи"
    );
    expect(participant.sourcePayload.deal.SOURCE_DESCRIPTION).toBe(
      "Звонок поступил на номер: [redacted-phone]."
    );
  });

  it("uses readable contact profile fields when deal smart fields are empty", () => {
    const participant = mapBitrixDealToEventParticipant({
      activeIdentifiers: [],
      deal: {
        id: 501,
        title: "Пимашков Андрей Петрович",
        contactId: 42,
        UF_CRM_1774269641800: null,
        UF_CRM_1774269721467: null,
        UF_CRM_1766147164481: "Новый золотодобывающий проект",
        UF_CRM_1766147207634: "Знаком с участниками московского филиала",
      },
      contact: {
        id: 42,
        name: "Андрей",
        lastName: "Пимашков",
        POST: "Владелец",
        ADDRESS_CITY: "Москва",
        UF_CRM_1766136147: 42,
        UF_CRM_1643718541418: "Муж",
        [BITRIX_CONTACT_BUSINESS_MAIN_FIELD]: "Недра | добыча",
        [BITRIX_CONTACT_BUSINESS_PROFILE_FIELD]: {
          main: {
            sphere: "Недра | добыча",
            specifics: "добыча полезных ископаемых",
            role: "Владелец",
            experience: null,
            okved: "Добыча руды",
            sharePercent: null,
            revenue: "1-3 млрд рублей",
            rusprofileUrl: "https://www.rusprofile.ru/id/123",
            siteUrl: null,
          },
          extra1: null,
          extra2: null,
          extra3: null,
        },
        [BITRIX_CONTACT_ENRICHMENT_PAYLOAD_FIELD]: {
          clubGoals: "найти партнеров",
        },
      },
    });

    expect(participant).toMatchObject({
      position: "Владелец",
      city: "Москва",
      age: 42,
      gender: "Муж",
      businessMain: "Недра | добыча",
      businessProfile: {
        main: {
          sphere: "Недра | добыча",
          specifics: "добыча полезных ископаемых",
          role: "Владелец",
          revenue: "1-3 млрд рублей",
        },
      },
      enrichment: {
        keyProjects: "Новый золотодобывающий проект",
        clubConnections: "Знаком с участниками московского филиала",
        clubGoals: "найти партнеров",
      },
    });
  });

  it("falls back to the main business role when contact position is empty", () => {
    const participant = mapBitrixDealToEventParticipant({
      activeIdentifiers: [],
      deal: {
        id: 502,
        title: "Пимашков Андрей Петрович",
        contactId: 42,
      },
      contact: {
        id: 42,
        name: "Андрей",
        lastName: "Пимашков",
        [BITRIX_CONTACT_BUSINESS_PROFILE_FIELD]: {
          main: {
            sphere: "Недра | добыча",
            specifics: null,
            role: "Владелец",
            experience: null,
            okved: null,
            sharePercent: null,
            revenue: "1-3 млрд рублей",
            rusprofileUrl: null,
            siteUrl: null,
          },
          extra1: null,
          extra2: null,
          extra3: null,
        },
      },
    });

    expect(participant.position).toBe("Владелец");
  });
});
