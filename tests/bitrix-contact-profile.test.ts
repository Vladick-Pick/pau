import { describe, expect, it } from "vitest";

import {
  BITRIX_CONTACT_BUSINESS_MAIN_FIELD,
  BITRIX_CONTACT_BUSINESS_PROFILE_FIELD,
  BITRIX_CONTACT_ENRICHMENT_PAYLOAD_FIELD,
  buildReadableBitrixContactProfile,
} from "../src/lib/bitrix/contact-profile";

describe("Bitrix contact profile", () => {
  it("decodes contact business groups separately from enrichment fields", async () => {
    const profile = await buildReadableBitrixContactProfile({
      contact: {
        [BITRIX_CONTACT_BUSINESS_MAIN_FIELD]: "546",
        UF_CRM_1643721389: "добыча полезных ископаемых",
        UF_CRM_1643793756: "270",
        UF_CRM_1647946359: "604",
        UF_CRM_1766145758122: "Добыча руды",
        UF_CRM_INFOCOMP_KOSAS: "https://www.rusprofile.ru/id/123",
        UF_CRM_1643816950: "найти партнеров",
        UF_CRM_1768223556404: "Важный контекст",
        UF_CRM_1643718541418: "460",
      },
      fields: {
        [BITRIX_CONTACT_BUSINESS_MAIN_FIELD]: {
          type: "iblock_element",
          formLabel: "Сфера деятельности (основная)",
          settings: { IBLOCK_ID: 76 },
        },
        UF_CRM_1643721389: {
          type: "string",
          formLabel: "Специфика компании основная",
        },
        UF_CRM_1643793756: {
          type: "enumeration",
          formLabel: "Роль/ должность основная",
          items: [{ ID: "270", VALUE: "Владелец" }],
        },
        UF_CRM_1647946359: {
          type: "enumeration",
          formLabel: "Оборот бизнеса",
          items: [{ ID: "604", VALUE: "1-3 млрд рублей" }],
        },
        UF_CRM_1766145758122: {
          type: "string",
          formLabel: "ОКВЭД основной компании",
        },
        UF_CRM_INFOCOMP_KOSAS: {
          type: "url",
          formLabel: "Ссылка на основную компанию Rusprofile",
        },
        UF_CRM_1643816950: {
          type: "string",
          formLabel: "Цели/задачи по клубу",
        },
        UF_CRM_1768223556404: {
          type: "string",
          formLabel: "Дополнительная информация",
        },
        UF_CRM_1643718541418: {
          type: "enumeration",
          formLabel: "Пол",
          items: [{ ID: "460", VALUE: "Муж" }],
        },
      },
      resolveListElementName: async (iblockId, elementId) =>
        `${iblockId}:${elementId}` === "76:546" ? "Недра | добыча" : null,
    });

    expect(profile[BITRIX_CONTACT_BUSINESS_MAIN_FIELD]).toBe("Недра | добыча");
    expect(profile.UF_CRM_1643718541418).toBe("Муж");
    expect(profile[BITRIX_CONTACT_BUSINESS_PROFILE_FIELD]).toEqual({
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
    });
    expect(profile[BITRIX_CONTACT_ENRICHMENT_PAYLOAD_FIELD]).toEqual({
      clubGoals: "найти партнеров",
      additionalInfo: "Важный контекст",
    });
  });

  it("keeps raw list element ids when list decoding fails", async () => {
    const profile = await buildReadableBitrixContactProfile({
      contact: {
        [BITRIX_CONTACT_BUSINESS_MAIN_FIELD]: "546",
      },
      fields: {
        [BITRIX_CONTACT_BUSINESS_MAIN_FIELD]: {
          type: "iblock_element",
          formLabel: "Сфера деятельности (основная)",
          settings: { IBLOCK_ID: 76 },
        },
      },
      resolveListElementName: async () => {
        throw new Error("lists scope temporarily unavailable");
      },
    });

    expect(profile[BITRIX_CONTACT_BUSINESS_MAIN_FIELD]).toBe("546");
  });
});
