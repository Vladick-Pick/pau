import { describe, expect, it } from "vitest";

import { mapBitrixDealToParticipant } from "../src/lib/bitrix/mapping";

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
      email: "active@example.com",
      phone: "+79990001122",
      company: "Acme",
      position: "CEO",
      city: "Москва",
      telegram: "@active",
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
      email: "petr@example.com",
      phone: "+70000000000",
      status: "POTENTIAL",
    });
  });
});
