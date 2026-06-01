import { describe, expect, it } from "vitest";

import { BitrixClient } from "../src/lib/bitrix/client";

describe("Bitrix event smart-process client", () => {
  it("retries transient Bitrix request failures once", async () => {
    let attempts = 0;
    const client = new BitrixClient({
      webhookUrl: "https://example.bitrix24.test/rest/1/token",
      requestIntervalMs: 0,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("This operation was aborted"), {
            name: "AbortError",
          });
        }

        return Response.json({ result: { types: [] } });
      },
    });

    await expect(client.getSmartProcessTypes()).resolves.toEqual({ types: [] });
    expect(attempts).toBe(2);
  });

  it("aborts stalled Bitrix response bodies", async () => {
    let attempts = 0;
    const client = new BitrixClient({
      webhookUrl: "https://example.bitrix24.test/rest/1/token",
      requestIntervalMs: 0,
      timeoutMs: 5,
      fetchImpl: async (_url, init) => {
        attempts += 1;
        const signal = init?.signal as AbortSignal;

        return {
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () =>
                  reject(
                    Object.assign(new Error("This operation was aborted"), {
                      name: "AbortError",
                    })
                  ),
                { once: true }
              );
            }),
        } as Response;
      },
    });

    await expect(client.getSmartProcessTypes()).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(attempts).toBe(2);
  });

  it("lists deal and contact records by selected ids", async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const client = new BitrixClient({
      webhookUrl: "https://example.bitrix24.test/rest/1/token",
      requestIntervalMs: 0,
      fetchImpl: async (url, init) => {
        const method = String(url).split("/").pop() ?? "";
        const payload = JSON.parse(String(init?.body ?? "{}"));
        calls.push({ method, payload });

        if (method === "crm.deal.list") {
          expect(payload.filter).toEqual({ "@ID": ["1", "2"] });
          expect(payload.select).toEqual(["ID", "TITLE"]);
          return Response.json({
            result: [
              { ID: "1", TITLE: "Deal 1" },
              { ID: "2", TITLE: "Deal 2" },
            ],
          });
        }

        if (method === "crm.contact.list") {
          expect(payload.filter).toEqual({ ID: "7" });
          expect(payload.select).toEqual(["ID", "NAME"]);
          return Response.json({
            result: [{ ID: "7", NAME: "Contact" }],
          });
        }

        throw new Error(`Unexpected Bitrix method ${method}`);
      },
    });

    await expect(client.listDealsByIds(["1", "2"], ["ID", "TITLE"])).resolves.toEqual([
      { ID: "1", TITLE: "Deal 1" },
      { ID: "2", TITLE: "Deal 2" },
    ]);
    await expect(client.listContactsByIds(["7"], ["ID", "NAME"])).resolves.toEqual([
      { ID: "7", NAME: "Contact" },
    ]);
    expect(calls.map((call) => call.method)).toEqual([
      "crm.deal.list",
      "crm.contact.list",
    ]);
  });

  it("discovers event items through the visits smart-process link field", async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const client = new BitrixClient({
      webhookUrl: "https://example.bitrix24.test/rest/1/token",
      requestIntervalMs: 0,
      fetchImpl: async (url, init) => {
        const method = String(url).split("/").pop() ?? "";
        const payload = JSON.parse(String(init?.body ?? "{}"));
        calls.push({ method, payload });

        if (method === "crm.type.list") {
          return Response.json({
            result: {
              types: [{ entityTypeId: 177, title: "Посещения мероприятий" }],
            },
          });
        }

        if (method === "crm.item.fields" && payload.entityTypeId === 177) {
          return Response.json({
            result: {
              fields: {
                ufCrmEvent: {
                  title: "Мероприятие",
                  settings: { DYNAMIC_188: "Y" },
                },
              },
            },
          });
        }

        if (method === "crm.category.list" && payload.entityTypeId === 177) {
          return Response.json({ result: { categories: [] } });
        }

        if (method === "crm.item.fields" && payload.entityTypeId === 188) {
          return Response.json({
            result: {
              fields: {
                ufCrmEventDate: { title: "Дата мероприятия", type: "datetime" },
                ufCrmEventType: {
                  title: "Тип мероприятия",
                  items: [{ ID: "guest", VALUE: "Гостевая встреча" }],
                },
                ufCrmFormat: {
                  title: "Формат",
                  items: [{ ID: "offline", VALUE: "Очно" }],
                },
              },
            },
          });
        }

        if (method === "crm.category.list" && payload.entityTypeId === 188) {
          return Response.json({
            result: {
              categories: [
                {
                  stages: [{ id: "DT188:PLANNED", name: "Планируется" }],
                },
              ],
            },
          });
        }

        if (method === "crm.item.list" && payload.entityTypeId === 188) {
          expect(payload.select).toEqual([
            "id",
            "title",
            "stageId",
            "categoryId",
            "createdTime",
            "updatedTime",
            "ufCrmEventDate",
            "ufCrmEventType",
            "ufCrmFormat",
          ]);
          return Response.json({
            result: {
              items: [
                {
                  id: 700,
                  title: "Знакомство с клубом 29.04.",
                  stageId: "DT188:PLANNED",
                  categoryId: 5,
                  createdTime: "2026-04-01T10:00:00.000Z",
                  updatedTime: "2026-04-02T10:00:00.000Z",
                  ufCrmEventDate: "2026-04-29T10:00:00.000Z",
                  ufCrmEventType: "guest",
                  ufCrmFormat: "offline",
                },
              ],
            },
          });
        }

        throw new Error(`Unexpected Bitrix method ${method}`);
      },
    });

    await expect(client.listEvents({ modifiedAfter: null })).resolves.toEqual([
      {
        eventId: "700",
        entityTypeId: 188,
        categoryId: 5,
        title: "Знакомство с клубом 29.04.",
        eventDate: "2026-04-29T10:00:00.000Z",
        startAt: "2026-04-29T10:00:00.000Z",
        endAt: null,
        stageId: "DT188:PLANNED",
        stageName: "Планируется",
        status: "planned",
        eventTypeId: "guest",
        eventTypeLabel: "Гостевая встреча",
        formatId: "offline",
        formatLabel: "Очно",
        createdTime: "2026-04-01T10:00:00.000Z",
        updatedTime: "2026-04-02T10:00:00.000Z",
      },
    ]);
    expect(calls.map((call) => call.method)).toEqual([
      "crm.type.list",
      "crm.item.fields",
      "crm.category.list",
      "crm.item.fields",
      "crm.category.list",
      "crm.item.list",
    ]);
  });

  it("discovers event items through parentEntityTypeId and searches by title", async () => {
    const client = new BitrixClient({
      webhookUrl: "https://example.bitrix24.test/rest/1/token",
      requestIntervalMs: 0,
      fetchImpl: async (url, init) => {
        const method = String(url).split("/").pop() ?? "";
        const payload = JSON.parse(String(init?.body ?? "{}"));

        if (method === "crm.type.list") {
          return Response.json({
            result: {
              types: [{ entityTypeId: 162, title: "Посещения мероприятий" }],
            },
          });
        }

        if (method === "crm.item.fields" && payload.entityTypeId === 162) {
          return Response.json({
            result: {
              fields: {
                parentId137: {
                  title: "Мероприятия",
                  type: "crm_entity",
                  settings: { parentEntityTypeId: 137 },
                },
              },
            },
          });
        }

        if (method === "crm.category.list" && payload.entityTypeId === 162) {
          return Response.json({ result: { categories: [] } });
        }

        if (method === "crm.item.fields" && payload.entityTypeId === 137) {
          return Response.json({
            result: {
              fields: {
                ufCrmEventDate: { title: "Дата мероприятия", type: "datetime" },
                parentId156: {
                  title: "Виды мероприятий",
                  type: "crm_entity",
                  settings: { parentEntityTypeId: 156 },
                },
              },
            },
          });
        }

        if (method === "crm.category.list" && payload.entityTypeId === 137) {
          return Response.json({
            result: {
              categories: [
                {
                  stages: [{ id: "DT137:SUCCESS", name: "Проведен" }],
                },
              ],
            },
          });
        }

        if (method === "crm.item.list" && payload.entityTypeId === 137) {
          expect(payload.filter).toEqual({ "%title": "Гостевая встреча" });
          return Response.json({
            result: {
              items: [
                {
                  id: 31394,
                  title: "Гостевая встреча 28.05.",
                  stageId: "DT137:SUCCESS",
                  createdTime: "2026-05-19T20:57:57.000Z",
                  updatedTime: "2026-05-19T20:57:57.000Z",
                  ufCrmEventDate: "2026-05-28T00:00:00.000Z",
                  parentId156: 128,
                },
                {
                  id: 31392,
                  title: "Гостевая встреча 21.05.",
                  stageId: "DT137:SUCCESS",
                  createdTime: "2026-05-19T20:57:56.000Z",
                  updatedTime: "2026-05-19T20:57:56.000Z",
                  ufCrmEventDate: "2026-05-21T00:00:00.000Z",
                  parentId156: 128,
                },
                {
                  id: 30692,
                  title: "Гостевая встреча 14.05.",
                  stageId: "DT137:SUCCESS",
                  createdTime: "2026-05-19T20:57:26.000Z",
                  updatedTime: "2026-05-19T20:57:26.000Z",
                  ufCrmEventDate: "2026-05-14T00:00:00.000Z",
                  parentId156: 128,
                },
              ],
            },
          });
        }

        throw new Error(`Unexpected Bitrix method ${method}`);
      },
    });

    await expect(
      client.listEvents({
        modifiedAfter: null,
        titleSearch: "Гостевая встреча",
      })
    ).resolves.toMatchObject([
      { eventId: "31394", title: "Гостевая встреча 28.05.", status: "completed" },
      { eventId: "31392", title: "Гостевая встреча 21.05.", status: "completed" },
      { eventId: "30692", title: "Гостевая встреча 14.05.", status: "completed" },
    ]);
  });

  it("lists visit rows linked to event item ids and resolves visit statuses", async () => {
    const client = new BitrixClient({
      webhookUrl: "https://example.bitrix24.test/rest/1/token",
      requestIntervalMs: 0,
      fetchImpl: async (url, init) => {
        const method = String(url).split("/").pop() ?? "";
        const payload = JSON.parse(String(init?.body ?? "{}"));

        if (method === "crm.type.list") {
          return Response.json({
            result: {
              types: [{ entityTypeId: 177, title: "Посещения мероприятий" }],
            },
          });
        }

        if (method === "crm.item.fields") {
          return Response.json({
            result: {
              fields: {
                ufCrmEvent: {
                  title: "Мероприятие",
                  settings: { DYNAMIC_188: "Y" },
                },
                ufCrmEventDate: { title: "Дата мероприятия", type: "datetime" },
              },
            },
          });
        }

        if (method === "crm.category.list") {
          return Response.json({
            result: {
              categories: [
                {
                  stages: [{ id: "DT177:ATTENDED", name: "На мероприятии" }],
                },
              ],
            },
          });
        }

        if (method === "crm.item.list" && payload.entityTypeId === 188) {
          return Response.json({
            result: {
              items: [{ id: 700, title: "Знакомство с клубом 29.04." }],
            },
          });
        }

        if (method === "crm.item.list" && payload.entityTypeId === 177) {
          expect(payload.select).toContain("ufCrmEvent");
          expect(payload.select).toContain("ufCrmEventDate");
          return Response.json({
            result: {
              items: [
                {
                  id: 901,
                  title: "Посещение Анна Иванова в Знакомство с клубом 29.04.",
                  stageId: "DT177:ATTENDED",
                  categoryId: 1,
                  parentId2: 12345,
                  contactId: 777,
                  assignedById: 78,
                  sourceId: "WEB",
                  createdTime: "2026-04-20T10:00:00.000Z",
                  updatedTime: "2026-04-29T13:56:00.000Z",
                  ufCrmEvent: 700,
                  ufCrmEventDate: "2026-04-29T10:00:00.000Z",
                },
              ],
            },
          });
        }

        throw new Error(`Unexpected Bitrix method ${method}`);
      },
    });

    await expect(
      client.listEventVisits({ modifiedAfter: null, reportYear: 2026 })
    ).resolves.toEqual([
      {
        id: "901",
        eventId: "700",
        eventName: "Знакомство с клубом 29.04.",
        eventDate: "2026-04-29T10:00:00.000Z",
        status: "ATTENDED",
        stageId: "DT177:ATTENDED",
        stageName: "На мероприятии",
        dealId: "12345",
        contactId: "777",
        managerId: "78",
        sourceId: "WEB",
        createdTime: "2026-04-20T10:00:00.000Z",
        updatedTime: "2026-04-29T13:56:00.000Z",
      },
    ]);
  });

  it("can limit visit listing to selected event item ids", async () => {
    const client = new BitrixClient({
      webhookUrl: "https://example.bitrix24.test/rest/1/token",
      requestIntervalMs: 0,
      fetchImpl: async (url, init) => {
        const method = String(url).split("/").pop() ?? "";
        const payload = JSON.parse(String(init?.body ?? "{}"));

        if (method === "crm.type.list") {
          return Response.json({
            result: {
              types: [{ entityTypeId: 177, title: "Посещения мероприятий" }],
            },
          });
        }

        if (method === "crm.item.fields") {
          return Response.json({
            result: {
              fields: {
                ufCrmEvent: {
                  title: "Мероприятие",
                  settings: { DYNAMIC_188: "Y" },
                },
              },
            },
          });
        }

        if (method === "crm.category.list") {
          return Response.json({ result: { categories: [] } });
        }

        if (method === "crm.item.list" && payload.entityTypeId === 188) {
          return Response.json({ result: { items: [] } });
        }

        if (method === "crm.item.list" && payload.entityTypeId === 177) {
          expect(payload.filter).toEqual({ "@ufCrmEvent": ["700", "701"] });
          return Response.json({ result: { items: [] } });
        }

        throw new Error(`Unexpected Bitrix method ${method}`);
      },
    });

    await expect(
      client.listEventVisits({
        modifiedAfter: null,
        reportYear: 2026,
        eventIds: ["700", "701"],
      })
    ).resolves.toEqual([]);
  });
});
