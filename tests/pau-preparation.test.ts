import { describe, expect, it } from "vitest";

import {
  buildEventMatchProfile,
  buildEventBriefPlan,
  buildTranscriptReportInput,
  computeEventAttendanceSummary,
  getLatestPastEvent,
  selectDefaultExportBriefs,
} from "../src/lib/pau/preparation";

describe("PAU preparation helpers", () => {
  it("builds the batch matching payload from event metadata and potential participants", () => {
    const profile = buildEventMatchProfile({
      event: {
        id: "event-1",
        title: "Гостевая встреча 28.05",
        startsAt: "2026-05-28T16:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: { goal: "Подобрать активных участников по бизнес-контексту." },
      },
      participants: [
        {
          id: "potential-1",
          kind: "POTENTIAL",
          status: "CONFIRMED",
          fullName: "Анна Иванова",
          company: "Acme",
          position: "CEO",
          city: "Москва",
          age: 38,
          gender: "Женский",
          businessMain: "B2B SaaS",
          businessExtra1: "Инвестиции",
          businessExtra2: null,
          businessExtra3: null,
          enrichment: { value: "Ищет партнерства в enterprise." },
        },
        {
          id: "active-1",
          kind: "ACTIVE",
          status: "INVITED",
          fullName: "Борис Смирнов",
          company: "Beta",
          position: null,
          city: null,
          age: null,
          gender: null,
          businessMain: "Enterprise sales",
          businessExtra1: null,
          businessExtra2: null,
          businessExtra3: null,
          enrichment: null,
        },
      ],
    });

    expect(profile).toEqual({
      event: {
        id: "event-1",
        title: "Гостевая встреча 28.05",
        startsAt: "2026-05-28T16:00:00.000Z",
        formatSlug: "guest-meeting",
        formatName: "Гостевая встреча",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingInstructions:
          '{"goal":"Подобрать активных участников по бизнес-контексту."}',
      },
      participants: [
        {
          id: "potential-1",
          fullName: "Анна Иванова",
          company: "Acme",
          position: "CEO",
          city: "Москва",
          age: 38,
          gender: "Женский",
          status: "CONFIRMED",
          participantKind: "POTENTIAL",
          businessContext: [
            "B2B SaaS",
            "Инвестиции",
            '{"value":"Ищет партнерства в enterprise."}',
          ],
        },
      ],
    });
  });

  it("plans participant and moderator briefs while keeping default export active-only", () => {
    const briefPlan = buildEventBriefPlan({
      format: {
        promptPotential: "potential prompt",
        promptActive: "active prompt",
        promptModerator: "moderator prompt",
      },
      participants: [
        { id: "potential-1", kind: "POTENTIAL", fullName: "Анна Иванова" },
        { id: "active-1", kind: "ACTIVE", fullName: "Борис Смирнов" },
      ],
    });

    expect(briefPlan).toEqual([
      {
        participantId: "potential-1",
        participantName: "Анна Иванова",
        briefType: "POTENTIAL",
        prompt: "potential prompt",
      },
      {
        participantId: "active-1",
        participantName: "Борис Смирнов",
        briefType: "ACTIVE",
        prompt: "active prompt",
      },
      {
        participantId: null,
        participantName: "Модератор",
        briefType: "MODERATOR",
        prompt: "moderator prompt",
      },
    ]);

    expect(
      selectDefaultExportBriefs([
        {
          participantName: "Анна Иванова",
          briefType: "POTENTIAL",
          summary: "potential",
        },
        {
          participantName: "Борис Смирнов",
          briefType: "ACTIVE",
          summary: "active",
        },
        {
          participantName: "Модератор",
          briefType: "MODERATOR",
          summary: "moderator",
        },
      ])
    ).toEqual([
      {
        participantName: "Борис Смирнов",
        briefType: "ACTIVE",
        summary: "active",
      },
    ]);
  });

  it("computes potential conversion and active decision counts separately", () => {
    const summary = computeEventAttendanceSummary([
      { id: "p1", kind: "POTENTIAL", status: "INVITED", attendanceMarked: false },
      { id: "p2", kind: "POTENTIAL", status: "ATTENDED", attendanceMarked: false },
      { id: "p3", kind: "POTENTIAL", status: "UNKNOWN", attendanceMarked: false },
      { id: "a1", kind: "ACTIVE", status: "INVITED", attendanceMarked: false },
      {
        id: "a2",
        kind: "ACTIVE",
        status: "ATTENDED",
        attendanceMarked: true,
        activeDecision: "INVITED_ATTENDED",
      },
      {
        id: "a3",
        kind: "ACTIVE",
        status: "REFUSED",
        attendanceMarked: false,
        activeDecision: "INVITED_REFUSED",
      },
      {
        id: "a4",
        kind: "ACTIVE",
        status: "REFUSED",
        attendanceMarked: false,
        activeDecision: "DECLINED_BY_US",
      },
    ]);

    expect(summary).toEqual({
      potential: {
        invited: 2,
        attended: 1,
        conversion: 0.5,
      },
      active: {
        matched: 4,
        pending: 1,
        invited: 2,
        attended: 1,
        invitedAttended: 1,
        invitedRefused: 1,
        declinedByUs: 1,
      },
    });
  });

  it("selects the latest past event for the main page spotlight", () => {
    const latest = getLatestPastEvent([
      { id: "old", startsAt: "2026-05-01T10:00:00.000Z", status: "PAST" },
      { id: "future", startsAt: "2026-06-01T10:00:00.000Z", status: "UPCOMING" },
      { id: "latest", startsAt: "2026-05-28T10:00:00.000Z", status: "PAST" },
      { id: "undated", startsAt: null, status: "PAST" },
    ]);

    expect(latest?.id).toBe("latest");
  });

  it("builds transcript report input from a format report prompt", () => {
    expect(
      buildTranscriptReportInput({
        eventTitle: "Гостевая встреча 28.05",
        formatName: "Гостевая встреча",
        promptReport: "Сформируй отчет по встрече",
        transcript: "Участники обсудили партнерства и следующие шаги.",
      })
    ).toEqual({
      eventTitle: "Гостевая встреча 28.05",
      formatName: "Гостевая встреча",
      prompt: "Сформируй отчет по встрече",
      transcript: "Участники обсудили партнерства и следующие шаги.",
    });
  });
});
