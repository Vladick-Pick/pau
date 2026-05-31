import { describe, expect, it } from "vitest";

import {
  selectEventInScope,
  selectParticipantById,
} from "../src/lib/pau/participant-selection";

describe("PAU participant selection", () => {
  const participants = [
    { id: "participant-1", fullName: "Андрей Пимашков" },
    { id: "participant-2", fullName: "Игорь Попов" },
  ];

  it("selects the first participant before the user clicks a row", () => {
    expect(selectParticipantById(participants, null)).toEqual(participants[0]);
  });

  it("returns the clicked participant by id", () => {
    expect(selectParticipantById(participants, "participant-2")).toEqual({
      id: "participant-2",
      fullName: "Игорь Попов",
    });
  });

  it("falls back to the first participant when a stale id is outside the event", () => {
    expect(selectParticipantById(participants, "stale-participant")).toEqual(
      participants[0]
    );
  });

  it("keeps history selection scoped to visible past events", () => {
    const pastEvents = [
      { id: "past-1", title: "Прошедшая встреча" },
      { id: "past-2", title: "Другая прошедшая встреча" },
    ];

    expect(selectEventInScope(pastEvents, "upcoming-1")).toEqual(pastEvents[0]);
    expect(selectEventInScope(pastEvents, "past-2")).toEqual(pastEvents[1]);
  });
});
